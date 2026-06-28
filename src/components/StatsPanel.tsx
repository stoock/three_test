"use client";

import { useGameStore } from "@/store/gameStore";
import { getDisposition } from "@/lib/dispositions";
import { getEra, eraProgress } from "@/lib/eras";
import { attrLabel } from "@/lib/events";
import type { AttributeKey } from "@/lib/types";

const ATTR_ORDER: AttributeKey[] = [
  "knowledge",
  "creativity",
  "strength",
  "charisma",
  "spirit",
  "wealth",
];

const ATTR_COLOR: Record<AttributeKey, string> = {
  knowledge: "#3b82f6",
  creativity: "#a855f7",
  strength: "#ef4444",
  charisma: "#f59e0b",
  spirit: "#14b8a6",
  wealth: "#eab308",
};

function formatYears(age: number): string {
  if (age < 1000) return `${Math.floor(age)}세`;
  if (age < 1_000_000) return `${(age / 1000).toFixed(1)}천세`;
  return `${(age / 1_000_000).toFixed(2)}백만세`;
}

export default function StatsPanel() {
  const character = useGameStore((s) => s.character);
  if (!character) return null;

  const disp = getDisposition(character.disposition);
  const era = getEra(character.techLevel);
  const progress = eraProgress(character.techLevel);
  const maxAttr = Math.max(20, ...ATTR_ORDER.map((k) => character.attributes[k]));

  return (
    <div className="rounded-xl border border-black/10 bg-white/60 p-4 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center gap-3">
        <span className="text-3xl">{disp.emoji}</span>
        <div>
          <div className="text-lg font-bold leading-tight">{character.name}</div>
          <div className="text-xs text-black/50 dark:text-white/50">
            {disp.name} · {formatYears(character.age)}
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-center text-xs">
        <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
          <div className="font-bold">{era.name}</div>
          <div className="text-black/50 dark:text-white/50">현재 시대</div>
        </div>
        <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
          <div className="font-bold">
            {character.territory}×{character.territory} 칸
          </div>
          <div className="text-black/50 dark:text-white/50">영토</div>
        </div>
        <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
          <div className="font-bold">{character.choicesMade}회</div>
          <div className="text-black/50 dark:text-white/50">전략적 선택</div>
        </div>
        <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
          <div className="font-bold">
            {character.chaos > 0.6 ? "🔆 호황" : character.chaos > 0.4 ? "⚖️ 평탄" : "🌧️ 침체"}
          </div>
          <div className="text-black/50 dark:text-white/50">
            운명 변동 {Math.round(character.chaos * 100)}
          </div>
        </div>
      </div>

      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-black/50 dark:text-white/50">
          <span>다음 시대까지</span>
          <span>{Math.floor(progress * 100)}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
          <div
            className="h-full"
            style={{ width: `${progress * 100}%`, background: era.palette.accent }}
          />
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {ATTR_ORDER.map((k) => (
          <div key={k}>
            <div className="mb-0.5 flex justify-between text-[11px]">
              <span className="font-medium">{attrLabel(k)}</span>
              <span className="text-black/50 dark:text-white/50">
                {Math.floor(character.attributes[k])}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div
                className="h-full transition-all"
                style={{
                  width: `${(character.attributes[k] / maxAttr) * 100}%`,
                  background: ATTR_COLOR[k],
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
