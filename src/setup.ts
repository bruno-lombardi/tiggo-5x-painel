import type { WorldId } from "./engine/route";

export type Model = "pro" | "sport";

export interface CarColor {
  id: string;
  label: string;
  hex: number;
}

/** Cores ILUSTRATIVAS: não são as cores oficiais do catálogo. */
export const COLORS: readonly CarColor[] = [
  { id: "branco", label: "Branco", hex: 0xe9eef1 },
  { id: "prata", label: "Prata", hex: 0xaab2b8 },
  { id: "grafite", label: "Grafite", hex: 0x4a5258 },
  { id: "preto", label: "Preto", hex: 0x15191c },
  { id: "azul", label: "Azul", hex: 0x1f4f8f },
  { id: "vermelho", label: "Vermelho", hex: 0xa3232b },
];

export interface Setup {
  model: Model;
  world: WorldId;
  color: string;
  night: boolean;
}

export const DEFAULT_SETUP: Setup = { model: "pro", world: "highway", color: "branco", night: false };

const KEY = "tiggo-sim-setup-v1";

export function loadSetup(): Setup {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETUP;
    const p = JSON.parse(raw) as Partial<Setup>;
    return {
      model: p.model === "sport" ? "sport" : "pro",
      world: p.world === "serra" ? "serra" : "highway",
      color: COLORS.some((c) => c.id === p.color) ? (p.color as string) : "branco",
      night: p.night === true,
    };
  } catch {
    return DEFAULT_SETUP;
  }
}

export function saveSetup(s: Setup) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento: tudo bem */
  }
}

export const colorHex = (id: string) => (COLORS.find((c) => c.id === id) ?? COLORS[0]).hex;
export const colorCss = (id: string) => `#${colorHex(id).toString(16).padStart(6, "0")}`;
