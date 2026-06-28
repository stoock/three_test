"use client";

import { useState } from "react";
import { useGameStore } from "@/store/gameStore";
import type { LogEntry, LogType } from "@/lib/types";

const TYPE_BADGE: Record<LogType, { label: string; cls: string }> = {
  birth: { label: "탄생", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" },
  era: { label: "시대", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-300" },
  choice: { label: "선택", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300" },
  milestone: { label: "시련", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300" },
  expand: { label: "확장", cls: "bg-teal-500/15 text-teal-700 dark:text-teal-300" },
};

function formatYear(y: number): string {
  if (y < 1000) return `${y}세`;
  if (y < 1_000_000) return `${(y / 1000).toFixed(1)}천세`;
  return `${(y / 1_000_000).toFixed(2)}백만세`;
}

export default function EventLog() {
  const log = useGameStore((s) => s.log);
  const [open, setOpen] = useState<LogEntry | null>(null);

  const entries = [...log].reverse();

  return (
    <div className="rounded-xl border border-black/10 bg-white/60 dark:border-white/10 dark:bg-white/5">
      <div className="border-b border-black/10 px-4 py-3 dark:border-white/10">
        <h2 className="text-sm font-bold">연대기 기록 📜</h2>
        <p className="text-[11px] text-black/50 dark:text-white/50">
          모든 중요한 순간이 사진과 함께 기록됩니다
        </p>
      </div>

      <div className="max-h-[420px] space-y-3 overflow-y-auto p-3">
        {entries.length === 0 && (
          <p className="py-8 text-center text-xs text-black/40 dark:text-white/40">
            아직 기록이 없습니다
          </p>
        )}
        {entries.map((e) => {
          const badge = TYPE_BADGE[e.type];
          return (
            <button
              key={e.id}
              onClick={() => setOpen(e)}
              className="flex w-full gap-3 rounded-lg p-2 text-left transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={e.snapshot}
                alt={e.title}
                className="h-14 w-[88px] flex-shrink-0 rounded-md border border-black/10 object-cover dark:border-white/10"
              />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                    {badge.label}
                  </span>
                  <span className="text-[10px] text-black/40 dark:text-white/40">
                    {formatYear(e.gameYear)}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-sm font-semibold">{e.title}</div>
                <div className="line-clamp-2 text-[11px] text-black/55 dark:text-white/55">
                  {e.description}
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(null)}
        >
          <div
            className="max-w-md overflow-hidden rounded-2xl bg-white shadow-2xl dark:bg-neutral-900"
            onClick={(ev) => ev.stopPropagation()}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open.snapshot} alt={open.title} className="w-full" />
            <div className="p-4">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${TYPE_BADGE[open.type].cls}`}
                >
                  {TYPE_BADGE[open.type].label}
                </span>
                <span className="text-xs text-black/50 dark:text-white/50">
                  {open.eraName} · {formatYear(open.gameYear)}
                </span>
              </div>
              <h3 className="mt-2 text-lg font-bold">{open.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-black/70 dark:text-white/70">
                {open.description}
              </p>
              <button
                onClick={() => setOpen(null)}
                className="mt-4 w-full rounded-lg bg-black/5 py-2 text-sm font-medium hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
