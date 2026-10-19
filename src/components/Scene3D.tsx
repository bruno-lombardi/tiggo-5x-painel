import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";
import { createWorld } from "../scene/world";
import type { CamMode, ShownMode, World, WorldInput } from "../scene/world";

const MODES: { id: CamMode; label: string; hint: string }[] = [
  { id: "auto", label: "Automática", hint: "A câmera escolhe a melhor vista para o que está acontecendo." },
  { id: "chase", label: "Atrás", hint: "Vista de trás do carro, como em um jogo de corrida." },
  { id: "top", label: "De cima", hint: "Vista aérea: ideal para ver os sensores ao redor." },
  { id: "side", label: "De lado", hint: "Vista lateral, boa para ver distâncias." },
];

const SHOWN_LABEL: Record<ShownMode, string> = {
  chase: "vista de trás",
  top: "vista de cima",
  side: "vista de lado",
  avm: "câmera 360° (de cima)",
};

/** Visão 3D do carro, dos obstáculos e dos pedestres. Carregada sob demanda. */
export default function Scene3D({
  state,
  derived,
  variant = "panel",
  children,
}: {
  state: SimState;
  derived: Derived;
  variant?: "panel" | "game";
  children?: ReactNode;
}) {
  const game = variant === "game";
  const host = useRef<HTMLDivElement>(null);
  const layer = useRef<HTMLDivElement>(null);
  const world = useRef<World | null>(null);
  const live = useRef<WorldInput>({
    s: state,
    d: derived,
    sensors: true,
    labels: true,
    mode: "auto",
    reduced: false,
  });
  const [failed, setFailed] = useState(false);
  const [mode, setMode] = useState<CamMode>("auto");
  const [sensors, setSensors] = useState(true);
  const [labels, setLabels] = useState(true);
  const [shown, setShown] = useState<ShownMode>("chase");

  live.current.s = state;
  live.current.d = derived;
  live.current.sensors = sensors;
  live.current.labels = labels;
  live.current.mode = mode;

  useEffect(() => {
    const el = host.current;
    const lay = layer.current;
    if (!el || !lay) return;
    let w: World;
    try {
      w = createWorld(el, lay);
    } catch {
      setFailed(true);
      return;
    }
    world.current = w;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => (live.current.reduced = mq.matches);
    sync();
    mq.addEventListener("change", sync);

    const ro = new ResizeObserver(() => w.resize(el.clientWidth, el.clientHeight));
    ro.observe(el);
    w.resize(el.clientWidth, el.clientHeight);

    let raf = 0;
    let last = performance.now();
    let lastShown: ShownMode = "chase";
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden) {
        last = now;
        return;
      }
      w.update(live.current, (now - last) / 1000);
      last = now;
      const cur = w.shownMode();
      if (cur !== lastShown) {
        lastShown = cur;
        setShown(cur);
      }
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      mq.removeEventListener("change", sync);
      w.dispose();
      world.current = null;
    };
  }, []);

  /* Arrastar gira a câmera; roda do mouse ou +/- dá zoom. */
  const drag = useRef<{ x: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    world.current?.nudge(-(e.clientX - drag.current.x) * 0.006, 0);
    drag.current.x = e.clientX;
  };
  const onUp = () => (drag.current = null);

  const activeHint = MODES.find((m) => m.id === mode)?.hint;

  return (
    <section className={game ? "scene scene-game" : "panel scene"} aria-labelledby="scene-h">
      <div className={game ? "scene-head scene-head-game" : "scene-head"}>
        <h2 id="scene-h" className={game ? "sr-only" : undefined}>
          Veja o que o carro vê
        </h2>
        <div className="seg" role="radiogroup" aria-label="Câmera da cena 3D">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              className={`seg-btn ${mode === m.id ? "on" : ""}`}
              onClick={() => {
                setMode(m.id);
                world.current?.resetView();
              }}
              title={m.hint}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="scene-stage">
        <div
          ref={host}
          className="scene-host"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={() => world.current?.resetView()}
          role="img"
          aria-label="Cena 3D com seu carro, a pista, os outros veículos e pedestres. As mesmas informações aparecem em texto ao lado."
        />
        <div ref={layer} className="scene-labels" aria-hidden="true" />
        {children}
        {failed ? (
          <p className="scene-fail">
            Não foi possível abrir a visão 3D neste navegador. O painel e os controles continuam funcionando.
          </p>
        ) : (
          <div className="scene-tools">
            <button type="button" className="chip" aria-pressed={sensors} onClick={() => setSensors((v) => !v)}>
              Sensores
            </button>
            <button type="button" className="chip" aria-pressed={labels} onClick={() => setLabels((v) => !v)}>
              Rótulos
            </button>
            <span className="scene-mode" aria-live="polite">
              {SHOWN_LABEL[shown]}
            </span>
          </div>
        )}
      </div>

      {game ? null : (
        <p className="note">
          {activeHint} Arraste para girar, dois toques para voltar. Formas e alcances das zonas são ilustrativos.
        </p>
      )}

      <ul className={game ? "legend legend-game" : "legend"} aria-label="Legenda das cores">
        <li><i className="sw sw-blue" /> Sensor ligado, nada detectado</li>
        <li><i className="sw sw-green" /> Seguindo um carro / nível 1</li>
        <li><i className="sw sw-amber" /> Aviso</li>
        <li><i className="sw sw-red" /> Perigo ou frenagem automática</li>
        <li><i className="sw sw-cyan" /> Área da câmera 360°</li>
      </ul>
    </section>
  );
}
