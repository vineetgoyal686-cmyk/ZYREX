import { useState, useEffect } from "react";
import { BarChart3, Clock, LogIn, UserPlus, X, Shield } from "lucide-react";
import { authFetch } from "../../../utils/authFetch";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const todayStr = () => new Date().toISOString().slice(0, 10);

const fmtDuration = (seconds) => {
  if (!seconds) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const fmtTime = (iso) => iso
  ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })
  : "—";

function ManageAccessModal({ onClose, showToast }) {
  const [allUsers, setAllUsers] = useState([]);
  const [granted, setGranted] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [busy, setBusy] = useState(false);

  const fetchAccessData = async () => {
    const [usersRes, accessRes] = await Promise.all([
      authFetch(`${API}/api/users`),
      authFetch(`${API}/api/screen-time/access`),
    ]);
    const usersJson = usersRes.ok ? await usersRes.json() : { users: [] };
    const accessJson = accessRes.ok ? await accessRes.json() : { users: [] };
    return { allUsers: usersJson.users || [], granted: accessJson.users || [] };
  };

  const loadAccessData = async () => {
    const { allUsers: u, granted: g } = await fetchAccessData();
    setAllUsers(u);
    setGranted(g);
  };

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { allUsers: u, granted: g } = await fetchAccessData();
        if (alive) { setAllUsers(u); setGranted(g); }
      } catch { /* silent */ }
    })();
    return () => { alive = false; };
  }, []);

  const grantedIds = new Set(granted.map(u => u.id));
  const selectableUsers = allUsers.filter(
    u => u.role !== "global_admin" && !grantedIds.has(u.id)
  );

  const handleGrant = async () => {
    if (!selectedUserId) return;
    setBusy(true);
    try {
      const res = await authFetch(`${API}/api/screen-time/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedUserId }),
      });
      if (!res.ok) throw new Error("Failed to grant access.");
      setSelectedUserId("");
      await loadAccessData();
      showToast?.("Access granted", "success");
    } catch (err) {
      showToast?.(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  const handleRevoke = async (userId) => {
    setBusy(true);
    try {
      const res = await authFetch(`${API}/api/screen-time/access/${userId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to revoke access.");
      await loadAccessData();
      showToast?.("Access revoked", "success");
    } catch (err) {
      showToast?.(err.message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-800">Manage Access</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              By default only Global Admin can see this report. Grant a specific user access below.
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X size={18} />
          </button>
        </div>

        <div className="p-5">
          <div className="flex flex-wrap items-center gap-2 mb-5">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="h-9 flex-1 min-w-[200px] rounded border border-slate-300 px-2 text-sm text-slate-700"
            >
              <option value="">Select a user…</option>
              {selectableUsers.map(u => (
                <option key={u.id} value={u.id}>{u.name} ({u.email})</option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selectedUserId || busy}
              onClick={handleGrant}
              className="inline-flex items-center gap-1.5 h-9 px-3 rounded bg-indigo-600 text-white text-xs font-semibold disabled:opacity-40 shrink-0"
            >
              <UserPlus size={14} /> Enable Access
            </button>
          </div>

          <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-2">
            Currently granted ({granted.length})
          </p>
          {granted.length === 0 ? (
            <p className="text-sm text-slate-400">No one has been granted access yet.</p>
          ) : (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="text-left font-semibold px-3 py-2">Name</th>
                    <th className="text-left font-semibold px-3 py-2">Email</th>
                    <th className="w-16"></th>
                  </tr>
                </thead>
                <tbody>
                  {granted.map(u => (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="px-3 py-2 font-semibold text-slate-700">{u.name}</td>
                      <td className="px-3 py-2 text-slate-500">{u.email}</td>
                      <td className="px-3 py-2 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRevoke(u.id)}
                          className="text-xs font-semibold text-red-500 hover:text-red-700 disabled:opacity-40"
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function UserAnalytics({ isAdmin = false, showToast }) {
  const [date, setDate] = useState(todayStr());
  const [range, setRange] = useState("day");
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showAccessModal, setShowAccessModal] = useState(false);

  useEffect(() => {
    let alive = true;

    const fetchReport = async () => {
      const res = await authFetch(`${API}/api/screen-time/report?date=${date}&range=${range}`);
      if (res.status === 403) throw new Error("You don't have access to this report.");
      if (!res.ok) throw new Error("Failed to load report.");
      return res.json();
    };

    const loadInitial = async () => {
      setLoading(true);
      try {
        const json = await fetchReport();
        if (alive) { setData(json); setError(""); }
      } catch (err) {
        if (alive) setError(err.message);
      } finally {
        if (alive) setLoading(false);
      }
    };
    loadInitial();

    // Refresh in the background every 30s so an already-open report picks up
    // new heartbeats without the admin needing to change the date/range.
    const pollId = setInterval(() => {
      fetchReport().then(json => { if (alive) setData(json); }).catch(() => { /* keep showing last good data */ });
    }, 30000);

    return () => { alive = false; clearInterval(pollId); };
  }, [date, range]);

  return (
    <div className="flex flex-col h-full">
      {/* Sticky header — full width, no side gaps, attaches to the Settings sidebar */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <BarChart3 size={19} className="text-indigo-600" />
          <h2 className="text-[19px] font-black text-slate-800 tracking-tight">User Analytics</h2>
        </div>
        {isAdmin && (
          <button
            type="button"
            onClick={() => setShowAccessModal(true)}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50 shrink-0"
          >
            <Shield size={14} /> Manage Access
          </button>
        )}
      </div>

      {/* Filter bar */}
      <div className="px-6 py-2.5 bg-white border-b border-slate-200 flex flex-wrap items-center gap-3">
        <span className="text-[12px] text-slate-400">Login sessions and per-module active screen time, per user.</span>
        <div className="flex items-center gap-3 ml-auto">
          <input
            type="date"
            value={date}
            max={todayStr()}
            onChange={(e) => setDate(e.target.value)}
            className="h-9 rounded border border-slate-300 px-3 text-sm text-slate-700"
          />
          <div className="inline-flex rounded border border-slate-300 overflow-hidden">
            {["day", "week"].map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`h-9 px-4 text-xs font-semibold uppercase tracking-wide ${
                  range === r ? "bg-indigo-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"
                }`}
              >
                {r === "day" ? "This Day" : "Last 7 Days"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showAccessModal && (
        <ManageAccessModal onClose={() => setShowAccessModal(false)} showToast={showToast} />
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto bg-[#f0f2f5] p-5">
        {loading && <p className="text-sm text-slate-400">Loading…</p>}
        {error && <p className="text-sm text-red-500">{error}</p>}

        {!loading && !error && data && data.users.length === 0 && (
          <p className="text-sm text-slate-400">No activity recorded for this range.</p>
        )}

      {!loading && !error && data && data.users.length > 0 && (
        <div className="space-y-4">
          {data.users.map((u) => (
            <div key={u.user_id} className="border border-slate-200 rounded-2xl p-5 bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div>
                  <p className="font-semibold text-slate-800">{u.user_name}</p>
                  <p className="text-xs text-slate-400">{u.user_email}</p>
                </div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-indigo-700">
                  <Clock size={14} />
                  {fmtDuration(u.total_seconds)} active
                </div>
              </div>

              {u.modules.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 mb-3">
                  {u.modules
                    .sort((a, b) => b.duration_seconds - a.duration_seconds)
                    .map((m) => (
                      <div key={m.module_key} className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2">
                        <p className="text-[11px] text-slate-400 truncate">{m.module_key}</p>
                        <p className="text-sm font-semibold text-slate-700">{fmtDuration(m.duration_seconds)}</p>
                      </div>
                    ))}
                </div>
              )}

              <div className="flex flex-wrap gap-4 text-xs text-slate-500 border-t border-slate-100 pt-3">
                <span className="flex items-center gap-1">
                  <LogIn size={12} /> {u.sessions.length} session{u.sessions.length === 1 ? "" : "s"}
                  {u.sessions.length > 0 && (
                    <span className="text-slate-400">
                      {" "}({u.sessions.map(s => `${fmtTime(s.login_at)}–${fmtTime(s.logout_at)}`).join(", ")})
                    </span>
                  )}
                </span>
                <span>Cancel/recall requests raised: {u.requests_raised}</span>
                <span>Actioned: {u.requests_actioned}</span>
                {u.avg_turnaround_seconds != null && (
                  <span>Avg turnaround: {fmtDuration(u.avg_turnaround_seconds)}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
