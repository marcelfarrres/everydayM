import 'server-only';
import {
  createLiteVideo,
  createPosterImage,
  transcodeAudioTrack,
  transcodeVideoForStudio,
  type DerivedFile,
} from '@/lib/server/ffmpeg';
import {
  MEDIA_PATHS,
  deleteObjects,
  newObjectBaseName,
  putObject,
} from '@/lib/server/mediaStore';

/*
 * From an uploaded file to stored media. Each video clip becomes three files:
 *  - original: 1080 px wide (used by exports),
 *  - lite:     720 px wide, what the app plays,
 *  - poster:   WebP still from the middle, what lists show.
 * Exercise clips are silent (except type 'intro'); talks keep their voice, normalised to
 * about -16 LUFS. If any upload fails, the files already stored are removed again.
 */

export type ClipKind = 'exercise' | 'talk';

export interface CompressedInfo {
  compressedSize: number;
  durationSeconds: number;
  isHdr: boolean;
  crfUsed: number;
}

export interface StoredClip extends CompressedInfo {
  videoUrl: string;
  liteUrl: string;
  posterUrl: string;
}

const PATHS_BY_KIND = {
  exercise: {
    video: MEDIA_PATHS.exerciseVideo,
    lite: MEDIA_PATHS.exerciseLite,
    poster: MEDIA_PATHS.exercisePoster,
  },
  talk: {
    video: MEDIA_PATHS.talkVideo,
    lite: MEDIA_PATHS.talkLite,
    poster: MEDIA_PATHS.talkPoster,
  },
} as const;

export async function storeVideoClip(params: {
  inputPath: string;
  kind: ClipKind;
  keepAudio: boolean;
  /** Called once the original is compressed, before the uploads start. */
  onCompressed?: (info: CompressedInfo) => void;
}): Promise<StoredClip> {
  const original = await transcodeVideoForStudio({
    inputPath: params.inputPath,
    keepAudio: params.keepAudio,
    normalizeLoudness: params.kind === 'talk',
  });

  const temps: DerivedFile[] = [];
  const uploaded: string[] = [];

  try {
    const info: CompressedInfo = {
      compressedSize: original.sizeBytes,
      durationSeconds: original.durationSeconds,
      isHdr: original.isHdr,
      crfUsed: original.crfUsed,
    };

    const lite = await createLiteVideo({
      sourcePath: original.outputPath,
      keepAudio: params.keepAudio,
    });
    temps.push(lite);
    const poster = await createPosterImage({
      sourcePath: lite.outputPath,
      durationSeconds: original.durationSeconds,
    });
    temps.push(poster);

    params.onCompressed?.(info);

    const base = newObjectBaseName();
    const paths = PATHS_BY_KIND[params.kind];

    const videoUrl = await putObject(paths.video(base), original.outputPath, 'video/mp4');
    uploaded.push(videoUrl);
    const liteUrl = await putObject(paths.lite(base), lite.outputPath, 'video/mp4');
    uploaded.push(liteUrl);
    const posterUrl = await putObject(paths.poster(base), poster.outputPath, 'image/webp');
    uploaded.push(posterUrl);

    return { ...info, videoUrl, liteUrl, posterUrl };
  } catch (err) {
    await deleteObjects(uploaded);
    throw err;
  } finally {
    await original.cleanup().catch(() => {});
    await Promise.all(temps.map((t) => t.cleanup().catch(() => {})));
  }
}

export interface StoredTrack {
  audioUrl: string;
  durationSeconds: number;
  sizeBytes: number;
}

export async function storeMusicTrack(inputPath: string): Promise<StoredTrack> {
  const track = await transcodeAudioTrack(inputPath);
  try {
    const audioUrl = await putObject(
      MEDIA_PATHS.musicTrack(newObjectBaseName()),
      track.outputPath,
      'audio/mp4',
    );
    return { audioUrl, durationSeconds: track.durationSeconds, sizeBytes: track.sizeBytes };
  } finally {
    await track.cleanup().catch(() => {});
  }
}
