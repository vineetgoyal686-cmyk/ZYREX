import React, { useState, useEffect, useRef } from "react";
import { useModulePermissions } from "../../../hooks/useModulePermissions";
import {
  FileText, CreditCard, Scale, Plus, Download, Upload, X, Search,
  ChevronDown, Pencil, Trash2, FileSpreadsheet, AlignLeft, History,
  ChevronRight, Clock, User, CheckCircle, Eye, BookOpen,
} from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const PER_PAGE = 9;
const normalizeRichTextHtml = (value) =>
  typeof value === "string"
    ? value.replace(/&nbsp;|&#160;|\u00A0/g, " ")
    : value;

/* ── Per-type config ── */
const TYPE_CONFIG = {
  TC: {
    label: "Terms & Conditions",
    desc:  "Global T&C templates used across all POs",
    prefix: "TC",
    Icon:  FileText,
    iconBg:    "bg-yellow-50",
    iconColor: "text-yellow-600",
    badgeCls:  "bg-yellow-50 text-yellow-700 border border-yellow-200",
    numBg:     "bg-yellow-100",
    numColor:  "text-yellow-700",
    borderAccent: "border-l-yellow-400",
    headerBg:  "from-yellow-50 to-white",
    accentRing: "ring-yellow-200",
  },
  PAY: {
    label: "Payment Terms",
    desc:  "Payment schedule and milestone templates",
    prefix: "PAY",
    Icon:  CreditCard,
    iconBg:    "bg-emerald-50",
    iconColor: "text-emerald-600",
    badgeCls:  "bg-emerald-50 text-emerald-700 border border-emerald-200",
    numBg:     "bg-emerald-100",
    numColor:  "text-emerald-700",
    borderAccent: "border-l-emerald-400",
    headerBg:  "from-emerald-50 to-white",
    accentRing: "ring-emerald-200",
  },
  GOV: {
    label: "Government Laws",
    desc:  "Applicable government regulations and compliance",
    prefix: "GOV",
    Icon:  Scale,
    iconBg:    "bg-indigo-50",
    iconColor: "text-indigo-600",
    badgeCls:  "bg-indigo-50 text-indigo-700 border border-indigo-200",
    numBg:     "bg-indigo-100",
    numColor:  "text-indigo-700",
    borderAccent: "border-l-indigo-400",
    headerBg:  "from-indigo-50 to-white",
    accentRing: "ring-indigo-200",
  },
  ANX: {
    label: "Annexure",
    desc:  "Annexure templates used across all POs",
    prefix: "ANX",
    Icon:  BookOpen,
    iconBg:    "bg-violet-50",
    iconColor: "text-violet-600",
    badgeCls:  "bg-violet-50 text-violet-700 border border-violet-200",
    numBg:     "bg-violet-100",
    numColor:  "text-violet-700",
    borderAccent: "border-l-violet-400",
    headerBg:  "from-violet-50 to-white",
    accentRing: "ring-violet-200",
  },
};

const emptyForm = { title: "", category: "", content: "" };

const getHTML = (points) => {
  // Strip legacy __sp: style prefix if present in old data
  const pts = points?.[0]?.startsWith?.("__sp:") ? points.slice(1) : points;
  if (!pts || !pts.length) return "";
  const normalize = (html) => normalizeRichTextHtml(html);
  if (pts.length === 1 && (pts[0].includes('<') || pts[0] === "")) return normalize(pts[0]);
  return `<ol>${pts.map(p => `<li>${normalize(p)}</li>`).join('')}</ol>`;
};

const stripHTMLToText = (html) => {
  if (!html) return "";
  const tmp = document.createElement("DIV");
  // preserve spacing for exports but avoid hardcoded bullets
  let text = html.replace(/<\/p>/gi, '\n')
                 .replace(/<\/li>/gi, '\n')
                 .replace(/<li>/gi, '');
  tmp.innerHTML = text;
  return (tmp.textContent || tmp.innerText || "").trim().replace(/\n\s*\n/g, '\n');
};

const joinPoints = (pts) => stripHTMLToText(getHTML(pts)); // for plain-text exports

/* ── Convert Quill v2 HTML to proper nested HTML ──
   Quill stores indented items as flat <li class="ql-indent-N"> in one <ol>.
   We convert to proper nested <ol><li><ol><li>...</li></ol></li></ol>
   so numbering is continuous and sub-points render correctly everywhere. */
const _cleanQuillHTML = (html) => {
  if (!html) return "";

  // Step 1: strip ql-ui spans and normalize data-list attrs
  let clean = html
    .replace(/<span class="ql-ui"><\/span>/gi, "")
    .replace(/<span class="ql-ui"\/>/gi, "");

  // Step 2: extract list type + indent from each li
  const liRegex = /<li([^>]*)>([\s\S]*?)<\/li>/gi;
  const items = [];
  let m;
  while ((m = liRegex.exec(clean)) !== null) {
    const attrs = m[1];
    const content = m[2];
    const isBullet = /data-list="bullet"/.test(attrs);
    const indentMatch = attrs.match(/ql-indent-(\d+)/);
    const indent = indentMatch ? parseInt(indentMatch[1]) : 0;
    items.push({ indent, content, tag: isBullet ? "ul" : "ol" });
  }

  if (!items.length) {
    // No list items — clean up and return as-is
    return clean
      .replace(/\s*data-list="[^"]*"/gi, "")
      .replace(/\s*class="ql-indent-\d+"/gi, "");
  }

  // Step 3: build proper nested structure
  const buildNested = (items, start, level) => {
    let result = "";
    let i = start;
    while (i < items.length) {
      if (items[i].indent < level) break;
      if (items[i].indent === level) {
        let content = items[i].content;
        i++;
        // Check for children at deeper level
        if (i < items.length && items[i].indent > level) {
          const childTag = items[i].tag;
          const child = buildNested(items, i, level + 1);
          content += `<${childTag}>${child.html}</${childTag}>`;
          i = child.nextIdx;
        }
        result += `<li>${content}</li>`;
      } else {
        i++;
      }
    }
    return { html: result, nextIdx: i };
  };

  const rootTag = items[0].tag;
  const { html: nested } = buildNested(items, 0, 0);
  return `<${rootTag}>${nested}</${rootTag}>`;
};

const normalizeQuillListHTML = (html) => {
  if (!html) return "";

  if (typeof document === "undefined") {
    return html
      .replace(/<span class="ql-ui"[^>]*><\/span>/gi, "")
      .replace(/<span class="ql-ui"[^>]*\/>/gi, "")
      .replace(/\s*data-list="[^"]*"/gi, "")
      .replace(/\s*class="ql-indent-\d+"/gi, "");
  }

  const container = document.createElement("div");
  container.innerHTML = html;

  const stripQuillListAttrs = (root) => {
    root.querySelectorAll(".ql-ui").forEach(el => el.remove());
    root.querySelectorAll("li").forEach(li => {
      li.removeAttribute("data-list");
      const classes = (li.getAttribute("class") || "")
        .split(/\s+/)
        .filter(cls => cls && !/^ql-indent-\d+$/.test(cls));
      if (classes.length) li.setAttribute("class", classes.join(" "));
      else li.removeAttribute("class");
    });
  };

  const directListItems = (list) =>
    Array.from(list.children).filter(child => child.tagName === "LI");

  const getIndent = (li) => {
    const match = (li.getAttribute("class") || "").match(/\bql-indent-(\d+)\b/);
    return match ? Number(match[1]) || 0 : 0;
  };

  const getListTag = (li, fallbackTag) =>
    li.getAttribute("data-list") === "bullet" ? "ul" : fallbackTag;

  const itemHtml = (li) => {
    const clone = li.cloneNode(true);
    Array.from(clone.children)
      .filter(child => child.tagName === "OL" || child.tagName === "UL")
      .forEach(child => child.remove());
    stripQuillListAttrs(clone);
    return clone.innerHTML;
  };

  const buildNestedList = (items, fallbackTag) => {
    const root = document.createElement(items[0]?.tag || fallbackTag);
    const listsAtLevel = [root];
    const lastLiAtLevel = [];

    items.forEach(item => {
      let level = item.indent;
      while (level > 0 && !lastLiAtLevel[level - 1]) level -= 1;

      if (level > 0 && !listsAtLevel[level]) {
        const childList = document.createElement(item.tag);
        lastLiAtLevel[level - 1].appendChild(childList);
        listsAtLevel[level] = childList;
      }

      if (level > 0 && listsAtLevel[level].tagName.toLowerCase() !== item.tag) {
        const childList = document.createElement(item.tag);
        lastLiAtLevel[level - 1].appendChild(childList);
        listsAtLevel[level] = childList;
      }

      const li = document.createElement("li");
      li.innerHTML = item.html;
      listsAtLevel[level].appendChild(li);
      lastLiAtLevel[level] = li;
      listsAtLevel.length = level + 1;
      lastLiAtLevel.length = level + 1;
    });

    return root;
  };

  Array.from(container.querySelectorAll("ol, ul")).forEach(list => {
    if (!container.contains(list)) return;
    const listItems = directListItems(list);
    const hasQuillFlatItems = listItems.some(li =>
      li.hasAttribute("data-list") || /\bql-indent-\d+\b/.test(li.getAttribute("class") || "")
    );
    if (!hasQuillFlatItems) return;

    const fallbackTag = list.tagName.toLowerCase();
    const items = listItems.map(li => ({
      indent: getIndent(li),
      tag: getListTag(li, fallbackTag),
      html: itemHtml(li),
    }));
    list.replaceWith(buildNestedList(items, fallbackTag));
  });

  stripQuillListAttrs(container);
  return container.innerHTML;
};

const QUILL_MODULES = {
  toolbar: [
    ['bold', 'italic', 'underline', 'strike'],
    [{ 'color': [] }, { 'background': [] }],
    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
    [{ 'indent': '-1'}, { 'indent': '+1' }],
    ['clean']
  ]
};

/* ── Format date ── */
const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("en-IN", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hour12: true,
  });
};

/* ── Get current user from localStorage ── */
const getCurrentUserObj = () => {
  try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); }
  catch { return {}; }
};

const getCurrentUser = () => {
  const u = getCurrentUserObj();
  return u.name || u.email || u.username || "Unknown";
};

export default function ClausesMaster({ type, initialViewId, initialAction, isActionOnly, onCloseModal }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.TC;
  const { label, desc, prefix, Icon: CfgIcon, iconBg, iconColor, badgeCls, numBg, numColor, borderAccent, headerBg, accentRing } = cfg;
  const actionLabel = type === "TC" ? "T&C" : type === "PAY" ? "Payment Term" : type === "GOV" ? "Government Law" : "Annexure";
  const titlePlaceholder = type === "TC"
    ? "e.g. Standard Terms"
    : type === "PAY"
      ? "e.g. Milestone Payment"
      : type === "GOV"
        ? "e.g. Labour Law"
        : "e.g. Annexure A";

  const [clauses,    setClauses]    = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState("");
  const [filterCat,  setFilterCat]  = useState("");
  const [page,       setPage]       = useState(1);

  const [showModal, setShowModal] = useState(false);
  const [form,      setForm]      = useState(emptyForm);
  const [editId,    setEditId]    = useState(null);
  const [saving,    setSaving]    = useState(false);
  const [toast,     setToast]     = useState(null);

  const [showExport, setShowExport] = useState(false);
  const [showBulk,   setShowBulk]   = useState(false);
  const [bulkRows,   setBulkRows]   = useState([]);
  const [bulkFile,   setBulkFile]   = useState("");
  const [bulkSaving, setBulkSaving] = useState(false);

  /* ── Version history state ── */
  const [historyClause,   setHistoryClause]   = useState(null);
  const [versions,        setVersions]        = useState([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState(null);

  /* ── View clause state ── */
  const [viewClause, setViewClause] = useState(null);

  const bulkRef        = useRef();
  const exportRef      = useRef();
  const textareaRef    = useRef();

  const mkey = type === "TC" ? "term_condition" : type === "PAY" ? "payment_terms" : type === "GOV" ? "government_laws" : "annexure";
  const { isGlobalAdmin, canAdd, canEdit, canDelete, canExport, canBulk } = useModulePermissions(mkey);

  useEffect(() => { fetchAll(); }, [type]);


  const fetchAll = async () => {
    setLoading(true); setPage(1);
    try {
      const [cRes, catRes] = await Promise.all([
        fetch(`${API}/api/procurement/clauses?type=${type}`).then(r => r.json()),
        fetch(`${API}/api/procurement/categories`).then(r => r.json()),
      ]);
      setClauses(cRes.clauses || []);
      setCategories(catRes.categories || []);
    } catch { setClauses([]); }
    setLoading(false);
  };

  useEffect(() => {
    if (initialViewId && clauses.length > 0) {
       const c = clauses.find(x => x.id === initialViewId);
       if (c) {
          if (initialAction === 'edit' && canEdit) openEdit(c);
          else if (initialAction === 'history') openHistory(c);
          else setViewClause(c);
       }
    }
    if (initialAction === 'add' && canAdd) openAdd();
  }, [initialViewId, initialAction, clauses.length]);

  const showToast = (msg, kind = "success") => {
    setToast({ msg, kind });
    setTimeout(() => setToast(null), 3000);
  };

  /* ── Modal open ── */
  const openAdd  = () => { setForm(emptyForm); setEditId(null); setShowModal(true); };
  const openEdit = (c) => {
    setForm({ title: c.title, category: c.category || "", content: getHTML(c.points) });
    setEditId(c.id);
    setShowModal(true);
  };
  const openHistoryEdit = (c, v) => {
    setForm({ title: v.title || c.title, category: v.category || c.category || "", content: getHTML(v.points) });
    setEditId(c.id);
    setShowModal(true);
  };

  /* ── Save ── */
  const handleSave = async () => {
    if (!form.title.trim())        return showToast("Title required", "error");
    const cleanTxt = stripHTMLToText(form.content);
    if (!cleanTxt.trim())          return showToast("Enter at least one point/line", "error");
    setSaving(true);
    try {
      const userObj = getCurrentUserObj();
      const editorName = userObj.name || userObj.email || userObj.username || "Unknown";
      const url    = editId ? `${API}/api/procurement/clauses/${editId}` : `${API}/api/procurement/clauses`;
      const method = editId ? "PUT" : "POST";
      const normalizedContent = normalizeQuillListHTML(normalizeRichTextHtml(form.content));
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({
          type, category: form.category, title: form.title.trim(),
          points: [normalizedContent], editedBy: editorName,
          createdById: userObj.id || "",
          createdByName: userObj.name || "",
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Save failed");
      showToast(editId ? "Updated successfully" : "Clause added");
      setShowModal(false);
      fetchAll();
      if (historyClause) openHistory(historyClause);
      if (isActionOnly && !historyClause && onCloseModal) onCloseModal();
    } catch (err) { showToast(err.message, "error"); }
    setSaving(false);
  };

  const handleDelete = async (id) => {
    if (!confirm("Delete this clause?")) return;
    try {
      await fetch(`${API}/api/procurement/clauses/${id}`, { method: "DELETE" });
      showToast("Deleted"); fetchAll();
    } catch { showToast("Delete failed", "error"); }
  };

  /* ── Version history ── */
  const openHistory = async (c) => {
    setHistoryClause(c);
    setVersions([]);
    setExpandedVersion(null);
    setVersionsLoading(true);
    try {
      const res = await fetch(`${API}/api/procurement/clauses/${c.id}/versions`);
      const data = await res.json();
      setVersions(data.versions || []);
      // Auto-expand latest (last) version
      if (data.versions?.length) setExpandedVersion(data.versions[data.versions.length - 1].version);
    } catch { setVersions([]); }
    setVersionsLoading(false);
  };

  const handleDeleteVersion = async (versionId, e) => {
    e.stopPropagation();
    if (!confirm("Delete this version?")) return;
    try {
      const res = await fetch(`${API}/api/procurement/clauses/versions/${versionId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      showToast("Version deleted");
      openHistory(historyClause);
    } catch {
      showToast("Delete version failed", "error");
    }
  };

  /* ── Bulk ── */
  const downloadTemplate = () => {
    const example = [
      { "Code": `${prefix}-1`, "Category": "Civil", "Title": "Standard Terms", "Point No": "1",   "Content": "First main point" },
      { "Code": `${prefix}-1`, "Category": "Civil", "Title": "Standard Terms", "Point No": "1.1", "Content": "Sub-point of first point" },
      { "Code": `${prefix}-1`, "Category": "Civil", "Title": "Standard Terms", "Point No": "1.2", "Content": "Another sub-point" },
      { "Code": `${prefix}-1`, "Category": "Civil", "Title": "Standard Terms", "Point No": "2",   "Content": "Second main point" },
      { "Code": `${prefix}-1`, "Category": "Civil", "Title": "Standard Terms", "Point No": "3",   "Content": "Third main point" },
      { "Code": `${prefix}-2`, "Category": "Civil", "Title": "Another Clause", "Point No": "1",   "Content": "First point of another clause" },
      { "Code": `${prefix}-2`, "Category": "Civil", "Title": "Another Clause", "Point No": "2",   "Content": "Second point of another clause" },
    ];
    const ws = XLSX.utils.json_to_sheet(example);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    XLSX.writeFile(wb, `${prefix}_template.xlsx`);
  };

  const handleBulkFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setBulkFile(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const wb   = XLSX.read(ev.target.result, { type: "array" });
      const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);

      // Group rows by Code (fallback: Title) — each group = one clause
      const groupMap = new Map();
      data.forEach(r => {
        const code     = String(r["Code"] || "").trim().toUpperCase();
        const title    = String(r["Title"] || "").trim();
        const category = String(r["Category"] || "").trim();
        const content  = String(r["Content"] || "").trim();
        const pointNo  = String(r["Point No"] || "").trim();
        if (!title && !content) return;
        const key = code || title;
        if (!groupMap.has(key)) groupMap.set(key, { code, category, title, items: [] });
        if (content) groupMap.get(key).items.push({ pointNo, content });
      });

      // Build HTML from items — dot notation (1.1, 1.2) → sub-points with ql-indent-1
      const buildHTML = (items) => {
        if (!items.length) return "";
        let html = "<ol>";
        items.forEach(({ pointNo, content }) => {
          const dots = (pointNo.match(/\./g) || []).length; // 0=main, 1=sub, 2=sub-sub
          const indentClass = dots > 0 ? ` class="ql-indent-${dots}"` : "";
          html += `<li${indentClass}>${content}</li>`;
        });
        html += "</ol>";
        return html;
      };

      const rows = Array.from(groupMap.values())
        .filter(g => g.title)
        .map(g => ({
          code:     g.code,
          category: g.category,
          title:    g.title,
          points:   g.items.length ? [normalizeQuillListHTML(buildHTML(g.items))] : [],
        }));
      setBulkRows(rows);
    };
    reader.readAsArrayBuffer(file);
    e.target.value = "";
  };

  const handleBulkSave = async () => {
    if (!bulkRows.length) return showToast("No valid rows", "error");
    setBulkSaving(true);
    try {
      const currentUser = JSON.parse(localStorage.getItem("bms_user") || "{}");
      const res  = await fetch(`${API}/api/procurement/clauses/bulk`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body:   JSON.stringify({ 
          rows: bulkRows, type,
          createdById: currentUser.id || "",
          createdByName: currentUser.name || ""
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bulk failed");
      showToast(`${data.inserted} added, ${data.skipped} skipped`);
      setShowBulk(false); setBulkRows([]); setBulkFile("");
      fetchAll();
    } catch (err) { showToast(err.message, "error"); }
    setBulkSaving(false);
  };

  /* ── Export ── */
  const exportExcel = () => {
    const rows = filtered.map((c, idx) => ({
      "S.No": idx + 1, Code: c.code, Category: c.category || "", Title: c.title,
      Content: joinPoints(c.points),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, type);
    XLSX.writeFile(wb, `${prefix}_${new Date().toISOString().slice(0, 10)}.xlsx`);
    setShowExport(false);
  };

  const exportPDF = () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    doc.setFontSize(14); doc.setFont(undefined, "bold"); doc.text(label, 14, 14);
    doc.setFontSize(9); doc.setFont(undefined, "normal"); doc.setTextColor(100);
    doc.text(`Exported: ${new Date().toLocaleDateString("en-IN")}  ·  Total: ${filtered.length}`, 14, 21);
    doc.setTextColor(0);
    autoTable(doc, {
      startY: 27,
      head:   [["Code", "Category", "Title", "Content"]],
      body:   filtered.map(c => [c.code, c.category || "—", c.title, joinPoints(c.points)]),
      styles:            { fontSize: 8, cellPadding: 3, valign: "top", overflow: "linebreak" },
      headStyles:        { fillColor: [15, 23, 42], textColor: 255, fontStyle: "bold", fontSize: 8 },
      alternateRowStyles:{ fillColor: [248, 250, 252] },
      columnStyles: { 0:{cellWidth:18}, 1:{cellWidth:28}, 2:{cellWidth:50}, 3:{cellWidth:"auto"} },
      margin: { left: 14, right: 14 },
    });
    doc.save(`${prefix}_${new Date().toISOString().slice(0, 10)}.pdf`);
    setShowExport(false);
  };

  /* ── Filter + Paginate ── */
  const uniqueCats = [...new Set(clauses.map(c => c.category).filter(Boolean))].sort();
  const filtered   = clauses.filter(c => {
    const ms = !search    || c.title.toLowerCase().includes(search.toLowerCase()) || c.code.toLowerCase().includes(search.toLowerCase());
    const mc = !filterCat || c.category === filterCat;
    return ms && mc;
  });
  const totalPages = Math.ceil(filtered.length / PER_PAGE) || 1;
  const paginated  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => {
    const h = e => { if (exportRef.current && !exportRef.current.contains(e.target)) setShowExport(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* ══════════ RENDER ══════════ */
  return (
    <div className="p-6 w-full">
      <style>{`
        /* list styles live in index.css */
        
        /* Fixed Toolbar Logic */
        .ql-toolbar.ql-snow {
          border: none !important;
          border-bottom: 1px solid #e2e8f0 !important;
          background: #f8fafc !important;
          position: sticky !important;
          top: 0;
          z-index: 10;
        }
        .ql-container.ql-snow {
          border: none !important;
          height: 320px !important;
        }
        .ql-editor {
          min-height: 100%;
          font-size: 0.875rem;
          color: #334155;
          line-height: 1.6;
        }
        .ql-editor.ql-blank::before {
          color: #94a3b8;
          font-style: normal;
        }
        /* Sub-point numbering — default (alpha) */
        .quill-content ol { padding-left: 1.5em; list-style-type: decimal; }
        .quill-content ol ol { list-style-type: lower-alpha; }
        .quill-content ol ol ol { list-style-type: lower-roman; }
        .quill-content ul { padding-left: 1.5em; list-style-type: disc; }
        .quill-content li { margin-bottom: 2px; }
      `}</style>


      {/* Toast */}
      {toast && (
        <div className={`fixed top-5 right-5 z-[70] px-4 py-3 rounded-xl text-sm font-medium shadow-lg
          ${toast.kind === "error" ? "bg-red-50 text-red-700 border border-red-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
          {toast.msg}
        </div>
      )}

      {/* ══════════════════════════════════
          VERSION HISTORY DRAWER
      ══════════════════════════════════ */}
      {historyClause && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={() => setHistoryClause(null)} />
          <div className="fixed top-0 right-0 h-full w-full max-w-[560px] bg-white z-50 shadow-2xl flex flex-col">

            {/* Drawer Header */}
            <div className={`px-6 py-5 border-b border-slate-100 shrink-0 bg-gradient-to-r ${headerBg}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                    <History size={18} className={iconColor} />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-slate-500 mb-0.5">Version History</p>
                    <h2 className="text-base font-bold text-slate-800 truncate">{historyClause.title}</h2>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${badgeCls}`}>{historyClause.code}</span>
                      {historyClause.category && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">{historyClause.category}</span>
                      )}
                      <span className="text-xs text-slate-400">
                        {versions.length} version{versions.length !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>
                <button type="button" onClick={() => { setHistoryClause(null); if (isActionOnly && onCloseModal) onCloseModal(); }}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 shrink-0 transition-all">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Drawer Body */}
            <div className="flex-1 overflow-y-auto px-4 py-4">
              {versionsLoading ? (
                <div className="py-16 text-center text-slate-400 text-sm">Loading history…</div>
              ) : versions.length === 0 ? (
                <div className="py-16 text-center text-slate-300 text-xs font-semibold uppercase tracking-widest">No version history yet</div>
              ) : (
                <div className="space-y-3">
                  {versions.map((v, idx) => {
                    const isLatest   = idx === versions.length - 1; // last = newest
                    const isExpanded = expandedVersion === v.version;
                    return (
                      <div key={v.id}
                        className={`rounded-2xl border transition-all overflow-hidden
                          ${isLatest ? `border-2 ${accentRing} ring-1 ${accentRing}` : "border-slate-100"}`}>

                        {/* Version Header */}
                        <div
                          onClick={() => setExpandedVersion(isExpanded ? null : v.version)}
                          className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-slate-50 transition-colors text-left cursor-pointer">
                          <div className="flex items-center gap-3 min-w-0 flex-1">
                            {/* Version badge */}
                            <div className={`shrink-0 w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm
                              ${isLatest ? `${numBg} ${numColor}` : "bg-slate-100 text-slate-500"}`}>
                              V{idx + 1}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {isLatest && (
                                  <span className={`flex items-center gap-1 text-xs font-bold ${numColor}`}>
                                    <CheckCircle size={11} /> Current
                                  </span>
                                )}
                                {v.version === 1 && !isLatest && (
                                  <span className="text-xs text-slate-400 font-medium">Original</span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                <span className="flex items-center gap-1 text-xs text-slate-600">
                                  <User size={10} className="text-slate-400" />
                                  <span className="font-semibold">{v.editedBy}</span>
                                </span>
                                <span className="flex items-center gap-1 text-xs text-slate-400">
                                  <Clock size={10} />
                                  {fmtDate(v.editedAt)}
                                </span>
                              </div>
                              {/* Title if different */}
                              <p className="text-xs text-slate-500 truncate mt-0.5">{v.title}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0 ml-2">
                            {isActionOnly && (
                              <button 
                                onClick={(e) => { 
                                  e.stopPropagation(); 
                                  console.log("Applying points:", v.points);
                                  onCloseModal(v.points); 
                                }} 
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border font-bold text-[10px] uppercase tracking-wider transition-all
                                  ${isLatest 
                                    ? "bg-emerald-50 border-emerald-200 text-emerald-600 hover:bg-emerald-100" 
                                    : "bg-indigo-50 border-indigo-200 text-indigo-600 hover:bg-indigo-100"}`}
                                title="Apply this specific version to the order">
                                <CheckCircle size={12} /> Apply
                              </button>
                            )}
                            {canEdit && (
                              <button onClick={(e) => { e.stopPropagation(); openHistoryEdit(historyClause, v); }}
                                className="p-1 px-2 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all border border-transparent hover:border-indigo-100"
                                title="Edit this Version">
                                <Pencil size={14} />
                              </button>
                            )}
                            {canDelete && (
                              <button onClick={(e) => handleDeleteVersion(v.id, e)} className="p-1 px-2 rounded-lg text-red-400 hover:text-red-700 hover:bg-red-50 transition-all border border-transparent hover:border-red-100" title="Delete Version">
                                <Trash2 size={14} />
                              </button>
                            )}
                            <ChevronRight size={15} className={`text-slate-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                          </div>
                        </div>

                        {/* Expanded Content */}
                        {isExpanded && (
                          <div className="px-4 pb-4 border-t border-slate-100 bg-slate-50/50">
                            {v.category && (
                              <p className="text-xs text-slate-400 mt-3 mb-2">
                                Category: <span className="font-semibold text-slate-600">{v.category}</span>
                              </p>
                            )}
                            <div className="quill-content text-sm text-slate-700 leading-relaxed mt-3" dangerouslySetInnerHTML={{ __html: normalizeQuillListHTML(getHTML(v.points)) }} />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Drawer Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between">
              <p className="text-xs text-slate-400">
                {versions.length > 0 ? `Last edited by ${versions[versions.length - 1]?.editedBy}` : "No edits yet"}
              </p>
              <button type="button" onClick={() => { setHistoryClause(null); if (isActionOnly && onCloseModal) onCloseModal(); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-all">
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {!isActionOnly && (
        <div className="p-3 sm:p-4 lg:p-6 w-full pb-32">
          {/* ── HEADER ── */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center`}>
            <CfgIcon size={20} className={iconColor} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-800">{label}</h1>
            <p className="text-sm text-slate-400">{desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap sm:justify-end">
          {canExport && (
          <div className="relative" ref={exportRef}>
            <button onClick={() => { setShowExport(s => !s); setShowBulk(false); }}
              className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
              <Download size={14} /> Export <ChevronDown size={12} />
            </button>
            {showExport && (
              <div className="absolute right-0 top-full mt-1 z-20 bg-white rounded-xl shadow-lg border border-slate-100 py-1 min-w-36">
                <button onClick={exportExcel} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  <FileSpreadsheet size={14} className="text-green-600" /> Excel (.xlsx)
                </button>
                <button onClick={exportPDF} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
                  <FileText size={14} className="text-red-500" /> PDF
                </button>
              </div>
            )}
          </div>
          )}
          {canBulk && (
          <button onClick={() => { setShowBulk(s => !s); setShowExport(false); }}
            className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium hover:bg-slate-50 transition-all">
            <Upload size={14} /> Bulk Upload
          </button>
          )}
          {canAdd && (
          <button onClick={openAdd}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all">
            <Plus size={15} /> Add {actionLabel}
          </button>
          )}
        </div>
      </div>

      {/* ── BULK PANEL ── */}
      {showBulk && (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5 mb-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-bold text-slate-700">Bulk Upload — {label}</h3>
            <button onClick={() => { setShowBulk(false); setBulkRows([]); setBulkFile(""); }} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
          </div>
          <p className="text-xs text-slate-500 mb-4 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            💡 The Excel file must contain <strong>Category</strong>, <strong>Title</strong>, and <strong>Content</strong> columns.
            Write one or more lines in the Content column — each line becomes a separate point.
          </p>
          <div className="flex flex-wrap gap-3">
            <button onClick={downloadTemplate}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">
              <FileSpreadsheet size={14} className="text-green-600" /> Download Template
            </button>
            <button onClick={() => bulkRef.current.click()}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-all">
              <Upload size={14} /> {bulkFile || "Choose .xlsx file"}
            </button>
            <input ref={bulkRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleBulkFile} />
          </div>
          {bulkRows.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-600 mb-2">{bulkRows.length} clauses ready to upload</p>
              <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-50">
                {bulkRows.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-slate-50 text-xs text-slate-600">
                    <span className="font-mono text-slate-400 w-5 shrink-0">{i + 1}</span>
                    <span className="font-semibold flex-1 truncate">{r.title}</span>
                    {r.category && <span className="text-slate-400 shrink-0">{r.category}</span>}
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold ${numBg} ${numColor}`}>{r.points.length} pts</span>
                  </div>
                ))}
              </div>
              <button onClick={handleBulkSave} disabled={bulkSaving}
                className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 disabled:opacity-50 transition-all">
                <Upload size={14} /> {bulkSaving ? "Uploading…" : `Upload ${bulkRows.length} Clauses`}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── SEARCH + FILTER ── */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }}
            placeholder="Search by code or title…"
            className="w-full pl-9 pr-4 h-10 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-700" />
        </div>
        <div className="relative">
          <select value={filterCat} onChange={e => { setFilterCat(e.target.value); setPage(1); }}
            className="h-10 pl-3 pr-8 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-600 min-w-44 appearance-none cursor-pointer">
            <option value="">All Categories</option>
            {uniqueCats.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        {filterCat && (
          <button onClick={() => { setFilterCat(""); setPage(1); }}
            className="h-10 flex items-center gap-1.5 px-3 rounded-xl border border-slate-200 text-sm text-slate-500 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all bg-white">
            <X size={13} /> Clear
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{filtered.length} clause{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* ── CARDS GRID ── */}
      {loading ? (
        <div className="py-20 text-center text-slate-300 font-semibold uppercase tracking-widest text-xs">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center text-slate-300 font-semibold uppercase tracking-widest text-xs">No clauses found</div>
      ) : (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-5">
            {paginated.map((c) => (
              <div key={c.id}
                className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden border-l-4 ${borderAccent} ${["TC", "ANX"].includes(type) ? 'xl:col-span-2' : ''} flex flex-col h-[220px]`}>

                {/* Card Header */}
                <div className={`px-5 py-3.5 bg-gradient-to-r ${headerBg} border-b border-slate-100 flex items-center justify-between gap-3`}>
                  <div className="flex items-center gap-2 min-w-0 flex-1 flex-wrap">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold shrink-0 ${badgeCls}`}>{c.code}</span>
                    {c.category && (
                      <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium shrink-0">{c.category}</span>
                    )}
                    <span className="text-sm font-bold text-slate-800 truncate">{c.title}</span>
                  </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {/* View full content */}
                      <button onClick={() => setViewClause(c)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-all" title="View full content">
                        <Eye size={14} />
                      </button>
                      {/* Version history */}
                      <button onClick={() => openHistory(c)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50 transition-all" title="Version history">
                        <History size={14} />
                      </button>
                      {canEdit && (
                        <button onClick={() => openEdit(c)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white/80 transition-all" title="Edit">
                          <Pencil size={14} />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => handleDelete(c.id)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all" title="Delete">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                </div>

                {/* Card Content */}
                <div className="px-5 py-4 flex-1 min-h-0 overflow-hidden">
                  {c.points.length === 0 ? (
                    <p className="text-xs text-slate-300 italic">No content</p>
                  ) : (
                    <div className="quill-content text-sm text-slate-700 leading-relaxed max-w-none" dangerouslySetInnerHTML={{ __html: normalizeQuillListHTML(getHTML(c.points)) }} />
                  )}
                </div>

                {/* Card Footer */}
                <div className="px-5 py-2.5 border-t border-slate-50 bg-slate-50/50 flex items-center justify-between shrink-0">
                  <span className="text-xs text-slate-400">
                    {c.points.length} point{c.points.length !== 1 ? "s" : ""}
                  </span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setViewClause(c)}
                      className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 transition-colors font-medium">
                      <Eye size={11} /> View
                    </button>
                    <button onClick={() => openHistory(c)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-violet-600 transition-colors font-medium">
                      <History size={11} /> History
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1 mt-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">‹ Prev</button>
              {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                let n;
                if (totalPages <= 7)             n = i + 1;
                else if (page <= 4)              n = i + 1;
                else if (page >= totalPages - 3) n = totalPages - 6 + i;
                else                             n = page - 3 + i;
                return (
                  <button key={n} onClick={() => setPage(n)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                      ${page === n ? "bg-slate-900 text-white border-slate-900" : "text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
                    {n}
                  </button>
                );
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 disabled:opacity-30 transition-all">Next ›</button>
            </div>
          )}
        </>
      )}
      </div>
      )}

      {/* ══════════════════════════════
          VIEW CLAUSE MODAL
      ══════════════════════════════ */}
      {viewClause && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40 backdrop-blur-sm" onClick={() => setViewClause(null)} />
          <div className="fixed top-0 right-0 h-full w-full max-w-[560px] bg-white z-50 shadow-2xl flex flex-col">
            {/* Header */}
            <div className={`px-6 py-5 border-b border-slate-100 shrink-0 bg-gradient-to-r ${headerBg}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={`w-10 h-10 rounded-xl ${iconBg} flex items-center justify-center shrink-0`}>
                    <CfgIcon size={18} className={iconColor} />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${badgeCls}`}>{viewClause.code}</span>
                      {viewClause.category && (
                        <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium">{viewClause.category}</span>
                      )}
                    </div>
                    <h2 className="text-base font-bold text-slate-800 leading-snug">{viewClause.title}</h2>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {viewClause.points.length} point{viewClause.points.length !== 1 ? "s" : ""} · {label}
                    </p>
                  </div>
                </div>
                <button type="button" onClick={() => { setViewClause(null); if (isActionOnly && onCloseModal) onCloseModal(); }}
                  className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 shrink-0">
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Content — scrollable */}
            <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 py-6">
              <div className="quill-content text-sm text-slate-700 leading-relaxed max-w-none" dangerouslySetInnerHTML={{ __html: normalizeQuillListHTML(getHTML(viewClause.points)) }} />
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0 flex items-center gap-2">
              {canEdit && (
                <button type="button" onClick={() => { setViewClause(null); openEdit(viewClause); }}
                  className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-900 text-white text-sm font-medium hover:bg-slate-700 transition-all">
                  <Pencil size={13} /> Edit
                </button>
              )}
              <button type="button" onClick={() => { setViewClause(null); openHistory(viewClause); }}
                className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-100 transition-all">
                <History size={13} /> History
              </button>
              <button type="button" onClick={() => { setViewClause(null); if (isActionOnly && onCloseModal) onCloseModal(); }}
                className="ml-auto px-4 py-2 rounded-xl border border-slate-200 text-slate-500 text-sm font-medium hover:bg-slate-100 transition-all">
                Close
              </button>
            </div>
          </div>
        </>
      )}

      {/* ══════════════════════════════
          ADD / EDIT MODAL
      ══════════════════════════════ */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg ${iconBg} flex items-center justify-center`}>
                  <CfgIcon size={15} className={iconColor} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-800">
                    {editId ? "Edit" : "Add"} {actionLabel}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {editId ? "A new version will be saved automatically" : `Code auto-generated (${prefix}-XXX)`}
                  </p>
                </div>
              </div>
              <button type="button" onClick={() => { setShowModal(false); if (isActionOnly && onCloseModal) onCloseModal(); }} className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">
                    Title <span className="text-red-400">*</span>
                  </label>
                  <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder={titlePlaceholder}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-slate-400 text-slate-700" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Category</label>
                  <div className="relative">
                    <select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
                      className="w-full h-[42px] pl-3 pr-8 rounded-xl border border-slate-200 text-sm outline-none focus:border-slate-400 bg-white text-slate-700 appearance-none cursor-pointer">
                      <option value="">— No category —</option>
                      {categories.map(c => <option key={c.id} value={c.categoryName}>{c.categoryName}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Content <span className="text-red-400">*</span>
                </label>
                <div className="mb-2 px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl flex items-start gap-2">
                  <span className="text-base">💡</span>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Use the toolbar to bold text, add colors, or create standard and nested lists. Nested list items appear as a, b, c…
                  </p>
                </div>
                <div className="bg-white rounded-xl border border-slate-200 quill-content">
                  <ReactQuill
                    theme="snow"
                    value={form.content}
                    onChange={(val) => setForm(f => ({ ...f, content: val }))}
                    modules={QUILL_MODULES}
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
              <p className="text-xs text-slate-400 flex items-center gap-1">
                <User size={11} /> Saving as: <span className="font-semibold text-slate-600 ml-1">{getCurrentUser()}</span>
              </p>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => { setShowModal(false); if (isActionOnly && onCloseModal) onCloseModal(); }}
                  className="px-4 py-2 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-200 transition-all">
                  Cancel
                </button>
                <button type="button" onClick={handleSave} disabled={saving}
                  className="px-5 py-2 rounded-xl text-sm font-semibold bg-slate-900 text-white hover:bg-slate-700 transition-all disabled:opacity-50">
                  {saving ? "Saving…" : editId ? "Update & Save Version" : "Add Clause"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
