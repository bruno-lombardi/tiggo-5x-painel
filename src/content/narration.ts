import { assessAeb, inPath, LIMITS } from "../engine/engine";
import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";
import { nextCurve, SERRA_LIMIT } from "../engine/route";
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
    push("car", "info", "O carro está desligado. Ligue-o para começar.");
    return out;
  }
  if (s.world === "serra") serraLines(s, push);
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
    push("aeb", "alert", "Colisão simulada. O carro parou; aguarde a pista liberar e tente de novo.");
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
  const tg = s.target;
  if (tg.kind !== "none" && tg.distance > 0 && !s.collided) {
    const what = tg.kind === "pedestrian" ? "Pedestre" : tg.kind === "staticVehicle" ? "Carro parado" : "Carro andando";
    if (!inPath(s)) {
      push("ahead", "info", `${what} na outra faixa, a ${Math.round(tg.distance)} m. Você não está na trajetória dele.`);
    } else if (s.aeb === "idle" && !d.following) {
      push(
        "ahead",
        "info",
        tg.kind === "movingVehicle"
          ? `Carro à frente, a ${Math.round(tg.distance)} m, a ${kmh(tg.speed)}.`
          : `${what} na sua faixa, a ${Math.round(tg.distance)} m. Freie ou troque de faixa (seta + volante).`,
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

/** Frases próprias da Serra: curvas, aderência, faixa contrária e batidas. */
function serraLines(s: SimState, push: (id: string, tone: Tone, text: string) => void) {
  if (s.crashKind === "barrier") {
    push("crash", "alert", "Você saiu da pista e bateu na lateral. Na serra não há espaço de sobra: reduza antes da curva. O carro volta ao meio da faixa em instantes.");
    return;
  }
  if (s.crashKind === "traffic") {
    push("crash", "alert", "Colisão com um carro que vinha em sentido contrário. Na pista simples, ficar na sua faixa é a regra número um.");
    return;
  }
  if (s.route.finished) {
    push("end", "ok", "Você chegou ao fim do trajeto. Veja o resumo na tela.");
  }
  if (s.espActive) {
    push("esp-act", "warn", "O ESP atuou: você entrou rápido demais na curva e o sistema freia rodas para segurar a trajetória. Alivie o acelerador antes da próxima.");
  } else if (s.absActive) {
    push("abs", "info", "ABS atuando: a frenagem foi tão forte que as rodas quase travaram. O pedal vibra e você mantém o controle da direção.");
  }
  const c = nextCurve(s.world, s.route.s, 170);
  if (c && s.route.s < c.end) {
    const dist = Math.max(0, Math.round(c.start - s.route.s));
    const side = c.dir > 0 ? "à esquerda" : "à direita";
    const over = s.speed > c.advised + 8;
    push(
      "curve",
      over ? "warn" : "info",
      dist > 0
        ? `Curva ${side} em ${dist} m. Velocidade sugerida na placa: ${c.advised} km/h${over ? ". Você está acima: tire o pé agora." : "."}`
        : `Dentro da curva ${side}. Velocidade sugerida: ${c.advised} km/h${over ? ". Você está acima: o ESP pode atuar." : "."}`,
    );
  }
  if (s.lateral < -1.3 && s.speed > 5) {
    push("lane", "warn", "Você está invadindo a faixa do sentido contrário. Volte para a sua.");
  } else if (s.oncomingList.some((o) => o.d > 0 && o.d < 160)) {
    push("onc", "info", "Carro vindo de frente. Mantenha-se no meio da sua faixa e não ultrapasse.");
  }
  if (s.speed > SERRA_LIMIT + 3) {
    push("limit", "warn", `Você está a ${Math.round(s.speed)} km/h. O limite sugerido neste trecho é ${SERRA_LIMIT} km/h (valor ilustrativo).`);
  }
}
