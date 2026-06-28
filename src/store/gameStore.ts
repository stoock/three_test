import { create } from "zustand";
import { persist, createJSONStorage, type StateStorage } from "zustand/middleware";
import type { Character, DispositionId, LogEntry, Speed } from "@/lib/types";
import {
  advance,
  birthLog,
  createCharacter,
  trimLog,
} from "@/lib/simulation";

interface GameStore {
  character: Character | null;
  log: LogEntry[];
  speed: Speed;
  observedSeconds: number;
  createdAt: number | null;
  lastSavedAt: number | null;
  hydrated: boolean;

  createNew: (name: string, disposition: DispositionId) => void;
  tick: (dtYears: number, dtReal: number) => void;
  setSpeed: (speed: Speed) => void;
  reset: () => void;
  forceSave: () => void;
}

// Persist to localStorage but coalesce writes — the simulation mutates state
// every animation frame and we don't want to hit localStorage 60×/second.
function throttledStorage(delay = 1500): StateStorage {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: { key: string; value: string } | null = null;
  const flush = () => {
    if (pending) {
      try {
        localStorage.setItem(pending.key, pending.value);
      } catch {
        /* quota or unavailable — ignore */
      }
      pending = null;
    }
    timer = null;
  };
  return {
    getItem: (name) => (typeof localStorage === "undefined" ? null : localStorage.getItem(name)),
    setItem: (name, value) => {
      pending = { key: name, value };
      if (!timer) timer = setTimeout(flush, delay);
    },
    removeItem: (name) => {
      if (typeof localStorage !== "undefined") localStorage.removeItem(name);
    },
  };
}

export const useGameStore = create<GameStore>()(
  persist(
    (set, get) => ({
      character: null,
      log: [],
      speed: 1,
      observedSeconds: 0,
      createdAt: null,
      lastSavedAt: null,
      hydrated: false,

      createNew: (name, disposition) => {
        const character = createCharacter(name, disposition);
        set({
          character,
          log: [birthLog(character)],
          speed: 1,
          observedSeconds: 0,
          createdAt: Date.now(),
          lastSavedAt: Date.now(),
        });
      },

      tick: (dtYears, dtReal) => {
        const { character, log } = get();
        if (!character || dtYears <= 0) return;
        const { character: next, newLogs } = advance(character, dtYears);
        set({
          character: next,
          log: newLogs.length ? trimLog([...log, ...newLogs]) : log,
          observedSeconds: get().observedSeconds + dtReal,
        });
      },

      setSpeed: (speed) => set({ speed }),

      reset: () =>
        set({
          character: null,
          log: [],
          speed: 1,
          observedSeconds: 0,
          createdAt: null,
          lastSavedAt: null,
        }),

      forceSave: () => set({ lastSavedAt: Date.now() }),
    }),
    {
      name: "immortal-sim-save",
      version: 3,
      migrate: (persisted: unknown) => {
        const s = persisted as Partial<GameStore>;
        const ch = s?.character as
          | (NonNullable<GameStore["character"]> & Record<string, unknown>)
          | null
          | undefined;
        if (ch) {
          // v1 → seed/chaos/territory
          if (ch.seed === undefined) ch.seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
          if (ch.chaos === undefined) ch.chaos = 0.5;
          if (ch.territory === undefined) ch.territory = 5;
          // v2 → event scheduling, rivals, milestones
          if (ch.nextChoiceAge === undefined) ch.nextChoiceAge = Math.max(3, (ch.age as number) + 4);
          if (ch.rivals === undefined) ch.rivals = [];
          if (ch.milestones === undefined) ch.milestones = [];
        }
        return s as GameStore;
      },
      storage: createJSONStorage(() => throttledStorage()),
      partialize: (s) => ({
        character: s.character,
        log: s.log,
        speed: s.speed,
        observedSeconds: s.observedSeconds,
        createdAt: s.createdAt,
        lastSavedAt: s.lastSavedAt,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
