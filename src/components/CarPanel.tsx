import type { Dispatch } from "react";
import type { Action, FaultKey, SimState, TargetKind } from "../engine/types";
import { Group, Segmented, Slider, Switch } from "./ui";

interface Props {
  state: SimState;
  dispatch: Dispatch<Action>;
  select: (id: string) => void;
}

const KINDS: { value: TargetKind; label: string }[] = [
  { value: "none", label: "Nenhum" },
  { value: "movingVehicle", label: "Carro andando" },
  { value: "staticVehicle", label: "Carro parado" },
  { value: "pedestrian", label: "Pedestre" },
];

const FAULTS: { key: FaultKey; label: string }[] = [
  { key: "acc", label: "ACC" },
  { key: "aeb", label: "AEB" },
  { key: "ldw", label: "LDW" },
  { key: "bsd", label: "BSD" },
  { key: "ihc", label: "Farol alto inteligente" },
];

export function CarPanel({ state: s, dispatch, select }: Props) {
  const set = (key: keyof SimState, value: unknown) => dispatch({ type: "set", key, value });

  return (
    <aside className="panel car" aria-label="Controles do carro e do cenário">
      <div className="car-top">
        <button
          type="button"
          className={`start ${s.ignitionOn ? "start-on" : ""}`}
          onClick={() => dispatch({ type: "ignition" })}
          aria-pressed={s.ignitionOn}
        >
          {s.ignitionOn ? "Desligar" : "Ligar"}
        </button>
        <Segmented
          label="Câmbio"
          value={s.gear}
          options={[
            { value: "P", label: "P" },
            { value: "R", label: "R" },
            { value: "N", label: "N" },
            { value: "D", label: "D" },
          ]}
          onChange={(gear) => dispatch({ type: "gear", gear })}
        />
      </div>

      <Switch label="Cena noturna" checked={s.night} onChange={(v) => set("night", v)} onFocusId={() => select("ihc")} />

      <Slider label="Velocidade" value={s.speed} min={0} max={200} unit="km/h" onChange={(v) => set("speed", v)} />

      <Segmented
        label="Versão do carro"
        value={s.hasMaxDrive ? "md" : "base"}
        options={[
          { value: "md", label: "Com Max Drive" },
          { value: "base", label: "Sem Max Drive" },
        ]}
        onChange={(v) => dispatch({ type: "variant", hasMaxDrive: v === "md" })}
      />

      <Group title="Condições do motorista" open>
        <Switch label="Cinto afivelado" checked={s.seatbelt} onChange={(v) => set("seatbelt", v)} onFocusId={() => select("tt_belt")} />
        <Switch label="Porta do motorista fechada" checked={s.doorClosed} onChange={(v) => set("doorClosed", v)} onFocusId={() => select("tt_door")} />
        <Switch label="ABS atuando" checked={s.absActive} onChange={(v) => set("absActive", v)} onFocusId={() => select("acc")} />
        <Switch label="Volante girado bruscamente" checked={s.evasiveSteer} onChange={(v) => set("evasiveSteer", v)} onFocusId={() => select("aeb")} />
      </Group>

      <Group title="O que há à frente" open>
        <Segmented label="Alvo à frente" value={s.target.kind} options={KINDS} onChange={(kind) => dispatch({ type: "target", target: { kind } })} />
        <Slider label="Distância" value={s.target.distance} min={2} max={150} unit="m" onChange={(distance) => dispatch({ type: "target", target: { distance } })} />
        {s.target.kind === "movingVehicle" ? (
          <Slider label="Velocidade do carro da frente" value={s.target.speed} min={0} max={120} unit="km/h" onChange={(speed) => dispatch({ type: "target", target: { speed } })} />
        ) : null}
        <button type="button" className="ghost" onClick={() => dispatch({ type: "resetTarget" })}>
          Reiniciar cenário
        </button>
      </Group>

      <Group title="Ao redor do carro" open>
        <Switch label="Carro no ponto cego esquerdo" checked={s.blind.left} onChange={(v) => set("blind", { ...s.blind, left: v })} onFocusId={() => select("bsd")} />
        <Switch label="Carro no ponto cego direito" checked={s.blind.right} onChange={(v) => set("blind", { ...s.blind, right: v })} onFocusId={() => select("bsd")} />
        <Switch label="Carro cruzando atrás, à esquerda" checked={s.cross.left} onChange={(v) => set("cross", { ...s.cross, left: v })} onFocusId={() => select("rcta")} />
        <Switch label="Carro cruzando atrás, à direita" checked={s.cross.right} onChange={(v) => set("cross", { ...s.cross, right: v })} onFocusId={() => select("rcta")} />
        <Switch label="Saindo da faixa sem seta" checked={s.laneDeparture} onChange={(v) => set("lateral", v ? -1.05 : 0)} onFocusId={() => select("ldw")} />
        <Switch label="Via iluminada" checked={s.roadLit} onChange={(v) => set("roadLit", v)} onFocusId={() => select("ihc")} />
        <Switch label="Carro vindo em sentido contrário" checked={s.oncoming} onChange={(v) => set("oncoming", v)} onFocusId={() => select("ihc")} />
      </Group>

      <Group title="Menu do multimídia (Condução assistida)">
        <Switch label="Monitor de ponto cego" checked={s.settings.bsd} onChange={(v) => dispatch({ type: "setting", key: "bsd", value: v })} onFocusId={() => select("settings")} />
        <Switch label="Alerta de distância frontal" checked={s.settings.fdm} onChange={(v) => dispatch({ type: "setting", key: "fdm", value: v })} onFocusId={() => select("fdm")} />
        <Switch label="AEB e alerta de colisão" checked={s.settings.aeb} onChange={(v) => dispatch({ type: "setting", key: "aeb", value: v })} onFocusId={() => select("aeb")} />
        <div onPointerEnter={() => select("fcw")}>
          <span className="field-label">Sensibilidade do alerta de colisão</span>
          <Segmented
            label="Sensibilidade do alerta de colisão"
            value={s.settings.fcwSensitivity}
            options={[
              { value: "low", label: "Baixa" },
              { value: "standard", label: "Padrão" },
              { value: "high", label: "Alta" },
            ]}
            onChange={(v) => dispatch({ type: "setting", key: "fcwSensitivity", value: v })}
          />
        </div>
        <Switch label="Farol alto inteligente" checked={s.settings.ihc} onChange={(v) => dispatch({ type: "setting", key: "ihc", value: v })} onFocusId={() => select("ihc")} />
        <Switch label="Câmera 360° abre com a seta" checked={s.settings.avmOnSignal} onChange={(v) => dispatch({ type: "setting", key: "avmOnSignal", value: v })} onFocusId={() => select("avm")} />
        <Switch label="Câmera 360° abre ao girar o volante" checked={s.settings.avmOnSteer} onChange={(v) => dispatch({ type: "setting", key: "avmOnSteer", value: v })} onFocusId={() => select("avm")} />
      </Group>

      <Group title="Simular uma falha">
        {FAULTS.map((f) => (
          <Switch key={f.key} label={`Falha no ${f.label}`} checked={s.faults[f.key]} onChange={(v) => dispatch({ type: "fault", key: f.key, value: v })} />
        ))}
      </Group>
    </aside>
  );
}
