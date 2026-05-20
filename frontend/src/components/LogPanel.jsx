import { useEffect, useState } from "react";
import { X, Clock, Plus, Pencil, Trash2, Loader2 } from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const ACTION_META = {
  created: { icon: Plus,   bg: "bg-emerald-100", iconColor: "text-emerald-600", label: "Created",  dot: "bg-emerald-500" },
  updated: { icon: Pencil, bg: "bg-blue-100",    iconColor: "text-blue-600",    label: "Updated",  dot: "bg-blue-500"    },
  deleted: { icon: Trash2, bg: "bg-red-100",     iconColor: "text-red-600",     label: "Deleted",  dot: "bg-red-500"     },
};

const fmt = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
};

const initials = (name) =>
  (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export default function LogPanel({ entityType, entityId, entityName, onClose }) {
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    if (!entityType || !entityId) return;
    setLoading(true);
    setError(null);
    fetch(`${API}/api/audit-logs/${entityType}/${entityId}`)
      .then((r) => r.json())
      .then((d) => {
        setLogs(d.logs || []);
        setLoading(false);
      })
      .catch(() => {
        setError("Could not load logs");
        setLoading(false);
      });
  }, [entityType, entityId]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/30"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-[360px] flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <Clock size={16} className="text-cyan-500" />
              <span className="text-sm font-bold text-slate-800">Activity Log</span>
            </div>
            {entityName && (
              <p className="mt-0.5 text-xs text-slate-500 truncate max-w-[270px]">{entityName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <Loader2 size={22} className="animate-spin text-cyan-500" />
            </div>
          )}

          {error && (
            <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
          )}

          {!loading && !error && logs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Clock size={32} className="mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-400">No activity yet</p>
              <p className="mt-1 text-xs text-slate-300">Actions will appear here</p>
            </div>
          )}

          {!loading && !error && logs.length > 0 && (
            <div className="relative">
              {/* Vertical line */}
              <div className="absolute left-[19px] top-2 bottom-2 w-px bg-slate-100" />

              <div className="space-y-5">
                {logs.map((log, i) => {
                  const meta = ACTION_META[log.action] || ACTION_META.updated;
                  const Icon = meta.icon;
                  return (
                    <div key={log.id || i} className="relative flex gap-3">
                      {/* Icon circle */}
                      <div className={`relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${meta.bg}`}>
                        <Icon size={15} className={meta.iconColor} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 pt-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${meta.bg} ${meta.iconColor}`}
                          >
                            {meta.label}
                          </span>
                        </div>

                        {/* User */}
                        <div className="mt-2 flex items-center gap-2">
                          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">
                            {initials(log.user_name)}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-slate-700">
                              {log.user_name || "Unknown User"}
                            </p>
                            {log.user_email && (
                              <p className="truncate text-[10px] text-slate-400">{log.user_email}</p>
                            )}
                          </div>
                        </div>

                        {/* Timestamp */}
                        <p className="mt-1.5 text-[11px] text-slate-400">{fmt(log.created_at)}</p>

                        {/* Changes */}
                        {log.changes && Object.keys(log.changes).length > 0 && (
                          <div className="mt-2 rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-[11px] text-slate-600 space-y-1">
                            {Object.entries(log.changes).map(([k, v]) => (
                              <div key={k}>
                                <span className="font-semibold text-slate-500 capitalize">
                                  {k.replace(/_/g, " ")}:
                                </span>{" "}
                                {typeof v === "object" && v !== null && "from" in v ? (
                                  <span>
                                    <span className="line-through text-slate-400">{String(v.from || "—")}</span>
                                    {" → "}
                                    <span className="font-medium text-slate-700">{String(v.to || "—")}</span>
                                  </span>
                                ) : (
                                  <span className="font-medium text-slate-700">{String(v)}</span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
