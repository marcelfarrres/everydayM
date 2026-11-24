import { notFound } from 'next/navigation';
import { PlayerFixture } from './PlayerFixture';

// Development only: the real player with fixture exercises, to see every state without the database.
export default function PlayerPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <PlayerFixture />;
}
