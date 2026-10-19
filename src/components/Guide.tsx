import { narrate } from "../content/narration";
import { SCENARIOS } from "../content/scenarios";
import type { Scenario } from "../content/scenarios";
import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";

/** Linha de cenários: cada chip monta uma situação pronta. */
export function ScenarioBar(props: { activeId: string | null; onPick: (id: string | null) => void }) {
  return (
    <nav className="scenarios" aria-label="Situações para praticar">
      <span className="scenarios-title">Escolha uma situação</span>
      <div className="scenarios-list">
        <button
          type="button"
          className={`scn ${props.activeId === null ? "on" : ""}`}
          aria-pressed={props.activeId === null}
          onClick={() => props.onPick(null)}
        >
          Modo livre
        </button>
        {SCENARIOS.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`scn ${props.activeId === s.id ? "on" : ""}`}
            aria-pressed={props.activeId === s.id}
            onClick={() => props.onPick(s.id)}
            title={s.blurb}
          >
            {s.title}
          </button>
        ))}
      </div>
    </nav>
  );
}

function Check({ done }: { done: boolean }) {
  return (
    <svg className={`step-mark ${done ? "done" : ""}`} viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="8.5" />
      {done ? <path d="M5.8 10.4 8.6 13.2 14.2 7.2" /> : null}
    </svg>
  );
}

/** Passo a passo do cenário escolhido. */
export function Coach(props: {
  scenario: Scenario | null;
  progress: number;
  onRestart: () => void;
  onNext: () => void;
  onExplain: (id: string) => void;
}) {
  const sc = props.scenario;
  if (!sc) {
    return (
      <section className="panel coach coach-free" aria-labelledby="coach-h">
        <h2 id="coach-h">Como usar</h2>
        <ol className="how">
          <li>
            <strong>Escolha uma situação</strong> na barra acima. O simulador prepara tudo e mostra o que fazer.
          </li>
          <li>
            <strong>Siga os passos.</strong> Cada um se marca sozinho quando você faz o que foi pedido.
          </li>
          <li>
            <strong>Veja o resultado</strong> na cena 3D, no painel e na lista “O que está acontecendo”.
          </li>
        </ol>
        <p className="note">No modo livre, use os controles à esquerda para montar a sua própria situação.</p>
      </section>
    );
  }
  const finished = props.progress >= sc.steps.length;
  return (
    <section className="panel coach" aria-labelledby="coach-h">
      <div className="coach-head">
        <div>
          <p className="kind">Situação</p>
          <h2 id="coach-h">{sc.title}</h2>
          <p className="blurb">{sc.blurb}</p>
        </div>
        <div className="coach-actions">
          <button type="button" className="ghost" onClick={props.onRestart}>
            Reiniciar
          </button>
          <button type="button" className="ghost" onClick={() => props.onExplain(sc.focus)}>
            Ver explicação
          </button>
        </div>
      </div>
      <ol className="steps">
        {sc.steps.map((st, i) => {
          const state = i < props.progress ? "done" : i === props.progress ? "now" : "todo";
          return (
            <li key={st.id} className={`step step-${state}`} aria-current={state === "now" ? "step" : undefined}>
              <Check done={state === "done"} />
              <div>
                <p>{st.text}</p>
                {state === "now" && st.hint ? <p className="hint">{st.hint}</p> : null}
              </div>
            </li>
          );
        })}
      </ol>
      {finished ? (
        <div className="finish" role="status">
          <h3>Concluído. O que fica daqui:</h3>
          <ul className="bullets">
            {sc.learn.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <button type="button" className="primary" onClick={props.onNext}>
            Próxima situação
          </button>
        </div>
      ) : null}
    </section>
  );
}

/** Faixa curta com o passo atual, para ficar sempre à vista. */
export function NowStep(props: { scenario: Scenario | null; progress: number }) {
  const sc = props.scenario;
  if (!sc) return null;
  const st = sc.steps[props.progress];
  return (
    <p className={`now ${st ? "" : "now-done"}`} role="status">
      <span className="now-n">{st ? `Passo ${props.progress + 1} de ${sc.steps.length}` : "Concluído"}</span>
      {st ? st.text : "Veja o resumo no quadro da situação."}
    </p>
  );
}

const TONE_LABEL = { ok: "Ativo", info: "Info", warn: "Atenção", alert: "Alerta" } as const;

/** Lista, em palavras simples, o que o carro está fazendo agora. */
export function Feed({ state, derived }: { state: SimState; derived: Derived }) {
  const lines = narrate(state, derived);
  return (
    <section className="panel feed" aria-labelledby="feed-h">
      <h2 id="feed-h">O que está acontecendo</h2>
      <ul aria-live="polite">
        {lines.map((l) => (
          <li key={l.id} className={`feed-${l.tone}`}>
            <span className="feed-tag">{TONE_LABEL[l.tone]}</span>
            <span>{l.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
