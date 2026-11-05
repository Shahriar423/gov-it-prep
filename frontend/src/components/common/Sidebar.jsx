import {
  BookOpen,
  FileSearch,
  FileText,
  GraduationCap,
  HelpCircle,
  History,
  Layers,
  LayoutDashboard,
  Library,
  ListChecks,
  LogOut,
  PenLine,
  RotateCcw,
  ShieldCheck,
  Timer,
  User,
  X,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { useAuth } from "../../hooks/useAuth";
import UserAvatar from "./UserAvatar";

const MAIN_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/subjects", label: "Subjects", icon: BookOpen },
  { to: "/practice", label: "Practice", icon: ListChecks },
  { to: "/exams", label: "Exams", icon: Timer, end: true },
  { to: "/exams/history", label: "Exam history", icon: History },
  { to: "/weak-spots", label: "Weak spots", icon: RotateCcw },
  { to: "/profile", label: "Profile", icon: User },
];

const ADMIN_ITEMS = [
  { to: "/admin", label: "Admin overview", icon: ShieldCheck, end: true },
  { to: "/admin/subjects", label: "Subjects & chapters", icon: Library },
  { to: "/admin/exam-structure", label: "Exam structure", icon: Layers },
  { to: "/admin/materials", label: "Source materials", icon: FileText },
  { to: "/admin/previous-year", label: "Previous-year papers", icon: FileSearch },
  { to: "/admin/questions", label: "Question bank", icon: HelpCircle },
  { to: "/admin/written-questions", label: "Written questions", icon: PenLine },
];

const navLinkClass = ({ isActive }) =>
  `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-purple-600 ${
    isActive
      ? "bg-linear-to-r from-purple-600 to-pink-500 text-white shadow-md shadow-purple-500/25"
      : "text-slate-600 hover:bg-purple-50 hover:text-purple-700"
  }`;

export default function Sidebar({ onNavigate, onClose }) {
  const { user, logout } = useAuth();

  return (
    <div id="app-sidebar" className="flex h-full flex-col bg-white">
      {/* Brand */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-linear-to-br from-purple-600 to-pink-500 text-white shadow-md shadow-purple-500/30">
            <GraduationCap className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-bold text-slate-900">Gov IT Prep</p>
            <p className="text-xs text-slate-500">Learning portal</p>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close menu"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav aria-label="Main" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
        <ul className="space-y-1">
          {MAIN_ITEMS.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={navLinkClass} onClick={onNavigate}>
                <Icon className="h-5 w-5" aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>

        {user?.role === "admin" && (
          <div>
            <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Administration
            </p>
            <ul className="space-y-1">
              {ADMIN_ITEMS.map(({ to, label, icon: Icon, end }) => (
                <li key={to}>
                  <NavLink to={to} end={end} className={navLinkClass} onClick={onNavigate}>
                    <Icon className="h-5 w-5" aria-hidden="true" />
                    {label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        )}
      </nav>

      {/* User + logout */}
      <div className="shrink-0 border-t border-slate-200 p-3">
        <div className="flex items-center gap-3 rounded-xl bg-linear-to-r from-purple-50 to-pink-50 px-3 py-2.5">
          <UserAvatar user={user} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{user?.name}</p>
            <p className="truncate text-xs capitalize text-slate-500">{user?.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => {
            onNavigate?.();
            logout();
          }}
          className="mt-2 flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-purple-600"
        >
          <LogOut className="h-5 w-5" aria-hidden="true" />
          Log out
        </button>
      </div>
    </div>
  );
}