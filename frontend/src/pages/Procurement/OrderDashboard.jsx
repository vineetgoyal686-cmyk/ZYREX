import React, { useState, useEffect, useMemo } from "react";
import { BarChart3, TrendingUp, CheckCircle2, Clock, XCircle, IndianRupee, FileText, Package } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const STATUS_COLORS = {
  Draft:          { bg: "bg-slate-100",   text: "text-slate-700",   bar: "#94a3b8" },
  Review:         { bg: "bg-sky-50",      text: "text-sky-700",     bar: "#0ea5e9" },
  "Pending Issue":{ bg: "bg-amber-50",    text: "text-amber-700",   bar: "#f59e0b" },
  Issued:         { bg: "bg-emerald-50",  text: "text-emerald-700", bar: "#10b981" },
  Rejected:       { bg: "bg-red-50",      text: "text-red-700",     bar: "#ef4444" },
  Reverted:       { bg: "bg-orange-50",   text: "text-orange-700",  bar: "#f97316" },
  Recalled:       { bg: "bg-purple-50",   text: "text-purple-700",  bar: "#a855f7" },
  Cancelled:      { bg: "bg-slate-200",   text: "text-slate-500",   bar: "#64748b" },
};

const STATUSES = ["Draft","Review","Pending Issue","Issued","Rejected","Reverted","Recalled","Cancelled"];

const formatINR = (n) => {
  const v = Number(n) || 0;
  return v.toLocaleString("en-IN", { maximumFractionDigits: 0 });
};

export default function OrderDashboard({ project }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`${API}/api/orders`);
        const data = await res.json();
        setOrders(data.orders || []);
      } catch {
        setOrders([]);
      }
      setLoading(false);
    })();
  }, []);

  const stats = useMemo(() => {
    const normProject = String(project || "").trim().toLowerCase();
    const isAllProject = !normProject || normProject === "all project";
    const getSiteCode = (o) => o.snapshot?.site?.siteCode || o.sites?.site_code || "";
    const getSiteName = (o) => o.snapshot?.site?.siteName || o.sites?.site_name || "";
    const scopedOrders = orders.filter(o => (
      isAllProject || [getSiteCode(o), getSiteName(o)].some(v => String(v || "").trim().toLowerCase() === normProject)
    ));
    const totalAmt = scopedOrders.reduce((s, o) => s + (Number(o.totals?.grandTotal) || 0), 0);
    const issuedAmt = scopedOrders.filter(o => o.status === "Issued").reduce((s, o) => s + (Number(o.totals?.grandTotal) || 0), 0);
    const pending = scopedOrders.filter(o => ["Review","Pending Issue"].includes(o.status)).length;
    const issued = scopedOrders.filter(o => o.status === "Issued").length;
    const byStatus = STATUSES.map(s => ({ status: s, count: scopedOrders.filter(o => o.status === s).length }));
    const maxCount = Math.max(...byStatus.map(b => b.count), 1);

    const byType = [
      { type: "Supply (PO)", count: scopedOrders.filter(o => o.order_type === "Supply").length },
      { type: "Service (WO)", count: scopedOrders.filter(o => o.order_type !== "Supply").length },
    ];

    const vendorMap = {};
    scopedOrders.forEach(o => {
      const v = o.vendors?.vendor_name || o.snapshot?.vendor?.vendorName || "Unknown";
      vendorMap[v] = (vendorMap[v] || 0) + 1;
    });
    const topVendors = Object.entries(vendorMap)
      .sort((a,b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const now = new Date();
    const monthlyMap = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      monthlyMap[key] = { label: d.toLocaleString("en", { month: "short" }), count: 0, amount: 0 };
    }
    scopedOrders.forEach(o => {
      const d = new Date(o.date_of_creation || o.created_at);
      if (isNaN(d)) return;
      const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
      if (monthlyMap[key]) {
        monthlyMap[key].count += 1;
        monthlyMap[key].amount += Number(o.totals?.grandTotal) || 0;
      }
    });
    const monthly = Object.values(monthlyMap);
    const maxMonthly = Math.max(...monthly.map(m => m.count), 1);

    const recent = [...scopedOrders]
      .sort((a,b) => new Date(b.date_of_creation || b.created_at) - new Date(a.date_of_creation || a.created_at))
      .slice(0, 8);

    return { totalAmt, issuedAmt, pending, issued, byStatus, maxCount, byType, topVendors, monthly, maxMonthly, recent, total: scopedOrders.length };
  }, [orders, project]);

  if (loading) {
    return (
      <div className="p-6 text-center text-slate-400 text-sm animate-pulse">Loading dashboard...</div>
    );
  }

  return (
    <div className="p-3 sm:p-4 lg:p-6 w-full pb-32">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6 bg-white p-4 sm:p-5 rounded-2xl border border-slate-100 shadow-sm">
        <div className="h-12 w-12 bg-sky-50 rounded-xl flex items-center justify-center border border-sky-100">
          <BarChart3 size={24} className="text-sky-600" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-800">Order Dashboard</h1>
          <p className="text-sm text-slate-400">Analytics and insights on PO/WO orders{project ? ` — ${project}` : ""}</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={FileText} iconColor="text-indigo-600" iconBg="bg-indigo-50" label="Total Orders" value={stats.total} />
        <KpiCard icon={CheckCircle2} iconColor="text-emerald-600" iconBg="bg-emerald-50" label="Issued" value={stats.issued} />
        <KpiCard icon={Clock} iconColor="text-amber-600" iconBg="bg-amber-50" label="In Progress" value={stats.pending} sub="Review + Pending" />
        <KpiCard icon={IndianRupee} iconColor="text-slate-700" iconBg="bg-slate-100" label="Issued Value" value={`₹ ${formatINR(stats.issuedAmt)}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Status Breakdown Bar Chart */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Orders by Status</h3>
              <p className="text-xs text-slate-400">Distribution across workflow stages</p>
            </div>
            <BarChart3 size={18} className="text-slate-300" />
          </div>
          <div className="space-y-2.5">
            {stats.byStatus.map(({ status, count }) => {
              const pct = (count / stats.maxCount) * 100;
              const c = STATUS_COLORS[status] || STATUS_COLORS.Draft;
              return (
                <div key={status} className="flex items-center gap-3">
                  <div className="w-28 shrink-0 text-[11px] font-semibold text-slate-600 uppercase tracking-wider">{status}</div>
                  <div className="flex-1 h-6 bg-slate-50 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all"
                      style={{ width: `${pct}%`, background: c.bar }}
                    />
                  </div>
                  <div className="w-10 text-right text-xs font-bold text-slate-700">{count}</div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Type Split */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">By Order Type</h3>
              <p className="text-xs text-slate-400">Supply vs Service</p>
            </div>
            <Package size={18} className="text-slate-300" />
          </div>
          <div className="space-y-4">
            {stats.byType.map((t, i) => {
              const pct = stats.total ? (t.count / stats.total) * 100 : 0;
              const color = i === 0 ? "#6366f1" : "#f97316";
              return (
                <div key={t.type}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-xs font-semibold text-slate-600">{t.type}</span>
                    <span className="text-sm font-bold text-slate-800">{t.count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1">{pct.toFixed(1)}% of total</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monthly Trend & Top Vendors */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Monthly Order Trend</h3>
              <p className="text-xs text-slate-400">Last 6 months</p>
            </div>
            <TrendingUp size={18} className="text-slate-300" />
          </div>
          <div className="flex items-end gap-3 h-40 pt-2">
            {stats.monthly.map((m) => {
              const h = (m.count / stats.maxMonthly) * 100;
              return (
                <div key={m.label} className="flex-1 flex flex-col items-center gap-1.5">
                  <div className="text-[10px] font-bold text-slate-700">{m.count || ""}</div>
                  <div className="w-full flex items-end" style={{ height: "100%" }}>
                    <div
                      className="w-full rounded-t-md transition-all hover:opacity-80"
                      style={{ height: `${h}%`, background: "linear-gradient(180deg, #0ea5e9, #0284c7)", minHeight: m.count ? 4 : 0 }}
                      title={`${m.label}: ${m.count} orders, ₹${formatINR(m.amount)}`}
                    />
                  </div>
                  <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{m.label}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-800">Top Vendors</h3>
              <p className="text-xs text-slate-400">By order count</p>
            </div>
          </div>
          {stats.topVendors.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No data</p>
          ) : (
            <div className="space-y-2.5">
              {stats.topVendors.map((v, i) => (
                <div key={v.name} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px] font-bold text-slate-600 shrink-0">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-slate-700 truncate" title={v.name}>{v.name}</div>
                    <div className="text-[10px] text-slate-400">{v.count} order{v.count !== 1 ? "s" : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Orders */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-800">Recent Orders</h3>
            <p className="text-xs text-slate-400">Latest 8 orders</p>
          </div>
        </div>
        {stats.recent.length === 0 ? (
          <p className="p-6 text-xs text-slate-400 text-center">No orders yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Order No</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Type</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Vendor</th>
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Date</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Amount</th>
                  <th className="px-4 py-2.5 text-center text-[10px] font-bold uppercase tracking-wider text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody>
                {stats.recent.map((o) => {
                  const c = STATUS_COLORS[o.status] || STATUS_COLORS.Draft;
                  const vName = o.vendors?.vendor_name || o.snapshot?.vendor?.vendorName || "—";
                  return (
                    <tr key={o.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                      <td className="px-4 py-2.5 text-xs font-mono font-bold text-slate-700">{o.order_number || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600">{o.order_type || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-600 truncate max-w-[180px]" title={vName}>{vName}</td>
                      <td className="px-4 py-2.5 text-xs text-slate-500">{new Date(o.date_of_creation || o.created_at).toLocaleDateString("en-IN")}</td>
                      <td className="px-4 py-2.5 text-xs font-semibold text-slate-700 text-right">₹ {formatINR(o.totals?.grandTotal)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${c.bg} ${c.text}`}>
                          {o.status || "Draft"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const KpiCard = ({ icon: Icon, iconColor, iconBg, label, value, sub }) => (
  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
    <div className="flex items-start justify-between mb-3">
      <div className={`h-10 w-10 rounded-xl ${iconBg} flex items-center justify-center`}>
        <Icon size={18} className={iconColor} />
      </div>
    </div>
    <div className="text-2xl font-bold text-slate-800 leading-tight">{value}</div>
    <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mt-1">{label}</div>
    {sub && <div className="text-[10px] text-slate-400 mt-0.5">{sub}</div>}
  </div>
);
