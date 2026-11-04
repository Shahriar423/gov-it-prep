import { useState } from "react";

import { updateMaterial } from "../../api/adminMaterials.api";
import { getErrorMessage } from "../../utils/errors";
import { metaFromMaterial, toPayload, validateMeta } from "../../utils/materialMeta";
import { btnPrimary, btnSecondary } from "../../utils/ui";
import Modal from "../common/Modal";
import MaterialMetaFields from "./MaterialMetaFields";

export default function MaterialEditModal({ material, subjects, options, onClose, onSaved }) {
  const [meta, setMeta] = useState(() => metaFromMaterial(material));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const problem = validateMeta(meta);
    if (problem) return setError(problem);

    setSaving(true);
    try {
      await updateMaterial(material.id, toPayload(meta));
      onSaved();
    } catch (err) {
      setError(getErrorMessage(err));
      setSaving(false);
    }
  }

  return (
    <Modal title="Edit material details" onClose={onClose} closeDisabled={saving}>
      <form onSubmit={handleSubmit} className="space-y-5">
        <MaterialMetaFields
          value={meta}
          onChange={setMeta}
          subjects={subjects}
          options={options}
          disabled={saving}
          idPrefix="edit"
        />

        {error && (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} disabled={saving} className={btnSecondary}>
            Cancel
          </button>
          <button type="submit" disabled={saving} className={btnPrimary}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}