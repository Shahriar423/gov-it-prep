import { Minus, Plus, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { FONT_MAX, FONT_MIN } from "../../hooks/useReadingPrefs";
import { wakeLockSupported } from "../../hooks/useWakeLock";

function Segmented({ label, value, options, onChange }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <div role="radiogroup" aria-label={label} className="grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-slate-100 p-1">
        {options.map((option) => {
          const active = value === option.value;
          return (
            <button
              key={String(option.value)}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={`rounded-lg px-2 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-purple-600 ${
                active ? "bg-white text-purple-700 shadow-sm" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** The "Aa" button and its panel of reading settings. */
export default function ReadingSettings({ prefs, onChange, onReset, isDark }) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Escape or a tap outside closes the panel
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  const stepButton =
    "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 disabled:opacity-40";

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label="Reading settings"
        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium text-slate-700 transition hover:bg-purple-50 hover:text-purple-700 focus-visible:outline-2 focus-visible:outline-purple-600"
      >
        <span className="text-base font-bold leading-none" aria-hidden="true">
          Aa
        </span>
        <span className="hidden sm:inline">Text</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Reading settings"
          className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] space-y-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-xl"
        >
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Text size</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={stepButton}
                aria-label="Smaller text"
                disabled={prefs.fontSize <= FONT_MIN}
                onClick={() => onChange("fontSize", prefs.fontSize - 1)}
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </button>
              <input
                type="range"
                min={FONT_MIN}
                max={FONT_MAX}
                step={1}
                value={prefs.fontSize}
                onChange={(e) => onChange("fontSize", Number(e.target.value))}
                aria-label="Text size"
                className="h-2 min-w-0 flex-1 accent-purple-600"
              />
              <button
                type="button"
                className={stepButton}
                aria-label="Larger text"
                disabled={prefs.fontSize >= FONT_MAX}
                onClick={() => onChange("fontSize", prefs.fontSize + 1)}
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </button>
              <span className="w-11 text-right text-sm tabular-nums text-slate-600">{prefs.fontSize}px</span>
            </div>
          </div>

          <Segmented
            label="Font"
            value={prefs.font}
            onChange={(v) => onChange("font", v)}
            options={[
              { value: "sans", label: "Sans" },
              { value: "serif", label: "Serif" },
            ]}
          />

          <Segmented
            label="Line spacing"
            value={prefs.spacing}
            onChange={(v) => onChange("spacing", v)}
            options={[
              { value: "compact", label: "Compact" },
              { value: "normal", label: "Normal" },
              { value: "relaxed", label: "Relaxed" },
            ]}
          />

          {/* Page width only matters on bigger screens */}
          <div className="hidden sm:block">
            <Segmented
              label="Page width"
              value={prefs.width}
              onChange={(v) => onChange("width", v)}
              options={[
                { value: "narrow", label: "Narrow" },
                { value: "medium", label: "Medium" },
                { value: "wide", label: "Wide" },
              ]}
            />
          </div>

          {!isDark && (
            <Segmented
              label="Background"
              value={prefs.sepia}
              onChange={(v) => onChange("sepia", v)}
              options={[
                { value: false, label: "Default" },
                { value: true, label: "Sepia" },
              ]}
            />
          )}

          {wakeLockSupported() && (
            <button
              type="button"
              role="switch"
              aria-checked={prefs.keepAwake}
              onClick={() => onChange("keepAwake", !prefs.keepAwake)}
              className="flex w-full items-center justify-between gap-3 text-left focus-visible:outline-2 focus-visible:outline-purple-600"
            >
              <span className="text-sm font-medium text-slate-800">
                Keep screen on
                <span className="block text-xs font-normal text-slate-500">Stops the screen from turning off while you read</span>
              </span>
              <span
                className={`relative h-6 w-11 shrink-0 rounded-full transition ${prefs.keepAwake ? "bg-purple-600" : "bg-slate-300"}`}
                aria-hidden="true"
              >
                <span
                  className={`absolute top-0.5 h-5 w-5 rounded-full bg-[#ffffff] shadow transition-all ${
                    prefs.keepAwake ? "left-[22px]" : "left-0.5"
                  }`}
                />
              </span>
            </button>
          )}

          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-purple-700"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset to defaults
          </button>
        </div>
      )}
    </div>
  );
}