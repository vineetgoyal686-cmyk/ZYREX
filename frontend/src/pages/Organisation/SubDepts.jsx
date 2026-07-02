import React, { useState, useEffect, useRef } from "react";
import { Search, Edit2, Trash2, X, Loader2, Users, ChevronDown, Check } from "lucide-react";
import { StatusBadge } from "./helpers";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

const API   = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TOKEN = () => localStorage.getItem("bms_token") || "";

const SEL = "w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center]";
const INP  = "w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400";
const LBL  = "text-xs font-semibold text-slate-600 block mb-1";

const ini = n => (n || "?").split(" ").map(w => w[0]).join("").toUpperCase().slice(0, 2);
const COLORS = ["bg-blue-100 text-blue-700", "bg-violet-100 text-violet-700", "bg-emerald-100 text-emerald-700", "bg-amber-100 text-amber-700", "bg-rose-100 text-rose-700"];
const avatarColor = (name = "") => { let h = 0; for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffff; return COLORS[h % COLORS.length]; };

function Avatar({ name, size = 24 }) {
  return (
    <div className={`rounded-full flex items-center justify-center font-semibold shrink-0 text-[11px] ${avatarColor(name)}`}
      style={{ width: size, height: size }}>
      {ini(name)}
    </div>
  );
}

/* ── Multi-select dropdown for members ─────────── */
function MemberSelect({ users, selected, onChange }) {
  const [open, setOpen] = useState(false);
  const [q, setQ]       = useState("");
  const ref             = useRef(null);

  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const filtered = users.filter(u => u.name?.toLowerCase().includes(q.toLowerCase()));
  const toggle   = (id) => onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  const names    = selected.map(id => users.find(u => u.id === id)?.name).filter(Boolean);

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen(v => !v)}
        className="w-full border border-slate-200 rounded px-3 py-2 text-sm text-left flex items-center justify-between focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white">
        <span className={names.length ? "text-slate-800" : "text-slate-400"}>
          {names.length ? `${names.length} member${names.length > 1 ? "s" : ""} selected` : "Select members"}
        </span>
        <ChevronDown size={13} className="text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="absolute z-50 top-full mt-1 w-full bg-white border border-slate-200 rounded shadow-lg">
          <div className="p-2 border-b border-slate-100">
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search…"
              className="w-full border border-slate-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div className="max-h-44 overflow-y-auto">
            {filtered.length === 0
              ? <p className="px-3 py-2 text-xs text-slate-400">No employees found</p>
              : filtered.map(u => (
                <button key={u.id} type="button" onClick={() => toggle(u.id)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 hover:bg-slate-50 transition-colors text-left">
                  <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selected.includes(u.id) ? "border-blue-600 bg-blue-600" : "border-slate-300"}`}>
                    {selected.includes(u.id) && <Check size={10} className="text-white" strokeWidth={3} />}
                  </div>
                  <Avatar name={u.name} size={22} />
                  <div className="min-w-0">
                    <p className="text-[12px] font-medium text-slate-800 truncate">{u.name}</p>
                    {u.designation && <p className="text-[11px] text-slate-400 truncate">{u.designation}</p>}
                  </div>
                </button>
              ))}
          </div>
          {selected.length > 0 && (
            <div className="p-2 border-t border-slate-100">
              <button type="button" onClick={() => onChange([])} className="text-xs text-red-500 hover:text-red-600">Clear all</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Team Modal ─────────────────────────────────── */
function TeamModal({ item, depts, users, onClose, onSaved }) {
  const [form, setForm] = useState(
    item
      ? { name: item.name, department_id: item.department_id || "", leader_id: item.leader_id || "", member_ids: item.member_ids || [], status: item.status || "active" }
      : { name: "", department_id: "", leader_id: "", member_ids: [], status: "active" }
  );
  const [err, setErr]     = useState("");
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.department_id) { setErr("Please select a department"); return; }
    if (!form.name.trim())   { setErr("Team name is required"); return; }
    setSaving(true); setErr("");
    try {
      const url    = item ? `${API}/api/teams/${item.id}` : `${API}/api/teams`;
      const method = item ? "PUT" : "POST";
      const res    = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
        body: JSON.stringify({ ...form, leader_id: form.leader_id || null }),
      });
      const json = await res.json();
      if (!res.ok) { setErr(json.error || "Failed to save"); return; }
      onSaved(json.team);
    } catch { setErr("Network error"); }
    finally { setSaving(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded border border-slate-200 w-full max-w-md p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="text-[15px] font-bold text-slate-800">{item ? "Edit Team" : "Add Team"}</p>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className={LBL}>Department *</label>
            <select value={form.department_id} onChange={e => set("department_id", e.target.value)} className={SEL}>
              <option value="">— Select Department —</option>
              {depts.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Team Name *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} autoFocus className={INP} placeholder="e.g. Frontend Engineering" />
          </div>
          <div>
            <label className={LBL}>Team Leader</label>
            <select value={form.leader_id} onChange={e => set("leader_id", e.target.value)} className={SEL}>
              <option value="">— Select Leader —</option>
              {users.map(u => <option key={u.id} value={u.id}>{u.name}{u.designation ? ` — ${u.designation}` : ""}</option>)}
            </select>
          </div>
          <div>
            <label className={LBL}>Members</label>
            <MemberSelect users={users} selected={form.member_ids} onChange={v => set("member_ids", v)} />
          </div>
          <div>
            <label className={LBL}>Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)} className={SEL}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        {err && <p className="text-red-500 text-xs mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
            {saving && <Loader2 size={13} className="animate-spin" />}
            {item ? "Save Changes" : "Add Team"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main ───────────────────────────────────────── */
export default function SubDepts({ actionsRef, onChange }) {
  const [teams,    setTeams]    = useState([]);
  const [depts,    setDepts]    = useState([]);
  const [users,    setUsers]    = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [deleting, setDeleting] = useState(null);
  const [search,   setSearch]   = useState("");
  const [modal,    setModal]    = useState(null);
  const [importing, setImporting] = useState(false);
  const importRef = useRef(null);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [tRes, dRes, uRes] = await Promise.all([
        fetch(`${API}/api/teams`,       { headers: { Authorization: `Bearer ${TOKEN()}` } }),
        fetch(`${API}/api/departments`, { headers: { Authorization: `Bearer ${TOKEN()}` } }),
        fetch(`${API}/api/users`,       { headers: { Authorization: `Bearer ${TOKEN()}` } }),
      ]);
      const [tJson, dJson, uJson] = await Promise.all([tRes.json(), dRes.json(), uRes.json()]);
      setTeams(tJson.teams       || []);
      setDepts(dJson.departments || []);
      setUsers(uJson.users       || []);
    } catch { }
    finally { setLoading(false); }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { onChange?.(teams); }, [teams]);

  /* ── actionsRef wiring ── */
  useEffect(() => {
    if (!actionsRef) return;
    actionsRef.current = {
      openAdd:          () => setModal("add"),
      exportExcel:      exportExcel,
      exportPDF:        exportPDF,
      downloadTemplate: downloadTemplate,
      openUpload:       () => importRef.current?.click(),
    };
    return () => { actionsRef.current = {}; };
  });

  const handleSaved = (team) => {
    setTeams(prev => {
      const updated = prev.find(t => t.id === team.id)
        ? prev.map(t => t.id === team.id ? team : t)
        : [...prev, team];
      onChange?.(updated);
      return updated;
    });
    setModal(null);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this team?")) return;
    setDeleting(id);
    try {
      await fetch(`${API}/api/teams/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${TOKEN()}` } });
      setTeams(prev => { const next = prev.filter(t => t.id !== id); onChange?.(next); return next; });
    } catch { }
    finally { setDeleting(null); }
  };

  const rows = teams.filter(t =>
    t.name?.toLowerCase().includes(search.toLowerCase()) ||
    depts.find(d => d.id === t.department_id)?.name?.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Export Excel ── */
  const exportExcel = () => {
    const data = rows.map((t, i) => {
      const dept    = depts.find(d => d.id === t.department_id);
      const leader  = users.find(u => u.id === t.leader_id);
      const members = (t.member_ids || []).length;
      return {
        "#":           i + 1,
        "Team ID":     t.team_id || "",
        "Team Name":   t.name,
        "Department":  dept?.name || "",
        "Team Leader": leader?.name || "",
        "Members":     members,
        "Status":      t.status === "active" ? "Active" : "Inactive",
      };
    });
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = [{ wch: 5 }, { wch: 12 }, { wch: 26 }, { wch: 22 }, { wch: 22 }, { wch: 10 }, { wch: 12 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Teams");
    XLSX.writeFile(wb, "teams.xlsx");
  };

  /* ── Export PDF ── */
  const exportPDF = () => {
    const doc   = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    doc.setFontSize(16); doc.setFont("helvetica", "bold"); doc.setTextColor(30, 41, 59);
    doc.text("Teams", 14, 16);
    doc.setFontSize(9); doc.setFont("helvetica", "normal"); doc.setTextColor(100, 116, 139);
    doc.text(`Total: ${rows.length}  |  ${new Date().toLocaleDateString("en-IN")}`, 14, 23);
    doc.setDrawColor(226, 232, 240); doc.setLineWidth(0.4); doc.line(14, 26, pageW - 14, 26);
    autoTable(doc, {
      startY: 30,
      head: [["#", "Team ID", "Team Name", "Department", "Team Leader", "Members", "Status"]],
      body: rows.map((t, i) => {
        const dept   = depts.find(d => d.id === t.department_id);
        const leader = users.find(u => u.id === t.leader_id);
        return [i + 1, t.team_id || "—", t.name, dept?.name || "—", leader?.name || "—", (t.member_ids || []).length, t.status === "active" ? "Active" : "Inactive"];
      }),
      styles: { fontSize: 8.5, cellPadding: 3, lineColor: [203, 213, 225], lineWidth: 0.3, textColor: [51, 65, 85] },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: { 0: { halign: "center", cellWidth: 12 }, 5: { halign: "center", cellWidth: 20 }, 6: { halign: "center", cellWidth: 22 } },
      didDrawPage: (d) => {
        doc.setFontSize(7); doc.setTextColor(148, 163, 184);
        doc.text(`Page ${d.pageNumber}`, pageW - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" });
      },
    });
    doc.save("teams.pdf");
  };

  /* ── Download Template ── */
  const downloadTemplate = () => {
    const deptNames = depts.map(d => d.name).join(", ") || "IT Department, HR Department";
    const ws = XLSX.utils.aoa_to_sheet([
      ["Team Name", "Department", "Status"],
      ["Frontend Team", depts[0]?.name || "IT Department", "Active"],
      ["", "", ""],
      [`Valid status: Active / Inactive`, `Valid departments: ${deptNames}`, ""],
    ]);
    ws["!cols"] = [{ wch: 28 }, { wch: 28 }, { wch: 16 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Teams");
    XLSX.writeFile(wb, "teams_template.xlsx");
  };

  /* ── Bulk Import ── */
  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const rawRows  = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
      const parsed   = rawRows
        .map(r => {
          const deptName = String(r["Department"] || r["department"] || "").trim();
          const dept     = depts.find(d => d.name.toLowerCase() === deptName.toLowerCase());
          return {
            name:          String(r["Team Name"] || r["name"] || "").trim(),
            department_id: dept?.id || null,
            status:        String(r["Status"] || "active").toLowerCase().includes("inactive") ? "inactive" : "active",
            member_ids:    [],
          };
        })
        .filter(r => r.name && r.department_id);

      if (!parsed.length) { alert("No valid rows found.\nMake sure columns are: Team Name, Department (must match existing), Status"); return; }

      let imported = 0, failed = 0;
      for (const row of parsed) {
        const res = await fetch(`${API}/api/teams`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${TOKEN()}` },
          body: JSON.stringify(row),
        });
        if (res.ok) imported++; else failed++;
      }
      await loadAll();
      alert(`${imported} team(s) imported${failed ? `, ${failed} failed (check department names)` : ""}.`);
    } catch {
      alert("Failed to read file. Please use the template format.");
    } finally {
      setImporting(false);
      e.target.value = "";
    }
  };

  return (
    <>
      {importing && (
        <div className="fixed inset-0 z-[100] bg-black/40 flex items-center justify-center">
          <div className="bg-white rounded px-10 py-8 shadow-2xl flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-slate-700 font-semibold text-sm">Importing teams…</p>
          </div>
        </div>
      )}

      <input ref={importRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleImport} />

      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        <div className="flex items-center px-5 py-3.5 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search teams…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 w-52 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        </div>

        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500" style={{ background: "rgb(243,243,245)" }}>
              <th className="px-4 py-3 text-left font-semibold w-12">S.No</th>
              <th className="px-4 py-3 text-left font-semibold w-28">Team ID</th>
              <th className="px-4 py-3 text-left font-semibold">Team Name</th>
              <th className="px-4 py-3 text-left font-semibold">Department</th>
              <th className="px-4 py-3 text-left font-semibold">Team Leader</th>
              <th className="px-4 py-3 text-left font-semibold w-28">Members</th>
              <th className="px-4 py-3 text-center font-semibold w-28">Status</th>
              <th className="px-4 py-3 text-right font-semibold w-20">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-xs">
                <Loader2 size={16} className="animate-spin inline mr-2" />Loading…
              </td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-8 text-center text-slate-400 text-xs">
                {search ? "No teams match your search" : "No teams yet — add one above"}
              </td></tr>
            ) : rows.map((t, i) => {
              const dept    = depts.find(d => d.id === t.department_id);
              const leader  = users.find(u => u.id === t.leader_id);
              const members = (t.member_ids || []).map(id => users.find(u => u.id === id)).filter(Boolean);
              return (
                <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                  <td className="px-4 py-3"><span className="text-slate-500 text-[13px]">{t.team_id || "—"}</span></td>
                  <td className="px-4 py-3 font-semibold text-slate-800">{t.name}</td>
                  <td className="px-4 py-3 text-slate-600 text-[13px]">{dept?.name || <span className="text-slate-300">—</span>}</td>
                  <td className="px-4 py-3">
                    {leader
                      ? <div className="flex items-center gap-1.5">
                          <Avatar name={leader.name} size={22} />
                          <span className="text-[13px] text-slate-700">{leader.name}</span>
                        </div>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    {members.length > 0
                      ? <div className="flex items-center gap-1">
                          <div className="flex -space-x-1.5">
                            {members.slice(0, 3).map(m => <Avatar key={m.id} name={m.name} size={22} />)}
                          </div>
                          <span className="text-[12px] text-slate-500 ml-1">{members.length}</span>
                        </div>
                      : <span className="text-slate-300">—</span>}
                  </td>
                  <td className="px-4 py-3 text-center"><StatusBadge active={t.status === "active"} /></td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setModal(t)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDelete(t.id)} disabled={deleting === t.id}
                        className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                        {deleting === t.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {modal && (
        <TeamModal
          item={modal === "add" ? null : modal}
          depts={depts}
          users={users}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
    </>
  );
}

export const loadSubDepts = () => [];
