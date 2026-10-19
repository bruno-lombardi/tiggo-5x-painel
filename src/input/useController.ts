import { useEffect, useMemo, useRef, useState } from "react";
import type { Dispatch } from "react";
import type { Action, SimState } from "../engine/types";
import { createController } from "./controller";
import type { ControlId, Controller } from "./controller";

function typingTarget(el: EventTarget | null): boolean {
  const e = el as HTMLElement | null;
  if (!e || !e.tagName) return false;
  const tag = e.tagName;
  return tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || e.getAttribute("role") === "radio";
}

/** Liga o teclado ao controle do carro. `pressed` diz quais teclas estão apertadas. */
export function useController(dispatch: Dispatch<Action>, state: SimState, enabled: boolean) {
  const stateRef = useRef(state);
  stateRef.current = state;
  const syncRef = useRef<() => void>(() => undefined);
  const [pressed, setPressed] = useState<ReadonlySet<ControlId>>(new Set());

  const controller: Controller = useMemo(
    () => createController(dispatch, () => stateRef.current, () => syncRef.current()),
    [dispatch],
  );

  useEffect(() => {
    syncRef.current = () => setPressed(new Set(controller.held()));
    return () => controller.dispose();
  }, [controller]);

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
      const id = controller.codeToId(e.code);
      if (!id || typingTarget(e.target)) return;
      // Espaço e Enter em um botão focado continuam funcionando como clique.
      const tag = (e.target as HTMLElement | null)?.tagName;
      if ((e.code === "Space" || e.code === "Enter") && tag === "BUTTON") return;
      e.preventDefault();
      controller.down(id);
    };
    const onUp = (e: KeyboardEvent) => {
      const id = controller.codeToId(e.code);
      if (id) controller.up(id);
    };
    const onBlur = () => controller.releaseAll();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onBlur);
      controller.releaseAll();
    };
  }, [controller, enabled]);

  return { controller, pressed };
}
