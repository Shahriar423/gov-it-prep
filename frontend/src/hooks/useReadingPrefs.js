import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "lesson-reading-prefs";

export const FONT_MIN = 14;
export const FONT_MAX = 26;
export const FONT_DEFAULT = 17;

// Line height for each spacing choice
export const SPACING_VALUES = { compact: 1.6, normal: 1.8, relaxed: 2 };

// Width of the reading page on bigger screens
export const WIDTH_VALUES = { narrow: "38rem", medium: "46rem", wide: "58rem" };

const DEFAULTS = {
  fontSize: FONT_DEFAULT,
  font: "sans", // sans | serif
  spacing: "normal", // compact | normal | relaxed
  width: "medium", // narrow | medium | wide
  sepia: false,
  keepAwake: false,
};

// Makes sure saved values are valid, even if the stored data is old or edited
function clean(value) {
  const v = value && typeof value === "object" ? value : {};
  const size = Number(v.fontSize);
  return {
    fontSize: Number.isFinite(size) ? Math.min(FONT_MAX, Math.max(FONT_MIN, Math.round(size))) : DEFAULTS.fontSize,
    font: v.font === "serif" ? "serif" : "sans",
    spacing: SPACING_VALUES[v.spacing] ? v.spacing : DEFAULTS.spacing,
    width: WIDTH_VALUES[v.width] ? v.width : DEFAULTS.width,
    sepia: v.sepia === true,
    keepAwake: v.keepAwake === true,
  };
}

// Wrapped in try/catch because browsers can block storage (private mode, etc.)
function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? clean(JSON.parse(raw)) : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

/** The student's reading settings, remembered on this device. */
export function useReadingPrefs() {
  const [prefs, setPrefs] = useState(load);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
    } catch {
      /* ignore */
    }
  }, [prefs]);

  const setPref = useCallback((key, value) => {
    setPrefs((current) => clean({ ...current, [key]: value }));
  }, []);

  const reset = useCallback(() => setPrefs({ ...DEFAULTS }), []);

  return { prefs, setPref, reset };
}