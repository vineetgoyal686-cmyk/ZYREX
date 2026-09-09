import { useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import { ClipboardList, ArrowUpCircle, ArrowDownCircle, Wallet, ArrowUpRight, ArrowDownRight } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const BASE = `${API}/api/boardroom/finance`;
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("bms_token") || ""}` });

const PAID_COLOR = "#f43f5e";     // rose-500
const RECEIVED_COLOR = "#10b981"; // emerald-500

const fmtINR = (v) => (Number(v) || 0).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const fmtDate = (d) => d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }) : "—";

const StatCard = ({ label, value, icon: Icon, iconBg, iconColor }) => (
  <div className="bg-white rounded-2xl border border-slate-100 p-4 shadow-sm flex items-center justify-between">
    <div>
      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1">{label}</p>
      <p className="text-xl font-bold text-slate-800">{value}</p>
    </div>
    <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
      <Icon size={18} className={iconColor} />
    </div>
  </div>
);

const Panel = ({ title, children, className = "" }) => (
  <div className={`bg-white rounded-2xl border border-slate-100 shadow-sm p-5 ${className}`}>
    <p className="text-sm font-bold text-slate-700 mb-4">{title}</p>
    {children}
  </div>
);

const RankedList = ({ items, emptyLabel }) => {
  const max = Math.max(1, ...items.map(i => i.amount));
  return items.length === 0 ? (
    <p className="text-xs text-slate-400 text-center py-6">{emptyLabel}</p>
  ) : (
    <div className="space-y-3">
      {items.map(item => (
        <div key={item.name}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold text-slate-700 truncate">{item.name}</span>
            <span className="text-xs font-bold text-slate-500 shrink-0 ml-2">{fmtINR(item.amount)}</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div className="h-full rounded-full bg-indigo-400" style={{ width: `${(item.amount / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg px-3 py-2 text-xs">
      <p className="font-semibold text-slate-600 mb-1">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} style={{ color: p.color }} className="font-bold">{p.name}: {fmtINR(p.value)}</p>
      ))}
    </div>
  );
};

export default function BoardroomDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${BASE}/dashboard-stats`, { headers: authHeaders() })
      .then(r => r.json())
      .then(d => { setStats(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-10 text-center text-sm text-slate-400">Loading…</div>;
  }
  if (!stats) {
    return <div className="p-10 text-center text-sm text-slate-400">Couldn't load dashboard data</div>;
  }

  const pieData = [
    { name: "Paid", value: stats.typeSplit.payment, color: PAID_COLOR },
    { name: "Received", value: stats.typeSplit.receipt, color: RECEIVED_COLOR },
  ].filter(d => d.value > 0);

  return (
    <div className="p-4 sm:p-6 space-y-5 bg-[#f8fafc] min-h-screen">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Entries" value={stats.totalEntries} icon={ClipboardList} iconBg="bg-blue-50" iconColor="text-blue-500" />
        <StatCard label="Total Paid" value={fmtINR(stats.totalPaid)} icon={ArrowUpCircle} iconBg="bg-rose-50" iconColor="text-rose-500" />
        <StatCard label="Total Received" value={fmtINR(stats.totalReceived)} icon={ArrowDownCircle} iconBg="bg-emerald-50" iconColor="text-emerald-500" />
        <StatCard label="Net Balance" value={fmtINR(stats.netBalance)} icon={Wallet} iconBg="bg-indigo-50" iconColor="text-indigo-500" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <Panel title="Payments vs Receipts — last 6 months" className="xl:col-span-2">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={stats.monthlyTrend} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} tickFormatter={v => `₹${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "#f8fafc" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="paid" name="Paid" fill={PAID_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="received" name="Received" fill={RECEIVED_COLOR} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Payment vs Receipt Split">
          {pieData.length === 0 ? (
            <div className="h-[260px] flex items-center justify-center text-xs text-slate-400">No data yet</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" innerRadius={55} outerRadius={80} paddingAngle={3}>
                    {pieData.map(d => <Cell key={d.name} fill={d.color} />)}
                  </Pie>
                  <Tooltip formatter={v => fmtINR(v)} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2">
                {pieData.map(d => (
                  <span key={d.name} className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} /> {d.name}
                  </span>
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <Panel title="Top Sites by Amount">
          <RankedList items={stats.topSites} emptyLabel="No site data yet" />
        </Panel>
        <Panel title="Top Companies by Amount">
          <RankedList items={stats.topCompanies} emptyLabel="No company data yet" />
        </Panel>

        <Panel title="Recent Activity">
          {stats.recentEntries.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">No entries yet</p>
          ) : (
            <div className="space-y-3">
              {stats.recentEntries.map(e => (
                <div key={e.id} className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {e.entryType === "payment"
                      ? <ArrowUpRight size={14} className="text-rose-500 shrink-0" />
                      : <ArrowDownRight size={14} className="text-emerald-500 shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{e.partyName || e.companyName || "—"}</p>
                      <p className="text-[10px] text-slate-400">{fmtDate(e.entryDate)}</p>
                    </div>
                  </div>
                  <span className={`text-xs font-bold shrink-0 ${e.entryType === "payment" ? "text-rose-600" : "text-emerald-600"}`}>{fmtINR(e.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
