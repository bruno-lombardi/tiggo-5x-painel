import { createInitialState } from "../engine/engine";
import type { Derived } from "../engine/engine";
import type { Action, SimState } from "../engine/types";

/**
 * Missões guiadas. Cada uma monta uma situação pronta e lista passos que se
 * completam sozinhos quando você faz o que foi pedido. Alguns passos fazem algo
 * acontecer na pista quando começam (`enter`), para você não precisar de painéis.
 * Textos originais. Velocidades vêm do manual (veja features.ts).
 */

export interface Step {
  id: string;
  text: string;
  /** Tecla sugerida (aparece como etiqueta) */
  key?: string;
  /** Dica curta */
  hint?: string;
  /** Ações disparadas quando o passo se torna o atual */
  enter?: Action[];
  done: (s: SimState, d: Derived) => boolean;
}

export interface Quiz {
  question: string;
  options: string[];
  answer: number;
  why: string;
}

export interface Scenario {
  id: string;
  title: string;
  /** Uma frase: o que você vai ver */
  blurb: string;
  /** O que você leva dali */
  learn: string[];
  /** Id da explicação em features.ts */
  focus: string;
  quiz: Quiz;
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
    blurb: "Ligue o carro, engate o câmbio e ande. Aprenda as teclas básicas.",
    learn: ["Os pedais funcionam enquanto você segura a tecla.", "Para andar, o freio de estacionamento precisa estar solto."],
    focus: "epb",
    quiz: {
      question: "O que precisa estar solto para o carro andar?",
      options: ["O freio de estacionamento", "O cinto de segurança", "O botão do ACC"],
      answer: 0,
      why: "O freio de estacionamento acende uma luz vermelha no painel e segura o carro parado. Solte antes de acelerar.",
    },
    build: () => createInitialState(true),
    steps: [
      { id: "on", text: "Ligue o carro.", key: "Enter", done: (s) => s.ignitionOn },
      { id: "gear", text: "Engate o câmbio em D.", key: "D", done: (s) => s.gear === "D" },
      { id: "epb", text: "Solte o freio de estacionamento.", key: "Espaço", done: (s) => !s.parkingBrake },
      { id: "go", text: "Segure o acelerador até chegar a 60 km/h.", key: "↑", done: (s) => s.speed >= 60 },
      { id: "stop", text: "Segure o freio até parar.", key: "↓", done: (s) => s.speed < 1 },
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
    quiz: {
      question: "O que acontece se você pisar no freio com o ACC ativo?",
      options: ["Nada, ele continua", "O ACC é interrompido e RES+ retoma", "O carro trava na velocidade atual"],
      answer: 1,
      why: "Pisar no freio sempre devolve o controle a você. O ACC fica em pausa e volta com RES+ se as condições estiverem certas.",
    },
    build: () => drive({ speed: 90, target: { kind: "movingVehicle", distance: 95, speed: 60, lane: 0 } }),
    steps: [
      { id: "power", text: "Ligue o ACC.", key: "A", done: (s) => s.acc.mode !== "off" },
      {
        id: "set",
        text: "Grave a velocidade atual.",
        key: "S",
        hint: "O carro precisa estar entre 30 e 150 km/h.",
        done: (s) => s.acc.mode === "active",
      },
      {
        id: "follow",
        text: "Espere: o carro reduz sozinho para acompanhar o da frente.",
        hint: "O carro verde com anel verde é o alvo seguido.",
        done: (s, d) => d.following && s.speed < 75,
      },
      {
        id: "gap",
        text: "Troque o nível de distância de seguimento.",
        key: "G",
        hint: "Veja a faixa verde no chão mudar de lugar.",
        done: (s) => s.acc.gap !== 2,
      },
      {
        id: "lead",
        text: "O carro da frente acelerou. Veja o ACC voltar à velocidade gravada.",
        enter: [{ type: "target", target: { speed: 115 } }],
        done: (s) => s.acc.mode === "active" && s.speed >= s.acc.setSpeed - 3,
      },
      { id: "brake", text: "Toque no freio: o ACC é interrompido.", key: "↓", done: (s) => s.acc.mode === "suspended" },
      { id: "resume", text: "Solte o freio e retome o ACC.", key: "W", done: (s) => s.acc.mode === "active" },
    ],
  },
  {
    id: "why-not",
    title: "Por que o ACC não ativa?",
    blurb: "O ACC está em espera, mas algo impede a ativação. Descubra o quê e resolva.",
    learn: ["O ACC exige 8 condições ao mesmo tempo.", "A lista “Por que o ACC não ativa?” mostra qual está faltando."],
    focus: "acc",
    quiz: {
      question: "Quantas condições o ACC exige para ativar?",
      options: ["Só uma: a velocidade", "Oito, todas ao mesmo tempo", "Três: cinto, porta e câmbio"],
      answer: 1,
      why: "Freio solto, porta fechada, cinto afivelado, câmbio em D, freio de estacionamento solto, HDC desligado, ESP ligado e ABS sem atuar.",
    },
    build: () => {
      const s = drive({ speed: 90, seatbelt: false, doorClosed: false, hdc: true });
      return { ...s, acc: { ...s.acc, mode: "standby" } };
    },
    steps: [
      { id: "belt", text: "Afivele o cinto de segurança.", key: "T", done: (s) => s.seatbelt },
      { id: "door", text: "Feche a porta do motorista.", key: "O", done: (s) => s.doorClosed },
      { id: "hdc", text: "Desligue o HDC.", key: "U", done: (s) => !s.hdc },
      { id: "set", text: "Agora grave a velocidade: o ACC ativa.", key: "S", done: (s) => s.acc.mode === "active" },
    ],
  },
  {
    id: "limit",
    title: "Limitador de velocidade",
    blurb: "Fixe um teto de velocidade. O carro não passa dele, a não ser que você pise a fundo.",
    learn: ["O limitador não acompanha o carro da frente.", "Acelerador a fundo ultrapassa o limite."],
    focus: "limit",
    quiz: {
      question: "O que faz o carro passar do limite fixado?",
      options: ["Soltar o acelerador", "Pisar o acelerador a fundo", "Apertar SET– de novo"],
      answer: 1,
      why: "O limitador cede quando você pisa fundo, e volta a segurar o carro quando você alivia.",
    },
    build: () => drive({ speed: 50 }),
    steps: [
      { id: "limit", text: "Ligue o limitador.", key: "L", done: (s) => s.limit.mode !== "off" },
      { id: "set", text: "Grave a velocidade atual como limite.", key: "S", done: (s) => s.limit.mode === "active" },
      {
        id: "cap",
        text: "Acelere: o carro sobe até o limite e para ali.",
        key: "↑",
        done: (s) => s.accel > 0 && s.speed >= s.limit.value - 1,
      },
      {
        id: "override",
        text: "Pise a fundo para ultrapassar o limite.",
        key: "Shift + ↑",
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
    quiz: {
      question: "Para carro parado, até que velocidade o AEB consegue frear?",
      options: ["Até 30 km/h", "Até 53 km/h", "Até 120 km/h"],
      answer: 1,
      why: "Contra carro parado, o AEB atua entre 4 e 53 km/h. Acima disso, o alarme ainda pode avisar, mas a frenagem fica por sua conta.",
    },
    build: () => drive({ speed: 45, target: { kind: "staticVehicle", distance: 70, speed: 0, lane: 0 } }),
    steps: [
      {
        id: "warn",
        text: "Não toque nos pedais. Espere o alarme de colisão.",
        done: (s) => s.aeb !== "idle" || s.collided,
      },
      { id: "brake", text: "Veja o AEB frear sozinho.", done: (s) => s.aeb === "partial" || s.aeb === "emergency" },
      { id: "stop", text: "O carro para antes de bater.", done: (s) => s.speed < 1 && !s.collided && s.aebStopped },
    ],
  },
  {
    id: "aeb-limit",
    title: "AEB: rápido demais",
    blurb: "A 70 km/h o AEB não atua em carro parado. Veja por que e como o limite funciona.",
    learn: ["Para carro parado, o AEB frea até 53 km/h.", "Acima disso, só o alarme soa."],
    focus: "aeb",
    quiz: {
      question: "A 70 km/h, com um carro parado à frente, o que o sistema faz?",
      options: ["Freia até parar", "Só avisa com alarme", "Nada"],
      answer: 1,
      why: "A 70 km/h você está acima da faixa de frenagem para carro parado (até 53). O alarme soa, e frear é com você.",
    },
    build: () => drive({ speed: 70, target: { kind: "staticVehicle", distance: 110, speed: 0, lane: 0 } }),
    steps: [
      { id: "warn", text: "Espere o alarme. O AEB ainda não freia: você está acima de 53 km/h.", done: (s) => s.aeb === "warn" },
      { id: "slow", text: "Segure o freio até ficar abaixo de 53 km/h.", key: "↓", done: (s) => s.speed < 53 },
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
    quiz: {
      question: "Em qual faixa de velocidade o AEB protege pedestres?",
      options: ["4 a 64 km/h", "30 a 150 km/h", "Qualquer velocidade"],
      answer: 0,
      why: "É a faixa informada no manual. Fora dela, o carro não freia sozinho para pedestres.",
    },
    build: () => drive({ speed: 40, target: { kind: "pedestrian", distance: 60, speed: 0, lane: 0 } }),
    steps: [
      { id: "warn", text: "Não faça nada. Espere o alarme.", done: (s) => s.aeb !== "idle" || s.collided },
      { id: "brake", text: "Veja o AEB frear.", done: (s) => s.aeb === "partial" || s.aeb === "emergency" },
      { id: "stop", text: "O carro para antes do pedestre.", done: (s) => s.speed < 1 && !s.collided },
    ],
  },
  {
    id: "blind",
    title: "Ponto cego e seta",
    blurb: "Um carro ao lado, no ponto cego. Veja os dois níveis de alerta.",
    learn: ["Nível 1: luz acesa no retrovisor.", "Nível 2: luz piscando e alarme, se você ligar a seta daquele lado."],
    focus: "bsd",
    quiz: {
      question: "Quando o alerta do ponto cego passa ao nível 2?",
      options: ["Ao ligar a seta do lado do carro", "Ao pisar no freio", "Ao ligar o farol"],
      answer: 0,
      why: "Ligar a seta mostra que você vai mudar de faixa. Aí o sistema entende o risco e avisa com mais força.",
    },
    build: () => drive({ speed: 70, blind: { left: true, right: false } }),
    steps: [
      { id: "l1", text: "Veja a luz do retrovisor esquerdo acender (nível 1).", done: (_s, d) => d.bsdWarn.left === 1 },
      { id: "turn", text: "Ligue a seta esquerda.", key: "Q", done: (s) => s.turnSignal === "left" },
      { id: "l2", text: "Veja o nível 2: a luz pisca e soa o alarme.", done: (_s, d) => d.bsdWarn.left === 2 },
      { id: "slow", text: "Reduza abaixo de 10 km/h: o monitor desliga.", key: "↓", done: (s) => s.bsd === "off" },
    ],
  },
  {
    id: "ldw",
    title: "Saída de faixa (LDW)",
    blurb: "Cruze a linha sem seta e o LDW avisa, mas não gira o volante por você.",
    learn: ["O LDW ativa acima de 65 km/h.", "Com a seta ligada, ele entende que é de propósito."],
    focus: "ldw",
    quiz: {
      question: "Por que o LDW fica quieto quando você liga a seta?",
      options: ["Está com defeito", "Entende que a troca de faixa é de propósito", "Só funciona abaixo de 60 km/h"],
      answer: 1,
      why: "Seta ligada significa intenção. O aviso é só para quando você cruza a linha sem querer.",
    },
    build: () => drive({ speed: 90 }),
    steps: [
      { id: "drift", text: "Vire o volante para a esquerda, sem seta, até cruzar a linha.", key: "←", done: (_s, d) => d.ldwWarn },
      {
        id: "back",
        text: "Volte para o meio da faixa.",
        key: "→",
        done: (s) => !s.laneDeparture && s.turnSignal === "none",
      },
      {
        id: "turn",
        text: "Ligue a seta e cruze a linha de propósito: o aviso se cala.",
        key: "Q e ←",
        done: (s, d) => s.turnSignal !== "none" && s.laneDeparture && !d.ldwWarn,
      },
      { id: "slow", text: "Reduza abaixo de 60 km/h: o LDW desliga.", key: "↓", done: (s) => s.ldw === "off" },
    ],
  },
  {
    id: "ihc",
    title: "Farol alto automático",
    blurb: "Estrada escura à noite. O farol alto liga e apaga sozinho.",
    learn: ["Ativo acima de 40 km/h, só em via escura.", "Carro vindo de frente ou luz na via apagam o farol alto."],
    focus: "ihc",
    quiz: {
      question: "O que apaga o farol alto automático?",
      options: ["Um carro vindo de frente ou uma via iluminada", "Ligar o rádio", "Frear"],
      answer: 0,
      why: "Ele só fica aceso em via escura e vazia. Carro vindo de frente ou luz da via fazem o sistema voltar ao farol baixo.",
    },
    build: () => drive({ speed: 70, night: true }),
    steps: [
      { id: "push", text: "Empurre a haste de luzes.", key: "B", done: (s) => s.ihcRequested },
      { id: "on", text: "Veja o farol alto ligar sozinho.", done: (_s, d) => d.highBeam },
      {
        id: "oncoming",
        text: "Vem um carro de frente: o farol alto apaga sozinho.",
        enter: [{ type: "set", key: "oncoming", value: true }],
        done: (s, d) => s.oncoming && !d.highBeam,
      },
      {
        id: "lit",
        text: "Passou. A via agora está iluminada: o farol alto continua apagado.",
        enter: [
          { type: "set", key: "oncoming", value: false },
          { type: "set", key: "roadLit", value: true },
        ],
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
    quiz: {
      question: "Quando a câmera 360° abre sozinha?",
      options: ["Ao engatar a ré (e abaixo de 20 km/h)", "Só quando você aperta o botão", "Sempre que passa de 30 km/h"],
      answer: 0,
      why: "A ré abre a câmera. Ela também pode abrir com a seta ou ao girar o volante, abaixo de 20 km/h, e fecha acima de 30.",
    },
    build: () => ({ ...drive({ speed: 0 }), gear: "P" }),
    steps: [
      { id: "r", text: "Engate a ré.", key: "R", done: (s) => s.gear === "R" },
      { id: "cam", text: "Veja a câmera 360° abrir sozinha.", done: (s) => s.avmOn },
      { id: "back", text: "Dê ré devagar.", key: "↑", done: (s) => s.speed > 2 },
      {
        id: "alarm",
        text: "Um carro cruza atrás, à esquerda: ouça e veja o alarme do RCTA.",
        enter: [{ type: "set", key: "cross", value: { left: true, right: false } }],
        done: (_s, d) => d.rctaWarn.left,
      },
    ],
  },
];

export const SCENARIO_BY_ID: Record<string, Scenario> = Object.fromEntries(SCENARIOS.map((s) => [s.id, s]));
