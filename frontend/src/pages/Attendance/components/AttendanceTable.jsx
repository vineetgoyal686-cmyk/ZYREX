import React, { useState, useMemo } from "react";
import ExportDropdown from "./ExportDropdown";
import { isLate, isPresent, parseDateStr } from "../utils";

const PER_PAGE = 20;

const AttendanceTable = ({ records, columns, filters, statusFilter, onEdit, onDelete, showActions = true, showRowNum = true, exportFilename = "Report" }) => {
  const [search, setSearch] = useState("");
  const [fv, setFv] = useState({});
  const [page, setPage] = useState(1);
  const [jumpInput, setJumpInput] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

          const filtered = useMemo(() => {
            let r = [...records];
            if (statusFilter && statusFilter !== "all") {
              const lowerStatusFilter = statusFilter.toLowerCase();
              if (lowerStatusFilter === "late") r = r.filter(x => isPresent(x.status) && isLate(x));
              else if (lowerStatusFilter === "present") r = r.filter(x => isPresent(x.status) && !isLate(x));
              else r = r.filter(x => (x.status || "").toLowerCase() === lowerStatusFilter);
            }
            if (search.trim()) { const q = search.toLowerCase(); r = r.filter(x => x.name?.toLowerCase().includes(q) || x.designation?.toLowerCase().includes(q) || x.department?.toLowerCase().includes(q)); }
            Object.entries(fv).forEach(([k, v]) => {
              if (!v || v === "all") return;
              if (k === "status" && v.toLowerCase() === "late") r = r.filter(x => isPresent(x.status) && isLate(x));
              else r = r.filter(x => (x[k]||"").toString().toLowerCase() === v.toLowerCase());
            });
            if (dateFrom || dateTo) {
              r = r.filter(x => {
                const clean = String(x.date||"").split("T")[0].split(" ")[0];
                const d = parseDateStr(clean);
                if (!d) return false;
                const t = d.getTime();
                if (dateFrom && t < new Date(dateFrom + "T00:00:00").getTime()) return false;
                if (dateTo   && t > new Date(dateTo   + "T23:59:59").getTime()) return false;
                return true;
              });
            }
            // Sort by date ascending
            r.sort((a, b) => {
              const parse = (s) => {
                if (!s) return 0;
                // ISO format: "2024-12-20" — directly sortable
                if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(s).getTime();
                // Legacy "DD-Mon-YY" format
                const p = s.split("-");
                if (p.length !== 3) return 0;
                const MON = {Jan:0,Feb:1,Mar:2,Apr:3,May:4,Jun:5,Jul:6,Aug:7,Sep:8,Oct:9,Nov:10,Dec:11};
                return new Date(2000 + parseInt(p[2]), MON[p[1]] ?? 0, parseInt(p[0])).getTime();
              };
              return parse(a.date) - parse(b.date);
            });
            return r;
          }, [records, statusFilter, search, fv, dateFrom, dateTo]);  const tp = Math.ceil(filtered.length / PER_PAGE) || 1;
  const cp = Math.min(page, tp);
  const rows = filtered.slice((cp-1)*PER_PAGE, cp*PER_PAGE);

  const alignClass = (align) => align === "center" ? "col-center" : align === "right" ? "col-right" : "";

  return (
    <div className="table-section">
      <div className="filters-row">
        <input type="text" placeholder="Search name..." value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} className="filter-search" />
        {filters?.map((f, i) => f.type === "date" ? (
          <div key={i} className="date-filter-group">
            <input type="date" className="filter-date" value={dateFrom}
              onChange={e => { setDateFrom(e.target.value); setPage(1); }} />
            <span className="date-filter-sep">—</span>
            <input type="date" className="filter-date" value={dateTo}
              onChange={e => { setDateTo(e.target.value); setPage(1); }} />
            {(dateFrom || dateTo) && (
              <button className="filter-clear-btn" onClick={() => { setDateFrom(""); setDateTo(""); setPage(1); }}>✕</button>
            )}
          </div>
        ) : (
          <select key={i} value={fv[f.key]||"all"} onChange={e => { setFv(p => ({...p,[f.key]:e.target.value})); setPage(1); }} className="filter-select">
            <option value="all">{f.label}</option>
            {f.options.map((o, j) => <option key={j} value={o}>{o}</option>)}
          </select>
        ))}
        <ExportDropdown data={filtered} filename={exportFilename} />
      </div>
      <div className="table-wrapper">
        <table className="att-table">
          <thead><tr>
            {showRowNum && <th className="col-num">S.No</th>}
            {columns.map((c, i) => <th key={i} className={alignClass(c.align)} style={c.width ? {width:c.width} : {}}>{c.label}</th>)}
            {showActions && <th className="col-center" style={{width:"90px"}}>Actions</th>}
          </tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={columns.length+(showActions?1:0)+(showRowNum?1:0)} className="table-empty">No records found</td></tr> :
              rows.map((rec, i) => (
                <tr key={rec.id ?? i}>
                  {showRowNum && <td className="col-num">{(cp-1)*PER_PAGE + i + 1}</td>}
                  {columns.map((c, j) => <td key={j} className={`${c.className||""} ${alignClass(c.align)}`} data-label={c.label}>{c.render ? c.render(rec) : rec[c.key] || "-"}</td>)}
                  {showActions && <td data-label="Actions"><div className="action-cell">
                    <button className="action-btn action-edit" title="Edit" onClick={e => { e.stopPropagation(); onEdit?.(rec); }}>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M11.5 2.5l2 2L5 13H3v-2z" /></svg>
                    </button>
                    <button className="action-btn action-delete" title="Delete" onClick={e => { e.stopPropagation(); onDelete?.(rec); }}>
                      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M3 5h10M6 5V3h4v2M5 5v7a1 1 0 001 1h4a1 1 0 001-1V5" /></svg>
                    </button>
                  </div></td>}
                </tr>
              ))}
          </tbody>
        </table>
        <div className="table-pagination">
          <span>Showing {filtered.length===0?0:(cp-1)*PER_PAGE+1}–{Math.min(cp*PER_PAGE, filtered.length)} of {filtered.length} records</span>
          <div className="page-controls">
            <div className="page-buttons">
              {cp > 1 && <button className="page-btn" onClick={() => setPage(cp-1)}>‹</button>}
              {Array.from({length:Math.min(tp,5)}, (_,i) => { let n; if(tp<=5)n=i+1; else if(cp<=3)n=i+1; else if(cp>=tp-2)n=tp-4+i; else n=cp-2+i; return <button key={n} className={`page-btn ${cp===n?"active":""}`} onClick={()=>setPage(n)}>{n}</button>; })}
              {cp < tp && <button className="page-btn" onClick={() => setPage(cp+1)}>›</button>}
            </div>
            {tp > 5 && (
              <div className="page-jump-wrap">
                <span>Go to</span>
                <input
                  type="number" min="1" max={tp}
                  className="page-jump-input"
                  placeholder={cp}
                  value={jumpInput}
                  onChange={e => setJumpInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") { const n = Math.min(Math.max(1, parseInt(jumpInput)||1), tp); setPage(n); setJumpInput(""); } }}
                />
                <button className="page-btn page-go" onClick={() => { const n = Math.min(Math.max(1, parseInt(jumpInput)||1), tp); setPage(n); setJumpInput(""); }}>Go</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
export default AttendanceTable;
