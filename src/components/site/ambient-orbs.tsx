"use client";

import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/** Very subtle floating glow — keeps motion idle when prefers-reduced-motion. */
export function AmbientOrbs({ className }: { className?: string }) {
  const reduce = useReducedMotion();

  return (
    <div className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}>
      <motion.div
        aria-hidden
        className="absolute -left-[18%] top-[6%] h-[min(380px,52vw)] w-[min(380px,52vw)] rounded-full bg-[#c4b5fd]/30 blur-[100px]"
        animate={
          reduce
            ? undefined
            : {
                x: [0, 32, -12, 0],
                y: [0, -20, 14, 0],
                opacity: [0.11, 0.17, 0.13, 0.11],
              }
        }
        transition={{ duration: 44, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        aria-hidden
        className="absolute -right-[14%] bottom-[12%] h-[min(300px,46vw)] w-[min(300px,46vw)] rounded-full bg-[#a78bfa]/35 blur-[92px]"
        animate={
          reduce
            ? undefined
            : {
                x: [0, -26, 18, 0],
                y: [0, 28, -16, 0],
                opacity: [0.09, 0.15, 0.11, 0.09],
              }
        }
        transition={{ duration: 52, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      <motion.div
        aria-hidden
        className="absolute left-[38%] top-[52%] h-[min(220px,34vw)] w-[min(220px,34vw)] rounded-full bg-[#7c3aed]/25 blur-[118px]"
        animate={
          reduce
            ? undefined
            : {
                x: [0, -18, 22, 0],
                y: [0, 22, -24, 0],
                opacity: [0.06, 0.11, 0.08, 0.06],
              }
        }
        transition={{ duration: 36, repeat: Infinity, ease: "easeInOut", delay: 6 }}
      />
    </div>
  );
}
