import { Suspense, lazy, useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, ReactNode } from "react";
import { narrate } from "../content/narration";
import { SCENARIOS } from "../content/scenarios";
import type { Scenario } from "../content/scenarios";
import type { Derived } from "../engine/engine";
import type { Action, SimState } from "../engine/types";
import { CONTROLS } from "../input/controller";
import type { ControlId, Controller } from "../input/controller";
import { Cluster } from "./Cluster";
import type { ClusterPage } from "./Cluster";
import { Feed } from "./Guide";
import { AccChecklist, Explainer } from "./Inspector";

const Scene3D = lazy(() => import("./Scene3D"));

/* ------------------------------------------------------------------ */
/* Teclas                                                              */
/* ------------------------------------------------------------------ */

function isActive(id: ControlId, s: SimState): boolean {
  switch (id) {
    case "ignition":
      return s.ignitionOn;
    case "epb":
      return s.parkingBrake;
    case "gearP":
      return s.gear === "P";
    case "gearR":
      return s.gear === "R";
    case "gearN":
      return s.gear === "N";
    case "gearD":
      return s.gear === "D";
    case "turnL":
      return s.turnSignal === "left";
    case "turnR":
      return s.turnSignal === "right";
    case "hazard":
      return s.hazard;
    case "acc":
      return s.acc.mode !== "off";
    case "limit":
      return s.limit.mode !== "off";
    case "avm":
      return s.avmManual;
    case "hdc":
      return s.hdc;
    case "esp":
      return !s.esp;
    case "belt":
      return s.seatbelt;
    case "door":
      return s.doorClosed;
    case "push":
      return s.ihcRequested;
    default:
      return false;
  }
}

export function Keycap(props: {
  id: ControlId;
  controller: Controller;
  pressed: ReadonlySet<ControlId>;
  state: SimState;
  select: (feature: string) => void;
  label?: string;
  big?: boolean;
  className?: string;
}) {
  const def = CONTROLS[props.id];
  const down = props.pressed.has(props.id);
  const active = isActive(props.id, props.state);
  const label = props.label ?? def.label;
  return (
    <button
      type="button"
      className={`kc ${props.big ? "kc-big" : ""} ${down ? "is-down" : ""} ${active ? "is-active" : ""} ${props.className ?? ""}`}
      aria-label={`${label}, tecla ${def.cap}`}
      aria-pressed={active || undefined}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture?.(e.pointerId);
        if (def.feature) props.select(def.feature);
        props.controller.down(props.id);
      }}
      onPointerUp={() => props.controller.up(props.id)}
      onPointerCancel={() => props.controller.up(props.id)}
      onLostPointerCapture={() => props.controller.up(props.id)}
      onClick={(e) => {
        // Ativação pelo teclado (Enter ou espaço com o botão em foco).
        if (e.detail === 0) {
          props.controller.down(props.id);
          window.setTimeout(() => props.controller.up(props.id), 120);
        }
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <kbd>{def.cap}</kbd>
      <span>{label}</span>
    </button>
  );
}

function KeyDeck(props: {
  state: SimState;
  dispatch: Dispatch<Action>;
  controller: Controller;
  pressed: ReadonlySet<ControlId>;
  select: (id: string) => void;
  page: ClusterPage;
  setPage: (p: ClusterPage) => void;
}) {
  const k = (id: ControlId, extra?: { label?: string; big?: boolean; className?: string }) => (
    <Keycap key={id} id={id} controller={props.controller} pressed={props.pressed} state={props.state} select={props.select} {...extra} />
  );
  const s = props.state;
  return (
    <div className="deck">
      <div className="deck-main">
        <div className="dpod" role="group" aria-label="Botões do volante, lado esquerdo">
          <p className="dpod-title">Volante · esquerda</p>
          <div className="dpod-keys">
            {k("acc")}
            {k("cancel")}
            {k("limit")}
            {k("gap")}
          </div>
        </div>

        <div className="dpedals" role="group" aria-label="Pedais e volante">
          <div className="dpedal-row">
            {k("left", { label: "Volante", big: true })}
            {k("right", { label: "Volante", big: true })}
          </div>
          <div className="dpedal-row">
            {k("brake", { big: true, className: "kc-brake" })}
            {k("accel", { big: true, className: "kc-accel" })}
            {k("accelFull", { big: true, className: "kc-full" })}
          </div>
        </div>

        <div className="dpod" role="group" aria-label="Botões do volante, lado direito">
          <p className="dpod-title">Volante · direita</p>
          <div className="dpod-keys">
            {k("res")}
            {k("set")}
            {k("setStop")}
            <button
              type="button"
              className="kc"
              aria-label="Trocar a página da tela do painel"
              onClick={() => props.setPage(props.page === "adas" ? "trip" : "adas")}
            >
              <kbd>◄ ►</kbd>
              <span>Tela: {props.page === "adas" ? "Assistência" : "Viagem"}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="deck-strip" role="group" aria-label="Carro, câmbio, luzes e câmera">
        {k("ignition", { label: s.ignitionOn ? "Desligar" : "Ligar" })}
        {k("epb")}
        <span className="gears" role="group" aria-label="Câmbio">
          {k("gearP", { label: "P" })}
          {k("gearR", { label: "R" })}
          {k("gearN", { label: "N" })}
          {k("gearD", { label: "D" })}
        </span>
        {k("turnL")}
        {k("turnR")}
        {k("hazard")}
        {k("push")}
        {k("pull")}
        {k("avm")}
      </div>

      <details className="more">
        <summary>Mais controles</summary>
        <div className="more-keys">
          {k("belt", { label: s.seatbelt ? "Cinto afivelado" : "Cinto solto" })}
          {k("door", { label: s.doorClosed ? "Porta fechada" : "Porta aberta" })}
          {k("hdc")}
          {k("esp")}
          <button
            type="button"
            className={`kc ${s.night ? "is-active" : ""}`}
            aria-pressed={s.night}
            onClick={() => props.dispatch({ type: "set", key: "night", value: !s.night })}
          >
            <kbd>☾</kbd>
            <span>Noite</span>
          </button>
          <button
            type="button"
            className={`kc ${s.hasMaxDrive ? "" : "is-active"}`}
            aria-pressed={!s.hasMaxDrive}
            onClick={() => props.dispatch({ type: "variant", hasMaxDrive: !s.hasMaxDrive })}
          >
            <kbd>MD</kbd>
            <span>{s.hasMaxDrive ? "Com Max Drive" : "Sem Max Drive"}</span>
          </button>
        </div>
      </details>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Sobreposições na cena                                               */
/* ------------------------------------------------------------------ */

function fmtMin(sec: number) {
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function Hud(props: {
  scenario: Scenario | null;
  progress: number;
  stats: { km: number; collisions: number; saves: number; accSec: number };
  onExit: () => void;
  onResetStats: () => void;
}) {
  const sc = props.scenario;
  if (!sc) {
    return (
      <div className="hud" aria-label="Placar">
        <p className="hud-title">Estrada livre</p>
        <dl className="stats">
          <div>
            <dt>Km</dt>
            <dd>{props.stats.km.toFixed(1).replace(".", ",")}</dd>
          </div>
          <div>
            <dt>Colisões</dt>
            <dd>{props.stats.collisions}</dd>
          </div>
          <div>
            <dt>AEB evitou</dt>
            <dd>{props.stats.saves}</dd>
          </div>
          <div>
            <dt>ACC</dt>
            <dd>{fmtMin(props.stats.accSec)}</dd>
          </div>
        </dl>
        <button type="button" className="hud-link" onClick={props.onResetStats}>
          Zerar placar
        </button>
      </div>
    );
  }
  const st = sc.steps[props.progress];
  return (
    <div className="hud hud-mission" aria-label="Missão">
      <p className="hud-title">
        Missão · {sc.title}
        <button type="button" className="hud-link" onClick={props.onExit}>
          Sair
        </button>
      </p>
      <div className="dots" aria-hidden="true">
        {sc.steps.map((s, i) => (
          <i key={s.id} className={i < props.progress ? "done" : i === props.progress ? "now" : ""} />
        ))}
      </div>
      <p className="hud-step" role="status">
        <span className="hud-n">{st ? `Passo ${props.progress + 1} de ${sc.steps.length}` : "Concluída"}</span>
        {st ? st.text : "Responda ao quiz."}
        {st?.key ? <kbd className="hud-key">{st.key}</kbd> : null}
      </p>
      {st?.hint ? <p className="hud-hint">{st.hint}</p> : null}
    </div>
  );
}

function Toast({ state, derived }: { state: SimState; derived: Derived }) {
  const lines = narrate(state, derived);
  const l = lines.find((x) => x.tone === "alert") ?? lines.find((x) => x.tone === "warn");
  if (!l) return null;
  return (
    <p className={`toast toast-${l.tone}`} role="status">
      {l.text}
    </p>
  );
}

function Overlay({ children }: { children: ReactNode }) {
  return <div className="overlay">{children}</div>;
}

function StartCard(props: { onStart: () => void; onMission: (id: string) => void }) {
  return (
    <Overlay>
      <div className="card">
        <h2>Estrada livre</h2>
        <p>Dirija com o teclado e veja os assistentes do Max Drive em ação. O trânsito aparece sozinho.</p>
        <ul className="keys-help">
          <li>
            <kbd>↑</kbd> acelera, <kbd>↓</kbd> freia, <kbd>←</kbd> <kbd>→</kbd> viram o volante
          </li>
          <li>
            <kbd>A</kbd> liga o ACC e <kbd>S</kbd> grava a velocidade
          </li>
          <li>
            <kbd>Q</kbd> <kbd>E</kbd> setas, <kbd>B</kbd> farol alto automático
          </li>
        </ul>
        <div className="card-actions">
          <button type="button" className="primary" onClick={props.onStart}>
            Começar a dirigir
          </button>
          <button type="button" className="ghost" onClick={() => props.onMission("basics")}>
            Aprender o básico (missão)
          </button>
        </div>
      </div>
    </Overlay>
  );
}

function QuizCard(props: {
  scenario: Scenario;
  picked: number | null;
  onPick: (i: number) => void;
  onNext: () => void;
  onFree: () => void;
  onRepeat: () => void;
}) {
  const { quiz } = props.scenario;
  const answered = props.picked !== null;
  const right = props.picked === quiz.answer;
  return (
    <Overlay>
      <div className="card card-quiz">
        <p className="card-kind">Missão cumprida: {props.scenario.title}</p>
        <h2>{quiz.question}</h2>
        <div className="quiz-opts" role="radiogroup" aria-label="Respostas">
          {quiz.options.map((o, i) => (
            <button
              key={o}
              type="button"
              role="radio"
              aria-checked={props.picked === i}
              disabled={answered}
              className={`quiz-opt ${answered && i === quiz.answer ? "right" : ""} ${answered && props.picked === i && !right ? "wrong" : ""}`}
              onClick={() => props.onPick(i)}
            >
              {o}
            </button>
          ))}
        </div>
        {answered ? (
          <div role="status" className="quiz-why">
            <p>
              <strong>{right ? "Isso mesmo. " : "Quase. "}</strong>
              {quiz.why}
            </p>
            <ul className="bullets">
              {props.scenario.learn.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
            <div className="card-actions">
              <button type="button" className="primary" onClick={props.onNext}>
                Próxima missão
              </button>
              <button type="button" className="ghost" onClick={props.onRepeat}>
                Repetir
              </button>
              <button type="button" className="ghost" onClick={props.onFree}>
                Estrada livre
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </Overlay>
  );
}

export function MissionMenu(props: { scenarioId: string | null; onPick: (id: string | null) => void }) {
  return (
    <details
      className="menu"
      onClick={(e) => {
        // Fecha o menu depois de escolher.
        if ((e.target as HTMLElement).closest("li button")) (e.currentTarget as HTMLDetailsElement).open = false;
      }}
    >
      <summary>Missões</summary>
      <ul>
        <li>
          <button type="button" className={props.scenarioId === null ? "on" : ""} onClick={() => props.onPick(null)}>
            Estrada livre
          </button>
        </li>
        {SCENARIOS.map((m) => (
          <li key={m.id}>
            <button type="button" className={props.scenarioId === m.id ? "on" : ""} onClick={() => props.onPick(m.id)}>
              {m.title}
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/* ------------------------------------------------------------------ */
/* Tela completa                                                       */
/* ------------------------------------------------------------------ */

/** Tela cheia: usa a API do navegador; se não existir (ex.: iPhone), cobre a janela com CSS. */
function useFullscreen() {
  const ref = useRef<HTMLDivElement>(null);
  const [native, setNative] = useState(false);
  const [fake, setFake] = useState(false);
  const on = native || fake;

  useEffect(() => {
    const sync = () => setNative(document.fullscreenElement === ref.current && !!ref.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("has-fullscreen", on);
    return () => document.documentElement.classList.remove("has-fullscreen");
  }, [on]);

  const exit = useCallback(() => {
    setFake(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
  }, []);

  const enter = useCallback(async () => {
    const el = ref.current;
    if (!el) return;
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen({ navigationUI: "hide" });
        return;
      } catch {
        /* cai para o modo por CSS */
      }
    }
    setFake(true);
  }, []);

  const toggle = useCallback(() => (on ? exit() : void enter()), [on, enter, exit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (e.code === "KeyF" && tag !== "INPUT" && tag !== "SELECT" && tag !== "TEXTAREA" && !e.repeat) {
        e.preventDefault();
        toggle();
      } else if (e.code === "Escape" && fake) {
        setFake(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle, fake]);

  return { ref, on, toggle };
}

export function DriveView(props: {
  state: SimState;
  derived: Derived;
  dispatch: Dispatch<Action>;
  controller: Controller;
  pressed: ReadonlySet<ControlId>;
  selected: string;
  select: (id: string) => void;
  page: ClusterPage;
  setPage: (p: ClusterPage) => void;
  scenario: Scenario | null;
  progress: number;
  picked: number | null;
  setPicked: (i: number) => void;
  startMission: (id: string | null) => void;
  nextMission: () => void;
  started: boolean;
  begin: () => void;
  stats: { km: number; collisions: number; saves: number; accSec: number; reset: () => void };
}) {
  const { state: s, derived: d, scenario } = props;
  const finished = scenario ? props.progress >= scenario.steps.length : false;
  const showStart = !scenario && !props.started && !s.ignitionOn;
  const fs = useFullscreen();
  const [keysOpen, setKeysOpen] = useState(() => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches);

  return (
    <div className={`drive ${fs.on ? "drive-full" : ""} ${keysOpen ? "keys-open" : ""}`} ref={fs.ref}>
      <div className="drive-stage">
        <Suspense fallback={<div className="scene scene-loading">Carregando a estrada…</div>}>
          <Scene3D state={s} derived={d} variant="game">
            <Hud
              scenario={scenario}
              progress={props.progress}
              stats={props.stats}
              onExit={() => props.startMission(null)}
              onResetStats={props.stats.reset}
            />
            <Toast state={s} derived={d} />
            <div className="fs-tools">
              <button
                type="button"
                className="fs-btn"
                aria-pressed={fs.on}
                aria-label={fs.on ? "Sair da tela cheia (F ou Esc)" : "Tela cheia (F)"}
                onClick={fs.toggle}
              >
                <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  {fs.on ? (
                    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                  ) : (
                    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  )}
                </svg>
                <span>{fs.on ? "Sair" : "Tela cheia"}</span>
              </button>
              {fs.on ? (
                <button type="button" className="fs-btn" aria-pressed={keysOpen} onClick={() => setKeysOpen((v) => !v)}>
                  <span>Teclas</span>
                </button>
              ) : null}
            </div>
            {fs.on ? (
              <p className="fs-hint" aria-hidden="true">
                ↑ acelera · ↓ freia · ← → volante · F ou Esc sai da tela cheia
              </p>
            ) : null}
            {showStart ? <StartCard onStart={props.begin} onMission={props.startMission} /> : null}
            {scenario && finished ? (
              <QuizCard
                scenario={scenario}
                picked={props.picked}
                onPick={props.setPicked}
                onNext={props.nextMission}
                onFree={() => props.startMission(null)}
                onRepeat={() => props.startMission(scenario.id)}
              />
            ) : null}
          </Scene3D>
        </Suspense>
      </div>

      <div className="drive-dash">
        <div className="dash-cluster">
          <Cluster state={s} derived={d} selected={props.selected} select={props.select} page={props.page} />
        </div>
        <KeyDeck
          state={s}
          dispatch={props.dispatch}
          controller={props.controller}
          pressed={props.pressed}
          select={props.select}
          page={props.page}
          setPage={props.setPage}
        />
      </div>

      <div className="drive-learn">
        <Feed state={s} derived={d} />
        <Explainer id={props.selected} />
        <AccChecklist state={s} derived={d} />
      </div>
    </div>
  );
}
