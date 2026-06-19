import { useState, useEffect, useRef } from "react";
import { KeyRound, Loader2, Save, Plus, X, Trash2, Pencil, LayoutGrid, Table2, History, Search, ChevronDown, Check, Filter } from "lucide-react";
import api from "../../../utils/api";
import ProjectSelect from "../../../components/ProjectSelect";
import { FullViewSiteModal } from "../../Create/FullMasterModals";

const lbl = "block text-xs font-semibold text-slate-500 mb-1 uppercase tracking-wide";
const inp = "w-full border border-slate-200 rounded-sm px-3 py-2 text-sm text-slate-700 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400";

export default function Serialization({ isGlobalAdmin, showToast }) {
  const [serSites,        setSerSites]        = useState([]);
  const [serConfigs,      setSerConfigs]      = useState([]);
  const [orderSerConfigs, setOrderSerConfigs] = useState([]);
  const [serLoading,      setSerLoading]      = useState(false);
  const [serSaving,       setSerSaving]       = useState(false);
  const [serTab,          setSerTab]          = useState("intake");
  const [orderKindTab,    setOrderKindTab]    = useState("Supply");
  const [viewMode,        setViewMode]        = useState("card");
  const [modal,           setModal]           = useState(null);
  const [viewSite,        setViewSite]        = useState(null);
  const [orderSearch,      setOrderSearch]      = useState("");
  const [intakeSearch,     setIntakeSearch]     = useState("");
  const [selectedCodes,        setSelectedCodes]        = useState([]);
  const [codeFilterOpen,       setCodeFilterOpen]       = useState(false);
  const [codeSearch,           setCodeSearch]           = useState("");
  const [orderSelectedCodes,   setOrderSelectedCodes]   = useState([]);
  const [orderCodeFilterOpen,  setOrderCodeFilterOpen]  = useState(false);
  const [orderCodeSearch,      setOrderCodeSearch]      = useState("");
  const codeFilterRef      = useRef(null);
  const orderCodeFilterRef = useRef(null);

  useEffect(() => {
    const h = e => { if (codeFilterRef.current && !codeFilterRef.current.contains(e.target)) setCodeFilterOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    const h = e => { if (orderCodeFilterRef.current && !orderCodeFilterRef.current.contains(e.target)) setOrderCodeFilterOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const [logPanel,        setLogPanel]        = useState(null);  // { cfg, site }
  const [logEntries,      setLogEntries]      = useState([]);
  const [logLoading,      setLogLoading]      = useState(false);

  useEffect(() => { if (isGlobalAdmin) fetchSerData(); }, []);

  const fetchSerData = async () => {
    setSerLoading(true);
    try {
      const [sitesRes, configsRes, orderRes] = await Promise.all([
        api.get("/api/projects").then(r => r.data),
        api.get("/api/intakes/serialization").then(r => r.data),
        api.get("/api/orders/serialization").then(r => r.data),
      ]);
      setSerSites(sitesRes.projects || []);
      setSerConfigs(configsRes.configs || []);
      setOrderSerConfigs(orderRes.configs || []);
    } catch { showToast("Failed to load data", "error"); }
    setSerLoading(false);
  };

  const getSite = (siteId) => serSites.find(s => String(s.id) === String(siteId)) || {};

  const intakeCards = serConfigs
    .filter(c => c.doc_type === "intake")
    .filter(c => {
      const site = getSite(c.site_id);
      if (intakeSearch.trim()) {
        const q = intakeSearch.toLowerCase();
        if (!(site.projectName || "").toLowerCase().includes(q) && !(site.projectCode || "").toLowerCase().includes(q)) return false;
      }
      if (selectedCodes.length > 0 && !selectedCodes.includes(site.projectCode || "")) return false;
      return true;
    });
  const configuredIds = new Set(intakeCards.map(c => String(c.site_id)));
  const unconfiguredSites = serSites.filter(s => !configuredIds.has(String(s.id)));

  const getPreview = (prefix, padLen, curNum) => {
    if (!prefix) return "—";
    const next = (parseInt(curNum) || 0) + 1;
    return `${prefix}${String(next).padStart(parseInt(padLen) || 2, "0")}`;
  };

  const currentFY = () => {
    const d = new Date(), m = d.getMonth(), y = d.getFullYear();
    const fy = m >= 3 ? y : y - 1;
    return `${fy}-${String(fy + 1).slice(-2)}`;
  };

  // ── Intake modal ─────────────────────────────────────────────
  const openAddIntake = () =>
    setModal({ mode: "add", type: "intake", data: { siteId: "", prefix: "", padLength: 2, currentNumber: 0 } });

  const openEditIntake = (cfg) =>
    setModal({ mode: "edit", type: "intake", cfgId: cfg.id,
      data: { siteId: cfg.site_id, prefix: cfg.prefix || "", padLength: cfg.pad_length || 2, currentNumber: cfg.current_number || 0 } });

  const onSiteSelect = (siteId) => {
    const site = serSites.find(s => String(s.id) === String(siteId));
    const autoPrefix = site?.projectCode ? `PR/${site.projectCode}/` : "";
    setModal(m => ({ ...m, data: { ...m.data, siteId, prefix: autoPrefix } }));
  };

  const saveIntake = async () => {
    const { siteId, prefix, padLength, currentNumber } = modal.data;
    if (!siteId) return showToast("Site is required", "error");
    if (!prefix) return showToast("Prefix is required", "error");
    const site = getSite(siteId);
    const me = JSON.parse(localStorage.getItem("bms_user") || "{}");
    setSerSaving(true);
    try {
      await api.post("/api/intakes/serialization", {
        doc_type: "intake", site_id: siteId, site_name: site.projectName,
        prefix, pad_length: parseInt(padLength) || 2,
        current_number: parseInt(currentNumber) || 0,
        ...(modal.mode === "add"
          ? { createdById: me.id, createdByName: me.name }
          : { updatedById: me.id, updatedByName: me.name }),
      });
      showToast(modal.mode === "add" ? "Site added" : "Saved");
      setModal(null);
      fetchSerData();
    } catch { showToast("Failed to save", "error"); }
    setSerSaving(false);
  };

  const deleteIntake = async (cfg) => {
    if (!confirm(`Remove serialization for ${getSite(cfg.site_id).projectName || cfg.site_id}?`)) return;
    const me = JSON.parse(localStorage.getItem("bms_user") || "{}");
    try {
      await api.delete(`/api/intakes/serialization/${cfg.id}`, {
        data: { site_name: getSite(cfg.site_id).projectName, deletedById: me.id, deletedByName: me.name },
      });
      showToast("Removed");
      fetchSerData();
    } catch { showToast("Failed to remove", "error"); }
  };

  // ── Orders modal ──────────────────────────────────────────────
  const orderCards = orderSerConfigs
    .filter(c => c.order_kind === orderKindTab)
    .filter(c => {
      const site = getSite(c.site_id);
      if (orderSearch.trim()) {
        const q = orderSearch.toLowerCase();
        if (!(site.projectName || "").toLowerCase().includes(q) && !(site.projectCode || "").toLowerCase().includes(q)) return false;
      }
      if (orderSelectedCodes.length > 0 && !orderSelectedCodes.includes(site.projectCode || "")) return false;
      return true;
    });

  const openAddOrder = () =>
    setModal({ mode: "add", type: "order", data: { siteId: "", financialYear: currentFY(), currentNumber: 0 } });

  const openEditOrder = (cfg) =>
    setModal({ mode: "edit", type: "order", cfgId: cfg.id,
      data: { siteId: cfg.site_id, financialYear: cfg.financial_year, currentNumber: cfg.current_number || 0 } });

  const saveOrder = async () => {
    const { siteId, financialYear, currentNumber } = modal.data;
    if (!siteId) return showToast("Site is required", "error");
    if (!financialYear) return showToast("Financial year is required", "error");
    if (modal.mode === "add") {
      const dup = orderSerConfigs.find(c =>
        String(c.site_id) === String(siteId) && c.financial_year === financialYear && c.order_kind === orderKindTab);
      if (dup) return showToast("Already configured for this site/FY", "error");
    }
    const site = getSite(siteId);
    const me = JSON.parse(localStorage.getItem("bms_user") || "{}");
    setSerSaving(true);
    try {
      await api.post("/api/orders/serialization", {
        site_id: siteId, financial_year: financialYear,
        current_number: parseInt(currentNumber) || 0, order_kind: orderKindTab,
        site_name: site.projectName,
        ...(modal.mode === "add"
          ? { createdById: me.id, createdByName: me.name }
          : { updatedById: me.id, updatedByName: me.name }),
      });
      showToast(modal.mode === "add" ? "Site added" : "Saved");
      setModal(null);
      fetchSerData();
    } catch { showToast("Failed to save", "error"); }
    setSerSaving(false);
  };

  const deleteOrder = async (cfg) => {
    if (!confirm("Remove this serialization entry?")) return;
    const me = JSON.parse(localStorage.getItem("bms_user") || "{}");
    try {
      await api.delete(`/api/orders/serialization/${cfg.id}`, {
        data: { site_name: getSite(cfg.site_id).projectName, deletedById: me.id, deletedByName: me.name },
      });
      showToast("Removed");
      fetchSerData();
    } catch { showToast("Failed to remove", "error"); }
  };

  const openLog = async (cfg, site) => {
    setLogPanel({ cfg, site });
    setLogEntries([]);
    setLogLoading(true);
    try {
      const endpoint = serTab === "intake"
        ? `/api/intakes/serialization/logs/${cfg.id}`
        : `/api/orders/serialization/logs/${cfg.id}`;
      const { data } = await api.get(endpoint);
      setLogEntries(data.logs || []);
    } catch { showToast("Failed to load log", "error"); }
    setLogLoading(false);
  };

  const handleAdd = () => serTab === "intake" ? openAddIntake() : openAddOrder();
  const handleSave = () => modal?.type === "intake" ? saveIntake() : saveOrder();

  return (
    <>
    <div className="flex flex-col min-h-full">

      {/* ── Sticky Header Row 1: Title + Add button ───── */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm bg-indigo-50 flex items-center justify-center shrink-0">
              <KeyRound size={17} className="text-indigo-600" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-800">Serialization</h2>
              <p className="text-xs text-slate-500">Configure document number series per site</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex bg-slate-100 p-0.5 rounded-sm">
              <button onClick={() => setViewMode("card")} title="Card view"
                className={`p-1.5 rounded-sm transition-all ${viewMode === "card" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                <LayoutGrid size={15} />
              </button>
              <button onClick={() => setViewMode("table")} title="Table view"
                className={`p-1.5 rounded-sm transition-all ${viewMode === "table" ? "bg-white text-indigo-600 shadow-sm" : "text-slate-400 hover:text-slate-600"}`}>
                <Table2 size={15} />
              </button>
            </div>
            {isGlobalAdmin && (
              <button onClick={handleAdd}
                className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 transition-all">
                <Plus size={15} /> Add Site
              </button>
            )}
          </div>
        </div>

        {/* ── Tab Row ─────────────────────────────────── */}
        <div className="px-6 flex items-center gap-1 border-t border-slate-100">
          <button onClick={() => setSerTab("intake")}
            className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-all ${serTab === "intake" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            Intake
          </button>
          <button onClick={() => setSerTab("order")}
            className={`px-5 py-2.5 text-sm font-bold border-b-2 transition-all ${serTab === "order" ? "border-indigo-600 text-indigo-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
            Orders
          </button>
        </div>

        {/* ── Intake toolbar: search + site code filter ── */}
        {serTab === "intake" && (
          <div className="px-6 py-2.5 flex items-center gap-3 border-t border-slate-100 bg-slate-50/50">
            {/* Search */}
            <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-sm px-2.5 py-1.5 w-52">
              <Search size={13} className="text-slate-400 shrink-0" />
              <input type="text" value={intakeSearch} onChange={e => setIntakeSearch(e.target.value)}
                placeholder="Search site..." className="flex-1 text-xs text-slate-700 placeholder-slate-400 outline-none bg-transparent" />
              {intakeSearch && <button onClick={() => setIntakeSearch("")} className="text-slate-400 hover:text-slate-600"><X size={11} /></button>}
            </div>

            {/* Site Code multi-select filter */}
            <div className="relative" ref={codeFilterRef}>
              <button onClick={() => setCodeFilterOpen(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-xs font-semibold transition-all ${selectedCodes.length > 0 ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                <Filter size={11} />
                Site Code
                {selectedCodes.length > 0 && <span className="bg-indigo-600 text-white rounded-full px-1.5 py-0 text-[10px] font-bold">{selectedCodes.length}</span>}
                <ChevronDown size={11} className={`transition-transform ${codeFilterOpen ? "rotate-180" : ""}`} />
              </button>

              {codeFilterOpen && (() => {
                const allCodes = [...new Set(serConfigs.filter(c => c.doc_type === "intake").map(c => getSite(c.site_id).projectCode).filter(Boolean))];
                const filtered = allCodes.filter(code => code.toLowerCase().includes(codeSearch.toLowerCase()));
                return (
                  <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-sm shadow-xl w-56">
                    <div className="p-2 border-b border-slate-100">
                      <input type="text" autoFocus value={codeSearch} onChange={e => setCodeSearch(e.target.value)}
                        placeholder="Search code..." className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-indigo-400 text-slate-700" />
                    </div>
                    <div className="px-2 py-1 text-[10px] text-slate-400 font-semibold border-b border-slate-100">
                      {filtered.length} results found
                    </div>
                    <div className="max-h-44 overflow-y-auto">
                      {filtered.map(code => (
                        <div key={code} onClick={() => setSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])}
                          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
                          <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${selectedCodes.includes(code) ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}>
                            {selectedCodes.includes(code) && <Check size={9} className="text-white" strokeWidth={3} />}
                          </div>
                          <span className="text-xs font-mono font-semibold text-slate-700">{code}</span>
                        </div>
                      ))}
                      {filtered.length === 0 && <div className="text-center py-3 text-xs text-slate-400">No results</div>}
                    </div>
                    {selectedCodes.length > 0 && (
                      <div className="border-t border-slate-100 p-2">
                        <button onClick={() => setSelectedCodes([])} className="w-full text-xs text-red-500 hover:text-red-600 font-semibold py-1">Clear filter</button>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* ── Orders toolbar: search + site code filter + kind pills ── */}
        {serTab === "order" && (
          <div className="px-6 py-2.5 flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-3">
              {/* Search */}
              <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-sm px-2.5 py-1.5 w-52">
                <Search size={13} className="text-slate-400 shrink-0" />
                <input type="text" value={orderSearch} onChange={e => setOrderSearch(e.target.value)}
                  placeholder="Search site..." className="flex-1 text-xs text-slate-700 placeholder-slate-400 outline-none bg-transparent" />
                {orderSearch && <button onClick={() => setOrderSearch("")} className="text-slate-400 hover:text-slate-600"><X size={11} /></button>}
              </div>

              {/* Site Code multi-select filter */}
              <div className="relative" ref={orderCodeFilterRef}>
                <button onClick={() => setOrderCodeFilterOpen(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-xs font-semibold transition-all ${orderSelectedCodes.length > 0 ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-slate-200 text-slate-600 hover:border-slate-400"}`}>
                  <Filter size={11} />
                  Site Code
                  {orderSelectedCodes.length > 0 && <span className="bg-indigo-600 text-white rounded-full px-1.5 py-0 text-[10px] font-bold">{orderSelectedCodes.length}</span>}
                  <ChevronDown size={11} className={`transition-transform ${orderCodeFilterOpen ? "rotate-180" : ""}`} />
                </button>

                {orderCodeFilterOpen && (() => {
                  const allCodes = [...new Set(orderSerConfigs.filter(c => c.order_kind === orderKindTab).map(c => getSite(c.site_id).projectCode).filter(Boolean))];
                  const filtered = allCodes.filter(code => code.toLowerCase().includes(orderCodeSearch.toLowerCase()));
                  return (
                    <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-sm shadow-xl w-56">
                      <div className="p-2 border-b border-slate-100">
                        <input type="text" autoFocus value={orderCodeSearch} onChange={e => setOrderCodeSearch(e.target.value)}
                          placeholder="Search code..." className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded outline-none focus:border-indigo-400 text-slate-700" />
                      </div>
                      <div className="px-2 py-1 text-[10px] text-slate-400 font-semibold border-b border-slate-100">
                        {filtered.length} results found
                      </div>
                      <div className="max-h-44 overflow-y-auto">
                        {filtered.map(code => (
                          <div key={code} onClick={() => setOrderSelectedCodes(prev => prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code])}
                            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-slate-50 transition-colors">
                            <div className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${orderSelectedCodes.includes(code) ? "bg-indigo-600 border-indigo-600" : "border-slate-300"}`}>
                              {orderSelectedCodes.includes(code) && <Check size={9} className="text-white" strokeWidth={3} />}
                            </div>
                            <span className="text-xs font-mono font-semibold text-slate-700">{code}</span>
                          </div>
                        ))}
                        {filtered.length === 0 && <div className="text-center py-3 text-xs text-slate-400">No results</div>}
                      </div>
                      {orderSelectedCodes.length > 0 && (
                        <div className="border-t border-slate-100 p-2">
                          <button onClick={() => setOrderSelectedCodes([])} className="w-full text-xs text-red-500 hover:text-red-600 font-semibold py-1">Clear filter</button>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Supply / SITC pills */}
            <div className="flex items-center gap-1.5">
              {["Supply", "SITC"].map(kind => (
                <button key={kind} onClick={() => { setOrderKindTab(kind); setOrderSelectedCodes([]); }}
                  className={`px-3.5 py-1.5 rounded text-xs font-bold border transition-all ${orderKindTab === kind ? "bg-indigo-600 text-white border-indigo-600" : "bg-white border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700"}`}>
                  {kind === "Supply" ? "Supply Order (PO)" : "SITC Order (WO)"}
                </button>
              ))}
            </div>
          </div>
        )}

      </div>

      {/* ── Content ──────────────────────────────────── */}
      <div className="flex-1 px-6 py-5">
        {serLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 size={22} className="animate-spin text-indigo-400" />
          </div>
        ) : serTab === "intake" ? (
          intakeCards.length === 0 ? (
            <div className="text-center py-16 text-sm text-slate-400 rounded-sm border-2 border-dashed border-slate-200">
              No intake series configured. Click{" "}
              <span className="font-semibold text-indigo-600">+ Add Site</span> to begin.
            </div>
          ) : viewMode === "card" ? (
            /* ── Intake Card View ── */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {intakeCards.map(cfg => {
                const site = getSite(cfg.site_id);
                const preview = getPreview(cfg.prefix, cfg.pad_length, cfg.current_number);
                return (
                  <div key={cfg.id} className="p-4 bg-white rounded-sm border border-slate-200 hover:border-indigo-200 shadow-sm transition-all">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{site.projectName || cfg.site_id}</p>
                        {site.projectCode && <span className="text-[10px] font-mono font-semibold text-slate-400">{site.projectCode}</span>}
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100 shrink-0">Intake</span>
                    </div>
                    <div className="space-y-1.5 mb-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium">Prefix</span>
                        <span className="font-mono font-semibold text-slate-700">{cfg.prefix}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium">Pad Length</span>
                        <span className="font-semibold text-slate-700">{cfg.pad_length || 2} digits</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium">Last Issued</span>
                        <span className="font-semibold text-slate-700">{cfg.current_number || 0}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <span className="text-[11px] font-mono font-bold text-indigo-700 bg-indigo-50 px-2.5 py-1 rounded border border-indigo-100">{preview}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditIntake(cfg)} title="Edit"
                          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteIntake(cfg)} title="Delete"
                          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-all">
                          <Trash2 size={13} />
                        </button>
                        <button onClick={() => openLog(cfg, site)} title="Activity Log"
                          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all">
                          <History size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Intake Table View ── */
            <div className="bg-white rounded-sm border border-slate-300 overflow-hidden">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-3 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wide w-12">S.No</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wide">Site Name</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wide">Code</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wide">Prefix</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wide">Pad</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wide">Last Issued</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wide">Next Preview</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {intakeCards.map((cfg, idx) => {
                    const site = getSite(cfg.site_id);
                    const preview = getPreview(cfg.prefix, cfg.pad_length, cfg.current_number);
                    return (
                      <tr key={cfg.id} className="hover:bg-indigo-50/30 transition-colors">
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-xs text-slate-500 font-mono">{idx + 1}</td>
                        <td className="border border-slate-200 px-3 py-2.5 font-semibold text-slate-800">{site.projectName || cfg.site_id}</td>
                        <td className="border border-slate-200 px-3 py-2.5 font-mono text-xs text-slate-500">{site.projectCode || "—"}</td>
                        <td className="border border-slate-200 px-3 py-2.5 font-mono text-xs font-semibold text-slate-700">{cfg.prefix}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-xs text-slate-600">{cfg.pad_length || 2}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-xs text-slate-600">{cfg.current_number || 0}</td>
                        <td className="border border-slate-200 px-3 py-2.5">
                          <span className="font-mono text-xs font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{preview}</span>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEditIntake(cfg)} title="Edit"
                              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteIntake(cfg)} title="Delete"
                              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-all">
                              <Trash2 size={13} />
                            </button>
                            <button onClick={() => openLog(cfg, site)} title="Activity Log"
                              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all">
                              <History size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <>
          {orderCards.length === 0 ? (
            <div className="text-center py-16 text-sm text-slate-400 rounded-sm border-2 border-dashed border-slate-200">
              No sites configured for {orderKindTab === "Supply" ? "Supply Orders" : "SITC Orders"}. Click&nbsp;
              <span className="font-semibold text-indigo-600">+ Add Site</span> to begin.
            </div>
          ) : viewMode === "card" ? (
            /* ── Orders Card View ── */
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {orderCards.map(cfg => {
                const site = getSite(cfg.site_id);
                const typeCode = cfg.order_kind === "Supply" ? "PO" : "WO";
                const preview = `CMP/${site.projectCode || "S"}/${typeCode}/${cfg.financial_year}/${(parseInt(cfg.current_number) || 0) + 1}`;
                return (
                  <div key={cfg.id} className="p-4 bg-white rounded-sm border border-slate-200 hover:border-indigo-200 shadow-sm transition-all">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{site.projectName || "—"}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {site.projectCode && <span className="text-[10px] font-mono font-semibold text-slate-400">{site.projectCode}</span>}
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">{cfg.financial_year}</span>
                        </div>
                      </div>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-50 text-slate-500 border border-slate-200 shrink-0">
                        {cfg.order_kind === "Supply" ? "PO" : "WO"}
                      </span>
                    </div>
                    <div className="space-y-1.5 mb-3 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-400 font-medium">Last Issued</span>
                        <span className="font-semibold text-slate-700">{cfg.current_number || 0}</span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <span className="text-[11px] font-mono font-bold text-violet-700 bg-violet-50 px-2.5 py-1 rounded border border-violet-100 truncate">{preview}</span>
                      <div className="flex items-center gap-1">
                        <button onClick={() => openEditOrder(cfg)} title="Edit"
                          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => deleteOrder(cfg)} title="Delete"
                          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-all">
                          <Trash2 size={13} />
                        </button>
                        <button onClick={() => openLog(cfg, site)} title="Activity Log"
                          className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all">
                          <History size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Orders Table View ── */
            <div className="bg-white rounded-sm border border-slate-300 overflow-hidden">
              <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
                <thead>
                  <tr className="bg-slate-100">
                    <th className="border border-slate-300 px-3 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wide w-12">S.No</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wide">Site Name</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wide">Code</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wide">Financial Year</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wide">Last Issued</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-left text-xs font-bold text-slate-600 uppercase tracking-wide">Next Preview</th>
                    <th className="border border-slate-300 px-3 py-2.5 text-center text-xs font-bold text-slate-600 uppercase tracking-wide">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {orderCards.map((cfg, idx) => {
                    const site = getSite(cfg.site_id);
                    const typeCode = cfg.order_kind === "Supply" ? "PO" : "WO";
                    const preview = `CMP/${site.projectCode || "S"}/${typeCode}/${cfg.financial_year}/${(parseInt(cfg.current_number) || 0) + 1}`;
                    return (
                      <tr key={cfg.id} className="hover:bg-violet-50/30 transition-colors">
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-xs text-slate-500 font-mono">{idx + 1}</td>
                        <td className="border border-slate-200 px-3 py-2.5 font-semibold text-slate-800">{site.projectName || "—"}</td>
                        <td className="border border-slate-200 px-3 py-2.5 font-mono text-xs text-slate-500">{site.projectCode || "—"}</td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 border border-violet-100">{cfg.financial_year}</span>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5 text-center text-xs text-slate-600">{cfg.current_number || 0}</td>
                        <td className="border border-slate-200 px-3 py-2.5">
                          <span className="font-mono text-xs font-bold text-violet-700 bg-violet-50 px-2 py-0.5 rounded border border-violet-100">{preview}</span>
                        </td>
                        <td className="border border-slate-200 px-3 py-2.5">
                          <div className="flex items-center justify-center gap-1">
                            <button onClick={() => openEditOrder(cfg)} title="Edit"
                              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-amber-300 hover:text-amber-600 hover:bg-amber-50 transition-all">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteOrder(cfg)} title="Delete"
                              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-all">
                              <Trash2 size={13} />
                            </button>
                            <button onClick={() => openLog(cfg, site)} title="Activity Log"
                              className="w-7 h-7 flex items-center justify-center rounded border border-slate-200 text-slate-500 hover:border-slate-400 hover:text-slate-700 hover:bg-slate-50 transition-all">
                              <History size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          </>
        )}
      </div>

      {/* ── Activity Log Side Panel ───────────────────── */}
      {logPanel && (
        <div className="fixed inset-0 z-[100] flex">
          <div onClick={() => setLogPanel(null)} className="flex-1 bg-slate-900/40 backdrop-blur-sm" />
          <div className="w-[360px] bg-white h-full flex flex-col shadow-2xl border-l border-slate-200 animate-in slide-in-from-right duration-200">

            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded bg-slate-100 flex items-center justify-center">
                  <History size={15} className="text-slate-600" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-800">Activity Log</h3>
                  <p className="text-xs text-slate-400 truncate max-w-[200px]">
                    {logPanel.site.projectName || logPanel.cfg.site_id}
                    {logPanel.site.projectCode && ` · ${logPanel.site.projectCode}`}
                  </p>
                </div>
              </div>
              <button onClick={() => setLogPanel(null)}
                className="w-7 h-7 flex items-center justify-center rounded hover:bg-slate-100 text-slate-400">
                <X size={15} />
              </button>
            </div>

            {/* Current config snapshot */}
            <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 shrink-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-2">Current Config</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                {logPanel.cfg.financial_year ? (
                  <>
                    <span className="text-slate-500">Financial Year</span>
                    <span className="font-semibold text-slate-700">{logPanel.cfg.financial_year}</span>
                    <span className="text-slate-500">Order Kind</span>
                    <span className="font-semibold text-slate-700">{logPanel.cfg.order_kind}</span>
                    <span className="text-slate-500">Last Issued</span>
                    <span className="font-semibold text-slate-700">{logPanel.cfg.current_number || 0}</span>
                  </>
                ) : (
                  <>
                    <span className="text-slate-500">Prefix</span>
                    <span className="font-mono font-semibold text-slate-700">{logPanel.cfg.prefix}</span>
                    <span className="text-slate-500">Pad Length</span>
                    <span className="font-semibold text-slate-700">{logPanel.cfg.pad_length || 2} digits</span>
                    <span className="text-slate-500">Last Issued</span>
                    <span className="font-semibold text-slate-700">{logPanel.cfg.current_number || 0}</span>
                  </>
                )}
              </div>
            </div>

            {/* Log entries */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {logLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 size={20} className="animate-spin text-indigo-400" />
                </div>
              ) : logEntries.length === 0 ? (
                <div className="text-center py-12 text-sm text-slate-400">
                  <History size={28} className="mx-auto mb-2 text-slate-300" />
                  No activity recorded yet.
                </div>
              ) : (
                <div className="relative">
                  {/* Timeline line */}
                  <div className="absolute left-3.5 top-0 bottom-0 w-px bg-slate-200" />
                  <div className="space-y-4">
                    {logEntries.map((log, i) => {
                      const isCreate  = log.action === "Created";
                      const isDelete  = log.action === "Deleted";
                      const dotColor  = isCreate ? "bg-emerald-500" : isDelete ? "bg-red-500" : "bg-amber-500";
                      const badgeColor = isCreate
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                        : isDelete
                        ? "bg-red-50 text-red-700 border-red-200"
                        : "bg-amber-50 text-amber-700 border-amber-200";
                      const dt = log.created_at ? new Date(log.created_at) : null;
                      return (
                        <div key={log.id || i} className="flex gap-3 relative">
                          {/* Dot */}
                          <div className={`w-3 h-3 rounded-full shrink-0 mt-1 z-10 border-2 border-white ${dotColor}`} />
                          <div className="flex-1 min-w-0 pb-2">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                                {log.action}
                              </span>
                              <span className="text-[11px] font-semibold text-slate-700 truncate">
                                {log.user_name || "Unknown"}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-400">
                              {dt ? dt.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                              {" · "}
                              {dt ? dt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : ""}
                            </p>
                            {log.changes && Object.keys(log.changes).length > 0 && (
                              <div className="mt-1.5 space-y-1">
                                {Object.entries(log.changes).map(([field, val]) => (
                                  <div key={field} className="text-[10px] bg-slate-50 border border-slate-200 rounded px-2 py-1">
                                    <span className="font-bold text-slate-500 uppercase">{field.replace("_", " ")}</span>
                                    {val?.from !== undefined ? (
                                      <span className="ml-1 text-slate-600">
                                        <span className="line-through text-red-400">{String(val.from)}</span>
                                        {" → "}
                                        <span className="text-emerald-600 font-semibold">{String(val.to)}</span>
                                      </span>
                                    ) : (
                                      <span className="ml-1 text-slate-600 font-semibold">{JSON.stringify(val)}</span>
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
        </div>
      )}

      {/* ── Add / Edit Modal ─────────────────────────── */}
      {modal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div onClick={() => setModal(null)} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg bg-white rounded-none shadow-2xl" style={{ minHeight: 480 }}>

            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-base font-black text-slate-800">
                  {modal.mode === "add" ? "Add Site" : "Edit Site"}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {modal.type === "intake" ? "Intake" : orderKindTab === "Supply" ? "Supply Order (PO)" : "SITC Order (WO)"} serialization
                </p>
              </div>
              <button onClick={() => setModal(null)}
                className="w-8 h-8 flex items-center justify-center rounded-sm hover:bg-slate-100 text-slate-400">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Site */}
              {modal.mode === "edit" ? (
                <div>
                  <span className={lbl}>Site</span>
                  <input className={`${inp} bg-slate-50 text-slate-500`} readOnly
                    value={getSite(modal.data.siteId).projectName || modal.data.siteId} />
                </div>
              ) : (
                <ProjectSelect
                  label="Site"
                  required
                  value={modal.data.siteId}
                  options={modal.type === "intake" ? unconfiguredSites : serSites}
                  placeholder="Select site..."
                  onChange={e => modal.type === "intake"
                    ? onSiteSelect(e.target.value)
                    : setModal(m => ({ ...m, data: { ...m.data, siteId: e.target.value } }))}
                  onView={s => setViewSite(s)}
                />
              )}

              {modal.type === "intake" && (
                <>
                  <div>
                    <span className={lbl}>Prefix / Format *</span>
                    <input className={inp} placeholder="e.g. PR/B-47/"
                      value={modal.data.prefix}
                      onChange={e => setModal(m => ({ ...m, data: { ...m.data, prefix: e.target.value } }))} />
                    <p className="text-[10px] text-slate-400 mt-1">Auto-filled from site code, you can edit it</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <span className={lbl}>Pad Length</span>
                      <select className={inp} value={modal.data.padLength}
                        onChange={e => setModal(m => ({ ...m, data: { ...m.data, padLength: parseInt(e.target.value) } }))}>
                        {[2, 3, 4].map(n => (
                          <option key={n} value={n}>{n} digits ({"0".repeat(n - 1)}1)</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <span className={lbl}>Start From</span>
                      <input type="number" min="0" className={inp}
                        value={modal.data.currentNumber}
                        onChange={e => setModal(m => ({ ...m, data: { ...m.data, currentNumber: e.target.value } }))} />
                      <p className="text-[10px] text-slate-400 mt-1">0 = first will be 1</p>
                    </div>
                  </div>
                  {modal.data.prefix && (
                    <div className="p-3 bg-indigo-50 rounded-sm border border-indigo-100">
                      <span className="text-[10px] text-indigo-500 font-semibold uppercase tracking-wide">Next Number Preview</span>
                      <p className="font-mono font-bold text-indigo-700 text-sm mt-1">
                        {getPreview(modal.data.prefix, modal.data.padLength, modal.data.currentNumber)}
                      </p>
                    </div>
                  )}
                </>
              )}

              {modal.type === "order" && (
                <>
                  <div>
                    <span className={lbl}>Financial Year *</span>
                    <input className={inp} placeholder="e.g. 2026-27"
                      value={modal.data.financialYear}
                      onChange={e => setModal(m => ({ ...m, data: { ...m.data, financialYear: e.target.value } }))} />
                  </div>
                  <div>
                    <span className={lbl}>Last Issued Serial</span>
                    <input type="number" min="0" className={inp}
                      value={modal.data.currentNumber}
                      onChange={e => setModal(m => ({ ...m, data: { ...m.data, currentNumber: e.target.value } }))} />
                    <p className="text-[10px] text-slate-400 mt-1">
                      Next order = this + 1. Set 0 for fresh start.
                    </p>
                  </div>
                </>
              )}
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-end gap-2">
              <button onClick={() => setModal(null)}
                className="px-4 py-2 rounded-sm text-sm font-semibold text-slate-600 hover:bg-slate-100">
                Cancel
              </button>
              <button onClick={handleSave} disabled={serSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-sm bg-indigo-600 text-white text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                {serSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {modal.mode === "add" ? "Add" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    {viewSite && <FullViewSiteModal site={viewSite} onClose={() => setViewSite(null)} />}
    </>
  );
}
