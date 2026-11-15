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

  if (access === 'lan-login-required') {
    redirect('/studio-login');
  }
  if (access === 'denied') {
    notFound();
  }

  return <>{children}</>;
}
