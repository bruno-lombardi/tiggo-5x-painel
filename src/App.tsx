import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { CarPanel } from "./components/CarPanel";
import { Cluster } from "./components/Cluster";
import type { ClusterPage } from "./components/Cluster";
import { ConsolePanel, StalkPanel, WheelPanel } from "./components/Controls";
import { Coach, Feed, NowStep, ScenarioBar } from "./components/Guide";
import { AccChecklist, Explainer } from "./components/Inspector";
import { SCENARIOS, SCENARIO_BY_ID } from "./content/scenarios";
import { createInitialState, evaluate, reduce } from "./engine/engine";

const Scene3D = lazy(() => import("./components/Scene3D"));

export function App() {
  const [state, dispatch] = useReducer(reduce, undefined, () => createInitialState(true));
  const [selected, setSelected] = useState("acc");
  const [page, setPage] = useState<ClusterPage>("adas");
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
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
  const scenario = scenarioId ? SCENARIO_BY_ID[scenarioId] : null;

  const start = useCallback((id: string | null) => {
    setScenarioId(id);
    setProgress(0);
    if (id) {
      const sc = SCENARIO_BY_ID[id];
      dispatch({ type: "load", state: sc.build() });
      setSelected(sc.focus);
      setPage("adas");
    } else {
      dispatch({ type: "reset" });
    }
  }, []);

  /* Os passos se completam na ordem, assim que a condição é cumprida. */
  useEffect(() => {
    if (!scenario) return;
    let i = progress;
    while (i < scenario.steps.length && scenario.steps[i].done(state, derived)) i++;
    if (i !== progress) setProgress(i);
  }, [state, derived, scenario, progress]);

  const next = () => {
    const idx = SCENARIOS.findIndex((s) => s.id === scenarioId);
    start(SCENARIOS[(idx + 1) % SCENARIOS.length].id);
  };

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

      <ScenarioBar activeId={scenarioId} onPick={start} />
      <Coach
        scenario={scenario}
        progress={progress}
        onRestart={() => start(scenarioId)}
        onNext={next}
        onExplain={select}
      />

      <main className="layout">
        <CarPanel state={state} dispatch={dispatch} select={select} />

        <div className="center">
          <div className="dash">
            <Cluster state={state} derived={derived} selected={selected} select={select} page={page} />
            <NowStep scenario={scenario} progress={progress} />
          </div>
          <Suspense fallback={<section className="panel scene scene-loading">Carregando a cena 3D…</section>}>
            <Scene3D state={state} derived={derived} />
          </Suspense>
          <div className="controls">
            <WheelPanel state={state} dispatch={dispatch} select={select} page={page} setPage={setPage} />
            <StalkPanel state={state} dispatch={dispatch} select={select} />
            <ConsolePanel state={state} dispatch={dispatch} select={select} />
          </div>
        </div>

        <div className="side">
          <Feed state={state} derived={derived} />
          <AccChecklist state={state} derived={derived} />
          <Explainer id={selected} />
        </div>
      </main>

      <footer className="legal">
        <p>
          Projeto independente, sem vínculo com a CAOA Chery nem com a Chery. Os textos são resumos em palavras próprias,
          feitos a partir da leitura do Manual do Proprietário do Tiggo 5X Pro. Não há imagens, logotipos ou trechos do
          manual aqui: o painel e a cena 3D são desenhos originais. As velocidades de ativação vêm do manual; os tempos de
          reação, a física do carro, o formato das zonas dos sensores, a rotação, o combustível, o consumo e a autonomia
          são ilustrativos. Em caso de dúvida, vale o manual do seu veículo.
        </p>
      </footer>
    </div>
  );
}
