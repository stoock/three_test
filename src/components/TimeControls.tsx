"use client";

import { useGameStore } from "@/store/gameStore";
import type { Speed } from "@/lib/types";

const SPEEDS: { value: Speed; label: string }[] = [
  { value: 0, label: "⏸ 멈춤" },
  { value: 1, label: "▶ 보통" },
  { value: 5, label: "5×" },
  { value: 25, label: "25×" },
  { value: 100, label: "100×" },
  { value: 1000, label: "1000×" },
];

export default function TimeControls() {
  const speed = useGameStore((s) => s.speed);
  const setSpeed = useGameStore((s) => s.setSpeed);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="mr-1 text-xs font-semibold text-black/50 dark:text-white/50">시간 흐름</span>
      {SPEEDS.map((s) => {
        const active = s.value === speed;
        return (
          <button
            key={s.value}
            onClick={() => setSpeed(s.value)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition ${
              active
                ? "bg-black text-white dark:bg-white dark:text-black"
                : "bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
            }`}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}
