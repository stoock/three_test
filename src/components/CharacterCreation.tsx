"use client";

import { useState } from "react";
import { DISPOSITIONS } from "@/lib/dispositions";
import { attrLabel } from "@/lib/events";
import type { AttributeKey, DispositionId } from "@/lib/types";
import { useGameStore } from "@/store/gameStore";

export default function CharacterCreation() {
  const createNew = useGameStore((s) => s.createNew);
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<DispositionId>("explorer");

  const begin = () => createNew(name, selected);

  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-black tracking-tight">불멸의 연대기</h1>
        <p className="mt-2 text-sm text-black/60 dark:text-white/60">
          고대 농경 시대에 태어나 끝없는 미래까지 — 한 불멸자의 성장을 관전하세요.
        </p>
      </header>

      <section className="mb-6">
        <label className="mb-2 block text-sm font-semibold">캐릭터 이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="이름을 입력하세요"
          maxLength={20}
          className="w-full rounded-lg border border-black/15 bg-white/70 px-4 py-3 text-base outline-none focus:border-black/40 dark:border-white/15 dark:bg-white/5"
        />
      </section>

      <section className="mb-8">
        <label className="mb-3 block text-sm font-semibold">성향 선택</label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {DISPOSITIONS.map((d) => {
            const active = d.id === selected;
            return (
              <button
                key={d.id}
                onClick={() => setSelected(d.id)}
                className={`rounded-xl border p-4 text-left transition ${
                  active
                    ? "border-amber-500 bg-amber-50 ring-2 ring-amber-400 dark:bg-amber-500/10"
                    : "border-black/10 hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{d.emoji}</span>
                  <span className="font-bold">{d.name}</span>
                  <span className="text-xs text-black/40 dark:text-white/40">{d.englishName}</span>
                </div>
                <p className="mt-2 text-xs leading-relaxed text-black/60 dark:text-white/60">
                  {d.description}
                </p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {(Object.entries(d.growth) as [AttributeKey, number][])
                    .sort((a, b) => b[1] - a[1])
                    .map(([k, v]) => (
                      <span
                        key={k}
                        className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium dark:bg-white/10"
                      >
                        {attrLabel(k)} +{v.toFixed(1)}
                      </span>
                    ))}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      <button
        onClick={begin}
        className="w-full rounded-xl bg-amber-500 py-4 text-lg font-bold text-white shadow-lg transition hover:bg-amber-600 active:scale-[0.99]"
      >
        여정 시작 ✨
      </button>
    </div>
  );
}
