import Link from 'next/link';
import { notFound } from 'next/navigation';

// Development only: the app at phone and computer size side by side, plus design proposals.
// Each frame is a real browser window of that size, so the layout and breakpoints are the real ones.
export default async function PreviewPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  if (process.env.NODE_ENV === 'production') notFound();
  const { ver } = await searchParams;
  const designs = ver === 'disenos';

  const tab = (active: boolean) =>
    `rounded-full px-4 py-2 text-[15px] font-semibold ${active ? 'bg-ink text-white' : 'bg-white text-ink hover:bg-white/70'}`;

  return (
    <main className="min-h-dvh bg-[#d9d9d6] px-6 py-6 font-[family-name:var(--font-display)] text-ink">
      <nav className="mb-5 flex flex-wrap items-center gap-2">
        <Link href="/preview" className={tab(!designs)}>
          App · versión 1
        </Link>
        <Link href="/preview?ver=disenos" className={tab(designs)}>
          Diseños nuevos
        </Link>
        <span className="ml-2 text-[14px] text-ink/55">
          {designs ? 'Elige una opción y la aplico a toda la app.' : 'Cada marco funciona por separado.'}
        </span>
      </nav>

      {designs ? (
        <iframe src="/designs/opciones.html" title="Diseños propuestos" className="h-[calc(100dvh-7rem)] w-full rounded-2xl border-0 bg-[#d9d9d6]" />
      ) : (
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
      )}
    </main>
  );
}
