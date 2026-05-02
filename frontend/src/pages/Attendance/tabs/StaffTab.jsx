import React, { useState, useMemo } from "react";
import StatCards from "../components/StatCards";
import { VerticalBar, DeptSplit, TopPerformers } from "../components/Charts";
import AttendanceTable from "../components/AttendanceTable";
import BulkUpload from "../components/BulkUpload";
import AddRecordModal from "../components/AddRecordModal";
import { formatTime, formatDate, calcStats, calcAvgWorkingHours, calcWeeklyAttendance, getTopPerformers, getDepartmentSplit, getDisplayStatus, getStatusBadgeClass, formatOTDuration, getWorkingHours, ALL_STATUSES } from "../utils";

const StaffTab = ({ data, contacts = [], onDelete, onBulkUpload, onAddRecord, onEditRecord }) => {
  const [statusFilter, setStatusFilter] = useState("all");
  const [showUpload, setShowUpload] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);

  const stats = useMemo(() => { const s = calcStats(data); s.avgHours = calcAvgWorkingHours(data); return s; }, [data]);
  const weeklyData = useMemo(() => calcWeeklyAttendance(data), [data]);
  const topPerformers = useMemo(() => getTopPerformers(data, 5), [data]);
  const deptSplit = useMemo(() => getDepartmentSplit(data), [data]);
  const departments = useMemo(() => [...new Set(data.map(r => r.department).filter(Boolean))], [data]);
  const designations = useMemo(() => [...new Set(data.map(r => r.designation).filter(Boolean))], [data]);
  const contactDepartments = useMemo(() => [...new Set(contacts.map(r => r.department).filter(Boolean))], [contacts]);

  const columns = [
    { key: "siteCode",    label: "Site Code",   align: "center" },
    { key: "date",        label: "Date",        align: "center", render: r => formatDate(r.date) },
    { key: "name",        label: "Name",        className: "cell-bold" },
    { key: "department",  label: "Department" },
    { key: "designation", label: "Designation" },
    { key: "status",      label: "Status",      align: "center", render: r => { const ds = getDisplayStatus(r); return <span className={`badge ${getStatusBadgeClass(ds)}`}>{ds}</span>; } },
    { key: "shift",       label: "Shift",       align: "center" },
    { key: "inTime",      label: "In Time",     align: "center", render: r => formatTime(r.inTime) },
    { key: "outTime",     label: "Out Time",    align: "center", render: r => formatTime(r.outTime) },
    { key: "working",     label: "Working Hrs", align: "right",  render: r => getWorkingHours(r) },
    { key: "ot",          label: "OT",          align: "right",  render: r => formatOTDuration(r) },
    { key: "remarks",     label: "Remarks",                      render: r => r.remarks || "-" },
  ];

  const filters = [
    { key: "status", label: "All status", options: [...ALL_STATUSES, "Late"] },
    { key: "department", label: "All department", options: departments },
    { key: "designation", label: "All designation", options: designations },
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
      <BulkUpload visible={showUpload} onUpload={(file) => { onBulkUpload?.(file, "staff"); setShowUpload(false); }} columns="Date,SiteCode,Name,Designation,Department,Status,InTime,OutTime,Shift,Remarks" exampleRow="01-04-2026,SITE-001,Rajesh Kumar,Site Engineer,Civil,Present,09:00,18:00,Day,On time" />
      <StatCards stats={stats} onStatClick={setStatusFilter} activeFilter={statusFilter} />
      <div className="charts-grid charts-3">
        <VerticalBar data={weeklyData} />
        <DeptSplit data={deptSplit} />
        <TopPerformers performers={topPerformers} />
      </div>
      <AttendanceTable records={data} columns={columns} filters={filters} statusFilter={statusFilter} onEdit={(rec) => setEditRecord(rec)} onDelete={onDelete} exportFilename="Staff_Attendance" />
      <AddRecordModal visible={showModal} onClose={() => setShowModal(false)} onSave={onAddRecord} type="staff" contacts={contacts} departmentOptions={contactDepartments} />
      <AddRecordModal visible={!!editRecord} initialData={editRecord} onClose={() => setEditRecord(null)} onSave={(d) => { onEditRecord?.({ ...editRecord, ...d }); setEditRecord(null); }} type="staff" contacts={contacts} departmentOptions={contactDepartments} />
    </div>
  );
};

export default StaffTab;
