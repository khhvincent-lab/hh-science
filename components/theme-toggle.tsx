"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import { usePanelPresence } from "./use-panel-presence";

type Theme = "midnight" | "nordic" | "aurora" | "gold" | "obsidian" | "racing" | "iphone-burgundy" | "iphone-glacier" | "iphone-silver" | "iphone-black" | "f1-mercedes" | "f1-redbull" | "f1-ferrari" | "f1-mclaren";

type ThemeOption = {
  id: Theme;
  label: string;
  group?: "iPhone" | "F1";
};

const THEMES: ThemeOption[] = [
  { id: "midnight", label: "靜謐深藍" },
  { id: "nordic", label: "森語晨光" },
  { id: "aurora", label: "極光藍境" },
  { id: "gold", label: "墨夜流金" },
  { id: "obsidian", label: "玄霧石墨" },
  { id: "racing", label: "曜黑競速" },
  { id: "iphone-burgundy", label: "醇釀酒紅", group: "iPhone" },
  { id: "iphone-glacier", label: "冰川霧藍", group: "iPhone" },
  { id: "iphone-silver", label: "霧光銀白", group: "iPhone" },
  { id: "iphone-black", label: "曜石純黑", group: "iPhone" },
  { id: "f1-mercedes", label: "賓士銀箭", group: "F1" },
  { id: "f1-redbull", label: "紅牛競速", group: "F1" },
  { id: "f1-ferrari", label: "法拉利躍馬", group: "F1" },
  { id: "f1-mclaren", label: "麥拉倫疾橙", group: "F1" },
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
  document.documentElement.style.colorScheme = ["midnight", "gold", "obsidian", "racing", "iphone-burgundy", "iphone-black", "f1-mercedes", "f1-redbull", "f1-ferrari", "f1-mclaren"].includes(theme) ? "dark" : "light";
  try { localStorage.setItem("hh-science-theme", theme); } catch {}
  window.dispatchEvent(new CustomEvent("hh-theme-change", { detail: theme }));
  const colors: Record<Theme, string> = {midnight:"#0e1726",nordic:"#e9eee7",aurora:"#dcecff",gold:"#17181b",obsidian:"#15181c",racing:"#101114","iphone-burgundy":"#190f16","iphone-glacier":"#e8f1f5","iphone-silver":"#eceef1","iphone-black":"#090a0c","f1-mercedes":"#0a1113","f1-redbull":"#0a1025","f1-ferrari":"#0d0d10","f1-mclaren":"#111214"};
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content",colors[theme]);
}

function subscribeTheme(callback: () => void) {
  window.addEventListener("hh-theme-change", callback);
  return () => window.removeEventListener("hh-theme-change", callback);
}
function currentTheme(): Theme {
  return normalizeTheme(document.documentElement.dataset.theme ?? null) ?? "midnight";
}
const subscribeReady = () => () => {};

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribeTheme, currentTheme, () => "midnight" as Theme);
  const ready = useSyncExternalStore(subscribeReady, () => true, () => false);
  const [group, setGroup] = useState("iPhone");
  const [open, setOpen] = useState(false);
  const present = usePanelPresence(open);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        rootRef.current?.querySelector<HTMLButtonElement>(".hh-theme-toggle")?.focus();
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
    applyTheme(next);
    setOpen(false);
    rootRef.current?.querySelector<HTMLButtonElement>(".hh-theme-toggle")?.focus();
  }

  return (
    <div className="hh-theme-picker" ref={rootRef}>
      <button
        type="button"
        className="hh-theme-toggle"
        onClick={() => ready && setOpen((current) => !current)}
        aria-label="選擇介面主題"
        aria-expanded={open}
        aria-haspopup="dialog"
        disabled={!ready}
        title="選擇介面主題"
      >
        <span
          className={`hh-theme-orb hh-theme-swatch-${theme}`}
          aria-hidden="true"
        />
      </button>

      {ready && present && (
        <div className="hh-theme-menu" data-state={open ? "open" : "closed"} inert={!open} aria-hidden={!open} role="dialog" aria-label="介面主題">
          <div className="hh-theme-menu-title">外觀主題 · 找到你的風格</div>

          <div className="hh-theme-collections" aria-label="主題系列">
            {["iPhone", "F1", "經典"].map((name) => (
              <button type="button" key={name} aria-pressed={group === name} onClick={() => setGroup(name)}>{name === "F1" ? "F1 賽車" : name}</button>
            ))}
          </div>
          <div className="hh-theme-grid" role="group" aria-label={`${group} 主題`}>
          {THEMES.filter((item) => (item.group ?? "經典") === group).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={theme === item.id}
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
        </div>
      )}
    </div>
  );
}
