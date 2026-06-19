import { useState, useEffect } from "react";
import {
  ClipboardList, Plus, Loader2, Eye, Pencil, Trash2,
  X, Save, ChevronUp, ChevronDown,
} from "lucide-react";
import api from "../../../utils/api";
import { inp, lbl } from "../utils";

/* ── Flowchart renderer ─────────────────────────────────────────── */
function Flowchart({ steps }) {
  if (!steps?.length) {
    return (
      <div className="text-center text-slate-400 text-sm py-10">
        No steps to display
      </div>
    );
  }

  const arrowLine = (
    <div className="flex flex-col items-center">
      <div className="w-px h-5 bg-slate-400" />
      <div
        className="w-0 h-0"
        style={{
          borderLeft: "5px solid transparent",
          borderRight: "5px solid transparent",
          borderTop: "7px solid #94a3b8",
        }}
      />
    </div>
  );

  return (
    <div className="flex flex-col items-center gap-0 py-4 select-none">
      {/* Start node */}
      <div className="bg-emerald-500 text-white text-xs font-bold px-6 py-1.5 rounded-full shadow">
        START
      </div>

      {steps.map((step, idx) => (
        <div key={step.id || idx} className="flex flex-col items-center">
          {arrowLine}
          <div className="bg-white border-2 border-indigo-400 rounded px-4 py-2.5 w-72 shadow-sm">
            <div className="flex items-start gap-2">
              <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full w-5 h-5 flex items-center justify-center shrink-0 mt-0.5">
                {idx + 1}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-slate-800 leading-snug">
                  {step.title || `Step ${idx + 1}`}
                </p>
                {step.description && (
                  <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                    {step.description}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}

      {arrowLine}

      {/* End node */}
      <div className="bg-rose-500 text-white text-xs font-bold px-6 py-1.5 rounded-full shadow">
        END
      </div>
    </div>
  );
}

/* ── Main SOP tab ───────────────────────────────────────────────── */
export default function SOP({ showToast }) {
  const [sops,    setSops]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm,     setShowForm]     = useState(false);
  const [formReadOnly, setFormReadOnly] = useState(false);
  const [editingSop,   setEditingSop]   = useState(null);
  const [saving,       setSaving]       = useState(false);
  const [viewSop,      setViewSop]      = useState(null);

  /* form fields */
  const [name,        setName]        = useState("");
  const [description, setDescription] = useState("");
  const [steps,       setSteps]       = useState([]);

  const fetchSops = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/api/sop");
      setSops(data.sops || []);
    } catch { /* silent */ } finally { setLoading(false); }
  };

  useEffect(() => { fetchSops(); }, []);

  const blankStep = () => ({
    id:          crypto.randomUUID(),
    title:       "",
    description: "",
  });

  const openCreate = () => {
    setEditingSop(null);
    setFormReadOnly(false);
    setName("");
    setDescription("");
    setSteps([blankStep()]);
    setShowForm(true);
  };

  const openEdit = (sop, readOnly = false) => {
    setEditingSop(sop);
    setFormReadOnly(readOnly);
    setName(sop.name || "");
    setDescription(sop.description || "");
    setSteps(sop.steps?.length ? sop.steps : [blankStep()]);
    setShowForm(true);
  };

  const closeForm = () => { setShowForm(false); setFormReadOnly(false); };

  const addStep    = ()          => setSteps(prev => [...prev, blankStep()]);
  const removeStep = (id)        => setSteps(prev => prev.filter(s => s.id !== id));
  const updateStep = (id, k, v)  => setSteps(prev => prev.map(s => s.id === id ? { ...s, [k]: v } : s));

  const moveStep = (idx, dir) => {
    setSteps(prev => {
      const arr    = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= arr.length) return arr;
      [arr[idx], arr[target]] = [arr[target], arr[idx]];
      return arr;
    });
  };

  const saveSop = async () => {
    if (formReadOnly) return;
    if (!name.trim()) { showToast("SOP name is required", "error"); return; }
    const validSteps = steps.filter(s => s.title.trim());
    if (!validSteps.length) { showToast("At least one step with a title is required", "error"); return; }

    setSaving(true);
    try {
      const payload = {
        name:        name.trim(),
        description: description.trim() || null,
        steps:       validSteps,
      };
      if (editingSop) {
        await api.put(`/api/sop/${editingSop.id}`, payload);
        showToast("SOP updated");
      } else {
        await api.post("/api/sop", payload);
        showToast("SOP created");
      }
      closeForm();
      fetchSops();
    } catch (err) {
      showToast(err.response?.data?.error || "Save failed", "error");
    } finally { setSaving(false); }
  };

  const deleteSop = async (id) => {
    if (!confirm("Delete this SOP? This action cannot be undone.")) return;
    try {
      await api.delete(`/api/sop/${id}`);
      showToast("SOP deleted");
      fetchSops();
    } catch (err) {
      showToast(err.response?.data?.error || "Delete failed", "error");
    }
  };

  const actBtn = "inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 hover:border-slate-300 transition shrink-0";

  /* ── Render ── */
  return (
    <div className="space-y-6">

      {/* View flowchart modal */}
      {viewSop && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
              <div className="min-w-0">
                <h3 className="font-bold text-slate-900 truncate">{viewSop.name}</h3>
                {viewSop.description && (
                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{viewSop.description}</p>
                )}
                <p className="text-[11px] text-slate-400 mt-1">{viewSop.steps?.length || 0} step{viewSop.steps?.length !== 1 ? "s" : ""}</p>
              </div>
              <button
                onClick={() => setViewSop(null)}
                className="text-slate-400 hover:text-slate-700 transition-colors shrink-0 ml-4">
                <X size={18} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 bg-slate-50 px-4">
              <Flowchart steps={viewSop.steps || []} />
            </div>
          </div>
        </div>
      )}

      {/* SOP table list */}
      {!showForm && (
        <div className="bg-white rounded-none shadow-sm border border-slate-100 p-6">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 mb-4 border-b border-slate-200">
            <h2 className="font-sans text-lg sm:text-xl font-bold text-slate-800 tracking-normal antialiased">
              Standard Operating Procedures
            </h2>
            <button type="button" onClick={openCreate}
              className="inline-flex items-center justify-center gap-2 rounded-sm bg-[#3b4df2] px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-[#2f40d4] active:bg-[#2838c4]">
              <Plus size={18} strokeWidth={2.5} className="shrink-0" />
              New SOP
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
              <Loader2 className="animate-spin mr-2" size={16} /> Loading...
            </div>
          ) : sops.length === 0 ? (
            <div className="border-2 border-dashed border-slate-200 rounded-sm p-10 text-center">
              <ClipboardList size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-500">No SOPs yet</p>
              <p className="text-[12px] text-slate-400 mt-1">
                Create step-by-step Standard Operating Procedures with auto-generated flowcharts.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-sm border border-slate-300">
              <table className="w-full min-w-[600px] text-sm border-collapse border border-slate-300">
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-center w-12">S.No</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-left">SOP Name</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-left">Description</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-center whitespace-nowrap">Steps</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-left whitespace-nowrap">Created By</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-left whitespace-nowrap">Date</th>
                    <th className="border border-slate-300 px-3 py-2.5 font-semibold text-slate-700 text-right whitespace-nowrap">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sops.map((sop, idx) => (
                    <tr key={sop.id} className="bg-white hover:bg-slate-50/80">
                      <td className="border border-slate-300 px-3 py-2 align-middle text-center font-semibold text-slate-600 tabular-nums">
                        {idx + 1}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 align-middle font-semibold text-slate-800">
                        {sop.name}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 align-middle max-w-xs">
                        <p className="text-[12px] text-slate-600 line-clamp-1">{sop.description || "—"}</p>
                      </td>
                      <td className="border border-slate-300 px-3 py-2 align-middle text-center font-semibold text-slate-800 tabular-nums">
                        {sop.steps?.length || 0}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 align-middle text-[12px] text-slate-700">
                        {sop.created_by_name || "—"}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 align-middle text-[12px] text-slate-600 whitespace-nowrap tabular-nums">
                        {sop.created_at ? new Date(sop.created_at).toLocaleDateString() : "—"}
                      </td>
                      <td className="border border-slate-300 px-3 py-2 align-middle">
                        <div className="flex items-center justify-end gap-1.5">
                          <button type="button" title="View Flowchart" onClick={() => setViewSop(sop)} className={actBtn}>
                            <Eye size={15} strokeWidth={2} />
                          </button>
                          <button type="button" title="Edit" onClick={() => openEdit(sop)} className={actBtn}>
                            <Pencil size={15} strokeWidth={2} />
                          </button>
                          <button type="button" title="Delete" onClick={() => deleteSop(sop.id)}
                            className={`${actBtn} hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/80`}>
                            <Trash2 size={15} strokeWidth={2} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Create / Edit inline form */}
      {showForm && (
        <div className="bg-white rounded-none shadow-sm border border-slate-100">

          {/* Sticky header */}
          <div className="sticky top-0 z-10 px-6 py-3.5 border-b border-slate-200 flex items-center justify-between gap-4 bg-white">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-8 w-8 bg-indigo-100 rounded-sm flex items-center justify-center text-indigo-600 shrink-0">
                <ClipboardList size={16} />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-slate-900 leading-tight">
                  {formReadOnly ? "View SOP" : editingSop ? "Edit SOP" : "New SOP"}
                </h3>
                <p className="text-[11px] text-slate-400 leading-tight">
                  {formReadOnly ? "Read-only preview" : "Define a standard operating procedure with ordered steps"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {formReadOnly ? (
                <button onClick={closeForm}
                  className="h-8 px-4 rounded-sm border border-slate-300 text-slate-600 text-[12px] font-semibold hover:bg-slate-50 transition-colors">
                  Close
                </button>
              ) : (
                <>
                  <button onClick={closeForm}
                    className="h-8 px-4 rounded-sm border border-slate-300 text-slate-600 text-[12px] font-semibold hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={saveSop} disabled={saving}
                    className="h-8 px-4 rounded-sm bg-indigo-600 text-white text-[12px] font-semibold hover:bg-indigo-700 transition-colors flex items-center gap-1.5 disabled:opacity-60">
                    {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {editingSop ? "Update" : "Create"}
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="p-6 space-y-6">

            {/* Name + Description */}
            <div className="flex flex-wrap gap-4">
              <div className="w-72 shrink-0">
                <label className={lbl}>SOP Name *</label>
                <input
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className={inp}
                  disabled={formReadOnly}
                  placeholder="e.g. Vendor Onboarding Process"
                />
              </div>
              <div className="flex-1 min-w-[200px]">
                <label className={lbl}>Description (optional)</label>
                <input
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className={inp}
                  disabled={formReadOnly}
                  placeholder="Brief description of this SOP..."
                />
              </div>
            </div>

            {/* Steps builder + live flowchart — side by side on wide screens */}
            <div className="flex flex-col xl:flex-row gap-6">

              {/* Steps builder */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-800">Flow Steps</h4>
                  {!formReadOnly && (
                    <button type="button" onClick={addStep}
                      className="inline-flex items-center gap-1 text-[12px] font-semibold text-indigo-600 hover:text-indigo-800 transition-colors">
                      <Plus size={14} /> Add Step
                    </button>
                  )}
                </div>

                <div className="space-y-2">
                  {steps.map((step, idx) => (
                    <div key={step.id}
                      className="flex items-start gap-2 bg-slate-50 border border-slate-200 rounded-sm p-3">
                      {/* Step number badge */}
                      <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-200 rounded-full w-6 h-6 flex items-center justify-center shrink-0 mt-1">
                        {idx + 1}
                      </span>

                      {/* Inputs */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <input
                          value={step.title}
                          onChange={e => updateStep(step.id, "title", e.target.value)}
                          disabled={formReadOnly}
                          placeholder={`Step ${idx + 1} title...`}
                          className="w-full h-8 rounded-sm border border-slate-300 bg-white px-2.5 text-[13px] text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 outline-none disabled:bg-slate-50 disabled:text-slate-500"
                        />
                        <input
                          value={step.description}
                          onChange={e => updateStep(step.id, "description", e.target.value)}
                          disabled={formReadOnly}
                          placeholder="Description (optional)..."
                          className="w-full h-8 rounded-sm border border-slate-300 bg-white px-2.5 text-[12px] text-slate-700 placeholder:text-slate-400 focus:border-indigo-400 focus:ring-1 focus:ring-indigo-300 outline-none disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </div>

                      {/* Up / Down / Remove */}
                      {!formReadOnly && (
                        <div className="flex flex-col items-center gap-0 shrink-0 mt-0.5">
                          <button type="button" onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                            className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 disabled:opacity-25 transition-colors">
                            <ChevronUp size={14} />
                          </button>
                          <button type="button" onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                            className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-slate-700 disabled:opacity-25 transition-colors">
                            <ChevronDown size={14} />
                          </button>
                          <button type="button" onClick={() => removeStep(step.id)}
                            className="h-6 w-6 flex items-center justify-center rounded text-slate-400 hover:text-rose-600 transition-colors mt-0.5">
                            <X size={13} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}

                  {steps.length === 0 && !formReadOnly && (
                    <div className="border-2 border-dashed border-slate-200 rounded-sm py-8 text-center">
                      <p className="text-xs text-slate-400">Click "Add Step" to start building your SOP flow.</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Live flowchart preview */}
              <div className="xl:w-80 shrink-0">
                <h4 className="text-sm font-bold text-slate-800 mb-3">Flowchart Preview</h4>
                <div className="border border-slate-200 rounded-sm bg-slate-50 overflow-y-auto max-h-[480px]">
                  <Flowchart steps={steps.filter(s => s.title.trim())} />
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
