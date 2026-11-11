import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { isStudioRequestAllowed } from '@/lib/server/studioGate';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const reqHeaders = await headers();
  if (!isStudioRequestAllowed(reqHeaders)) {
    notFound();
  }

  return <>{children}</>;
}
