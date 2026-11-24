import 'server-only';
import fs from 'node:fs/promises';
import { C, FONT, esc, frameName, full, png, pngSequence, text, wrap, L } from '@/lib/server/clips/draw';
import { COVER, W, H, join, renderPart } from '@/lib/server/clips/run';
import { headline, type Part } from '@/lib/server/clips/context';

/*
 * The usual opening: the sentence types itself on an iPhone keyboard, then Marcel turns up
 * ready for the gym and the headline lands on his clip.
 */

type Key = { x: number; y: number; w: number; label: string };
const KEY_H = 108;
const ROWS_Y = [1196, 1326, 1456, 1586];

function keyRow(chars: string[], y: number, widths?: number[]): Key[] {
  const ws = widths ?? chars.map(() => 94);
  const total = ws.reduce((a, b) => a + b, 0) + 12 * (ws.length - 1);
  let x = (W - total) / 2;
  return chars.map((label, i) => {
    const key = { x, y, w: ws[i], label };
    x += ws[i] + 12;
    return key;
  });
}

const LAYOUTS = {
  letters: [
    ...keyRow([...'qwertyuiop'], ROWS_Y[0]),
    ...keyRow([...'asdfghjklñ'], ROWS_Y[1]),
    ...keyRow(['⇧', ...'zxcvbnm', '⌫'], ROWS_Y[2], [130, 94, 94, 94, 94, 94, 94, 94, 130]),
    ...keyRow(['123', 'espacio', 'intro'], ROWS_Y[3], [150, 620, 250]),
  ],
  numbers: [
    ...keyRow([...'1234567890'], ROWS_Y[0]),
    ...keyRow([...'-/:;()€&@"'], ROWS_Y[1]),
    ...keyRow(['#+=', ...".,?!'", '⌫'], ROWS_Y[2], [130, 140, 140, 140, 140, 140, 130]),
    ...keyRow(['ABC', 'espacio', 'intro'], ROWS_Y[3], [150, 620, 250]),
  ],
};
const SPECIAL = new Set(['⇧', '⌫', '123', 'ABC', '#+=', 'intro']);

/** Which key a character comes from: "í" → i, "P" → p with shift, "3" → the numbers layout. */
function keyFor(ch: string): { layout: 'letters' | 'numbers'; label: string; shift: boolean } | null {
  if (ch === ' ') return { layout: 'letters', label: 'espacio', shift: false };
  const base = ch.normalize('NFD').replace(/[̀-ͯ]/g, '');
  const lower = ch === 'Ñ' ? 'ñ' : base.toLowerCase();
  if (LAYOUTS.letters.some((k) => k.label === lower)) return { layout: 'letters', label: lower, shift: ch !== ch.toLowerCase() };
  if (LAYOUTS.numbers.some((k) => k.label === base)) return { layout: 'numbers', label: base, shift: false };
  return null;
}

type KeyboardFrame = {
  typed: string;
  pressed: string | null; // the character being typed this frame
  caret: boolean;
  send: 'off' | 'ready' | 'pressed';
};

function keyboardFrame(o: KeyboardFrame): string {
  const press = o.pressed ? keyFor(o.pressed) : null;
  // iOS shows the layout of the key being used; after a digit it stays on numbers until a letter.
  const lastTyped = o.typed.slice(-1);
  const layout = press?.layout ?? (lastTyped && keyFor(lastTyped)?.layout === 'numbers' && lastTyped !== ' ' ? 'numbers' : 'letters');
  const upper = o.typed.length === 0 || (press?.shift ?? false);
  const lines = wrap(o.typed, 24, 2);
  const shown = lines.length ? lines : [''];
  const cardH = 150 + (shown.length - 1) * 74;

  const keys = LAYOUTS[layout]
    .map((k) => {
      const special = SPECIAL.has(k.label);
      const down = press && k.label === press.label && press.layout === layout;
      const shiftOn = k.label === '⇧' && (upper || press?.shift);
      const fill = down ? '#ffffff' : special && !shiftOn ? '#abb0ba' : '#ffffff';
      const label = layout === 'letters' && !special && k.label !== 'espacio' && upper ? k.label.toUpperCase() : k.label;
      const size = k.label.length > 2 ? 38 : 54;
      return `<rect x="${k.x}" y="${k.y + 3}" width="${k.w}" height="${KEY_H}" rx="14" fill="#898a8d"/>
        <rect x="${k.x}" y="${k.y}" width="${k.w}" height="${KEY_H}" rx="14" fill="${down && (special || k.label === 'espacio') ? '#d6d9de' : fill}"/>
        ${text(k.x + k.w / 2, k.y + KEY_H / 2 + size * 0.36, label, size, '#000', { weight: special ? 500 : 400, anchor: 'middle' })}`;
    })
    .join('');

  // The pressed letter pops up above its key, like on an iPhone, with the touch under it.
  let pop = '';
  let touch = '';
  if (press) {
    const k = LAYOUTS[layout].find((key) => key.label === press.label);
    if (k && press.label !== 'espacio') {
      const w = k.w + 50;
      const x = Math.max(8, Math.min(W - w - 8, k.x - 25));
      pop = `<rect x="${x}" y="${k.y - 150}" width="${w}" height="${150 + KEY_H}" rx="22" fill="#fff" filter="url(#sh)"/>
        ${text(x + w / 2, k.y - 40, o.pressed ?? '', 92, '#000', { weight: 400, anchor: 'middle' })}`;
    }
    if (k) touch = `<circle cx="${k.x + k.w / 2}" cy="${k.y + KEY_H / 2 + 10}" r="46" fill="#000" fill-opacity="0.12"/>`;
  }

  const sendOpacity = o.send === 'off' ? 0.25 : 1;
  const sendR = o.send === 'pressed' ? 52 : 60;
  const sendCy = 720 + cardH / 2;
  return full(
    `<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="6" stdDeviation="10" flood-opacity="0.25"/></filter></defs>
     <rect width="${W}" height="${H}" fill="${C.paper}"/>
     ${text(64, 330, 'Everyday M', 44, C.ink, { weight: 800 })}
     ${text(64, 520, '¿Qué entrenamos', 112, C.ink, { weight: 800 })}
     ${text(64, 642, 'hoy?', 112, C.ink, { weight: 800 })}
     <rect x="40" y="720" width="${W - 80}" height="${cardH}" rx="64" fill="#fff" filter="url(#sh)"/>
     ${
       o.typed
         ? shown
             .map(
               (l, i) =>
                 `<text x="100" y="${815 + i * 74}" font-family="${FONT}" font-size="58" font-weight="500" fill="${C.ink}">${esc(l)}${
                   i === shown.length - 1 && o.caret ? '<tspan fill="#0a84ff" font-weight="300">|</tspan>' : ''
                 }</text>`,
             )
             .join('')
         : `<text x="100" y="815" font-family="${FONT}" font-size="58" font-weight="500" fill="${C.ink}" fill-opacity="0.35">${
             o.caret ? '<tspan fill="#0a84ff" fill-opacity="1" font-weight="300">|</tspan>' : ''
           }Hombros, 20 minutos</text>`
     }
     <circle cx="${W - 120}" cy="${sendCy}" r="${sendR}" fill="${C.ink}" fill-opacity="${sendOpacity}"/>
     <path d="M${W - 120} ${sendCy + 26}V${sendCy - 24}M${W - 145} ${sendCy - 1}L${W - 120} ${sendCy - 26}L${W - 95} ${sendCy - 1}" stroke="#fff" stroke-width="10" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
     <rect y="1160" width="${W}" height="${H - 1160}" fill="#d1d4d9"/>
     ${keys}${touch}${pop}`,
  );
}

export function typingPart(): Part {
  return {
    name: 'typing',
    render: async (ctx, out) => {
      const phrase = ctx.prompt;
      // 20 frames a second: a beat of blinking caret, one character every 2 frames, then send.
      const frames: KeyboardFrame[] = [];
      for (let f = 0; f < 8; f++) frames.push({ typed: '', pressed: null, caret: f % 10 < 5, send: 'off' });
      for (let i = 0; i < phrase.length; i++) {
        frames.push({ typed: phrase.slice(0, i + 1), pressed: phrase[i], caret: true, send: 'ready' });
        frames.push({ typed: phrase.slice(0, i + 1), pressed: null, caret: true, send: 'ready' });
      }
      for (let f = 0; f < 6; f++) frames.push({ typed: phrase, pressed: null, caret: f % 10 < 5, send: 'ready' });
      for (let f = 0; f < 3; f++) frames.push({ typed: phrase, pressed: null, caret: false, send: 'pressed' });
      for (let f = 0; f < 3; f++) frames.push({ typed: phrase, pressed: null, caret: false, send: 'ready' });
      const seqDir = join(ctx.dir, 'typing');
      await fs.mkdir(seqDir);
      await pngSequence(frames.length, (i) => keyboardFrame(frames[i]), (i) => join(seqDir, frameName(i)));
      await renderPart({
        inputs: ['-framerate', '20', '-i', join(seqDir, '%04d.png')],
        graph: '[0:v]fps=30,setsar=1[out]',
        seconds: frames.length / 20,
        out,
        encoder: ctx.encoder,
      });
    },
  };
}

/** Marcel turns up ready for the gym (his clip), and the headline lands on it. */
export function marcelPart(seconds: number): Part {
  return {
    name: 'marcel',
    render: async (ctx, out) => {
      const title = wrap(headline(ctx), 14);
      const overlay = join(ctx.dir, 'marcel.png');
      await png(
        full(
          `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.78"/></linearGradient></defs>
           <rect x="0" y="500" width="${W}" height="${H - 500}" fill="url(#g)"/>
           ${title.map((l, i) => text(L, 1140 - (title.length - 1 - i) * 118, l, 112, '#fff', { weight: 800 })).join('')}
           ${text(L, 1230, ctx.handle, 36, '#fff', { weight: 700, opacity: 0.75 })}`,
        ),
        overlay,
      );
      await renderPart({
        inputs: ['-i', join(process.cwd(), 'public', 'marcel-ready.mp4'), '-loop', '1', '-i', overlay],
        graph: `[0:v]${COVER}[v];[1:v]format=rgba,fade=in:st=${Math.min(0.8, seconds - 1).toFixed(2)}:d=0.5:alpha=1[o];[v][o]overlay=0:0:shortest=1[out]`,
        seconds,
        out,
        encoder: ctx.encoder,
      });
    },
  };
}
