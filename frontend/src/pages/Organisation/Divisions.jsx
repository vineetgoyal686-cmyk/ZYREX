import React, { useState, useEffect, useRef } from "react";
import { Search, Edit2, Trash2, X, Loader2 } from "lucide-react";
import { StatusBadge } from "./helpers";

const STORAGE_KEY = "bms_org_divisions";

const load = () => {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); } catch { return []; }
};
const save = (data) => localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

const nextId = (arr) => {
  const nums = arr.map(d => parseInt((d.div_id || "DIV-000").replace("DIV-", ""), 10)).filter(Boolean);
  return `DIV-${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
};

function Modal({ item, onClose, onSaved }) {
  const [form, setForm] = useState(item ? { name: item.name, status: item.status } : { name: "", status: "active" });
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save_ = () => {
    if (!form.name.trim()) { setErr("Name is required"); return; }
    onSaved(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded border border-slate-200 w-full max-w-sm p-6 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <p className="text-[15px] font-bold text-slate-800">{item ? "Edit Division" : "Add Division"}</p>
          <button onClick={onClose}><X size={16} className="text-slate-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Division Name *</label>
            <input value={form.name} onChange={e => set("name", e.target.value)} autoFocus
              className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
              placeholder="e.g. Engineering" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 block mb-1">Status</label>
            <select value={form.status} onChange={e => set("status", e.target.value)}
              className="w-full border border-slate-200 rounded px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20viewBox%3D%220%200%2012%2012%22%3E%3Cpath%20fill%3D%22%2394a3b8%22%20d%3D%22M6%208L1%203h10z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[right_0.75rem_center]">
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>
        </div>
        {err && <p className="text-red-500 text-xs mt-3">{err}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <button onClick={onClose} className="px-4 py-2 text-sm border border-slate-200 rounded text-slate-600 hover:bg-slate-50">Cancel</button>
          <button onClick={save_} className="px-4 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700">
            {item ? "Save Changes" : "Add Division"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function Divisions({ actionsRef, onChange }) {
  const [divs, setDivs] = useState(load);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null);

  const persist = (data) => { setDivs(data); save(data); onChange?.(data); };

  useEffect(() => {
    if (actionsRef) actionsRef.current = { openAdd: () => setModal("add") };
    return () => { if (actionsRef) actionsRef.current = {}; };
  });

  const handleSaved = (form) => {
    if (modal === "add") {
      persist([...divs, { id: Date.now(), div_id: nextId(divs), name: form.name, status: form.status }]);
    } else {
      persist(divs.map(d => d.id === modal.id ? { ...d, ...form } : d));
    }
    setModal(null);
  };

  const del = (id) => {
    if (!window.confirm("Delete this division?")) return;
    persist(divs.filter(d => d.id !== id));
  };

  const rows = divs.filter(d => d.name?.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div className="bg-white rounded border border-slate-200 overflow-hidden">
        <div className="flex items-center px-5 py-3.5 border-b border-slate-100">
          <div className="relative">
            <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search divisions…"
              className="pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded bg-slate-50 w-52 focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
        </div>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-[11px] uppercase tracking-wide text-slate-500" style={{ background: "rgb(243,243,245)" }}>
              <th className="px-4 py-3 text-left font-semibold w-14">S.No</th>
              <th className="px-4 py-3 text-left font-semibold w-28">Div ID</th>
              <th className="px-4 py-3 text-left font-semibold">Division Name</th>
              <th className="px-4 py-3 text-center font-semibold w-28">Status</th>
              <th className="px-4 py-3 text-right font-semibold w-20">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400 text-xs">
                {search ? "No divisions match your search" : "No divisions yet — add one above"}
              </td></tr>
            ) : rows.map((d, i) => (
              <tr key={d.id} className="hover:bg-slate-50 transition-colors">
                <td className="px-4 py-3 text-slate-400 text-xs">{i + 1}</td>
                <td className="px-4 py-3"><span className="text-slate-500 text-[13px]">{d.div_id}</span></td>
                <td className="px-4 py-3 font-semibold text-slate-800">{d.name}</td>
                <td className="px-4 py-3 text-center"><StatusBadge active={d.status === "active"} /></td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button onClick={() => setModal(d)} className="p-1.5 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"><Edit2 size={13} /></button>
                    <button onClick={() => del(d.id)} className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {modal && <Modal item={modal === "add" ? null : modal} onClose={() => setModal(null)} onSaved={handleSaved} />}
    </>
  );
}

export { load as loadDivisions };
