import React, { useState, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useLocation } from "react-router-dom";
import Login from "./pages/Login";
import ResetPassword from "./pages/ResetPassword";
import Sidebar from "./components/Sidebar";

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
  if (project && project !== "All Project") {
    const sub = PROJECT_TAB_TO_SUB[tab] || "/dashboard";
    return `/p/${encodeURIComponent(project)}${sub}`;
  }
  return TAB_TO_ROUTE[tab] || "/dashboard";
}

// ── Page imports ─────────────────────────────────────────────────────────────

import Profile from "./pages/Profile";
import Organisation from "./pages/Organisation";
import MasterData from "./pages/MasterData";
import ClauseMasterData from "./pages/ClauseMasterData";
import Approvals from "./pages/Approvals";
import View3D from "./pages/Model";
import Dashboard from "./pages/Dashboard";

// Confidential
import LOA from "./pages/confidential/LOA";
import BOQ from "./pages/confidential/BOQ";
import Drawings from "./pages/confidential/Drawings";
import RABills from "./pages/confidential/RABills";

// Finance
import SiteExpense from "./pages/Finance/SiteExpense";
import PettyCash from "./pages/Finance/PettyCash";
import BillsDocs from "./pages/Finance/BillsDocs";

// Work Activity
import ExecutionPlan from "./pages/WorkActivity/ExecutionPlan";

// Manpower
import DailyManpower from "./pages/Manpower/DailyManpower";

// Store
import ReceivedRecord from "./pages/Store/ReceivedRecord";
import ConsumptionRecord from "./pages/Store/ConsumptionRecord";
import StockAvailable from "./pages/Store/StockAvailable";

// Global Create
import GlobalCreateOrder from "./pages/Create/CreateOrder";
import IntakeList from "./pages/Create/IntakeList";

// Procurement setup
import ItemList from "./pages/Procurement/ItemList";
import VendorList from "./pages/Procurement/VendorList";
import TermCondition from "./pages/Procurement/clauses/TermCondition";
import PaymentTerms from "./pages/Procurement/clauses/PaymentTerms";
import GovernmentLaws from "./pages/Procurement/clauses/GovernmentLaws";
import UOMList from "./pages/Procurement/UOMList";
import CategoryList from "./pages/Procurement/CategoryList";
import AnnexureMaster from "./pages/Procurement/clauses/AnnexureMaster";

// Attendance
import Attendance from "./pages/Attendance/Attendance";
import HistoricalData from "./pages/HistoricalData";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const SIDEBAR_EXPANDED_WIDTH = 220;
const SIDEBAR_COLLAPSED_WIDTH = 60;

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
    if (activeTab === "organisation")         return <Organisation currentUser={currentUser} />;
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

    if (activeTab === "master_data__products" || activeTab === "master_data__orders") {
      return (
        <ComingSoon label={activeTab.split("__")[1].toUpperCase() + " MASTER"} />
      );
    }
    if (activeTab === "audit") return <ComingSoon label="Audit" />;

    // Project-specific tabs
    if (!selectedProject || selectedProject === "All Project") {
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
      case "confidential__loa":               return <LOA project={selectedProject} />;
      case "confidential__boq":               return <BOQ project={selectedProject} />;
      case "confidential__drawings":          return <Drawings project={selectedProject} />;
      case "confidential__ra_bills":          return <RABills project={selectedProject} />;
      case "finance__site_expense":           return <SiteExpense project={selectedProject} />;
      case "finance__petty_cash":             return <PettyCash project={selectedProject} />;
      case "finance__bills_documents":        return <BillsDocs project={selectedProject} />;
      case "operations__work_activity":       return <ExecutionPlan project={selectedProject} />;
      case "operations__manpower":            return <DailyManpower project={selectedProject} />;
      case "inventory__received_material_grn": return <ReceivedRecord project={selectedProject} />;
      case "inventory__stock_inventory":      return <StockAvailable project={selectedProject} />;
      case "inventory__material_issue":       return <ConsumptionRecord project={selectedProject} />;
      case "procurement__orders":             return <GlobalCreateOrder project={selectedProject} editOrderId={editingOrderId} onEditComplete={() => setEditingOrderId(null)} />;
      case "procurement__intake":             return <IntakeList project={selectedProject} />;
      case "operations__staff_attendance":    return <Attendance selectedProject={selectedProject} />;
      case "finance__payment_request":        return <ComingSoon label="Payment Request" />;
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
    if (isMobileVal) return "pt-4 px-3 pb-4";
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
      {isMobileVal && !mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed top-3 left-3 z-50 bg-[#0b1022] text-white w-10 h-10 rounded-lg flex items-center justify-center shadow-lg text-lg"
        >
          ☰
        </button>
      )}

      <div
        className={`fixed top-0 left-0 h-full z-40 transition-transform duration-300 ${
          isMobileVal ? (mobileOpen ? "translate-x-0" : "-translate-x-full") : "translate-x-0"
        }`}
      >
        <Sidebar
          activeTab={activeTab}
          setActiveTab={onTabChange}
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
        />
      </div>

      {isMobileVal && mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30" onClick={() => setMobileOpen(false)} />
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
          {renderPage()}
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

  // Detect Supabase auth redirects (password reset / invite) in URL
  // and redirect to /reset-password so auth is handled at a dedicated route.
  useEffect(() => {
    const hashParams   = new URLSearchParams(location.hash.slice(1));
    const searchParams = new URLSearchParams(location.search);
    const type         = hashParams.get("type") || searchParams.get("type");
    const tokenHash    = searchParams.get("token_hash");
    const accessToken  = hashParams.get("access_token");
    const authError    = hashParams.get("error") || searchParams.get("error");

    const isAuth = type === "recovery" || type === "invite" || !!tokenHash || !!accessToken || !!authError;
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

  const handleSetIsCollapsed = (val) => {
    const next = typeof val === "function" ? val(isCollapsed) : val;
    setIsCollapsed(next);
    localStorage.setItem("bms_sidebar_collapsed", String(next));
  };

  const fetchProjects = async () => {
    try {
      const res  = await fetch(`${API}/api/projects`);
      const data = await res.json();
      const active = (data.projects || [])
        .filter(p => p.isActive)
        .map(p => ({ ...p, name: p.projectCode || p.projectName }));
      setProjects([{ name: "All Project" }, ...active]);
    } catch {
      setProjects([{ name: "All Project" }]);
    }
  };

  const fetchUserProfile = async () => {
    const token = localStorage.getItem("bms_token");
    if (!token) return;
    try {
      const res = await fetch(`${API}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (data.user) {
          setCurrentUser(data.user);
          localStorage.setItem("bms_user", JSON.stringify(data.user));
        }
      } else if (res.status === 401) {
        handleLogout();
      }
    } catch { /* silent */ }
  };

  const fetchUserPermissions = async () => {
    const token = localStorage.getItem("bms_token");
    if (!token) return;
    try {
      const res  = await fetch(`${API}/api/auth/my-permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
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
    } catch { /* silent */ }
  };

  useEffect(() => {
    if (!isLoggedIn) return;
    fetchProjects();
    fetchUserProfile();
    if (!userTabPermissions) fetchUserPermissions();
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
  };

  const handleLogout = () => {
    localStorage.removeItem("bms_token");
    localStorage.removeItem("bms_user");
    setIsLoggedIn(false);
    setUserRole(null);
    setCurrentUser({});
    setUserTabPermissions(null);
    navigate("/", { replace: true });
  };

  const handleTabChange = (tab) => {
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
              onProjectsRefresh={fetchProjects}
            />
          )
        }
      />
    </Routes>
  );
}

export default App;
