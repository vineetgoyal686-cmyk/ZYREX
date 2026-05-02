import React, { useState } from "react";

const AlertCards = ({ consecutiveAbsent, habitualLate, otToday }) => {
  const [expanded, setExpanded] = useState({});
  const toggle = (key) => setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  const totalOTTime = () => {
    let totalMin = 0;
    otToday.forEach((r) => { const m = r.ot.match(/(\d+)h\s*(\d+)m/); if (m) totalMin += parseInt(m[1]) * 60 + parseInt(m[2]); });
    return `${Math.floor(totalMin / 60)}h ${totalMin % 60}m`;
  };

  return (
    <div className="alert-cards-grid">
      <div className="alert-card alert-danger" onClick={() => toggle("absent")}>
        <div className="alert-top">
          <div className="alert-icon alert-icon-danger">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M8 1L15 14H1Z" stroke="var(--danger)" strokeWidth="1.5" fill="none" /><path d="M8 6V9M8 11V11.5" stroke="var(--danger)" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
          <div className="alert-content">
            <div className="alert-label">Consecutive absent</div>
            <div className="alert-value text-danger">{consecutiveAbsent.length} staff</div>
          </div>
          <div className={`alert-chevron ${expanded.absent ? "open" : ""}`}>▾</div>
        </div>
        {expanded.absent && consecutiveAbsent.length > 0 && (
          <div className="alert-detail">
            {consecutiveAbsent.map((item, i) => (
              <div key={i} className="detail-item">
                <div><span className="detail-name">{item.name}</span><span className="detail-sub">{item.designation} · {item.department} · {item.days} days</span></div>
                <span className="badge badge-danger">Absent</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="alert-card alert-warning" onClick={() => toggle("late")}>
        <div className="alert-top">
          <div className="alert-icon alert-icon-warning">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="var(--warning)" strokeWidth="1.5" /><path d="M8 4V8.5L10.5 10" stroke="var(--warning)" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
          <div className="alert-content">
            <div className="alert-label">Habitual late (5+)</div>
            <div className="alert-value text-warning">{habitualLate.length} person</div>
          </div>
          <div className={`alert-chevron ${expanded.late ? "open" : ""}`}>▾</div>
        </div>
        {expanded.late && habitualLate.length > 0 && (
          <div className="alert-detail">
            {habitualLate.map((item, i) => (
              <div key={i} className="detail-item">
                <div><span className="detail-name">{item.name}</span><span className="detail-sub">{item.designation} · Late {item.count} times</span></div>
                <span className="badge badge-warning">Late</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="alert-card alert-info" onClick={() => toggle("ot")}>
        <div className="alert-top">
          <div className="alert-icon alert-icon-info">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="var(--info)" strokeWidth="1.5" /><path d="M8 4V8H12" stroke="var(--info)" strokeWidth="1.5" strokeLinecap="round" /></svg>
          </div>
          <div className="alert-content">
            <div className="alert-label">Total OT today</div>
            <div className="alert-value text-info">{totalOTTime()}</div>
          </div>
          <div className={`alert-chevron ${expanded.ot ? "open" : ""}`}>▾</div>
        </div>
        {expanded.ot && otToday.length > 0 && (
          <div className="alert-detail">
            {otToday.map((item, i) => (
              <div key={i} className="detail-item">
                <div><span className="detail-name">{item.name}</span><span className="detail-sub">{item.designation} · {item.shift}</span></div>
                <span className="ot-value">+{item.ot}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertCards;
