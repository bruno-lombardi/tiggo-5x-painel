import { useEffect, useRef } from "react";
import type { SimState } from "./engine/types";

/** Placar da estrada livre: quilômetros, colisões, frenagens do AEB e tempo de ACC. */
export function useStats(state: SimState) {
  const ref = useRef({ collisions: 0, saves: 0, accSec: 0, lastCollided: false, lastSaved: false, lastClock: state.clock });

  useEffect(() => {
    const r = ref.current;
    if (state.collided && !r.lastCollided) r.collisions += 1;
    r.lastCollided = state.collided;
    const saved = state.aebStopped && state.speed < 1 && !state.collided;
    if (saved && !r.lastSaved) r.saves += 1;
    r.lastSaved = saved;
    const dt = Math.max(0, Math.min(state.clock - r.lastClock, 0.5));
    if (state.acc.mode === "active") r.accSec += dt;
    r.lastClock = state.clock;
  }, [state]);

  return {
    km: state.trip.km,
    collisions: ref.current.collisions,
    saves: ref.current.saves,
    accSec: ref.current.accSec,
    reset() {
      ref.current.collisions = 0;
      ref.current.saves = 0;
      ref.current.accSec = 0;
    },
  };
}
