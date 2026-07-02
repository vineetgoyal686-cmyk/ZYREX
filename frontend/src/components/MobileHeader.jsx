import React from "react";
import { Bell, Menu } from "lucide-react";

const initials = (name = "") =>
  name.split(" ").filter(Boolean).map(n => n[0]).join("").slice(0, 2).toUpperCase();

export default function MobileHeader({ onMenuOpen, onInbox, onProfile, currentUser, approvalCount = 0 }) {
  const userName = currentUser?.name || currentUser?.full_name || "User";
  const avatar   = currentUser?.avatar || null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-4 gap-3 md:hidden"
      style={{ background: "#04111f", boxShadow: "0 1px 0 rgba(34,211,238,0.10)" }}
    >
      {/* Hamburger */}
      <button
        onClick={onMenuOpen}
        className="shrink-0 text-slate-300 hover:text-white transition-colors p-1 -ml-1"
      >
        <Menu size={22} />
      </button>

      {/* Logo only */}
      <div className="flex items-center flex-1 min-w-0">
        <img src="/Z.png" alt="Zyhawk" className="h-8 object-contain shrink-0" />
      </div>

      {/* Bell — goes to inbox */}
      <button
        onClick={onInbox}
        className="relative shrink-0 text-slate-300 hover:text-white transition-colors p-1.5"
      >
        <Bell size={20} />
        {approvalCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center px-1 leading-none">
            {approvalCount > 99 ? "99+" : approvalCount}
          </span>
        )}
      </button>

      {/* Avatar — goes to profile */}
      <button onClick={onProfile} className="shrink-0">
        {avatar ? (
          <img
            src={avatar}
            alt={userName}
            className="w-8 h-8 rounded-full object-cover border border-cyan-400/30"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-cyan-500/20 text-cyan-100 text-xs font-bold flex items-center justify-center ring-1 ring-cyan-300/30">
            {initials(userName)}
          </div>
        )}
      </button>
    </div>
  );
}
