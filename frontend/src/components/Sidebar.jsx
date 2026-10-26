import React, { useEffect, useMemo, useState } from "react";
import api from "../utils/api";
import { ZyHawkIcon, ZyAIWordmark, ZyStar } from "./ZyAILogo";
import { AnimatePresence, motion } from "framer-motion";
import { TABS, NAV } from "../utils/navConfig";
import { isTabVisible as isTabVisibleFor } from "../utils/navAccess";
import {
  Archive,
  Lock,
  Box,
  Boxes,
  ChevronDown,
  ChevronRight,
  FileSpreadsheet,
  Inbox,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  Settings2,
  ShoppingCart,
  Users,
  Wallet,
} from "lucide-react";

const cx = (...classes) => classes.filter(Boolean).join(" ");
const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

// Icons for top-level rows and sections
const ROW_ICONS = { global_dashboard: LayoutDashboard, view_3d: Box, approvals: Inbox, inventory: Boxes, historical_data: Archive };
const SECTION_ICONS = { procurement: ShoppingCart, finance: Wallet, hrms: Users, reports: FileSpreadsheet, settings: Settings2 };

// Tab ids inside a section's items (rows + sub-group rows)
const idsOf = (items) => items.flatMap(it => (typeof it === "string" ? [it] : it.items));

const Tip = ({ label, show, children }) => {
  const [xy, setXY] = useState(null);
  return (
    <div
      onMouseEnter={(e) => {
        if (!show) return;
        const r = e.currentTarget.getBoundingClientRect();
        setXY({ top: r.top + r.height / 2, left: r.right + 8 });
      }}
      onMouseLeave={() => setXY(null)}
    >
      {children}
      {show && xy && (
        <div
          style={{ position: "fixed", top: xy.top, left: xy.left, transform: "translateY(-50%)", zIndex: 9999 }}
          className="pointer-events-none whitespace-nowrap rounded-md bg-[#071827] px-2.5 py-1.5 text-xs font-medium text-white shadow-xl ring-1 ring-cyan-400/20"
        >
          {label}
        </div>
      )}
    </div>
  );
};

export default React.memo(function Sidebar({
  activeTab = "global_dashboard",
  setActiveTab,
  isCollapsed,
  setIsCollapsed,
  onLogout,
  isMobile = false,
  userName = "Test User",
  userEmail = "office@bms.com",
  currentUser: currentUserProp = null,
  userTabPermissions = null,
  onApprovalCountChange = null,
}) {
  const currentUser = useMemo(() => currentUserProp || (() => {
    try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); } catch { return {}; }
  })(), [currentUserProp]);

  // Open sections / sub-groups, keyed by their NAV key. The one holding
  // the current tab opens by itself.
  const [openSections, setOpenSections] = useState({});

  useEffect(() => {
    if (isCollapsed) setOpenSections({});
  }, [isCollapsed]);

  useEffect(() => {
    const open = {};
    const current = TABS[activeTab]?.parent || activeTab;
    NAV.forEach(n => {
      if (!n.section || !idsOf(n.items).includes(current)) return;
      open[n.section] = true;
      n.items.forEach(it => { if (typeof it !== "string" && it.items.includes(current)) open[it.group] = true; });
    });
    if (Object.keys(open).length) setOpenSections(prev => ({ ...prev, ...open }));
  }, [activeTab]);

  const [approvalCount, setApprovalCount] = useState(0);
  const [avatarUrl, setAvatarUrl] = useState(currentUser.avatar || null);

  useEffect(() => {
    setAvatarUrl(currentUser.avatar || null);
  }, [currentUser.avatar]);

  const collapsed = isMobile ? false : isCollapsed;
  const isGlobalAdmin = currentUser.role === "global_admin" || currentUser.role === "super_admin";
  const userDisplayName = currentUser.name || userName;
  const userDisplayEmail = currentUser.email || userEmail;
  const initials = userDisplayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  useEffect(() => {
    let alive = true;

    const cachedCount = localStorage.getItem("last_approval_count");
    if (cachedCount) setApprovalCount(parseInt(cachedCount, 10));

    const fetchCounts = async () => {
      try {
        const currentUserId = String(JSON.parse(localStorage.getItem("bms_user") || "{}").id || "");

        // Uses the shared `api` axios instance (not raw fetch) so an expired
        // access token gets silently refreshed-and-retried instead of these
        // counts just failing with 401 forever until the user logs back in.
        const [orderCountRes, intakesRes, amendRes, arRes, approvalRes] = await Promise.all([
          api.get(`/api/orders/pending-count?userId=${currentUserId}&isGlobalAdmin=${isGlobalAdmin}`).catch(() => ({ data: {} })),
          api.get(`/api/intakes`).catch(() => ({ data: {} })),
          api.get(`/api/amendments/requests`).catch(() => ({ data: {} })),
          api.get(`/api/action-requests/pending`).catch(() => ({ data: {} })),
          api.get(`/api/approval-flows/pending-for-me`).catch(() => ({ data: {} })),
        ]);
        const orderCountData = orderCountRes.data || {};
        const intakesData    = intakesRes.data    || {};
        const amendData      = amendRes.data      || {};
        const arData         = arRes.data         || {};
        const approvalData   = approvalRes.data   || {};

        const orderCount       = orderCountData.count || 0;
        const intakeCount      = (intakesData.intakes || []).filter((i) => ["submitted", "in_review"].includes(i?.status)).length;
        const amendmentCount   = (amendData.requests || []).length;
        const actionRequestCount = (arData.requests || []).length;
        const approvalCount    = (approvalData.requests || []).filter(r => r.can_act).length;

        const newTotal = orderCount + intakeCount + amendmentCount + actionRequestCount + approvalCount;
        if (alive) {
          setApprovalCount(newTotal);
          onApprovalCountChange?.(newTotal);
          localStorage.setItem("last_approval_count", newTotal.toString());
        }
      } catch (err) {
        if (alive) setApprovalCount(0);
      }
    };

    fetchCounts();
    const interval = setInterval(fetchCounts, 30000);

    // SSE — debounced so rapid order_updated events don't fire multiple fetches
    let es;
    let sseDebounce = null;
    const debouncedFetch = () => {
      clearTimeout(sseDebounce);
      sseDebounce = setTimeout(fetchCounts, 500);
    };
    const connectSSE = () => {
      es = new EventSource(`${API}/api/orders/events`);
      es.onmessage = (e) => {
        try {
          const d = JSON.parse(e.data);
          if (d.type === "order_updated" || d.type === "action_request_updated") debouncedFetch();
        } catch {}
      };
      es.onerror = () => { es.close(); setTimeout(connectSSE, 5000); };
    };
    connectSSE();

    return () => { alive = false; clearTimeout(sseDebounce); clearInterval(interval); if (es) es.close(); };
  }, []);

  const isTabVisible = (tabId) => isTabVisibleFor(tabId, currentUser, userTabPermissions);

  const go = (id) => {
    setActiveTab(id);
  };

  // Ctrl+K (Cmd+K on Mac) opens ZyAI from anywhere
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k" && isTabVisible("zyhawk_ai")) {
        e.preventDefault();
        go("zyhawk_ai");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const toggleSection = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  // gold: Treasury rows (gold highlight instead of cyan)
  const RowButton = ({ row, nested = false, gold = false }) => {
    if (!isTabVisible(row.id)) return null;
    const Icon = row.icon;
    const isActive = activeTab === row.id || TABS[activeTab]?.parent === row.id ||
                    (row.id === "approvals" && ["approvals", "intake", "orders", "payments", "amendments"].some(t => activeTab === t || activeTab.startsWith(t + "__")));
    return (
      <Tip label={row.label} show={collapsed}>
        <button
          type="button"
          onClick={() => go(row.id)}
          className={cx(
            "group relative w-full rounded-md border text-left transition-colors duration-100",
            collapsed 
              ? "flex h-10 items-center justify-center px-0" 
              : nested 
                ? "flex items-center px-3 py-1.5" 
                : "grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2",
            isActive
              ? (gold ? "border-amber-300/25 bg-amber-400/15 text-amber-50" : "border-cyan-300/18 bg-cyan-400/12 text-white")
              : (gold ? "border-transparent text-amber-100/60 hover:text-amber-50" : "border-transparent text-slate-400 hover:text-white")
          )}
        >
          {isActive && !collapsed && <span className={cx("absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full", gold ? "bg-amber-300" : "bg-cyan-300")} />}
          
          {!nested && (
            <span className={cx("flex items-center justify-center w-6")}>
              {Icon ? <Icon size={17} strokeWidth={isActive ? 2.5 : 2} className={isActive ? "text-cyan-300" : "text-slate-300 group-hover:text-cyan-100"} /> : <span className={cx("h-1.5 w-1.5 rounded-full", isActive ? "bg-white" : "bg-cyan-300/80")} />}
            </span>
          )}

          {!collapsed && (
            <>
              <span className={cx("min-w-0 truncate font-medium", nested ? "text-[13px]" : "text-[14px]")}>{row.label}</span>
              <span className="flex items-center gap-2">
                {row.id === "approvals" && approvalCount > 0 ? <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-bold text-white">{approvalCount}</span> : null}
              </span>
            </>
          )}
        </button>
      </Tip>
    );
  };

  const SectionHeader = ({ icon: Icon, label, sectionKey }) => {
    const open = openSections[sectionKey];
    return (
      <Tip label={label} show={collapsed}>
        <button
          type="button"
          onClick={() => toggleSection(sectionKey)}
          className={cx(
              "group flex w-full items-center rounded-md text-left transition-colors",
            collapsed ? "h-10 justify-center" : "gap-3 px-3 py-2",
            open ? "text-cyan-100" : "text-slate-400 hover:text-cyan-100"
          )}
          title={collapsed ? "" : label}
        >
          <span className="flex w-6 shrink-0 items-center justify-center">
            <Icon size={17} strokeWidth={2} className={cx("transition-colors", open ? "text-cyan-300" : "text-slate-400 group-hover:text-cyan-100")} />
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-[13.5px] font-semibold">{label}</span>
              <ChevronDown size={14} className={cx("transition-transform duration-200 text-slate-500 group-hover:text-cyan-300", open ? "rotate-180" : "")} />
            </>
          )}
        </button>
      </Tip>
    );
  };

  const NestedRows = ({ ids }) => (
    <div className={cx("relative space-y-0.5", collapsed ? "" : "mt-1.5 ml-6 pl-3 border-l border-cyan-400/10")}>
      {ids.map(id => <RowButton key={id} row={{ id, label: TABS[id].label }} nested />)}
    </div>
  );

  // Treasury: a gold "vault" box, set apart from the rest of Finance
  const SecureGroup = ({ group, ids }) => {
    const open = !!openSections[group.group];
    if (collapsed) {
      return (
        <div className="mt-1 rounded-md border border-amber-400/25 bg-amber-400/[0.06]">
          {ids.map(id => <RowButton key={id} row={{ id, label: TABS[id].label }} nested gold />)}
        </div>
      );
    }
    return (
      <div className="mt-2 pt-2 border-t border-dashed border-amber-300/20">
        <div className="rounded-lg border border-amber-400/25 bg-gradient-to-b from-amber-400/[0.09] to-amber-400/[0.02] shadow-[inset_0_1px_0_rgba(251,191,36,0.12)]">
          <button type="button" onClick={() => toggleSection(group.group)}
            className="group flex w-full items-center gap-2 px-2.5 py-2 text-left">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-amber-400/15 ring-1 ring-amber-300/25">
              <Lock size={12} strokeWidth={2.4} className="text-amber-300" />
            </span>
            <span className="flex-1 truncate text-[13.5px] font-semibold text-amber-100">{group.label}</span>
            <ChevronRight size={13} className={cx("transition-transform duration-200 text-amber-300/60", open ? "rotate-90" : "")} />
          </button>
          <AnimatePresence initial={false}>
            {open && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="px-1.5 pb-1.5 space-y-0.5">
                  {ids.map(id => <RowButton key={id} row={{ id, label: TABS[id].label }} nested gold />)}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    );
  };

  // Collapsible sub-group inside a section (e.g. Procurement › Registration)
  const SubGroup = ({ group }) => {
    const ids = group.items.filter(isTabVisible);
    if (!ids.length) return null;
    if (group.secure) return <SecureGroup group={group} ids={ids} />;
    const open = !!openSections[group.group];
    if (collapsed) return <NestedRows ids={ids} />;
    return (
      <div>
        <button type="button" onClick={() => toggleSection(group.group)}
          className={cx("group flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-left transition-colors",
            open ? "text-cyan-100" : "text-slate-400 hover:text-white")}>
          <span className="flex-1 truncate text-[13px] font-semibold">{group.label}</span>
          <ChevronRight size={13} className={cx("transition-transform duration-200 text-slate-500", open ? "rotate-90" : "")} />
        </button>
        <AnimatePresence initial={false}>
          {open && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="ml-3 pl-3 border-l border-cyan-400/10 space-y-0.5">
                {ids.map(id => <RowButton key={id} row={{ id, label: TABS[id].label }} nested />)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  const Section = ({ node }) => {
    if (!idsOf(node.items).some(isTabVisible)) return null;
    return (
      <div className="mb-0.5">
        <SectionHeader icon={SECTION_ICONS[node.section]} label={node.label} sectionKey={node.section} />
        <AnimatePresence initial={false}>
          {openSections[node.section] && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className={cx("relative space-y-0.5", collapsed ? "" : "mt-1 ml-6 pl-1 border-l border-cyan-400/10")}>
                {node.items.map(it => typeof it === "string"
                  ? (isTabVisible(it) && <RowButton key={it} row={{ id: it, label: TABS[it].label }} nested />)
                  : <SubGroup key={it.group} group={it} />)}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  };

  return (
    <aside
      className={cx(
        "group relative h-svh shrink-0 overflow-hidden border-r border-cyan-400/15 bg-[#04111f] text-white transition-[width] duration-[220ms] ease-in-out print:hidden",
        collapsed ? "w-[60px]" : "w-[220px]"
      )}
      style={{ boxShadow: "inset -1px 0 0 rgba(34,211,238,0.08)", willChange: "width" }}
    >
      <div className="flex h-full flex-col">
        <div className={cx("relative shrink-0 border-b border-cyan-400/12", collapsed ? "px-2 py-2" : "px-4 py-3")}>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => collapsed && setIsCollapsed(false)}
              className={cx("flex items-center transition-all", collapsed ? "w-full justify-center hover:scale-110" : "pl-1")}
              title={collapsed ? "Expand Sidebar" : ""}
            >
              <img src="/Z.png" alt="Zyhawk ERP Solutions" className={cx("object-contain", collapsed ? "h-9 w-9" : "h-7 w-auto")} />
            </button>
            {!collapsed && !isMobile && (
              <button
                onClick={() => setIsCollapsed(true)}
                className="flex h-7 w-7 items-center justify-center rounded-md border border-cyan-400/15 bg-cyan-400/5 text-slate-400 hover:text-cyan-300 hover:border-cyan-400/30 transition-all"
                title="Collapse"
              >
                <PanelLeftClose size={15} />
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "none" }}>
          <div className={cx(!collapsed && "space-y-0.5")}>
            {NAV.map(node => node.row
              ? <RowButton key={node.row} row={{ id: node.row, label: TABS[node.row].label, icon: ROW_ICONS[node.row] }} />
              : <Section key={node.section} node={node} />)}
          </div>
        </div>

        <div className="shrink-0 border-t border-cyan-400/12 px-3 py-3">
          {/* ZyAI — just the hawk + "ZyAI" logo, row-sized, no box. The glow stays
              still; two tiny stars (wing tip, corner of "AI") take turns to twinkle
              every few seconds; on hover the wing flaps once (index.css). Ctrl+K opens it too. */}
          {isTabVisible("zyhawk_ai") && (
            <Tip label="ZyAI (Ctrl K)" show={collapsed}>
              <button type="button" onClick={() => go("zyhawk_ai")} title={collapsed ? undefined : "ZyAI (Ctrl K)"}
                className={cx("zy-ai-btn zy-ai-glow mb-2 flex h-9 w-full items-center rounded-md transition-colors",
                  collapsed ? "justify-center" : "gap-2 px-2.5",
                  activeTab === "zyhawk_ai" ? "bg-white/[0.07]" : "hover:bg-white/[0.05]")}>
                <span className="relative inline-flex">
                  <ZyHawkIcon size={20} className="zy-ai-hawk" />
                  <ZyStar className="zy-ai-star -right-1.5 -top-1.5" />
                </span>
                {!collapsed && (
                  <span className="zy-ai-word relative">
                    <ZyAIWordmark size={15} vivid />
                    <ZyStar className="zy-ai-star zy-ai-star-2 -right-1.5 -top-1" />
                  </span>
                )}
              </button>
            </Tip>
          )}
          {!collapsed ? (
            <div className="flex items-center gap-2 rounded-md border border-cyan-400/15 bg-cyan-400/[0.06] p-2">
              <button type="button" onClick={() => setActiveTab("profile")} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cyan-500/20 text-sm font-bold text-cyan-100 ring-1 ring-cyan-300/30">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setAvatarUrl(null)}
                    />
                  ) : initials}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-white">{userDisplayName}</p>
                  <p className="truncate text-[10px] text-cyan-200/50">{userDisplayEmail}</p>
                </div>
              </button>
              <button
                type="button"
                onClick={onLogout}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-500/10 hover:text-rose-400"
                title="Sign out"
              >
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Tip label="Profile" show={collapsed}>
                <button type="button" onClick={() => setActiveTab("profile")} className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-100 ring-1 ring-cyan-300/30">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      onError={() => setAvatarUrl(null)}
                    />
                  ) : initials}
                </button>
              </Tip>
              <button type="button" onClick={onLogout} className="flex h-9 w-9 items-center justify-center rounded-md text-slate-400 hover:text-rose-400">
                <LogOut size={16} />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
});
