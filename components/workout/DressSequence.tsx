'use client';

import { useEffect, useState } from 'react';
import { PortholePerson, type Outfit } from '@/components/workout/PortholePerson';
import { DRESS } from '@/components/workout/assembly';

/*
 * The last change of clothes, in the big porthole of the creator's ending (phone): he stands there
 * in `from`, walks out through the door, comes back fully in sports kit and does «vamos». It lasts
 * DRESS.sequenceMs from `startAt` (performance time); the porthole around it (and the rocket's
 * lift-off) is timed on that one constant.
 *
 * LATER: this will be ONE real video of exactly that sequence. Swap this component's inside for
 * the clip (started at `startAt`, `reduced`: its last frame) and set DRESS.sequenceMs to its length.
 */
export function DressSequence({ from, startAt, reduced }: { from: Outfit; startAt: number; reduced: boolean }) {
  const [outfit, setOutfit] = useState<Outfit>(reduced ? 3 : from);
  useEffect(() => {
    if (reduced) return;
    const t = setTimeout(() => setOutfit(3), Math.max(0, startAt + DRESS.changeAt - performance.now()));
    return () => clearTimeout(t);
  }, [startAt, reduced]);
  return <PortholePerson outfit={outfit} transition={reduced ? 'cut' : 'walk'} />;
}
