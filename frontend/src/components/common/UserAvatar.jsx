import { getInitials } from "../../utils/format";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "");

/**
 * Shows the user's profile picture, or initials when none is set.
 * size: "sm" (36px) | "md" (40px) | "lg" (80px)
 */
export default function UserAvatar({ user, size = "sm", className = "" }) {
  const px = size === "lg" ? 80 : size === "md" ? 40 : 36;
  const text = size === "lg" ? "text-xl" : "text-sm";
  const base = `flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-purple-600 to-pink-500 font-semibold text-white shadow-sm ring-2 ring-white ${text}`;

  let src = null;
  if (user?.avatar_url) {
    const path = user.avatar_url.startsWith("http")
      ? user.avatar_url
      : `${API_BASE}${user.avatar_url.startsWith("/") ? "" : "/"}${user.avatar_url}`;
    src = `${path}${path.includes("?") ? "&" : "?"}t=${encodeURIComponent(String(user.id || ""))}-${encodeURIComponent(user.name || "")}`;
  }

  if (src) {
    return (
      <img
        src={src}
        alt=""
        width={px}
        height={px}
        className={`${base} ${className}`}
        style={{ width: px, height: px, objectFit: "cover" }}
      />
    );
  }

  return (
    <span className={`${base} ${className}`} style={{ width: px, height: px }} aria-hidden="true">
      {getInitials(user?.name)}
    </span>
  );
}