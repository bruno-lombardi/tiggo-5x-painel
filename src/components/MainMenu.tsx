import { useId, useState } from "react";
import type { ReactNode } from "react";
import { COLORS, colorCss, saveSetup } from "../setup";
import type { Model, Setup } from "../setup";
import type { WorldId } from "../engine/route";

/** Silhueta lateral de um SUV compacto, desenho original. */
function CarArt({ color, sport }: { color: string; sport: boolean }) {
  const id = useId();
  return (
    <svg viewBox="0 0 240 110" className="car-art" role="img" aria-label={`SUV compacto na cor escolhida, versão ${sport ? "Sport" : "Pro"}`}>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.38" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0" />
          <stop offset="1" stopColor="#000" stopOpacity="0.28" />
        </linearGradient>
        <linearGradient id={`${id}g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7fa1b4" />
          <stop offset="1" stopColor="#1d2a33" />
        </linearGradient>
      </defs>
      <ellipse cx="120" cy="96" rx="104" ry="6" fill="#000" opacity="0.28" />
      <path
        d="M12 74 V60 Q12 53 21 51 L50 45 Q63 25 93 23 H150 Q178 25 192 46 L218 52 Q230 55 230 65 V74 Q230 79 223 79 H207 A19 19 0 0 0 169 79 H73 A19 19 0 0 0 35 79 H19 Q12 79 12 74 Z"
        fill={color}
      />
      <path
        d="M12 74 V60 Q12 53 21 51 L50 45 Q63 25 93 23 H150 Q178 25 192 46 L218 52 Q230 55 230 65 V74 Q230 79 223 79 H207 A19 19 0 0 0 169 79 H73 A19 19 0 0 0 35 79 H19 Q12 79 12 74 Z"
        fill={`url(#${id}s)`}
      />
      <path d="M64 47 Q73 32 95 30 H119 V47 Z" fill={`url(#${id}g)`} />
      <path d="M125 30 H150 Q166 32 178 47 H125 Z" fill={`url(#${id}g)`} />
      <rect x="6" y="56" width="8" height="5" rx="2" fill="#fff6d6" opacity="0.95" />
      <rect x="226" y="58" width="6" height="6" rx="2" fill="#d9362c" />
      <path d="M96 62 H114" stroke="#000" strokeOpacity="0.28" strokeWidth="2.2" strokeLinecap="round" />
      {sport ? null : <rect x="100" y="16" width="44" height="4" rx="2" fill="#2a343c" />}
      {[54, 188].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="79" r="17" fill="#14191d" />
          <circle cx={cx} cy="79" r="9.5" fill="#aeb7bd" />
          <circle cx={cx} cy="79" r="3" fill="#14191d" />
        </g>
      ))}
    </svg>
  );
}

function HighwayArt() {
  const id = useId();
  return (
    <svg viewBox="0 0 240 130" className="world-art" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}k`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5d9bd0" />
          <stop offset="1" stopColor="#d6e6ef" />
        </linearGradient>
      </defs>
      <rect width="240" height="130" fill={`url(#${id}k)`} />
      <path d="M0 70 Q40 52 80 66 T160 62 T240 68 V80 H0Z" fill="#7a96a8" />
      <path d="M0 78 Q60 66 120 76 T240 74 V84 H0Z" fill="#5f8a63" />
      <rect y="80" width="240" height="50" fill="#5f8a63" />
      <path d="M92 80 H148 L232 130 H8 Z" fill="#4a4f55" />
      <path d="M120 80 L120 130" stroke="#f1f1f1" strokeWidth="0" />
      {[0, 1, 2].map((i) => (
        <path key={i} d={`M${112 + i * 8} 80 L${70 + i * 50 - 8} 130`} stroke="#f1f1f1" strokeWidth="2" strokeDasharray="7 7" opacity="0.9" />
      ))}
      <path d="M96 80 L12 130 M144 80 L228 130" stroke="#f1f1f1" strokeWidth="2.4" />
    </svg>
  );
}

function SerraArt() {
  const id = useId();
  return (
    <svg viewBox="0 0 240 130" className="world-art" aria-hidden="true">
      <defs>
        <linearGradient id={`${id}k`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f2b98a" />
          <stop offset="0.6" stopColor="#f6dcc0" />
          <stop offset="1" stopColor="#dfeaf0" />
        </linearGradient>
      </defs>
      <rect width="240" height="130" fill={`url(#${id}k)`} />
      <circle cx="184" cy="34" r="13" fill="#fff4d6" opacity="0.95" />
      <path d="M0 78 L34 40 L58 62 L96 22 L138 66 L170 44 L240 86 V130 H0Z" fill="#8aa0b4" />
      <path d="M0 92 L40 62 L76 84 L120 52 L170 88 L212 66 L240 82 V130 H0Z" fill="#4f7d5e" />
      <path d="M0 110 Q50 84 110 100 T240 98 V130 H0Z" fill="#3e6a4d" />
      <path d="M120 130 C60 122 190 112 126 102 C80 96 150 90 118 84 C98 80 134 76 124 72" fill="none" stroke="#4a4f55" strokeWidth="14" strokeLinecap="round" />
      <path d="M120 130 C60 122 190 112 126 102 C80 96 150 90 118 84 C98 80 134 76 124 72" fill="none" stroke="#e8c32a" strokeWidth="1.2" strokeDasharray="1 0" />
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={30 + i * 44} y={96 + (i % 2) * 6} width="3" height="8" fill="#2f4a38" />
      ))}
    </svg>
  );
}

function Opt(props: { name: string; value: string; checked: boolean; onChange: () => void; children: ReactNode; className?: string }) {
  return (
    <label className={`opt ${props.className ?? ""}`}>
      <input type="radio" name={props.name} value={props.value} checked={props.checked} onChange={props.onChange} />
      <span className="opt-body">{props.children}</span>
    </label>
  );
}

export function MainMenu(props: {
  initial: Setup;
  onStart: (s: Setup) => void;
  onMission: (s: Setup) => void;
  onLab: () => void;
}) {
  const [setup, setSetup] = useState<Setup>(props.initial);
  const set = <K extends keyof Setup>(k: K, v: Setup[K]) => {
    const next = { ...setup, [k]: v };
    setSetup(next);
    saveSetup(next);
  };
  const sport = setup.model === "sport";
  const serra = setup.world === "serra";
  const wname = serra ? "Serra do Mirante" : "Rodovia infinita";

  return (
    <main className="menu" aria-labelledby="menu-title">
      <section className="menu-hero" aria-label="Seu carro">
        <p className="menu-eyebrow">Projeto educacional, não oficial</p>
        <h1 id="menu-title">Simulador do Tiggo 5X</h1>
        <div className={`menu-stage ${setup.night ? "night" : ""} ${serra ? "serra" : ""}`}>
          <CarArt color={colorCss(setup.color)} sport={sport} />
        </div>
        <p className="menu-summary" role="status">
          <strong>Tiggo 5X {sport ? "Sport" : "Pro"}</strong> · {COLORS.find((c) => c.id === setup.color)?.label} · {wname} · {setup.night ? "noite" : "dia"}
        </p>
        <div className="menu-actions">
          <button type="button" className="primary big" onClick={() => props.onStart(setup)}>
            Começar a dirigir
          </button>
          <button type="button" className="ghost" onClick={() => props.onMission({ ...setup, world: "highway" })}>
            Missões guiadas
          </button>
          <button type="button" className="ghost" onClick={props.onLab}>
            Laboratório
          </button>
        </div>
      </section>

      <section className="menu-opts" aria-label="Escolhas">
        <fieldset className="menu-group">
          <legend>1 · Versão</legend>
          <div className="opt-row">
            {(
              [
                ["pro", "Tiggo 5X Pro", "Com o pacote Max Drive 2.0: piloto adaptativo (ACC), frenagem automática (AEB), alerta de faixa, ponto cego e farol alto automático."],
                ["sport", "Tiggo 5X Sport", "Versão sem os assistentes do Max Drive neste simulador. Foco em dirigir bem: ESP, ABS e controle nas curvas. Confira os itens da sua versão no manual."],
              ] as [Model, string, string][]
            ).map(([id, title, text]) => (
              <Opt key={id} name="model" value={id} checked={setup.model === id} onChange={() => set("model", id)}>
                <b>{title}</b>
                <span>{text}</span>
              </Opt>
            ))}
          </div>
        </fieldset>

        <fieldset className="menu-group">
          <legend>2 · Cor</legend>
          <div className="swatches">
            {COLORS.map((c) => (
              <label key={c.id} className="swatch">
                <input type="radio" name="color" value={c.id} checked={setup.color === c.id} onChange={() => set("color", c.id)} />
                <span className="sw-dot" style={{ background: colorCss(c.id) }} />
                <span className="sw-name">{c.label}</span>
              </label>
            ))}
          </div>
          <p className="menu-note">Cores ilustrativas, sem relação com o catálogo oficial.</p>
        </fieldset>

        <fieldset className="menu-group">
          <legend>3 · Mundo</legend>
          <div className="opt-row">
            {(
              [
                ["highway", "Rodovia infinita", "Pista larga com três faixas por sentido e sem fim. O trânsito aparece sozinho. Ideal para testar ACC, AEB, ponto cego e farol alto.", <HighwayArt key="h" />],
                ["serra", "Serra do Mirante", "Trajeto de 10 km em pista simples, uma faixa por sentido, entre montanhas: mais de 30 curvas, subidas e descidas, ponte, duas vilas e um mirante. Há carros vindo de frente, veículos lentos e pedestres no acostamento. Trajeto inventado.", <SerraArt key="s" />],
              ] as [WorldId, string, string, ReactNode][]
            ).map(([id, title, text, art]) => (
              <Opt key={id} name="world" value={id} checked={setup.world === id} onChange={() => set("world", id)} className="opt-world">
                {art}
                <b>{title}</b>
                <span>{text}</span>
              </Opt>
            ))}
          </div>
        </fieldset>

        <fieldset className="menu-group">
          <legend>4 · Horário</legend>
          <div className="opt-row opt-row-tight">
            <Opt name="time" value="dia" checked={!setup.night} onChange={() => set("night", false)}>
              <b>Dia</b>
              <span>Boa visibilidade.</span>
            </Opt>
            <Opt name="time" value="noite" checked={setup.night} onChange={() => set("night", true)}>
              <b>Noite</b>
              <span>Farol alto automático e pista escura.</span>
            </Opt>
          </div>
        </fieldset>

        <p className="menu-note">
          Dica: na Serra, a física é mais exigente. Freie antes das curvas, olhe as placas amarelas e fique na sua faixa. Teclas: setas dirigem, F abre a tela cheia.
        </p>
      </section>
    </main>
  );
}
