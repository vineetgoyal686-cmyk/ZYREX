import React, { useState, useMemo } from "react";
import StatCards from "../components/StatCards";
import { DonutChart, RecentArrivals, DeptSplit } from "../components/Charts";
import AttendanceTable from "../components/AttendanceTable";
import {
  formatTime, calcStats, calcAvgWorkingHours, calcOTToday,
  findConsecutiveAbsent, findLateToday, getDepartmentSplit,
  isToday, getDisplayStatus, getStatusBadgeClass,
  formatOTDuration, formatLateDuration, getWorkingHours, ALL_STATUSES
} from "../utils";

// ─── Today Alert Cards (different from Staff/Guard) ──────
const TodayAlertCards = ({ consecutiveAbsent, lateToday, otToday }) => {
  const [expanded, setExpanded] = useState({});
  const toggle = (k) => setExpanded(p => ({ ...p, [k]: !p[k] }));

  const totalOT = () => {
    let t = 0;
    otToday.forEach(r => { const m = r.ot.match(/(\d+)h\s*(\d+)m/); if (m) t += parseInt(m[1])*60 + parseInt(m[2]); });
    return `${Math.floor(t/60)}h ${t%60}m`;
  };

  return (
    <div className="alert-cards-grid">
      {/* Consecutive Absent (last 7 days) */}
      <div className="alert-card alert-danger" onClick={() => toggle("absent")}>
        <div className="alert-top">
          <div className="alert-icon">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><path d="M8 1L15 14H1Z" stroke="var(--danger)" strokeWidth="1.5" fill="none"/><path d="M8 6V9M8 11V11.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <div className="alert-content">
            <div className="alert-label">Consecutive absent (7 days)</div>
            <div className="alert-value text-danger">{consecutiveAbsent.length} staff</div>
          </div>
          <div className={`alert-chevron ${expanded.absent ? "open" : ""}`}>▾</div>
        </div>
        {expanded.absent && (
          <div className="alert-detail">
            {consecutiveAbsent.length === 0 ? <div className="detail-empty">No consecutive absences</div> :
              consecutiveAbsent.map((item, i) => (
                <div key={i} className="detail-item">
                  <div><span className="detail-name">{item.name}</span><span className="detail-sub">{item.designation} · {item.department} · {item.days} days</span></div>
                  <span className="badge badge-danger">Absent</span>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* Late Today */}
      <div className="alert-card alert-warning" onClick={() => toggle("late")}>
        <div className="alert-top">
          <div className="alert-icon">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="var(--warning)" strokeWidth="1.5"/><path d="M8 4V8.5L10.5 10" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <div className="alert-content">
            <div className="alert-label">Late today</div>
            <div className="alert-value text-warning">{lateToday.length} person</div>
          </div>
          <div className={`alert-chevron ${expanded.late ? "open" : ""}`}>▾</div>
        </div>
        {expanded.late && (
          <div className="alert-detail">
            {lateToday.length === 0 ? <div className="detail-empty">No one late today</div> :
              lateToday.map((item, i) => (
                <div key={i} className="detail-item">
                  <div><span className="detail-name">{item.name}</span><span className="detail-sub">{item.designation} · In: {item.inTime}</span></div>
                  <span className="badge badge-warning">{item.lateBy}</span>
                </div>
              ))
            }
          </div>
        )}
      </div>

      {/* Total OT */}
      <div className="alert-card alert-info" onClick={() => toggle("ot")}>
        <div className="alert-top">
          <div className="alert-icon">
            <svg width="18" height="18" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="var(--info)" strokeWidth="1.5"/><path d="M8 4V8H12" stroke="var(--info)" strokeWidth="1.5" strokeLinecap="round"/></svg>
          </div>
          <div className="alert-content">
            <div className="alert-label">Total OT today</div>
            <div className="alert-value text-info">{totalOT()}</div>
          </div>
          <div className={`alert-chevron ${expanded.ot ? "open" : ""}`}>▾</div>
        </div>
        {expanded.ot && (
          <div className="alert-detail">
            {otToday.length === 0 ? <div className="detail-empty">No overtime today</div> :
              otToday.map((item, i) => (
                <div key={i} className="detail-item">
                  <div><span className="detail-name">{item.name}</span><span className="detail-sub">{item.designation} · {item.shift}</span></div>
                  <span className="ot-value">+{item.ot}</span>
                </div>
              ))
            }
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Today Tab ──────────────────────────────────────
const TodayTab = ({ staffData, guardData, onEdit, onDelete }) => {
  const [statusFilter, setStatusFilter] = useState("all");

  const todayRecords = useMemo(() => [...staffData, ...guardData].filter(r => isToday(r.date)), [staffData, guardData]);
  const allRecords = useMemo(() => [...staffData, ...guardData], [staffData, guardData]);

  const stats = useMemo(() => { const s = calcStats(todayRecords); s.avgHours = calcAvgWorkingHours(todayRecords); return s; }, [todayRecords]);
  
  // Alerts — consecutive from all data (last 7 days), late & OT from today only
  const consecutiveAbsent = useMemo(() => findConsecutiveAbsent(allRecords), [allRecords]);
  const lateToday = useMemo(() => findLateToday(todayRecords), [todayRecords]);
  const otToday = useMemo(() => calcOTToday(todayRecords), [todayRecords]);
  const deptSplit = useMemo(() => getDepartmentSplit(todayRecords), [todayRecords]);

  const columns = [
    { key: "name",        label: "Name",        className: "cell-bold" },
    { key: "type",        label: "Type",        align: "center", render: r => <span className={`badge-type ${r.type === "guard" ? "badge-guard" : "badge-staff"}`}>{r.type === "guard" ? "Guard" : "Staff"}</span> },
    { key: "department",  label: "Department" },
    { key: "designation", label: "Designation" },
    { key: "status",      label: "Status",      align: "center", render: r => { const ds = getDisplayStatus(r); return <span className={`badge ${getStatusBadgeClass(ds)}`}>{ds}</span>; } },
    { key: "shift",       label: "Shift",       align: "center" },
    { key: "inTime",      label: "In Time",     align: "center", render: r => isPresent(r.status) ? formatTime(r.inTime) : "-" },
    { key: "outTime",     label: "Out Time",    align: "center", render: r => isPresent(r.status) ? formatTime(r.outTime) : "-" },
    { key: "working",     label: "Working Hrs", align: "right",  render: r => getWorkingHours(r) },
    { key: "ot",          label: "OT",          align: "right",  render: r => formatOTDuration(r) },
    { key: "remarks",     label: "Remarks",                      render: r => formatLateDuration(r) || r.remarks || "-" },
  ];

  // Helper for column render
  function isPresent(status) {
    return ["present","on duty"].includes(status?.toLowerCase());
  }

  const filters = [
    { key: "status", label: "All status", options: ALL_STATUSES },
    { key: "type", label: "All type", options: ["staff", "guard"] },
  ];

  return (
    <div className="tab-content">
      <StatCards stats={stats} onStatClick={setStatusFilter} activeFilter={statusFilter} />
      {statusFilter !== "all" && (
        <div className="active-filter-banner">
          Filtering by: <strong>{statusFilter}</strong>
          <button onClick={() => setStatusFilter("all")} className="clear-filter-btn">
            <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M4 4L12 12M4 12L12 4" />
            </svg>
            Clear filter
          </button>
        </div>
      )}
      <TodayAlertCards consecutiveAbsent={consecutiveAbsent} lateToday={lateToday} otToday={otToday} />
      <div className="charts-grid charts-3">
        <DonutChart stats={stats} />
        <RecentArrivals records={todayRecords} />
        <DeptSplit data={deptSplit} />
      </div>
      <AttendanceTable records={todayRecords} columns={columns} filters={filters} statusFilter={statusFilter} onEdit={onEdit} onDelete={onDelete} exportFilename="Today_Attendance" />
    </div>
  );
};

export default TodayTab;
