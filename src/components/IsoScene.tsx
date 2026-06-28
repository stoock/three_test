"use client";

import { useMemo } from "react";
import { useGameStore } from "@/store/gameStore";
import { buildSceneInner } from "@/lib/scene";
import { getEra, eraProgress } from "@/lib/eras";

const W = 640;
const H = 420;

export default function IsoScene() {
  const character = useGameStore((s) => s.character);

  // Only rebuild the SVG when something visible changes (integer age / tech),
  // not on every sub-year frame.
  const ageInt = character ? Math.floor(character.age) : 0;
  const techInt = character ? Math.floor(character.techLevel) : 0;

  const { inner, era } = useMemo(() => {
    if (!character) return { inner: "", era: getEra(0) };
    return buildSceneInner(character, W, H, 7);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.name, ageInt, techInt]);

  if (!character) return null;
  const progress = eraProgress(character.techLevel);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-black/10 shadow-inner">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        style={{ background: era.palette.sky }}
      >
        <defs>
          <linearGradient id="liveSky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={era.palette.sky} />
            <stop offset="1" stopColor={shade(era.palette.sky, -25)} />
          </linearGradient>
        </defs>
        <rect width={W} height={H} fill="url(#liveSky)" />
        <g dangerouslySetInnerHTML={{ __html: inner }} />
      </svg>

      <div className="pointer-events-none absolute left-0 top-0 m-3 rounded-lg bg-black/45 px-3 py-2 text-white backdrop-blur-sm">
        <div className="text-sm font-bold">{era.name}</div>
        <div className="text-xs opacity-80">{era.englishName}</div>
      </div>

      <div className="absolute bottom-0 left-0 right-0">
        <div className="h-1.5 bg-black/20">
          <div
            className="h-full transition-all"
            style={{ width: `${progress * 100}%`, background: era.palette.accent }}
          />
        </div>
      </div>
    </div>
  );
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;
  r = Math.max(0, Math.min(255, r + amt));
  g = Math.max(0, Math.min(255, g + amt));
  b = Math.max(0, Math.min(255, b + amt));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
