/**
 * Conteúdo explicativo do simulador.
 *
 * REGRA DE DIREITOS AUTORAIS: todo texto aqui é escrito em palavras próprias,
 * como estudo do funcionamento. Não copie trechos do manual, não cole imagens
 * dele e não use logotipos da marca. Valores numéricos (velocidades, tempos)
 * são fatos técnicos e podem ser citados, sempre com a página de origem.
 */

export type FeatureKind = "sistema" | "botão" | "luz" | "controle";

export interface Feature {
  id: string;
  kind: FeatureKind;
  title: string;
  /** Uma frase simples: o que é. */
  summary: string;
  /** Passos práticos de uso. */
  how?: string[];
  /** Limites e cuidados. */
  limits?: string[];
  /** Onde conferir no manual do proprietário (não é uma cópia do texto). */
  source: string;
  /** Marca o que só existe na versão com o pacote Max Drive. */
  maxDriveOnly?: boolean;
}

const CH5 = "Manual do proprietário, cap. 5";

export const FEATURES: Record<string, Feature> = {
  acc: {
    id: "acc",
    kind: "sistema",
    title: "Piloto automático adaptativo (ACC)",
    summary:
      "Mantém a velocidade que você escolheu e, quando há um carro mais lento na sua faixa, acompanha esse carro a uma distância segura, freando e acelerando sozinho.",
    how: [
      "Ligue o sistema no botão do ACC. Ele fica em espera.",
      "Em movimento, entre 30 e 150 km/h, aperte SET– para gravar a velocidade atual.",
      "Parado, pise no freio, aperte SET– e solte o freio em até 3 segundos: ele parte com 30 km/h programados.",
      "Pisar no acelerador por um momento só ultrapassa. Ao soltar, o ACC volta ao que estava fazendo.",
      "Se o carro da frente parar e voltar a andar em até 3 segundos, o seu também retoma sozinho. Entre 3 segundos e 10 minutos, toque de leve no acelerador. Depois de 10 minutos parado, o ACC sai e o freio de estacionamento é aplicado.",
    ],
    limits: [
      "Só reconhece veículos em movimento. Carro parado, pedestre, bicicleta, animal e veículo cruzando ou vindo de frente não são alvos do ACC.",
      "Não freia se você estiver com o pé no acelerador.",
      "É pensado para rodovias em bom estado. Evite em ruas da cidade, estradas estreitas, serras, túneis e curvas.",
      "Em chuva forte ou neblina, desligue. O radar pode não enxergar o carro da frente.",
      "Em curva, o carro da frente pode sair do alcance do radar e o seu acelera até a velocidade programada.",
    ],
    source: `${CH5}, seção do piloto automático adaptativo (p. 5-32 a 5-37)`,
    maxDriveOnly: true,
  },
  accPower: {
    id: "accPower",
    kind: "botão",
    title: "Liga e desliga o ACC",
    summary: "Coloca o piloto automático adaptativo em espera ou o desliga por completo.",
    how: [
      "Primeiro aperte este botão com o carro ligado.",
      "Com o ACC em espera, o botão SET– faz a programação.",
      "Ligar o limitador de velocidade desliga o ACC, e o contrário também.",
    ],
    source: `${CH5}, seção do ACC (p. 5-32)`,
    maxDriveOnly: true,
  },
  accSet: {
    id: "accSet",
    kind: "botão",
    title: "SET– (gravar e diminuir)",
    summary: "Grava a velocidade atual no ACC e, depois, diminui a velocidade programada.",
    how: [
      "Em espera e entre 30 e 150 km/h: um toque grava a velocidade atual.",
      "Com o ACC ativo: um toque tira 1 km/h; segurando, tira 5 km/h (10 km/h acima de 80).",
      "É o mesmo botão que grava o limite no modo limitador de velocidade.",
    ],
    limits: ["Só funciona se as 8 condições de ativação estiverem atendidas (veja a lista ao lado)."],
    source: `${CH5}, seção do ACC (p. 5-33 e 5-34)`,
    maxDriveOnly: true,
  },
  accRes: {
    id: "accRes",
    kind: "botão",
    title: "RES+ (retomar e aumentar)",
    summary: "Retoma o ACC depois de uma interrupção e aumenta a velocidade programada.",
    how: [
      "Depois de pisar no freio ou de apertar cancelar, um toque retoma a velocidade anterior (se as condições estiverem OK).",
      "Com o ACC ativo: um toque soma 1 km/h; segurando, soma 5 km/h (10 km/h acima de 80).",
    ],
    source: `${CH5}, seção do ACC (p. 5-34)`,
    maxDriveOnly: true,
  },
  accGap: {
    id: "accGap",
    kind: "botão",
    title: "Distância de seguimento",
    summary: "Escolhe entre três distâncias para acompanhar o carro da frente: mínima, padrão ou máxima.",
    how: [
      "A distância real cresce com a velocidade.",
      "Na tela, o indicador muda de cor conforme o nível.",
    ],
    limits: [
      "Na distância mínima, em velocidade baixa, o seu carro chega bem perto do da frente.",
      "Com pista molhada, prefira a distância máxima.",
    ],
    source: `${CH5}, seção do ACC (p. 5-34)`,
    maxDriveOnly: true,
  },
  accCancel: {
    id: "accCancel",
    kind: "botão",
    title: "Cancelar",
    summary: "Interrompe o ACC sem apagá-lo. A velocidade programada fica guardada para o RES+.",
    source: `${CH5}, seção do ACC (p. 5-34)`,
    maxDriveOnly: true,
  },
  limit: {
    id: "limit",
    kind: "sistema",
    title: "Limitador de velocidade predefinida",
    summary:
      "Impede que o carro passe de uma velocidade escolhida. Diferente do ACC, ele não acompanha o carro da frente.",
    how: [
      "Aperte LIMIT para entrar. O ACC é desligado.",
      "Abaixo de 30 km/h, SET– entra na configuração e propõe 20 km/h.",
      "Entre 20 e 200 km/h, SET– grava a velocidade atual como limite.",
      "RES+ e SET– ajustam o valor em 1 km/h.",
      "Para ultrapassar, pise o acelerador a fundo. O valor pisca e soa um aviso.",
    ],
    source: `${CH5}, seção do limite de velocidade predefinida (p. 5-37)`,
    maxDriveOnly: true,
  },
  aeb: {
    id: "aeb",
    kind: "sistema",
    title: "Frenagem automática de emergência (AEB)",
    summary:
      "Se você não reagir a tempo de evitar uma batida, o carro freia sozinho para diminuir a velocidade do impacto ou evitá-lo.",
    how: [
      "A frenagem tem etapas: primeiro um aviso, depois uma frenagem parcial e, se necessário, a frenagem de emergência.",
      "Se você desviar ou frear a tempo, a frenagem seguinte é cancelada.",
      "A faixa de atuação depende do alvo. Carro parado: 4 a 53 km/h. Carro em movimento: 4 a 80 km/h. Pessoa a pé ou de bicicleta: 4 a 64 km/h.",
    ],
    limits: [
      "Exige cinto afivelado, portas fechadas e ESP ligado.",
      "Cancela se você girar o volante rápido ou pisar firme no acelerador.",
      "O carro não fica parado sozinho depois de frear. Assuma o controle.",
      "Reage mal a animais, veículos cruzando e pedestres andando no sentido da pista ou em curva.",
      "Pode frear à toa em túneis, estacionamentos subterrâneos e curvas.",
      "Os tempos de cada etapa neste simulador são ilustrativos. O manual não informa esses valores.",
    ],
    source: `${CH5}, seção de AEB/FCW (p. 5-41 a 5-43)`,
    maxDriveOnly: true,
  },
  fcw: {
    id: "fcw",
    kind: "sistema",
    title: "Alerta de colisão frontal (FCW)",
    summary: "Emite um aviso sonoro e visual quando você está se aproximando rápido demais de um obstáculo.",
    limits: [
      "Não soa abaixo de 30 km/h.",
      "Acima de 85 km/h não soa para alvo parado.",
      "A sensibilidade (baixa, padrão, alta) é escolhida no multimídia.",
    ],
    source: `${CH5}, seção de AEB/FCW (p. 5-41 e 5-42)`,
    maxDriveOnly: true,
  },
  fdm: {
    id: "fdm",
    kind: "sistema",
    title: "Alerta de distância frontal (FDM)",
    summary: "Avisa quando você anda tempo demais perto do carro da frente.",
    how: ["O painel mostra o carro detectado e uma distância aproximada.", "Liga e desliga no multimídia, em Condução assistida."],
    source: `${CH5}, seção do FDM (p. 5-44)`,
    maxDriveOnly: true,
  },
  ldw: {
    id: "ldw",
    kind: "sistema",
    title: "Alerta de saída de faixa (LDW)",
    summary:
      "Uma câmera lê as faixas da pista e avisa quando uma roda cruza a linha sem que você tenha ligado a seta. Ele só avisa: não gira o volante por você.",
    how: [
      "Ativo a partir de 65 km/h (luz verde).",
      "Ao reduzir, fica em espera entre 65 e 60 km/h (luz cinza) e se desliga abaixo de 60 km/h.",
      "Quando avisa, a luz âmbar pisca.",
    ],
    limits: [
      "Seta ligada ou pisca-alerta: o sistema entende que a manobra é de propósito.",
      "Pode falhar com faixa apagada, pista em obra, curva fechada, frenagem ou aceleração fortes.",
      "Mantenha a câmera do para-brisa limpa.",
    ],
    source: `${CH5}, seção do LDW (p. 5-38 e 5-39)`,
    maxDriveOnly: true,
  },
  bsd: {
    id: "bsd",
    kind: "sistema",
    title: "Monitor de ponto cego (BSD)",
    summary: "Radares traseiros avisam quando há um veículo em movimento no ponto cego ou se aproximando por trás.",
    how: [
      "Ativo a partir de 15 km/h. Ao reduzir, fica em espera até 10 km/h.",
      "Nível 1: uma luz âmbar acende no retrovisor do lado do veículo.",
      "Nível 2: se você ligar a seta do mesmo lado, a luz pisca e soa um alarme.",
      "Dá para ligar e desligar no multimídia.",
    ],
    limits: [
      "Pode acusar objetos parados, como mureta, túnel e carros estacionados.",
      "Desligue ao rebocar ou ao usar suporte de bicicleta na traseira, pois isso atrapalha o radar.",
      "Sujeira, lama ou gelo no para-choque traseiro podem desativar o sistema.",
    ],
    source: `${CH5}, seção do BSD (p. 5-39 e 5-40)`,
    maxDriveOnly: true,
  },
  rcta: {
    id: "rcta",
    kind: "sistema",
    title: "Alerta de tráfego cruzado traseiro (RCTA)",
    summary: "Em marcha à ré, avisa quando um veículo vem pelo lado, atravessando atrás de você.",
    how: ["Funciona com o câmbio em R.", "A luz âmbar do retrovisor do lado pisca e soa um alarme."],
    source: `${CH5}, seção do RCTA (p. 5-41)`,
    maxDriveOnly: true,
  },
  ihc: {
    id: "ihc",
    kind: "sistema",
    title: "Farol alto inteligente (IHC)",
    summary: "Liga e desliga o farol alto automaticamente, de acordo com o trânsito e a iluminação da via.",
    how: [
      "Coloque o farol em AUTO e empurre a haste em direção ao painel. A luz branca acende.",
      "Fica ativo acima de 40 km/h. Abaixo de 30 km/h o farol alto apaga.",
      "Para assumir o controle, puxe a haste. Puxe de novo para reativar o automático.",
      "Precisa estar habilitado no multimídia.",
    ],
    limits: [
      "Só funciona em vias sem iluminação, como rodovias. Com luz na via, ele pode apagar ou se desativar.",
      "Com a seta ligada, ele não liga nem desliga o farol alto.",
    ],
    source: "Manual do proprietário, cap. 3, seção das luzes (p. 3-77)",
    maxDriveOnly: true,
  },
  avm: {
    id: "avm",
    kind: "sistema",
    title: "Câmera 360°",
    summary: "Quatro câmeras formam uma vista de cima do carro e ajudam em manobras.",
    how: [
      "Liga abaixo de 20 km/h: pelo botão, ao engatar R, ao ligar a seta (vista lateral) ou, se você habilitar, ao girar o volante.",
      "Desliga sozinha acima de 30 km/h.",
      "Sai 15 segundos depois que o câmbio deixa a posição R.",
    ],
    limits: [
      "A imagem não mostra tamanho e distância reais e tem pequeno atraso.",
      "Câmeras e retrovisores externos precisam estar na posição original. Mexer neles prejudica a vista.",
    ],
    source: `${CH5}, seção da câmera 360° (p. 5-52 a 5-56)`,
    maxDriveOnly: true,
  },
  esp: {
    id: "esp",
    kind: "controle",
    title: "ESP (controle de estabilidade)",
    summary: "Ajuda o carro a não derrapar. Nos carros com Max Drive, é também a base dos assistentes.",
    limits: [
      "Com o ESP desligado, as luzes dos assistentes acendem e eles ficam inoperantes até você religá-lo.",
      "Só desligue em situações específicas, como neve funda, solo muito fofo ou correntes nos pneus.",
    ],
    source: `${CH5}, abertura da seção de sistemas auxiliares (p. 5-26)`,
  },
  hdc: {
    id: "hdc",
    kind: "controle",
    title: "Controle para descida de ladeiras (HDC)",
    summary: "Segura a velocidade em descidas fortes, usando os freios automaticamente.",
    how: [
      "Liga com o carro em até 35 km/h e controla a velocidade na faixa de 10 a 35 km/h.",
      "Ligue antes de começar a descer, para focar no volante.",
    ],
    limits: ["Com o HDC ligado, o ACC não pode ser ativado."],
    source: `${CH5}, seção do HDC (p. 5-27 e 5-28)`,
  },
  epb: {
    id: "epb",
    kind: "controle",
    title: "Freio de estacionamento elétrico",
    summary: "Mantém o carro parado. É um dos itens que impedem o ACC de ser ativado.",
    limits: ["Puxar o freio de estacionamento com o ACC ativo desativa o sistema."],
    source: `${CH5}, seção do ACC, condições de ativação (p. 5-33 e 5-34)`,
  },
  fatigue: {
    id: "fatigue",
    kind: "controle",
    title: "Aviso de fadiga",
    summary: "Lembrete para descansar depois de um tempo ao volante. O tempo vai de 1 a 4 horas.",
    how: ["Configure no multimídia, em Configurações do veículo > Assistência de condução."],
    source: "Manual do proprietário, cap. 3 (multimídia) e cap. 5 (assistência de condução)",
  },
  tt_acc: {
    id: "tt_acc",
    kind: "luz",
    title: "Luz do ACC",
    summary: "Cinza: em espera. Verde: ativo. Âmbar: falha, procure a concessionária.",
    source: "Manual do proprietário, cap. 1, símbolos do painel, e cap. 3",
    maxDriveOnly: true,
  },
  tt_aeb: {
    id: "tt_aeb",
    kind: "luz",
    title: "Luz do AEB",
    summary: "Vermelha: o AEB está agindo. Âmbar fixa: falha, procure a concessionária.",
    source: "Manual do proprietário, cap. 1, símbolos do painel, e cap. 3",
    maxDriveOnly: true,
  },
  tt_ldw: {
    id: "tt_ldw",
    kind: "luz",
    title: "Luz do LDW",
    summary: "Cinza: em espera. Verde: ativo. Âmbar piscando: aviso de saída de faixa. Âmbar fixa: falha.",
    source: `${CH5}, seção do LDW (p. 5-38)`,
    maxDriveOnly: true,
  },
  tt_bsd: {
    id: "tt_bsd",
    kind: "luz",
    title: "Luz do BSD",
    summary: "Verde: veículo no ponto cego (nível 1). Âmbar piscando: nível 2 com a seta. Âmbar fixa: falha.",
    source: `${CH5}, seção do BSD (p. 5-39 e 5-40)`,
    maxDriveOnly: true,
  },
  tt_ihc: {
    id: "tt_ihc",
    kind: "luz",
    title: "Luz do farol alto inteligente",
    summary: "Branca: função ativa. Âmbar: falha.",
    source: "Manual do proprietário, cap. 3, seção das luzes (p. 3-77)",
    maxDriveOnly: true,
  },
  tt_esp: {
    id: "tt_esp",
    kind: "luz",
    title: "Luz de ESP desligado",
    summary: "Acesa quando você desativa o ESP. Nos carros com Max Drive, os assistentes ficam inoperantes.",
    source: `${CH5}, abertura da seção de sistemas auxiliares (p. 5-26)`,
  },
  tt_hdc: {
    id: "tt_hdc",
    kind: "luz",
    title: "Luz do HDC",
    summary: "Verde: controle de descida ligado. Âmbar: falha.",
    source: `${CH5}, seção do HDC (p. 5-27)`,
  },
  tt_belt: {
    id: "tt_belt",
    kind: "luz",
    title: "Luz do cinto",
    summary: "Acesa quando o cinto não está afivelado. Sem cinto, o ACC não ativa e o AEB não freia.",
    source: "Manual do proprietário, seção dos cintos de segurança, e cap. 5 (condições do ACC e do AEB)",
  },
  tt_door: {
    id: "tt_door",
    kind: "luz",
    title: "Porta aberta",
    summary: "Com a porta do motorista aberta, o ACC e o AEB não funcionam.",
    source: `${CH5}, seção do ACC (p. 5-33)`,
  },
  tt_epb: {
    id: "tt_epb",
    kind: "luz",
    title: "Luz do freio de estacionamento",
    summary: "Vermelha: freio aplicado. O ACC não ativa nesse estado.",
    source: `${CH5}, seção do ACC (p. 5-33)`,
  },
  settings: {
    id: "settings",
    kind: "controle",
    title: "Menu Condução assistida (multimídia)",
    summary:
      "No multimídia, em Configurações do veículo > Condução assistida, você liga e desliga BSD, FDM, AEB e escolhe a sensibilidade do alerta de colisão.",
    source: `${CH5}, seções do BSD, AEB/FCW e FDM (p. 5-40 a 5-44)`,
    maxDriveOnly: true,
  },
};

export const MESSAGES: Record<string, { text: string; tone: "info" | "warn" | "alert" }> = {
  takeover: { text: "Muito perto do carro da frente. Assuma o controle.", tone: "alert" },
  accTapAccelerator: { text: "Toque de leve no acelerador para ativar o ACC.", tone: "info" },
  accTargetLost: { text: "O ACC não segue obstáculos parados. Fique atento.", tone: "warn" },
  aebWarn: { text: "Risco de colisão! Freie ou desvie.", tone: "alert" },
  aebActing: { text: "Frenagem automática em andamento.", tone: "alert" },
  aebStopped: { text: "Carro parado pelo AEB. Ele não fica retido: assuma o controle.", tone: "warn" },
  collided: { text: "Colisão simulada. Use Reiniciar cenário para tentar de novo.", tone: "alert" },
  espOff: { text: "ESP desligado: assistentes inoperantes.", tone: "warn" },
  ldwWarn: { text: "Saída de faixa sem seta.", tone: "warn" },
  fdmWarn: { text: "Distância curta do carro da frente.", tone: "warn" },
  limitOverride: { text: "Limite ultrapassado com o acelerador a fundo.", tone: "info" },
  needMaxDrive: { text: "Esta versão não tem o pacote Max Drive.", tone: "info" },
};

export const ACC_CONDITION_LABELS: Record<string, string> = {
  brake: "Pé fora do freio",
  door: "Porta do motorista fechada",
  belt: "Cinto do motorista afivelado",
  gear: "Câmbio em D",
  parking: "Freio de estacionamento solto",
  hdc: "HDC desligado",
  esp: "ESP ligado",
  abs: "ABS sem atuar",
};
