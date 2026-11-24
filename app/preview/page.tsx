import Link from 'next/link';
import { notFound } from 'next/navigation';

// Development only: the app at phone and computer size, side by side.
// Each frame is a real browser window of that size, so the layout and breakpoints are the real ones.
export default function PreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();

  return (
    <main className="min-h-dvh bg-[#d9d9d6] px-6 py-6 font-[family-name:var(--font-display)] text-ink">
      <p className="mb-5 text-[15px] font-semibold text-ink/60">
        Vista previa · cada marco funciona por separado. La versión anterior está en la rama <code>version-1</code>.
        {' '}El reproductor con ejercicios de prueba está en{' '}
        <Link href="/preview/player" className="underline underline-offset-2">
          /preview/player
        </Link>
        .
      </p>

      <div className="flex flex-wrap items-start gap-8">
          <section>
            <h2 className="mb-2 text-lg font-semibold">Móvil · 390 × 844</h2>
            <div className="h-[633px] w-[293px] overflow-hidden rounded-[36px] bg-black shadow-[0_30px_60px_-30px_rgba(0,0,0,0.5)] ring-[6px] ring-black">
              <iframe src="/" title="App en móvil" className="h-[844px] w-[390px] origin-top-left scale-75 border-0" />
            </div>
          </section>
          <section>
            <h2 className="mb-2 text-lg font-semibold">Ordenador · 1440 × 900</h2>
            <div className="h-[594px] w-[950px] overflow-hidden rounded-2xl bg-paper shadow-[0_30px_60px_-30px_rgba(0,0,0,0.5)] ring-1 ring-black/10">
              <iframe src="/" title="App en ordenador" className="h-[900px] w-[1440px] origin-top-left scale-[0.66] border-0" />
            </div>
          </section>
      </div>
    </main>
  );
}
