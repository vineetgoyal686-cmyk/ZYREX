import React, { useState } from "react";
import AttendanceTable from "../components/AttendanceTable";
import BulkUpload from "../components/BulkUpload";
import AddRecordModal from "../components/AddRecordModal";

const SectionHeader = ({ icon, title, count, accentColor, onUpload, onAdd, addLabel }) => (
  <div style={{
    display: "flex", alignItems: "center", justifyContent: "space-between",
    flexWrap: "wrap", gap: 12, marginBottom: 16,
    background: "linear-gradient(135deg, #1e293b 0%, #0f172a 100%)",
    borderRadius: "var(--radius-lg)", padding: "16px 22px",
    boxShadow: "0 4px 16px rgba(15,23,42,.18)",
    position: "relative", overflow: "hidden",
  }}>
    {/* background glow */}
    <div style={{
      position: "absolute", top: -30, left: 60, width: 120, height: 120,
      background: `radial-gradient(circle, ${accentColor}30, transparent 70%)`,
      borderRadius: "50%", pointerEvents: "none",
    }} />

    {/* Left: icon + title + badge */}
    <div style={{ display: "flex", alignItems: "center", gap: 14, position: "relative", zIndex: 1 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 12,
        background: `${accentColor}25`,
        border: `1px solid ${accentColor}40`,
        display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
      }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
      </div>
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <span style={{
            fontSize: 16, fontWeight: 800, color: "#fff",
            letterSpacing: "0.2px",
          }}>{title}</span>
          {count !== undefined && (
            <span style={{
              background: `${accentColor}30`, color: "#fff",
              fontWeight: 700, fontSize: 11, padding: "3px 10px",
              borderRadius: 20, border: `1px solid ${accentColor}50`,
              letterSpacing: "0.3px",
            }}>
              {count} records
            </span>
          )}
        </div>
      </div>
    </div>

    {/* Right: buttons */}
    <div style={{ display: "flex", gap: 10, alignItems: "center", position: "relative", zIndex: 1 }}>
      <button onClick={onUpload} style={{
        fontSize: 13, padding: "8px 16px", borderRadius: 8, cursor: "pointer",
        fontWeight: 600, border: "1px solid rgba(255,255,255,.2)",
        background: "rgba(255,255,255,.08)", color: "#fff",
        display: "flex", alignItems: "center", gap: 7,
        transition: "all .2s",
      }}
        onMouseEnter={e => e.currentTarget.style.background = "rgba(255,255,255,.15)"}
        onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,.08)"}
      >
        <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M8 10V2M5 5l3-3 3 3M3 12v1h10v-1" />
        </svg>
        Bulk upload
      </button>
      <button onClick={onAdd} style={{
        fontSize: 13, padding: "8px 18px", borderRadius: 8, cursor: "pointer",
        fontWeight: 700, border: "none",
        background: `linear-gradient(145deg, ${accentColor}, ${accentColor}cc)`,
        color: "#fff",
        boxShadow: `0 4px 12px ${accentColor}50`,
        transition: "all .2s",
      }}
        onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; e.currentTarget.style.boxShadow = `0 6px 18px ${accentColor}60`; }}
        onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = `0 4px 12px ${accentColor}50`; }}
      >
        {addLabel}
      </button>
    </div>
  </div>
);

const ContactsTab = ({ staffData = [], guardData = [], onDelete, onBulkUpload, onAddRecord, onEditRecord }) => {
  const [showStaffUpload, setShowStaffUpload] = useState(false);
  const [showGuardUpload, setShowGuardUpload] = useState(false);
  const [showStaffModal, setShowStaffModal] = useState(false);
  const [showGuardModal, setShowGuardModal] = useState(false);
  const [editRecord, setEditRecord] = useState(null);
  const staffDesignations = [...new Set(staffData.map(r => r.designation).filter(Boolean))];
  const staffDepartments  = [...new Set(staffData.map(r => r.department).filter(Boolean))];
  const guardDesignations = [...new Set(guardData.map(r => r.designation).filter(Boolean))];

  const staffColumns = [
    { key: "sNo",          label: "S.No",          align: "center", width: "60px" },
    { key: "site",         label: "Site Code",     align: "center" },
    { key: "empId",        label: "Emp ID",         align: "center" },
    { key: "name",         label: "Name",           className: "cell-bold" },
    { key: "designation",  label: "Designation" },
    { key: "department",   label: "Department" },
    { key: "joiningDate",  label: "Joining Date",   align: "center" },
    { key: "email",        label: "Email" },
    { key: "manager",      label: "Reporting Mgr" },
    { key: "contact",      label: "Contact",        align: "center" },
  ];

  const guardColumns = [
    { key: "sNo",          label: "S.No",          align: "center", width: "60px" },
    { key: "site",         label: "Site Code",     align: "center" },
    { key: "name",         label: "Name",          className: "cell-bold" },
    { key: "designation",  label: "Designation" },
    { key: "joiningDate",  label: "Joining Date",  align: "center" },
    { key: "status",       label: "Status",        align: "center" },
    { key: "shift",        label: "Shift Duty",    align: "center" },
    { key: "contact",      label: "Contact No",    align: "center" },
    { key: "remarks",      label: "Remarks" },
  ];

  const staffFilters = [
    { key: "designation", label: "All designation", options: staffDesignations },
    { key: "department",  label: "All department",  options: staffDepartments  },
  ];
  const guardFilters = [{ key: "designation", label: "All designation", options: guardDesignations }];

  return (
    <div className="tab-content">
      <SectionHeader
        icon="👤"
        title="Staff Contact Details"
        subtitle="Manage and view all staff member contact information"
        count={staffData.length}
        accentColor="#2563eb"
        onUpload={() => setShowStaffUpload(!showStaffUpload)}
        onAdd={() => setShowStaffModal(true)}
        addLabel="+ Add staff contact"
      />
      <BulkUpload visible={showStaffUpload} onUpload={(file) => { onBulkUpload?.(file, "sc"); setShowStaffUpload(false); }} columns="S.No,Site,EmpID,JoiningDate,Email,Name,Designation,Department,Manager,Contact" exampleRow="1,SITE-001,EMP-001,01-01-2025,rajesh@example.com,Rajesh Kumar,Site Engineer,Civil,Amit Sharma,9876543210" />
      <AttendanceTable records={staffData} columns={staffColumns} filters={staffFilters} statusFilter="all" showRowNum={false} onEdit={(rec) => setEditRecord(rec)} onDelete={onDelete} exportFilename="SC_Contacts" />
      <AddRecordModal visible={showStaffModal} onClose={() => setShowStaffModal(false)} onSave={onAddRecord} type="staffContact" contacts={staffData} />

      <div style={{ marginTop: 28 }}>
        <SectionHeader
          icon="🛡️"
          title="Guard Contact Details"
          subtitle="Manage and view all security guard contact information"
          count={guardData.length}
          accentColor="#16a34a"
          onUpload={() => setShowGuardUpload(!showGuardUpload)}
          onAdd={() => setShowGuardModal(true)}
          addLabel="+ Add guard contact"
        />
      </div>
      <BulkUpload visible={showGuardUpload} onUpload={(file) => { onBulkUpload?.(file, "gc"); setShowGuardUpload(false); }} columns="S.No,Site,Name,JoiningDate,Designation,Status,ShiftDuty,ContactNo,Remarks" exampleRow="1,SITE-001,Ramesh Singh,01-01-2025,Security Guard,Active,Day,9876543210,Main gate duty" />
      <AttendanceTable records={guardData} columns={guardColumns} filters={guardFilters} statusFilter="all" showRowNum={false} onEdit={(rec) => setEditRecord(rec)} onDelete={onDelete} exportFilename="GC_Contacts" />
      <AddRecordModal visible={showGuardModal} onClose={() => setShowGuardModal(false)} onSave={onAddRecord} type="guardContact" contacts={guardData} />

      <AddRecordModal visible={!!editRecord} initialData={editRecord} onClose={() => setEditRecord(null)} onSave={(d) => { onEditRecord?.({ ...editRecord, ...d }); setEditRecord(null); }} type={editRecord?.type || "staffContact"} contacts={editRecord?.type === "guardContact" ? guardData : staffData} />
    </div>
  );
};

export default ContactsTab;
