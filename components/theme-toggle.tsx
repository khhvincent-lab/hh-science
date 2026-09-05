"use client";

import { useEffect, useRef, useState } from "react";

type Theme = "white" | "oatmeal" | "sage" | "ocean" | "graphite" | "burgundy";

type ThemeOption = {
  id: Theme;
  label: string;
};

const THEMES: ThemeOption[] = [
  { id: "white", label: "清霧白" },
  { id: "oatmeal", label: "燕麥米" },
  { id: "sage", label: "森林綠" },
  { id: "ocean", label: "奢華藍" },
  { id: "graphite", label: "石墨灰" },
  { id: "burgundy", label: "深邃紅" },
];

function normalizeTheme(value: string | null): Theme | null {
  if (value === "light") return "white";
  if (value === "dark") return "sage";

  if (
    value === "white" ||
    value === "oatmeal" ||
    value === "sage" ||
    value === "ocean" ||
    value === "graphite" ||
    value === "burgundy"
  ) {
    return value;
  }

  return null;
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute("data-theme", theme);
  localStorage.setItem("hh-science-theme", theme);
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("white");
  const [ready, setReady] = useState(false);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = normalizeTheme(localStorage.getItem("hh-science-theme"));
    const systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial: Theme = saved ?? (systemDark ? "sage" : "white");

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
          <div className="hh-theme-menu-title">選擇主題</div>

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
