#!/usr/bin/env node
/**
 * Verificação de segurança de direitos autorais.
 *
 * 1. Falha se o repositório contiver PDFs, imagens ou pastas do manual.
 * 2. Opcional: se a variável MANUAL_TXT apontar para o texto extraído do manual
 *    (arquivo local, que NUNCA deve ser versionado), compara frases de 8 palavras
 *    e falha se o conteúdo do projeto repetir o manual literalmente.
 *
 * Uso:
 *   npm run check:legal
 *   MANUAL_TXT=/caminho/manual.txt npm run check:legal
 */
import { execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const problems = [];

/* 1. Arquivos proibidos */
const files = execSync("git ls-files -co --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean)
  .filter((f) => existsSync(f));

const BLOCKED_EXT = /\.(pdf|png|jpe?g|gif|webp|bmp|tiff?|heic|ai|psd|eps)$/i;
const BLOCKED_NAME = /(manual|catalogo|catálogo|ficha-tecnica|logo)/i;
for (const f of files) {
  if (BLOCKED_EXT.test(f)) problems.push(`Arquivo de imagem ou PDF não permitido sem revisão: ${f}`);
  else if (BLOCKED_NAME.test(f) && !/^(scripts\/check-copyright-safety\.mjs|LEGAL\.md|docs\/)/.test(f))
    problems.push(`Nome de arquivo suspeito (manual, logo, catálogo): ${f}`);
}

/* 2. Comparação com o texto do manual (opcional, só local) */
const manualPath = process.env.MANUAL_TXT;
if (manualPath) {
  if (!existsSync(manualPath)) {
    problems.push(`MANUAL_TXT não encontrado: ${manualPath}`);
  } else {
    const norm = (t) =>
      t
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .split(/\s+/)
        .filter(Boolean);
    const N = 8;
    const manualWords = norm(readFileSync(manualPath, "utf8"));
    const shingles = new Set();
    for (let i = 0; i + N <= manualWords.length; i++) shingles.add(manualWords.slice(i, i + N).join(" "));

    const targets = files.filter((f) => /^src\/.*\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));
    let checked = 0;
    for (const f of targets) {
      const words = norm(readFileSync(f, "utf8"));
      for (let i = 0; i + N <= words.length; i++) {
        checked++;
        const s = words.slice(i, i + N).join(" ");
        if (shingles.has(s)) problems.push(`Trecho igual ao manual em ${f}: "${s}"`);
      }
    }
    console.log(`Comparação com o manual: ${checked} sequências de ${N} palavras verificadas.`);
  }
} else {
  console.log("Dica: defina MANUAL_TXT=/caminho/do/manual.txt para comparar os textos com o manual (somente local).");
}

if (problems.length) {
  console.error("\nVerificação de direitos autorais FALHOU:\n");
  for (const p of problems.slice(0, 40)) console.error(" - " + p);
  if (problems.length > 40) console.error(` ... e mais ${problems.length - 40}`);
  process.exit(1);
}
console.log("Verificação de direitos autorais: OK.");
