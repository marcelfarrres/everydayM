'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export function StudioLoginForm() {
  const router = useRouter();
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pin.trim()) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/admin/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pin.trim() }),
      });
      if (res.ok) {
        router.replace('/admin');
        router.refresh();
        return;
      }
      const data: unknown = await res.json().catch(() => null);
      const message =
        data && typeof data === 'object' && 'error' in data && typeof data.error === 'string'
          ? data.error
          : 'No se pudo iniciar sesión';
      setError(message);
      setPin('');
    } catch {
      setError('Sin conexión con el PC. ¿Está EverydayM Studio abierto?');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-5">
      <div>
        <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">EverydayM</p>
        <h1 className="mt-1 text-4xl font-semibold tracking-[-0.03em]">Estudio</h1>
        <p className="mt-2 text-[16px] leading-snug text-ink/60">Escribe el PIN del Estudio para entrar.</p>
      </div>

      <label className="block">
        <span className="sr-only">PIN</span>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="current-password"
          autoFocus
          placeholder="PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          maxLength={64}
          className="h-16 w-full rounded-2xl bg-white px-5 text-center text-2xl font-semibold tracking-[0.3em] shadow-[0_16px_34px_-26px_rgba(0,0,0,0.5)] placeholder:tracking-normal placeholder:text-ink/30 focus:outline-2 focus:outline-ink"
        />
      </label>

      {error && (
        <p role="alert" className="rounded-2xl bg-heat/10 px-4 py-3 text-[15px] font-medium text-heat">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !pin.trim()}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-ink text-lg font-semibold text-white transition-transform active:scale-[0.98] disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
      >
        {loading && <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />}
        Entrar
      </button>
    </form>
  );
}
