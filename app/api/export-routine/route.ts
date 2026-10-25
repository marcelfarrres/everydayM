import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import os from 'os';

const execPromise = promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const { videos } = await req.json();

    if (!videos || videos.length === 0) {
      return NextResponse.json({ error: 'No videos provided' }, { status: 400 });
    }

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'workout-export-'));
    const listFilePath = path.join(tmpDir, 'concat_list.txt');
    const outputFilePath = path.join(tmpDir, 'output.mp4');

    // 1. Descargar los clips temporalmente
    const downloadedPaths: string[] = [];
    for (let i = 0; i < videos.length; i++) {
      const vid = videos[i];
      const targetPath = path.join(tmpDir, `clip_${i}.mp4`);
      const response = await fetch(vid.url);
      const buffer = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(targetPath, buffer);
      downloadedPaths.push(targetPath);
    }

    // 2. Generar lista de concatenación
    const listContent = downloadedPaths.map((p) => `file '${p}'`).join('\n');
    fs.writeFileSync(listFilePath, listContent);

    // 3. Unir mediante FFmpeg
    await execPromise(`ffmpeg -y -f concat -safe 0 -i "${listFilePath}" -c copy "${outputFilePath}"`);

    const outputBuffer = fs.readFileSync(outputFilePath);

    // Limpieza de temporales
    fs.rmSync(tmpDir, { recursive: true, force: true });

    return new NextResponse(outputBuffer, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="workout_routine.mp4"',
      },
    });
  } catch (error: unknown) {
    console.error('FFmpeg export error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Error processing export';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
