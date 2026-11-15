import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getStudioAccess } from '@/lib/server/studioGate';
import { StudioLoginForm } from './StudioLoginForm';

export const dynamic = 'force-dynamic';

export default async function StudioLoginPage() {
  const access = getStudioAccess(await headers(), await cookies());

  if (access === 'denied') notFound();
  if (access === 'local' || access === 'lan') redirect('/admin');

  return (
    <main className="flex min-h-dvh items-center justify-center bg-paper p-5 font-[family-name:var(--font-display)] text-ink">
      <StudioLoginForm />
    </main>
  );
}
