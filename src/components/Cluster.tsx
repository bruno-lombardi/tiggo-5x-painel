import { MESSAGES } from "../content/features";
import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";

/**
 * Painel de instrumentos desenhado do zero em SVG.
 * Segue a organização geral de um painel moderno (dois mostradores redondos,
 * tela central, faixa de luzes no alto, câmbio e hodômetro embaixo), mas a arte
 * é própria: não reproduz a do fabricante. Rotação, combustível, temperatura,
 * consumo e autonomia são ILUSTRATIVOS (o manual não traz esses valores).
 */

export type ClusterPage = "adas" | "trip";

const SPEEDO = { cx: 205, cy: 212, r: 146, max: 220 };
const TACHO = { cx: 795, cy: 212, r: 146, max: 8 };
const SCREEN = { x: 372, y: 58, w: 256, h: 244 };
const MID = SCREEN.x + SCREEN.w / 2;

const toXY = (c: { cx: number; cy: number }, deg: number, r: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [c.cx + r * Math.cos(a), c.cy + r * Math.sin(a)];
};
const sweepAngle = (v: number, max: number) => -225 + (Math.min(Math.max(v, 0), max) / max) * 270;

function arcPath(c: { cx: number; cy: number }, r: number, from: number, to: number) {
  const [x1, y1] = toXY(c, from, r);
  const [x2, y2] = toXY(c, to, r);
  const large = Math.abs(to - from) > 180 ? 1 : 0;
  const sweep = to > from ? 1 : 0;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 ${large} ${sweep} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

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
  const limitShown = s.limit.mode !== "off";
  return [
    {
      id: "acc",
      label: limitShown ? "LIMIT" : "ACC",
      tone: limitShown ? (s.limit.mode === "active" ? "green" : "grey") : accTone,
      feature: limitShown ? "limit" : "tt_acc",
    },
    { id: "aeb", label: "AEB", tone: aebTone, blink: aebTone === "red", feature: "tt_aeb" },
    { id: "ldw", label: "LDW", tone: ldwTone, blink: d.ldwWarn, feature: "tt_ldw" },
    { id: "bsd", label: "BSD", tone: bsdTone, blink: bsdLevel === 2, feature: "tt_bsd" },
    { id: "ihc", label: "IHC", tone: s.faults.ihc && md ? "amber" : ihcOn ? "white" : "dim", feature: "tt_ihc" },
    { id: "hi", label: "ALTO", tone: d.highBeam ? "blue" : "dim", feature: "ihc" },
    { id: "avm", label: "360°", tone: s.avmOn ? "blue" : "dim", feature: "avm" },
    { id: "esp", label: "ESP OFF", tone: !s.esp ? "amber" : "dim", feature: "tt_esp" },
    { id: "hdc", label: "HDC", tone: s.hdc ? "green" : "dim", feature: "tt_hdc" },
    { id: "epb", label: "FREIO", tone: s.parkingBrake ? "red" : "dim", feature: "tt_epb" },
    { id: "belt", label: "CINTO", tone: !s.seatbelt ? "red" : "dim", feature: "tt_belt" },
    { id: "door", label: "PORTA", tone: !s.doorClosed ? "red" : "dim", feature: "tt_door" },
  ];
}

function roadY(distance: number) {
  const u = Math.pow(Math.min(Math.max(distance, 0) / 120, 1), 0.55);
  return { y: 270 - u * 176, scale: 1 - 0.66 * u };
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

function Needle({ c, angle, length }: { c: { cx: number; cy: number }; angle: number; length: number }) {
  const { cx, cy } = c;
  return (
    <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${cx}px ${cy}px` }} className="needle-g">
      <polygon
        points={`${cx - 20},${cy - 2.6} ${cx + length - 8},${cy - 1.4} ${cx + length},${cy} ${cx + length - 8},${cy + 1.4} ${cx - 20},${cy + 2.6}`}
        className="needle"
      />
    </g>
  );
}

function fmtKm(v: number, digits = 0) {
  return v.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function Cluster(props: {
  state: SimState;
  derived: Derived;
  selected: string;
  select: (id: string) => void;
  page: ClusterPage;
}) {
  const { state: s, derived: d } = props;
  const on = s.ignitionOn;
  const tts = telltales(s, d);
  const speedShown = Math.round(s.speed);

  const worst = d.messages
    .map((id) => ({ id, ...MESSAGES[id] }))
    .sort((a, b) => ({ alert: 0, warn: 1, info: 2 }[a.tone] - { alert: 0, warn: 1, info: 2 }[b.tone]))[0];

  /* Escalas */
  const speedTicks = [];
  for (let v = 0; v <= SPEEDO.max; v += 10) {
    const major = v % 20 === 0;
    const a = sweepAngle(v, SPEEDO.max);
    const [x1, y1] = toXY(SPEEDO, a, 124);
    const [x2, y2] = toXY(SPEEDO, a, major ? 108 : 115);
    speedTicks.push(<line key={v} x1={x1} y1={y1} x2={x2} y2={y2} className={major ? "tick" : "tick tick-minor"} />);
    if (major) {
      const [tx, ty] = toXY(SPEEDO, a, 90);
      speedTicks.push(
        <text key={`l${v}`} x={tx} y={ty} className="tick-label" textAnchor="middle" dominantBaseline="middle">
          {v}
        </text>,
      );
    }
  }
  const rpmTicks = [];
  for (let v = 0; v <= TACHO.max * 2; v += 1) {
    const val = v / 2;
    const major = v % 2 === 0;
    const a = sweepAngle(val, TACHO.max);
    const [x1, y1] = toXY(TACHO, a, 124);
    const [x2, y2] = toXY(TACHO, a, major ? 108 : 115);
    rpmTicks.push(<line key={v} x1={x1} y1={y1} x2={x2} y2={y2} className={major ? "tick" : "tick tick-minor"} />);
    if (major) {
      const [tx, ty] = toXY(TACHO, a, 90);
      rpmTicks.push(
        <text key={`l${v}`} x={tx} y={ty} className="tick-label" textAnchor="middle" dominantBaseline="middle">
          {val}
        </text>,
      );
    }
  }

  const speedAngle = sweepAngle(s.speed, SPEEDO.max);
  const rpmAngle = sweepAngle(d.rpm / 1000, TACHO.max);
  const markerSpeed = s.limit.mode === "active" ? s.limit.value : s.acc.mode === "active" ? s.acc.setSpeed : null;

  /* Combustível e temperatura (arcos de baixo). 118° = esquerda, 62° = direita. */
  const FUEL_FROM = 118;
  const FUEL_TO = 62;
  const fuelEnd = FUEL_FROM - (on ? d.fuelLevel : 0) * (FUEL_FROM - FUEL_TO);
  const coolant = on ? Math.min(0.5, 0.12 + s.clock * 0.02) : 0;
  const coolEnd = FUEL_FROM - coolant * (FUEL_FROM - FUEL_TO);
  const lowFuel = on && d.fuelLevel < 0.12;

  /* Tela central */
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
      : s.acc.mode === "active" || s.acc.mode === "suspended"
        ? `${s.acc.setSpeed}`
        : "--";
  const accLabel = s.limit.mode !== "off" ? "Limite" : "ACC";
  const accLit = s.acc.mode === "active" || s.limit.mode === "active";

  const leadText =
    lead.kind === "none"
      ? "Nada à frente"
      : lead.kind === "pedestrian"
        ? `Pedestre, ${Math.round(lead.distance)} m`
        : lead.kind === "staticVehicle"
          ? `Carro parado, ${Math.round(lead.distance)} m`
          : `Carro a ${Math.round(lead.speed)} km/h, ${Math.round(lead.distance)} m`;

  const msgText = worst?.text ?? "";
  const longMsg = msgText.length > 50;

  return (
    <svg
      className={`cluster ${on ? "is-on" : "is-off"}`}
      viewBox="0 0 1000 420"
      role="group"
      aria-label={`Painel de instrumentos. Velocidade ${speedShown} quilômetros por hora, câmbio ${s.gear}.`}
    >
      <rect x="2" y="2" width="996" height="416" rx="54" className="glass-bg" />

      {/* Faixa de luzes */}
      <g transform="translate(0,16)">
        <polygon points="30,14 52,2 52,26" className={`turn ${s.turnSignal === "left" || s.hazard ? "turn-on" : ""}`} />
        <polygon points="970,14 948,2 948,26" className={`turn ${s.turnSignal === "right" || s.hazard ? "turn-on" : ""}`} />
        {tts.map((t, i) => (
          <g
            key={t.id}
            transform={`translate(${68 + i * 72},0)`}
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
            <rect width="66" height="26" rx="8" />
            <text x="33" y="14" textAnchor="middle" dominantBaseline="middle">
              {t.label}
            </text>
          </g>
        ))}
      </g>

      {/* Velocímetro */}
      <g className="dial" opacity={on ? 1 : 0.4}>
        <circle cx={SPEEDO.cx} cy={SPEEDO.cy} r={SPEEDO.r} className="dial-face" />
        <circle cx={SPEEDO.cx} cy={SPEEDO.cy} r={SPEEDO.r - 18} className="dial-inner" />
        {speedTicks}
        {markerSpeed !== null ? (
          <polygon
            points={`${SPEEDO.cx + 131},${SPEEDO.cy - 6} ${SPEEDO.cx + 131},${SPEEDO.cy + 6} ${SPEEDO.cx + 118},${SPEEDO.cy}`}
            className="set-marker"
            style={{
              transform: `rotate(${sweepAngle(markerSpeed, SPEEDO.max)}deg)`,
              transformOrigin: `${SPEEDO.cx}px ${SPEEDO.cy}px`,
            }}
          />
        ) : null}
        <Needle c={SPEEDO} angle={speedAngle} length={116} />
        <text x={SPEEDO.cx} y={SPEEDO.cy + 24} textAnchor="middle" className="digits">
          {speedShown}
        </text>
        <text x={SPEEDO.cx} y={SPEEDO.cy + 44} textAnchor="middle" className="unit">
          km/h
        </text>
        <path d={arcPath(SPEEDO, 136, FUEL_FROM, FUEL_TO)} className="arc-bg" />
        <path d={arcPath(SPEEDO, 136, FUEL_FROM, Math.min(fuelEnd, FUEL_FROM - 0.01))} className={`arc-fill ${lowFuel ? "arc-low" : ""}`} />
        <text x={toXY(SPEEDO, 126, 126)[0]} y={toXY(SPEEDO, 126, 126)[1]} className="arc-label" textAnchor="middle">
          E
        </text>
        <text x={toXY(SPEEDO, 54, 126)[0]} y={toXY(SPEEDO, 54, 126)[1]} className="arc-label" textAnchor="middle">
          F
        </text>
        <text x={SPEEDO.cx} y={SPEEDO.cy + 112} className="arc-label" textAnchor="middle">
          Combustível*
        </text>
      </g>

      {/* Conta-giros */}
      <g className="dial" opacity={on ? 1 : 0.4}>
        <circle cx={TACHO.cx} cy={TACHO.cy} r={TACHO.r} className="dial-face" />
        <circle cx={TACHO.cx} cy={TACHO.cy} r={TACHO.r - 18} className="dial-inner" />
        <path d={arcPath(TACHO, 119, sweepAngle(6.5, TACHO.max), sweepAngle(TACHO.max, TACHO.max))} className="redline" />
        {rpmTicks}
        <Needle c={TACHO} angle={rpmAngle} length={116} />
        <text x={TACHO.cx} y={TACHO.cy + 24} textAnchor="middle" className="digits digits-sm">
          {(d.rpm / 1000).toFixed(1).replace(".", ",")}
        </text>
        <text x={TACHO.cx} y={TACHO.cy + 44} textAnchor="middle" className="unit">
          x1000 rpm*
        </text>
        <path d={arcPath(TACHO, 136, FUEL_FROM, FUEL_TO)} className="arc-bg" />
        <path d={arcPath(TACHO, 136, FUEL_FROM, Math.min(coolEnd, FUEL_FROM - 0.01))} className="arc-fill arc-cool" />
        <text x={toXY(TACHO, 126, 126)[0]} y={toXY(TACHO, 126, 126)[1]} className="arc-label" textAnchor="middle">
          C
        </text>
        <text x={toXY(TACHO, 54, 126)[0]} y={toXY(TACHO, 54, 126)[1]} className="arc-label" textAnchor="middle">
          H
        </text>
        <text x={TACHO.cx} y={TACHO.cy + 112} className="arc-label" textAnchor="middle">
          Temperatura*
        </text>
      </g>

      {/* Tela central */}
      <g opacity={on ? 1 : 0.25}>
        <clipPath id="screen-clip">
          <rect x={SCREEN.x} y={SCREEN.y} width={SCREEN.w} height={SCREEN.h} rx="20" />
        </clipPath>
        <rect x={SCREEN.x} y={SCREEN.y} width={SCREEN.w} height={SCREEN.h} rx="20" className="screen" />

        {props.page === "adas" ? (
          <g clipPath="url(#screen-clip)" onClick={() => props.select("acc")}>
            <polygon
              points={`${MID - 30},${SCREEN.y + 14} ${MID + 30},${SCREEN.y + 14} ${MID + 112},${SCREEN.y + SCREEN.h} ${MID - 112},${SCREEN.y + SCREEN.h}`}
              className="road"
            />
            <line x1={MID - 14} y1={SCREEN.y + 14} x2={MID - 54} y2={SCREEN.y + SCREEN.h} className="lane" />
            <line x1={MID + 14} y1={SCREEN.y + 14} x2={MID + 54} y2={SCREEN.y + SCREEN.h} className="lane" />

            {s.blind.left && on ? (
              <rect x={SCREEN.x + 2} y={SCREEN.y + 120} width="10" height="96" rx="4" className={`blind lvl-${d.bsdWarn.left}`} />
            ) : null}
            {s.blind.right && on ? (
              <rect x={SCREEN.x + SCREEN.w - 12} y={SCREEN.y + 120} width="10" height="96" rx="4" className={`blind lvl-${d.bsdWarn.right}`} />
            ) : null}

            {lead.kind !== "none" ? (
              <g transform={`translate(${MID},${pos.y + SCREEN.y - 58}) scale(${pos.scale * 0.8})`}>
                <TargetShape kind={lead.kind} tone={targetTone} />
              </g>
            ) : null}

            <g transform={`translate(${MID},${SCREEN.y + SCREEN.h - 4})`}>
              <rect x="-28" y="-40" width="56" height="42" rx="12" className="own-car" />
              <rect x="-20" y="-32" width="40" height="11" rx="5" className="glass" />
            </g>

            <text x={SCREEN.x + 14} y={SCREEN.y + 84} className="lead-info">
              {leadText}
            </text>
          </g>
        ) : (
          <g className="trip" aria-label="Dados da viagem">
            {[
              ["Total", `${fmtKm(s.odo)} km`],
              ["Viagem", `${fmtKm(s.trip.km, 1)} km`],
              ["Tempo", fmtTime(s.trip.seconds)],
              ["Média", `${fmtKm(d.tripAvgSpeed)} km/h`],
              ["Consumo*", d.tripKmPerLiter > 0 ? `${fmtKm(d.tripKmPerLiter, 1)} km/l` : "-- km/l"],
              ["Autonomia*", `${fmtKm(d.rangeKm)} km`],
            ].map(([k, v], i) => (
              <g key={k} transform={`translate(${SCREEN.x + 20},${SCREEN.y + 90 + i * 28})`}>
                <text className="trip-k">{k}</text>
                <text x={SCREEN.w - 40} className="trip-v" textAnchor="end">
                  {v}
                </text>
              </g>
            ))}
            <text x={MID} y={SCREEN.y + SCREEN.h - 8} className="trip-note" textAnchor="middle">
              * valores ilustrativos
            </text>
          </g>
        )}

        {/* Cabeçalho da tela: limite ou ACC */}
        <g>
          <rect x={SCREEN.x + 10} y={SCREEN.y + 8} width={SCREEN.w - 20} height="56" rx="12" className="screen-head" />
          <text x={SCREEN.x + 24} y={SCREEN.y + 28} className="acc-label">
            {props.page === "adas" ? accLabel : "Viagem"}
          </text>
          {props.page === "adas" ? (
            <>
              <text x={SCREEN.x + 24} y={SCREEN.y + 56} className={`acc-speed ${accLit ? "on" : ""}`}>
                {accText}
              </text>
              {s.limit.mode === "off" ? (
                <g transform={`translate(${SCREEN.x + SCREEN.w - 92},${SCREEN.y + 26})`}>
                  <text x="0" y="-2" className="gap-label">
                    Distância
                  </text>
                  {[1, 2, 3].map((n) => (
                    <rect
                      key={n}
                      x={(n - 1) * 22}
                      y={8}
                      width="18"
                      height="9"
                      rx="3"
                      className={n <= s.acc.gap ? `gap gap-${gapColor}` : "gap gap-off"}
                    />
                  ))}
                </g>
              ) : null}
            </>
          ) : (
            <text x={SCREEN.x + 24} y={SCREEN.y + 52} className="trip-head">
              OK (segure) zera a viagem
            </text>
          )}
        </g>

        <g transform={`translate(${MID},${SCREEN.y + SCREEN.h + 14})`}>
          <circle cx="-8" r="3.5" className={`page-dot ${props.page === "adas" ? "on" : ""}`} />
          <circle cx="8" r="3.5" className={`page-dot ${props.page === "trip" ? "on" : ""}`} />
        </g>
      </g>

      {/* Mensagem */}
      {worst && on ? (
        <g transform={`translate(${MID},${SCREEN.y + SCREEN.h + 44})`} className={`msg msg-${worst.tone} ${worst.tone === "alert" ? "blink-slow" : ""}`}>
          <rect x="-190" y="-14" width="380" height="28" rx="14" />
          <text y="1" textAnchor="middle" dominantBaseline="middle" textLength={longMsg ? 350 : undefined} lengthAdjust="spacingAndGlyphs">
            {msgText}
          </text>
        </g>
      ) : null}

      {/* Câmbio e hodômetro */}
      <g transform={`translate(${MID},${SCREEN.y + SCREEN.h + 84})`} opacity={on ? 1 : 0.35}>
        {(["P", "R", "N", "D"] as const).map((g, i) => (
          <text key={g} x={(i - 1.5) * 34} y="0" textAnchor="middle" className={`gear ${s.gear === g ? "gear-on" : ""}`}>
            {g}
          </text>
        ))}
        <text y="24" textAnchor="middle" className="odo">
          {fmtKm(s.odo)} km
        </text>
      </g>

      {!on ? (
        <text x="500" y="218" textAnchor="middle" className="sleep">
          Carro desligado. Toque em Ligar.
        </text>
      ) : null}
      <desc>Valores marcados com asterisco (rotação, combustível, temperatura, consumo e autonomia) são ilustrativos.</desc>
    </svg>
  );
}
