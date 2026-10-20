import { useEffect, useRef } from "react";
import { SERRA_LIMIT } from "./engine/route";
import type { SimState } from "./engine/types";

/** Placar da estrada livre: quilômetros, colisões, frenagens do AEB e tempo de ACC. */
export function useStats(state: SimState) {
  const ref = useRef({ collisions: 0, saves: 0, accSec: 0, overSec: 0, espSec: 0, maxSpeed: 0, lastCollided: false, lastSaved: false, lastClock: state.clock });

  useEffect(() => {
    const r = ref.current;
    if (state.collided && !r.lastCollided) r.collisions += 1;
    r.lastCollided = state.collided;
    const saved = state.aebStopped && state.speed < 1 && !state.collided;
    if (saved && !r.lastSaved) r.saves += 1;
    r.lastSaved = saved;
    const dt = Math.max(0, Math.min(state.clock - r.lastClock, 0.5));
    if (state.acc.mode === "active") r.accSec += dt;
    if (state.world === "serra" && state.speed > SERRA_LIMIT + 3) r.overSec += dt;
    if (state.espActive) r.espSec += dt;
    r.maxSpeed = Math.max(r.maxSpeed, state.speed);
    r.lastClock = state.clock;
  }, [state]);

  return {
    km: state.trip.km,
    collisions: ref.current.collisions,
    saves: ref.current.saves,
    accSec: ref.current.accSec,
    overSec: ref.current.overSec,
    espSec: ref.current.espSec,
    maxSpeed: ref.current.maxSpeed,
    reset() {
      ref.current.collisions = 0;
      ref.current.saves = 0;
      ref.current.accSec = 0;
      ref.current.overSec = 0;
      ref.current.espSec = 0;
      ref.current.maxSpeed = 0;
    },
  };
}
