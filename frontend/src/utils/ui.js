// Shared Tailwind class strings so every form and button looks the same.
export const inputClass =
  "block w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 disabled:cursor-not-allowed disabled:bg-slate-100";

export const labelClass = "block text-sm font-medium text-slate-700";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60";

export const btnPrimary = `${btnBase} bg-linear-to-r from-purple-600 to-pink-500 text-white shadow-purple-500/25 transition hover:brightness-110 focus-visible:outline-blue-600`;
export const btnSecondary = `${btnBase} border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 focus-visible:outline-blue-600`;
export const btnDanger = `${btnBase} bg-red-600 text-white hover:bg-red-700 focus-visible:outline-red-600`;

export const cardClass = "rounded-xl border border-slate-200 bg-white shadow-sm";