import { MESSAGES } from "../content/features";
import { LIMITS } from "../engine/engine";
import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";

/**
 * Painel de instrumentos desenhado do zero em SVG.
 * Não reproduz a arte do painel real: o objetivo é mostrar o comportamento
 * das luzes e dos assistentes, não copiar o visual do fabricante.
 */

const CX = 215;
const CY = 190;
const R = 124;
const MAX_SPEED = 220;

const polar = (deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [CX + r * Math.cos(a), CY + r * Math.sin(a)];
};
const angleFor = (speed: number) => -225 + (Math.min(speed, MAX_SPEED) / MAX_SPEED) * 270;

type Tone = "dim" | "grey" | "green" | "amber" | "red" | "white" | "blue";

interface Telltale {
  id: string;
  label: string;
  tone: Tone;
  blink?: boolean;
  feature: string;
}

function telltales(s: SimState, d: Derived): Telltale[] {
  const md = s.hasMaxDrive;
  const bsdLevel = Math.max(d.bsdWarn.left, d.bsdWarn.right);
  const accTone: Tone = !md
    ? "dim"
    : s.faults.acc
      ? "amber"
      : s.acc.mode === "active"
        ? "green"
        : s.acc.mode === "off"
          ? "dim"
          : "grey";
  const aebTone: Tone = !md ? "dim" : s.faults.aeb ? "amber" : s.aeb === "partial" || s.aeb === "emergency" ? "red" : "dim";
  const ldwTone: Tone = !md
    ? "dim"
    : s.faults.ldw
      ? "amber"
      : d.ldwWarn
        ? "amber"
        : s.ldw === "active"
          ? "green"
          : s.ldw === "standby"
            ? "grey"
            : "dim";
  const bsdTone: Tone = !md ? "dim" : s.faults.bsd ? "amber" : bsdLevel === 2 ? "amber" : bsdLevel === 1 ? "green" : "dim";
  const ihcOn = md && s.lightAuto && s.ihcRequested && s.settings.ihc && s.ihcActive;
  return [
    { id: "acc", label: s.limit.mode !== "off" ? "LIMIT" : "ACC", tone: s.limit.mode !== "off" ? (s.limit.mode === "active" ? "green" : "grey") : accTone, feature: s.limit.mode !== "off" ? "limit" : "tt_acc" },
    { id: "aeb", label: "AEB", tone: aebTone, blink: aebTone === "red", feature: "tt_aeb" },
    { id: "ldw", label: "LDW", tone: ldwTone, blink: d.ldwWarn, feature: "tt_ldw" },
    { id: "bsd", label: "BSD", tone: bsdTone, blink: bsdLevel === 2, feature: "tt_bsd" },
    { id: "ihc", label: "IHC", tone: s.faults.ihc && md ? "amber" : ihcOn ? "white" : "dim", feature: "tt_ihc" },
    { id: "hi", label: "ALTO", tone: d.highBeam ? "blue" : "dim", feature: "ihc" },
    { id: "esp", label: "ESP OFF", tone: !s.esp ? "amber" : "dim", feature: "tt_esp" },
    { id: "hdc", label: "HDC", tone: s.hdc ? "green" : "dim", feature: "tt_hdc" },
    { id: "epb", label: "FREIO", tone: s.parkingBrake ? "red" : "dim", feature: "tt_epb" },
    { id: "belt", label: "CINTO", tone: !s.seatbelt ? "red" : "dim", feature: "tt_belt" },
    { id: "door", label: "PORTA", tone: !s.doorClosed ? "red" : "dim", feature: "tt_door" },
  ];
}

function roadY(distance: number) {
  const u = Math.pow(Math.min(Math.max(distance, 0) / 120, 1), 0.55);
  return { y: 262 - u * 150, scale: 1 - 0.62 * u };
}

function TargetShape(props: { kind: SimState["target"]["kind"]; tone: string }) {
  if (props.kind === "pedestrian") {
    return (
      <g className={`target ${props.tone}`}>
        <circle cx="0" cy="-30" r="7" />
        <rect x="-8" y="-22" width="16" height="30" rx="6" />
      </g>
    );
  }
  return (
    <g className={`target ${props.tone}`}>
      <rect x="-36" y="-34" width="72" height="42" rx="12" />
      <rect x="-26" y="-26" width="52" height="12" rx="5" className="glass" />
      <rect x="-30" y="-8" width="14" height="6" rx="3" className="lamp" />
      <rect x="16" y="-8" width="14" height="6" rx="3" className="lamp" />
    </g>
  );
}

export function Cluster(props: {
  state: SimState;
  derived: Derived;
  selected: string;
  select: (id: string) => void;
}) {
  const { state: s, derived: d } = props;
  const on = s.ignitionOn;
  const tts = telltales(s, d);
  const speedShown = Math.round(s.speed);

  const worst = d.messages
    .map((id) => ({ id, ...MESSAGES[id] }))
    .sort((a, b) => ({ alert: 0, warn: 1, info: 2 }[a.tone] - { alert: 0, warn: 1, info: 2 }[b.tone]))[0];

  const ticks = [];
  for (let v = 0; v <= MAX_SPEED; v += 20) {
    const a = angleFor(v);
    const [x1, y1] = polar(a, R - 2);
    const [x2, y2] = polar(a, R - 14);
    const [tx, ty] = polar(a, R - 30);
    ticks.push(
      <g key={v}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} className="tick" />
        <text x={tx} y={ty} className="tick-label" textAnchor="middle" dominantBaseline="middle">
          {v}
        </text>
      </g>,
    );
  }
  const [nx, ny] = polar(angleFor(s.speed), R - 22);
  const [bx, by] = polar(angleFor(s.speed), 74);
  const markerSpeed = s.limit.mode === "active" ? s.limit.value : s.acc.mode === "active" ? s.acc.setSpeed : null;
  const marker = markerSpeed !== null ? polar(angleFor(markerSpeed), R + 7) : null;
  const markerIn = markerSpeed !== null ? polar(angleFor(markerSpeed), R - 3) : null;

  const lead = s.target;
  const pos = roadY(lead.distance);
  const targetTone =
    s.aeb === "partial" || s.aeb === "emergency" || s.collided
      ? "alert"
      : d.fdmWarn || s.aeb === "warn"
        ? "warn"
        : d.following
          ? "follow"
          : "idle";

  const gapColor = s.acc.gap === 3 ? "green" : s.acc.gap === 2 ? "amber" : "red";
  const accText =
    s.limit.mode !== "off"
      ? s.limit.mode === "active"
        ? `${s.limit.value}`
        : "--"
      : s.acc.mode === "active"
        ? `${s.acc.setSpeed}`
        : s.acc.mode === "suspended"
          ? `${s.acc.setSpeed}`
          : "--";
  const accLabel = s.limit.mode !== "off" ? "Limite" : "ACC";

  return (
    <svg
      className={`cluster ${on ? "is-on" : "is-off"}`}
      viewBox="0 0 900 380"
      role="group"
      aria-label={`Painel de instrumentos. Velocidade ${speedShown} quilômetros por hora, câmbio ${s.gear}.`}
    >
      <rect x="2" y="2" width="896" height="376" rx="44" className="glass-bg" />

      {/* Luzes de advertência */}
      <g transform="translate(0,24)">
        <polygon
          points="28,16 48,4 48,28"
          className={`turn ${s.turnSignal === "left" || s.hazard ? "turn-on" : ""}`}
        />
        <polygon
          points="872,16 852,4 852,28"
          className={`turn ${s.turnSignal === "right" || s.hazard ? "turn-on" : ""}`}
        />
        {tts.map((t, i) => (
          <g
            key={t.id}
            transform={`translate(${64 + i * 70},0)`}
            className={`tt tt-${on ? t.tone : "dim"} ${t.blink && on ? "blink" : ""} ${props.selected === t.feature ? "is-selected" : ""}`}
            role="button"
            tabIndex={0}
            aria-label={`Luz ${t.label}`}
            onClick={() => props.select(t.feature)}
            onPointerEnter={() => props.select(t.feature)}
            onFocus={() => props.select(t.feature)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                props.select(t.feature);
              }
            }}
          >
            <rect width="64" height="26" rx="8" />
            <text x="32" y="14" textAnchor="middle" dominantBaseline="middle">
              {t.label}
            </text>
          </g>
        ))}
      </g>

      {/* Velocímetro */}
      <g className="speedo" opacity={on ? 1 : 0.35}>
        <circle cx={CX} cy={CY} r={R + 12} className="speedo-ring" />
        {ticks}
        {marker && markerIn ? (
          <line x1={markerIn[0]} y1={markerIn[1]} x2={marker[0]} y2={marker[1]} className="set-marker" />
        ) : null}
        <line x1={bx} y1={by} x2={nx} y2={ny} className="needle" />
        <text x={CX} y={CY + 56} textAnchor="middle" className="digits">
          {speedShown}
        </text>
        <text x={CX} y={CY + 78} textAnchor="middle" className="unit">
          km/h
        </text>
        <g transform={`translate(${CX - 52},${CY + 98})`}>
          {(["P", "R", "N", "D"] as const).map((g, i) => (
            <text key={g} x={i * 35 + 8} y="0" textAnchor="middle" className={`gear ${s.gear === g ? "gear-on" : ""}`}>
              {g}
            </text>
          ))}
        </g>
      </g>

      {/* Tela de assistência à condução */}
      <g opacity={on ? 1 : 0.2}>
        <clipPath id="road-clip">
          <rect x="450" y="70" width="420" height="250" rx="22" />
        </clipPath>
        <rect x="450" y="70" width="420" height="250" rx="22" className="screen" />
        <g clipPath="url(#road-clip)">
          <polygon points="590,70 730,70 840,320 480,320" className="road" />
          <line x1="660" y1="70" x2="660" y2="320" className="lane" />
          <line x1="621" y1="70" x2="570" y2="320" className="lane" />
          <line x1="699" y1="70" x2="750" y2="320" className="lane" />

          {s.blind.left && on ? (
            <rect x="452" y="150" width="14" height="120" className={`blind lvl-${d.bsdWarn.left}`} />
          ) : null}
          {s.blind.right && on ? (
            <rect x="854" y="150" width="14" height="120" className={`blind lvl-${d.bsdWarn.right}`} />
          ) : null}

          {lead.kind !== "none" ? (
            <g transform={`translate(660,${pos.y}) scale(${pos.scale})`}>
              <TargetShape kind={lead.kind} tone={targetTone} />
            </g>
          ) : null}

          <g transform="translate(660,318)">
            <rect x="-40" y="-52" width="80" height="58" rx="14" className="own-car" />
            <rect x="-28" y="-42" width="56" height="14" rx="6" className="glass" />
          </g>
        </g>

        {lead.kind !== "none" ? (
          <text x="470" y="108" className="lead-info">
            {lead.kind === "pedestrian" ? "Pedestre" : lead.kind === "staticVehicle" ? "Carro parado" : `Carro a ${Math.round(lead.speed)} km/h`}
            , {Math.round(lead.distance)} m
          </text>
        ) : (
          <text x="470" y="108" className="lead-info dim">
            Nenhum alvo à frente
          </text>
        )}

        <g transform="translate(850,100)">
          <text textAnchor="end" className="acc-label">{accLabel}</text>
          <text y="38" textAnchor="end" className={`acc-speed ${s.acc.mode === "active" || s.limit.mode === "active" ? "on" : ""}`}>
            {accText}
          </text>
          {s.limit.mode === "off" ? (
            <g transform="translate(-54,52)">
              {[1, 2, 3].map((n) => (
                <rect
                  key={n}
                  x={(n - 1) * 20}
                  y={0}
                  width="16"
                  height="8"
                  rx="3"
                  className={n <= s.acc.gap ? `gap gap-${gapColor}` : "gap gap-off"}
                />
              ))}
            </g>
          ) : null}
        </g>

        {s.avmOn ? (
          <g>
            <rect x="450" y="70" width="420" height="250" rx="22" className="avm-bg" />
            <rect x="615" y="150" width="90" height="120" rx="20" className="avm-car" />
            <text x="660" y="104" textAnchor="middle" className="avm-title">
              Câmera 360° ligada
            </text>
            <text x="660" y="300" textAnchor="middle" className="avm-note">
              Vista de cima simulada
            </text>
          </g>
        ) : null}

        <g transform="translate(660,344)">
          {worst && on ? (
            <g className={`msg msg-${worst.tone} ${worst.tone === "alert" ? "blink-slow" : ""}`}>
              <rect x="-200" y="-18" width="400" height="30" rx="15" />
              <text y="-3" textAnchor="middle" dominantBaseline="middle">
                {worst.text}
              </text>
            </g>
          ) : null}
        </g>
      </g>

      {!on ? (
        <text x="450" y="204" textAnchor="middle" className="sleep">
          Carro desligado. Toque em Ligar para começar.
        </text>
      ) : null}
      <desc>
        Limites usados: ACC de {LIMITS.accMin} a {LIMITS.accMax} km/h; LDW a partir de {LIMITS.ldwOn} km/h; BSD a partir de{" "}
        {LIMITS.bsdOn} km/h.
      </desc>
    </svg>
  );
}
