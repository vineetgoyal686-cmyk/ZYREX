import React, { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, Send, Loader2, FileText, Clock, CheckCircle2,
  XCircle, User, Calendar, Tag, Building, Package, Printer,
  ThumbsUp, ThumbsDown, AlertCircle, Hash,
} from "lucide-react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

const TABS = ["Intake Detail", "Approval", "Log", "PDF View"];

const STATUS_BADGE = {
  draft:      { label: "Draft",       cls: "bg-yellow-50 text-yellow-700 border border-yellow-200"   },
  submitted:  { label: "Submitted",   cls: "bg-blue-50 text-blue-700 border border-blue-200"          },
  in_review:  { label: "In Review",   cls: "bg-purple-50 text-purple-700 border border-purple-200"    },
  approved:   { label: "Approved",    cls: "bg-green-50 text-green-700 border border-green-200"       },
  working:    { label: "Working",     cls: "bg-orange-50 text-orange-700 border border-orange-200"    },
  rejected:   { label: "Rejected",    cls: "bg-red-50 text-red-700 border border-red-200"             },
  closed:     { label: "Closed",      cls: "bg-slate-100 text-slate-600 border border-slate-200"      },
};

const fmt = (d) =>
  d ? new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—";

const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

const LOG_ACTION_STYLE = {
  created:   { icon: <CheckCircle2 size={14} />, cls: "text-green-600 bg-green-50 border-green-200"  },
  submitted: { icon: <Send size={14} />,          cls: "text-blue-600 bg-blue-50 border-blue-200"     },
  approved:  { icon: <ThumbsUp size={14} />,      cls: "text-green-600 bg-green-50 border-green-200"  },
  rejected:  { icon: <ThumbsDown size={14} />,    cls: "text-red-600 bg-red-50 border-red-200"        },
  updated:   { icon: <Clock size={14} />,          cls: "text-slate-600 bg-slate-100 border-slate-200" },
};

export default function ViewIntake({ intake: initialIntake, onBack, currentUser = {}, onSubmitDraft }) {
  const [intake, setIntake]         = useState(initialIntake);
  const [activeTab, setActiveTab]   = useState("Intake Detail");
  const [logs, setLogs]             = useState([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [approvalFlow, setApprovalFlow] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const printRef                    = useRef(null);

  /* Re-fetch intake to get latest data */
  useEffect(() => {
    fetch(`${API}/api/intakes/${initialIntake.id}`)
      .then(r => r.json())
      .then(d => { if (d.intake) setIntake(d.intake); })
      .catch(() => {});
  }, [initialIntake.id]);

  /* Fetch logs when Log tab is active */
  useEffect(() => {
    if (activeTab !== "Log") return;
    setLogsLoading(true);
    fetch(`${API}/api/audit-logs/intake/${intake.id}`)
      .then(r => r.json())
      .then(d => setLogs(d.logs || []))
      .catch(() => setLogs([]))
      .finally(() => setLogsLoading(false));
  }, [activeTab, intake.id]);

  /* Fetch approval flow */
  useEffect(() => {
    fetch(`${API}/api/intakes/approval-flows`)
      .then(r => r.json())
      .then(d => {
        const flow = (d.flows || []).find(f => f.module === "intake");
        setApprovalFlow(flow || null);
      })
      .catch(() => {});
  }, []);

  const handleSubmitDraft = async () => {
    setSubmitting(true);
    try {
      await onSubmitDraft(intake.id);
      const r = await fetch(`${API}/api/intakes/${intake.id}`);
      const d = await r.json();
      if (d.intake) setIntake(d.intake);
    } finally {
      setSubmitting(false);
    }
  };

  const badge = STATUS_BADGE[intake.status] || STATUS_BADGE.draft;

  /* ── INTAKE DETAIL TAB ── */
  const IntakeDetailTab = () => (
    <div className="space-y-5">
      {/* Info grid */}
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Intake Information</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {[
            { label: "Intake Number",  value: intake.intake_number, mono: true, indigo: true },
            { label: "Status",         value: badge.label, badge: badge.cls },
            { label: "Priority",       value: intake.priority || "Low" },
            { label: "Intake Type",    value: intake.intake_type || "Supply" },
            { label: "Site / Project", value: intake.site_name },
            { label: "Company",        value: intake.company },
            { label: "Category",       value: intake.category },
            { label: "Requested By",   value: intake.requisition_by },
            { label: "Prepared By",    value: intake.prepared_by },
            { label: "Required By",    value: fmt(intake.available_by) },
            { label: "Created At",     value: fmt(intake.created_at) },
          ].map(({ label, value, mono, indigo, badge: bc }) => (
            <div key={label}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">{label}</p>
              {bc ? (
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${bc}`}>{value || "—"}</span>
              ) : (
                <p className={`text-sm font-semibold ${indigo ? "text-indigo-600 font-mono" : "text-slate-700"}`}>{value || "—"}</p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Items table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
            Items &nbsp;<span className="text-indigo-600 font-mono">{intake.intake_items?.length || 0}</span>
          </p>
        </div>
        {(!intake.intake_items?.length) ? (
          <div className="py-12 text-center text-sm text-slate-400">No items found</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["#", "Product Name", "Specification", "Make", "Brand", "Unit", "BOQ Qty", "Existing Qty", "Raised Qty", "Remarks"].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-[11px] font-bold uppercase tracking-wider text-slate-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {intake.intake_items.map((item, i) => (
                  <tr key={item.id || i} className="hover:bg-slate-50/60 transition-colors">
                    <td className="px-4 py-3 text-xs text-slate-400">{i + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800 max-w-48">{item.product_name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-60">
                      {item.rows?.map((r, ri) => (
                        <div key={ri} className="text-xs text-slate-500">{r.description || ""}</div>
                      ))}
                      {!item.rows?.length && "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.make || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {item.rows?.map((r, ri) => <div key={ri}>{r.brand || ""}</div>)}
                      {!item.rows?.length && "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{item.unit || "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-right">{item.boq_qty ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 text-right">{item.existing_qty ?? "—"}</td>
                    <td className="px-4 py-3 text-xs font-bold text-indigo-600 text-right">{item.raised_qty ?? "—"}</td>
                    <td className="px-4 py-3 text-xs text-slate-500 max-w-40">{item.remarks || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  /* ── APPROVAL TAB ── */
  const ApprovalTab = () => (
    <div className="max-w-xl space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Approval Configuration</p>
        {!approvalFlow ? (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <AlertCircle size={16} />
            No approval flow configured for intake. Go to Settings → Approval Flow.
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                <User size={16} className="text-indigo-600" />
              </div>
              <div>
                <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Approver</p>
                <p className="text-sm font-bold text-slate-800">{approvalFlow.approver_name || "—"}</p>
                {approvalFlow.approver_email && (
                  <p className="text-xs text-slate-400">{approvalFlow.approver_email}</p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-4">Current Status</p>
        <div className="flex items-center gap-3">
          <span className={`text-sm font-bold px-3 py-1.5 rounded-full border ${badge.cls}`}>{badge.label}</span>
          {intake.status === "draft" && (
            <p className="text-xs text-slate-400">Submit this intake to send it for approval.</p>
          )}
          {intake.status === "submitted" && (
            <p className="text-xs text-slate-400">Awaiting review by procurement team.</p>
          )}
          {intake.status === "approved" && (
            <p className="text-xs text-slate-400">This intake has been approved.</p>
          )}
          {intake.status === "rejected" && (
            <p className="text-xs text-slate-400">This intake was rejected.</p>
          )}
        </div>
        {intake.reject_reason && (
          <div className="mt-3 p-3 bg-red-50 rounded-lg border border-red-100">
            <p className="text-xs font-bold text-red-600 mb-0.5">Rejection Reason</p>
            <p className="text-sm text-red-700">{intake.reject_reason}</p>
          </div>
        )}
      </div>
    </div>
  );

  /* ── LOG TAB ── */
  const LogTab = () => (
    <div className="max-w-2xl">
      {logsLoading ? (
        <div className="flex items-center gap-2 py-12 justify-center text-slate-400">
          <Loader2 size={18} className="animate-spin" /> Loading logs…
        </div>
      ) : !logs.length ? (
        <div className="py-12 text-center text-sm text-slate-400">No activity logs found.</div>
      ) : (
        <div className="relative pl-6">
          <div className="absolute left-2.5 top-0 bottom-0 w-px bg-slate-200" />
          <div className="space-y-4">
            {logs.map((log, i) => {
              const style = LOG_ACTION_STYLE[log.action?.toLowerCase()] || LOG_ACTION_STYLE.updated;
              return (
                <div key={log.id || i} className="relative">
                  <div className={`absolute -left-4 w-5 h-5 rounded-full border flex items-center justify-center ${style.cls}`}>
                    {style.icon}
                  </div>
                  <div className="bg-white rounded-xl border border-slate-200 p-4 ml-2">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-bold text-slate-800 capitalize">{log.action || "—"}</p>
                        {log.entity_name && <p className="text-xs text-slate-500 mt-0.5">{log.entity_name}</p>}
                        {log.user_name && (
                          <p className="text-xs text-slate-400 mt-1">
                            By <span className="font-semibold text-slate-600">{log.user_name}</span>
                          </p>
                        )}
                        {log.changes && (
                          <pre className="mt-2 text-[11px] text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 overflow-x-auto max-w-lg whitespace-pre-wrap">
                            {typeof log.changes === "string" ? log.changes : JSON.stringify(log.changes, null, 2)}
                          </pre>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 whitespace-nowrap shrink-0">{fmtDateTime(log.created_at)}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  /* ── PDF VIEW TAB ── */
  const PdfViewTab = () => (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={() => window.print()}
          className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-all">
          <Printer size={14} /> Print / Save PDF
        </button>
      </div>
      <div ref={printRef} className="bg-white rounded-xl border border-slate-200 p-10 max-w-4xl mx-auto print:shadow-none print:rounded-none print:border-none">
        {/* Header */}
        <div className="flex items-start justify-between mb-8 pb-6 border-b-2 border-slate-800">
          <div>
            <h1 className="text-2xl font-black text-slate-900">MATERIAL REQUISITION</h1>
            <p className="text-sm text-slate-500 mt-1">Purchase Intake Request</p>
          </div>
          <div className="text-right">
            {intake.intake_number && (
              <p className="text-lg font-mono font-black text-indigo-600">{intake.intake_number}</p>
            )}
            <p className="text-xs text-slate-500 mt-0.5">Date: {fmt(intake.created_at)}</p>
          </div>
        </div>

        {/* Info grid */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {[
            ["Intake Name",    intake.name],
            ["Site / Project", intake.site_name],
            ["Company",        intake.company],
            ["Requested By",   intake.requisition_by],
            ["Prepared By",    intake.prepared_by],
            ["Priority",       intake.priority],
            ["Required By",    fmt(intake.available_by)],
            ["Category",       intake.category],
            ["Intake Type",    intake.intake_type],
            ["Status",         badge.label],
          ].map(([label, val]) => (
            <div key={label} className="flex gap-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider w-32 shrink-0">{label}:</span>
              <span className="text-xs text-slate-800 font-semibold">{val || "—"}</span>
            </div>
          ))}
        </div>

        {/* Items */}
        <table className="w-full text-sm border border-slate-300 rounded-lg overflow-hidden mb-8">
          <thead>
            <tr className="bg-slate-800 text-white">
              {["#", "Product Name", "Make", "Unit", "Existing Qty", "Raised Qty", "Remarks"].map(h => (
                <th key={h} className="px-3 py-2.5 text-left text-xs font-bold uppercase tracking-wider">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(intake.intake_items || []).map((item, i) => (
              <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50"}>
                <td className="px-3 py-2.5 text-xs border-b border-slate-200">{i + 1}</td>
                <td className="px-3 py-2.5 text-xs font-semibold border-b border-slate-200">{item.product_name || "—"}</td>
                <td className="px-3 py-2.5 text-xs border-b border-slate-200">{item.make || "—"}</td>
                <td className="px-3 py-2.5 text-xs border-b border-slate-200">{item.unit || "—"}</td>
                <td className="px-3 py-2.5 text-xs text-right border-b border-slate-200">{item.existing_qty ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs font-bold text-indigo-700 text-right border-b border-slate-200">{item.raised_qty ?? "—"}</td>
                <td className="px-3 py-2.5 text-xs border-b border-slate-200">{item.remarks || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Signature */}
        <div className="grid grid-cols-3 gap-8 pt-6 border-t border-slate-200">
          {["Prepared By", "Approved By", "Authorized By"].map(label => (
            <div key={label} className="text-center">
              <div className="h-12 border-b border-slate-300 mb-2" />
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="w-full min-h-screen bg-slate-100 flex flex-col">
      {/* Sticky Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center justify-between px-5 py-3">
          {/* Left: back + title */}
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack}
              className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 font-medium px-2.5 py-1.5 rounded-lg hover:bg-slate-100 transition-all shrink-0">
              <ArrowLeft size={14} /> Back
            </button>
            <div className="w-px h-5 bg-slate-200 shrink-0" />
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider leading-none">Intake</p>
              <h1 className="text-[15px] font-bold text-slate-800 truncate leading-tight">{intake.name || "—"}</h1>
            </div>
            {intake.intake_number && (
              <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-lg shrink-0 hidden sm:inline">
                {intake.intake_number}
              </span>
            )}
            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0 hidden sm:inline ${badge.cls}`}>
              {badge.label}
            </span>
          </div>

          {/* Right: actions */}
          <div className="flex items-center gap-2 shrink-0">
            {intake.status === "draft" && (
              <button onClick={handleSubmitDraft} disabled={submitting}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded bg-green-600 text-white text-sm font-semibold hover:bg-green-700 disabled:opacity-50 transition-all">
                {submitting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                Submit
              </button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="px-5 flex gap-5 overflow-x-auto no-scrollbar">
          {TABS.map(t => (
            <button key={t} onClick={() => setActiveTab(t)}
              className={`pb-3 pt-1 text-sm font-semibold border-b-2 whitespace-nowrap transition-all
                ${activeTab === t
                  ? "text-indigo-600 border-indigo-600"
                  : "text-slate-500 border-transparent hover:text-slate-700"}`}>
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 p-5 overflow-auto">
        {activeTab === "Intake Detail" && <IntakeDetailTab />}
        {activeTab === "Approval"      && <ApprovalTab />}
        {activeTab === "Log"           && <LogTab />}
        {activeTab === "PDF View"      && <PdfViewTab />}
      </div>
    </div>
  );
}
