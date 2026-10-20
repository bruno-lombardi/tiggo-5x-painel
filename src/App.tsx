import { Suspense, lazy, useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { CarPanel } from "./components/CarPanel";
import { Cluster } from "./components/Cluster";
import type { ClusterPage } from "./components/Cluster";
import { ConsolePanel, StalkPanel, WheelPanel } from "./components/Controls";
import { DriveView, MissionMenu } from "./components/Drive";
import { MainMenu } from "./components/MainMenu";
import { Coach, Feed, NowStep, ScenarioBar } from "./components/Guide";
import { AccChecklist, Explainer } from "./components/Inspector";
import { SCENARIOS } from "./content/scenarios";
import { createDirector, directorStep } from "./engine/director";
import type { DirState } from "./engine/director";
import { createInitialState, evaluate, reduce } from "./engine/engine";
import { createSoundscape } from "./input/soundscape";
import { useController } from "./input/useController";
import { colorHex, loadSetup, saveSetup } from "./setup";
import type { Setup } from "./setup";
import { useMission } from "./useMission";
import { useStats } from "./useStats";

const Scene3D = lazy(() => import("./components/Scene3D"));

type Mode = "drive" | "lab";

export function App() {
  const [state, dispatch] = useReducer(reduce, undefined, () => createInitialState(true));
  const [mode, setMode] = useState<Mode>("drive");
  const [screen, setScreen] = useState<"menu" | "play">("menu");
  const [setup, setSetup] = useState<Setup>(loadSetup);
  const [selected, setSelected] = useState("acc");
  const [page, setPage] = useState<ClusterPage>("adas");
  const [started, setStarted] = useState(false);
  const [sound, setSound] = useState(false);
  const select = useCallback((id: string) => setSelected(id), []);

  const derived = useMemo(() => evaluate(state), [state]);
  const setupRef = useRef(setup);
  const stateRef = useRef(state);
  const derivedRef = useRef(derived);
  stateRef.current = state;
  derivedRef.current = derived;

  /* Relógio da simulação */
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

  const mission = useMission(state, derived, dispatch, select);
  const { controller, pressed } = useController(dispatch, state, true);
  const stats = useStats(state);

  /* Trânsito automático na estrada livre */
  const dirRef = useRef<DirState | null>(null);
  const freeRoad = mode === "drive" && screen === "play" && !mission.scenario && started;
  useEffect(() => {
    if (!freeRoad) {
      dirRef.current = null;
      return;
    }
    dirRef.current = createDirector(stateRef.current.clock);
    const id = window.setInterval(() => {
      if (!dirRef.current) return;
      const r = directorStep(stateRef.current, dirRef.current);
      dirRef.current = r.dir;
      r.actions.forEach((a) => dispatch(a));
    }, 500);
    return () => window.clearInterval(id);
  }, [freeRoad]);

  /* Som dos alertas */
  const beeper = useRef<ReturnType<typeof createSoundscape> | null>(null);
  useEffect(() => {
    beeper.current = createSoundscape();
    const id = window.setInterval(() => beeper.current?.update(stateRef.current, derivedRef.current), 100);
    return () => {
      window.clearInterval(id);
      beeper.current?.dispose();
    };
  }, []);
  const userMuted = useRef(false);
  const toggleSound = () => {
    const next = !sound;
    userMuted.current = !next;
    beeper.current?.setEnabled(next);
    setSound(next);
  };
  const [volume, setVolume] = useState(0.8);
  const changeVolume = (v: number) => {
    setVolume(v);
    beeper.current?.setVolume(v);
  };

  /* Sons da interface: passo concluído e resposta do quiz */
  const lastProg = useRef(0);
  useEffect(() => {
    const sc = mission.scenario;
    if (sc && mission.progress > lastProg.current) {
      beeper.current?.ui(mission.progress >= sc.steps.length ? "ok" : "step");
    }
    lastProg.current = sc ? mission.progress : 0;
  }, [mission.scenario, mission.progress]);
  useEffect(() => {
    const sc = mission.scenario;
    if (sc && mission.picked !== null) beeper.current?.ui(mission.picked === sc.quiz.answer ? "ok" : "fail");
  }, [mission.picked, mission.scenario]);

  const newGame = useCallback((cfg: Setup) => {
    // "?s=3000" começa o trajeto da Serra já nesse ponto (útil para testar trechos)
    const at = Number(new URLSearchParams(location.search).get("s")) || 0;
    dispatch({ type: "newGame", hasMaxDrive: cfg.model === "pro", world: cfg.world, night: cfg.night, at: cfg.world === "serra" ? at : 0 });
  }, []);

  const begin = useCallback((cfg?: Setup) => {
    if (!userMuted.current && !beeper.current?.isEnabled()) {
      beeper.current?.setEnabled(true);
      setSound(true);
    }
    newGame(cfg ?? setupRef.current);
    dispatch({ type: "ignition" });
    dispatch({ type: "gear", gear: "D" });
    dispatch({ type: "set", key: "parkingBrake", value: false });
    dispatch({ type: "tripReset" });
    stats.reset();
    setStarted(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newGame]);

  const startMission = useCallback(
    (id: string | null) => {
      mission.start(id);
      setPage("adas");
      if (id === null) {
        newGame(setupRef.current);
        setStarted(false);
      } else setStarted(true);
      stats.reset();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mission.start, newGame],
  );

  /* Menu principal */
  const goPlay = (cfg: Setup, missionId: string | null) => {
    setSetup(cfg);
    setupRef.current = cfg;
    saveSetup(cfg);
    setMode("drive");
    setScreen("play");
    if (missionId) startMission(missionId);
    else {
      mission.start(null);
      begin(cfg);
    }
  };
  const goMenu = () => {
    mission.start(null);
    newGame(setupRef.current);
    setStarted(false);
    setScreen("menu");
  };

  const nextMission = () => {
    const idx = SCENARIOS.findIndex((s) => s.id === mission.scenarioId);
    startMission(SCENARIOS[(idx + 1) % SCENARIOS.length].id);
  };

  if (screen === "menu") {
    return (
      <div className="app app-menu">
        <MainMenu
          initial={setup}
          onStart={(cfg) => goPlay(cfg, null)}
          onMission={(cfg) => goPlay(cfg, "basics")}
          onLab={() => {
            setMode("lab");
            setScreen("play");
          }}
        />
        <footer className="legal">
          <p>
            Projeto independente, sem vínculo com a CAOA Chery nem com a Chery. Textos em palavras próprias; desenhos, sons e mundos
            são originais. A Serra do Mirante é um trajeto inventado. Velocidades de ativação dos assistentes vêm do manual; a física,
            o trânsito e o restante são ilustrativos.
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className={`app app-${mode}`}>
      <header className={`top ${mode === "drive" ? "top-compact" : ""}`}>
        <div>
          <h1>Simulador do painel</h1>
          <p>
            {mode === "drive"
              ? "Dirija com o teclado e aprenda como o Max Drive do Tiggo 5X Pro reage no trânsito."
              : "Monte qualquer situação com os controles e veja o resultado no painel e na cena 3D."}
          </p>
        </div>
        <div className="top-right">
          <button type="button" className="chip" onClick={goMenu}>
            Menu principal
          </button>
          {mode === "drive" ? (
            <>
              <MissionMenu scenarioId={mission.scenarioId} onPick={startMission} />
              <button type="button" className="chip" aria-pressed={sound} onClick={toggleSound}>
                Som: {sound ? "ligado" : "desligado"}
              </button>
              {sound ? (
                <input
                  type="range"
                  className="volume"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  aria-label="Volume"
                  onChange={(e) => changeVolume(Number(e.target.value))}
                />
              ) : null}
            </>
          ) : null}
          <div className="seg" role="group" aria-label="Modo">
            <button type="button" className={`seg-btn ${mode === "drive" ? "on" : ""}`} aria-pressed={mode === "drive"} onClick={() => setMode("drive")}>
              Dirigir
            </button>
            <button type="button" className={`seg-btn ${mode === "lab" ? "on" : ""}`} aria-pressed={mode === "lab"} onClick={() => setMode("lab")}>
              Laboratório
            </button>
          </div>
          <p className="badge">Projeto educacional, não oficial</p>
        </div>
      </header>

      {mode === "drive" ? (
        <DriveView
          state={state}
          derived={derived}
          dispatch={dispatch}
          controller={controller}
          pressed={pressed}
          selected={selected}
          select={select}
          page={page}
          setPage={setPage}
          scenario={mission.scenario}
          progress={mission.progress}
          picked={mission.picked}
          setPicked={mission.setPicked}
          startMission={startMission}
          nextMission={nextMission}
          started={started}
          begin={() => begin()}
          onMenu={goMenu}
          carColor={colorHex(setup.color)}
          stats={stats}
        />
      ) : (
        <>
          <ScenarioBar activeId={mission.scenarioId} onPick={startMission} />
          <Coach
            scenario={mission.scenario}
            progress={mission.progress}
            onRestart={() => startMission(mission.scenarioId)}
            onNext={nextMission}
            onExplain={select}
          />
          <main className="layout">
            <CarPanel state={state} dispatch={dispatch} select={select} />
            <div className="center">
              <div className="dash">
                <Cluster state={state} derived={derived} selected={selected} select={select} page={page} />
                <NowStep scenario={mission.scenario} progress={mission.progress} />
              </div>
              <Suspense fallback={<section className="panel scene scene-loading">Carregando a cena 3D…</section>}>
                <Scene3D state={state} derived={derived} carColor={colorHex(setup.color)} />
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
        </>
      )}

      <footer className="legal">
        <p>
          Projeto independente, sem vínculo com a CAOA Chery nem com a Chery. Os textos são resumos em palavras próprias,
          feitos a partir da leitura do Manual do Proprietário do Tiggo 5X Pro. Não há imagens, logotipos ou trechos do
          manual aqui: o painel e a cena 3D são desenhos originais. As velocidades de ativação vêm do manual; os tempos de
          reação, a física do carro, o formato das zonas dos sensores, o trânsito, os sons, a rotação, o combustível, o
          consumo e a autonomia são ilustrativos. Em caso de dúvida, vale o manual do seu veículo.
        </p>
      </footer>
    </div>
  );
}
