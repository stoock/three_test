"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGameStore } from "@/store/gameStore";
import { prepareScene, renderFrame } from "@/lib/renderer";
import { getEra, eraProgress } from "@/lib/eras";

const W = 640;
const H = 420;

export default function IsoScene() {
  const character = useGameStore((s) => s.character);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Rebuild the (static part of the) scene only when something visible changes.
  const ageInt = character ? Math.floor(character.age) : 0;
  const techInt = character ? Math.floor(character.techLevel) : 0;
  const territory = character?.territory ?? 0;
  const chaosBucket = character ? Math.round(character.chaos * 20) : 0;

  const sceneRef = useRef<ReturnType<typeof prepareScene> | null>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scene = useMemo(() => {
    if (!character) return null;
    const s = prepareScene(character, W, H);
    sceneRef.current = s;
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.name, character?.seed, ageInt, techInt, territory, chaosBucket]);

  useEffect(() => {
    sceneRef.current = scene;
  }, [scene]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !character) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;
    const start = performance.now();
    const loop = () => {
      const t = (performance.now() - start) / 1000;
      const s = sceneRef.current;
      if (s) renderFrame(ctx, s, character, W, H, t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [character?.name, character?.seed]);

  if (!character) return null;
  const era = getEra(character.techLevel);
  const progress = eraProgress(character.techLevel);

  return (
    <div className="relative w-full overflow-hidden rounded-xl border border-black/10 shadow-inner">
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className="block w-full"
        style={{ background: era.palette.sky, imageRendering: "auto" }}
      />

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
