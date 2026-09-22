"use client";

import { useEffect, useRef, useState } from "react";

type Theme = "midnight" | "nordic" | "aurora" | "gold" | "obsidian";

type ThemeOption = {
  id: Theme;
  label: string;
};

const THEMES: ThemeOption[] = [
  { id: "midnight", label: "靜謐深藍" },
  { id: "nordic", label: "森語晨光" },
  { id: "aurora", label: "極光藍境" },
  { id: "gold", label: "墨夜流金" },
  { id: "obsidian", label: "玄霧石墨" },
];

function normalizeTheme(value: string | null): Theme | null {
  if (!value) return null;
  const legacy: Record<string, Theme> = {
    white: "nordic", oatmeal: "nordic", sage: "midnight",
    ocean: "midnight", graphite: "obsidian", burgundy: "gold",
    light: "nordic", dark: "midnight",
  };
  if (legacy[value]) return legacy[value];
  return THEMES.find((item) => item.id === value)?.id ?? null;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("hh-science-theme", theme);
  const colors: Record<Theme, string> = {midnight:"#0e1726",nordic:"#e9eee7",aurora:"#dcecff",gold:"#17181b",obsidian:"#15181c"};
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",colors[theme]);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("midnight");
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = normalizeTheme(localStorage.getItem("hh-science-theme"));
    const initial: Theme = saved ?? "midnight";

    setTheme(initial);
    applyTheme(initial);
    setReady(true);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("pointerdown", handlePointerDown);
      document.addEventListener("keydown", handleKeyDown);
    }

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function chooseTheme(next: Theme) {
    setTheme(next);
    applyTheme(next);
    setOpen(false);
  }

  return (
    <div className="hh-theme-picker" ref={rootRef}>
      <button
        type="button"
        className="hh-theme-toggle"
        onClick={() => ready && setOpen((current) => !current)}
        aria-label="選擇介面主題"
        aria-expanded={open}
        aria-haspopup="menu"
        disabled={!ready}
        title="選擇介面主題"
      >
        <span
          className={`hh-theme-orb hh-theme-swatch-${theme}`}
          aria-hidden="true"
        />
      </button>

      {ready && open && (
        <div className="hh-theme-menu" role="menu" aria-label="介面主題">
          <div className="hh-theme-menu-title">解題實驗室 2.0 · 外觀主題</div>

          {THEMES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitemradio"
              aria-checked={theme === item.id}
              className={`hh-theme-option ${
                theme === item.id ? "is-active" : ""
              }`}
              onClick={() => chooseTheme(item.id)}
            >
              <span
                className={`hh-theme-swatch hh-theme-swatch-${item.id}`}
                aria-hidden="true"
              />
              <span className="hh-theme-option-label">{item.label}</span>
              <span className="hh-theme-check" aria-hidden="true">
                {theme === item.id ? "✓" : ""}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
