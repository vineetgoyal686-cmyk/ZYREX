import { useState, useMemo, useEffect, memo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ComposedChart, Area, Cell, Line,
} from "recharts";

// ─── MOCK DATA ───────────────────────────────────────────────────────────────
const SITES = ["All Sites", "Site Alpha", "Site Beta", "Site Gamma", "Site Delta"];
const SITE_LIST   = ["Site Alpha", "Site Beta", "Site Gamma", "Site Delta"];
const ENTITY_LIST = ["Entity A", "Entity B", "Entity C", "Entity D"];

const gen = (site) => {
  const m = site === "All Sites" ? 4 : site === "Site Alpha" ? 1.8 : site === "Site Beta" ? 1.2 : site === "Site Gamma" ? 0.7 : 0.5;
  return {
    totalPO: Math.round(320 * m), totalWO: Math.round(185 * m),
    totalPOValue: Math.round(4820 * m), totalWOValue: Math.round(2150 * m),
    draft:        { po: Math.round(28 * m),  wo: Math.round(14 * m) },
    review:       { po: Math.round(45 * m),  wo: Math.round(22 * m),  poValue: Math.round(620 * m),  woValue: Math.round(310 * m) },
    pendingIssue: { po: Math.round(38 * m),  wo: Math.round(19 * m),  poValue: Math.round(540 * m),  woValue: Math.round(270 * m) },
    issued:       { po: Math.round(180 * m), wo: Math.round(105 * m), poValue: Math.round(3200 * m), woValue: Math.round(1450 * m) },
    reverted:     { po: Math.round(12 * m),  wo: Math.round(8 * m),   poValue: Math.round(180 * m),  woValue: Math.round(95 * m) },
    cancelled:    { po: Math.round(8 * m),   wo: Math.round(5 * m),   poValue: Math.round(120 * m),  woValue: Math.round(65 * m) },
    rejected:     { po: Math.round(6 * m),   wo: Math.round(4 * m),   poValue: Math.round(90 * m),   woValue: Math.round(48 * m) },
    recalled:     { po: Math.round(3 * m),   wo: Math.round(2 * m),   poValue: Math.round(45 * m),   woValue: Math.round(28 * m) },
    amendPending: { po: Math.round(15 * m),  wo: Math.round(9 * m),   poValue: Math.round(210 * m),  woValue: Math.round(115 * m) },
    amended:      { po: Math.round(22 * m),  wo: Math.round(13 * m),  poValue: Math.round(310 * m),  woValue: Math.round(165 * m) },
  };
};

const monthlySpend = [
  { month: "Apr", po: 320, wo: 145 }, { month: "May", po: 380, wo: 165 },
  { month: "Jun", po: 420, wo: 195 }, { month: "Jul", po: 395, wo: 180 },
  { month: "Aug", po: 510, wo: 220 }, { month: "Sep", po: 460, wo: 200 },
  { month: "Oct", po: 540, wo: 245 }, { month: "Nov", po: 490, wo: 215 },
  { month: "Dec", po: 620, wo: 280 }, { month: "Jan", po: 580, wo: 260 },
  { month: "Feb", po: 430, wo: 190 }, { month: "Mar", po: 520, wo: 235 },
];
const monthlyCount = [
  { month: "Apr", po: 36, wo: 20 }, { month: "May", po: 42, wo: 24 },
  { month: "Jun", po: 48, wo: 28 }, { month: "Jul", po: 45, wo: 26 },
  { month: "Aug", po: 58, wo: 32 }, { month: "Sep", po: 52, wo: 30 },
  { month: "Oct", po: 61, wo: 35 }, { month: "Nov", po: 55, wo: 31 },
  { month: "Dec", po: 70, wo: 40 }, { month: "Jan", po: 66, wo: 37 },
  { month: "Feb", po: 50, wo: 28 }, { month: "Mar", po: 60, wo: 34 },
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
  { category: "Civil", po: 1250, wo: 680 }, { category: "Electrical", po: 980, wo: 320 },
  { category: "Mechanical", po: 860, wo: 450 }, { category: "IT & Tech", po: 720, wo: 180 },
  { category: "Safety", po: 540, wo: 290 },    { category: "Infra", po: 470, wo: 230 },
];
const siteSpend = [
  { site: "Site Alpha", code: "SA-01", po: 1850, wo: 820 },
  { site: "Site Beta",  code: "SB-02", po: 1240, wo: 560 },
  { site: "Site Gamma", code: "SG-03", po: 890,  wo: 420 },
  { site: "Site Delta", code: "SD-04", po: 680,  wo: 340 },
];
const entitySpend = [
  { entity: "Entity A", code: "EA-01", po: 2100, wo: 950 },
  { entity: "Entity B", code: "EB-02", po: 1650, wo: 720 },
  { entity: "Entity C", code: "EC-03", po: 1200, wo: 580 },
  { entity: "Entity D", code: "ED-04", po: 820,  wo: 410 },
];
const monthlyData = monthlySpend.map((m, i) => ({
  month:      m.month,
  poSpend:    m.po,
  woSpend:    m.wo,
  totalSpend: m.po + m.wo,
  poCount:    monthlyCount[i].po,
  woCount:    monthlyCount[i].wo,
  totalCount: monthlyCount[i].po + monthlyCount[i].wo,
}));

const monthlyCountBySite = Object.fromEntries(
  monthlyCount.map(m => {
    const ratios = [0.46, 0.30, 0.14, 0.10];
    return [
      m.month,
      siteSpend.map((s, i) => ({
        code: s.code,
        po: Math.round(m.po * ratios[i]),
        wo: Math.round(m.wo * ratios[i]),
      }))
    ];
  })
);

const monthlySpendBySite = Object.fromEntries(
  monthlySpend.map(m => {
    const ratios = [0.46, 0.30, 0.14, 0.10];
    return [
      m.month,
      siteSpend.map((s, i) => ({
        code: s.code,
        po: Math.round(m.po * ratios[i]),
        wo: Math.round(m.wo * ratios[i]),
        orders: Math.round((m.po + m.wo) * ratios[i] / 8),
      }))
    ];
  })
);

const userOrderData = [
  { name: "Rahul Sharma", po: 68, wo: 42, total: 110, value: 248, sites: [{ code: "SA-01", po: 32, wo: 20 }, { code: "SB-02", po: 22, wo: 14 }, { code: "SG-03", po: 14, wo: 8 }] },
  { name: "Priya Verma",  po: 54, wo: 38, total: 92,  value: 186, sites: [{ code: "SB-02", po: 30, wo: 22 }, { code: "SD-04", po: 24, wo: 16 }] },
  { name: "Amit Singh",   po: 47, wo: 29, total: 76,  value: 153, sites: [{ code: "SA-01", po: 28, wo: 18 }, { code: "SG-03", po: 19, wo: 11 }] },
  { name: "Sneha Patel",  po: 41, wo: 25, total: 66,  value: 134, sites: [{ code: "SG-03", po: 41, wo: 25 }] },
  { name: "Karan Mehta",  po: 38, wo: 22, total: 60,  value: 118, sites: [{ code: "SD-04", po: 22, wo: 13 }, { code: "SA-01", po: 16, wo: 9 }] },
  { name: "Deepika Rao",  po: 35, wo: 18, total: 53,  value: 96,  sites: [{ code: "SB-02", po: 35, wo: 18 }] },
  { name: "Vijay Kumar",  po: 30, wo: 15, total: 45,  value: 82,  sites: [{ code: "SG-03", po: 18, wo: 9 }, { code: "SD-04", po: 12, wo: 6 }] },
  { name: "Anita Joshi",  po: 28, wo: 14, total: 42,  value: 74,  sites: [{ code: "SA-01", po: 28, wo: 14 }] },
];
const agingData = [
  { orderNo: "PO-2025-0312", type: "PO", vendor: "Tata Consultancy",   value: "₹12.4L", status: "Pending Issue", pendingAt: "Rahul Sharma", since: "02 May", days: 10, site: "Site Alpha", siteCode: "SA-01", entity: "Entity A" },
  { orderNo: "WO-2025-0198", type: "WO", vendor: "BuildRight Co.",     value: "₹4.8L",  status: "In Review",     pendingAt: "Priya Verma",  since: "05 May", days: 7,  site: "Site Beta",  siteCode: "SB-02", entity: "Entity B" },
  { orderNo: "PO-2025-0289", type: "PO", vendor: "Siemens India",      value: "₹8.2L",  status: "Pending Issue", pendingAt: "Amit Singh",   since: "04 May", days: 8,  site: "Site Alpha", siteCode: "SA-01", entity: "Entity A" },
  { orderNo: "WO-2025-0211", type: "WO", vendor: "MetroWorks Ltd",     value: "₹2.1L",  status: "In Review",     pendingAt: "Rahul Sharma", since: "09 May", days: 3,  site: "Site Gamma", siteCode: "SG-03", entity: "Entity C" },
  { orderNo: "PO-2025-0301", type: "PO", vendor: "L&T Infrastructure", value: "₹18.6L", status: "Amend Pending", pendingAt: "Sneha Patel",  since: "07 May", days: 5,  site: "Site Beta",  siteCode: "SB-02", entity: "Entity B" },
  { orderNo: "WO-2025-0225", type: "WO", vendor: "Infra Solutions",    value: "₹3.5L",  status: "Pending Issue", pendingAt: "Karan Mehta",  since: "01 May", days: 11, site: "Site Delta", siteCode: "SD-04", entity: "Entity D" },
  { orderNo: "PO-2025-0278", type: "PO", vendor: "ABB Limited",        value: "₹6.9L",  status: "In Review",     pendingAt: "Deepika Rao",  since: "08 May", days: 4,  site: "Site Alpha", siteCode: "SA-01", entity: "Entity A" },
];

// ─── FORMATTER ───────────────────────────────────────────────────────────────
const fmt = (n) => Number(n).toLocaleString("en-IN");
// Auto-detect magnitude from raw value
const fmtAmt = (n) => {
  const v = Number(n);
  if (!v) return null;
  if (v >= 10000000) return `₹${(v / 10000000).toFixed(2)}Cr`;
  if (v >= 100000)   return `₹${(v / 100000).toFixed(2)}L`;
  if (v >= 1000)     return `₹${(v / 1000).toFixed(1)}K`;
  return `₹${fmt(v)}`;
};

// ─── PALETTE ─────────────────────────────────────────────────────────────────
const CP  = "#06b6d4";   // cyan-500 → PO
const CPL = "#22d3ee";   // cyan-400 → PO light
const CW  = "#14b8a6";   // teal-500 → WO
const CWL = "#2dd4bf";   // teal-400 → WO light
const COLORS_PO = ["#06b6d4","#22d3ee","#67e8f9","#a5f3fc","#cffafe"];
const COLORS_WO = ["#14b8a6","#2dd4bf","#5eead4","#bbf7d0","#bbf7d0"];

const agingColor = (d) => d >= 8 ? "#ef4444" : d >= 4 ? "#f59e0b" : "#22c55e";
const stColor = (s) => s === "In Review"     ? { bg: "rgba(6,182,212,0.1)",  col: "#0891b2" }
              : s === "Pending Issue"         ? { bg: "rgba(245,158,11,0.1)", col: "#d97706" }
              : s === "Amend Pending"         ? { bg: "rgba(249,115,22,0.1)", col: "#ea580c" }
              : { bg: "#f1f5f9", col: "#64748b" };
const agingBg    = (d) => d >= 8 ? "rgba(239,68,68,0.1)" : d >= 4 ? "rgba(245,158,11,0.1)" : "rgba(34,197,94,0.1)";
const agingLabel = (d) => d >= 8 ? "Critical" : d >= 4 ? "Warning" : "Normal";

// ─── SHARED STYLES ───────────────────────────────────────────────────────────
const card  = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "14px 16px" };
const thSt  = { textAlign: "left", padding: "9px 12px", color: "#94a3b8", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", borderBottom: "1px solid #f1f5f9" };
const tdSt  = { padding: "10px 12px", fontSize: 12, color: "#374151", borderBottom: "1px solid #f9fafb" };

// ─── TOOLTIP ─────────────────────────────────────────────────────────────────
// ─── CATEGORY TOOLTIP ────────────────────────────────────────────────────────
const CatTip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const po = payload.find(p => p.dataKey === "po")?.value || 0;
  const wo = payload.find(p => p.dataKey === "wo")?.value || 0;
  const total = po + wo;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 168, boxShadow: "0 8px 24px rgba(15,23,42,0.13)" }}>
      <div style={{ background: "#0f172a", padding: "6px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{label}</span>
        <span style={{ color: "#34d399", fontWeight: 800, fontSize: 12 }}>₹{fmt(total)}L</span>
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

// ─── VENDOR PO TOOLTIP ───────────────────────────────────────────────────────
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

// ─── VENDOR WO TOOLTIP ───────────────────────────────────────────────────────
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

// ─── MONTH TOOLTIP (site spend breakdown table) ──────────────────────────────
const MonthTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const sites = monthlySpendBySite[label] || [];
  const poVal = payload.find(p => p.dataKey === "po")?.value || 0;
  const woVal = payload.find(p => p.dataKey === "wo")?.value || 0;
  const totalSpendVal = poVal + woVal;
  const fyStart = new Date().getMonth() >= 3 ? new Date().getFullYear() - 1 : new Date().getFullYear() - 2;
  const year = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(label) ? fyStart : fyStart + 1;
  const fullLabel = `${label}-${year}`;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 220, boxShadow: "0 8px 28px rgba(15,23,42,0.14)" }}>
      <div style={{ background: "#0f172a", padding: "7px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{fullLabel}</span>
        <span style={{ color: CPL, fontWeight: 800, fontSize: 13 }}>₹{fmt(totalSpendVal)}L</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ color: "#64748b", fontSize: 10, fontWeight: 700, padding: "5px 10px", textAlign: "left" }}>Site Code</th>
            <th style={{ color: "#64748b", fontSize: 10, fontWeight: 700, padding: "5px 8px", textAlign: "center" }}>Orders</th>
            <th style={{ color: "#374151", fontSize: 10, fontWeight: 700, padding: "5px 10px", textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ color: "#374151", fontSize: 11, fontWeight: 600, padding: "5px 10px" }}>{s.code}</td>
              <td style={{ color: "#64748b", fontSize: 11, padding: "5px 8px", textAlign: "center" }}>{s.orders}</td>
              <td style={{ color: "#0f172a", fontSize: 11, fontWeight: 700, padding: "5px 10px", textAlign: "right" }}>₹{fmt(s.po + s.wo)}L</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── COUNT TOOLTIP (site order count breakdown table) ────────────────────────
const CountTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const sites = monthlyCountBySite[label] || [];
  const poVal = payload.find(p => p.dataKey === "po")?.value || 0;
  const woVal = payload.find(p => p.dataKey === "wo")?.value || 0;
  const fyStart = new Date().getMonth() >= 3 ? new Date().getFullYear() - 1 : new Date().getFullYear() - 2;
  const year = ["Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].includes(label) ? fyStart : fyStart + 1;
  const fullLabel = `${label}-${year}`;
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 4, overflow: "hidden", minWidth: 210, boxShadow: "0 8px 28px rgba(15,23,42,0.14)" }}>
      <div style={{ background: "#0f172a", padding: "7px 10px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ color: "#fff", fontWeight: 800, fontSize: 13 }}>{fullLabel}</span>
        <span style={{ color: "#34d399", fontWeight: 800, fontSize: 13 }}>{poVal + woVal} Orders</span>
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
            <th style={{ color: "#64748b", fontSize: 10, fontWeight: 700, padding: "5px 10px", textAlign: "left" }}>Site Code</th>
            <th style={{ color: "#64748b", fontSize: 10, fontWeight: 700, padding: "5px 8px", textAlign: "center" }}>PO Count</th>
            <th style={{ color: "#64748b", fontSize: 10, fontWeight: 700, padding: "5px 10px", textAlign: "right" }}>WO Count</th>
          </tr>
        </thead>
        <tbody>
          {sites.map((s, i) => (
            <tr key={i} style={{ borderBottom: "1px solid #f1f5f9" }}>
              <td style={{ color: "#374151", fontSize: 11, fontWeight: 600, padding: "5px 10px" }}>{s.code}</td>
              <td style={{ color: "#2563eb", fontSize: 11, fontWeight: 700, padding: "5px 8px", textAlign: "center" }}>{s.po}</td>
              <td style={{ color: "#d97706", fontSize: 11, fontWeight: 700, padding: "5px 10px", textAlign: "right" }}>{s.wo}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// ─── SUMMARY CARD (3 hero stats at top) ─────────────────────────────────────
const SummaryCard = ({ title, icon, total, po, wo, poValue, woValue, accent }) => (
  <div style={{
    background: "linear-gradient(135deg, #0f172a 0%, #1a2236 100%)",
    border: `1px solid ${accent}28`,
    borderTop: `2px solid ${accent}`,
    borderRadius: 12, padding: "14px 18px",
  }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ color: "#64748b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em" }}>{title}</span>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: "#334155", fontSize: 9, fontWeight: 600, letterSpacing: "0.06em" }}>TOTAL</div>
        <div style={{ color: accent, fontSize: 30, fontWeight: 900, lineHeight: 1 }}>{total.toLocaleString()}</div>
      </div>
    </div>
    <div style={{ display: "flex", gap: 10, borderTop: "1px solid #1e293b", paddingTop: 10 }}>
      <div style={{ flex: 1 }}>
        <div style={{ color: "#334155", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 2 }}>PO</div>
        <div style={{ color: CP, fontSize: 20, fontWeight: 800 }}>{po.toLocaleString()}</div>
        {poValue !== undefined && <div style={{ color: CPL, fontSize: 10, fontWeight: 600, marginTop: 2 }}>₹{poValue.toLocaleString()}L</div>}
      </div>
      <div style={{ width: 1, background: "#1e293b" }} />
      <div style={{ flex: 1 }}>
        <div style={{ color: "#334155", fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", marginBottom: 2 }}>WO</div>
        <div style={{ color: CW, fontSize: 20, fontWeight: 800 }}>{wo.toLocaleString()}</div>
        {woValue !== undefined && <div style={{ color: CWL, fontSize: 10, fontWeight: 600, marginTop: 2 }}>₹{woValue.toLocaleString()}L</div>}
      </div>
    </div>
  </div>
);

// ─── KPI CARD (8 status mini-cards) ─────────────────────────────────────────
const KpiCard = ({ title, icon, total, po, wo, poValue, woValue, showValues = true, accent }) => (
  <div style={{
    background: "#0d1524",
    border: `1px solid ${accent}18`,
    borderLeft: `3px solid ${accent}`,
    borderRadius: 10, padding: "11px 13px",
    transition: "box-shadow 0.2s",
  }}
    onMouseEnter={e => { e.currentTarget.style.boxShadow = `0 4px 16px ${accent}18`; }}
    onMouseLeave={e => { e.currentTarget.style.boxShadow = "none"; }}
  >
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
        <span style={{ fontSize: 12 }}>{icon}</span>
        <span style={{ color: "#475569", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", lineHeight: 1.3 }}>{title}</span>
      </div>
      <div style={{ textAlign: "right" }}>
        <div style={{ color: "#1e293b", fontSize: 8, fontWeight: 600 }}>TOTAL</div>
        <div style={{ color: accent, fontSize: 22, fontWeight: 900, lineHeight: 1 }}>{total}</div>
      </div>
    </div>
    <div style={{ display: "flex", gap: 6 }}>
      <div style={{ flex: 1, background: `${CP}0c`, borderRadius: 6, padding: "5px 7px" }}>
        <div style={{ color: "#334155", fontSize: 8, fontWeight: 700, marginBottom: 1 }}>PO</div>
        <div style={{ color: CP, fontSize: 15, fontWeight: 800 }}>{po}</div>
        {showValues && poValue !== undefined && <div style={{ color: CPL, fontSize: 9, fontWeight: 600 }}>₹{poValue}L</div>}
      </div>
      <div style={{ flex: 1, background: `${CW}0c`, borderRadius: 6, padding: "5px 7px" }}>
        <div style={{ color: "#334155", fontSize: 8, fontWeight: 700, marginBottom: 1 }}>WO</div>
        <div style={{ color: CW, fontSize: 15, fontWeight: 800 }}>{wo}</div>
        {showValues && woValue !== undefined && <div style={{ color: CWL, fontSize: 9, fontWeight: 600 }}>₹{woValue}L</div>}
      </div>
    </div>
  </div>
);

// ─── AGING BADGE ─────────────────────────────────────────────────────────────
const AgingBadge = ({ days }) => (
  <span style={{
    background: agingBg(days), color: agingColor(days),
    border: `1px solid ${agingColor(days)}44`,
    borderRadius: 20, padding: "2px 9px", fontSize: 10, fontWeight: 700,
  }}>{agingLabel(days)} · {days}d</span>
);

// ─── SVG DONUT RING ──────────────────────────────────────────────────────────
const DonutRing = ({ pct, color = "#06b6d4", size = 46 }) => {
  const r = 17; const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 46 46">
      <circle cx="23" cy="23" r={r} fill="none" stroke="#e2e8f0" strokeWidth="5" />
      <circle cx="23" cy="23" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${(pct/100)*c} ${c}`} strokeLinecap="round"
        transform="rotate(-90 23 23)" />
      <text x="23" y="27" textAnchor="middle" fill={color} fontSize="10" fontWeight="800">{pct}%</text>
    </svg>
  );
};

// ─── SECTION HEADER ──────────────────────────────────────────────────────────
const SectionHeader = ({ title, subtitle }) => (
  <div style={{ marginBottom: 14 }}>
    <h3 style={{ color: "#0f172a", fontSize: 15, fontWeight: 700, margin: 0 }}>{title}</h3>
    {subtitle && <p style={{ color: "#94a3b8", fontSize: 11, margin: "3px 0 0" }}>{subtitle}</p>}
  </div>
);

// ─── CUSTOM SELECT ───────────────────────────────────────────────────────────
function Sel({ value, onChange, children, style = {} }) {
  return (
    <div style={{ position: "relative", display: "inline-block", ...style }}>
      <select value={value} onChange={onChange} style={{
        width: "100%", background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
        color: "#374151", padding: "6px 28px 6px 10px", fontSize: 12, cursor: "pointer",
        outline: "none", appearance: "none", WebkitAppearance: "none", boxSizing: "border-box",
      }}>
        {children}
      </select>
      <svg style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="10" height="6" viewBox="0 0 10 6" fill="none">
        <path d="M1 1l4 4 4-4" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

// ─── MULTI-SELECT DROPDOWN ───────────────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder, fullWidth = false }) {
  const [open, setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const filtered    = options.filter(o => o.toLowerCase().includes(search.toLowerCase()));
  const allSelected = selected.length === options.length;
  const noneSelected = selected.length === 0;
  const toggle = (opt) => onChange(selected.includes(opt) ? selected.filter(s => s !== opt) : [...selected, opt]);
  const label  = allSelected ? placeholder : noneSelected ? "None" : `${selected.length} of ${options.length}`;

  return (
    <div style={{ position: "relative", width: fullWidth ? "100%" : "auto" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
        color: "#374151", padding: "6px 10px", fontSize: 12, cursor: "pointer",
        outline: "none", display: "flex", alignItems: "center", gap: 8,
        minWidth: fullWidth ? 0 : 120, width: fullWidth ? "100%" : "auto",
        justifyContent: "space-between",
        boxShadow: open ? `0 0 0 2px ${CP}33` : "none",
        boxSizing: "border-box",
      }}>
        <span style={{ whiteSpace: "nowrap" }}>{label}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none" style={{ flexShrink: 0, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
          <path d="M1 1l4 4 4-4" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {open && (
        <>
          <div onClick={() => { setOpen(false); setSearch(""); }} style={{ position: "fixed", inset: 0, zIndex: 499 }} />
          <div style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0,
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10,
            boxShadow: "0 8px 32px rgba(15,23,42,0.12)", zIndex: 500,
            minWidth: 190, overflow: "hidden",
          }}>
            {/* Search */}
            <div style={{ padding: "8px 8px 4px" }}>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search..." autoFocus
                style={{ width: "100%", border: "1px solid #e2e8f0", borderRadius: 6, padding: "5px 9px", fontSize: 12, outline: "none", boxSizing: "border-box", color: "#374151" }}
              />
            </div>
            {/* Select All */}
            <div onClick={() => onChange(allSelected ? [] : [...options])} style={{ padding: "7px 12px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#374151", display: "flex", alignItems: "center", gap: 8, borderBottom: "1px solid #f1f5f9", background: allSelected ? `${CP}08` : "#fff" }}>
              <input type="checkbox" checked={allSelected} onChange={() => {}} style={{ cursor: "pointer", accentColor: CP, width: 13, height: 13 }} />
              All
              {!allSelected && selected.length > 0 && <span style={{ marginLeft: "auto", color: CP, fontSize: 11, fontWeight: 700 }}>{selected.length} ✓</span>}
            </div>
            {/* Options list */}
            <div style={{ maxHeight: 200, overflowY: "auto" }}>
              {filtered.length === 0
                ? <div style={{ padding: "10px 12px", fontSize: 12, color: "#94a3b8", textAlign: "center" }}>No results</div>
                : filtered.map(opt => (
                  <div key={opt} onClick={() => toggle(opt)} style={{
                    padding: "7px 12px", cursor: "pointer", fontSize: 12, color: "#374151",
                    display: "flex", alignItems: "center", gap: 8,
                    background: selected.includes(opt) ? `${CP}08` : "transparent",
                  }}>
                    <input type="checkbox" checked={selected.includes(opt)} onChange={() => {}} style={{ cursor: "pointer", accentColor: CP, width: 13, height: 13 }} />
                    {opt}
                  </div>
                ))
              }
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
const GlobalDashboard = memo(function GlobalDashboard() {
  const [selectedSites,    setSelectedSites]    = useState(SITE_LIST);
  const [selectedEntities, setSelectedEntities] = useState(ENTITY_LIST);
  const [dateRange,        setDateRange]        = useState("This Year");
  const [activeTab,        setActiveTab]        = useState("overview");
  const [activeModule,     setActiveModule]     = useState("orders");
  const [showMore,         setShowMore]         = useState(false);
  const [hoveredEntity,    setHoveredEntity]    = useState(null);
  const [hoveredSite,      setHoveredSite]      = useState(null);
  const [selectedOrder,    setSelectedOrder]    = useState(null);
  const [agingSearch,       setAgingSearch]       = useState("");
  const [agingFilterSite,   setAgingFilterSite]   = useState("All");
  const [agingFilterType,   setAgingFilterType]   = useState("All");
  const [agingFilterStatus, setAgingFilterStatus] = useState("All");
  const [agingFilterUser,   setAgingFilterUser]   = useState("All");

  const [winW, setWinW] = useState(typeof window !== "undefined" ? window.innerWidth : 1280);
  useEffect(() => {
    const fn = () => setWinW(window.innerWidth);
    window.addEventListener("resize", fn);
    return () => window.removeEventListener("resize", fn);
  }, []);
  const isMobile = winW < 768;
  const isTablet = winW < 1140;

  const isGlobal   = selectedSites.length === SITE_LIST.length;
  const genSite    = selectedSites.length === 1 ? selectedSites[0] : "All Sites";
  const d          = useMemo(() => gen(genSite), [genSite]);

  return (
    <div style={{ fontFamily: "'Inter','DM Sans',sans-serif", paddingBottom: 24, width: "100%", boxSizing: "border-box", overflowX: "hidden" }}>

      {/* ── HEADER CARD ── */}
      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, marginBottom: 16 }}>

        {/* Top row: title + module tabs */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", padding: isMobile ? "12px 14px" : "14px 20px", gap: 10 }}>
          <div>
            <h1 style={{ color: "#0f172a", fontSize: isMobile ? 16 : 18, fontWeight: 800, margin: 0, letterSpacing: "-0.02em" }}>Global Dashboard</h1>
          </div>
          <div style={{ display: "flex", gap: 2, background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: 3 }}>
            {[
              { key: "orders",  label: "Orders",  icon: "📦" },
              { key: "intake",  label: "Intake",  icon: "📋" },
              { key: "payment", label: "Payment", icon: "💳" },
            ].map(m => (
              <button key={m.key} onClick={() => setActiveModule(m.key)} style={{
                display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                padding: isMobile ? "8px 0" : "8px 20px", borderRadius: 8, border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: isMobile ? 12 : 13, transition: "all 0.18s",
                flex: isMobile ? 1 : "none",
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

        {/* Bottom row: sub-tabs + filters */}
        <div style={{ display: "flex", flexDirection: isMobile ? "column" : "row", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", padding: isMobile ? "8px 14px" : "10px 20px", gap: isMobile ? 8 : 12 }}>
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
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "nowrap", width: isMobile ? "100%" : "auto" }}>
            <div style={{ flex: isMobile ? 1 : "none" }}>
              <MultiSelect options={SITE_LIST}   selected={selectedSites}    onChange={setSelectedSites}    placeholder="All Sites" fullWidth={isMobile} />
            </div>
            <div style={{ flex: isMobile ? 1 : "none" }}>
              <MultiSelect options={ENTITY_LIST} selected={selectedEntities} onChange={setSelectedEntities} placeholder="All Entity" fullWidth={isMobile} />
            </div>
            <Sel value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ flex: isMobile ? 1 : "none", minWidth: isMobile ? 0 : 110 }}>
              {["This Month","This Quarter","This Year","Last Year"].map(dr => <option key={dr}>{dr}</option>)}
            </Sel>
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
            // Full-size card
            const SC = ({ label, total, totalVal, po, wo, poVal, woVal, accent = "#0f172a" }) => (
              <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "8px 13px", flex: isMobile ? "unset" : "0 0 auto", minWidth: isMobile ? 0 : 150, display: "flex", flexDirection: "column" }}>
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

            // Mini card (half-height, for stacked columns)
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
              <div style={{ display: isMobile ? "grid" : "flex", gridTemplateColumns: isMobile ? "1fr 1fr" : undefined, flexWrap: "wrap", gap: 8, marginBottom: 16, alignItems: "stretch" }}>

                {/* Full cards */}
                <SC label="Total Orders"  total={d.totalPO + d.totalWO}                 totalVal={d.totalPOValue + d.totalWOValue}               po={d.totalPO}         wo={d.totalWO}         poVal={d.totalPOValue}         woVal={d.totalWOValue}         accent="#0f172a" />
                <SC label="Issued"        total={d.issued.po + d.issued.wo}             totalVal={d.issued.poValue + d.issued.woValue}           po={d.issued.po}       wo={d.issued.wo}       poVal={d.issued.poValue}       woVal={d.issued.woValue}       accent="#16a34a" />
                <SC label="Amended"       total={d.amended.po + d.amended.wo}           totalVal={d.amended.poValue + d.amended.woValue}         po={d.amended.po}      wo={d.amended.wo}      poVal={d.amended.poValue}      woVal={d.amended.woValue}      accent={CW} />
                <SC label="In Review"     total={d.review.po + d.review.wo}             totalVal={d.review.poValue + d.review.woValue}           po={d.review.po}       wo={d.review.wo}       poVal={d.review.poValue}       woVal={d.review.woValue}       accent={CP} />
                <SC label="Pending Issue" total={d.pendingIssue.po + d.pendingIssue.wo} totalVal={d.pendingIssue.poValue + d.pendingIssue.woValue} po={d.pendingIssue.po} wo={d.pendingIssue.wo} poVal={d.pendingIssue.poValue} woVal={d.pendingIssue.woValue} accent="#d97706" />
                <SC label="Amend Request" total={d.amendPending.po + d.amendPending.wo} totalVal={d.amendPending.poValue + d.amendPending.woValue} po={d.amendPending.po} wo={d.amendPending.wo} poVal={d.amendPending.poValue} woVal={d.amendPending.woValue} accent="#f59e0b" />

                {/* Stacked column: Draft + More */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: isMobile ? "unset" : "0 0 auto", minWidth: isMobile ? 0 : 120 }}>
                  <Mini label="Draft" value={d.draft.po + d.draft.wo} accent="#64748b" po={d.draft.po} wo={d.draft.wo} />
                  <button onClick={() => setShowMore(true)} style={{
                    flex: 1, background: "#f8fafc", border: "1px dashed #cbd5e1", borderRadius: 12,
                    cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                    color: "#64748b", fontSize: 12, fontWeight: 600, padding: "0 14px",
                  }}>
                    <span style={{ fontSize: 18, lineHeight: 1 }}>···</span> More
                  </button>
                </div>

                {/* Stacked column: Total Vendors + Total Sites */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: isMobile ? "unset" : "0 0 auto", minWidth: isMobile ? 0 : 110 }}>
                  <Mini label="Total Vendors" value={48}  accent={CP} sub="registered" />
                  <Mini label="Total Sites"   value={isGlobal ? 4 : 1} accent={CW} sub="active" />
                </div>

                {/* Stacked column: Total Entity + Total Contact */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: isMobile ? "unset" : "0 0 auto", minWidth: isMobile ? 0 : 110 }}>
                  <Mini label="Total Entity"  value={12} accent="#7c3aed" sub="registered" />
                  <Mini label="Total Contact" value={86} accent="#0ea5e9" sub="active" />
                </div>

                {/* Total Clauses — standalone card */}
                <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "10px 13px", flex: isMobile ? "unset" : "0 0 auto", minWidth: isMobile ? 0 : 115, display: "flex", flexDirection: "column" }}>
                  <div style={{ color: "#94a3b8", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Total Clauses</div>
                  <div style={{ color: "#7c3aed", fontSize: 22, fontWeight: 800, lineHeight: 1, marginBottom: 7, whiteSpace: "nowrap" }}>156</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: "auto" }}>
                    {[
                      { label: "T&C", value: 64, color: CP },
                      { label: "PAY", value: 52, color: CW },
                      { label: "GOV", value: 40, color: "#f59e0b" },
                    ].map((it, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ background: `${it.color}18`, color: it.color, fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 4, minWidth: 28, textAlign: "center" }}>{it.label}</span>
                        <span style={{ color: "#0f172a", fontSize: 11, fontWeight: 700 }}>{it.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stacked column: Item Register + Total Users */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: isMobile ? "unset" : "0 0 auto", minWidth: isMobile ? 0 : 105 }}>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ color: "#94a3b8", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Item Register</div>
                    <div style={{ color: "#0ea5e9", fontSize: 18, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap" }}>328</div>
                    <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 2 }}>total items</div>
                  </div>
                  <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 10, padding: "8px 10px", flex: 1, display: "flex", flexDirection: "column" }}>
                    <div style={{ color: "#94a3b8", fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 3 }}>Total Users</div>
                    <div style={{ color: "#7c3aed", fontSize: 18, fontWeight: 800, lineHeight: 1, whiteSpace: "nowrap" }}>24</div>
                    <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 2 }}>active users</div>
                  </div>
                </div>

                {/* Popup Modal */}
                {showMore && (
                  <div onClick={() => setShowMore(false)} style={{
                    position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)",
                    zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <div onClick={e => e.stopPropagation()} style={{
                      background: "#fff", borderRadius: 16, padding: isMobile ? "16px" : "24px",
                      width: isMobile ? "calc(100vw - 32px)" : 580,
                      maxWidth: 580,
                      boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
                      border: "1px solid #e2e8f0",
                    }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
                        <div>
                          <div style={{ color: "#0f172a", fontSize: 15, fontWeight: 700 }}>More Order Stats</div>
                          <div style={{ color: "#94a3b8", fontSize: 12, marginTop: 2 }}>Additional status breakdown</div>
                        </div>
                        <button onClick={() => setShowMore(false)} style={{
                          background: "#f1f5f9", border: "none", borderRadius: 8,
                          width: 32, height: 32, cursor: "pointer", fontSize: 16,
                          display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b",
                        }}>✕</button>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "1fr 1fr 1fr", gap: isMobile ? 8 : 12 }}>
                        {[
                          { label: "Reverted",  total: d.reverted.po + d.reverted.wo,   totalVal: d.reverted.poValue + d.reverted.woValue,   po: d.reverted.po,   wo: d.reverted.wo,   poVal: d.reverted.poValue,   woVal: d.reverted.woValue,   accent: "#ea580c" },
                          { label: "Rejected",  total: d.rejected.po + d.rejected.wo,   totalVal: d.rejected.poValue + d.rejected.woValue,   po: d.rejected.po,   wo: d.rejected.wo,   poVal: d.rejected.poValue,   woVal: d.rejected.woValue,   accent: "#dc2626" },
                          { label: "Recalled",  total: d.recalled.po + d.recalled.wo,   totalVal: d.recalled.poValue + d.recalled.woValue,   po: d.recalled.po,   wo: d.recalled.wo,   poVal: d.recalled.poValue,   woVal: d.recalled.woValue,   accent: "#7c3aed" },
                          { label: "Cancelled", total: d.cancelled.po + d.cancelled.wo, totalVal: d.cancelled.poValue + d.cancelled.woValue, po: d.cancelled.po, wo: d.cancelled.wo, poVal: d.cancelled.poValue, woVal: d.cancelled.woValue, accent: "#dc2626" },
                          { label: "Trash",     total: 0,                               totalVal: undefined,                                  po: 0,               wo: 0,               poVal: undefined,            woVal: undefined,            accent: "#94a3b8" },
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

          {/* ── CHART CARDS (light) ── */}
          {(() => {
            const lCard = { background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 18px" };
            const lHead = (title, sub) => (
              <div style={{ marginBottom: 12 }}>
                <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>{title}</div>
                {sub && <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>{sub}</div>}
              </div>
            );
            const gX = { fill: "#94a3b8", fontSize: 10 };
            const gY = { fill: "#94a3b8", fontSize: 10 };
            const grid = <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />;
            return (
              <>
                {/* Row 1: [Entity+Site stacked left] + [Month charts stacked right] */}
                <div style={{ display: "grid", gridTemplateColumns: isTablet ? "1fr" : "600px 1fr", gap: 14, marginBottom: 14 }}>
                  {/* LEFT: Entity (top) + Site (bottom) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
                  {/* Entity-wise Spend */}
                  {(() => {
                    const EP = "#4f46e5"; const EPL = "#818cf8";
                    const EW = "#f97316"; const EWL = "#fb923c";
                    const chartData  = entitySpend.sort((a, b) => (b.po + b.wo) - (a.po + a.wo)).map(s => ({ ...s, total: s.po + s.wo }));
                    const maxVal     = Math.max(...chartData.map(s => s.total));
                    const grandPO    = chartData.reduce((a, s) => a + s.po, 0);
                    const grandWO    = chartData.reduce((a, s) => a + s.wo, 0);
                    const grandTotal = grandPO + grandWO;
                    const highest    = chartData[0];
                    const lowest     = chartData[chartData.length - 1];
                    return (
                      <div style={{ background: "#eef2ff", border: "1px solid #c7d2fe", borderRadius: 12, padding: "10px 14px" }}>
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>Entity-wise Spend</div>
                          <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>PO + WO spend across all entities</div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", padding: "6px 10px", background: "#e0e7ff", marginBottom: 6 }}>
                          <div style={{ width: isMobile ? 70 : 82, flexShrink: 0, color: "#0f172a", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Entity</div>
                          <div style={{ flex: 1, display: "flex", gap: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: EP, flexShrink: 0 }} /><span style={{ color: "#1e293b", fontSize: 10, fontWeight: 600 }}>PO Spend</span></div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: EW, flexShrink: 0 }} /><span style={{ color: "#1e293b", fontSize: 10, fontWeight: 600 }}>WO Spend</span></div>
                          </div>
                          <div style={{ width: isMobile ? 66 : 90, flexShrink: 0, paddingLeft: isMobile ? 8 : 16, textAlign: "center", color: "#0f172a", fontSize: 10, fontWeight: 700 }}>Total ↓</div>
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {chartData.map((s, i) => {
                            const poPct = Math.round((s.po / s.total) * 100);
                            const woPct = 100 - poPct;
                            const barW  = (s.total / maxVal) * 100;
                            return (
                              <div key={i} style={{ display: "flex", alignItems: "center", padding: "0 10px", position: "relative" }}
                                onMouseEnter={() => setHoveredEntity(i)}
                                onMouseLeave={() => setHoveredEntity(null)}
                              >
                                <div style={{ width: isMobile ? 70 : 82, flexShrink: 0, color: "#0f172a", fontSize: 11, fontWeight: 600 }}>{s.entity}</div>
                                <div style={{ flex: 1, height: 28, background: "#e0e7ff", borderRadius: 6, overflow: "hidden", cursor: "pointer" }}>
                                  <div style={{ width: `${barW}%`, height: "100%", display: "flex", borderRadius: 6, overflow: "hidden" }}>
                                    <div style={{ width: `${poPct}%`, background: `linear-gradient(90deg,${EP},${EPL})` }} />
                                    <div style={{ width: `${woPct}%`, background: `linear-gradient(90deg,${EW},${EWL})` }} />
                                  </div>
                                </div>
                                <div style={{ width: isMobile ? 66 : 90, flexShrink: 0, paddingLeft: isMobile ? 8 : 16, textAlign: "center" }}>
                                  <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 800 }}>₹{fmt(s.total)}</span>
                                </div>
                                {hoveredEntity === i && (
                                  <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 90, zIndex: 200,
                                    background: "#fff", border: "1px solid #c7d2fe", borderRadius: 9,
                                    padding: "9px 13px", boxShadow: "0 6px 20px rgba(124,58,237,0.12)", pointerEvents: "none", whiteSpace: "nowrap" }}>
                                    <div style={{ color: "#64748b", fontSize: 10, fontWeight: 600, marginBottom: 7 }}>{s.entity}</div>
                                    <div style={{ display: "flex", gap: 14 }}>
                                      <div>
                                        <div style={{ color: EP, fontSize: 12, fontWeight: 800 }}>₹{fmt(s.po)}</div>
                                        <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>PO · {poPct}%</div>
                                      </div>
                                      <div style={{ width: 1, background: "#c7d2fe" }} />
                                      <div>
                                        <div style={{ color: EW, fontSize: 12, fontWeight: 800 }}>₹{fmt(s.wo)}</div>
                                        <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>WO · {woPct}%</div>
                                      </div>
                                      <div style={{ width: 1, background: "#c7d2fe" }} />
                                      <div>
                                        <div style={{ color: "#0f172a", fontSize: 12, fontWeight: 800 }}>₹{fmt(s.total)}</div>
                                        <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>Total</div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <div style={{ background: "#e0e7ff", border: "1px solid #c7d2fe", borderRadius: 10, padding: "8px 12px", marginTop: 14 }}>
                          {isMobile ? (
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <span style={{ color: "#0f172a", fontSize: 11, fontWeight: 700 }}>Overall Split</span>
                                <div style={{ flex: 1 }} />
                                <div style={{ paddingRight: 8, borderRight: "1px solid #c7d2fe", marginRight: 8 }}><span style={{ color: EP, fontSize: 15, fontWeight: 800 }}>{((grandPO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>PO Spend</div></div>
                                <div><span style={{ color: EW, fontSize: 15, fontWeight: 800 }}>{((grandWO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>WO Spend</div></div>
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <div style={{ flex: 1, background: "#fff", borderRadius: 7, padding: "5px 8px" }}>
                                  <div style={{ color: "#475569", fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Highest Spend</div>
                                  <div style={{ color: EP, fontSize: 11, fontWeight: 700 }}>{highest?.entity}</div>
                                </div>
                                <div style={{ flex: 1, background: "#fff", borderRadius: 7, padding: "5px 8px" }}>
                                  <div style={{ color: "#475569", fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Lowest Spend</div>
                                  <div style={{ color: EW, fontSize: 11, fontWeight: 700 }}>{lowest?.entity}</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ color: "#0f172a", fontSize: 11, fontWeight: 700 }}>Overall Split</span>
                              <div style={{ display: "flex", alignItems: "center" }}>
                                <div style={{ paddingRight: 12, borderRight: "1px solid #c7d2fe", marginRight: 12 }}><span style={{ color: EP, fontSize: 18, fontWeight: 800 }}>{((grandPO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>PO Spend</div></div>
                                <div style={{ paddingRight: 12, borderRight: "1px solid #c7d2fe", marginRight: 12 }}><span style={{ color: EW, fontSize: 18, fontWeight: 800 }}>{((grandWO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>WO Spend</div></div>
                                <div style={{ paddingRight: 12, borderRight: "1px solid #c7d2fe", marginRight: 12 }}><div style={{ color: "#475569", fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Highest Spend</div><div style={{ color: EP, fontSize: 12, fontWeight: 700 }}>{highest?.entity}</div></div>
                                <div><div style={{ color: "#475569", fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Lowest Spend</div><div style={{ color: EW, fontSize: 12, fontWeight: 700 }}>{lowest?.entity}</div></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  {/* Site-wise Spend */}
                  {(() => {
                    const SP = "#0369a1"; const SPL = "#38bdf8";
                    const SW = "#be185d"; const SWL = "#f472b6";
                    const chartData  = siteSpend.filter(s => selectedSites.includes(s.site)).sort((a, b) => (b.po + b.wo) - (a.po + a.wo)).map(s => ({ ...s, total: s.po + s.wo }));
                    const maxVal     = Math.max(...chartData.map(s => s.total));
                    const grandPO    = chartData.reduce((a, s) => a + s.po, 0);
                    const grandWO    = chartData.reduce((a, s) => a + s.wo, 0);
                    const grandTotal = grandPO + grandWO;
                    const highest    = chartData[0];
                    const lowest     = chartData[chartData.length - 1];
                    return (
                      <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 12, padding: "10px 14px" }}>
                        {/* Header */}
                        <div style={{ marginBottom: 6 }}>
                          <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>Site-wise Spend</div>
                          <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>{isGlobal ? "PO + WO spend across all sites" : `${selectedSites.length} site${selectedSites.length > 1 ? "s" : ""} selected`}</div>
                        </div>
                        {/* Table-style column headers */}
                        <div style={{ display: "flex", alignItems: "center", padding: "6px 10px", background: "#ffe4e6", marginBottom: 6 }}>
                          <div style={{ width: isMobile ? 70 : 82, flexShrink: 0, color: "#0f172a", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em" }}>Site</div>
                          <div style={{ flex: 1, display: "flex", gap: 14 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: SP, flexShrink: 0 }} /><span style={{ color: "#1e293b", fontSize: 10, fontWeight: 600 }}>PO Spend</span></div>
                            <div style={{ display: "flex", alignItems: "center", gap: 4 }}><div style={{ width: 8, height: 8, borderRadius: 2, background: SW, flexShrink: 0 }} /><span style={{ color: "#1e293b", fontSize: 10, fontWeight: 600 }}>WO Spend</span></div>
                          </div>
                          <div style={{ width: isMobile ? 66 : 90, flexShrink: 0, paddingLeft: isMobile ? 8 : 16, textAlign: "center", color: "#0f172a", fontSize: 10, fontWeight: 700 }}>Total ↓</div>
                        </div>
                        {/* Site rows */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                          {chartData.map((s, i) => {
                            const poPct = Math.round((s.po / s.total) * 100);
                            const woPct = 100 - poPct;
                            const barW  = (s.total / maxVal) * 100;
                            return (
                              <div key={i} style={{ display: "flex", alignItems: "center", padding: "0 10px", position: "relative" }}
                                onMouseEnter={() => setHoveredSite(i)}
                                onMouseLeave={() => setHoveredSite(null)}
                              >
                                <div style={{ width: isMobile ? 70 : 82, flexShrink: 0, color: "#0f172a", fontSize: 11, fontWeight: 600 }}>{s.site}</div>
                                <div style={{ flex: 1, height: 28, background: "#ffe4e6", borderRadius: 6, overflow: "hidden", cursor: "pointer" }}>
                                  <div style={{ width: `${barW}%`, height: "100%", display: "flex", borderRadius: 6, overflow: "hidden" }}>
                                    <div style={{ width: `${poPct}%`, background: `linear-gradient(90deg,${SP},${SPL})` }} />
                                    <div style={{ width: `${woPct}%`, background: `linear-gradient(90deg,${SW},${SWL})` }} />
                                  </div>
                                </div>
                                <div style={{ width: isMobile ? 66 : 90, flexShrink: 0, paddingLeft: isMobile ? 8 : 16, textAlign: "center" }}>
                                  <span style={{ color: "#0f172a", fontSize: 12, fontWeight: 800 }}>₹{fmt(s.total)}</span>
                                </div>
                                {hoveredSite === i && (
                                  <div style={{ position: "absolute", top: "calc(100% + 5px)", left: 90, zIndex: 200,
                                    background: "#fff", border: "1px solid #fecdd3", borderRadius: 9,
                                    padding: "9px 13px", boxShadow: "0 6px 20px rgba(190,24,93,0.10)", pointerEvents: "none", whiteSpace: "nowrap" }}>
                                    <div style={{ color: "#64748b", fontSize: 10, fontWeight: 600, marginBottom: 7 }}>{s.site}</div>
                                    <div style={{ display: "flex", gap: 14 }}>
                                      <div>
                                        <div style={{ color: SP, fontSize: 12, fontWeight: 800 }}>₹{fmt(s.po)}</div>
                                        <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>PO · {poPct}%</div>
                                      </div>
                                      <div style={{ width: 1, background: "#fecdd3" }} />
                                      <div>
                                        <div style={{ color: SW, fontSize: 12, fontWeight: 800 }}>₹{fmt(s.wo)}</div>
                                        <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>WO · {woPct}%</div>
                                      </div>
                                      <div style={{ width: 1, background: "#fecdd3" }} />
                                      <div>
                                        <div style={{ color: "#0f172a", fontSize: 12, fontWeight: 800 }}>₹{fmt(s.total)}</div>
                                        <div style={{ color: "#94a3b8", fontSize: 9, marginTop: 1 }}>Total</div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {/* Footer */}
                        <div style={{ background: "#ffe4e6", border: "1px solid #fecdd3", borderRadius: 10, padding: "8px 12px", marginTop: 14 }}>
                          {isMobile ? (
                            <div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                                <span style={{ color: "#0f172a", fontSize: 11, fontWeight: 700 }}>Overall Split</span>
                                <div style={{ flex: 1 }} />
                                <div style={{ paddingRight: 8, borderRight: "1px solid #fca5a5", marginRight: 8 }}><span style={{ color: SP, fontSize: 15, fontWeight: 800 }}>{((grandPO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>PO Spend</div></div>
                                <div><span style={{ color: SW, fontSize: 15, fontWeight: 800 }}>{((grandWO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>WO Spend</div></div>
                              </div>
                              <div style={{ display: "flex", gap: 8 }}>
                                <div style={{ flex: 1, background: "#fff", borderRadius: 7, padding: "5px 8px" }}>
                                  <div style={{ color: "#475569", fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Highest Spend</div>
                                  <div style={{ color: SP, fontSize: 11, fontWeight: 700 }}>{highest?.site}</div>
                                </div>
                                <div style={{ flex: 1, background: "#fff", borderRadius: 7, padding: "5px 8px" }}>
                                  <div style={{ color: "#475569", fontSize: 9, fontWeight: 600, marginBottom: 2 }}>Lowest Spend</div>
                                  <div style={{ color: SW, fontSize: 11, fontWeight: 700 }}>{lowest?.site}</div>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ color: "#0f172a", fontSize: 11, fontWeight: 700 }}>Overall Split</span>
                              <div style={{ display: "flex", alignItems: "center" }}>
                                <div style={{ paddingRight: 12, borderRight: "1px solid #fca5a5", marginRight: 12 }}><span style={{ color: SP, fontSize: 18, fontWeight: 800 }}>{((grandPO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>PO Spend</div></div>
                                <div style={{ paddingRight: 12, borderRight: "1px solid #fca5a5", marginRight: 12 }}><span style={{ color: SW, fontSize: 18, fontWeight: 800 }}>{((grandWO/grandTotal)*100).toFixed(0)}%</span><div style={{ color: "#475569", fontSize: 9, fontWeight: 600 }}>WO Spend</div></div>
                                <div style={{ paddingRight: 12, borderRight: "1px solid #fca5a5", marginRight: 12 }}><div style={{ color: "#475569", fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Highest Spend</div><div style={{ color: SP, fontSize: 12, fontWeight: 700 }}>{highest?.site}</div></div>
                                <div><div style={{ color: "#475569", fontSize: 10, fontWeight: 600, marginBottom: 2 }}>Lowest Spend</div><div style={{ color: SW, fontSize: 12, fontWeight: 700 }}>{lowest?.site}</div></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })()}
                  </div>{/* end left column */}

                  {/* RIGHT: Month-wise Spend (top) + Month-wise Order Count (bottom) */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>

                    {/* Month-wise Spend — Stacked Bar */}
                    {(() => {
                      const filtered = dateRange === "This Month"
                        ? monthlySpend.slice(-1)
                        : dateRange === "This Quarter"
                        ? monthlySpend.slice(-3)
                        : monthlySpend;
                      const subtitle = dateRange === "This Month" ? "Current month spend"
                        : dateRange === "This Quarter" ? "Last 3 months spend"
                        : dateRange === "Last Year" ? "Previous FY spend"
                        : "Apr – Mar · PO + WO spend (₹L)";
                      const barSz = filtered.length <= 3 ? 56 : filtered.length <= 6 ? 40 : 28;
                      return (
                        <div style={{ ...lCard, background: "linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%)", border: "1px solid #dbeafe" }}>
                          {lHead("Month-wise Spend", subtitle)}
                          {isMobile && (
                            <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{ width: 12, height: 12, borderRadius: 2, background: "#1e40af" }} />
                                <span style={{ fontSize: 10, color: "#475569" }}>PO Spend (₹L)</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{ width: 12, height: 12, borderRadius: 2, background: "#fbbf24" }} />
                                <span style={{ fontSize: 10, color: "#475569" }}>WO Spend (₹L)</span>
                              </div>
                            </div>
                          )}
                          {isMobile ? (
                            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
                              <BarChart width={Math.max(filtered.length * 52, 340)} height={190} data={filtered} barSize={barSz} barCategoryGap="30%">
                                <defs>
                                  <linearGradient id="gradSPO" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#1e40af" />
                                    <stop offset="100%" stopColor="#3b82f6" />
                                  </linearGradient>
                                  <linearGradient id="gradSWO" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#b45309" />
                                    <stop offset="100%" stopColor="#fbbf24" />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="month" tick={{ fill: "#475569", fontSize: 10, fontWeight: 500 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} />
                                <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} width={36} />
                                <Tooltip content={<MonthTooltip />} cursor={{ fill: "rgba(30,64,175,0.05)" }} />
                                <Bar dataKey="po" name="PO Spend (₹L)" fill="url(#gradSPO)" stackId="spend" radius={[0,0,0,0]} />
                                <Bar dataKey="wo" name="WO Spend (₹L)" fill="url(#gradSWO)" stackId="spend" radius={[4,4,0,0]} />
                              </BarChart>
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height={210} debounce={260}>
                              <BarChart data={filtered} barSize={barSz} barCategoryGap="30%">
                                <defs>
                                  <linearGradient id="gradSPO" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#1e40af" />
                                    <stop offset="100%" stopColor="#3b82f6" />
                                  </linearGradient>
                                  <linearGradient id="gradSWO" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#b45309" />
                                    <stop offset="100%" stopColor="#fbbf24" />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                                <XAxis dataKey="month" tick={{ fill: "#475569", fontSize: 11, fontWeight: 500 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} />
                                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} width={40} />
                                <Tooltip content={<MonthTooltip />} cursor={{ fill: "rgba(30,64,175,0.05)" }} />
                                <Legend wrapperStyle={{ color: "#475569", fontSize: 11 }} />
                                <Bar dataKey="po" name="PO Spend (₹L)" fill="url(#gradSPO)" stackId="spend" radius={[0,0,0,0]} />
                                <Bar dataKey="wo" name="WO Spend (₹L)" fill="url(#gradSWO)" stackId="spend" radius={[4,4,0,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      );
                    })()}

                    {/* Month-wise Order Count — Stacked Bar */}
                    {(() => {
                      const filtered = dateRange === "This Month"
                        ? monthlyCount.slice(-1)
                        : dateRange === "This Quarter"
                        ? monthlyCount.slice(-3)
                        : monthlyCount;
                      const subtitle = dateRange === "This Month" ? "Current month order count"
                        : dateRange === "This Quarter" ? "Last 3 months order count"
                        : dateRange === "Last Year" ? "Previous FY order count"
                        : "Apr – Mar · PO + WO order count";
                      const barSz = filtered.length <= 3 ? 56 : filtered.length <= 6 ? 40 : 28;
                      return (
                        <div style={{ ...lCard, background: "linear-gradient(135deg, #f0fdf4 0%, #ecfdf5 100%)", border: "1px solid #bbf7d0" }}>
                          {lHead("Month-wise Order Count", subtitle)}
                          {isMobile && (
                            <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{ width: 12, height: 12, borderRadius: 2, background: "#1d4ed8" }} />
                                <span style={{ fontSize: 10, color: "#475569" }}>PO Orders</span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                <div style={{ width: 12, height: 12, borderRadius: 2, background: "#34d399" }} />
                                <span style={{ fontSize: 10, color: "#475569" }}>WO Orders</span>
                              </div>
                            </div>
                          )}
                          {isMobile ? (
                            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
                              <BarChart width={Math.max(filtered.length * 52, 340)} height={190} data={filtered} barSize={barSz} barCategoryGap="30%">
                                <defs>
                                  <linearGradient id="gradCPO" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#1d4ed8" />
                                    <stop offset="100%" stopColor="#60a5fa" />
                                  </linearGradient>
                                  <linearGradient id="gradCWO" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#047857" />
                                    <stop offset="100%" stopColor="#34d399" />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#dcfce7" vertical={false} />
                                <XAxis dataKey="month" tick={{ fill: "#475569", fontSize: 10, fontWeight: 500 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} />
                                <YAxis tick={{ fill: "#64748b", fontSize: 9 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} width={36} />
                                <Tooltip content={<CountTooltip />} cursor={{ fill: "rgba(4,120,87,0.05)" }} />
                                <Bar dataKey="po" name="PO Orders" fill="url(#gradCPO)" stackId="count" radius={[0,0,0,0]} />
                                <Bar dataKey="wo" name="WO Orders" fill="url(#gradCWO)" stackId="count" radius={[4,4,0,0]} />
                              </BarChart>
                            </div>
                          ) : (
                            <ResponsiveContainer width="100%" height={210} debounce={260}>
                              <BarChart data={filtered} barSize={barSz} barCategoryGap="30%">
                                <defs>
                                  <linearGradient id="gradCPO" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#1d4ed8" />
                                    <stop offset="100%" stopColor="#60a5fa" />
                                  </linearGradient>
                                  <linearGradient id="gradCWO" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#047857" />
                                    <stop offset="100%" stopColor="#34d399" />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#dcfce7" vertical={false} />
                                <XAxis dataKey="month" tick={{ fill: "#475569", fontSize: 11, fontWeight: 500 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} />
                                <YAxis tick={{ fill: "#64748b", fontSize: 10 }} axisLine={{ stroke: "#94a3b8" }} tickLine={false} width={40} />
                                <Tooltip content={<CountTooltip />} cursor={{ fill: "rgba(4,120,87,0.05)" }} />
                                <Legend wrapperStyle={{ color: "#475569", fontSize: 11 }} />
                                <Bar dataKey="po" name="PO Orders" fill="url(#gradCPO)" stackId="count" radius={[0,0,0,0]} />
                                <Bar dataKey="wo" name="WO Orders" fill="url(#gradCWO)" stackId="count" radius={[4,4,0,0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      );
                    })()}

                  </div>{/* end right column */}
                </div>

                {/* Row 3: Category Spend + Top Vendors PO + WO */}
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "1fr 1fr 1fr", gap: 14, marginBottom: 14, minWidth: 0 }}>
                  {/* Category-wise Spend */}
                  <div style={lCard}>
                    {lHead("Category-wise Spend", "PO vs WO spend by category (₹L)")}
                    {isMobile && (
                      <div style={{ display: "flex", gap: 14, marginBottom: 8 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 12, height: 12, borderRadius: 2, background: "#4338ca" }} />
                          <span style={{ fontSize: 10, color: "#475569" }}>PO Spend</span>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                          <div style={{ width: 12, height: 12, borderRadius: 2, background: "#fb923c" }} />
                          <span style={{ fontSize: 10, color: "#475569" }}>WO Spend</span>
                        </div>
                      </div>
                    )}
                    {isMobile ? (
                      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch", width: "100%" }}>
                        <BarChart width={Math.max(categorySpend.length * 58, 320)} height={200} data={categorySpend} barGap={3}>
                          <defs>
                            <linearGradient id="gradCatPO" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4338ca" />
                              <stop offset="100%" stopColor="#818cf8" />
                            </linearGradient>
                            <linearGradient id="gradCatWO" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#ea580c" />
                              <stop offset="100%" stopColor="#fb923c" />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="category" tick={{ fill: "#64748b", fontSize: 9 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                          <YAxis tick={{ fill: "#94a3b8", fontSize: 9 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} width={36} />
                          <Tooltip content={<CatTip />} cursor={{ fill: "rgba(67,56,202,0.04)" }} />
                          <Bar dataKey="po" name="PO Spend" fill="url(#gradCatPO)" radius={[4,4,0,0]} />
                          <Bar dataKey="wo" name="WO Spend" fill="url(#gradCatWO)" radius={[4,4,0,0]} />
                        </BarChart>
                      </div>
                    ) : (
                      <ResponsiveContainer width="100%" height={230} debounce={260}>
                        <BarChart data={categorySpend} barGap={3}>
                          <defs>
                            <linearGradient id="gradCatPO" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4338ca" />
                              <stop offset="100%" stopColor="#818cf8" />
                            </linearGradient>
                            <linearGradient id="gradCatWO" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#ea580c" />
                              <stop offset="100%" stopColor="#fb923c" />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                          <XAxis dataKey="category" tick={{ fill: "#64748b", fontSize: 10 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                          <YAxis tick={{ fill: "#94a3b8", fontSize: 10 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} width={40} />
                          <Tooltip content={<CatTip />} cursor={{ fill: "rgba(67,56,202,0.04)" }} />
                          <Legend wrapperStyle={{ color: "#64748b", fontSize: 11 }} />
                          <Bar dataKey="po" name="PO Spend" fill="url(#gradCatPO)" radius={[4,4,0,0]} />
                          <Bar dataKey="wo" name="WO Spend" fill="url(#gradCatWO)" radius={[4,4,0,0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    )}
                  </div>

                  {/* Top 5 Vendors — PO */}
                  <div style={lCard}>
                    {lHead("Top 5 Vendors — PO", "By highest PO order value (₹L)")}
                    <ResponsiveContainer width="100%" height={220} debounce={260}>
                      <BarChart data={[...topVendorsPO].reverse()} layout="vertical">
                        <defs>
                          {topVendorsPO.map((_, i) => (
                            <linearGradient key={i} id={`gradVPO${i}`} x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor={["#1e40af","#1d4ed8","#2563eb","#3b82f6","#60a5fa"][i]} />
                              <stop offset="100%" stopColor={["#2563eb","#3b82f6","#60a5fa","#93c5fd","#bfdbfe"][i]} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: isMobile ? 9 : 10 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fill: "#374151", fontSize: isMobile ? 9 : 10, fontWeight: 500 }} width={isMobile ? 90 : 118} axisLine={false} tickLine={false} />
                        <Tooltip content={<VendorPOTip />} cursor={{ fill: "rgba(37,99,235,0.05)" }} />
                        <Bar dataKey="value" name="PO Value (₹L)" radius={[0,5,5,0]}>
                          {[...topVendorsPO].reverse().map((_, i) => (
                            <Cell key={i} fill={`url(#gradVPO${4 - i})`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Top 5 Vendors — WO */}
                  <div style={lCard}>
                    {lHead("Top 5 Vendors — WO", "By highest WO order value (₹L)")}
                    <ResponsiveContainer width="100%" height={220} debounce={260}>
                      <BarChart data={[...topVendorsWO].reverse()} layout="vertical">
                        <defs>
                          {topVendorsWO.map((_, i) => (
                            <linearGradient key={i} id={`gradVWO${i}`} x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor={["#065f46","#047857","#059669","#10b981","#34d399"][i]} />
                              <stop offset="100%" stopColor={["#059669","#10b981","#34d399","#6ee7b7","#a7f3d0"][i]} />
                            </linearGradient>
                          ))}
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                        <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: isMobile ? 9 : 10 }} axisLine={{ stroke: "#e2e8f0" }} tickLine={false} />
                        <YAxis dataKey="name" type="category" tick={{ fill: "#374151", fontSize: isMobile ? 9 : 10, fontWeight: 500 }} width={isMobile ? 90 : 118} axisLine={false} tickLine={false} />
                        <Tooltip content={<VendorWOTip />} cursor={{ fill: "rgba(5,150,105,0.05)" }} />
                        <Bar dataKey="value" name="WO Value (₹L)" radius={[0,5,5,0]}>
                          {[...topVendorsWO].reverse().map((_, i) => (
                            <Cell key={i} fill={`url(#gradVWO${4 - i})`} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              {/* User Performance Stats — compact */}
              {(() => {
                const totalAll = userOrderData.reduce((s, x) => s + x.total, 0);
                const totalVal = userOrderData.reduce((s, x) => s + x.value, 0);
                const uTh = { padding: "8px 14px", color: "#64748b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap" };
                const uTh2 = { padding: "8px 10px", color: "#475569", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", background: "#f1f5f9", borderBottom: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0", textAlign: "left" };
                const uTd = { padding: "9px 14px", fontSize: 12.5, borderBottom: "1px solid #e2e8f0", borderRight: "1px solid #e2e8f0" };
                const uTdLast = { padding: "9px 14px", fontSize: 12.5, borderBottom: "1px solid #e2e8f0" };
                return (
                  <div style={{ display: "flex", gap: 14, marginBottom: 14 }}>
                    <div style={{ border: "1px solid #e2e8f0", borderRadius: 6, width: isMobile ? "100%" : 580, flexShrink: 0, overflow: "hidden", background: "#fff" }}>
                      <div style={{ padding: "10px 14px", borderBottom: "1px solid #e2e8f0" }}>
                        <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>User Stats</div>
                        <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 1 }}>Hover on name → site breakdown</div>
                      </div>
                      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
                        <colgroup>
                          <col style={{ width: "8%" }} />
                          <col style={{ width: "30%" }} />
                          <col style={{ width: "13%" }} />
                          <col style={{ width: "13%" }} />
                          <col style={{ width: "18%" }} />
                          <col style={{ width: "18%" }} />
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
                              onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                            >
                              <td style={{ ...uTd, color: "#94a3b8", fontWeight: 500, fontSize: 12 }}>{i + 1}</td>
                              <td style={{ ...uTd }}>
                                <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
                                  onMouseEnter={e => { const t = e.currentTarget.querySelector(".utip"); if(t) t.style.display = "block"; }}
                                  onMouseLeave={e => { const t = e.currentTarget.querySelector(".utip"); if(t) t.style.display = "none"; }}
                                >
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
                              <td style={{ ...uTdLast, color: "#16a34a", fontWeight: 700 }}>₹{u.value}L</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: "#f1f5f9", borderTop: "2px solid #e2e8f0" }}>
                            <td style={{ ...uTd, color: "#94a3b8" }}></td>
                            <td style={{ ...uTd, color: "#0f172a", fontWeight: 700 }}>Total</td>
                            <td style={{ ...uTd, color: CP, fontWeight: 800 }}>{userOrderData.reduce((s,x)=>s+x.po,0)}</td>
                            <td style={{ ...uTd, color: CW, fontWeight: 800 }}>{userOrderData.reduce((s,x)=>s+x.wo,0)}</td>
                            <td style={{ ...uTd, color: "#0f172a", fontWeight: 900 }}>{totalAll}</td>
                            <td style={{ ...uTdLast, color: "#16a34a", fontWeight: 800 }}>₹{totalVal}L</td>
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
          <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : isTablet ? "1fr 1fr" : "repeat(3, minmax(0, 380px))", gap: 10, marginBottom: 12 }}>
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
                <div key={i} style={{
                  background: "#fff",
                  border: `1px solid ${it.color}22`,
                  borderTop: `3px solid ${it.color}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                }}>
                  {/* Title + PO/WO counts */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                    <span style={{ color: "#475569", fontSize: 11, fontWeight: 700, display: "flex", alignItems: "center", gap: 5 }}>
                      <span>{it.icon}</span>{it.label}
                    </span>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ background: `${CP}15`, color: CP, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>PO {it.data.po}</span>
                      <span style={{ background: `${CW}15`, color: CW, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>WO {it.data.wo}</span>
                    </div>
                  </div>

                  {/* Stats row */}
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

                  {/* Aging buckets — compact 2-col */}
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
            <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr 1fr" : isTablet ? "repeat(3,1fr)" : "repeat(4,1fr)", gap: 8 }}>
              {[
                { name: "Rahul Sharma", orders: 5, maxDays: 10, value: "₹16.8L" },
                { name: "Priya Verma",  orders: 3, maxDays: 7,  value: "₹8.4L" },
                { name: "Amit Singh",   orders: 4, maxDays: 8,  value: "₹11.2L" },
                { name: "Sneha Patel",  orders: 2, maxDays: 5,  value: "₹6.1L" },
                { name: "Karan Mehta",  orders: 3, maxDays: 11, value: "₹9.8L" },
                { name: "Deepika Rao",  orders: 2, maxDays: 4,  value: "₹5.3L" },
                { name: "Vijay Kumar",  orders: 1, maxDays: 2,  value: "₹2.1L" },
                { name: "Anita Joshi",  orders: 2, maxDays: 6,  value: "₹4.9L" },
              ].map((u, i) => (
                <div key={i} style={{
                  background: `${agingColor(u.maxDays)}08`,
                  border: `1px solid ${agingColor(u.maxDays)}22`,
                  borderLeft: `3px solid ${agingColor(u.maxDays)}`,
                  borderRadius: 8, padding: "8px 11px",
                  display: "flex", alignItems: "center", gap: 10,
                }}>
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
              (agingFilterSite   === "All" || r.siteCode  === agingFilterSite) &&
              (agingFilterType   === "All" || r.type      === agingFilterType) &&
              (agingFilterStatus === "All" || r.status    === agingFilterStatus) &&
              (agingFilterUser   === "All" || r.pendingAt === agingFilterUser) &&
              (!agingSearch || r.orderNo.toLowerCase().includes(agingSearch.toLowerCase()) || r.vendor.toLowerCase().includes(agingSearch.toLowerCase()))
            );

            const hTh = { padding: "10px 14px", color: "#64748b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", background: "#f8fafc", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", textAlign: "left" };
            const hTd = { padding: "11px 14px", fontSize: 12, color: "#374151", borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap" };

            return (
              <div style={{ ...card, padding: 0, overflow: "hidden" }}>
                {/* Header + filters */}
                <div style={{ padding: isMobile ? "10px 12px" : "12px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: isMobile ? "flex-start" : "center", flexDirection: isMobile ? "column" : "row", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                  <div>
                    <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>Aging Detail — All Pending Orders</div>
                    <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 1 }}>Full list with status and aging · {filtered.length} orders</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", width: isMobile ? "100%" : "auto" }}>
                    <div style={{ position: "relative" }}>
                      <svg style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                      <input value={agingSearch} onChange={e => setAgingSearch(e.target.value)} placeholder="Search order / vendor…"
                        style={{ paddingLeft: 26, paddingRight: 10, paddingTop: 6, paddingBottom: 6, border: "1px solid #e2e8f0", borderRadius: 7, fontSize: 12, color: "#374151", outline: "none", width: isMobile ? "100%" : 190, background: "#fff" }} />
                    </div>
                    <Sel value={agingFilterSite} onChange={e => setAgingFilterSite(e.target.value)}>
                      <option value="All">All Sites</option>
                      {["SA-01","SB-02","SG-03","SD-04"].map(s => <option key={s} value={s}>{s}</option>)}
                    </Sel>
                    <Sel value={agingFilterType} onChange={e => setAgingFilterType(e.target.value)}>
                      <option value="All">All Types</option>
                      <option value="PO">Purchase Order</option>
                      <option value="WO">Work Order</option>
                    </Sel>
                    <Sel value={agingFilterStatus} onChange={e => setAgingFilterStatus(e.target.value)}>
                      <option value="All">All Status</option>
                      {["In Review","Pending Issue","Amend Pending"].map(s => <option key={s} value={s}>{s}</option>)}
                    </Sel>
                    <Sel value={agingFilterUser} onChange={e => setAgingFilterUser(e.target.value)}>
                      <option value="All">Pending At</option>
                      {[...new Set(agingData.map(r => r.pendingAt))].map(n => <option key={n} value={n}>{n}</option>)}
                    </Sel>
                  </div>
                </div>

                {/* Table */}
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr style={{ background: "#f8fafc" }}>
                        {["ORDER NO","ORDER TYPE","SITE CODE","VENDOR","VALUE","STATUS","PENDING AT","SINCE","AGING"].map((h, hi, arr) => (
                          <th key={h} style={{
                            padding: "10px 14px", color: "#64748b", fontSize: 10, fontWeight: 700,
                            letterSpacing: "0.07em", textAlign: "left", whiteSpace: "nowrap",
                            borderBottom: "2px solid #e2e8f0",
                            borderRight: hi < arr.length - 1 ? "1px solid #e2e8f0" : "none",
                          }}>{h}</th>
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
                                onMouseLeave={e => { e.currentTarget.style.background = "#fff"; }}
                              >
                                {/* ORDER NO */}
                                <td style={{ ...tdDiv, minWidth: 150 }}>
                                  <span onClick={() => setSelectedOrder(row)} style={{ color: "#0ea5e9", fontWeight: 600, fontSize: 12.5, cursor: "pointer", fontFamily: "'Inter', monospace" }}>
                                    {row.orderNo}
                                  </span>
                                </td>
                                {/* ORDER TYPE */}
                                <td style={{ ...tdDiv, minWidth: 130, color: "#1e293b", fontWeight: 400 }}>{row.type === "PO" ? "Purchase Order" : "Work Order"}</td>
                                {/* SITE CODE */}
                                <td style={{ ...tdDiv, minWidth: 90, color: "#475569", fontWeight: 500 }}>{row.siteCode}</td>
                                {/* VENDOR */}
                                <td style={{ ...tdDiv, color: "#1e293b", fontWeight: 500 }}>{row.vendor}</td>
                                {/* VALUE */}
                                <td style={{ ...tdDiv, color: "#16a34a", fontWeight: 700, fontSize: 12.5 }}>{row.value}</td>
                                {/* STATUS */}
                                <td style={{ ...tdDiv, minWidth: 120 }}>
                                  <span style={{ background: sc.bg, color: sc.col, border: `1px solid ${sc.col}30`, borderRadius: 5, padding: "3px 10px", fontSize: 11, fontWeight: 600, whiteSpace: "nowrap" }}>{row.status}</span>
                                </td>
                                {/* PENDING AT */}
                                <td style={{ ...tdDiv, color: "#1e293b", fontWeight: 500 }}>{row.pendingAt}</td>
                                {/* SINCE */}
                                <td style={{ ...tdDiv, color: "#64748b", fontWeight: 400 }}>{row.since}</td>
                                {/* AGING */}
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

          {/* ── ORDER SIDE PANEL ── */}
          {selectedOrder && (
            <>
              <div onClick={() => setSelectedOrder(null)} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.28)", zIndex: 998 }} />
              <div style={{ position: "fixed", right: 0, top: 0, height: "100vh", width: 380, background: "#fff", zIndex: 999, boxShadow: "-6px 0 32px rgba(15,23,42,0.13)", display: "flex", flexDirection: "column" }}>
                {/* Panel header */}
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
                {/* Panel body */}
                <div style={{ flex: 1, overflowY: "auto", padding: "16px 20px" }}>
                  {[
                    ["Vendor",       selectedOrder.vendor],
                    ["Value",        selectedOrder.value],
                    ["Site",         `${selectedOrder.site}`],
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

      {false && (() => {
        const totalAll = userOrderData.reduce((s, x) => s + x.total, 0);
        const totalVal = userOrderData.reduce((s, x) => s + x.value, 0);
        const hTh = { padding: "10px 16px", color: "#64748b", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.07em", background: "#f8fafc", borderBottom: "2px solid #e2e8f0", textAlign: "left", whiteSpace: "nowrap" };
        const hTd = { padding: "13px 16px", fontSize: 13, borderBottom: "1px solid #f1f5f9" };
        return (
          <div style={{ ...card, padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px", borderBottom: "1px solid #e2e8f0" }}>
              <div style={{ color: "#0f172a", fontSize: 13, fontWeight: 700 }}>User Performance Stats</div>
              <div style={{ color: "#94a3b8", fontSize: 11, marginTop: 2 }}>Hover on user name to see site-wise breakdown</div>
            </div>
            <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
              <colgroup>
                <col style={{ width: "30%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "20%" }} />
                <col style={{ width: "20%" }} />
              </colgroup>
              <thead>
                <tr>
                  {["User","Total PO","Total WO","Total Orders","Order Value"].map(h => (
                    <th key={h} style={hTh}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {userOrderData.map((u, i) => {
                  return (
                    <tr key={i} style={{ background: "#fff" }}
                      onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                      onMouseLeave={e => e.currentTarget.style.background = "#fff"}
                    >
                      {/* USER NAME with hover tooltip */}
                      <td style={{ ...hTd }}>
                        <div style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: 9 }}
                          onMouseEnter={e => { const t = e.currentTarget.querySelector(".site-tip"); if(t) t.style.display = "block"; }}
                          onMouseLeave={e => { const t = e.currentTarget.querySelector(".site-tip"); if(t) t.style.display = "none"; }}
                        >
                          <div style={{ width: 30, height: 30, borderRadius: "50%", background: `hsl(${i * 45 + 175}, 55%, 35%)`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0 }}>
                            {u.name.charAt(0)}
                          </div>
                          <span style={{ color: "#0f172a", fontWeight: 600, fontSize: 13, cursor: "default", borderBottom: "1px dashed #94a3b8" }}>{u.name}</span>
                          {/* Site breakdown tooltip */}
                          <div className="site-tip" style={{ display: "none", position: "absolute", top: "calc(100% + 8px)", left: 0, zIndex: 300, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, boxShadow: "0 8px 24px rgba(15,23,42,0.13)", minWidth: 220, overflow: "hidden" }}>
                            <div style={{ background: "#0f172a", padding: "7px 12px" }}>
                              <span style={{ color: "#fff", fontWeight: 700, fontSize: 12 }}>{u.name}</span>
                            </div>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                              <thead>
                                <tr style={{ background: "#f8fafc" }}>
                                  <th style={{ color: "#64748b", fontSize: 10, fontWeight: 700, padding: "5px 12px", textAlign: "left" }}>Site Code</th>
                                  <th style={{ color: "#64748b", fontSize: 10, fontWeight: 700, padding: "5px 10px", textAlign: "center" }}>PO</th>
                                  <th style={{ color: "#64748b", fontSize: 10, fontWeight: 700, padding: "5px 12px", textAlign: "center" }}>WO</th>
                                </tr>
                              </thead>
                              <tbody>
                                {u.sites.map((s, si) => (
                                  <tr key={si} style={{ borderTop: "1px solid #f1f5f9" }}>
                                    <td style={{ color: "#374151", fontSize: 11, fontWeight: 600, padding: "6px 12px" }}>{s.code}</td>
                                    <td style={{ color: CP, fontSize: 11, fontWeight: 700, padding: "6px 10px", textAlign: "center" }}>{s.po}</td>
                                    <td style={{ color: CW, fontSize: 11, fontWeight: 700, padding: "6px 12px", textAlign: "center" }}>{s.wo}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </td>
                      <td style={{ ...hTd, color: CP, fontWeight: 700 }}>{u.po}</td>
                      <td style={{ ...hTd, color: CW, fontWeight: 700 }}>{u.wo}</td>
                      <td style={{ ...hTd, color: "#0f172a", fontWeight: 800, fontSize: 14 }}>{u.total}</td>
                      <td style={{ ...hTd, color: "#16a34a", fontWeight: 700 }}>₹{u.value}L</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background: "#f8fafc", borderTop: "2px solid #e2e8f0" }}>
                  <td style={{ ...hTd, color: "#0f172a", fontWeight: 700 }}>Total</td>
                  <td style={{ ...hTd, color: CP, fontWeight: 800 }}>{userOrderData.reduce((s,x)=>s+x.po,0)}</td>
                  <td style={{ ...hTd, color: CW, fontWeight: 800 }}>{userOrderData.reduce((s,x)=>s+x.wo,0)}</td>
                  <td style={{ ...hTd, color: "#0f172a", fontWeight: 900, fontSize: 14 }}>{totalAll}</td>
                  <td style={{ ...hTd, color: "#16a34a", fontWeight: 800 }}>₹{totalVal}L</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      })()}

      </>)}

    </div>
  );
});

export default GlobalDashboard;
