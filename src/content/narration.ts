import { assessAeb, LIMITS } from "../engine/engine";
import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";
import { ACC_CONDITION_LABELS } from "./features";

export type Tone = "ok" | "info" | "warn" | "alert";
export interface Line {
  id: string;
  tone: Tone;
  text: string;
}

const kmh = (n: number) => `${Math.round(n)} km/h`;

/**
 * Traduz o estado do simulador em frases simples: "o que está acontecendo agora".
 * Texto original, sem trechos do manual.
 */
export function narrate(s: SimState, d: Derived): Line[] {
  const out: Line[] = [];
  const push = (id: string, tone: Tone, text: string) => out.push({ id, tone, text });

  if (!s.ignitionOn) {
    push("car", "info", "O carro está desligado. Toque em Ligar para começar.");
    return out;
  }
  if (!s.hasMaxDrive) {
    push("md", "info", "Esta versão não tem o pacote Max Drive. ACC, AEB, LDW, ponto cego e farol alto inteligente não existem.");
    return out;
  }
  if (!s.esp) {
    push("esp", "warn", "ESP desligado: todos os assistentes ficam inoperantes até você religá-lo.");
    return out;
  }

  push(
    "car",
    "info",
    s.speed < 1
      ? `Parado, câmbio em ${s.gear}${s.parkingBrake ? ", freio de estacionamento aplicado" : ""}.`
      : `Andando a ${kmh(s.speed)}, câmbio em ${s.gear}.`,
  );

  /* Colisão e AEB primeiro: é o que mais importa */
  const aeb = assessAeb(s);
  if (s.collided) {
    push("aeb", "alert", "Colisão simulada. Use Reiniciar cenário para tentar de novo.");
  } else if (s.aeb === "emergency") {
    push("aeb", "alert", "AEB freando com força: o carro percebeu que você não ia conseguir parar a tempo.");
  } else if (s.aeb === "partial") {
    push("aeb", "alert", "AEB iniciou a frenagem parcial. Se você não agir, ele freia mais forte.");
  } else if (aeb.stage === "warn") {
    push("aeb", "alert", "Alerta de colisão: freie ou desvie. O alarme soa antes de o carro frear sozinho.");
  } else if (s.target.kind !== "none" && s.speed > 1) {
    const t = s.target;
    const range =
      t.kind === "staticVehicle" ? LIMITS.aebStaticMax : t.kind === "movingVehicle" ? LIMITS.aebMovingMax : LIMITS.aebPedestrianMax;
    if (s.speed > range) {
      push(
        "aeb",
        "warn",
        `Você está a ${kmh(s.speed)}, acima de ${range} km/h. Para este tipo de alvo, o AEB só freia abaixo disso.`,
      );
    }
  }
  if (s.aebStopped && s.speed === 0 && !s.collided) {
    push("aeb2", "warn", "O AEB parou o carro, mas ele não fica retido. Pise no freio para segurá-lo.");
  }
  if (d.fdmWarn && s.aeb === "idle") push("fdm", "warn", "Você está colado no carro da frente. Aumente a distância.");

  /* ACC e limitador */
  if (s.limit.mode === "active") {
    push(
      "acc",
      "ok",
      `Limitador ativo em ${s.limit.value} km/h. O carro não passa disso, a menos que você pise a fundo.`,
    );
  } else if (s.limit.mode === "standby") {
    push("acc", "info", "Limitador em espera. Aperte SET– para gravar a velocidade atual como limite.");
  } else if (s.acc.mode === "active") {
    if (d.following) {
      push(
        "acc",
        "ok",
        `ACC acompanhando o carro da frente a ${Math.round(s.target.distance)} m. Se ele acelerar, você volta aos ${s.acc.setSpeed} km/h.`,
      );
    } else if (s.target.kind === "staticVehicle" || s.target.kind === "pedestrian") {
      push(
        "acc",
        "warn",
        `ACC mantendo ${s.acc.setSpeed} km/h. Ele não enxerga obstáculo parado nem pedestre: quem protege é o AEB.`,
      );
    } else {
      push("acc", "ok", `ACC ativo, mantendo ${s.acc.setSpeed} km/h. Sem carro à frente.`);
    }
  } else if (s.acc.mode === "suspended") {
    push("acc", "info", `ACC interrompido. Aperte RES+ para retomar os ${s.acc.setSpeed} km/h.`);
  } else if (s.acc.mode === "standby") {
    const missing = d.conditions.find((c) => !c.ok);
    if (missing) {
      push("acc", "warn", `ACC em espera, mas não ativa: falta "${ACC_CONDITION_LABELS[missing.id].toLowerCase()}".`);
    } else if (s.speed < LIMITS.accMin) {
      push("acc", "info", `ACC em espera. Chegue a ${LIMITS.accMin} km/h ou mais e aperte SET–.`);
    } else if (s.speed > LIMITS.accMax) {
      push("acc", "info", `ACC em espera. Acima de ${LIMITS.accMax} km/h ele não ativa.`);
    } else {
      push("acc", "info", "ACC em espera. Aperte SET– para gravar a velocidade atual.");
    }
  } else {
    push("acc", "info", "ACC desligado. Aperte o botão ACC no volante para colocá-lo em espera.");
  }
  if (s.acc.arm > 0) push("arm", "info", "Solte o freio agora: o ACC parte com 30 km/h programados.");
  if (s.acc.arm < 0) push("arm", "info", "Passou de 3 segundos. Solte o freio e toque de leve no acelerador.");

  /* LDW */
  if (d.ldwWarn) {
    push("ldw", "warn", "Saída de faixa sem seta. O LDW avisa, mas não corrige a direção.");
  } else if (s.ldw === "active") {
    push("ldw", "ok", "LDW ativo: avisa se você cruzar a linha sem ligar a seta.");
  } else if (s.ldw === "standby") {
    push("ldw", "info", `LDW em espera: desliga abaixo de ${LIMITS.ldwOff} km/h.`);
  } else {
    push("ldw", "info", `LDW desligado. Ele ativa a partir de ${LIMITS.ldwOn} km/h.`);
  }

  /* Ponto cego e ré */
  const lvl = Math.max(d.bsdWarn.left, d.bsdWarn.right);
  if (lvl === 2) {
    push("bsd", "alert", "Ponto cego, nível 2: você ligou a seta para o lado ocupado. A luz pisca e soa o alarme.");
  } else if (lvl === 1) {
    push("bsd", "warn", "Ponto cego, nível 1: há um carro ao lado. A luz do retrovisor acende.");
  } else if (s.bsd === "active") {
    push("bsd", "ok", "Monitor de ponto cego ativo. Nenhum carro ao lado.");
  } else if (s.bsd === "standby") {
    push("bsd", "info", `Ponto cego em espera: desliga abaixo de ${LIMITS.bsdOff} km/h.`);
  } else if (!s.settings.bsd) {
    push("bsd", "info", "Ponto cego desligado no menu do multimídia.");
  } else {
    push("bsd", "info", `Ponto cego desligado. Ele ativa a partir de ${LIMITS.bsdOn} km/h.`);
  }
  if (d.rctaWarn.left || d.rctaWarn.right) {
    push("rcta", "alert", "Tráfego cruzado: vem carro pelo lado atrás de você. Pare.");
  }

  /* Farol alto */
  if (s.lightAuto && s.ihcRequested && s.settings.ihc) {
    if (d.highBeam) push("ihc", "ok", "Farol alto ligado automaticamente: a via está escura e sem carros.");
    else if (s.roadLit) push("ihc", "info", "Farol alto apagado: a via tem iluminação.");
    else if (s.oncoming) push("ihc", "info", "Farol alto apagado: vem um carro em sentido contrário.");
    else if (s.speed <= LIMITS.ihcOn) push("ihc", "info", `Farol alto automático espera: ele só liga acima de ${LIMITS.ihcOn} km/h.`);
    else if (s.turnSignal !== "none") push("ihc", "info", "Farol alto automático pausado: a seta está ligada.");
  }

  /* Câmera */
  if (s.avmOn) push("avm", "info", "Câmera 360° aberta. Ela fecha sozinha acima de 30 km/h.");

  return out;
}
