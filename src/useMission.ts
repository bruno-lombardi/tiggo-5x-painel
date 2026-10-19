import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch } from "react";
import { SCENARIO_BY_ID } from "./content/scenarios";
import type { Derived } from "./engine/engine";
import type { Action, SimState } from "./engine/types";

/** Controla a missão atual: passos, quiz e o que acontece quando cada passo começa. */
export function useMission(state: SimState, derived: Derived, dispatch: Dispatch<Action>, onFocus: (id: string) => void) {
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const entered = useRef("");
  const scenario = scenarioId ? SCENARIO_BY_ID[scenarioId] : null;

  const start = useCallback(
    (id: string | null) => {
      entered.current = "";
      setScenarioId(id);
      setProgress(0);
      setPicked(null);
      if (id) {
        const sc = SCENARIO_BY_ID[id];
        dispatch({ type: "load", state: sc.build() });
        onFocus(sc.focus);
      } else {
        dispatch({ type: "reset" });
      }
    },
    [dispatch, onFocus],
  );

  /* Os passos se completam na ordem, assim que a condição é cumprida. */
  useEffect(() => {
    if (!scenario) return;
    let i = progress;
    while (i < scenario.steps.length && scenario.steps[i].done(state, derived)) i++;
    if (i !== progress) setProgress(i);
  }, [state, derived, scenario, progress]);

  /* Ao começar um passo, dispara o que ele pede (ex.: um carro aparece). */
  useEffect(() => {
    if (!scenario) return;
    const key = `${scenario.id}:${progress}`;
    if (entered.current === key) return;
    entered.current = key;
    scenario.steps[progress]?.enter?.forEach((a) => dispatch(a));
  }, [scenario, progress, dispatch]);

  return { scenarioId, scenario, progress, picked, setPicked, start };
}
