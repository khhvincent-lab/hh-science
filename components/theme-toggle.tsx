"use client";

import {
  useEffect,
  useState,
} from "react";


type Theme =
  | "light"
  | "dark";


function applyTheme(
  theme: Theme
) {

  document
    .documentElement
    .setAttribute(
      "data-theme",
      theme
    );


  localStorage.setItem(
    "hh-science-theme",
    theme
  );

}


export default function ThemeToggle() {

  const [
    theme,
    setTheme,
  ] =
    useState<Theme>(
      "light"
    );


  const [
    ready,
    setReady,
  ] =
    useState(false);


  useEffect(
    () => {

      const saved =
        localStorage.getItem(
          "hh-science-theme"
        );


      let initial:
        Theme;


      if (
        saved ===
          "dark" ||
        saved ===
          "light"
      ) {

        initial =
          saved;

      } else {

        const prefersDark =
          window.matchMedia(
            "(prefers-color-scheme: dark)"
          ).matches;


        initial =
          prefersDark
            ? "dark"
            : "light";

      }


      setTheme(
        initial
      );


      document
        .documentElement
        .setAttribute(
          "data-theme",
          initial
        );


      setReady(
        true
      );

    },
    []
  );


  function toggle() {

    const next:
      Theme =
      theme ===
      "light"
        ? "dark"
        : "light";


    setTheme(
      next
    );


    applyTheme(
      next
    );

  }


  if (
    !ready
  ) {

    return (
      <button
        type="button"
        className="hh-theme-toggle"

        aria-label="切換深淺色"

        disabled
      >
        ◐
      </button>
    );
  }


  return (
    <button
      type="button"

      className="hh-theme-toggle"

      onClick={
        toggle
      }

      title={
        theme ===
        "light"
          ? "切換為深色模式"
          : "切換為淺色模式"
      }

      aria-label={
        theme ===
        "light"
          ? "切換為深色模式"
          : "切換為淺色模式"
      }
    >

      {theme ===
      "light"
        ? "☾"
        : "☀"}

    </button>
  );
}