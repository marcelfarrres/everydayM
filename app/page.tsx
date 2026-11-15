import { isStudioEnabledRuntime } from '@/lib/server/studioGate';
import { Home } from './Home';

// The Studio (uploading clips, TikTok videos) only exists where STUDIO_ENABLED=true: your own
// computer. The public web never sets it, so visitors only get the routine.
export default function Page() {
  return <Home studio={isStudioEnabledRuntime()} />;
}
