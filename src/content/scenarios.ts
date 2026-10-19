import { createInitialState } from "../engine/engine";
import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";

/**
 * Cenários guiados. Cada um monta uma situação pronta e lista passos que se
 * completam sozinhos quando você faz o que foi pedido.
 * Textos originais. Valores de velocidade vêm do manual (veja features.ts).
 */

export interface Step {
  id: string;
  text: string;
  /** Dica curta de onde clicar */
  hint?: string;
  done: (s: SimState, d: Derived) => boolean;
}

export interface Scenario {
  id: string;
  title: string;
  /** Uma frase: o que você vai ver */
  blurb: string;
  /** O que você leva dali */
  learn: string[];
  /** Explicação que abre ao escolher o cenário */
  focus: string;
  build: () => SimState;
  steps: Step[];
}

function drive(patch: Partial<SimState> = {}): SimState {
  return {
    ...createInitialState(true),
    ignitionOn: true,
    gear: "D",
    parkingBrake: false,
    ...patch,
  };
}

export const SCENARIOS: Scenario[] = [
  {
    id: "basics",
    title: "Primeiros passos",
    blurb: "Ligue o carro, engate o câmbio e ande. Aprenda a usar os pedais do simulador.",
    learn: ["Os pedais funcionam enquanto você segura o botão.", "Para andar, o freio de estacionamento precisa estar solto."],
    focus: "epb",
    build: () => createInitialState(true),
    steps: [
      { id: "on", text: "Toque em Ligar.", hint: "Painel à esquerda.", done: (s) => s.ignitionOn },
      { id: "gear", text: "Engate o câmbio em D.", hint: "Câmbio, à esquerda.", done: (s) => s.gear === "D" },
      {
        id: "epb",
        text: "Solte o freio de estacionamento.",
        hint: "Console e pedais, botão Freio de estacionamento.",
        done: (s) => !s.parkingBrake,
      },
      {
        id: "go",
        text: "Segure Acelerador até chegar a 60 km/h.",
        hint: "Segure o botão, não só toque.",
        done: (s) => s.speed >= 60,
      },
      {
        id: "stop",
        text: "Segure Freio até parar.",
        done: (s) => s.speed < 1,
      },
    ],
  },
  {
    id: "acc",
    title: "ACC: seguir o carro da frente",
    blurb: "Você a 90 km/h, um carro mais lento à frente. O piloto automático adaptativo cuida da distância.",
    learn: [
      "O ACC reduz sozinho para acompanhar o carro da frente.",
      "Pisar no freio interrompe; RES+ retoma.",
      "A distância de seguimento tem três níveis.",
    ],
    focus: "acc",
    build: () => drive({ speed: 90, target: { kind: "movingVehicle", distance: 95, speed: 60 } }),
    steps: [
      { id: "power", text: "Aperte ACC no volante.", hint: "Painel Volante.", done: (s) => s.acc.mode !== "off" },
      {
        id: "set",
        text: "Aperte SET– para gravar a velocidade atual.",
        hint: "O carro precisa estar entre 30 e 150 km/h.",
        done: (s) => s.acc.mode === "active",
      },
      {
        id: "follow",
        text: "Espere: o carro reduz sozinho para acompanhar o da frente.",
        hint: "Olhe a cena 3D: o carro verde é o alvo seguido.",
        done: (s, d) => d.following && s.speed < 75,
      },
      {
        id: "gap",
        text: "Aperte Distância para trocar o nível de seguimento.",
        hint: "Veja a linha verde no chão mudar de lugar.",
        done: (s) => s.acc.gap !== 2,
      },
      {
        id: "lead",
        text: "Aumente a velocidade do carro da frente para mais de 95 km/h.",
        hint: "Painel à esquerda, grupo O que há à frente.",
        done: (s) => s.target.speed >= 95,
      },
      {
        id: "brake",
        text: "Segure Freio por um instante: o ACC interrompe.",
        done: (s) => s.acc.mode === "suspended",
      },
      {
        id: "resume",
        text: "Solte o freio e aperte RES+ para retomar.",
        done: (s) => s.acc.mode === "active",
      },
    ],
  },
  {
    id: "why-not",
    title: "Por que o ACC não ativa?",
    blurb: "O ACC está em espera, mas algo impede a ativação. Descubra o quê e resolva.",
    learn: ["O ACC exige 8 condições ao mesmo tempo.", "A lista à direita mostra qual está faltando."],
    focus: "acc",
    build: () => {
      const s = drive({ speed: 90, seatbelt: false, doorClosed: false, hdc: true });
      return { ...s, acc: { ...s.acc, mode: "standby" } };
    },
    steps: [
      {
        id: "belt",
        text: "Afivele o cinto de segurança.",
        hint: "Painel à esquerda, Condições do motorista.",
        done: (s) => s.seatbelt,
      },
      { id: "door", text: "Feche a porta do motorista.", done: (s) => s.doorClosed },
      {
        id: "hdc",
        text: "Desligue o HDC.",
        hint: "Console e pedais.",
        done: (s) => !s.hdc,
      },
      {
        id: "set",
        text: "Agora aperte SET–: o ACC ativa.",
        done: (s) => s.acc.mode === "active",
      },
    ],
  },
  {
    id: "limit",
    title: "Limitador de velocidade",
    blurb: "Fixe um teto de velocidade. O carro não passa dele, a não ser que você pise a fundo.",
    learn: ["O limitador não acompanha o carro da frente.", "Acelerador a fundo ultrapassa o limite."],
    focus: "limit",
    build: () => drive({ speed: 50 }),
    steps: [
      { id: "limit", text: "Aperte LIMIT no volante.", done: (s) => s.limit.mode !== "off" },
      { id: "set", text: "Aperte SET– para gravar a velocidade atual.", done: (s) => s.limit.mode === "active" },
      {
        id: "cap",
        text: "Segure Acelerador: o carro sobe até o limite e para.",
        done: (s) => s.accel > 0 && s.speed >= s.limit.value - 1,
      },
      {
        id: "override",
        text: "Segure A fundo para ultrapassar o limite.",
        done: (s) => s.accel === 2 && s.speed > s.limit.value + 3,
      },
    ],
  },
  {
    id: "aeb-static",
    title: "AEB: carro parado à frente",
    blurb: "Você a 45 km/h, um carro parado à frente. Veja o alarme e a frenagem automática.",
    learn: ["Primeiro soa o alarme, depois o carro freia sozinho.", "Você continua responsável: o AEB só reduz o risco."],
    focus: "aeb",
    build: () => drive({ speed: 45, target: { kind: "staticVehicle", distance: 70, speed: 0 } }),
    steps: [
      {
        id: "warn",
        text: "Não faça nada. Espere o alarme de colisão.",
        hint: "Não toque nos pedais.",
        done: (s) => s.aeb !== "idle" || s.collided,
      },
      {
        id: "brake",
        text: "Veja o AEB frear sozinho.",
        done: (s) => s.aeb === "partial" || s.aeb === "emergency",
      },
      {
        id: "stop",
        text: "O carro para antes de bater.",
        done: (s) => s.speed < 1 && !s.collided && s.aebStopped,
      },
    ],
  },
  {
    id: "aeb-limit",
    title: "AEB: rápido demais",
    blurb: "A 70 km/h o AEB não atua em carro parado. Veja por que e como o limite funciona.",
    learn: ["Para carro parado, o AEB frea até 53 km/h.", "Acima disso, só o alarme soa."],
    focus: "aeb",
    build: () => drive({ speed: 70, target: { kind: "staticVehicle", distance: 110, speed: 0 } }),
    steps: [
      {
        id: "warn",
        text: "Espere o alarme. O AEB ainda não freia: você está acima de 53 km/h.",
        done: (s) => s.aeb === "warn",
      },
      {
        id: "slow",
        text: "Segure Freio até ficar abaixo de 53 km/h.",
        done: (s) => s.speed < 53,
      },
      {
        id: "release",
        text: "Solte o freio. Agora o AEB está na faixa e age.",
        done: (s) => s.aeb === "partial" || s.aeb === "emergency",
      },
    ],
  },
  {
    id: "pedestrian",
    title: "Pedestre na pista",
    blurb: "Uma pessoa atravessa à frente. O AEB reconhece pedestres e ciclistas.",
    learn: ["Para pedestres, o AEB atua de 4 a 64 km/h.", "O ACC não enxerga pedestres."],
    focus: "aeb",
    build: () => drive({ speed: 40, target: { kind: "pedestrian", distance: 60, speed: 0 } }),
    steps: [
      { id: "warn", text: "Não faça nada. Espere o alarme.", done: (s) => s.aeb !== "idle" || s.collided },
      {
        id: "brake",
        text: "Veja o AEB frear.",
        done: (s) => s.aeb === "partial" || s.aeb === "emergency",
      },
      { id: "stop", text: "O carro para antes do pedestre.", done: (s) => s.speed < 1 && !s.collided },
    ],
  },
  {
    id: "blind",
    title: "Ponto cego e seta",
    blurb: "Um carro ao lado, no ponto cego. Veja os dois níveis de alerta.",
    learn: ["Nível 1: luz acesa no retrovisor.", "Nível 2: luz piscando e alarme, se você ligar a seta daquele lado."],
    focus: "bsd",
    build: () => drive({ speed: 70 }),
    steps: [
      {
        id: "car",
        text: "Ative Carro no ponto cego esquerdo.",
        hint: "Painel à esquerda, grupo Ao redor do carro.",
        done: (s) => s.blind.left,
      },
      { id: "l1", text: "Veja a luz do retrovisor esquerdo acender (nível 1).", done: (_s, d) => d.bsdWarn.left === 1 },
      { id: "turn", text: "Ligue a Seta esquerda.", hint: "Haste de luzes e setas.", done: (s) => s.turnSignal === "left" },
      { id: "l2", text: "Veja o nível 2: a luz pisca e soa o alarme.", done: (_s, d) => d.bsdWarn.left === 2 },
      {
        id: "slow",
        text: "Reduza abaixo de 10 km/h: o monitor desliga.",
        hint: "Use o controle de velocidade.",
        done: (s) => s.bsd === "off",
      },
    ],
  },
  {
    id: "ldw",
    title: "Saída de faixa (LDW)",
    blurb: "O carro cruza a linha sem seta. O LDW avisa, mas não gira o volante.",
    learn: ["O LDW ativa acima de 65 km/h.", "Com a seta ligada, ele entende que é de propósito."],
    focus: "ldw",
    build: () => drive({ speed: 90 }),
    steps: [
      {
        id: "drift",
        text: "Ative Saindo da faixa sem seta.",
        hint: "Painel à esquerda, grupo Ao redor do carro.",
        done: (s) => s.laneDeparture,
      },
      { id: "warn", text: "Veja o aviso e a luz âmbar piscando.", done: (_s, d) => d.ldwWarn },
      {
        id: "turn",
        text: "Ligue uma seta: o aviso se cala.",
        done: (s, d) => s.turnSignal !== "none" && !d.ldwWarn,
      },
      { id: "slow", text: "Reduza abaixo de 60 km/h: o LDW desliga.", done: (s) => s.ldw === "off" },
    ],
  },
  {
    id: "ihc",
    title: "Farol alto automático",
    blurb: "Estrada escura à noite. O farol alto liga e apaga sozinho.",
    learn: ["Ativo acima de 40 km/h, só em via escura.", "Carro vindo de frente ou luz na via apagam o farol alto."],
    focus: "ihc",
    build: () => drive({ speed: 70, night: true }),
    steps: [
      { id: "push", text: "Toque em Empurrar a haste.", hint: "Haste de luzes e setas.", done: (s) => s.ihcRequested },
      { id: "on", text: "Veja o farol alto ligar sozinho.", done: (_s, d) => d.highBeam },
      {
        id: "oncoming",
        text: "Ative Carro vindo em sentido contrário.",
        hint: "Painel à esquerda, grupo Ao redor do carro.",
        done: (s, d) => s.oncoming && !d.highBeam,
      },
      {
        id: "lit",
        text: "Desative o carro vindo e ative Via iluminada: o farol alto continua apagado.",
        done: (s, d) => s.roadLit && !s.oncoming && !d.highBeam,
      },
    ],
  },
  {
    id: "reverse",
    title: "Ré com tráfego cruzado",
    blurb: "Saindo de uma vaga de ré. A câmera abre sozinha e o radar avisa de carros pelo lado.",
    learn: ["Em marcha à ré, o RCTA vigia os dois lados.", "A câmera 360° abre abaixo de 20 km/h."],
    focus: "rcta",
    build: () => ({ ...drive({ speed: 0 }), gear: "P" }),
    steps: [
      { id: "r", text: "Engate o câmbio em R.", done: (s) => s.gear === "R" },
      { id: "cam", text: "Veja a câmera 360° abrir sozinha.", done: (s) => s.avmOn },
      {
        id: "cross",
        text: "Ative Carro cruzando atrás, à esquerda.",
        hint: "Painel à esquerda, grupo Ao redor do carro.",
        done: (s) => s.cross.left,
      },
      { id: "alarm", text: "Veja o alarme do RCTA.", done: (_s, d) => d.rctaWarn.left },
    ],
  },
];

export const SCENARIO_BY_ID: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
