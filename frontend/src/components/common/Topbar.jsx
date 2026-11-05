import { Menu, X } from "lucide-react";
import { useLocation } from "react-router-dom";

import UserAvatar from "./UserAvatar";
import { useAuth } from "../../hooks/useAuth";

function titleFor(pathname) {
  if (pathname.startsWith("/admin")) return "Admin area";
  if (pathname.startsWith("/subjects") || pathname.startsWith("/chapters")) return "Subjects";
  if (pathname.startsWith("/practice")) return "Practice";
  if (pathname.startsWith("/exams")) return "Exams";
  if (pathname.startsWith("/weak-spots")) return "Weak spots";
  if (pathname.startsWith("/profile")) return "My profile";
  if (pathname.startsWith("/dashboard")) return "Dashboard";
  return "Gov IT Prep Portal";
}

export default function Topbar({ onMenuClick, menuOpen = false }) {
  const { user } = useAuth();
  const { pathname } = useLocation();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      {/* Soft gradient line under the bar */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-linear-to-r from-transparent via-purple-400/60 to-transparent"
        aria-hidden="true"
      />

      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onMenuClick}
          aria-label={menuOpen ? "Close menu" : "Open menu"}
          aria-expanded={menuOpen}
          aria-controls="app-sidebar"
          className="rounded-xl p-2 text-slate-600 transition hover:bg-purple-50 hover:text-purple-700 focus-visible:outline-2 focus-visible:outline-purple-600"
        >
          {menuOpen ? (
            <X className="h-6 w-6" aria-hidden="true" />
          ) : (
            <Menu className="h-6 w-6" aria-hidden="true" />
          )}
        </button>
        <h1 className="truncate text-lg font-semibold tracking-tight text-slate-900">{titleFor(pathname)}</h1>
      </div>

      <div className="flex items-center gap-3">
        <div className="hidden text-right sm:block">
          <p className="text-sm font-semibold text-slate-900">{user?.name}</p>
          <p className="text-xs capitalize text-slate-500">{user?.role}</p>
        </div>
        <UserAvatar user={user} size="sm" />
      </div>
    </header>
  );
}