import React, { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Activity,
  BarChart3,
  Box,
  CheckCircle2,
  ChevronDown,
  ChevronsUpDown,
  ClipboardEdit,
  Database,
  FileSpreadsheet,
  FileText,
  Hammer,
  Inbox,
  Image as ImageIcon,
  IndianRupee,
  LayoutDashboard,
  Lock,
  LogOut,
  MapPinned,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  Settings2,
  ShieldCheck,
  ShoppingCart,
  Users,
  Wallet,
  Workflow,
  Contact,
} from "lucide-react";

const cx = (...classes) => classes.filter(Boolean).join(" ");
const API = import.meta.env.VITE_API_URL || "http://localhost:3000";

const TAB_MODULE_KEY = {
  global_dashboard: "global_dashboard",
  approvals: "inbox",
  approvals__orders: "order",
  approvals__intake: "intake",
  approvals__payments: "payment_request",
  master_data__vendor:   "master_data_vendor",
  master_data__products: "master_data_products",
  master_data__orders:   "master_data_orders",
  master_data__intakes:  "master_data_intakes",
  audit: "audit",
  proc_setup__contact_list: "contact_list",
  proc_setup__company_list: "company_list",
  proc_setup__site_list: "site_list",
  proc_setup__vendor_list: "vendor_list",
  proc_setup__item_list: "item_list",
  proc_setup__category_list: "category_list",
  proc_setup__uom: "uom",
  proc_setup__term_condition: "term_condition",
  proc_setup__payment_terms: "payment_terms",
  proc_setup__payment_clauses: "payment_terms",
  proc_setup__government_laws: "government_laws",
  proc_setup__annexure: "annexure",
  dashboard: "dashboard",
  view_3d: "view_3d",
  procurement__intake: "intake",
  procurement__orders: "order",
  inventory__received_material_grn: "received_record",
  inventory__stock_inventory: "stock_available",
  inventory__material_issue: "consumption_record",
  operations__work_activity: "execution_plan",
  operations__staff_attendance: "staff_attendance",
  operations__manpower: "daily_manpower",
  finance__payment_request: "payment_request",
  finance__site_expense: "site_expense",
  finance__petty_cash: "petty_cash",
  finance__bills_documents: "bills_docs",
  confidential__loa: "loa",
  confidential__boq: "boq",
  confidential__drawings: "drawings",
  confidential__ra_bills: "ra_bills",
};

const globalRows = [
  { id: "global_dashboard", label: "Global Dashboard", icon: LayoutDashboard, description: "Overall overview of all projects" },
  { id: "approvals", label: "Inbox", icon: Inbox, description: "Pending approvals (Intake, Orders, Payments etc.)" },
];

const managementRows = [
  { id: "audit", label: "Audit", icon: Activity, description: "System audit logs and history" },
];

const masterDataRows = [
  { id: "master_data__vendor", label: "Vendor Master" },
  { id: "master_data__products", label: "Products Master" },
  { id: "master_data__orders", label: "Orders Master" },
  { id: "master_data__intakes", label: "Intakes Master" },
];

const setupRows = [
  { id: "proc_setup__company_list", label: "Company", description: "Manage companies" },
  { id: "proc_setup__site_list", label: "Site", description: "Manage sites / locations" },
  { id: "proc_setup__vendor_list", label: "Vendor", description: "Manage vendors" },
  { id: "proc_setup__item_list", label: "Item", description: "Manage items" },
  { id: "proc_setup__contact_list", label: "Contact", description: "Manage contacts" },
  { id: "proc_setup__category_list", label: "Category", description: "Manage categories" },
  { id: "proc_setup__uom", label: "UOM", description: "Units of measurement" },
];

const clauseRows = [
  { id: "proc_setup__term_condition", label: "Terms & Conditions", description: "Define terms and conditions" },
  { id: "proc_setup__payment_terms", label: "Payment Terms", description: "Manage payment terms" },
  { id: "proc_setup__government_laws", label: "Government Laws", description: "Government laws and regulations" },
  { id: "proc_setup__annexure", label: "Annexure", description: "Manage annexures and documents" },
];

const projectSections = [
  {
    key: "project",
    label: null,
    icon: LayoutDashboard,
    rows: [
      { id: "dashboard", label: "Dashboard", icon: BarChart3, description: "Project overview, progress, summary" },
      { id: "view_3d", label: "3D View", icon: Box, description: "Project 3D model visualization" },
    ],
  },
  {
    key: "procurement",
    label: "Procurement",
    icon: ShoppingCart,
    rows: [
      { id: "procurement__intake", label: "Intake", description: "Create & manage intake" },
      { id: "procurement__orders", label: "Orders", description: "Create & manage orders" },
    ],
  },
  {
    key: "inventory",
    label: "Inventory",
    icon: Package,
    rows: [
      { id: "inventory__received_material_grn", label: "Received Material (GRN)", description: "Record received material / GRN" },
      { id: "inventory__stock_inventory", label: "Stock / Inventory", description: "View stock and inventory" },
      { id: "inventory__material_issue", label: "Material Issue", description: "Issue material to sites / projects" },
    ],
  },
  {
    key: "operations",
    label: "Operations",
    icon: Hammer,
    rows: [
      { id: "operations__work_activity", label: "Work Activity", description: "Daily work activity & progress" },
      { id: "operations__staff_attendance", label: "Staff Attendance", description: "Staff attendance tracking" },
      { id: "operations__manpower", label: "Manpower", description: "Manpower planning & tracking" },
    ],
  },
  {
    key: "finance",
    label: "Finance",
    icon: Wallet,
    rows: [
      { id: "finance__payment_request", label: "Payment Request", description: "Payment requests" },
      { id: "finance__site_expense", label: "Site Expense", description: "Site expenses" },
      { id: "finance__petty_cash", label: "Petty Cash", description: "Petty cash entries" },
      { id: "finance__bills_documents", label: "Bills / Documents", description: "Bills and documents" },
    ],
  },
  {
    key: "confidential",
    label: "Confidential",
    icon: Lock,
    rows: [
      { id: "confidential__loa", label: "LOA", description: "Letter of Award" },
      { id: "confidential__boq", label: "BOQ", description: "Boq documents" },
      { id: "confidential__drawings", label: "Drawings", description: "Project drawings" },
      { id: "confidential__ra_bills", label: "RA Bills", description: "RA bills and documents" },
    ],
  },
];

const iconById = {
  proc_setup__company_list: Users,
  proc_setup__site_list: MapPinned,
  proc_setup__vendor_list: Users,
  proc_setup__item_list: Package,
  proc_setup__contact_list: Contact,
  proc_setup__category_list: Database,
  proc_setup__uom: FileText,
  proc_setup__term_condition: ClipboardEdit,
  proc_setup__payment_terms: IndianRupee,
  proc_setup__government_laws: ShieldCheck,
  proc_setup__annexure: ClipboardEdit,
  boq_prepare: FileSpreadsheet,
};

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

export default function Sidebar({
  activeTab = "global_dashboard",
  setActiveTab,
  selectedProject,
  setSelectedProject,
  isCollapsed,
  setIsCollapsed,
  onLogout,
  isMobile = false,
  userName = "Test User",
  userEmail = "office@bms.com",
  currentUser: currentUserProp = null,
  projects: projectsProp = null,
  userTabPermissions = null,
}) {
  const currentUser = currentUserProp || (() => {
    try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); } catch { return {}; }
  })();
  const [openSections, setOpenSections] = useState({
    setup: false,
    master_data: false,
    clauses: false,
    procurement: false,
    inventory: false,
    operations: false,
    finance: false,
    confidential: false,
  });

  useEffect(() => {
    if (isCollapsed) {
      setOpenSections({
        setup: false,
        master_data: false,
        clauses: false,
        procurement: false,
        inventory: false,
        operations: false,
        finance: false,
        confidential: false,
      });
    }
  }, [isCollapsed]);
  const [projOpen, setProjOpen] = useState(false);
  const [approvalCount, setApprovalCount] = useState(0);
  const collapsed = isMobile ? false : isCollapsed;
  const isGlobalAdmin = currentUser.role === "global_admin";
  const projects = projectsProp || [];
  const userDisplayName = currentUser.name || userName;
  const userDisplayEmail = currentUser.email || userEmail;
  const initials = userDisplayName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase();

  const visibleProjects = useMemo(() => projects.filter((p) => {
    const name = typeof p === "string" ? p : p.name;
    return name && name !== "All Project";
  }), [projects]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [ordersRes, intakesRes, amendRes] = await Promise.all([
          fetch(`${API}/api/orders`),
          fetch(`${API}/api/intakes`),
          fetch(`${API}/api/amendments/requests`, {
            headers: { 'Authorization': `Bearer ${localStorage.getItem("bms_token") || ""}` }
          })
        ]);
        const ordersData = ordersRes.ok ? await ordersRes.json().catch(() => ({})) : {};
        const intakesData = intakesRes.ok ? await intakesRes.json().catch(() => ({})) : {};
        const amendData = amendRes.ok ? await amendRes.json().catch(() => ({})) : {};

        const orderCount = (ordersData.orders || []).filter((o) => ["Review", "Pending Issue"].includes(o?.status)).length;
        const intakeCount = (intakesData.intakes || []).filter((i) => ["submitted", "in_review"].includes(i?.status)).length;
        const amendmentCount = (amendData.requests || []).length;
        if (alive) setApprovalCount(orderCount + intakeCount + amendmentCount);
      } catch (err) {
        console.error("Sidebar fetch error:", err);
        if (alive) setApprovalCount(0);
      }
    })();
    return () => { alive = false; };
  }, []);

  const isTabVisible = (tabId) => {
    // Profile is always reachable (own account). Global Dashboard and Inbox now
    // respect their permission entries so admins can lock them down per user.
    if (tabId === "profile") return true;
    if (isGlobalAdmin) return true;
    if (!userTabPermissions) return false;
    if (!userTabPermissions.hasAny || !userTabPermissions.map) return false;
    const moduleKey = TAB_MODULE_KEY[tabId];
    if (!moduleKey) return true;
    const perm = userTabPermissions.map?.[moduleKey];
    if (!perm) return true;
    return perm.can_view === true;
  };

  const go = (id, isGlobal = false) => {
    setActiveTab(id);
    if (isGlobal) setSelectedProject(null);
  };

  const toggleSection = (key) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));

  const RowButton = ({ row, isGlobal = false, nested = false }) => {
    if (!isTabVisible(row.id)) return null;
    const Icon = row.icon || iconById[row.id];
    const isActive = activeTab === row.id || (row.id === "approvals" && activeTab.startsWith("approvals__"));
    return (
      <Tip label={row.label} show={collapsed}>
        <button
          type="button"
          onClick={() => go(row.id, isGlobal)}
          className={cx(
            "group relative w-full rounded-md border text-left transition-all duration-150",
            collapsed 
              ? "flex h-10 items-center justify-center px-0" 
              : nested 
                ? "flex items-center px-3 py-1.5" 
                : "grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2",
            isActive
              ? "border-cyan-300/18 bg-cyan-400/12 text-white"
              : "border-transparent text-slate-400 hover:text-white"
          )}
        >
          {isActive && !collapsed && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-cyan-300" />}
          
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
          <div className="flex items-center justify-center w-6">
            <Icon size={17} strokeWidth={2} className={open ? "text-cyan-300" : "text-slate-300 group-hover:text-cyan-300"} />
          </div>
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-[13px] font-medium">{label}</span>
              <ChevronRight size={13} className={cx("text-slate-500 transition-transform duration-200", open ? "rotate-90 text-cyan-400" : "")} />
            </>
          )}
        </button>
      </Tip>
    );
  };

  // True if at least one row in this list is visible to the current user.
  // Used to hide section headers entirely when every child tab is denied.
  const anyRowVisible = (rows) => rows.some(r => isTabVisible(r.id));

  const NestedRows = ({ rows }) => (
    <div className={cx("relative space-y-0.5", collapsed ? "" : "mt-1.5 ml-6 pl-3 border-l border-cyan-400/10")}>
      {rows.map((row) => <RowButton key={row.id} row={row} nested />)}
    </div>
  );

  const Group = ({ title, children, className = "" }) => (
    <section className={cx("mb-3", className)}>
      {!collapsed && title && (
        <p className="mb-1.5 px-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-cyan-100/70">
          {title}
        </p>
      )}
      <div className={cx(!collapsed && "space-y-0.5")}>
        {children}
      </div>
    </section>
  );

  return (
    <motion.aside
      initial={false}
      animate={{ width: collapsed ? "60px" : "220px" }}
      transition={{ duration: 0.22, ease: "easeInOut" }}
      className="group relative h-screen shrink-0 overflow-visible border-r border-cyan-400/15 bg-[#04111f] text-white print:hidden"
      style={{ boxShadow: "inset -1px 0 0 rgba(34,211,238,0.08)" }}
    >
      <div className="flex h-full flex-col">
        <div className={cx("relative shrink-0 border-b border-cyan-400/12", collapsed ? "px-2 py-2" : "px-4 py-2.5")}>
          <button type="button" onClick={() => collapsed && setIsCollapsed(false)} className={cx("flex w-full items-center", collapsed ? "justify-center" : "justify-start pl-1")}>
            <img src="/Z.png" alt="Zyrex ERP Solutions" className={cx("object-contain", collapsed ? "h-8 w-8" : "h-auto w-[65%]")} />
          </button>
        </div>

        {/* 🚀 MODERN FLOATING COLLAPSE TOGGLE */}
        {!isMobile && (
          <button
            onClick={() => setIsCollapsed(!collapsed)}
            className={cx(
              "absolute -right-3 top-7 z-50 flex h-6 w-6 items-center justify-center rounded-full border border-cyan-400/30 bg-[#071827] text-cyan-300 shadow-lg transition-all hover:scale-110 hover:border-cyan-300 hover:bg-cyan-400/10",
              collapsed ? "opacity-100" : "opacity-0 group-hover:opacity-100"
            )}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
          </button>
        )}

        <div className="flex-1 overflow-y-auto px-3 py-3" style={{ scrollbarWidth: "none" }}>
          <Group title="Global">
            {globalRows.map((row) => <RowButton key={row.id} row={row} isGlobal />)}
          </Group>

          {(() => {
            const setupAll       = [...setupRows, ...clauseRows];
            const setupVisible   = anyRowVisible(setupAll);
            const masterVisible  = anyRowVisible(masterDataRows);
            const mgmtVisible    = managementRows.some(r => isTabVisible(r.id));
            if (!setupVisible && !masterVisible && !mgmtVisible) return null;
            return (
              <Group title="Management">
                {setupVisible && (
                  <>
                    <SectionHeader icon={Settings2} label="Global Setup" sectionKey="setup" />
                    <AnimatePresence initial={false}>
                      {openSections.setup && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <NestedRows rows={setupAll} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {masterVisible && (
                  <>
                    <SectionHeader icon={Database} label="Master Data" sectionKey="master_data" />
                    <AnimatePresence initial={false}>
                      {openSections.master_data && (
                        <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                          <NestedRows rows={masterDataRows} />
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </>
                )}

                {managementRows.map((row) => <RowButton key={row.id} row={row} isGlobal />)}
              </Group>
            );
          })()}

          <Group title="Project Selector">
            {!collapsed ? (
              <div>
              <button
                type="button"
                onClick={() => setProjOpen(!projOpen)}
                className="flex w-full items-center justify-between rounded-md border border-cyan-400/18 bg-[#03111d] px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:border-cyan-300/35"
              >
                <span className="truncate">{selectedProject || "Select project..."}</span>
                <ChevronDown size={15} className={cx("transition-transform", projOpen ? "rotate-180" : "")} />
              </button>
              <AnimatePresence>
                {projOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    className="thin-scrollbar mt-1.5 max-h-56 overflow-y-auto rounded-md border border-cyan-400/18 bg-[#071827] p-1 shadow-xl"
                  >
                    {visibleProjects.map((p) => {
                      const name = typeof p === "string" ? p : p.name;
                      return (
                        <button
                          type="button"
                          key={name}
                          onClick={() => { setSelectedProject(name); setProjOpen(false); }}
                          className={cx(
                            "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors",
                            selectedProject === name ? "bg-cyan-400/14 text-white" : "text-slate-300 hover:bg-cyan-400/8 hover:text-white"
                          )}
                        >
                          <span className={cx("h-1.5 w-1.5 rounded-full", selectedProject === name ? "bg-white" : "bg-cyan-300")} />
                          <span className="truncate">{name}</span>
                        </button>
                      );
                    })}
                    {visibleProjects.length === 0 && <p className="px-2 py-2 text-xs text-slate-500">No active projects</p>}
                  </motion.div>
                )}
              </AnimatePresence>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsCollapsed(false)}
                title="Select project"
                className="flex h-10 w-full items-center justify-center rounded-md border border-cyan-400/15 bg-white/5 text-[10px] font-bold text-cyan-200"
              >
                {selectedProject ? selectedProject.slice(0, 3).toUpperCase() : "PRJ"}
              </button>
            )}
          </Group>

          <div className={cx(!collapsed && "space-y-1")}>
            {projectSections.map((section) => {
              // Hide the whole section if every child tab is denied
              if (!anyRowVisible(section.rows)) return null;
              return (
                <div key={section.key} className="mb-1 last:mb-0">
                  {section.label ? (
                    <SectionHeader icon={section.icon} label={section.label} sectionKey={section.key} />
                  ) : !collapsed && selectedProject ? (
                    <p className="px-2 pb-1 pt-1 text-[10.5px] font-bold uppercase tracking-[0.12em] text-cyan-100/70">
                      Project: <span className="text-cyan-300">{selectedProject}</span>
                    </p>
                  ) : null}
                  <AnimatePresence initial={false}>
                    {(section.label ? openSections[section.key] : true) && (
                      <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                        {section.label ? <NestedRows rows={section.rows} /> : <div className="space-y-1">{section.rows.map((row) => <RowButton key={row.id} row={row} />)}</div>}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 border-t border-cyan-400/12 px-3 py-3">
          {!collapsed ? (
            <div className="flex items-center gap-2 rounded-md border border-cyan-400/15 bg-cyan-400/[0.06] p-2">
              <button type="button" onClick={() => setActiveTab("profile")} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-cyan-500/20 text-sm font-bold text-cyan-100 ring-1 ring-cyan-300/30">
                  {currentUser.avatar ? <img src={currentUser.avatar} alt="" className="h-full w-full object-cover" /> : initials}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">{userDisplayName}</p>
                  <p className="truncate text-[11px] text-slate-400">{userDisplayEmail}</p>
                </div>
              </button>
              <button type="button" onClick={onLogout} title="Logout" className="rounded-md border border-cyan-400/15 p-2 text-slate-300 transition-colors hover:border-red-400/30 hover:bg-red-500/10 hover:text-red-300">
                <LogOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Tip label="Profile" show={collapsed}>
                <button type="button" onClick={() => setActiveTab("profile")} className="flex h-9 w-9 items-center justify-center rounded-full bg-cyan-500/20 text-xs font-bold text-cyan-100 ring-1 ring-cyan-300/30">
                  {initials}
                </button>
              </Tip>
              <Tip label="Logout" show={collapsed}>
                <button type="button" onClick={onLogout} className="text-slate-400 hover:text-red-300">
                  <LogOut size={15} />
                </button>
              </Tip>
            </div>
          )}
        </div>
      </div>
    </motion.aside>
  );
}
