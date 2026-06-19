import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Database, Download, Eye, FileText, Loader2, Plus, Search, Upload, X } from "lucide-react";
import * as XLSX from "xlsx";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const LOCAL_ROWS_KEY = "bms_clause_master_manual_rows";
const PER_PAGE = 10;

const TYPE_META = {
  TC: { label: "Terms & Conditions", field: "terms_conditions" },
  PAY: { label: "Payment Terms", field: "payment_terms" },
  GOV: { label: "Government Laws", field: "governing_laws" },
  ANX: { label: "Annexure", field: "annexures" },
};

const emptyForm = {
  clauseType: "TC",
  clauseId: "",
  category: "",
  orderNo: "",
  title: "",
  content: "",
  vendorName: "",
  siteCode: "",
};

const decodeEntities = (value = "") => {
  const el = document.createElement("textarea");
  el.innerHTML = value;
  return el.value;
};

const stripHtml = (value = "") =>
  decodeEntities(String(value)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;|\u00A0/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();

const pointsToText = (points) => {
  if (!points) return "";
  const arr = Array.isArray(points) ? points : [points];
  return arr.map(stripHtml).filter(Boolean).join("\n");
};

const normalizeForMatch = (value) =>
  pointsToText(value).toLowerCase().replace(/\s+/g, " ").trim();

const wordSet = (value) =>
  new Set(normalizeForMatch(value).split(" ").filter(word => word.length > 2));

const wordOverlapScore = (left, right) => {
  const a = wordSet(left);
  const b = wordSet(right);
  if (!a.size || !b.size) return 0;
  let common = 0;
  a.forEach(word => { if (b.has(word)) common += 1; });
  return common / Math.max(a.size, b.size);
};

const findMatchingClause = (clauses, clauseType, points) => {
  const content = normalizeForMatch(points);
  if (!content) return null;

  const candidates = clauses
    .filter(clause => clause.type === clauseType)
    .map(clause => ({ clause, text: normalizeForMatch(clause.points) }))
    .filter(row => row.text);

  return candidates.find(row => row.text === content)?.clause
    || candidates.find(row =>
      content.length > 40 &&
      row.text.length > 40 &&
      (content.includes(row.text) || row.text.includes(content))
    )?.clause
    || candidates.find(row => wordOverlapScore(content, row.text) >= 0.78)?.clause
    || null;
};

const getVendorName = (order) =>
  order.snapshot?.vendor?.vendorName || order.vendors?.vendor_name || order.vendors?.vendorName || "";

const getSiteCode = (order) =>
  order.snapshot?.site?.siteCode || "";

const buildRowsFromOrders = (orders, clauses) => {
  return orders.flatMap((order) => {
    const vendorName = getVendorName(order);
    const siteCode = getSiteCode(order);
    const orderNo = order.order_number || "";
    const snapshotClauses = Array.isArray(order.snapshot?.clauses) ? order.snapshot.clauses : [];

    if (snapshotClauses.length) {
      return snapshotClauses.map((clause, index) => {
        const clauseType = clause.type || "TC";
        const meta = TYPE_META[clauseType] || TYPE_META.TC;
        const matched = clause.code && clause.code !== "Custom"
          ? null
          : findMatchingClause(clauses, clauseType, clause.points || []);
        return {
          id: `${order.id || orderNo}_snapshot_${index}`,
          source: "Order",
          clauseType,
          clauseTypeLabel: meta.label,
          clauseId: clause.code && clause.code !== "Custom" ? clause.code : matched?.code || "Not linked",
          category: clause.category || matched?.category || "",
          orderNo,
          title: clause.title || matched?.title || order.subject || `${meta.label} - ${orderNo}`,
          content: pointsToText(clause.points || []),
          vendorName,
          siteCode,
          createdAt: order.created_at || order.date_of_creation || "",
        };
      }).filter(row => row.content);
    }

    return Object.entries(TYPE_META).flatMap(([clauseType, meta]) => {
      const points = Array.isArray(order[meta.field]) ? order[meta.field] : [];
      if (!points.length) return [];

      const content = pointsToText(points);
      if (!content) return [];

      const matched = findMatchingClause(clauses, clauseType, points);
      return [{
        id: `${order.id || orderNo}_${clauseType}`,
        source: "Order",
        clauseType,
        clauseTypeLabel: meta.label,
        clauseId: matched?.code || "Not linked",
        category: matched?.category || "",
        orderNo,
        title: matched?.title || order.subject || `${meta.label} - ${orderNo}`,
        content,
        vendorName,
        siteCode,
        createdAt: order.created_at || order.date_of_creation || "",
      }];
    });
  });
};

export default function ClauseMasterData() {
  const [orders, setOrders] = useState([]);
  const [clauses, setClauses] = useState([]);
  const [manualRows, setManualRows] = useState(() => {
    try { return JSON.parse(localStorage.getItem(LOCAL_ROWS_KEY) || "[]"); } catch { return []; }
  });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [siteFilter, setSiteFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [viewRow, setViewRow] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const importRef = useRef(null);

  useEffect(() => {
    localStorage.setItem(LOCAL_ROWS_KEY, JSON.stringify(manualRows));
  }, [manualRows]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      try {
        const [orderRes, clauseRes] = await Promise.all([
          fetch(`${API}/api/orders`),
          fetch(`${API}/api/procurement/clauses`),
        ]);
        const [orderData, clauseData] = await Promise.all([orderRes.json(), clauseRes.json()]);
        if (alive) {
          setOrders(orderData.orders || []);
          setClauses(clauseData.clauses || []);
        }
      } catch {
        if (alive) {
          setOrders([]);
          setClauses([]);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const orderRows = useMemo(() => buildRowsFromOrders(orders, clauses), [orders, clauses]);
  const allRows = useMemo(() => [...manualRows, ...orderRows], [manualRows, orderRows]);

  const filterOptions = useMemo(() => ({
    vendors: [...new Set(allRows.map(r => r.vendorName).filter(Boolean))].sort(),
    sites: [...new Set(allRows.map(r => r.siteCode).filter(Boolean))].sort(),
  }), [allRows]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allRows.filter(row => {
      if (typeFilter && row.clauseType !== typeFilter) return false;
      if (vendorFilter && row.vendorName !== vendorFilter) return false;
      if (siteFilter && row.siteCode !== siteFilter) return false;
      if (!term) return true;
      return [
        row.clauseTypeLabel,
        row.clauseId,
        row.category,
        row.orderNo,
        row.title,
        row.content,
        row.vendorName,
        row.siteCode,
      ].some(value => String(value || "").toLowerCase().includes(term));
    });
  }, [allRows, search, typeFilter, vendorFilter, siteFilter]);

  useEffect(() => {
    setPage(1);
  }, [search, typeFilter, vendorFilter, siteFilter]);

  const counts = useMemo(() => {
    const byType = { TC: 0, PAY: 0, GOV: 0, ANX: 0 };
    filtered.forEach(row => { if (byType[row.clauseType] !== undefined) byType[row.clauseType] += 1; });
    return byType;
  }, [filtered]);

  const typeClauses = clauses.filter(c => c.type === form.clauseType);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PER_PAGE;
  const paginatedRows = filtered.slice(pageStart, pageStart + PER_PAGE);

  const updateClauseType = (clauseType) => {
    setForm(f => ({ ...f, clauseType, clauseId: "", category: "", title: "", content: "" }));
  };

  const updateClause = (clauseId) => {
    const clause = clauses.find(c => c.code === clauseId);
    setForm(f => ({
      ...f,
      clauseId,
      category: clause?.category || "",
      title: clause?.title || "",
      content: pointsToText(clause?.points || []),
    }));
  };

  const updateOrder = (orderNo) => {
    const order = orders.find(o => o.order_number === orderNo);
    setForm(f => ({
      ...f,
      orderNo,
      vendorName: order ? getVendorName(order) : f.vendorName,
      siteCode: order ? getSiteCode(order) : f.siteCode,
    }));
  };

  const saveManualRow = () => {
    if (!form.orderNo.trim() || !form.title.trim() || !form.content.trim()) return;
    const meta = TYPE_META[form.clauseType] || TYPE_META.TC;
    const row = {
      ...form,
      id: `manual_${Date.now()}`,
      source: "Manual",
      clauseTypeLabel: meta.label,
      clauseId: form.clauseId || "Manual",
      createdAt: new Date().toISOString(),
    };
    setManualRows(prev => [row, ...prev]);
    setShowAdd(false);
    setForm(emptyForm);
  };

  const exportRows = () => {
    const rows = filtered.map(row => ({
      "Clause type": row.clauseTypeLabel,
      "Clauses id": row.clauseId,
      Category: row.category,
      "Order no": row.orderNo,
      "Vendor name": row.vendorName,
      Title: row.title,
      Content: row.content,
      Source: row.source,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Clauses Master");
    XLSX.writeFile(wb, `clauses_master_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const handleImport = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb = XLSX.read(ev.target.result, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const imported = data.map((row, index) => {
        const rawType = String(row["Clause type"] || row["Type"] || "").toLowerCase();
        const clauseType = Object.keys(TYPE_META).find(key =>
          key.toLowerCase() === rawType || TYPE_META[key].label.toLowerCase() === rawType
        ) || "TC";
        return {
          id: `import_${Date.now()}_${index}`,
          source: "Import",
          clauseType,
          clauseTypeLabel: TYPE_META[clauseType].label,
          clauseId: row["Clauses id"] || row["Clause id"] || row["Clause ID"] || "",
          category: row.Category || "",
          orderNo: row["Order no"] || row["Order No"] || "",
          vendorName: row["Vendor name"] || row["Vendor Name"] || "",
          siteCode: row["Site code"] || row["Site Code"] || "",
          title: row.Title || "",
          content: row.Content || "",
          createdAt: new Date().toISOString(),
        };
      }).filter(row => row.orderNo || row.title || row.content);
      setManualRows(prev => [...imported, ...prev]);
    };
    reader.readAsArrayBuffer(file);
    event.target.value = "";
  };

  const resetFilters = () => {
    setSearch("");
    setTypeFilter("");
    setVendorFilter("");
    setSiteFilter("");
  };

  const displayClauseId = (value) => value === "Custom" ? "Not linked" : value;

  return (
    <div className="min-h-screen bg-slate-50 p-3 sm:p-5 lg:p-6 text-slate-800">
      <div className="w-full max-w-full mx-auto space-y-4">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-900">Clauses Master</h1>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">Order-wise clauses register from issued/imported orders and manual rows</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => setShowAdd(true)} className="inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-3 text-xs font-bold text-white shadow-sm hover:bg-slate-800">
              <Plus size={15} /> Add
            </button>
            <button onClick={exportRows} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">
              <Download size={15} /> Export
            </button>
            <button onClick={() => importRef.current?.click()} className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">
              <Upload size={15} /> Import
            </button>
            <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Metric label="Total Clauses" value={filtered.length} icon={Database} />
          <Metric label="T&C" value={counts.TC} icon={FileText} />
          <Metric label="Payment" value={counts.PAY} icon={FileText} />
          <Metric label="Laws" value={counts.GOV} icon={FileText} />
          <Metric label="Annexure" value={counts.ANX} icon={FileText} />
        </div>

        <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm xl:flex-row xl:items-center xl:justify-between">
          <div className="flex h-9 w-full items-center gap-2 rounded-lg border border-slate-200 px-3 xl:max-w-[520px] xl:flex-none">
            <Search size={14} className="shrink-0 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search clause id, order no, title, content..." className="h-full w-full bg-transparent text-sm outline-none placeholder:text-slate-400" />
          </div>
          <div className="flex flex-wrap gap-2">
            <SelectFilter label="Type" value={typeFilter} onChange={setTypeFilter} options={Object.entries(TYPE_META).map(([value, meta]) => ({ value, label: meta.label }))} />
            <SelectFilter label="Vendor name" value={vendorFilter} onChange={setVendorFilter} options={filterOptions.vendors.map(value => ({ value, label: value }))} />
            <SelectFilter label="Site code" value={siteFilter} onChange={setSiteFilter} options={filterOptions.sites.map(value => ({ value, label: value }))} />
            {(search || typeFilter || vendorFilter || siteFilter) && (
              <button onClick={resetFilters} className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-500 hover:bg-slate-50">
                <X size={13} /> Clear
              </button>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <colgroup>
                <col className="w-[64px]" />
                <col className="w-[160px]" />
                <col className="w-[120px]" />
                <col className="w-[120px]" />
                <col className="w-[180px]" />
                <col className="w-[200px]" />
                <col />
              </colgroup>
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  {["S.No", "Clause type", "Clauses id", "Category", "Order no", "Title", "Content"].map(label => (
                    <th key={label} className="border border-slate-200 px-3 py-3 text-left text-[11px] font-black uppercase tracking-wide">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="h-44 text-center text-slate-400"><Loader2 className="mx-auto mb-2 animate-spin" size={22} />Loading clauses master...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="h-44 text-center text-xs font-bold uppercase tracking-[0.2em] text-slate-300">No clauses found</td></tr>
                ) : (
                  paginatedRows.map((row, index) => (
                    <tr key={row.id} className="hover:bg-slate-50">
                      <td className="border border-slate-200 px-3 py-3 text-center font-mono text-xs font-black text-slate-500">{pageStart + index + 1}</td>
                      <td className="border border-slate-200 px-3 py-3 font-bold text-slate-800">{row.clauseTypeLabel}</td>
                      <td className="border border-slate-200 px-3 py-3">
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 font-mono text-xs font-black text-slate-700">{displayClauseId(row.clauseId) || <NA />}</span>
                      </td>
                      <td className="border border-slate-200 px-3 py-3 text-slate-700">{row.category || <NA />}</td>
                      <td className="border border-slate-200 px-3 py-3">
                        <p className="whitespace-normal break-words font-mono text-xs font-black text-indigo-700">{row.orderNo || <NA />}</p>
                        <p className="mt-1 text-[11px] text-slate-400">{row.vendorName || "Vendor NA"}</p>
                      </td>
                      <td className="border border-slate-200 px-3 py-3 font-semibold text-slate-800">{row.title || <NA />}</td>
                      <td className="border border-slate-200 px-3 py-3">
                        <div className="flex items-start gap-2">
                          <p className="max-h-20 flex-1 break-words overflow-hidden whitespace-pre-line text-xs leading-5 text-slate-600">{row.content || <NA />}</p>
                          {row.content && (
                            <button onClick={() => setViewRow(row)} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100" title="View content">
                              <Eye size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs font-bold text-slate-500">
              Showing {filtered.length ? pageStart + 1 : 0}-{Math.min(pageStart + PER_PAGE, filtered.length)} of {filtered.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).slice(Math.max(0, currentPage - 3), Math.max(5, currentPage + 2)).map(n => (
                <button
                  key={n}
                  onClick={() => setPage(n)}
                  className={`h-8 min-w-8 rounded-lg border px-2 text-xs font-black ${currentPage === n ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-100"}`}
                >
                  {n}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="h-8 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {showAdd && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/40 p-4">
          <div className="w-full max-w-4xl rounded-lg bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div>
                <h2 className="text-base font-black text-slate-900">Add Clause Register Row</h2>
                <p className="text-xs text-slate-500">Select order and clause template, or enter custom clause data.</p>
              </div>
              <button onClick={() => { setShowAdd(false); setForm(emptyForm); }} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="grid gap-4 p-5 md:grid-cols-2">
              <Field label="Clause type">
                <select value={form.clauseType} onChange={e => updateClauseType(e.target.value)} className="field-input">
                  {Object.entries(TYPE_META).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
                </select>
              </Field>
              <Field label="Order no">
                <input list="clause-master-orders" value={form.orderNo} onChange={e => updateOrder(e.target.value)} placeholder="Select or type order no" className="field-input" />
                <datalist id="clause-master-orders">
                  {orders.map(order => <option key={order.id} value={order.order_number} />)}
                </datalist>
              </Field>
              <Field label="Clauses id">
                <input list="clause-master-clauses" value={form.clauseId} onChange={e => updateClause(e.target.value)} placeholder="Select or type clause id" className="field-input" />
                <datalist id="clause-master-clauses">
                  {typeClauses.map(clause => <option key={clause.id} value={clause.code}>{clause.title}</option>)}
                </datalist>
              </Field>
              <Field label="Category">
                <input value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} className="field-input" />
              </Field>
              <Field label="Vendor name">
                <input value={form.vendorName} onChange={e => setForm(f => ({ ...f, vendorName: e.target.value }))} className="field-input" />
              </Field>
              <Field label="Site code">
                <input value={form.siteCode} onChange={e => setForm(f => ({ ...f, siteCode: e.target.value }))} className="field-input" />
              </Field>
              <Field label="Title">
                <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="field-input" />
              </Field>
              <Field label="Content">
                <textarea value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={5} className="field-input min-h-[130px] resize-y" />
              </Field>
            </div>

            <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4">
              <button onClick={() => { setShowAdd(false); setForm(emptyForm); }} className="h-10 rounded-lg border border-slate-200 px-4 text-xs font-bold text-slate-600 hover:bg-slate-50">Cancel</button>
              <button disabled={!form.orderNo.trim() || !form.title.trim() || !form.content.trim()} onClick={saveManualRow} className="h-10 rounded-lg bg-slate-900 px-4 text-xs font-bold text-white disabled:opacity-40">Add Row</button>
            </div>
          </div>
        </div>
      )}

      {viewRow && (
        <div className="fixed inset-0 z-[1250] flex justify-end bg-slate-950/35">
          <button className="flex-1 cursor-default" onClick={() => setViewRow(null)} aria-label="Close clause view" />
          <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">{viewRow.clauseTypeLabel}</p>
                <h2 className="text-lg font-black text-slate-900">{viewRow.title || viewRow.clauseId}</h2>
                <p className="mt-1 text-xs text-slate-500">{viewRow.orderNo || "Order NA"} / {viewRow.vendorName || "Vendor NA"}</p>
              </div>
              <button onClick={() => setViewRow(null)} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100">
                <X size={17} />
              </button>
            </div>
            <div className="p-5">
              <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">{viewRow.content}</pre>
            </div>
          </aside>
        </div>
      )}

      <style>{`
        .field-input {
          min-height: 40px;
          width: 100%;
          border-radius: 8px;
          border: 1px solid #e2e8f0;
          background: #fff;
          padding: 8px 10px;
          font-size: 13px;
          color: #334155;
          outline: none;
        }
        .field-input:focus {
          border-color: #94a3b8;
          box-shadow: 0 0 0 3px rgba(148, 163, 184, 0.18);
        }
      `}</style>
    </div>
  );
}

function SelectFilter({ label, value, onChange, options }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`h-10 min-w-[150px] appearance-none rounded-lg border px-3 pr-8 text-xs font-bold outline-none ${value ? "border-indigo-300 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700"}`}
      >
        <option value="">{label}</option>
        {options.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
      </select>
      <ChevronDown size={13} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
    </div>
  );
}

function Metric({ label, value, icon: Icon }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
          <p className="mt-1 truncate text-lg font-black text-slate-900">{value}</p>
        </div>
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
          <Icon size={18} />
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      {children}
    </label>
  );
}

function NA() {
  return <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">NA</span>;
}
