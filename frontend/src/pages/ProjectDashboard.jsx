import { useState, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Cell,
} from "recharts";

// ─── MOCK DATA (project-scoped, replace with API later) ───────────────────────
// For now B-47 maps to Site Alpha + Entity A, Entity B
const PROJECT_SITE     = { site: "Site Alpha", code: "SA-01" };
const PROJECT_ENTITIES = [
  { entity: "Entity A", code: "EA-01", po: 2100, wo: 950 },
  { entity: "Entity B", code: "EB-02", po: 1650, wo: 720 },
];
const PROJECT_SITE_SPEND = [{ ...PROJECT_SITE, po: 1850, wo: 820 }];

const gen = () => ({
  totalPO: 320, totalWO: 185,
  totalPOValue: 4820, totalWOValue: 2150,
  draft:        { po: 28,  wo: 14 },
  review:       { po: 45,  wo: 22,  poValue: 620,  woValue: 310 },
  pendingIssue: { po: 38,  wo: 19,  poValue: 540,  woValue: 270 },
  issued:       { po: 180, wo: 105, poValue: 3200, woValue: 1450 },
  reverted:     { po: 12,  wo: 8,   poValue: 180,  woValue: 95 },
  cancelled:    { po: 8,   wo: 5,   poValue: 120,  woValue: 65 },
  rejected:     { po: 6,   wo: 4,   poValue: 90,   woValue: 48 },
  recalled:     { po: 3,   wo: 2,   poValue: 45,   woValue: 28 },
  amendPending: { po: 15,  wo: 9,   poValue: 210,  woValue: 115 },
  amended:      { po: 22,  wo: 13,  poValue: 310,  woValue: 165 },
});

const monthlySpend = [
  { month: "Apr", po: 120, wo: 55 }, { month: "May", po: 140, wo: 62 },
  { month: "Jun", po: 155, wo: 72 }, { month: "Jul", po: 145, wo: 68 },
  { month: "Aug", po: 188, wo: 84 }, { month: "Sep", po: 170, wo: 75 },
  { month: "Oct", po: 198, wo: 92 }, { month: "Nov", po: 180, wo: 81 },
  { month: "Dec", po: 228, wo: 105 }, { month: "Jan", po: 213, wo: 98 },
  { month: "Feb", po: 159, wo: 71 }, { month: "Mar", po: 191, wo: 88 },
];
const monthlyCount = [
  { month: "Apr", po: 17, wo: 9 }, { month: "May", po: 20, wo: 11 },
  { month: "Jun", po: 22, wo: 13 }, { month: "Jul", po: 21, wo: 12 },
  { month: "Aug", po: 27, wo: 15 }, { month: "Sep", po: 24, wo: 14 },
  { month: "Oct", po: 28, wo: 16 }, { month: "Nov", po: 25, wo: 14 },
  { month: "Dec", po: 32, wo: 18 }, { month: "Jan", po: 30, wo: 17 },
  { month: "Feb", po: 23, wo: 13 }, { month: "Mar", po: 27, wo: 16 },
];
const topVendorsPO = [
  { name: "Tata Consultancy",   value: 845, count: 42 },
  { name: "L&T Infrastructure", value: 720, count: 36 },
  { name: "Siemens India",      value: 635, count: 31 },
  { name: "ABB Limited",        value: 510, count: 25 },
  { name: "Schneider Electric", value: 425, count: 21 },
];
const topVendorsWO = [
  { name: "BuildRight Co.",  value: 380, count: 28 },
  { name: "Infra Solutions", value: 310, count: 22 },
  { name: "MetroWorks Ltd",  value: 265, count: 19 },
  { name: "TechBuild Inc.",  value: 215, count: 16 },
  { name: "ProConstruct",    value: 180, count: 13 },
];
const categorySpend = [
  { category: "Civil",      po: 480, wo: 260 }, { category: "Electrical", po: 375, wo: 122 },
  { category: "Mechanical", po: 330, wo: 172 }, { category: "IT & Tech",  po: 275, wo: 68 },
  { category: "Safety",     po: 206, wo: 110 }, { category: "Infra",      po: 180, wo: 88 },
];
const userOrderData = [
  { name: "Rahul Sharma", po: 68, wo: 42, total: 110, value: 248, sites: [{ code: "SA-01", po: 68, wo: 42 }] },
  { name: "Amit Singh",   po: 47, wo: 29, total: 76,  value: 153, sites: [{ code: "SA-01", po: 47, wo: 29 }] },
  { name: "Anita Joshi",  po: 28, wo: 14, total: 42,  value: 74,  sites: [{ code: "SA-01", po: 28, wo: 14 }] },
  { name: "Karan Mehta",  po: 38, wo: 22, total: 60,  value: 118, sites: [{ code: "SA-01", po: 38, wo: 22 }] },
];
const agingData = [
  { orderNo: "PO-2025-0312", type: "PO", vendor: "Tata Consultancy",   value: "₹12.4L", status: "Pending Issue", pendingAt: "Rahul Sharma", since: "02 May", days: 10, site: "Site Alpha", siteCode: "SA-01", entity: "Entity A" },
  { orderNo: "PO-2025-0289", type: "PO", vendor: "Siemens India",      value: "₹8.2L",  status: "Pending Issue", pendingAt: "Amit Singh",   since: "04 May", days: 8,  site: "Site Alpha", siteCode: "SA-01", entity: "Entity A" },
  { orderNo: "PO-2025-0278", type: "PO", vendor: "ABB Limited",        value: "₹6.9L",  status: "In Review",     pendingAt: "Rahul Sharma", since: "08 May", days: 4,  site: "Site Alpha", siteCode: "SA-01", entity: "Entity A" },
  { orderNo: "WO-2025-0198", type: "WO", vendor: "BuildRight Co.",     value: "₹4.8L",  status: "In Review",     pendingAt: "Anita Joshi",  since: "05 May", days: 7,  site: "Site Alpha", siteCode: "SA-01", entity: "Entity B" },
  { orderNo: "WO-2025-0211", type: "WO", vendor: "MetroWorks Ltd",     value: "₹2.1L",  status: "Amend Pending", pendingAt: "Karan Mehta",  since: "09 May", days: 3,  site: "Site Alpha", siteCode: "SA-01", entity: "Entity B" },
];

// ─── FORMATTER ───────────────────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString("en-IN");
const fmtAmt = (n) => {
  const v = Number(n);
  if (!v) return null;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000)     return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${fmt(v)}`;
};

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const CP  = "#06b6d4"; const CPL = "#22d3ee";
const CW  = "#14b8a6"; const CWL = "#2dd4bf";
const COLORS_PO = ["#06b6d4","#22d3ee","#67e8f9","#a5f3fc","#cffafe"];
const COLORS_WO = ["#14b8a6","#2dd4bf","#5eead4","#99f6e4","#ccfbf1"];

const agingColor = (d) => d >= 8 ? "#ef4444" : d >= 4 ? "#f59e0b" : "#22c55e";
const stColor    = (s) => s === "In Review"     ? { bg: "rgba(6,182,212,0.1)",  col: "#0891b2" }
                        : s === "Pending Issue"  ? { bg: "rgba(245,158,11,0.1)", col: "#d97706" }
                        : s === "Amend Pending"  ? { bg: "rgba(249,115,22,0.1)", col: "#ea580c" }
                        : { bg: "#f1f5f9", col: "#64748b" };
const agingBg    = (d) => d >= 8 ? "rgba(239,68,68,0.1)" : d >= 4 ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)";
const agingLabel = (d) => d >= 8 ? "Critical" : d >= 4 ? "Warning" : "Normal";

// ─── SHARED STYLES ───────────────────────────────────────────────────────────
const card  = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" };
const selSt = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, color: "#374151", padding: "6px 28px 6px 10px", fontSize: 12, cursor: "pointer", outline: "none", appearance: "auto", WebkitAppearance: "auto" };

// ─── TOOLTIPS ────────────────────────────────────────────────────────────────
const CatTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const po = payload.find(p => p.dataKey === "po")?.value || 0;
  const wo = payload.find(p => p.dataKey === "wo")?.value || 0;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 168, boxShadow: "0 8px 24px rgba(15,23,42,0.13)" }}>
      <div style={{ background: "#0f172a", padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{label}</span>
        <span style={{ color: "#34d399", fontWeight: 800, fontSize: 12 }}>₹{fmt(po + wo)}L</span>
      </div>
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>PO Spend</span>
          <span style={{ color: "#4338ca", fontWeight: 700, fontSize: 11 }}>₹{fmt(po)}L</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>WO Spend</span>
          <span style={{ color: "#ea580c", fontWeight: 700, fontSize: 11 }}>₹{fmt(wo)}L</span>
        </div>
      </div>
    </div>
  );
};
const VendorPOTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value || 0;
  const count = payload[0]?.payload?.count || 0;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 175, boxShadow: "0 8px 24px rgba(15,23,42,0.13)" }}>
      <div style={{ background: "#0f172a", padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 11, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ color: CPL, fontWeight: 800, fontSize: 12, flexShrink: 0, marginLeft: 6 }}>₹{fmt(value)}L</span>
      </div>
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>PO Count</span>
          <span style={{ color: "#0f172a", fontWeight: 700, fontSize: 11 }}>{count} orders</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>PO Value</span>
          <span style={{ color: "#2563eb", fontWeight: 700, fontSize: 11 }}>₹{fmt(value)}L</span>
        </div>
      </div>
    </div>
  );
};
const VendorWOTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value || 0;
  const count = payload[0]?.payload?.count || 0;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 175, boxShadow: "0 8px 24px rgba(15,23,42,0.13)" }}>
      <div style={{ background: "#0f172a", padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 11, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        <span style={{ color: "#34d399", fontWeight: 800, fontSize: 12, flexShrink: 0, marginLeft: 6 }}>₹{fmt(value)}L</span>
      </div>
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>WO Count</span>
          <span style={{ color: "#0f172a", fontWeight: 700, fontSize: 11 }}>{count} orders</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>WO Value</span>
          <span style={{ color: "#059669", fontWeight: 700, fontSize: 11 }}>₹{fmt(value)}L</span>
        </div>
      </div>
    </div>
  );
};
const MonthTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const poVal = payload.find(p => p.dataKey === "po")?.value || 0;
  const woVal = payload.find(p => p.dataKey === "wo")?.value || 0;
  const fyStart = new Date().getMonth() >= 3 ? new Date().getFullYear() - 1 : new Date().getFullYear() - 2;
  const year = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(label) ? fyStart : fyStart + 1;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 180, boxShadow: "0 8px 28px rgba(15,23,42,0.14)" }}>
      <div style={{ background: "#0f172a", padding: "7px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{label}-{year}</span>
        <span style={{ color: CPL, fontWeight: 800, fontSize: 13 }}>₹{fmt(poVal + woVal)}L</span>
      </div>
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>PO</span>
          <span style={{ color: "#1e40af", fontWeight: 700, fontSize: 11 }}>₹{fmt(poVal)}L</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>WO</span>
          <span style={{ color: "#b45309", fontWeight: 700, fontSize: 11 }}>₹{fmt(woVal)}L</span>
        </div>
      </div>
    </div>
  );
};
const CountTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const poVal = payload.find(p => p.dataKey === "po")?.value || 0;
  const woVal = payload.find(p => p.dataKey === "wo")?.value || 0;
  const fyStart = new Date().getMonth() >= 3 ? new Date().getFullYear() - 1 : new Date().getFullYear() - 2;
  const year = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(label) ? fyStart : fyStart + 1;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 180, boxShadow: "0 8px 28px rgba(15,23,42,0.14)" }}>
      <div style={{ background: "#0f172a", padding: "7px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{label}-{year}</span>
        <span style={{ color: "#34d399", fontWeight: 800, fontSize: 13 }}>{poVal + woVal} Orders</span>
      </div>
      <div style={{ padding: "8px 10px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>PO</span>
          <span style={{ color: "#1d4ed8", fontWeight: 700, fontSize: 11 }}>{poVal} orders</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20 }}>
          <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600 }}>WO</span>
          <span style={{ color: "#047857", fontWeight: 700, fontSize: 11 }}>{woVal} orders</span>
        </div>
      </div>
    </div>
  );
};

// ─── SUB-COMPONENTS ──────────────────────────────────────────────────────────
const AgingBadge = ({ days }) => (
  <span style={{
    background: agingBg(days), color: agingColor(days),
    border: `1px solid ${agingColor(days)}44`,
    borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700,
  }}>{agingLabel(days)} · {days}d</span>
);

// ─── MAIN ────────────────────────────────────────────────────────────────────
export default function ProjectDashboard({ project }) {
  const [dateRange,        setDateRange]        = useState("This Year");
  const [activeTab,        setActiveTab]        = useState("overview");
  const [activeModule,     setActiveModule]     = useState("orders");
  const [showMore,         setShowMore]         = useState(false);
  const [hoveredEntity,    setHoveredEntity]    = useState(null);
  const [hoveredSite,      setHoveredSite]      = useState(null);
  const [selectedOrder,    setSelectedOrder]    = useState(null);
  const [agingSearch,      setAgingSearch]      = useState("");
  const [agingFilterType,  setAgingFilterType]  = useState("All");
  const [agingFilterStatus,setAgingFilterStatus]= useState("All");
  const [agingFilterUser,  setAgingFilterUser]  = useState("All");

  const d = useMemo(() => gen(), []);

  return (
    <div style={{ fontFamily: "'Inter','DM Sans',sans-serif", paddingBottom: 24 }}>

      {/* ── HEADER CARD ── */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, marginBottom: 16 }}>

        {/* Top row: title + module tabs */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ color: "#0f172a", fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>{project} Dashboard</h1>
          </div>
          <div style={{ display: "flex", gap: 2, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 3 }}>
            {[
              { key: "orders",  label: "Orders",  icon: "📦" },
              { key: "intake",  label: "Intake",  icon: "📋" },
              { key: "payment", label: "Payment", icon: "💳" },
            ].map(m => (
              <button key={m.key} onClick={() => setActiveModule(m.key)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 13, transition: "all 0.18s",
                background: activeModule === m.key ? `linear-gradient(135deg, ${CP}, ${CW})` : "transparent",
                color: activeModule === m.key ? "#fff" : "#64748b",
                boxShadow: activeModule === m.key ? "0 2px 8px rgba(6,182,212,0.25)" : "none",
              }}>
                <span style={{ fontSize: 14 }}>{m.icon}</span>
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: "#e2e8f0", margin: "0 20px" }} />

        {/* Bottom row: sub-tabs + date filter only (no site/entity filter) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 20px", gap: 12, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 1 }}>
            {[
              { key: "overview", label: "Overview", icon: "▦" },
              { key: "aging",    label: "Aging",    icon: "⏱" },
            ].map(t => {
              const active = activeTab === t.key;
              return (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "6px 16px", borderRadius: 8, fontSize: 12, fontWeight: 600,
                  cursor: "pointer", border: "none", transition: "all 0.15s",
                  background: active ? `${CP}15` : "transparent",
                  color: active ? CP : "#64748b",
                  borderBottom: active ? `2px solid ${CP}` : "2px solid transparent",
                }}>
                  <span style={{ fontSize: 12 }}>{t.icon}</span>
                  {t.label}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <select style={selSt} value={dateRange} onChange={e => setDateRange(e.target.value)}>
              {["This Month","This Quarter","This Year","Last Year"].map(dr => <option key={dr}>{dr}</option>)}
            </select>
          </div>
        </div>

      </div>

      {/* ── INTAKE PLACEHOLDER ── */}
      {activeModule === "intake" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📋</div>
            <div style={{ color: "#0f172a", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Intake Dashboard</div>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Coming soon — data linkage pending</div>
          </div>
        </div>
      )}

      {/* ── PAYMENT PLACEHOLDER ── */}
      {activeModule === "payment" && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300,
          background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
            <div style={{ color: "#0f172a", fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Payment Dashboard</div>
            <div style={{ color: "#94a3b8", fontSize: 13 }}>Coming soon — data linkage pending</div>
          </div>
        </div>
      )}

      {/* ── ORDERS DASHBOARD ── */}
      {activeModule === "orders" && (<>

      {/* ════════════ OVERVIEW ════════════ */}
      {activeTab === "overview" && (
        <>
          {/* ── STATS CARDS ROW ── */}
          {(() => {
            const SC = ({ label, total, totalVal, po, wo, poVal, woVal, accent = "#0f172a" }) => (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "8px 13px", minWidth: 160, flex: "0 0 auto", display: "flex", flexDirection: "column" }}>
                <div style={{ color: "#94a3b8", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>{label}</div>
                <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 6, marginBottom: 6 }}>
                  <span style={{ color: accent, fontSize: 22, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap" }}>{fmt(total)}</span>
                  {totalVal !== undefined && <span style={{ color: "#64748b", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>{fmtAmt(totalVal)}</span>}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, marginTop: "auto" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ background: `${CP}18`, color: CP, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4 }}>PO</span>
                    <span style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>{fmt(po)}</span>
                    {poVal !== undefined && <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginLeft: "auto" }}>{fmtAmt(poVal)}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ background: `${CW}18`, color: CW, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4 }}>WO</span>
                    <span style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>{fmt(wo)}</span>
                    {woVal !== undefined && <span style={{ color: "#64748b", fontSize: 11, fontWeight: 600, marginLeft: "auto" }}>{fmtAmt(woVal)}</span>}
                  </div>
                </div>
              </div>
            );
            const Mini = ({ label, value, sub, accent = "#0f172a", po, wo }) => (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ color: "#94a3b8", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>{label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: po !== undefined ? 6 : 0, whiteSpace: "nowrap" }}>
                  <span style={{ color: accent, fontSize: 20, fontWeight: 800, lineHeight: 1 }}>{value}</span>
                  {sub && <span style={{ color: "#94a3b8", fontSize: 10 }}>{sub}</span>}
                </div>
                {po !== undefined && (
                  <div style={{ display: "flex", gap: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ background: `${CP}18`, color: CP, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4 }}>PO</span>
                      <span style={{ color: "#0f172a", fontSize: 11, fontWeight: 700 }}>{po}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ background: `${CW}18`, color: CW, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4 }}>WO</span>
                      <span style={{ color: "#0f172a", fontSize: 11, fontWeight: 700 }}>{wo}</span>
                    </div>
                  </div>
                )}
              </div>
            );
            return (
              <div style={{ display: "flex", gap: 10, marginBottom: 16, overflowX: "auto", paddingBottom: 4, scrollbarWidth: "none", alignItems: "stretch" }}>
                <SC label="Total Orders"  total={d.totalPO + d.totalWO}                 totalVal={d.totalPOValue + d.totalWOValue}               po={d.totalPO}         wo={d.totalWO}         poVal={d.totalPOValue}         woVal={d.totalWOValue}         accent="#0f172a" />
                <SC label="Issued"        total={d.issued.po + d.issued.wo}             totalVal={d.issued.poValue + d.issued.woValue}           po={d.issued.po}       wo={d.issued.wo}       poVal={d.issued.poValue}       woVal={d.issued.woValue}       accent="#16a34a" />
                <SC label="Amended"       total={d.amended.po + d.amended.wo}           totalVal={d.amended.poValue + d.amended.woValue}         po={d.amended.po}      wo={d.amended.wo}      poVal={d.amended.poValue}      woVal={d.amended.woValue}      accent={CW} />
                <SC label="In Review"     total={d.review.po + d.review.wo}             totalVal={d.review.poValue + d.review.woValue}           po={d.review.po}       wo={d.review.wo}       poVal={d.review.poValue}       woVal={d.review.woValue}       accent={CP} />
                <SC label="Pending Issue" total={d.pendingIssue.po + d.pendingIssue.wo} totalVal={d.pendingIssue.poValue + d.pendingIssue.woValue} po={d.pendingIssue.po} wo={d.pendingIssue.wo} poVal={d.pendingIssue.poValue} woVal={d.pendingIssue.woValue} accent="#d97706" />
                <SC label="Amend Request" total={d.amendPending.po + d.amendPending.wo} totalVal={d.amendPending.poValue + d.amendPending.woValue} po={d.amendPending.po} wo={d.amendPending.wo} poVal={d.amendPending.poValue} woVal={d.amendPending.woValue} accent="#f59e0b" />
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "0 0 auto", minWidth: 125 }}>
                  <Mini label="Draft" value={d.draft.po + d.draft.wo} accent="#64748b" po={d.draft.po} wo={d.draft.wo} />
                  <button onClick={() => setShowMore(true)} style={{
                    flex: 1, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 12,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    color: "#64748b", fontSize: 12, fontWeight: 600, padding: "0 14px",
                  }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>···</span> More
                  </button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "0 0 auto", minWidth: 115 }}>
                  <Mini label="Total Vendors" value={12}  accent={CP} sub="registered" />
                  <Mini label="Total Sites"   value={1}   accent={CW} sub="active" />
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "0 0 auto", minWidth: 115 }}>
                  <Mini label="Total Entity"  value={2}  accent="#7c3aed" sub="registered" />
                  <Mini label="Total Contact" value={18} accent="#0ea5e9" sub="active" />
                </div>
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 13px", flex: "0 0 auto", minWidth: 120, display: "flex", flexDirection: "column" }}>
                  <div style={{ color: "#94a3b8", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Total Clauses</div>
                  <div style={{ color: "#7c3aed", fontSize: 22, fontWeight: 800, lineHeight: 1, marginBottom: 7, whiteSpace: "nowrap" }}>42</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "auto" }}>
                    {[{ label: "T&C", value: 18, color: CP }, { label: "PAY", value: 14, color: CW }, { label: "GOV", value: 10, color: "#f59e0b" }].map((it, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ background: `${it.color}18`, color: it.color, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, minWidth: 28, textAlign: "center" }}>{it.label}</span>
                        <span style={{ color: "#0f172a", fontSize: 11, fontWeight: 700 }}>{it.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: "0 0 auto", minWidth: 110 }}>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ color: "#94a3b8", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Item Register</div>
                    <div style={{ color: "#0ea5e9", fontSize: 18, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap" }}>86</div>
                    <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 2 }}>total items</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ color: "#94a3b8", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Total Users</div>
                    <div style={{ color: "#7c3aed", fontSize: 18, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap" }}>8</div>
                    <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 2 }}>active users</div>
                  </div>
                </div>

                {/* More Modal */}
                {showMore && (
                  <div onClick={() => setShowMore(false)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: "24px", width: 580, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", border: "1px solid #e2e8f0" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                        <div>
                          <div style={{ color: "#0f172a", fontSize: 15, fontWeight: 700 }}>More Order Stats</div>
                          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>Additional status breakdown</div>
                        </div>
                        <button onClick={() => setShowMore(false)} style={{ background: "#f1f5f9", border: "none", borderRadius: 8, width: 32, height: 32, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b" }}>✕</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
                        {[
                          { label: "Reverted",  total: d.reverted.po + d.reverted.wo,   totalVal: d.reverted.poValue + d.reverted.woValue,   po: d.reverted.po,   wo: d.reverted.wo,   poVal: d.reverted.poValue,   woVal: d.reverted.woValue,   accent: "#ea580c" },
                          { label: "Rejected",  total: d.rejected.po + d.rejected.wo,   totalVal: d.rejected.poValue + d.rejected.woValue,   po: d.rejected.po,   wo: d.rejected.wo,   poVal: d.rejected.poValue,   woVal: d.rejected.woValue,   accent: "#dc2626" },
                          { label: "Recalled",  total: d.recalled.po + d.recalled.wo,   totalVal: d.recalled.poValue + d.recalled.woValue,   po: d.recalled.po,   wo: d.recalled.wo,   poVal: d.recalled.poValue,   woVal: d.recalled.woValue,   accent: "#7c3aed" },
                          { label: "Cancelled", total: d.cancelled.po + d.cancelled.wo, totalVal: d.cancelled.poValue + d.cancelled.woValue, po: d.cancelled.po, wo: d.cancelled.wo, poVal: d.cancelled.poValue, woVal: d.cancelled.woValue, accent: "#dc2626" },
                        ].map((it, i) => (
                          <div key={i} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" }}>
                            <div style={{ color: "#94a3b8", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{it.label}</div>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 7, marginBottom: 10 }}>
                              <span style={{ color: it.accent, fontSize: 24, fontWeight: 800, lineHeight: 1 }}>{fmt(it.total)}</span>
                              {it.totalVal !== undefined && <span style={{ color: "#94a3b8", fontSize: 11 }}>{fmtAmt(it.totalVal)}</span>}
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <span style={{ background: `${CP}18`, color: CP, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>PO</span>
                                <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 700 }}>{fmt(it.po)}</span>
                                {it.poVal !== undefined && <span style={{ color: "#94a3b8", fontSize: 11, marginLeft: "auto" }}>{fmtAmt(it.poVal)}</span>}
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                <span style={{ background: `${CW}18`, color: CW, fontSize: 10, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>WO</span>
                                <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 700 }}>{fmt(it.wo)}</span>
                                {it.woVal !== undefined && <span style={{ color: "#94a3b8", fontSize: 11, marginLeft: "auto" }}>{fmtAmt(it.woVal)}</span>}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ── CHARTS ── */}
          {(() => {
            const lCard = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px" };
            const lHead = (title, sub) => (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>{title}</div>
                {sub && <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>{sub}</div>}
              </div>
            );
            return (
              <>
                {/* Row 1: Entity + Site (left) | Month charts (right) */}
                <div style={{ display: "grid", gridTemplateColumns: "600px 1fr", gap: 14, marginBottom: 14 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                    {/* Entity-wise Spend — project entities only */}
                    {(() => {
                      const EP = "#4f46e5"; const EPL = "#818cf8";
                      const EW = "#f97316"; const EWL = "#fb923c";
                      const chartData = [...PROJECT_ENTITIES].sort((a, b) => (b.po + b.wo) - (a.po + a.wo)).map(s => ({ ...s, total: s.po + s.wo }));
                      const maxVal = Math.max(...chartData.map(s => s.total));
                      const grandPO = chartData.reduce((a, s) => a + s.po, 0);
                      const grandWO = chartData.reduce((a, s) => a + s.wo, 0);
                      const grandTotal = grandPO + grandWO;
                      return (
                        <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 12, padding: "10px 14px" }}>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>Entity-wise Spend</div>
                            <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>PO + WO spend across project entities</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", padding: "6px 10px", background: "#e0e7ff", marginBottom: 6 }}>
                            <div style={{ width: 82, flexShrink: 0, color: "#0f172a", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Entity</div>
                            <div style={{ flex: 1, display: "flex", gap: 14 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: EP }} /><span style={{ color: "#1e293b", fontSize: 10, fontWeight: 600 }}>PO Spend</span></div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: EW }} /><span style={{ color: "#1e293b", fontSize: 10, fontWeight: 600 }}>WO Spend</span></div>
                            </div>
                            <div style={{ marginLeft: "auto", width: 90, paddingLeft: 16, textAlign: "center", color: "#0f172a", fontSize: 10, fontWeight: 700 }}>Total Spend ↓</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            {chartData.map((s, i) => {
                              const poPct = Math.round((s.po / s.total) * 100);
                              const woPct = 100 - poPct;
                              const barW = (s.total / maxVal) * 100;
                              return (
                                <div key={i} style={{ display: "flex", alignItems: "center", padding: "0 10px", position: "relative" }}
                                  onMouseEnter={() => setHoveredEntity(i)} onMouseLeave={() => setHoveredEntity(null)}>
                                  <div style={{ width: 82, flexShrink: 0, color: "#0f172a", fontSize: 11, fontWeight: 600 }}>{s.entity}</div>
                                  <div style={{ flex: 1, height: 28, background: "#e0e7ff", borderRadius: 6, overflow: "hidden", cursor: "pointer" }}>
                                    <div style={{ width: `${barW}%`, height: "100%", display: "flex", borderRadius: 6, overflow: "hidden" }}>
                                      <div style={{ width: `${poPct}%`, background: `linear-gradient(90deg,${EP},${EPL})` }} />
                                      <div style={{ width: `${woPct}%`, background: `linear-gradient(90deg,${EW},${EWL})` }} />
                                    </div>
                                  </div>
                                  <div style={{ marginLeft: "auto", width: 90, paddingLeft: 16, textAlign: "center" }}>
                                    <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 800 }}>₹{fmt(s.total)}</span>
                                  </div>
                                  {hoveredEntity === i && (
                                    <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 90, zIndex: 200, background: "#fff", border: "1px solid #c7d2fe", borderRadius: 9, padding: "9px 13px", boxShadow: "0 6px 20px rgba(124,58,237,0.12)", pointerEvents: "none", whiteSpace: "nowrap" }}>
                                      <div style={{ color: "#64748b", fontSize: 10, fontWeight: 600, marginBottom: 7 }}>{s.entity}</div>
                                      <div style={{ display: "flex", gap: 14 }}>
                                        <div><div style={{ color: EP, fontSize: 12, fontWeight: 800 }}>₹{fmt(s.po)}</div><div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>PO · {poPct}%</div></div>
                                        <div style={{ width: 1, background: "#c7d2fe" }} />
                                        <div><div style={{ color: EW, fontSize: 12, fontWeight: 800 }}>₹{fmt(s.wo)}</div><div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>WO · {woPct}%</div></div>
                                        <div style={{ width: 1, background: "#c7d2fe" }} />
                                        <div><div style={{ color: "#0f172a", fontSize: 12, fontWeight: 800 }}>₹{fmt(s.total)}</div><div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>Total</div></div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ background: "#e0e7ff", border: "1px solid #c7d2fe", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                            <span style={{ color: "#0f172a", fontSize: 11, fontWeight: 700 }}>Overall Split</span>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <div style={{ paddingRight: 12, borderRight: "1px solid #c7d2fe", marginRight: 12 }}><span style={{ color: EP, fontSize: 18, fontWeight: 800 }}>{((grandPO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>PO Spend</div></div>
                              <div style={{ paddingRight: 12, borderRight: "1px solid #c7d2fe", marginRight: 12 }}><span style={{ color: EW, fontSize: 18, fontWeight: 800 }}>{((grandWO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>WO Spend</div></div>
                              <div style={{ paddingRight: 12, borderRight: "1px solid #c7d2fe", marginRight: 12 }}><div style={{ color: "#475569", fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Highest Spend</div><div style={{ color: EP, fontSize: 12, fontWeight: 700 }}>{chartData[0]?.entity}</div></div>
                              <div><div style={{ color: "#475569", fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Lowest Spend</div><div style={{ color: EW, fontSize: 12, fontWeight: 700 }}>{chartData[chartData.length-1]?.entity}</div></div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Site-wise Spend — project site only */}
                    {(() => {
                      const SP = "#0369a1"; const SPL = "#38bdf8";
                      const SW = "#be185d"; const SWL = "#f472b6";
                      const chartData = PROJECT_SITE_SPEND.map(s => ({ ...s, total: s.po + s.wo }));
                      const maxVal = Math.max(...chartData.map(s => s.total));
                      const grandPO = chartData.reduce((a, s) => a + s.po, 0);
                      const grandWO = chartData.reduce((a, s) => a + s.wo, 0);
                      const grandTotal = grandPO + grandWO;
                      return (
                        <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 12, padding: "10px 14px" }}>
                          <div style={{ marginBottom: 6 }}>
                            <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>Site-wise Spend</div>
                            <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>PO + WO spend for {PROJECT_SITE.site}</div>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", padding: "6px 10px", background: "#ffe4e6", marginBottom: 6 }}>
                            <div style={{ width: 82, flexShrink: 0, color: "#0f172a", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Site</div>
                            <div style={{ flex: 1, display: "flex", gap: 14 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: SP }} /><span style={{ color: "#1e293b", fontSize: 10, fontWeight: 600 }}>PO Spend</span></div>
                              <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: SW }} /><span style={{ color: "#1e293b", fontSize: 10, fontWeight: 600 }}>WO Spend</span></div>
                            </div>
                            <div style={{ marginLeft: "auto", width: 90, paddingLeft: 16, textAlign: "center", color: "#0f172a", fontSize: 10, fontWeight: 700 }}>Total Spend ↓</div>
                          </div>
                          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                            {chartData.map((s, i) => {
                              const poPct = Math.round((s.po / s.total) * 100);
                              const woPct = 100 - poPct;
                              const barW = (s.total / maxVal) * 100;
                              return (
                                <div key={i} style={{ display: "flex", alignItems: "center", padding: "0 10px", position: "relative" }}
                                  onMouseEnter={() => setHoveredSite(i)} onMouseLeave={() => setHoveredSite(null)}>
                                  <div style={{ width: 82, flexShrink: 0, color: "#0f172a", fontSize: 11, fontWeight: 600 }}>{s.site}</div>
                                  <div style={{ flex: 1, height: 28, background: "#ffe4e6", borderRadius: 6, overflow: "hidden", cursor: "pointer" }}>
                                    <div style={{ width: `${barW}%`, height: "100%", display: "flex", borderRadius: 6, overflow: "hidden" }}>
                                      <div style={{ width: `${poPct}%`, background: `linear-gradient(90deg,${SP},${SPL})` }} />
                                      <div style={{ width: `${woPct}%`, background: `linear-gradient(90deg,${SW},${SWL})` }} />
                                    </div>
                                  </div>
                                  <div style={{ marginLeft: "auto", width: 90, paddingLeft: 16, textAlign: "center" }}>
                                    <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 800 }}>₹{fmt(s.total)}</span>
                                  </div>
                                  {hoveredSite === i && (
                                    <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 90, zIndex: 200, background: "#fff", border: "1px solid #fecdd3", borderRadius: 9, padding: "9px 13px", boxShadow: "0 6px 20px rgba(190,24,93,0.10)", pointerEvents: "none", whiteSpace: "nowrap" }}>
                                      <div style={{ color: "#64748b", fontSize: 10, fontWeight: 600, marginBottom: 7 }}>{s.site}</div>
                                      <div style={{ display: "flex", gap: 14 }}>
                                        <div><div style={{ color: SP, fontSize: 12, fontWeight: 800 }}>₹{fmt(s.po)}</div><div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>PO · {poPct}%</div></div>
                                        <div style={{ width: 1, background: "#fecdd3" }} />
                                        <div><div style={{ color: SW, fontSize: 12, fontWeight: 800 }}>₹{fmt(s.wo)}</div><div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>WO · {woPct}%</div></div>
                                        <div style={{ width: 1, background: "#fecdd3" }} />
                                        <div><div style={{ color: "#0f172a", fontSize: 12, fontWeight: 800 }}>₹{fmt(s.total)}</div><div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>Total</div></div>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ background: "#ffe4e6", border: "1px solid #fecdd3", borderRadius: 10, padding: "8px 12px", display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 14 }}>
                            <span style={{ color: "#0f172a", fontSize: 11, fontWeight: 700 }}>Overall Split</span>
                            <div style={{ display: "flex", alignItems: "center" }}>
                              <div style={{ paddingRight: 12, borderRight: "1px solid #fca5a5", marginRight: 12 }}><span style={{ color: SP, fontSize: 18, fontWeight: 800 }}>{((grandPO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>PO Spend</div></div>
                              <div style={{ paddingRight: 12, borderRight: "1px solid #fca5a5", marginRight: 12 }}><span style={{ color: SW, fontSize: 18, fontWeight: 800 }}>{((grandWO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>WO Spend</div></div>
                              <div><div style={{ color: "#475569", fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Site</div><div style={{ color: SP, fontSize: 12, fontWeight: 700 }}>{PROJECT_SITE.site} ({PROJECT_SITE.code})</div></div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>{/* end left column */}

                  {/* RIGHT: Month-wise Spend + Count */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                    {(() => {
                      const filtered = dateRange === "This Month" ? monthlySpend.slice(-1)
                        : dateRange === "This Quarter" ? monthlySpend.slice(-3) : monthlySpend;
                      const barSz = filtered.length <= 3 ? 56 : filtered.length <= 6 ? 40 : 28;
                      return (
                        <div style={{ ...lCard, background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)", border: "1px solid #dbeafe" }}>
                          {lHead("Month-wise Spend", "Apr – Mar · PO + WO spend (₹L)")}
                          <ResponsiveContainer width="100%" height={210}>
                            <BarChart data={filtered} barSize={barSz} barCategoryGap="30%">
                              <defs>
                                <linearGradient id="pGradSPO" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1e40af" /><stop offset="100%" stopColor="#3b82f6" /></linearGradient>
                                <linearGradient id="pGradSWO" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#b45309" /><stop offset="100%" stopColor="#fbbf24" /></linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                              <XAxis dataKey="month" tick={{ fill: "#475569", fontSize: 11, fontWeight: 500 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} />
                              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} />
                              <Tooltip content={<MonthTooltip />} cursor={{ fill: "rgba(30,64,175,0.05)" }} />
                              <Legend wrapperStyle={{ color: "#475569", fontSize: 11 }} />
                              <Bar dataKey="po" name="PO Spend (₹L)" fill="url(#pGradSPO)" stackId="spend" radius={[0,0,0,0]} />
                              <Bar dataKey="wo" name="WO Spend (₹L)" fill="url(#pGradSWO)" stackId="spend" radius={[4,4,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                    {(() => {
                      const filtered = dateRange === "This Month" ? monthlyCount.slice(-1)
                        : dateRange === "This Quarter" ? monthlyCount.slice(-3) : monthlyCount;
                      const barSz = filtered.length <= 3 ? 56 : filtered.length <= 6 ? 40 : 28;
                      return (
                        <div style={{ ...lCard, background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)", border: "1px solid #bbf7d0" }}>
                          {lHead("Month-wise Order Count", "Apr – Mar · PO + WO order count")}
                          <ResponsiveContainer width="100%" height={210}>
                            <BarChart data={filtered} barSize={barSz} barCategoryGap="30%">
                              <defs>
                                <linearGradient id="pGradCPO" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#1d4ed8" /><stop offset="100%" stopColor="#60a5fa" /></linearGradient>
                                <linearGradient id="pGradCWO" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#047857" /><stop offset="100%" stopColor="#34d399" /></linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="#dcfce7" vertical={false} />
                              <XAxis dataKey="month" tick={{ fill: "#475569", fontSize: 11, fontWeight: 500 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} />
                              <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} />
                              <Tooltip content={<CountTooltip />} cursor={{ fill: "rgba(4,120,87,0.05)" }} />
                              <Legend wrapperStyle={{ color: "#475569", fontSize: 11 }} />
                              <Bar dataKey="po" name="PO Orders" fill="url(#pGradCPO)" stackId="count" radius={[0,0,0,0]} />
                              <Bar dataKey="wo" name="WO Orders" fill="url(#pGradCWO)" stackId="count" radius={[4,4,0,0]} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Row 2: Category + Top Vendors */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div style={lCard}>
                    {lHead("Category-wise Spend", "PO vs WO spend by category (₹L)")}
                    <ResponsiveContainer width="100%" height={230}>
                      <BarChart data={categorySpend} barGap={3}>
                        <defs>
                          <linearGradient id="pGradCatPO" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#4338ca" /><stop offset="100%" stopColor="#818cf8" /></linearGradient>
                          <linearGradient id="pGradCatWO" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#ea580c" /><stop offset="100%" stopColor="#fb923c" /></linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                        <XAxis dataKey="category" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                        <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                        <Tooltip content={<CatTip />} cursor={{ fill: "rgba(67,56,202,0.04)" }} />
                        <Legend wrapperStyle={{ color: "#64748b", fontSize: 11 }} />
                        <Bar dataKey="po" name="PO Spend" fill="url(#pGradCatPO)" radius={[4,4,0,0]} />
                        <Bar dataKey="wo" name="WO Spend" fill="url(#pGradCatWO)" radius={[4,4,0,0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={lCard}>
                    {lHead("Top 5 Vendors — PO", "By highest PO order value (₹L)")}
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={[...topVendorsPO].reverse()} layout="vertical">
                        <defs>{topVendorsPO.map((_, i) => (
                          <linearGradient key={i} id={`pGradVPO${i}`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={["#1e40af","#1d4ed8","#2563eb","#3b82f6","#60a5fa"][i]} />
                            <stop offset="100%" stopColor={["#2563eb","#3b82f6","#60a5fa","#93c5fd","#bfdbfe"][i]} />
                          </linearGradient>
                        ))}</defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fill: "#374151", fontSize: 10, fontWeight: 500 }} width={118} axisLine={false} tickLine={false} />
                        <Tooltip content={<VendorPOTip />} cursor={{ fill: "rgba(37,99,235,0.05)" }} />
                        <Bar dataKey="value" name="PO Value (₹L)" radius={[0,5,5,0]}>
                          {[...topVendorsPO].reverse().map((_, i) => <Cell key={i} fill={`url(#pGradVPO${4 - i})`} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div style={lCard}>
                    {lHead("Top 5 Vendors — WO", "By highest WO order value (₹L)")}
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart data={[...topVendorsWO].reverse()} layout="vertical">
                        <defs>{topVendorsWO.map((_, i) => (
                          <linearGradient key={i} id={`pGradVWO${i}`} x1="0" y1="0" x2="1" y2="0">
                            <stop offset="0%" stopColor={["#065f46","#047857","#059669","#10b981","#34d399"][i]} />
                            <stop offset="100%" stopColor={["#059669","#10b981","#34d399","#6ee7b7","#a7f3d0"][i]} />
                          </linearGradient>
                        ))}</defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fill: "#374151", fontSize: 10, fontWeight: 500 }} width={118} axisLine={false} tickLine={false} />
                        <Tooltip content={<VendorWOTip />} cursor={{ fill: "rgba(5,150,105,0.05)" }} />
                        <Bar dataKey="value" name="WO Value (₹L)" radius={[0,5,5,0]}>
                          {[...topVendorsWO].reverse().map((_, i) => <Cell key={i} fill={`url(#pGradVWO${4 - i})`} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* User Stats */}
                {(() => {
                  const uTh2 = { padding: "8px 10px", color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", textAlign: "left" };
                  const uTd  = { padding: "9px 14px", fontSize: 12.5, borderBottom: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" };
                  const uTdL = { padding: "9px 14px", fontSize: 12.5, borderBottom: "1px solid #e2e8f0" };
                  return (
                    <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                      <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, width: 580, flexShrink: 0, overflow: "hidden", background: "#fff" }}>
                        <div style={{ padding: "10px 14px", borderBottom: "1px solid #e2e8f0" }}>
                          <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>User Stats</div>
                          <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 1 }}>Hover on name → site breakdown</div>
                        </div>
                        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                          <colgroup>
                            <col style={{ width: "8%" }} /><col style={{ width: "30%" }} />
                            <col style={{ width: "13%" }} /><col style={{ width: "13%" }} />
                            <col style={{ width: "18%" }} /><col style={{ width: "18%" }} />
                          </colgroup>
                          <thead>
                            <tr>
                              {["S.No","User","PO","WO","Orders","Value"].map((h, hi, arr) => (
                                <th key={h} style={{ ...uTh2, borderRight: hi < arr.length - 1 ? "1px solid #e2e8f0" : "none" }}>{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {userOrderData.map((u, i) => (
                              <tr key={i} style={{ background: "#fff" }}
                                onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                                onMouseLeave={e => e.currentTarget.style.background = "#fff"}>
                                <td style={{ ...uTd, color: "#94a3b8", fontWeight: 500, fontSize: 12 }}>{i + 1}</td>
                                <td style={{ ...uTd }}>
                                  <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                                    onMouseEnter={e => { const t = e.currentTarget.querySelector(".utip"); if(t) t.style.display = "block"; }}
                                    onMouseLeave={e => { const t = e.currentTarget.querySelector(".utip"); if(t) t.style.display = "none"; }}>
                                    <span style={{ color: "#0f172a", fontWeight: 500, fontSize: 12.5, cursor: "default", borderBottom: "1px dashed #cbd5e1" }}>{u.name}</span>
                                    <div className="utip" style={{ display: "none", position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 300, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 6, boxShadow: "0 8px 24px rgba(15,23,42,0.13)", minWidth: 190, overflow: "hidden" }}>
                                      <div style={{ background: "#0f172a", padding: "6px 12px" }}><span style={{ color: "#fff", fontWeight: 700, fontSize: 11 }}>{u.name}</span></div>
                                      <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                        <thead><tr style={{ background: "#f8fafc" }}>
                                          <th style={{ color: "#64748b", fontSize: 9, fontWeight: 700, padding: "4px 10px", textAlign: "left", borderBottom: "1px solid #e2e8f0" }}>Site</th>
                                          <th style={{ color: "#64748b", fontSize: 9, fontWeight: 700, padding: "4px 8px", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}>PO</th>
                                          <th style={{ color: "#64748b", fontSize: 9, fontWeight: 700, padding: "4px 10px", textAlign: "center", borderBottom: "1px solid #e2e8f0" }}>WO</th>
                                        </tr></thead>
                                        <tbody>{u.sites.map((s, si) => (
                                          <tr key={si} style={{ borderTop: "1px solid #f1f5f9" }}>
                                            <td style={{ color: "#374151", fontSize: 11, fontWeight: 600, padding: "5px 10px" }}>{s.code}</td>
                                            <td style={{ color: CP, fontSize: 11, fontWeight: 700, padding: "5px 8px", textAlign: "center" }}>{s.po}</td>
                                            <td style={{ color: CW, fontSize: 11, fontWeight: 700, padding: "5px 10px", textAlign: "center" }}>{s.wo}</td>
                                          </tr>
                                        ))}</tbody>
                                      </table>
                                    </div>
                                  </div>
                                </td>
                                <td style={{ ...uTd, color: CP, fontWeight: 700 }}>{u.po}</td>
                                <td style={{ ...uTd, color: CW, fontWeight: 700 }}>{u.wo}</td>
                                <td style={{ ...uTd, color: "#0f172a", fontWeight: 800 }}>{u.total}</td>
                                <td style={{ ...uTdL, color: "#16a34a", fontWeight: 700 }}>₹{u.value}L</td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr style={{ background: "#f1f5f9", borderTop: "2px solid #e2e8f0" }}>
                              <td style={{ ...uTd, color: "#94a3b8" }}></td>
                              <td style={{ ...uTd, color: "#0f172a", fontWeight: 700 }}>Total</td>
                              <td style={{ ...uTd, color: CP, fontWeight: 800 }}>{userOrderData.reduce((s,x)=>s+x.po,0)}</td>
                              <td style={{ ...uTd, color: CW, fontWeight: 800 }}>{userOrderData.reduce((s,x)=>s+x.wo,0)}</td>
                              <td style={{ ...uTd, color: "#0f172a", fontWeight: 900 }}>{userOrderData.reduce((s,x)=>s+x.total,0)}</td>
                              <td style={{ ...uTdL, color: "#16a34a", fontWeight: 800 }}>₹{userOrderData.reduce((s,x)=>s+x.value,0)}L</td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </>
            );
          })()}
        </>
      )}

      {/* ════════════ AGING ════════════ */}
      {activeTab === "aging" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 380px))", gap: 10, marginBottom: 12 }}>
            {[
              { label: "In Review",        data: d.review,       color: CP,        icon: "🔍" },
              { label: "Pending to Issue", data: d.pendingIssue, color: "#f59e0b", icon: "⏳" },
              { label: "Amend Pending",    data: d.amendPending, color: CW,        icon: "✏️" },
            ].map((it, i) => {
              const totalOrders = it.data.po + it.data.wo;
              const totalVal    = (it.data.poValue || 0) + (it.data.woValue || 0);
              const buckets = [
                { label: "0–3 days",  pct: 0.40, color: "#16a34a" },
                { label: "4–7 days",  pct: 0.35, color: "#f59e0b" },
                { label: "8–15 days", pct: 0.18, color: "#ef4444" },
                { label: "15+ days",  pct: 0.07, color: "#991b1b" },
              ];
              return (
                <div key={i} style={{ background: "#fff", border: `1px solid ${it.color}22`, borderTop: `3px solid ${it.color}`, borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ color: "#475569", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                      <span>{it.icon}</span>{it.label}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ background: `${CP}15`, color: CP, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>PO {it.data.po}</span>
                      <span style={{ background: `${CW}15`, color: CW, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>WO {it.data.wo}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 14, paddingBottom: 10, marginBottom: 10, borderBottom: "1px solid #f1f5f9" }}>
                    <div>
                      <div style={{ color: it.color, fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{totalOrders}</div>
                      <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 2 }}>Total Orders</div>
                    </div>
                    <div style={{ width: 1, height: 30, background: "#e2e8f0", flexShrink: 0 }} />
                    <div>
                      <div style={{ color: "#0f172a", fontSize: 15, fontWeight: 800 }}>₹{fmt(totalVal)}L</div>
                      <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 2 }}>Total Value</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "5px 10px" }}>
                    {buckets.map((a, j) => {
                      const cnt = Math.round(it.data.po * a.pct);
                      const barW = Math.round((cnt / totalOrders) * 60);
                      return (
                        <div key={j} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 6, height: 6, borderRadius: "50%", background: a.color, flexShrink: 0 }} />
                          <span style={{ color: "#64748b", fontSize: 9, flex: 1, whiteSpace: "nowrap" }}>{a.label}</span>
                          <span style={{ color: a.color, fontSize: 10, fontWeight: 700, minWidth: 18, textAlign: "right" }}>{cnt}</span>
                          <div style={{ width: barW, height: 3, background: a.color, borderRadius: 2, opacity: 0.5, flexShrink: 0 }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ ...card, marginBottom: 12, padding: "12px 16px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div>
                <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>Pending at User</div>
                <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 1 }}>Orders awaiting action by responsible person</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
              {[
                { name: "Rahul Sharma", orders: 3, maxDays: 10, value: "₹16.8L" },
                { name: "Amit Singh",   orders: 2, maxDays: 8,  value: "₹11.2L" },
                { name: "Anita Joshi",  orders: 1, maxDays: 4,  value: "₹5.3L" },
                { name: "Karan Mehta",  orders: 1, maxDays: 3,  value: "₹2.1L" },
              ].map((u, i) => (
                <div key={i} style={{ background: `${agingColor(u.maxDays)}08`, border: `1px solid ${agingColor(u.maxDays)}22`, borderLeft: `3px solid ${agingColor(u.maxDays)}`, borderRadius: 8, padding: "8px 11px", display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "#0f172a", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{u.name}</div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                      <span style={{ color: agingColor(u.maxDays), fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{u.orders}</span>
                      <span style={{ color: "#64748b", fontSize: 9 }}>orders</span>
                      <span style={{ color: "#374151", fontSize: 11, fontWeight: 700, marginLeft: "auto" }}>{u.value}</span>
                    </div>
                  </div>
                  <AgingBadge days={u.maxDays} />
                </div>
              ))}
            </div>
          </div>

          {(() => {
            const filtered = agingData.filter(r =>
              (agingFilterType   === "All" || r.type      === agingFilterType) &&
              (agingFilterStatus === "All" || r.status    === agingFilterStatus) &&
              (agingFilterUser   === "All" || r.pendingAt === agingFilterUser) &&
              (!agingSearch || r.orderNo.toLowerCase().includes(agingSearch.toLowerCase()) || r.vendor.toLowerCase().includes(agingSearch.toLowerCase()))
            );
            return (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                <div style={{ padding: "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>Aging Detail — All Pending Orders</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 1 }}>Full list with status and aging · {filtered.length} orders</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }}>
                    <div style={{ position: "relative" }}>
                      <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      <input value={agingSearch} onChange={e => setAgingSearch(e.target.value)} placeholder="Search order / vendor…"
                        style={{ paddingLeft: 26, paddingRight: 10, paddingTop: 6, paddingBottom: 6, border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 12, color: "#374151", outline: "none", width: 190, background: "#fff" }} />
                    </div>
                    {/* No site filter — site is fixed to project */}
                    <select value={agingFilterType} onChange={e => setAgingFilterType(e.target.value)} style={selSt}>
                      <option value="All">All Types</option>
                      <option value="PO">Purchase Order</option>
                      <option value="WO">Work Order</option>
                    </select>
                    <select value={agingFilterStatus} onChange={e => setAgingFilterStatus(e.target.value)} style={selSt}>
                      <option value="All">All Status</option>
                      {["In Review","Pending Issue","Amend Pending"].map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={agingFilterUser} onChange={e => setAgingFilterUser(e.target.value)} style={selSt}>
                      <option value="All">Pending At</option>
                      {[...new Set(agingData.map(r => r.pendingAt))].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["ORDER NO","ORDER TYPE","SITE CODE","VENDOR","VALUE","STATUS","PENDING AT","SINCE","AGING"].map((h, hi, arr) => (
                          <th key={h} style={{ padding: "10px 14px", color: "#64748b", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", textAlign: "left", whiteSpace: "nowrap", borderBottom: "2px solid #e2e8f0", borderRight: hi < arr.length - 1 ? "1px solid #e2e8f0" : "none" }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0
                        ? <tr><td colSpan={9} style={{ padding: "28px", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>No orders match the filters</td></tr>
                        : filtered.map((row, i) => {
                            const sc = stColor(row.status);
                            const tdBase = { padding: "11px 14px", fontSize: 12.5, color: "#374151", borderBottom: "1px solid #f1f5f9" };
                            const tdDiv  = { ...tdBase, borderRight: "1px solid #f1f5f9" };
                            return (
                              <tr key={i} style={{ background: "#fff" }}
                                onMouseEnter={e => { e.currentTarget.style.background = "#f8fafc"; }}
                                onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}>
                                <td style={{ ...tdDiv, minWidth: 150 }}>
                                  <span onClick={() => setSelectedOrder(row)} style={{ color: "#0ea5e9", fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "'Inter', monospace" }}>{row.orderNo}</span>
                                </td>
                                <td style={{ ...tdDiv, minWidth: 130, color: "#1e293b", fontWeight: 400 }}>{row.type === "PO" ? "Purchase Order" : "Work Order"}</td>
                                <td style={{ ...tdDiv, minWidth: 90, color: "#475569", fontWeight: 500 }}>{row.siteCode}</td>
                                <td style={{ ...tdDiv, color: "#1e293b", fontWeight: 500 }}>{row.vendor}</td>
                                <td style={{ ...tdDiv, color: "#16a34a", fontWeight: 700, fontSize: 12.5 }}>{row.value}</td>
                                <td style={{ ...tdDiv, minWidth: 120 }}>
                                  <span style={{ background: sc.bg, color: sc.col, border: `1px solid ${sc.col}30`, borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{row.status}</span>
                                </td>
                                <td style={{ ...tdDiv, color: "#1e293b", fontWeight: 500 }}>{row.pendingAt}</td>
                                <td style={{ ...tdDiv, color: "#64748b", fontWeight: 400 }}>{row.since}</td>
                                <td style={{ ...tdBase }}><AgingBadge days={row.days} /></td>
                              </tr>
                            );
                          })
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })()}

          {/* Side Panel */}
          {selectedOrder && (
            <>
              <div onClick={() => setSelectedOrder(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.28)", zIndex: 998 }} />
              <div style={{ position: "fixed", right: 0, top: 0, height: "100vh", width: 380, background: "#fff", zIndex: 999, boxShadow: "-6px 0 32px rgba(15,23,42,0.13)", display: "flex", flexDirection: "column" }}>
                <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: "#f8fafc" }}>
                  <div>
                    <div style={{ color: CP, fontSize: 15, fontWeight: 800, marginBottom: 3 }}>{selectedOrder.orderNo}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span style={{ background: selectedOrder.type === "PO" ? `${CP}18` : `${CW}18`, color: selectedOrder.type === "PO" ? "#0891b2" : "#0d9488", borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 700 }}>{selectedOrder.type}</span>
                      <span style={{ background: stColor(selectedOrder.status).bg, color: stColor(selectedOrder.status).col, borderRadius: 5, padding: "2px 8px", fontSize: 10, fontWeight: 600 }}>{selectedOrder.status}</span>
                      <AgingBadge days={selectedOrder.days} />
                    </div>
                  </div>
                  <button onClick={() => setSelectedOrder(null)} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, width: 30, height: 30, cursor: "pointer", fontSize: 16, color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>✕</button>
                </div>
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                  {[
                    ["Vendor",       selectedOrder.vendor],
                    ["Value",        selectedOrder.value],
                    ["Site",         selectedOrder.site],
                    ["Site Code",    selectedOrder.siteCode],
                    ["Entity",       selectedOrder.entity],
                    ["Pending At",   selectedOrder.pendingAt],
                    ["Since",        selectedOrder.since],
                    ["Days Pending", `${selectedOrder.days} days`],
                  ].map(([label, val], i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                      <span style={{ color: "#64748b", fontSize: 12 }}>{label}</span>
                      <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 600 }}>{val}</span>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      </>)}
    </div>
  );
}
