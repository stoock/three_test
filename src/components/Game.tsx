"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "@/store/gameStore";
import { useGameClock } from "@/hooks/useGameClock";
import CharacterCreation from "./CharacterCreation";
import IsoScene from "./IsoScene";
import StatsPanel from "./StatsPanel";
import TimeControls from "./TimeControls";
import EventLog from "./EventLog";

export default function Game() {
  useGameClock();
  const [mounted, setMounted] = useState(false);
  const character = useGameStore((s) => s.character);
  const lastSavedAt = useGameStore((s) => s.lastSavedAt);
  const forceSave = useGameStore((s) => s.forceSave);
  const reset = useGameStore((s) => s.reset);
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch: nothing persisted is known until client mount.
  if (!mounted) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-black/40">
        불러오는 중…
      </div>
    );
  }

  if (!character) return <CharacterCreation />;

  const handleSave = () => {
    forceSave();
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 1500);
  };

  const handleNew = () => {
    if (confirm("새 캐릭터를 시작하면 현재 진행이 사라집니다. 계속할까요?")) {
      reset();
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-5">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-black tracking-tight">불멸의 연대기</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-emerald-600"
          >
            {savedFlash ? "저장됨 ✓" : "저장"}
          </button>
          <button
            onClick={handleNew}
            className="rounded-lg bg-black/5 px-3 py-1.5 text-sm font-medium transition hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/20"
          >
            새 캐릭터
          </button>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-black/10 bg-white/60 px-4 py-3 dark:border-white/10 dark:bg-white/5">
        <TimeControls />
        <span className="text-[11px] text-black/40 dark:text-white/40">
          {lastSavedAt
            ? `자동 저장 활성 · 마지막 저장 ${new Date(lastSavedAt).toLocaleTimeString()}`
            : "자동 저장 활성"}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <IsoScene />
          <StatsPanel />
        </div>
        <EventLog />
      </div>
    </div>
  );
}
