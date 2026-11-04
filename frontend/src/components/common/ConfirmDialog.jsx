import { btnDanger, btnPrimary, btnSecondary } from "../../utils/ui";
import Modal from "./Modal";

export default function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  confirmTone = "danger", // "danger" | "primary"
  busy = false,
  error = "",
  onConfirm,
  onCancel,
}) {
  return (
    <Modal title={title} onClose={onCancel} closeDisabled={busy} size="sm">
      <p className="text-sm text-slate-600">{message}</p>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={onCancel} disabled={busy} className={btnSecondary}>
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy}
          className={confirmTone === "primary" ? btnPrimary : btnDanger}
        >
          {busy ? "Working…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}