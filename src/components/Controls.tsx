import type { Dispatch } from "react";
import type { Action, SimState } from "../engine/types";
import { PressButton } from "./ui";

interface Props {
  state: SimState;
  dispatch: Dispatch<Action>;
  select: (id: string) => void;
}

/** Volante: botões do ACC e do limitador. A posição dos botões é ilustrativa. */
export function WheelPanel({ state: s, dispatch, select }: Props) {
  return (
    <section className="panel wheel" aria-labelledby="wheel-h">
      <h2 id="wheel-h">Volante</h2>
      <div className="wheel-art" role="group" aria-label="Botões do volante">
        <svg className="wheel-ring" viewBox="0 0 320 180" aria-hidden="true">
          <path d="M20 150 C20 60 90 12 160 12 C230 12 300 60 300 150" className="wheel-rim" />
          <rect x="132" y="96" width="56" height="62" rx="14" className="wheel-hub" />
        </svg>
        <div className="pod pod-left">
          <PressButton
            className="key"
            onFocusId={() => select("limit")}
            onShort={() => dispatch({ type: "limitToggle" })}
            pressed={s.limit.mode !== "off"}
          >
            LIMIT
          </PressButton>
          <PressButton className="key" onFocusId={() => select("accCancel")} onShort={() => dispatch({ type: "accCancel" })}>
            Cancelar
          </PressButton>
          <PressButton
            className="key key-main"
            onFocusId={() => select("accPower")}
            onShort={() => dispatch({ type: "accPower" })}
            pressed={s.acc.mode !== "off"}
          >
            ACC
          </PressButton>
        </div>
        <div className="pod pod-right">
          <PressButton
            className="key"
            onFocusId={() => select("accRes")}
            onShort={() => dispatch({ type: "resButton", long: false })}
            onLong={() => dispatch({ type: "resButton", long: true })}
          >
            RES+
          </PressButton>
          <PressButton
            className="key"
            onFocusId={() => select("accSet")}
            onShort={() => dispatch({ type: "setButton", long: false })}
            onLong={() => dispatch({ type: "setButton", long: true })}
          >
            SET–
          </PressButton>
          <PressButton className="key" onFocusId={() => select("accGap")} onShort={() => dispatch({ type: "accGap" })}>
            Distância
          </PressButton>
        </div>
      </div>
      <p className="note">
        Toque curto muda 1 km/h. Segure RES+ ou SET– para mudar de 5 em 5 (de 10 em 10 acima de 80 km/h). Disposição ilustrativa.
      </p>
      <div className="row">
        <PressButton
          className="chip"
          onFocusId={() => select("acc")}
          onShort={() => dispatch({ type: "accSetFromStop" })}
          title="Com o carro parado e o pé no freio, aperte; depois solte o freio em até 3 segundos"
        >
          SET– parado (pé no freio)
        </PressButton>
      </div>
    </section>
  );
}

/** Haste de luzes e setas. */
export function StalkPanel({ state: s, dispatch, select }: Props) {
  return (
    <section className="panel stalk" aria-labelledby="stalk-h">
      <h2 id="stalk-h">Haste de luzes e setas</h2>
      <div className="row wrap">
        <PressButton
          className="chip"
          pressed={s.turnSignal === "left"}
          onFocusId={() => select("bsd")}
          onShort={() => dispatch({ type: "turn", side: "left" })}
        >
          Seta esquerda
        </PressButton>
        <PressButton
          className="chip"
          pressed={s.turnSignal === "right"}
          onFocusId={() => select("bsd")}
          onShort={() => dispatch({ type: "turn", side: "right" })}
        >
          Seta direita
        </PressButton>
        <PressButton
          className="chip"
          pressed={s.hazard}
          onFocusId={() => select("ldw")}
          onShort={() => dispatch({ type: "set", key: "hazard", value: !s.hazard })}
        >
          Pisca-alerta
        </PressButton>
      </div>
      <div className="row wrap">
        <PressButton
          className="chip"
          pressed={s.lightAuto}
          onFocusId={() => select("ihc")}
          onShort={() =>
            dispatch({ type: "set", key: "lightAuto", value: !s.lightAuto })
          }
        >
          Farol em AUTO
        </PressButton>
        <PressButton className="chip" onFocusId={() => select("ihc")} onShort={() => dispatch({ type: "ihcPush" })}>
          Empurrar a haste
        </PressButton>
        <PressButton className="chip" onFocusId={() => select("ihc")} onShort={() => dispatch({ type: "ihcPull" })}>
          Puxar a haste
        </PressButton>
      </div>
      <p className="note">Empurrar liga o farol alto automático. Puxar assume o controle e, puxando de novo, reativa.</p>
    </section>
  );
}

/** Console central e pedais. */
export function ConsolePanel({ state: s, dispatch, select }: Props) {
  return (
    <section className="panel console" aria-labelledby="console-h">
      <h2 id="console-h">Console e pedais</h2>
      <div className="row wrap">
        <PressButton
          className="chip"
          pressed={s.hdc}
          onFocusId={() => select("hdc")}
          onShort={() => dispatch({ type: "set", key: "hdc", value: !s.hdc })}
        >
          HDC
        </PressButton>
        <PressButton
          className="chip"
          pressed={!s.esp}
          onFocusId={() => select("esp")}
          onShort={() => dispatch({ type: "set", key: "esp", value: !s.esp })}
        >
          ESP OFF
        </PressButton>
        <PressButton
          className="chip"
          pressed={s.avmManual}
          onFocusId={() => select("avm")}
          onShort={() => dispatch({ type: "avmButton" })}
        >
          Câmera 360°
        </PressButton>
        <PressButton
          className="chip"
          pressed={s.parkingBrake}
          onFocusId={() => select("epb")}
          onShort={() => dispatch({ type: "set", key: "parkingBrake", value: !s.parkingBrake })}
        >
          Freio de estacionamento
        </PressButton>
      </div>
      <div className="pedals" role="group" aria-label="Pedais (segure)">
        <PressButton
          className="pedal pedal-brake"
          onFocusId={() => select("accCancel")}
          onDown={() => dispatch({ type: "brake", down: true })}
          onUp={() => dispatch({ type: "brake", down: false })}
          ariaLabel="Freio (segure)"
        >
          Freio
        </PressButton>
        <PressButton
          className="pedal"
          onFocusId={() => select("acc")}
          onDown={() => dispatch({ type: "accel", level: 1 })}
          onUp={() => dispatch({ type: "accel", level: 0 })}
          ariaLabel="Acelerador (segure)"
        >
          Acelerador
        </PressButton>
        <PressButton
          className="pedal pedal-full"
          onFocusId={() => select("limit")}
          onDown={() => dispatch({ type: "accel", level: 2 })}
          onUp={() => dispatch({ type: "accel", level: 0 })}
          ariaLabel="Acelerador a fundo (segure)"
        >
          A fundo
        </PressButton>
      </div>
      <p className="note">Os pedais funcionam enquanto você segura o botão.</p>
    </section>
  );
}
