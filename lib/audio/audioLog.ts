/*
 * The player's audio log, for the debug overlay (`?audiodebug=1` in the page's URL). Without
 * that parameter nothing is recorded: logAudio() returns at once.
 */

export interface AudioLogEntry {
  at: number; // Date.now()
  text: string;
}

/** Entries the overlay keeps (the newest last). */
export const AUDIO_LOG_SIZE = 8;

/** Whether a page's query string asks for the audio debug overlay. */
export function audioDebugRequested(search: string): boolean {
  return new URLSearchParams(search).get('audiodebug') === '1';
}

/** Adds an entry, keeping only the last `size`. */
export function pushLogEntry(entries: readonly AudioLogEntry[], entry: AudioLogEntry, size = AUDIO_LOG_SIZE): AudioLogEntry[] {
  const next = [...entries, entry];
  return next.length > size ? next.slice(next.length - size) : next;
}

/** "12:03:07.250": the entry's local time, to the millisecond. */
export function formatLogTime(at: number): string {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
}

let enabled: boolean | null = null;
let entries: AudioLogEntry[] = [];
const listeners = new Set<() => void>();

/** The page was opened with `?audiodebug=1` (false on the server). */
export function isAudioDebug(): boolean {
  if (enabled !== null) return enabled;
  if (typeof window === 'undefined') return false;
  enabled = audioDebugRequested(window.location.search);
  return enabled;
}

export function logAudio(text: string) {
  if (!isAudioDebug()) return;
  entries = pushLogEntry(entries, { at: Date.now(), text });
  listeners.forEach((listener) => listener());
}

export function getAudioLog(): readonly AudioLogEntry[] {
  return entries;
}

export function subscribeAudioLog(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
