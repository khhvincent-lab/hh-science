"use client";

import { useEffect, useRef, useState } from "react";
import { isStudentTeachingMode, STUDENT_TEACHING_MODES, type StudentTeachingMode } from "@/lib/teaching-modes";
import styles from "./teaching-mode-selector.module.css";

const preferenceKey = (id: string) => `hh-science:teaching-mode:${id}`;

export function useTeachingMode(studentId: string | undefined) {
  const [selection, setSelection] = useState<{ studentId?: string; mode?: StudentTeachingMode; error?: string }>({});
  const generation = useRef(0);

  useEffect(() => {
    const current = ++generation.current;
    if (!studentId) return;
    try {
      const saved = localStorage.getItem(preferenceKey(studentId));
      if (isStudentTeachingMode(saved)) {
        setSelection({ studentId, mode: saved });
        return;
      }
    } catch { /* Private browsing may disable storage; choosing still works. */ }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    fetch("/api/teaching-mode", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json();
        if (!isStudentTeachingMode(data.mode)) throw new Error();
        if (generation.current === current) setSelection({ studentId, mode: data.mode });
      })
      .catch(() => {
        if (generation.current === current) setSelection({ studentId, error: "暫時無法讀取老師預設，請選擇解說深度。" });
      })
      .finally(() => clearTimeout(timeout));
    return () => { ++generation.current; clearTimeout(timeout); controller.abort(); };
  }, [studentId]);

  function choose(mode: StudentTeachingMode) {
    if (!studentId) return;
    ++generation.current; // A slow defaults response must never overwrite a choice.
    setSelection({ studentId, mode });
    try { localStorage.setItem(preferenceKey(studentId), mode); } catch { /* Optional persistence. */ }
  }

  return {
    mode: selection.studentId === studentId ? selection.mode : undefined,
    error: selection.studentId === studentId ? selection.error : undefined,
    choose,
  };
}

export default function TeachingModeSelector({ mode, onChange, disabled, error }: {
  mode?: StudentTeachingMode;
  onChange: (mode: StudentTeachingMode) => void;
  disabled?: boolean;
  error?: string;
}) {
  const [flash, setFlash] = useState<{ mode: StudentTeachingMode; sequence: number } | null>(null);
  function animate(value: StudentTeachingMode) {
    if (!disabled) setFlash(previous => ({ mode: value, sequence: (previous?.sequence ?? 0) + 1 }));
  }
  const selected = STUDENT_TEACHING_MODES.find((item) => item.value === mode);
  return <fieldset className={styles.selector} disabled={disabled} aria-describedby="teaching-mode-description">
    <legend>解說深度</legend>
    <div className={styles.options}>
      {STUDENT_TEACHING_MODES.map((item) => <label key={item.value} className={styles.option}>
        <input type="radio" name="teaching-mode" aria-label={item.label} value={item.value} checked={mode === item.value} onChange={() => { onChange(item.value); animate(item.value); }} onClick={() => { if (mode === item.value) animate(item.value); }} />
        <span>{item.label}</span>
        {!disabled && mode === item.value && flash?.mode === item.value && <i key={flash.sequence} className={styles.orbit} aria-hidden="true" />}
      </label>)}
    </div>
    <p id="teaching-mode-description" aria-live="polite">{selected?.description || error || "正在讀取老師預設，也可以直接選擇。"}</p>
  </fieldset>;
}
