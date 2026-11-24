'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { FOCUS } from '@/components/studio/StudioUi';

/**
 * The Studio's sheet: a native <dialog> (focus trap, Esc, back gesture) with a header,
 * scrolling content and a sticky footer. On a phone it fills almost the whole screen.
 */
export function StudioDialog({
  open,
  onClose,
  label,
  header,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  header: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-label={label}
      className="m-auto max-h-[94dvh] w-[min(96vw,44rem)] overflow-y-auto rounded-[32px] bg-paper p-0 font-[family-name:var(--font-display)] text-ink shadow-[0_40px_80px_-30px_rgba(0,0,0,0.5)] backdrop:bg-black/50"
    >
      {open && (
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">{header}</div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink/8 hover:bg-ink/15 ${FOCUS}`}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>
          {children}
          {footer && (
            <div className="sticky bottom-0 -mx-5 -mb-5 flex items-center justify-between gap-3 bg-paper p-5 sm:-mx-6 sm:-mb-6 sm:px-6">
              {footer}
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
