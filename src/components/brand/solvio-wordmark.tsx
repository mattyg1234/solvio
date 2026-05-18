"use client";

import { motion, useReducedMotion } from "framer-motion";

type SolvioWordmarkProps = {
  className?: string;
  /** Seconds before the reveal begins (stagger header vs footer). */
  delay?: number;
};

export function SolvioWordmark({ className, delay = 0.08 }: SolvioWordmarkProps) {
  const reduce = useReducedMotion();
  const hidden = "inset(-12% 100% -12% -8%)";
  const visible = "inset(-12% -8% -12% -8%)";

  return (
    <motion.span
      className={className}
      initial={{ clipPath: reduce ? visible : hidden }}
      animate={{ clipPath: visible }}
      transition={{
        duration: reduce ? 0 : 1.05,
        ease: [0.22, 1, 0.36, 1],
        delay: reduce ? 0 : delay,
      }}
      style={{ display: "inline-block", willChange: reduce ? undefined : "clip-path" }}
    >
      Solvio
    </motion.span>
  );
}
