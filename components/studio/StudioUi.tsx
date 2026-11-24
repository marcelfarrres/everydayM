import { AlertCircle, CheckCircle2, Film, X } from 'lucide-react';

export const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink';

export type BannerMessage = { kind: 'success' | 'error'; text: string };

export function Banner({ message, onClose }: { message: BannerMessage; onClose: () => void }) {
  return (
    <div
      role={message.kind === 'error' ? 'alert' : 'status'}
      className={`flex items-start justify-between gap-3 rounded-2xl p-4 text-[15px] font-medium ${
        message.kind === 'error' ? 'bg-heat/10 text-heat' : 'bg-white text-ink'
      }`}
    >
      <span className="flex items-start gap-2.5">
        {message.kind === 'error' ? (
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
        ) : (
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-ink/60" aria-hidden="true" />
        )}
        {message.text}
      </span>
      <button type="button" onClick={onClose} aria-label="Cerrar mensaje" className={`shrink-0 rounded-full p-1 opacity-60 hover:opacity-100 ${FOCUS}`}>
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * A poster still (small WebP from the media store) or a neutral line placeholder.
 * Never a <video>: lists must not download any video.
 */
export function Poster({ src, className = '' }: { src: string | null | undefined; className?: string }) {
  if (!src) {
    return (
      <span aria-hidden="true" className={`flex items-center justify-center bg-ink/6 text-ink/25 ${className}`}>
        <Film className="h-1/4 max-h-8 w-1/4 max-w-8" strokeWidth={1.25} />
      </span>
    );
  }
  return (
    // Plain <img>: posters are already ~30 KB WebP on the CDN; the image optimizer would only
    // add a round trip through this computer.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" loading="lazy" decoding="async" className={`bg-ink/6 object-cover ${className}`} />
  );
}

export const fieldClass = 'h-12 w-full rounded-2xl bg-white px-4 text-[16px] font-medium focus:outline-2 focus:outline-ink';

export function TextField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: 'text' | 'url';
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold text-ink/60">{label}</span>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={fieldClass} />
    </label>
  );
}
