import React, { useState, useEffect, useRef } from "react";
import { useModulePermissions } from "../../hooks/useModulePermissions";
import { Plus, Upload, Search, Pencil, Trash2, X, Package, Image as ImageIcon, Eye, ChevronDown, Download, FileSpreadsheet, FileText, History } from "lucide-react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";
import { logAudit } from "../../utils/auditLog";
import LogPanel from "../../components/LogPanel";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 10;
const TABS = ["Supply", "SITC"];

const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }],
    [{ 'align': [] }],
    ['clean']
  ]
};

const normalizeRichTextHtml = (value) =>
  typeof value === "string" ? value.replace(/&nbsp;|&#160;|\u00A0/g, " ") : value;

const getHTML = (points) => {
  if (!points || !points.length) return "";
  const normalize = (html) => normalizeRichTextHtml(html);
  // If it already looks like HTML (from ReactQuill), return first element or whole
  if (points.length === 1 && (points[0].includes('<') || points[0] === "")) return normalize(points[0]);
  // Backward compatibility: Convert array of strings to a list
  return `<ul style="list-style-type: disc; padding-left: 1.5rem;">${points.map(p => `<li>${normalize(p)}</li>`).join('')}</ul>`;
};

const emptyForm = {
  materialName: "",
  specifications: [],
  category: "",
  brands: [],
  unit: "",
  remarks: "",
  image: null,
  imagePreview: null,
};

/* ── Searchable dropdown ── */
function SearchableSelect({ options, value, onChange, placeholder }) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const ref               = useRef();

  useEffect(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered  = options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()));
  const selected  = options.find(o => o.value === value);

  return (
    <div ref={ref} className="relative">
      <div onClick={() => setOpen(v => !v)}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm cursor-pointer flex items-center justify-between bg-white">
        <span className={selected ? "text-slate-700" : "text-slate-400"}>{selected ? selected.label : placeholder}</span>
        <ChevronDown size={13} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-slate-100">
            <input autoFocus value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full px-2 py-1 text-sm outline-none text-slate-700" />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs text-slate-400">No results</p>
              : filtered.map(o => (
                <div key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                  className={`px-3 py-2 text-sm cursor-pointer transition-colors
                    ${value === o.value ? "bg-blue-50 text-blue-700 font-medium" : "hover:bg-slate-50 text-slate-700"}`}>
                  {o.label}
                </div>
              ))
            }
          </div>
        </div>
      )}
    </div>
  );
}

export default function ItemList() {
  const { isGlobalAdmin, canAdd, canEdit, canDelete, canBulk: canBulkUpload, canExport } = useModulePermissions("item_list");

  const [items, setItems]         = useState([]);
  const [categories, setCategories] = useState([]);
  const [uoms, setUoms]           = useState([]);
  const [loading, setLoading]     = useState(true);
  const [activeTab, setActiveTab] = useState("Supply");
  const [showModal, setShowModal] = useState(false);
  const [viewItem, setViewItem]   = useState(null);
  const [form, setForm]           = useState(emptyForm);
  const [editId, setEditId]       = useState(null);
  const [search, setSearch]       = useState("");
  const [saving, setSaving]       = useState(false);
  const [toast, setToast]         = useState(null);
  const [page, setPage]           = useState(1);
  const [logTarget, setLogTarget] = useState(null);
  const [showExport, setShowExport] = useState(false);
  const [showBulk, setShowBulk]   = useState(false);
  const [bulkRows, setBulkRows]   = useState([]);
  const [bulkFile, setBulkFile]   = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);
  const fileRef = useRef();
  const bulkRef = useRef();

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    try {
      const [itemsRes, catsRes, uomsRes] = await Promise.all([
        fetch(`${API}/api/procurement/items`).then(r => r.json()),
        fetch(`${API}/api/procurement/categories`).then(r => r.json()),
        fetch(`${API}/api/procurement/uom`).then(r => r.json()),
      ]);
      setItems(itemsRes.items || []);
      setCategories(catsRes.categories || []);
      setUoms(uomsRes.uoms || []);
    } catch { setItems([]); }
    setLoading(false);
  };

  const showToast = (msg, type = "success") => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const openAdd = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };

  const openEdit = (item) => {
    setEditId(item.id);
    setForm({
      materialName:   item.materialName || "",
      specifications: item.specifications || [],
      category:       item.category || "",
      brands:         item.brands || [],
      unit:           item.unit || "",
      remarks:        item.remarks || "",
      image:          null,
      imagePreview:   item.imageUrl || null,
    });
    setShowModal(true);
  };

  const handleImage = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setForm(f => ({ ...f, image: file, imagePreview: URL.createObjectURL(file) }));
  };

  const handleSave = async () => {
    if (!form.materialName.trim()) return showToast("Item Name required", "error");
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("itemType",    activeTab);
      fd.append("materialName", form.materialName);
      fd.append("specifications", JSON.stringify(form.specifications.filter(s => s.trim())));
      fd.append("category",     form.category);
      fd.append("brands",       JSON.stringify(form.brands.filter(b => b.trim())));
      fd.append("unit", form.unit);
      fd.append("remarks",      form.remarks);
      
      const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
      fd.append("createdById", currentUser.id || "");
      fd.append("createdByName", currentUser.name || "");

      if (form.image)        fd.append("image",    form.image);
      if (form.imagePreview) fd.append("imageUrl", form.imagePreview);

      const url    = editId ? `${API}/api/procurement/items/${editId}` : `${API}/api/procurement/items`;
      const method = editId ? "PUT" : "POST";
      const res = await fetch(url, { method, body: fd });
      const result = await res.json();
      logAudit("item", editId || result.id, form.materialName, editId ? "updated" : "created");
      showToast(editId ? "Item updated" : "Item added");
      setShowModal(false);
      if (editId) {
        // update in-place — preserve row position
        setItems(prev => prev.map(it => it.id === editId ? {
          ...it,
          materialName:   form.materialName,
          specifications: form.specifications.filter(s => s.trim()),
          category:       form.category,
          brands:         form.brands.filter(b => b.trim()),
          unit:           form.unit,
          remarks:        form.remarks,
          imageUrl:       result.imageUrl ?? (form.image ? it.imageUrl : form.imagePreview),
        } : it));
      } else {
        fetchAll(); // new item — need backend-assigned code + id
      }
    } catch { showToast("Failed to save", "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this item?")) return;
    try {
      const itemName = items.find(i => i.id === id)?.materialName || "";
      await fetch(`${API}/api/procurement/items/${id}`, { method: "DELETE" });
      logAudit("item", id, itemName, "deleted");
      showToast("Item deleted");
      fetchAll();
    } catch { showToast("Failed to delete", "error"); }
  };

  /* ── Export / Bulk helpers ── */
  const SUPPLY_COLS = ["Category","Item Name","Specification (comma separated)","Brand 1","Brand 2","Brand 3","Brand 4","Brand 5","Unit","Remarks"];
  const SITC_COLS   = ["Category","Item Name","Specification (comma separated)","Brand 1","Brand 2","Brand 3","Brand 4","Brand 5","Unit","Remarks"];
  const EXP_SUPPLY  = ["Item Code","Category","Item Name","Specification","Brands","Unit","Remarks"];
  const EXP_SITC    = ["Item Code","Category","Item Name","Specification","Brands","Unit","Remarks"];

  const downloadTemplate = () => {
    const exampleSupply = {
      "Category": "Civil",
      "Item Name": "Cement OPC 53 Grade",
      "Specification (comma separated)": "53 Grade, ISI marked, 50kg bag",
      "Brand 1": "UltraTech", "Brand 2": "ACC", "Brand 3": "Ambuja", "Brand 4": "", "Brand 5": "",
      "Unit": "Bag",
      "Remarks": "Store in dry place",
    };
    const exampleSITC = {
      ...exampleSupply,
      "Category": "ELV / IT",
      "Item Name": "IP Camera 4MP",
      "Specification (comma separated)": "4MP, IR 30m, H.265, PoE",
      "Brand 1": "Hikvision", "Brand 2": "Dahua", "Brand 3": "", "Brand 4": "", "Brand 5": "",
      "Unit": "Nos",
      "Remarks": "",
    };
    const headers = isSITC ? SITC_COLS : SUPPLY_COLS;
    const example = isSITC ? exampleSITC : exampleSupply;
    const ws = XLSX.utils.json_to_sheet([Object.fromEntries(headers.map(h => [h, example[h] ?? ""]))]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);
    XLSX.writeFile(wb, `${activeTab}_items_template.xlsx`);
  };

  const exportExcel = () => {
    const headers = isSITC ? EXP_SITC : EXP_SUPPLY;
    const rows = tabItems.map(item => {
      const brands = (item.brands || []).join("; ");
      const base   = { "Item Code": item.itemCode, "Category": item.category, "Item Name": item.materialName, "Specification": (item.specifications||[]).join(", "), "Brands": brands, "Unit": item.unit, "Remarks": item.remarks };
      return Object.fromEntries(headers.map(h => [h, base[h] || ""]));
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, activeTab);
    XLSX.writeFile(wb, `${activeTab}_items_${new Date().toISOString().slice(0,10)}.xlsx`);
    setShowExport(false);
  };

  const exportPDF = () => {
    const headers = isSITC ? EXP_SITC : EXP_SUPPLY;
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

    // Title
    doc.setFontSize(14); doc.setFont(undefined, "bold");
    doc.text(`Item List — ${activeTab}`, 14, 14);
    doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.setTextColor(100);
    doc.text(`Exported: ${new Date().toLocaleDateString("en-IN")}   ·   Total Items: ${tabItems.length}`, 14, 21);
    doc.setTextColor(0);

    autoTable(doc, {
      startY: 27,
      head: [["S.No", ...headers]],
      body: tabItems.map((item, idx) => {
        const specs  = (item.specifications || []).join(", ");
        const brands = (item.brands || []).join(", ");
        const base   = {
          "Item Code":    item.itemCode   || "",
          "Category":     item.category   || "",
          "Item Name":    item.materialName|| "",
          "Specification": specs,
          "Brands":        brands,
          "Unit":          item.unit      || "",
          "Remarks":       item.remarks   || "",
        };
        return [idx + 1, ...headers.map(h => base[h] || "")];
      }),
      styles: {
        fontSize: 8,
        cellPadding: 3,
        lineColor: [203, 213, 225],
        lineWidth: 0.3,
        valign: "top",
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: 255,
        fontStyle: "bold",
        fontSize: 8,
        halign: "center",
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { halign: "center", cellWidth: 12 }, // S.No
        1: { cellWidth: 22 },                   // Item Code
        2: { cellWidth: 22 },                   // Category
        3: { cellWidth: 30 },                   // Item Name
        4: { cellWidth: "auto" },               // Specification
        5: { cellWidth: 20 },                   // Unit / Brands
      },
      margin: { left: 10, right: 10 },
      tableLineColor: [203, 213, 225],
      tableLineWidth: 0.3,
    });

    doc.save(`${activeTab}_items_${new Date().toISOString().slice(0, 10)}.pdf`);
    setShowExport(false);
  };

  const handleBulkFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const data = XLSX.utils.sheet_to_json(ws);
      const rows = data.map(r => ({
        category:       r["Category"]     || "",
        materialName:   r["Item Name"]    || "",
        specifications: (r["Specification (comma separated)"] || "").toString().split(",").map(s => s.trim()).filter(Boolean),
        brands:         [r["Brand 1"],r["Brand 2"],r["Brand 3"],r["Brand 4"],r["Brand 5"]].filter(b => b?.toString().trim()),
        unit:        r["Unit"]         || "",
        remarks:     r["Remarks"]      || "",
        itemType:    activeTab,
      })).filter(r => r.materialName?.trim());
      setBulkRows(rows);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleBulkSave = async () => {
    if (!bulkRows.length) return showToast("No valid rows to upload", "error");
    setBulkSaving(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const res  = await fetch(`${API}/api/procurement/items/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          rows: bulkRows,
          createdById: currentUser.id || "",
          createdByName: currentUser.name || ""
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed");
      if (data.skipped > 0)
        showToast(`${data.inserted} added, ${data.skipped} skipped (duplicates)`);
      else
        showToast(`${data.inserted} items added`);
      setShowBulk(false); setBulkRows([]); setBulkFile("");
      fetchAll();
    } catch (err) { showToast(err.message, "error"); }
    setBulkSaving(false);
  };

  /* brands helpers */
  const addBrand    = () => { if (form.brands.length < 5) setForm(f => ({ ...f, brands: [...f.brands, ""] })); };
  const updateBrand = (i, v) => setForm(f => { const b = [...f.brands]; b[i] = v; return { ...f, brands: b }; });
  const removeBrand = (i) => setForm(f => ({ ...f, brands: f.brands.filter((_, idx) => idx !== i) }));

  /* specification helpers (no limit) */
  const addSpec    = () => setForm(f => ({ ...f, specifications: [...f.specifications, ""] }));
  const updateSpec = (i, v) => setForm(f => { const s = [...f.specifications]; s[i] = v; return { ...f, specifications: s }; });
  const removeSpec = (i) => setForm(f => ({ ...f, specifications: f.specifications.filter((_, idx) => idx !== i) }));

  /* scope of work helpers */

  const [filterCategory, setFilterCategory] = useState("");
  const [filterItem,     setFilterItem]     = useState("");

  /* filtered list */
  const tabItems = items.filter(i => (i.itemType || "Supply") === activeTab);

  // unique values for filter dropdowns (from current tab)
  const uniqueCategories = [...new Set(tabItems.map(i => i.category).filter(Boolean))].sort();
  const uniqueItems      = [...new Set(tabItems.map(i => i.materialName).filter(Boolean))].sort();

  const filtered = tabItems.filter(i => {
    const matchSearch   = !search       || i.materialName?.toLowerCase().includes(search.toLowerCase()) || i.category?.toLowerCase().includes(search.toLowerCase()) || i.itemCode?.toLowerCase().includes(search.toLowerCase());
    const matchCategory = !filterCategory || i.category === filterCategory;
    const matchItem     = !filterItem     || i.materialName === filterItem;
    return matchSearch && matchCategory && matchItem;
  });

  const hasFilters  = filterCategory || filterItem;
  const totalPages  = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated   = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const isSITC      = activeTab === "SITC";

  const catOptions = categories.map(c => ({ label: c.categoryName, value: c.categoryName }));
  const uomOptions = uoms.map(u => ({ label: `${u.uomName} (${u.uomCode})`, value: u.uomCode }));

  return (
    <div className="p-3 sm:p-4 lg:p-6 w-full pb-32">
      <style>{`
        .ql-align-center { text-align: center !important; }
        .ql-align-right { text-align: right !important; }
        .ql-align-justify { text-align: justify !important; }
        .quill-content { text-align: justify !important; }
        .quill-content p, .quill-content div { text-align: justify; }
        .quill-content ul { list-style-type: disc !important; padding-left: 1.5rem !important; }
        .quill-content ol { list-style-type: decimal !important; padding-left: 1.5rem !important; }
      `}</style>

      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.type === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Package size={20} className="text-blue-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">Item List</h1>
            <p className="text-sm text-slate-400">Global master — used across all POs</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          {/* Export dropdown */}
          {canExport && (
            <div className="relative">
              <button onClick={() => { setShowExport(s => !s); setShowBulk(false); }}
                className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
                <Download size={14} /> Export <ChevronDown size={12} />
              </button>
              {showExport && (
                <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-36">
                  <button onClick={exportExcel}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    <FileSpreadsheet size={14} className="text-green-600" /> Excel (.xlsx)
                  </button>
                  <button onClick={exportPDF}
                    className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                    <FileText size={14} className="text-red-500" /> PDF
                  </button>
                </div>
              )}
            </div>
          )}
          {/* Bulk Upload */}
          {canBulkUpload && (
            <button onClick={() => { setShowBulk(s => !s); setShowExport(false); }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
              <Upload size={14} /> Bulk Upload
            </button>
          )}
          {canAdd && (
            <button onClick={openAdd}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all">
              <Plus size={15} /> Add Item
            </button>
          )}
        </div>
      </div>

      {/* Bulk Upload Panel */}
      {showBulk && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">Bulk Upload — {activeTab} Items</h3>
            <button onClick={() => { setShowBulk(false); setBulkRows([]); setBulkFile(""); }}
              className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <span className="text-xs font-black text-indigo-600">1</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700">Download Template</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">Fill item details using the Excel template</p>
                <button onClick={downloadTemplate}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all">
                  <FileSpreadsheet size={13} className="text-green-600" /> Download Template
                </button>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-slate-50 rounded-xl border border-slate-100">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
                <span className="text-xs font-black text-indigo-600">2</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-700">Upload Filled File</p>
                <p className="text-xs text-slate-500 mt-0.5 mb-3">Select your filled Excel file to preview</p>
                <button onClick={() => bulkRef.current.click()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-all truncate max-w-full">
                  <Upload size={13} /> {bulkFile || "Choose .xlsx file"}
                </button>
                <input ref={bulkRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFile} />
              </div>
            </div>
          </div>
          {bulkRows.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-600 mb-2">{bulkRows.length} items ready to upload</p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50">
                {bulkRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2 bg-slate-50 text-xs text-slate-600">
                    <span className="font-mono text-slate-400">{i + 1}</span>
                    <span className="font-semibold">{r.materialName}</span>
                    <span className="text-slate-400">{r.category}</span>
                    <span className="text-slate-400">{r.unit}</span>
                  </div>
                ))}
              </div>
              <button onClick={handleBulkSave} disabled={bulkSaving}
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-all">
                <Upload size={14} /> {bulkSaving ? "Uploading…" : `Upload ${bulkRows.length} Items`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(tab => (
          <button key={tab} onClick={() => { setActiveTab(tab); setPage(1); setFilterCategory(""); setFilterItem(""); }}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all
              ${activeTab === tab ? "bg-white text-slate-800 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}>
            {tab}
          </button>
        ))}
      </div>

      {/* Search + Filters */}
      <div className="flex flex-col sm:flex-row items-center gap-2 mb-4">
        <div className="relative w-full sm:flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by code, name or category…"
            className="w-full pl-9 pr-4 h-10 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-700" />
        </div>

        {/* Category filter */}
        <div className="relative w-full sm:w-auto">
          <select value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setPage(1); }}
            className="h-10 w-full sm:w-40 pl-3 pr-8 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-600 appearance-none cursor-pointer">
            <option value="">All Categories</option>
            {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Item filter */}
        <div className="relative w-full sm:w-auto">
          <select value={filterItem} onChange={e => { setFilterItem(e.target.value); setPage(1); }}
            className="h-10 w-full sm:w-48 pl-3 pr-8 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-600 appearance-none cursor-pointer">
            <option value="">All Items</option>
            {uniqueItems.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button onClick={() => { setFilterCategory(""); setFilterItem(""); setPage(1); }}
            className="h-10 flex items-center gap-1.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all bg-white">
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {/* Table */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 sticky left-0 z-10 bg-slate-50 w-[35px]">S.No</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 sticky left-[35px] z-10 bg-slate-50 w-[80px] whitespace-nowrap">Item Code</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200">Category</th>
                {isSITC ? (
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200">Item Name & Description</th>
                ) : (
                  <>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200">Item Name</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200">Specification</th>
                  </>
                )}
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200">Brand(s)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200">Unit</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200">Remarks</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-500 uppercase tracking-wide border border-slate-200 sticky right-0 z-10 bg-slate-50 w-[75px]">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={isSITC ? 8 : 9} className="text-center py-16 text-slate-400 text-sm border border-slate-200">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={isSITC ? 8 : 9} className="text-center py-16 text-slate-300 font-semibold uppercase tracking-widest text-xs border border-slate-200">No items found</td></tr>
              ) : paginated.map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-sm text-slate-400 text-center border border-slate-200 align-top sticky left-0 z-10 bg-white w-[35px]">{(page - 1) * PER_PAGE + idx + 1}</td>
                  <td className="px-4 py-3 text-sm font-mono text-slate-600 border border-slate-200 align-top whitespace-nowrap sticky left-[35px] z-10 bg-white w-[80px]">{item.itemCode}</td>
                  <td className="px-4 py-3 border border-slate-200 align-top">
                    {item.category
                      ? <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium whitespace-nowrap">{item.category}</span>
                      : <span className="text-slate-300 text-sm">—</span>}
                  </td>
                  {isSITC ? (
                    <td className="px-4 py-3 border border-slate-200 align-top whitespace-normal break-words leading-tight">
                      <div className="flex flex-col gap-2">
                        <div className="text-sm font-semibold text-slate-700 leading-tight">{item.materialName}</div>
                        <div className="space-y-1.5">
                          {item.specifications?.map((s, i) => (
                            <div key={i} className="quill-content text-[11px] text-slate-500 leading-tight border-l-2 border-slate-100 pl-2 font-medium" 
                                 dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(s) }} />
                          ))}
                        </div>
                      </div>
                    </td>
                  ) : (
                    <>
                      <td className="px-4 py-3 text-sm font-semibold text-slate-700 border border-slate-200 align-top whitespace-normal break-words leading-tight">{item.materialName}</td>
                      <td className="px-4 py-3 border border-slate-200 align-top">
                        {item.specifications?.length > 0
                          ? <div className="flex flex-wrap gap-1">
                              {item.specifications.map((s, i) => (
                                <span key={i} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-xs whitespace-normal break-words leading-tight">{s}</span>
                              ))}
                            </div>
                          : <span className="text-slate-300 text-sm">—</span>}
                      </td>
                    </>
                  )}
                  <td className="px-4 py-3 border border-slate-200 align-top">
                    {item.brands?.length > 0
                      ? <div className="flex flex-wrap gap-1">
                          {item.brands.map((b, i) => (
                            <span key={i} className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-600 text-xs whitespace-normal break-words leading-tight">{b}</span>
                          ))}
                        </div>
                      : <span className="text-slate-300 text-sm">—</span>}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500 border border-slate-200 align-top whitespace-nowrap">{item.unit || "—"}</td>
                  <td className="px-4 py-3 text-sm text-slate-500 border border-slate-200 align-top whitespace-normal break-words leading-tight">{item.remarks || "—"}</td>
                  <td className="px-4 py-3 border border-slate-200 align-top sticky right-0 z-10 bg-white shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.05)] w-[75px]">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setViewItem(item)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="View">
                        <Eye size={14} />
                      </button>
                      {canEdit && (
                        <button onClick={() => openEdit(item)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-all" title="Edit">
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleDelete(item.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                      <button onClick={() => setLogTarget({ entityType: "item", entityId: item.id, entityName: item.materialName })} className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all" title="Activity Log">
                        <History size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="px-4 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-400">{filtered.length} item{filtered.length !== 1 ? "s" : ""} · Page {page} of {totalPages}</p>
          {totalPages > 1 && (
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">‹</button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let n;
                if (totalPages <= 5) n = i + 1;
                else if (page <= 3) n = i + 1;
                else if (page >= totalPages - 2) n = totalPages - 4 + i;
                else n = page - 2 + i;
                return (
                  <button key={n} onClick={() => setPage(n)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition-all
                      ${page === n ? "bg-slate-900 text-white border-slate-900" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                    {n}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-2 py-1 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">›</button>
            </div>
          )}
        </div>
      </div>

      {/* ── VIEW MODAL ── */}
      {viewItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden">
            {/* Modal Header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-slate-100">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                  <Package size={18} className="text-slate-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h2 className="text-base font-bold text-slate-800">{viewItem.materialName}</h2>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      viewItem.itemType === "SITC"
                        ? "bg-purple-50 text-purple-700"
                        : "bg-blue-50 text-blue-700"
                    }`}>{viewItem.itemType || "Supply"}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-xs text-slate-400 font-mono">{viewItem.itemCode}</p>
                    {viewItem.category && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-xs">{viewItem.category}</span>
                    )}
                  </div>
                </div>
              </div>
              <button onClick={() => setViewItem(null)} className="text-slate-400 hover:text-slate-600 mt-1"><X size={18} /></button>
            </div>

            <div className="px-6 py-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Image */}
              <div className="flex items-center justify-center bg-slate-50 rounded-xl h-40 border border-slate-100">
                {viewItem.imageUrl
                  ? <img src={viewItem.imageUrl} alt="" className="h-full object-contain rounded-xl" />
                  : <div className="flex flex-col items-center gap-2 text-slate-300">
                      <ImageIcon size={32} />
                      <p className="text-xs">No image</p>
                    </div>
                }
              </div>

              {/* Unit + Remarks row */}
              <div className="grid grid-cols-2 gap-3">
                {viewItem.unit && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Unit</p>
                    <p className="text-sm font-semibold text-slate-700">{viewItem.unit}</p>
                  </div>
                )}
                {viewItem.remarks && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Remarks</p>
                    <p className="text-sm text-slate-700">{viewItem.remarks}</p>
                  </div>
                )}
                <div className="col-span-full bg-slate-50 rounded-xl p-3 border border-slate-100/50">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Description / Points</p>
                  <div className="space-y-3">
                    {viewItem.specifications?.map((s, i) => (
                      <div key={i} className="flex gap-2">
                        <span className="text-slate-300 font-mono text-[10px] mt-1 shrink-0">{i + 1}.</span>
                        <div className="quill-content text-sm text-slate-600 leading-relaxed font-medium flex-1"
                             dangerouslySetInnerHTML={{ __html: normalizeRichTextHtml(s) }} />
                      </div>
                    ))}
                    {(!viewItem.specifications || viewItem.specifications.length === 0) && (
                      <p className="text-xs text-slate-300 italic">No points listed</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Brands */}
              {viewItem.brands?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Brand(s)</p>
                  <div className="flex flex-wrap gap-2">
                    {viewItem.brands.map((b, i) => (
                      <span key={i} className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-medium border border-slate-200">{b}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── ADD / EDIT MODAL ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="text-base font-bold text-slate-800">
                {editId ? "Edit Item" : `Add ${activeTab} Item`}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X size={18} /></button>
            </div>

            <div className="px-6 py-5 space-y-4 max-h-[72vh] overflow-y-auto">

              {/* Image */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wide">Image</label>
                <div onClick={() => fileRef.current.click()}
                  className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-200 rounded-xl p-5 cursor-pointer hover:border-slate-400 hover:bg-slate-50 transition-all">
                  {form.imagePreview
                    ? <img src={form.imagePreview} alt="" className="h-24 object-contain rounded-lg" />
                    : <><ImageIcon size={26} className="text-slate-300" /><p className="text-xs text-slate-400">Click to upload</p></>
                  }
                </div>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleImage} />
              </div>

              <div className="grid grid-cols-2 gap-3">

                {/* Category */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Category</label>
                  <SearchableSelect
                    options={catOptions}
                    value={form.category}
                    onChange={v => setForm(f => ({ ...f, category: v }))}
                    placeholder="Select category…" />
                </div>

                {/* Unit */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Unit</label>
                  <SearchableSelect
                    options={uomOptions}
                    value={form.unit}
                    onChange={v => setForm(f => ({ ...f, unit: v }))}
                    placeholder="Select unit…" />
                </div>

                {/* Item Name */}
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Item Name <span className="text-red-400">*</span></label>
                  <input value={form.materialName} onChange={e => setForm(f => ({ ...f, materialName: e.target.value }))}
                    placeholder="e.g. Cement OPC 53 Grade"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
                </div>

                {/* Description / Points */}
                <div className="col-span-full">
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Description / Points</label>
                    <button type="button" onClick={addSpec}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 px-2 py-1 rounded-lg border border-indigo-100">
                      <Plus size={10} /> Add Point
                    </button>
                  </div>
                  <div className="space-y-4">
                    {form.specifications.map((s, i) => (
                      <div key={i} className="flex gap-2 group relative">
                        <div className="flex-1 border border-slate-200 rounded-2xl overflow-hidden focus-within:ring-2 focus-within:ring-indigo-50 focus-within:border-indigo-400 transition-all bg-white">
                          {activeTab === "SITC" ? (
                            <ReactQuill 
                              theme="snow"
                              value={s || ""}
                              onChange={(val) => updateSpec(i, val)}
                              modules={QUILL_MODULES}
                              placeholder={`Point ${i + 1}...`}
                            />
                          ) : (
                            <input 
                              value={s || ""} 
                              onChange={(e) => updateSpec(i, e.target.value)}
                              placeholder={`Specification Point ${i + 1}...`}
                              className="w-full px-4 py-3 text-sm outline-none text-slate-700 bg-white"
                            />
                          )}
                        </div>
                        <button type="button" 
                          onClick={() => removeSpec(i)}
                          className="w-8 h-8 rounded-xl bg-slate-50 text-slate-300 hover:text-red-500 hover:bg-red-50 flex items-center justify-center shrink-0 border border-slate-100 transition-all mt-1">
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    {form.specifications.length === 0 && (
                      <div className="text-center py-8 border-2 border-dashed border-slate-100 rounded-3xl bg-slate-50/30">
                        <p className="text-xs text-slate-400 font-medium">Click "Add Point" to start adding descriptions</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Brands */}
                <div className="col-span-2">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Brand(s) <span className="text-slate-400 font-normal normal-case">(max 5)</span></label>
                    {form.brands.length < 5 && (
                      <button onClick={addBrand} className="text-xs text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1">
                        <Plus size={12} /> Add Brand
                      </button>
                    )}
                  </div>
                  {form.brands.length === 0
                    ? <p className="text-xs text-slate-400 italic">Click "Add Brand" to add brands</p>
                    : <div className="space-y-2">
                        {form.brands.map((b, i) => (
                          <div key={i} className="flex items-center gap-2">
                            <input value={b} onChange={e => updateBrand(i, e.target.value)}
                              placeholder={`Brand ${i + 1}`}
                              className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-slate-400 text-slate-700" />
                            <button onClick={() => removeBrand(i)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all">
                              <X size={13} />
                            </button>
                          </div>
                        ))}
                      </div>
                  }
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Remarks</label>
                  <input value={form.remarks} onChange={e => setForm(f => ({ ...f, remarks: e.target.value }))}
                    placeholder="Optional…"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
                </div>

              </div>
            </div>

            <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setShowModal(false)}
                className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">Cancel</button>
              <button onClick={handleSave} disabled={saving}
                className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                {saving ? "Saving…" : editId ? "Update Item" : "Add Item"}
              </button>
            </div>
          </div>
        </div>
      )}
      {logTarget && (
        <LogPanel entityType={logTarget.entityType} entityId={logTarget.entityId} entityName={logTarget.entityName} onClose={() => setLogTarget(null)} />
      )}
    </div>
  );
}
