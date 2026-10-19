# Simulador do painel do Tiggo 5X Pro

Simulador interativo, educacional e **não oficial** para entender como funcionam o painel de instrumentos e os assistentes de condução do pacote Max Drive: ACC, limitador de velocidade, AEB, alerta de colisão, LDW, ponto cego, tráfego cruzado traseiro, farol alto inteligente e câmera 360°.

As regras (velocidades de ativação, condições, o que cancela o quê) foram levantadas do Manual do Proprietário e escritas aqui em palavras próprias, cada uma com a seção do manual para você conferir.

## Dois modos

- **Dirigir** (padrão): a estrada em 3D ocupa a tela, o painel do carro fica embaixo e você dirige com o teclado. Há uma **estrada livre**, onde carros, pedestres e obstáculos aparecem sozinhos (com placar), e **missões** com passos automáticos e um quiz no final.
- **Laboratório**: todos os controles e painéis para montar qualquer situação.

### Teclas

| Tecla | Ação | Tecla | Ação |
| --- | --- | --- | --- |
| ↑ / ⇧↑ | acelerar / a fundo | A | liga o ACC |
| ↓ | frear | S | SET– (segure: de 5 em 5) |
| ← → | volante | W | RES+ (segure: de 5 em 5) |
| Enter | ligar / desligar | X | cancelar |
| Espaço | freio de estacionamento | G | distância do ACC |
| P R N D | câmbio | L | limitador |
| Q / E | seta esquerda / direita | B / V | farol alto automático: empurrar / puxar |
| H | pisca-alerta | K | câmera 360° |
| T O U M | cinto, porta, HDC, ESP | Z | SET– com o carro parado |

Todas as teclas também existem como botões na tela, para celular e tablet. Extra: **C** é a buzina (só teclado) e **F** liga ou desliga a **tela cheia** (também há o botão “Tela cheia”). Na tela cheia a estrada ocupa tudo, o painel do carro fica embaixo e o botão “Teclas” abre os controles na tela.

**Som:** ao começar a dirigir, o som liga sozinho (botão “Som” e volume no topo). Tudo é sintetizado em tempo real, sem arquivos de áudio: motor, vento, pneus, pássaros de dia e grilos à noite, carros passando, partida, câmbio, setas, freio de estacionamento, portas, cintos, alertas dos assistentes, chiado de freada e ABS, faixa sonora na borda da pista, colisão e buzina. Os sons são ilustrativos.

## O que você pode fazer

- Escolher uma **situação guiada** (ACC seguindo um carro, AEB com carro parado ou pedestre, ponto cego, saída de faixa, farol alto, ré com tráfego cruzado...). Os passos se marcam sozinhos.
- Ver tudo em uma **cena 3D**: seu carro, a pista, os outros carros, o pedestre e as zonas dos sensores, com rótulos e câmeras (atrás, de cima, de lado, automática).
- Ligar o carro, mudar a velocidade e o câmbio e ver o painel reagir.
- Apertar os botões do volante (ACC, RES+, SET–, distância, LIMIT, cancelar) e a haste de luzes.
- Colocar um carro, um pedestre ou um obstáculo parado à frente e ver o ACC seguir ou o AEB frear.
- Abrir a lista **Por que o ACC não ativa?**, que mostra ao vivo quais das 8 condições do manual faltam.
- Clicar em qualquer luz ou botão para ler o que ele faz, como usar e quais são os limites.
- Simular falhas e mudar as opções do menu de Condução assistida.

## Como rodar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # regras do simulador
npm run verify     # verificação legal + testes + build
```

## Como funciona por dentro

| Pasta | Conteúdo |
| --- | --- |
| `src/engine` | Regras puras em TypeScript, com testes, incluindo o diretor do trânsito da estrada livre. Nada de React aqui. |
| `src/input` | Controle único (teclado e botões na tela) e o ambiente sonoro sintetizado (`soundscape.ts`). |
| `src/content` | Textos explicativos e mensagens do painel. |
| `src/components` | Painel em SVG (dois mostradores, tela central com páginas Assistência e Viagem), controles, treinador e lista "O que está acontecendo". |
| `src/scene` | Cena 3D com three.js (carregada sob demanda), toda modelada em código: carro, caminhão, pedestres, relevo, árvores, placas e postes, com texturas geradas em canvas, sombras, céu com sol e estrelas, brilho (bloom), viaduto, balizadores, pedras, capim e linhas de velocidade. Sem modelos, texturas nem imagens externas. O botão “Gráficos” alterna Leve, Normal e Alta (o simulador reduz sozinho se ficar lento; `?q=0|1|2` força um nível). |
| `scripts` | Verificação de direitos autorais. |

## O que é fiel ao manual e o que é ilustrativo

- **Fiel:** faixas de velocidade (ACC 30 a 150 km/h, LDW a partir de 65, ponto cego a partir de 15, farol alto acima de 40, câmera 360° abaixo de 20 e fecha acima de 30, faixas do AEB), condições de ativação, o que cancela cada sistema.
- **Ilustrativo:** física do carro, tempos de cada etapa do AEB, distância real de seguimento do ACC, posição dos botões no volante o visual do painel, o formato e o alcance das zonas de sensor na cena 3D, rotação, combustível, temperatura, consumo e autonomia, o trânsito e os sons dos alertas. O manual não informa esses valores.
- **Fora do escopo por enquanto:** o controle de cruzeiro simples das versões sem Max Drive, sensores de estacionamento, TPMS, modos de direção e menus do multimídia além de Condução assistida.

## Direitos autorais

O repositório não contém o manual, imagens dele nem logotipos. Leia [`LEGAL.md`](LEGAL.md) antes de contribuir.

## Aviso

Isto não substitui o manual do seu carro. Os assistentes reais têm limitações; o motorista continua responsável pela condução.
