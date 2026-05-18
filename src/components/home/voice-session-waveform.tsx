"use client";

import { motion, useReducedMotion } from "framer-motion";

export function VoiceSessionWaveform({ active }: { active: boolean }) {
  const reduce = useReducedMotion();
  const bars = 40;

  return (
    <div className="flex h-16 items-end justify-center gap-[3px] px-6 pt-2">
      {Array.from({ length: bars }).map((_, i) => (
        <motion.span
          key={i}
          className="block h-11 w-[3px] origin-bottom rounded-full bg-gradient-to-t from-[#7c3aed] via-[#8b5cf6] to-[#a78bfa] opacity-90"
          animate={
            reduce
              ? { scaleY: active ? 0.65 : 0.35 }
              : active
                ? {
                    scaleY: [0.35, 1.05 + (i % 6) * 0.06, 0.45, 0.95],
                  }
                : { scaleY: 0.28 }
          }
          transition={
            reduce
              ? { duration: 0.25 }
              : {
                  duration: 1.05 + (i % 9) * 0.05,
                  repeat: active ? Infinity : 0,
                  repeatType: "mirror",
                  ease: [0.22, 1, 0.36, 1],
                }
          }
        />
      ))}
    </div>
  );
}
