import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getStudioAccess, getStudioConfigProblem } from '@/lib/server/studioGate';
import { StudioLoginForm } from './StudioLoginForm';

export const dynamic = 'force-dynamic';

export default async function StudioLoginPage() {
  const access = getStudioAccess(await headers(), await cookies());

  if (access === 'denied') notFound();
  if (access === 'granted') redirect('/admin');

  const problem = access === 'misconfigured' ? getStudioConfigProblem() : null;

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper p-5 font-[family-name:var(--font-display)] text-ink">
      {problem ? (
        <div className="flex w-full max-w-sm flex-col gap-5">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-ink/50">Be a Rocket</p>
            <h1 className="mt-1 text-4xl font-semibold tracking-[-0.03em]">Estudio</h1>
          </div>
          <p role="alert" className="rounded-2xl bg-heat/10 px-4 py-3 text-[15px] font-medium text-heat">
            {problem}
          </p>
        </div>
      ) : (
        <StudioLoginForm />
      )}
    </main>
  );
}
