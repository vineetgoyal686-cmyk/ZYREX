import React, { useState, useEffect, lazy, Suspense } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Sidebar, { TAB_MODULE_KEY } from "./components/Sidebar";
import { useScreenTimeTracker } from "./hooks/useScreenTimeTracker";
import MobileHeader from "./components/MobileHeader";
import MobileBottomNav from "./components/MobileBottomNav";

// ── Route ↔ Tab mapping ──────────────────────────────────────────────────────

// Global routes (no project)
const ROUTE_TO_TAB = {
  "/dashboard":                   "global_dashboard",
  "/inbox":                       "approvals",
  "/profile":                     "profile",
  "/organisation":                "organisation",
  "/audit":                       "audit",
  "/historical-data":             "historical_data",
  "/create/order":                "create__order",
  "/create/intake":               "create__intake",
  "/setup/vendors":               "proc_setup__vendor_list",
  "/setup/items":                 "proc_setup__item_list",
  "/setup/categories":            "proc_setup__category_list",
  "/setup/uom":                   "proc_setup__uom",
  "/setup/clauses/terms":         "proc_setup__term_condition",
  "/setup/clauses/payment":       "proc_setup__payment_terms",
  "/setup/clauses/laws":          "proc_setup__government_laws",
  "/setup/clauses/annexures":     "proc_setup__annexure",
  "/master-data":                 "master_data",
  "/master-data/vendors":         "master_data__vendor",
  "/master-data/clauses":         "master_data__clauses",
  "/master-data/products":        "master_data__products",
  "/master-data/orders":          "master_data__orders",
  "/master-data/intakes":         "master_data__intakes",
  "/organisation/structure":      "organisation__structure",
  "/organisation/sop":            "organisation__sop",
};

const TAB_TO_ROUTE = Object.fromEntries(
  Object.entries(ROUTE_TO_TAB).map(([path, tab]) => [tab, path])
);

// Project-specific sub-paths (appended after /p/:project)
const PROJECT_SUB_TO_TAB = {
  "/dashboard":                   "dashboard",
  "/3d":                          "view_3d",
  "/procurement/intake":          "procurement__intake",
  "/procurement/orders":          "procurement__orders",
  "/inventory/grn":               "inventory__received_material_grn",
  "/inventory/stock":             "inventory__stock_inventory",
  "/inventory/issues":            "inventory__material_issue",
  "/operations/work":             "operations__work_activity",
  "/operations/attendance":       "operations__staff_attendance",
  "/operations/manpower":         "operations__manpower",
  "/finance/payment":             "finance__payment_request",
  "/finance/expenses":            "finance__site_expense",
  "/finance/petty-cash":          "finance__petty_cash",
  "/finance/bills":               "finance__bills_documents",
  "/confidential/loa":            "confidential__loa",
  "/confidential/boq":            "confidential__boq",
  "/confidential/drawings":       "confidential__drawings",
  "/confidential/ra-bills":       "confidential__ra_bills",
};

const PROJECT_TAB_TO_SUB = Object.fromEntries(
  Object.entries(PROJECT_SUB_TO_TAB).map(([sub, tab]) => [tab, sub])
);

function pathToTabAndProject(pathname) {
  if (pathname.startsWith("/p/")) {
    const rest = pathname.slice(3); // strip "/p/"
    const slashIdx = rest.indexOf("/");
    if (slashIdx === -1) return { tab: "dashboard", project: decodeURIComponent(rest) };
    const project = decodeURIComponent(rest.slice(0, slashIdx));
    const sub = rest.slice(slashIdx);
    const tab = PROJECT_SUB_TO_TAB[sub] || "dashboard";
    return { tab, project };
  }
  const tab = ROUTE_TO_TAB[pathname] || "global_dashboard";
  return { tab, project: null };
}

function buildPath(tab, project) {
  const projectSub = PROJECT_TAB_TO_SUB[tab];
  if (projectSub && project && project !== "All Project") {
    return `/p/${encodeURIComponent(project)}${projectSub}`;
  }
  return TAB_TO_ROUTE[tab] || "/dashboard";
}

// ── Page imports (lazy — each page loads only when first visited) ─────────────

const Profile        = lazy(() => import("./pages/Profile"));
const Organisation   = lazy(() => import("./pages/Organisation"));
const MasterData     = lazy(() => import("./pages/MasterData"));
const ClauseMasterData = lazy(() => import("./pages/ClauseMasterData"));
const Approvals      = lazy(() => import("./pages/Approvals"));
const View3D         = lazy(() => import("./pages/Model"));
const Dashboard      = lazy(() => import("./pages/Dashboard"));
const LOA            = lazy(() => import("./pages/confidential/LOA"));
const BOQ            = lazy(() => import("./pages/confidential/BOQ"));
const Drawings       = lazy(() => import("./pages/confidential/Drawings"));
const RABills        = lazy(() => import("./pages/confidential/RABills"));
const SiteExpense    = lazy(() => import("./pages/Finance/SiteExpense"));
const PettyCash      = lazy(() => import("./pages/Finance/PettyCash"));
const BillsDocs      = lazy(() => import("./pages/Finance/BillsDocs"));
const ExecutionPlan  = lazy(() => import("./pages/WorkActivity/ExecutionPlan"));
const DailyManpower  = lazy(() => import("./pages/Manpower/DailyManpower"));
const ReceivedRecord = lazy(() => import("./pages/Store/ReceivedRecord"));
const ConsumptionRecord = lazy(() => import("./pages/Store/ConsumptionRecord"));
const StockAvailable = lazy(() => import("./pages/Store/StockAvailable"));
const GlobalCreateOrder = lazy(() => import("./pages/Create/CreateOrder"));
const IntakeList     = lazy(() => import("./pages/Create/IntakeList"));
const ItemList       = lazy(() => import("./pages/Procurement/ItemList"));
const VendorList     = lazy(() => import("./pages/Procurement/VendorList"));
const TermCondition  = lazy(() => import("./pages/Procurement/clauses/TermCondition"));
const PaymentTerms   = lazy(() => import("./pages/Procurement/clauses/PaymentTerms"));
const GovernmentLaws = lazy(() => import("./pages/Procurement/clauses/GovernmentLaws"));
const UOMList        = lazy(() => import("./pages/Procurement/UOMList"));
const CategoryList   = lazy(() => import("./pages/Procurement/CategoryList"));
const AnnexureMaster = lazy(() => import("./pages/Procurement/clauses/AnnexureMaster"));
const Attendance     = lazy(() => import("./pages/Attendance/Attendance"));
const HistoricalData = lazy(() => import("./pages/HistoricalData"));

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const SIDEBAR_EXPANDED_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 60;

// ── Chunk load error boundary ────────────────────────────────────────────────
// After a new deploy, a tab left open on the old bundle can try to fetch a
// lazy-loaded chunk that no longer exists (404). Suspense doesn't catch that
// rejection, so it crashes to a blank screen. Reload once to pick up the
// fresh bundle instead of leaving the user stuck.
class ChunkErrorBoundary extends React.Component {
  state = { hasError: false, isChunkError: false };

  static getDerivedStateFromError(error) {
    const msg = String(error?.message || "");
    const isChunkError = /dynamically imported module|Failed to fetch|Loading chunk|import\(\)/i.test(msg);
    return { hasError: true, isChunkError };
  }

  componentDidCatch() {
    const reloadedKey = "bms_chunk_error_reloaded";
    if (this.state.isChunkError && !sessionStorage.getItem(reloadedKey)) {
      sessionStorage.setItem(reloadedKey, "1");
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      if (this.state.isChunkError) {
        return (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
            <div className="w-8 h-8 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" />
            <p className="text-sm">Loading latest version…</p>
          </div>
        );
      }
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
          <p className="text-sm">Something went wrong loading this page.</p>
          <button onClick={() => window.location.reload()}
            className="px-4 py-2 text-sm font-semibold bg-slate-700 text-white rounded hover:bg-slate-800 transition-colors">
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── AppLayout (authenticated shell) ─────────────────────────────────────────

function AppLayout({
  activeTab, selectedProject, projects,
  onTabChange, onProjectChange, onLogout,
  userRole, currentUser, userTabPermissions,
  editingOrderId, setEditingOrderId,
  isCollapsed, setIsCollapsed,
  onCurrentUserUpdate, onProjectsRefresh,
}) {
  const [isMobile, setIsMobile] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [approvalCount, setApprovalCount] = useState(0);

  useEffect(() => {
    const check = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (!mobile) setMobileOpen(false);
    };
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const renderPage = () => {
    if (activeTab === "global_dashboard")     return <Dashboard project="All Project" />;
    if (activeTab === "profile")              return <Profile onProfileUpdate={onCurrentUserUpdate} onProjectsUpdate={onProjectsRefresh} />;
    if (activeTab === "organisation" || activeTab === "organisation__structure" || activeTab === "organisation__sop")
      return <Organisation currentUser={currentUser} />;
    if (activeTab === "historical_data")      return <HistoricalData />;

    if (["approvals","intake","orders","amendments","payments"].includes(activeTab))
      return <Approvals />;

    if (activeTab === "create__intake")       return <IntakeList />;
    if (activeTab === "create__order")        return <GlobalCreateOrder editOrderId={editingOrderId} onEditComplete={() => setEditingOrderId(null)} />;

    if (activeTab === "proc_setup__vendor_list")     return <VendorList />;
    if (activeTab === "proc_setup__item_list")        return <ItemList />;
    if (activeTab === "proc_setup__category_list")    return <CategoryList />;
    if (activeTab === "proc_setup__uom")              return <UOMList />;
    if (activeTab === "proc_setup__term_condition")   return <TermCondition />;
    if (activeTab === "proc_setup__payment_terms")    return <PaymentTerms />;
    if (activeTab === "proc_setup__government_laws")  return <GovernmentLaws />;
    if (activeTab === "proc_setup__annexure")         return <AnnexureMaster />;

    if (activeTab === "master_data" || activeTab === "master_data__vendor")
      return <MasterData view="vendor" />;
    if (activeTab === "master_data__clauses")  return <ClauseMasterData />;

    if (activeTab === "master_data__intakes")  return <IntakeList />;

    if (activeTab === "master_data__orders")
      return <GlobalCreateOrder editOrderId={editingOrderId} onEditComplete={() => setEditingOrderId(null)} />;

    if (activeTab === "master_data__products")
      return <ComingSoon label="PRODUCTS MASTER" />;
    if (activeTab === "audit") return <ComingSoon label="Audit" />;

    // Project-specific tabs
    if (!selectedProject || selectedProject === "All Project" || selectedProject === "select-project") {
      return (
        <div className="flex min-h-screen items-center justify-center p-4 md:p-10 bg-[#f8fafc]">
          <div className="bg-white p-8 md:p-20 rounded-2xl md:rounded-[3rem] shadow-sm border border-slate-100 flex items-center justify-center w-full max-w-4xl">
            <p className="text-slate-400 font-bold uppercase tracking-wider md:tracking-[0.3em] text-center text-sm md:text-base">
              Please select a project first
            </p>
          </div>
        </div>
      );
    }

    switch (activeTab) {
      case "dashboard":                        return <Dashboard project={selectedProject} />;
      case "view_3d":                          return <View3D project={selectedProject} />;
      case "procurement__orders":             return <GlobalCreateOrder project={selectedProject} editOrderId={editingOrderId} onEditComplete={() => setEditingOrderId(null)} />;
      case "procurement__intake":             return <IntakeList project={selectedProject} />;
      case "inventory__received_material_grn":
      case "inventory__stock_inventory":
      case "inventory__material_issue":
      case "operations__work_activity":
      case "operations__staff_attendance":
      case "operations__manpower":
      case "finance__payment_request":
      case "finance__site_expense":
      case "finance__petty_cash":
      case "finance__bills_documents":
      case "confidential__loa":
      case "confidential__boq":
      case "confidential__drawings":
      case "confidential__ra_bills":          return <ComingSoon label="Coming Soon" />;
      default:
        return (
          <div className="flex min-h-screen items-center justify-center text-slate-400 font-bold text-xl uppercase tracking-widest">
            Page not created yet: {activeTab}
          </div>
        );
    }
  };

  const isMobileVal = isMobile;

  const mainPaddingClass = (() => {
    if (isMobileVal) return "pt-14 pb-[60px] px-0";
    if (activeTab === "profile") return "pt-0 px-0 pb-4 bg-[#f0f2f5]";
    if (activeTab === "organisation") return "pt-0 px-0 pb-0";
    if (["create__order","procurement__orders","master_data__orders",
         "procurement__intake","master_data__intakes","create__intake",
         "historical_data"].includes(activeTab))
      return "pt-0 px-0 pb-0 bg-[#f0f2f5]";
    return "pt-2 sm:pt-3 lg:pt-4 px-3 sm:px-4 lg:px-6 pb-4";
  })();

  return (
    <div className="flex h-svh min-h-0 overflow-hidden bg-[#f8fafc]">

      {/* Mobile header — only on small screens */}
      {isMobileVal && (
        <MobileHeader
          currentUser={currentUser}
          approvalCount={approvalCount}
          onMenuOpen={() => setMobileOpen(true)}
          onInbox={() => { onTabChange("approvals"); setMobileOpen(false); }}
          onProfile={() => { onTabChange("profile"); setMobileOpen(false); }}
        />
      )}

      {/* Sidebar drawer */}
      <div
        className={`fixed top-0 left-0 h-full z-40 transition-transform duration-300 ${
          isMobileVal ? (mobileOpen ? "translate-x-0" : "-translate-x-full") : "translate-x-0"
        }`}
      >
        <Sidebar
          activeTab={activeTab}
          setActiveTab={(tab) => { onTabChange(tab); if (isMobileVal) setMobileOpen(false); }}
          userRole={userRole}
          onLogout={onLogout}
          selectedProject={selectedProject}
          setSelectedProject={onProjectChange}
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          isMobile={isMobileVal}
          onClose={() => setMobileOpen(false)}
          currentUser={currentUser}
          projects={projects}
          userTabPermissions={userTabPermissions}
          onApprovalCountChange={setApprovalCount}
        />
      </div>

      {/* Sidebar backdrop on mobile */}
      {isMobileVal && mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setMobileOpen(false)} />
      )}

      {/* Mobile bottom navigation */}
      {isMobileVal && (
        <MobileBottomNav activeTab={activeTab} onTabChange={(tab) => { onTabChange(tab); setMobileOpen(false); }} />
      )}

      <div
        className={`flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden transition-[margin-left] duration-[220ms] ease-in-out ${
          !isMobileVal ? (isCollapsed ? "ml-[60px]" : "ml-[220px]") : "ml-0"
        }`}
      >
        <main
          className={`flex-1 min-h-0 min-w-0 relative overflow-y-auto overscroll-y-contain thin-scrollbar-xs ${
            activeTab === "profile" ? "flex flex-col" : ""
          } ${mainPaddingClass}`}
        >
          <ChunkErrorBoundary>
            <Suspense fallback={<div className="flex h-full items-center justify-center"><div className="w-8 h-8 border-2 border-slate-200 border-t-slate-700 rounded-full animate-spin" /></div>}>
              {renderPage()}
            </Suspense>
          </ChunkErrorBoundary>
        </main>
      </div>
    </div>
  );
}

function ComingSoon({ label }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 md:p-10 bg-[#f8fafc]">
      <div className="bg-white p-8 md:p-20 rounded-2xl md:rounded-[3rem] shadow-sm border border-slate-100 flex items-center justify-center w-full max-w-4xl">
        <p className="text-slate-400 font-bold uppercase tracking-wider md:tracking-[0.3em] text-center text-sm md:text-base">
          {label} — Coming Soon
        </p>
      </div>
    </div>
  );
}

// ── Root App component ────────────────────────────────────────────────────────

function App() {
  const navigate  = useNavigate();
  const location  = useLocation();

  // App mounted successfully — clear the one-shot chunk-error reload guard
  // so a future deploy's chunk mismatch can still trigger an auto-reload.
  useEffect(() => {
    sessionStorage.removeItem("bms_chunk_error_reloaded");
  }, []);

  // Detect Supabase auth redirects (password reset / invite) in URL
  // and redirect to /reset-password so auth is handled at a dedicated route.
  useEffect(() => {
    const hashParams   = new URLSearchParams(location.hash.slice(1));
    const searchParams = new URLSearchParams(location.search);
    const type         = hashParams.get("type") || searchParams.get("type");
    const tokenHash    = searchParams.get("token_hash");
    const accessToken  = hashParams.get("access_token");
    const code         = searchParams.get("code") || hashParams.get("inv");
    const authError    = hashParams.get("error") || searchParams.get("error");

    const isAuth = type === "recovery" || type === "invite" || !!tokenHash || !!accessToken || !!code || !!authError;
    if (isAuth && location.pathname !== "/reset-password" && location.pathname !== "/invite") {
      navigate("/reset-password" + location.search + location.hash, { replace: true });
    }
  }, []);

  const [isLoggedIn, setIsLoggedIn] = useState(() => !!localStorage.getItem("bms_token"));
  const [userRole, setUserRole]     = useState(() => {
    const u = localStorage.getItem("bms_user");
    return u ? JSON.parse(u).role : null;
  });
  const [currentUser, setCurrentUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); } catch { return {}; }
  });
  const [projects, setProjects] = useState([{ name: "All Project" }]);
  const [userTabPermissions, setUserTabPermissions] = useState(() => {
    const u = localStorage.getItem("bms_user");
    const user = u ? JSON.parse(u) : null;
    if (user?.app_permissions) {
      const permMap = {};
      user.app_permissions.forEach(p => { permMap[p.module_key] = p; });
      return { hasAny: user.app_permissions.length > 0, map: permMap };
    }
    return null;
  });
  const [editingOrderId, setEditingOrderId] = useState(null);
  const [isCollapsed, setIsCollapsed] = useState(
    () => localStorage.getItem("bms_sidebar_collapsed") === "true"
  );

  // Derive activeTab and selectedProject from current URL path
  const { tab: activeTab, project: selectedProject } = pathToTabAndProject(location.pathname);

  useScreenTimeTracker(isLoggedIn ? (TAB_MODULE_KEY[activeTab] || activeTab) : null);

  const handleSetIsCollapsed = (val) => {
    const next = typeof val === "function" ? val(isCollapsed) : val;
    setIsCollapsed(next);
    localStorage.setItem("bms_sidebar_collapsed", String(next));
  };

  const fetchInit = async () => {
    const token = localStorage.getItem("bms_token");
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/auth/init`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (res.status === 401) { handleLogout(); return; }
      if (!res.ok) return;
      const data = await res.json();
      if (data.user) {
        const stored = JSON.parse(localStorage.getItem("bms_user") || "{}");
        const merged = { ...stored, ...data.user, app_permissions: stored.app_permissions };
        setCurrentUser(merged);
        localStorage.setItem("bms_user", JSON.stringify(merged));
      }
      if (data.projects) {
        const active = data.projects
          .filter(p => p.isActive)
          .map(p => ({ ...p, name: p.projectCode || p.projectName }));
        setProjects([{ name: "All Project" }, ...active]);
      }
    } catch { /* silent */ }
  };

  const fetchUserPermissions = async (attempt = 0) => {
    const token = localStorage.getItem("bms_token");
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/auth/my-permissions`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`my-permissions failed: ${res.status}`);
      const data = await res.json();
      const permMap = {};
      (data.permissions || []).forEach(p => { permMap[p.module_key] = p; });
      setUserTabPermissions({ hasAny: data.has_any_permissions, map: permMap });
      const stored = localStorage.getItem("bms_user");
      if (stored) {
        const user = JSON.parse(stored);
        user.app_permissions = data.permissions || [];
        localStorage.setItem("bms_user", JSON.stringify(user));
        window.dispatchEvent(new CustomEvent("bms_permissions_updated"));
      }
    } catch {
      // Transient network/backend failure (e.g. DNS blip) must not permanently
      // hide the user's tabs — retry with backoff instead of failing silently.
      const nextAttempt = attempt + 1;
      const delay = Math.min(30000, 2000 * 2 ** attempt);
      setTimeout(() => fetchUserPermissions(nextAttempt), delay);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchInit();
    // Always re-fetch on load, even if permissions are already cached from a
    // previous session — otherwise a device that stays logged in (silent
    // token refresh) never picks up Access Profile changes an admin makes
    // later, since the cached copy in localStorage looks "already loaded".
    fetchUserPermissions();
  }, [isLoggedIn]);

  const handleLogin = (user) => {
    setUserRole(user.role);
    setCurrentUser(user);
    if (user.app_permissions?.length > 0) {
      const permMap = {};
      user.app_permissions.forEach(p => { permMap[p.module_key] = p; });
      setUserTabPermissions({ hasAny: true, map: permMap });
    } else {
      setUserTabPermissions(null);
    }
    setIsLoggedIn(true);
    navigate("/dashboard", { replace: true });

    const token = localStorage.getItem("bms_token");
    if (token) {
      fetch(`${API}/api/screen-time/login`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.json())
        .then(data => { if (data?.session_id) localStorage.setItem("bms_screen_session_id", data.session_id); })
        .catch(() => { /* silent — best-effort telemetry */ });
    }
  };

  const handleLogout = () => {
    const token = localStorage.getItem("bms_token");
    const sessionId = localStorage.getItem("bms_screen_session_id");
    if (token && sessionId) {
      fetch(`${API}/api/screen-time/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ session_id: sessionId }),
      }).catch(() => { /* silent — best-effort telemetry */ });
    }
    localStorage.removeItem("bms_token");
    localStorage.removeItem("bms_user");
    localStorage.removeItem("bms_screen_session_id");
    setIsLoggedIn(false);
    setUserRole(null);
    setCurrentUser({});
    setUserTabPermissions(null);
    navigate("/", { replace: true });
  };

  const handleTabChange = (tab) => {
    const isProjectTab = !!PROJECT_TAB_TO_SUB[tab];
    if (isProjectTab && (!selectedProject || selectedProject === "All Project")) {
      navigate(`/p/select-project${PROJECT_TAB_TO_SUB[tab]}`);
      return;
    }
    const path = buildPath(tab, selectedProject);
    navigate(path);
  };

  const handleProjectChange = (project) => {
    if (project && project !== "All Project") {
      localStorage.setItem("last_selected_project", project);
      // If currently on a project-specific tab, keep that tab for new project;
      // otherwise navigate to project dashboard.
      const isProjectTab = !!PROJECT_TAB_TO_SUB[activeTab];
      const targetTab = isProjectTab ? activeTab : "dashboard";
      navigate(buildPath(targetTab, project));
    } else {
      localStorage.removeItem("last_selected_project");
      navigate("/dashboard");
    }
  };

  return (
    <Routes>
      {/* Password reset / invite — always accessible */}
      <Route
        path="/reset-password"
        element={
          <ResetPassword
            isInvite={false}
            onComplete={() => navigate("/", { replace: true })}
          />
        }
      />
      <Route
        path="/invite"
        element={
          <ResetPassword
            isInvite={true}
            onComplete={() => navigate("/", { replace: true })}
          />
        }
      />

      {/* All other routes */}
      <Route
        path="*"
        element={
          !isLoggedIn ? (
            <Login onLogin={handleLogin} />
          ) : (
            <AppLayout
              activeTab={activeTab}
              selectedProject={selectedProject}
              projects={projects}
              onTabChange={handleTabChange}
              onProjectChange={handleProjectChange}
              onLogout={handleLogout}
              userRole={userRole}
              currentUser={currentUser}
              userTabPermissions={userTabPermissions}
              editingOrderId={editingOrderId}
              setEditingOrderId={setEditingOrderId}
              isCollapsed={isCollapsed}
              setIsCollapsed={handleSetIsCollapsed}
              onCurrentUserUpdate={(updatedUser) => {
                setCurrentUser(updatedUser);
                localStorage.setItem("bms_user", JSON.stringify(updatedUser));
              }}
              onProjectsRefresh={fetchInit}
            />
          )
        }
      />
    </Routes>
  );
}

export default App;
