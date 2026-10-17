import { ACC_CONDITION_LABELS, FEATURES } from "../content/features";
import { LIMITS } from "../engine/engine";
import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";

function Mark({ ok }: { ok: boolean }) {
  return (
    <svg className={`mark ${ok ? "mark-ok" : "mark-bad"}`} viewBox="0 0 20 20" aria-hidden="true">
      {ok ? <path d="M4 10.5 8.2 14.6 16 5.6" /> : <path d="M5 5 15 15M15 5 5 15" />}
    </svg>
  );
}

/** Lista de verificação do ACC: mostra, ao vivo, por que o sistema não ativa. */
export function AccChecklist({ state: s, derived: d }: { state: SimState; derived: Derived }) {
  const speedOk = s.speed >= LIMITS.accMin && s.speed <= LIMITS.accMax;
  const rows = [
    { id: "max", label: "Carro com Max Drive e ligado", ok: s.hasMaxDrive && s.ignitionOn },
    ...d.conditions.map((c) => ({ id: c.id, label: ACC_CONDITION_LABELS[c.id], ok: c.ok })),
    { id: "speed", label: `Velocidade entre ${LIMITS.accMin} e ${LIMITS.accMax} km/h`, ok: speedOk },
  ];
  const missing = rows.filter((r) => !r.ok);
  const modeText: Record<SimState["acc"]["mode"], string> = {
    off: "ACC desligado",
    standby: "ACC em espera",
    active: "ACC ativo",
    suspended: "ACC interrompido (RES+ retoma)",
  };

  return (
    <section className="panel checklist" aria-labelledby="chk-h">
      <h2 id="chk-h">Por que o ACC não ativa?</h2>
      <p className={`verdict ${missing.length === 0 ? "verdict-ok" : "verdict-bad"}`} aria-live="polite">
        {missing.length === 0
          ? "Tudo certo: aperte SET– para gravar a velocidade."
          : `Falta ${missing.length === 1 ? "1 condição" : `${missing.length} condições`}: ${missing[0].label.toLowerCase()}${missing.length > 1 ? " e mais" : ""}.`}
      </p>
      <ul>
        {rows.map((r) => (
          <li key={r.id} className={r.ok ? "ok" : "bad"}>
            <Mark ok={r.ok} />
            <span>{r.label}</span>
          </li>
        ))}
      </ul>
      <p className="state-line">{modeText[s.acc.mode]}</p>
    </section>
  );
}

export function Explainer({ id }: { id: string }) {
  const f = FEATURES[id] ?? FEATURES.acc;
  return (
    <section className="panel explainer" aria-labelledby="exp-h" aria-live="polite">
      <p className="kind">
        {f.kind}
        {f.maxDriveOnly ? ", só na versão Max Drive" : ""}
      </p>
      <h2 id="exp-h">{f.title}</h2>
      <p className="summary">{f.summary}</p>
      {f.how?.length ? (
        <>
          <h3>Como usar</h3>
          <ul className="bullets">
            {f.how.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      ) : null}
      {f.limits?.length ? (
        <>
          <h3>Limites e cuidados</h3>
          <ul className="bullets">
            {f.limits.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </>
      ) : null}
      <p className="source">Confira no original: {f.source}.</p>
    </section>
  );
}
