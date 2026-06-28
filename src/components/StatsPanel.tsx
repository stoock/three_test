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

  const civ =
    character.attributes.knowledge +
    character.attributes.creativity +
    character.attributes.wealth +
    character.attributes.charisma;
  const pop = Math.floor(civ * Math.pow(character.territory / 7, 1.6) * (1 + era.index * 0.4)) * 12;
  const popStr =
    pop >= 1_000_000 ? `${(pop / 1_000_000).toFixed(1)}M` : pop >= 1000 ? `${(pop / 1000).toFixed(0)}K` : `${pop}`;

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
          <div className="font-bold">{popStr}</div>
          <div className="text-black/50 dark:text-white/50">인구</div>
        </div>
        <div className="rounded-lg bg-black/5 p-2 dark:bg-white/10">
          <div className="font-bold">🏛️ {character.wonders.length}</div>
          <div className="text-black/50 dark:text-white/50">불가사의</div>
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

      {/* chaotic fortune gauge — visualises the logistic-map state driving divergence */}
      <div className="mt-3">
        <div className="mb-1 flex justify-between text-[11px] text-black/50 dark:text-white/50">
          <span>운명의 흐름 (카오스)</span>
          <span>{character.chaos > 0.6 ? "격동·호황" : character.chaos > 0.4 ? "평온" : "침체"}</span>
        </div>
        <div className="relative h-2 overflow-hidden rounded-full bg-gradient-to-r from-slate-500 via-amber-300 to-emerald-400">
          <div
            className="absolute top-1/2 h-3 w-1.5 -translate-y-1/2 rounded-full bg-black shadow ring-2 ring-white dark:bg-white dark:ring-black"
            style={{ left: `calc(${character.chaos * 100}% - 3px)` }}
          />
        </div>
      </div>

      {character.rivals.length > 0 && (
        <div className="mt-3 rounded-lg bg-black/5 p-2 text-[11px] dark:bg-white/10">
          <div className="mb-1 font-semibold text-black/60 dark:text-white/60">인연</div>
          <div className="flex flex-wrap gap-1.5">
            {character.rivals.map((r) => (
              <span
                key={r.name}
                className={`rounded-full px-2 py-0.5 ${
                  r.affinity >= 50
                    ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                    : r.affinity <= -50
                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300"
                      : "bg-black/5 dark:bg-white/10"
                }`}
                title={`호감도 ${r.affinity}`}
              >
                {r.affinity >= 50 ? "🤝" : r.affinity <= -50 ? "⚔️" : "·"} {r.name}
              </span>
            ))}
          </div>
        </div>
      )}

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
