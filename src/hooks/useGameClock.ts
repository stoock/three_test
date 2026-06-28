"use client";

import { useEffect, useRef } from "react";
import { useGameStore } from "@/store/gameStore";
import { BASE_YEARS_PER_SECOND } from "@/lib/simulation";

/**
 * Drives the simulation with requestAnimationFrame. Each real second advances
 * `speed * BASE_YEARS_PER_SECOND` game years, so speed 1000 runs 1000× faster.
 * Paused (speed 0) simply stops advancing time.
 */
export function useGameClock() {
  const tick = useGameStore((s) => s.tick);
  const lastRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const loop = (now: number) => {
      const prev = lastRef.current ?? now;
      lastRef.current = now;
      // Clamp real delta so a backgrounded tab doesn't fast-forward wildly.
      const dtReal = Math.min((now - prev) / 1000, 0.1);

      const { speed, character } = useGameStore.getState();
      if (character && speed > 0 && dtReal > 0) {
        tick(dtReal * speed * BASE_YEARS_PER_SECOND, dtReal);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      lastRef.current = null;
    };
  }, [tick]);
}
