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
    <main className="min-h-screen bg-[#080b09] bg-neon-grid text-white flex items-center justify-center p-5 font-sans">
      <StudioLoginForm />
    </main>
  );
}
