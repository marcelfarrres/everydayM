'use client';

import { AnimatePresence, motion } from 'motion/react';

/**
 * The blue frame of every rest, drawn round the video: the whole screen on a phone, the 9:16
 * picture on a computer. It lives in the video's box, above the picture and below the widget.
 */
export function RestFrame({ show, reduced }: { show: boolean; reduced: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="rest-frame"
          aria-hidden="true"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.4 }}
          className="pointer-events-none absolute inset-0 z-20 shadow-[inset_0_0_0_6px_#2f6bff]"
        />
      )}
    </AnimatePresence>
  );
}
