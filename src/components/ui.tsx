import { useEffect, useRef, type ReactNode } from "react";

export interface Ctx {
  select: (id: string) => void;
}

/** Interruptor com rótulo. */
export function Switch(props: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: string;
  onFocusId?: () => void;
}) {
  return (
    <label className="switch" onPointerEnter={props.onFocusId} onFocus={props.onFocusId}>
      <input type="checkbox" checked={props.checked} onChange={(e) => props.onChange(e.target.checked)} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-text">
        {props.label}
        {props.hint ? <small>{props.hint}</small> : null}
      </span>
    </label>
  );
}

/** Escolha entre poucas opções. */
export function Segmented<T extends string | number>(props: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={props.label}>
      {props.options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={props.value === o.value}
          className={props.value === o.value ? "on" : ""}
          onClick={() => props.onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Slider(props: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  step?: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="slider">
      <span className="slider-head">
        <span>{props.label}</span>
        <output>
          {Math.round(props.value)} {props.unit}
        </output>
      </span>
      <input
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}

/**
 * Botão com toque curto e toque longo (segurar). Segurar repete a ação longa,
 * como nos botões do volante.
 */
export function PressButton(props: {
  children: ReactNode;
  onShort?: () => void;
  onLong?: () => void;
  onDown?: () => void;
  onUp?: () => void;
  onFocusId?: () => void;
  className?: string;
  title?: string;
  pressed?: boolean;
  ariaLabel?: string;
}) {
  const timer = useRef<number | undefined>(undefined);
  const repeat = useRef<number | undefined>(undefined);
  const longFired = useRef(false);

  const clear = () => {
    window.clearTimeout(timer.current);
    window.clearInterval(repeat.current);
  };
  useEffect(() => clear, []);

  const down = (e: React.PointerEvent) => {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    props.onFocusId?.();
    props.onDown?.();
    longFired.current = false;
    if (props.onLong) {
      timer.current = window.setTimeout(() => {
        longFired.current = true;
        props.onLong?.();
        repeat.current = window.setInterval(() => props.onLong?.(), 450);
      }, 500);
    }
  };
  const up = () => {
    clear();
    props.onUp?.();
    if (!longFired.current) props.onShort?.();
    longFired.current = false;
  };
  const cancel = () => {
    clear();
    props.onUp?.();
  };

  return (
    <button
      type="button"
      className={`press ${props.className ?? ""} ${props.pressed ? "is-pressed" : ""}`}
      title={props.title}
      aria-label={props.ariaLabel}
      aria-pressed={props.pressed}
      onPointerEnter={props.onFocusId}
      onFocus={props.onFocusId}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={cancel}
      onKeyDown={(e) => {
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) {
          e.preventDefault();
          props.onDown?.();
          props.onShort?.();
        }
      }}
      onKeyUp={(e) => {
        if (e.key === "Enter" || e.key === " ") props.onUp?.();
      }}
    >
      {props.children}
    </button>
  );
}

export function Group(props: { title: string; open?: boolean; children: ReactNode }) {
  return (
    <details className="group" open={props.open}>
      <summary>{props.title}</summary>
      <div className="group-body">{props.children}</div>
    </details>
  );
}
