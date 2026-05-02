import React, { useState, useRef, useEffect } from "react";
import { exportToExcel, exportToPDF } from "../utils";

const ExportDropdown = ({ data, filename = "Report" }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => { const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }; document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h); }, []);

  return (
    <div className="export-wrap" ref={ref}>
      <button className="export-btn" onClick={() => setOpen(!open)}>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M8 2v8M5 7l3 3 3-3M3 12v1h10v-1" /></svg>
        Export
        <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M4 6l4 4 4-4" /></svg>
      </button>
      {open && (
        <div className="export-dropdown">
          <div className="export-option" onClick={() => { setOpen(false); exportToPDF(data, filename); }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round"><path d="M3 2h7l3 3v9H3z" /><path d="M10 2v3h3" /></svg>
            Export as <strong className="text-danger">PDF</strong>
          </div>
          <div className="export-separator" />
          <div className="export-option" onClick={() => { setOpen(false); exportToExcel(data, filename); }}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="var(--success)" strokeWidth="1.5" strokeLinecap="round"><path d="M3 2h7l3 3v9H3z" /><path d="M10 2v3h3" /><path d="M6 9h4M6 11h3" /></svg>
            Export as <strong className="text-success">Excel</strong>
          </div>
        </div>
      )}
    </div>
  );
};
export default ExportDropdown;
