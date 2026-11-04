import { Eye, EyeOff, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";

import { changePassword, deleteAvatar, updateProfile, uploadAvatar } from "../../api/profile.api";
import PageHeader from "../../components/common/PageHeader";
import UserAvatar from "../../components/common/UserAvatar";
import { useAuth } from "../../hooks/useAuth";
import { getErrorMessage } from "../../utils/errors";
import { formatDate } from "../../utils/format";
import { btnPrimary, btnSecondary, cardClass, inputClass, labelClass } from "../../utils/ui";
import { checkPassword } from "../../utils/validation";

const MAX_AVATAR_MB = 2;
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp"];

function Message({ message }) {
  if (!message?.text) return null;
  const isError = message.type === "error";
  return (
    <p role={isError ? "alert" : "status"} className={`text-sm ${isError ? "text-red-700" : "text-emerald-700"}`}>
      {message.text}
    </p>
  );
}

function PasswordField({ id, label, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={id}
          type={show ? "text" : "password"}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className={`${inputClass} pr-10`}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-500 hover:text-slate-700"
          aria-label={show ? "Hide password" : "Show password"}
        >
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user, updateUser } = useAuth();
  const fileRef = useRef(null);

  // ----- name -----
  const [name, setName] = useState(user.name);
  const [profileMsg, setProfileMsg] = useState({ type: "", text: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const nameDirty = name.trim() !== (user.name || "");

  async function handleProfileSubmit(e) {
    e.preventDefault();
    setProfileMsg({ type: "", text: "" });
    if (name.trim().length < 2) {
      return setProfileMsg({ type: "error", text: "Please enter your name (at least 2 characters)." });
    }
    setSavingProfile(true);
    try {
      const updated = await updateProfile({
        name: name.trim(),
        target_exam: user.target_exam ?? null,
      });
      updateUser(updated);
      setName(updated.name);
      setProfileMsg({ type: "success", text: "Profile saved." });
    } catch (err) {
      setProfileMsg({ type: "error", text: getErrorMessage(err) });
    } finally {
      setSavingProfile(false);
    }
  }

  function handleCancelName() {
    setName(user.name);
    setProfileMsg({ type: "", text: "" });
  }

  // ----- password -----
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [pwMsg, setPwMsg] = useState({ type: "", text: "" });
  const [savingPw, setSavingPw] = useState(false);
  const setPwField = (key) => (e) => setPw((p) => ({ ...p, [key]: e.target.value }));

  async function handlePasswordSubmit(e) {
    e.preventDefault();
    setPwMsg({ type: "", text: "" });
    const problem = checkPassword(pw.next);
    if (problem) return setPwMsg({ type: "error", text: problem });
    if (pw.next !== pw.confirm) return setPwMsg({ type: "error", text: "New passwords do not match." });
    if (!pw.current) return setPwMsg({ type: "error", text: "Enter your current password." });

    setSavingPw(true);
    try {
      await changePassword({ current_password: pw.current, new_password: pw.next });
      setPw({ current: "", next: "", confirm: "" });
      setPwMsg({ type: "success", text: "Password updated." });
    } catch (err) {
      setPwMsg({ type: "error", text: getErrorMessage(err) });
    } finally {
      setSavingPw(false);
    }
  }

  // ----- avatar -----
  const [avatarMsg, setAvatarMsg] = useState({ type: "", text: "" });
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(null);

  async function handleAvatarSelect(e) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setAvatarMsg({ type: "", text: "" });

    if (!ALLOWED_TYPES.includes(file.type)) {
      return setAvatarMsg({ type: "error", text: "Use a JPG, PNG, or WebP image." });
    }
    if (file.size > MAX_AVATAR_MB * 1024 * 1024) {
      return setAvatarMsg({ type: "error", text: `Image must be ${MAX_AVATAR_MB} MB or smaller.` });
    }

    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    setAvatarBusy(true);
    try {
      const updated = await uploadAvatar(file);
      updateUser(updated);
      setAvatarMsg({ type: "success", text: "Profile picture updated." });
    } catch (err) {
      setAvatarMsg({ type: "error", text: getErrorMessage(err) });
    } finally {
      setAvatarBusy(false);
      URL.revokeObjectURL(localPreview);
      setPreviewUrl(null);
    }
  }

  async function handleRemoveAvatar() {
    setAvatarMsg({ type: "", text: "" });
    setAvatarBusy(true);
    try {
      const updated = await deleteAvatar();
      updateUser(updated);
      setAvatarMsg({ type: "success", text: "Profile picture removed." });
    } catch (err) {
      setAvatarMsg({ type: "error", text: getErrorMessage(err) });
    } finally {
      setAvatarBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <PageHeader title="Profile settings" description="Manage your name, password, and profile picture." />

      {/* Avatar */}
      <section className={`${cardClass} p-5 sm:p-6`}>
        <h2 className="text-base font-semibold text-slate-900">Profile picture</h2>
        <p className="mt-1 text-sm text-slate-500">JPG, PNG, or WebP. Max {MAX_AVATAR_MB} MB.</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {previewUrl ? (
            <img src={previewUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
          ) : (
            <UserAvatar user={user} size="lg" />
          )}
          <div className="flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarSelect}
            />
            <button
              type="button"
              disabled={avatarBusy}
              onClick={() => fileRef.current?.click()}
              className={btnSecondary}
            >
              <Upload className="h-4 w-4" aria-hidden="true" />
              {avatarBusy ? "Uploading…" : user.avatar_url ? "Replace" : "Upload"}
            </button>
            {user.avatar_url && (
              <button type="button" disabled={avatarBusy} onClick={handleRemoveAvatar} className={btnSecondary}>
                <Trash2 className="h-4 w-4" aria-hidden="true" />
                Remove
              </button>
            )}
          </div>
        </div>
        <div className="mt-3">
          <Message message={avatarMsg} />
        </div>
      </section>

      {/* Name */}
      <section className={`${cardClass} p-5 sm:p-6`}>
        <h2 className="text-base font-semibold text-slate-900">Name</h2>
        <form onSubmit={handleProfileSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="profileName" className={labelClass}>
              Display name
            </label>
            <input
              id="profileName"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={80}
              className={`${inputClass} mt-1`}
              autoComplete="name"
            />
          </div>
          <p className="text-sm text-slate-500">
            Email: <span className="font-medium text-slate-700">{user.email}</span>
            {user.created_at ? ` · Joined ${formatDate(user.created_at)}` : null}
          </p>
          <Message message={profileMsg} />
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={savingProfile || !nameDirty} className={btnPrimary}>
              {savingProfile ? "Saving…" : "Save name"}
            </button>
            {nameDirty && (
              <button type="button" onClick={handleCancelName} className={btnSecondary} disabled={savingProfile}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      {/* Password */}
      <section className={`${cardClass} p-5 sm:p-6`}>
        <h2 className="text-base font-semibold text-slate-900">Change password</h2>
        <form onSubmit={handlePasswordSubmit} className="mt-4 space-y-4">
          <PasswordField
            id="currentPassword"
            label="Current password"
            value={pw.current}
            onChange={setPwField("current")}
            autoComplete="current-password"
          />
          <PasswordField
            id="newPassword"
            label="New password"
            value={pw.next}
            onChange={setPwField("next")}
            autoComplete="new-password"
          />
          <PasswordField
            id="confirmPassword"
            label="Confirm new password"
            value={pw.confirm}
            onChange={setPwField("confirm")}
            autoComplete="new-password"
          />
          <p className="text-xs text-slate-500">At least 8 characters, with at least one letter and one number.</p>
          <Message message={pwMsg} />
          <button type="submit" disabled={savingPw} className={btnPrimary}>
            {savingPw ? "Updating…" : "Update password"}
          </button>
        </form>
      </section>
    </div>
  );
}