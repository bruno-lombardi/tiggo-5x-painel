import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { CarPanel } from "./components/CarPanel";
import { Cluster } from "./components/Cluster";
import { ConsolePanel, StalkPanel, WheelPanel } from "./components/Controls";
import { AccChecklist, Explainer } from "./components/Inspector";
import { createInitialState, evaluate, reduce } from "./engine/engine";

export function App() {
  const [state, dispatch] = useReducer(reduce, undefined, () => createInitialState(true));
  const [selected, setSelected] = useState("acc");
  const select = useCallback((id: string) => setSelected(id), []);

  useEffect(() => {
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = Math.min((now - last) / 1000, 0.25);
      last = now;
      dispatch({ type: "tick", dt });
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  const derived = useMemo(() => evaluate(state), [state]);

  return (
    <div className="app">
      <header className="top">
        <div>
          <h1>Simulador do painel</h1>
          <p>
            Aprenda, na prática, como o ACC, o AEB, o LDW, o ponto cego, o farol alto inteligente e a câmera 360° respondem
            no Tiggo 5X Pro com Max Drive.
          </p>
        </div>
        <p className="badge">Projeto educacional, não oficial</p>
      </header>

      <main className="layout">
        <CarPanel state={state} dispatch={dispatch} select={select} />

        <div className="center">
          <Cluster state={state} derived={derived} selected={selected} select={select} />
          <div className="controls">
            <WheelPanel state={state} dispatch={dispatch} select={select} />
            <StalkPanel state={state} dispatch={dispatch} select={select} />
            <ConsolePanel state={state} dispatch={dispatch} select={select} />
          </div>
        </div>

        <div className="side">
          <AccChecklist state={state} derived={derived} />
          <Explainer id={selected} />
        </div>
      </main>

      <footer className="legal">
        <p>
          Projeto independente, sem vínculo com a CAOA Chery nem com a Chery. Os textos são resumos em palavras próprias,
          feitos a partir da leitura do Manual do Proprietário do Tiggo 5X Pro. Não há imagens, logotipos ou trechos do
          manual aqui. Marcas citadas pertencem aos seus donos. As velocidades de ativação vêm do manual; os tempos de
          reação e a física do carro são ilustrativos. Em caso de dúvida, vale o manual do seu veículo.
        </p>
      </footer>
    </div>
  );
}
