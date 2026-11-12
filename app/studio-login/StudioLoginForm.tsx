'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, Loader2, Smartphone } from 'lucide-react';

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
    <form
      onSubmit={handleSubmit}
      className="w-full max-w-sm glass-panel bg-[#101411]/95 border border-[#22c55e]/30 rounded-[28px] p-7 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop-blur-2xl space-y-5"
    >
      <div className="flex items-center gap-3">
        <div className="w-11 h-11 rounded-2xl bg-[#1b251d] border border-[#22c55e]/30 flex items-center justify-center">
          <Smartphone className="w-5 h-5 text-[#4ade80]" />
        </div>
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.25em] text-[#4ade80]">
            EverydayM Studio
          </p>
          <h1 className="text-2xl font-black uppercase italic tracking-tight">Acceso móvil</h1>
        </div>
      </div>

      <p className="text-sm text-neutral-300 leading-relaxed">
        Estás conectado a tu PC por la WiFi de casa. Introduce el PIN del Studio para subir vídeos.
      </p>

      <label className="block">
        <span className="block text-[11px] font-black text-neutral-400 mb-2 uppercase tracking-[0.15em]">
          PIN
        </span>
        <div className="relative">
          <KeyRound className="w-4 h-4 text-[#4ade80] absolute left-4 top-1/2 -translate-y-1/2" />
          <input
            type="password"
            inputMode="numeric"
            autoComplete="current-password"
            autoFocus
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            maxLength={64}
            className="w-full bg-[#080b09] border border-[#22c55e]/25 rounded-2xl pl-11 pr-4 py-4 text-lg font-bold tracking-[0.3em] focus:outline-none focus:border-[#4ade80] transition-colors"
          />
        </div>
      </label>

      {error && (
        <p role="alert" className="text-sm font-bold text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading || !pin.trim()}
        className="w-full bg-[#22c55e] hover:bg-[#4ade80] text-black font-black uppercase tracking-wider py-4 rounded-2xl transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
      >
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <KeyRound className="w-5 h-5" />}
        Entrar
      </button>
    </form>
  );
}
