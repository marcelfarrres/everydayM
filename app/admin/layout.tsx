import { cookies, headers } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { getStudioAccess } from '@/lib/server/studioGate';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = getStudioAccess(await headers(), await cookies());

  if (access === 'denied') {
    notFound();
  }
  // No session (or the Studio is not configured): the PIN screen explains what to do.
  if (access !== 'granted') {
    redirect('/studio-login');
  }

  return <>{children}</>;
}
