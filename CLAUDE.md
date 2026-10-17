# Instruções para este repositório

Simulador educacional do painel de um SUV compacto, baseado no manual do proprietário.

## Regras que não se negociam (direitos autorais)

- Nunca adicione ao repositório: o manual em PDF, páginas ou capturas dele, imagens, logotipos, ícones oficiais.
- Escreva todo texto em palavras próprias. Não copie frases do manual.
- Fatos numéricos (velocidades, tempos) podem ser usados, com a seção do manual como fonte.
- Valores que o manual não informa devem ser marcados como ilustrativos.
- Antes de commitar, rode `npm run verify`. Se tiver o texto do manual localmente, rode também
  `MANUAL_TXT=/caminho/manual.txt npm run check:legal`.

## Estrutura

- `src/engine/`: regras puras do simulador (sem React). Toda regra nova entra com teste.
- `src/content/features.ts`: textos explicativos. Cada item cita onde conferir no manual.
- `src/components/`: interface. O painel é desenhado em SVG próprio.
- `scripts/check-copyright-safety.mjs`: verificação de conteúdo proibido.

## Comandos

- `npm run dev`: servidor local
- `npm test`: testes das regras
- `npm run build`: compila
- `npm run verify`: verificação legal, testes e build

## Estilo

- Interface e textos em português do Brasil, frases curtas, voz ativa.
- Acessibilidade: foco visível, rótulos em todos os controles, respeitar `prefers-reduced-motion`.
