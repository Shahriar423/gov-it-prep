import { X } from "lucide-react";
import { useEffect } from "react";

const SIZES = {
  sm: "sm:max-w-sm",
  md: "sm:max-w-lg",
};

export default function Modal({ title, onClose, children, closeDisabled = false, size = "md" }) {
  // Escape closes the dialog; the page behind it does not scroll
  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === "Escape" && !closeDisabled) onClose();
    };
    document.addEventListener("keydown", onKeyDown);

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose, closeDisabled]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close dialog"
        onClick={closeDisabled ? undefined : onClose}
        className="absolute inset-0 bg-slate-900/50"
      />
      <div
        className={`relative z-10 flex max-h-[90vh] w-full flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl ${SIZES[size] || SIZES.md}`}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 id="modal-title" className="text-base font-semibold text-slate-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            disabled={closeDisabled}
            aria-label="Close"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}