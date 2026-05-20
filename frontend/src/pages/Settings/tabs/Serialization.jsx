import { useState, useEffect } from "react";
import { KeyRound, Loader2, Save, Plus, X, Trash2 } from "lucide-react";
import { API } from "../constants";
import { inp, lbl } from "../utils";

export default function Serialization({ isGlobalAdmin, showToast }) {
  const [serSites,         setSerSites]         = useState([]);
  const [serConfigs,       setSerConfigs]       = useState([]);
  const [orderSerConfigs,  setOrderSerConfigs]  = useState([]);
  const [serLoading,       setSerLoading]       = useState(false);
  const [serSaving,        setSerSaving]        = useState(null);
  const [serTab,           setSerTab]           = useState("intake");
  const [orderKindTab,     setOrderKindTab]     = useState("Supply");
  const [showAddSiteSer,   setShowAddSiteSer]   = useState(false);
  const [addSiteForm,      setAddSiteForm]      = useState({ siteId: "", financialYear: "", currentNumber: 0 });

  useEffect(() => {
    if (isGlobalAdmin) fetchSerData();
  }, []);

  const fetchSerData = async () => {
    setSerLoading(true);
    try {
      const [sitesRes, configsRes, orderRes] = await Promise.all([
        fetch(`${API}/api/procurement/sites`).then(r => r.json()),
        fetch(`${API}/api/intakes/serialization`).then(r => r.json()),
        fetch(`${API}/api/orders/serialization`).then(r => r.json()),
      ]);
      setSerSites(sitesRes.sites || []);
      setSerConfigs(configsRes.configs || []);
      setOrderSerConfigs(orderRes.configs || []);
    } catch { showToast("Failed to load data", "error"); }
    setSerLoading(false);
  };

  const getSerConfig = (siteId) =>
    serConfigs.find(c => c.site_id === siteId && c.doc_type === "intake") || {};

  const updateSerConfig = (siteId, field, value) => {
    setSerConfigs(prev => {
      const exists = prev.find(c => c.site_id === siteId && c.doc_type === "intake");
      if (exists) return prev.map(c => c.site_id === siteId && c.doc_type === "intake" ? { ...c, [field]: value } : c);
      return [...prev, { doc_type: "intake", site_id: siteId, [field]: value }];
    });
  };

  const saveSerConfig = async (site) => {
    const cfg = getSerConfig(site.id);
    if (!cfg.prefix) return showToast("Prefix is required", "error");
    setSerSaving(site.id);
    try {
      const res = await fetch(`${API}/api/intakes/serialization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          doc_type: "intake", site_id: site.id,
          site_name: site.siteName, prefix: cfg.prefix,
          pad_length: parseInt(cfg.pad_length) || 2,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast(`Saved for ${site.siteName}`);
      fetchSerData();
    } catch { showToast("Failed to save", "error"); }
    setSerSaving(null);
  };

  const currentFY = () => {
    const d = new Date(); const m = d.getMonth(); const y = d.getFullYear();
    const fy = m >= 3 ? y : y - 1;
    return `${fy}-${String(fy + 1).slice(-2)}`;
  };

  const orderTilesForKind = (kind) => orderSerConfigs.filter(c => c.order_kind === kind);

  const updateOrderTile = (id, field, value) => {
    setOrderSerConfigs(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const saveOrderTile = async (cfg) => {
    setSerSaving("order_" + cfg.id);
    try {
      const res = await fetch(`${API}/api/orders/serialization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: cfg.site_id,
          financial_year: cfg.financial_year,
          current_number: parseInt(cfg.current_number) || 0,
          order_kind: cfg.order_kind,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast("Sequence saved");
      fetchSerData();
    } catch { showToast("Failed to save sequence", "error"); }
    setSerSaving(null);
  };

  const deleteOrderTile = async (id) => {
    if (!confirm("Remove this serialization entry?")) return;
    try {
      const res = await fetch(`${API}/api/orders/serialization/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      showToast("Removed");
      fetchSerData();
    } catch { showToast("Failed to remove", "error"); }
  };

  const addOrderTile = async () => {
    if (!addSiteForm.siteId) return showToast("Site is required", "error");
    if (!addSiteForm.financialYear) return showToast("Financial year is required", "error");
    const dup = orderSerConfigs.find(c =>
      c.site_id === addSiteForm.siteId &&
      c.financial_year === addSiteForm.financialYear &&
      c.order_kind === orderKindTab);
    if (dup) return showToast("This site is already configured for that FY", "error");
    setSerSaving("add_new");
    try {
      const res = await fetch(`${API}/api/orders/serialization`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          site_id: addSiteForm.siteId,
          financial_year: addSiteForm.financialYear,
          current_number: parseInt(addSiteForm.currentNumber) || 0,
          order_kind: orderKindTab,
        }),
      });
      if (!res.ok) throw new Error("Save failed");
      showToast("Site added");
      setShowAddSiteSer(false);
      setAddSiteForm({ siteId: "", financialYear: "", currentNumber: 0 });
      fetchSerData();
    } catch { showToast("Failed to add", "error"); }
    setSerSaving(null);
  };

  return (
    <div className="bg-white rounded-none shadow-sm border border-slate-100 p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6 relative">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-sm bg-indigo-50 flex items-center justify-center shrink-0">
            <KeyRound size={17} className="text-indigo-600" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-800">Serialization</h2>
            <p className="text-xs text-slate-500">Configure document number series per site</p>
          </div>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-sm">
          <button onClick={() => setSerTab("intake")}
            className={`px-6 py-2 rounded-sm text-sm font-bold transition-all ${serTab === "intake" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}>
            Intake
          </button>
          <button onClick={() => setSerTab("order")}
            className={`px-6 py-2 rounded-sm text-sm font-bold transition-all ${serTab === "order" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700 hover:bg-slate-200/50"}`}>
            Orders
          </button>
        </div>
      </div>

      {serLoading ? (
        <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-indigo-400" /></div>
      ) : serSites.length === 0 ? (
        <p className="text-sm text-slate-400 text-center py-8">No sites registered. Add sites first from Procurement Setup → Site List.</p>
      ) : (
        <div className="space-y-3">
          {serTab === "intake" ? (
            <>
              <div className="grid grid-cols-12 gap-3 px-4 pb-1">
                <div className="col-span-3"><span className={lbl}>Site</span></div>
                <div className="col-span-2"><span className={lbl}>Doc Type</span></div>
                <div className="col-span-3"><span className={lbl}>Prefix / Format</span></div>
                <div className="col-span-2"><span className={lbl}>Pad Length</span></div>
                <div className="col-span-2"><span className={lbl}>Preview</span></div>
              </div>
              {serSites.map(site => {
                const cfg    = getSerConfig(site.id);
                const next   = (cfg.current_number || 0) + 1;
                const padded = String(next).padStart(parseInt(cfg.pad_length) || 2, "0");
                const preview = cfg.prefix ? `${cfg.prefix}${padded}` : "—";
                return (
                  <div key={site.id} className="grid grid-cols-12 gap-3 items-center p-4 rounded-sm border border-slate-100 bg-slate-50 hover:border-indigo-200 transition-all">
                    <div className="col-span-3">
                      <p className="text-sm font-semibold text-slate-700">{site.siteName}</p>
                      {site.siteCode && <p className="text-xs text-slate-400 font-mono">{site.siteCode}</p>}
                    </div>
                    <div className="col-span-2">
                      <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">Intake</span>
                    </div>
                    <div className="col-span-3">
                      <input className={inp} value={cfg.prefix || ""}
                        onChange={e => updateSerConfig(site.id, "prefix", e.target.value)}
                        placeholder={`e.g. PR/${site.siteCode || "SITE"}/`} />
                    </div>
                    <div className="col-span-2">
                      <select className={inp} value={cfg.pad_length || 2}
                        onChange={e => updateSerConfig(site.id, "pad_length", parseInt(e.target.value))}>
                        {[1,2,3,4].map(n => <option key={n} value={n}>{n} digit{n>1?"s":""} ({"0".repeat(n-1)}1)</option>)}
                      </select>
                    </div>
                    <div className="col-span-2 flex items-center justify-between gap-2">
                      <span className="text-xs font-mono font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-sm border border-indigo-100 truncate">{preview}</span>
                      <button onClick={() => saveSerConfig(site)} disabled={serSaving === site.id}
                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                        {serSaving === site.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                        Save
                      </button>
                    </div>
                  </div>
                );
              })}
            </>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex bg-slate-100 p-1 rounded-sm">
                  <button onClick={() => setOrderKindTab("Supply")}
                    className={`px-5 py-1.5 rounded-sm text-xs font-bold transition-all ${orderKindTab === "Supply" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    Supply Order (Purchase Order)
                  </button>
                  <button onClick={() => setOrderKindTab("SITC")}
                    className={`px-5 py-1.5 rounded-sm text-xs font-bold transition-all ${orderKindTab === "SITC" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
                    SITC Order (Work Order)
                  </button>
                </div>
                <button onClick={() => { setAddSiteForm({ siteId: "", financialYear: currentFY(), currentNumber: 0 }); setShowAddSiteSer(true); }}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 transition-all">
                  <Plus size={14} /> Add Site
                </button>
              </div>

              {orderTilesForKind(orderKindTab).length === 0 ? (
                <div className="text-sm text-slate-400 text-center py-12 rounded-sm border-2 border-dashed border-slate-200">
                  No sites configured for {orderKindTab === "Supply" ? "Supply Orders" : "SITC Orders"}. Click <span className="font-semibold text-indigo-600">+ Add Site</span> to start.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                  {orderTilesForKind(orderKindTab).map(cfg => {
                    const site = serSites.find(s => s.id === cfg.site_id) || {};
                    const next = parseInt(cfg.current_number) || 0;
                    const typeCode = cfg.order_kind === "Supply" ? "PO" : "WO";
                    const preview = `CMP/${site.siteCode || "S"}/${typeCode}/${cfg.financial_year}/${next + 1}`;
                    return (
                      <div key={cfg.id} className="p-4 rounded-sm border border-slate-100 bg-slate-50 hover:border-indigo-200 transition-all">
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-slate-800 truncate">{site.siteName || "—"}</p>
                            <div className="flex items-center gap-2 mt-1">
                              {site.siteCode && <span className="text-[10px] font-mono font-semibold text-slate-500 bg-white px-1.5 py-0.5 rounded border border-slate-200">{site.siteCode}</span>}
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">{cfg.financial_year}</span>
                            </div>
                          </div>
                          <button onClick={() => deleteOrderTile(cfg.id)} className="text-slate-400 hover:text-red-500 transition-all" title="Remove">
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="mb-2">
                          <span className={lbl}>Last Issued Serial</span>
                          <input type="number" min="0" className={inp}
                            value={cfg.current_number !== undefined ? cfg.current_number : 0}
                            onChange={e => updateOrderTile(cfg.id, "current_number", e.target.value)} />
                          <p className="text-[10px] text-slate-400 mt-1">Next document = this value + 1 (so 30 → next is 31)</p>
                        </div>
                        <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-200">
                          <span className="text-[10px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 truncate" title={preview}>{preview}</span>
                          <button onClick={() => saveOrderTile(cfg)} disabled={serSaving === "order_" + cfg.id}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-sm bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-50 transition-all">
                            {serSaving === "order_" + cfg.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            Save
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Add Site Modal */}
      {showAddSiteSer && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div onClick={() => setShowAddSiteSer(false)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-md bg-white rounded-none shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800">Add Site</h3>
                <p className="text-xs text-slate-500 mt-0.5">{orderKindTab === "Supply" ? "Supply Order (PO)" : "SITC Order (WO)"} sequence</p>
              </div>
              <button onClick={() => setShowAddSiteSer(false)} className="w-8 h-8 rounded-sm flex items-center justify-center hover:bg-slate-100 text-slate-400">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <span className={lbl}>Site *</span>
                <select className={inp} value={addSiteForm.siteId}
                  onChange={e => setAddSiteForm(f => ({ ...f, siteId: e.target.value }))}>
                  <option value="">Select site…</option>
                  {serSites.map(s => (
                    <option key={s.id} value={s.id}>{s.siteName}{s.siteCode ? ` (${s.siteCode})` : ""}</option>
                  ))}
                </select>
              </div>
              <div>
                <span className={lbl}>Financial Year *</span>
                <input className={inp} placeholder="e.g. 2026-27"
                  value={addSiteForm.financialYear}
                  onChange={e => setAddSiteForm(f => ({ ...f, financialYear: e.target.value }))} />
              </div>
              <div>
                <span className={lbl}>Last Issued Serial</span>
                <input type="number" min="0" className={inp}
                  value={addSiteForm.currentNumber}
                  onChange={e => setAddSiteForm(f => ({ ...f, currentNumber: e.target.value }))} />
                <p className="text-[10px] text-slate-400 mt-1">Next order = this + 1. Set 0 for fresh site (first order will be 1).</p>
              </div>
            </div>
            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button onClick={() => setShowAddSiteSer(false)}
                className="px-4 py-2 rounded-sm text-sm font-semibold text-slate-600 hover:bg-slate-100">Cancel</button>
              <button onClick={addOrderTile} disabled={serSaving === "add_new"}
                className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                {serSaving === "add_new" ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
