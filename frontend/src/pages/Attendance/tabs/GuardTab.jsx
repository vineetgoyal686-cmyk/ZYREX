import React, { useState, useMemo } from "react";
import { GuardStatCards } from "../components/StatCards";
import { WeeklyBar, ShiftSplit } from "../components/Charts";
import AttendanceTable from "../components/AttendanceTable";
import BulkUpload from "../components/BulkUpload";
import AddRecordModal from "../components/AddRecordModal";
import { formatTime, formatDate, calcStats, calcAvgWorkingHours, calcWeeklyAttendance, getShiftSplit, isToday, getDisplayStatus, getStatusBadgeClass, formatOTDuration, getWorkingHours, ALL_STATUSES } from "../utils";

const GuardTab = ({ data, contacts = [], onDelete, onBulkUpload, onAddRecord, onEditRecord }) => {
  const [statusFilter, setStatusFilter] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);

  const stats = useMemo(() => { const s = calcStats(data); s.avgHours = calcAvgWorkingHours(data); return s; }, [data]);
  const weeklyData = useMemo(() => calcWeeklyAttendance(data), [data]);
  const todayGuards = useMemo(() => data.filter(r => isToday(r.date)), [data]);
  const shiftData = useMemo(() => getShiftSplit(todayGuards), [todayGuards]);
  const locations = useMemo(() => [...new Set(data.map(r => r.department).filter(Boolean))], [data]);
  const types = useMemo(() => [...new Set(data.map(r => r.designation).filter(Boolean))], [data]);

  const columns = [
    { key: "siteCode",    label: "Site Code",    align: "center" },
    { key: "date",        label: "Date",        align: "center", render: r => formatDate(r.date) },
    { key: "name",        label: "Name",        className: "cell-bold" },
    { key: "designation", label: "Type" },
    { key: "department",  label: "Location" },
    { key: "status",      label: "Status",      align: "center", render: r => { const ds = getDisplayStatus(r); return <span className={`badge ${getStatusBadgeClass(ds)}`}>{ds}</span>; } },
    { key: "shift",       label: "Shift",       align: "center" },
    { key: "inTime",      label: "In Time",     align: "center", render: r => formatTime(r.inTime) },
    { key: "outTime",     label: "Out Time",    align: "center", render: r => formatTime(r.outTime) },
    { key: "working",     label: "Working Hrs", align: "right",  render: r => getWorkingHours(r) },
    { key: "ot",          label: "OT",          align: "right",  render: r => formatOTDuration(r) },
    { key: "remarks",     label: "Remarks",                      render: r => r.remarks || "-" },
  ];

  const filters = [
    { key: "status", label: "All status", options: ALL_STATUSES },
    { key: "shift", label: "All shift", options: ["Day", "Night"] },
    { type: "date" },
  ];

  return (
    <div className="tab-content">
      <div className="tab-actions">
        <button className="btn-upload" onClick={() => setShowUpload(!showUpload)}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 10V2M5 5l3-3 3 3M3 12v1h10v-1" /></svg>
          Bulk upload
        </button>
        <button className="btn-add" onClick={() => setShowModal(true)}>+ Add record</button>
      </div>
      <BulkUpload visible={showUpload} onUpload={(file) => { onBulkUpload?.(file, "guard"); setShowUpload(false); }} columns="Date,SiteCode,Name,Type,Location,Status,InTime,OutTime,Shift,Remarks" exampleRow="01-04-2026,SITE-001,Ramesh Singh,Security Guard,Main Gate,Present,07:00,19:00,Day,Regular duty" />
      <GuardStatCards stats={stats} onStatClick={setStatusFilter} activeFilter={statusFilter} />
      <div className="charts-grid charts-2">
        <WeeklyBar data={weeklyData} />
        <ShiftSplit data={shiftData} />
      </div>
      <AttendanceTable records={data} columns={columns} filters={filters} statusFilter={statusFilter} onEdit={(rec) => setEditRecord(rec)} onDelete={onDelete} exportFilename="Guard_Attendance" />
      <AddRecordModal visible={showModal} onClose={() => setShowModal(false)} onSave={onAddRecord} type="guard" contacts={contacts} locationOptions={locations} departmentOptions={types} />
      <AddRecordModal visible={!!editRecord} initialData={editRecord} onClose={() => setEditRecord(null)} onSave={(d) => { onEditRecord?.({ ...editRecord, ...d }); setEditRecord(null); }} type="guard" contacts={contacts} locationOptions={locations} departmentOptions={types} />
    </div>
  );
};

export default GuardTab;
