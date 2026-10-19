# Aviso legal e política de conteúdo

Este é um projeto **educacional, independente e não oficial**. Não tem vínculo, patrocínio ou aprovação da CAOA Chery, da Chery ou de qualquer concessionária.

## O que este repositório contém

- Código próprio (licença MIT, veja `LICENSE`).
- Textos explicativos escritos **em palavras próprias**, a partir da leitura do Manual do Proprietário do Tiggo 5X Pro. São resumos para estudo, não cópias.
- Fatos técnicos (por exemplo, "o LDW ativa a partir de 65 km/h"), sempre acompanhados da seção do manual onde conferir.
- Desenhos vetoriais criados do zero para este projeto: o painel segue só a organização geral (dois mostradores, tela central), sem copiar a arte do fabricante, e o carro, o pedestre e a pista 3D são formas geométricas próprias, sem modelos de terceiros. Texturas (asfalto, grama, placas, nuvens) são geradas por código; as placas e placas de trânsito são fictícias e não há logotipos.
- Dependência `three` (licença MIT) para a cena 3D, incluindo seus módulos de exemplo (céu, pós-processamento).

## O que este repositório NÃO contém (e não deve conter)

- O manual em PDF, páginas dele, capturas de tela ou imagens extraídas dele.
- Logotipos, emblemas, tipografia de marca ou ícones oficiais do fabricante.
- Trechos copiados do manual, nem mesmo "só um parágrafo".
- Fotos ou renders do veículo.

## Como o projeto se protege

- `.gitignore` bloqueia `*.pdf` e arquivos com nome de manual.
- `npm run check:legal` falha se houver PDF, imagem ou arquivo com nome suspeito (manual, logo, catálogo).
- Opcionalmente, `MANUAL_TXT=/caminho/manual.txt npm run check:legal` compara o texto do projeto com o texto extraído do manual e falha se encontrar frases de 8 palavras iguais. Esse arquivo de texto fica só na sua máquina e nunca deve ser versionado.
- Toda explicação cita onde conferir no manual original. Quem quiser a fonte vai ao documento oficial.

## Para quem contribuir

1. Escreva com suas palavras. Se uma frase sua ficar parecida demais com a do manual, reescreva.
2. Não adicione imagens de nenhum tipo sem discutir antes.
3. Rode `npm run verify` antes de abrir um pull request.
4. Marque como "ilustrativo" qualquer valor que o manual não informe (por exemplo, tempos de reação do AEB).

## Marcas

"Tiggo", "Chery" e "CAOA" são marcas de seus respectivos titulares. Os nomes aparecem apenas para identificar o veículo ao qual o estudo se refere (uso descritivo).

## Isenção

O simulador **não substitui o manual do seu veículo** nem treinamento de direção. Os assistentes de condução reais têm limitações que dependem de versão, calibração e condições da via. Se algo aqui divergir do manual do seu carro, vale o manual. Se você é titular de direitos e quer algo removido, abra uma issue ou entre em contato com a pessoa responsável pelo repositório.

Esta nota não é aconselhamento jurídico. Quem pretende publicar o projeto de forma ampla ou comercial deve consultar um advogado e, de preferência, pedir autorização ao fabricante.

- Sons: todos sintetizados por código com a Web Audio API; nenhum áudio gravado, de terceiros ou do carro real. Timbres e ritmos são ilustrativos.
