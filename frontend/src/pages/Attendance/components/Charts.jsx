import React from "react";

// ─── Donut Chart ─────────────────────────────────────────
export const DonutChart = ({ stats }) => {
  const { present, absent, late, onLeave, total } = stats;
  const pct = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
  const r = 15.5, circ = 2 * Math.PI * r;
  const segments = [
    { value: present, color: "var(--success)", label: "Present" },
    { value: absent,  color: "var(--danger)",  label: "Absent"  },
    { value: late,    color: "var(--warning)", label: "Late"    },
    { value: onLeave, color: "#818cf8",        label: "Leave"   },
  ];
  let offset = circ * 0.25;
  const arcs = segments.map((seg) => {
    const len = total > 0 ? (seg.value / total) * circ : 0;
    const arc = { ...seg, dasharray: `${len} ${circ - len}`, dashoffset: -offset };
    offset += len;
    return arc;
  });

  return (
    <div className="chart-card">
      <div className="chart-title">Today's overview</div>
      <div className="donut-wrap">
        <div className="donut-svg-wrap">
          <svg width="120" height="120" viewBox="0 0 40 40">
            <circle cx="20" cy="20" r={r} fill="none" stroke="var(--border-light)" strokeWidth="4" />
            {arcs.map((arc, i) => (
              <circle key={i} cx="20" cy="20" r={r} fill="none" stroke={arc.color} strokeWidth="4"
                strokeDasharray={arc.dasharray} strokeDashoffset={arc.dashoffset} strokeLinecap="butt" />
            ))}
            <text x="20" y="19" textAnchor="middle" dominantBaseline="central" style={{ fontSize: "6px", fontWeight: 700, fill: "var(--text-primary)" }}>{pct}%</text>
            <text x="20" y="25" textAnchor="middle" dominantBaseline="central" style={{ fontSize: "3px", fill: "var(--text-tertiary)", fontWeight: 600 }}>attendance</text>
          </svg>
        </div>
        <div className="donut-legend">
          {segments.map((seg, i) => (
            <div key={i} className="legend-item">
              <div>
                <span className="legend-dot" style={{ background: seg.color }} />
                <span>{seg.label}</span>
              </div>
              <strong>{seg.value}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

// ─── Recent Arrivals ─────────────────────────────────────
export const RecentArrivals = ({ records }) => {
  const fmtTime = (val) => {
    if (!val && val !== 0) return "-";
    if (typeof val === "string") return val;
    const mins = Math.round(val * 24 * 60);
    let h = Math.floor(mins / 60); const m = mins % 60;
    const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
    return `${h}:${String(m).padStart(2, "0")} ${ap}`;
  };
  const sorted = [...records].filter((r) => r.inTime && (r.status?.toLowerCase() === "present" || r.status?.toLowerCase() === "on duty"))
    .sort((a, b) => (typeof b.inTime === "number" ? b.inTime : 0) - (typeof a.inTime === "number" ? a.inTime : 0)).slice(0, 5);

  return (
    <div className="chart-card">
      <div className="chart-title">Recent arrivals</div>
      {sorted.length === 0 ? <div className="chart-empty">No arrivals yet</div> :
        sorted.map((r, i) => (
          <div key={i} className="timeline-item">
            <span className="tl-time">{fmtTime(r.inTime)}</span>
            <span className="tl-dot" style={{ background: "var(--success)" }} />
            <div><div className="tl-name">{r.name}</div><div className="tl-role">{r.department || r.designation} · {r.type === "guard" ? "Guard" : "Staff"}</div></div>
          </div>
        ))}
    </div>
  );
};

// ─── Department Split ────────────────────────────────────
export const DeptSplit = ({ data }) => (
  <div className="chart-card">
    <div className="chart-title">Department wise</div>
    {data.length === 0 ? <div className="chart-empty">No data</div> : <>
      {data.map((d, i) => (
        <div key={i} className="dept-row">
          <span className="dept-name" title={d.dept}>{d.dept}</span>
          <div className="dept-track">
            {d.present > 0 && <div className="dept-seg bg-success" style={{ width: `${(d.present / d.total) * 100}%` }} />}
            {d.absent > 0 && <div className="dept-seg bg-danger" style={{ width: `${(d.absent / d.total) * 100}%` }} />}
            {d.late > 0 && <div className="dept-seg bg-warning" style={{ width: `${(d.late / d.total) * 100}%` }} />}
            {d.leave > 0 && <div className="dept-seg bg-info" style={{ width: `${(d.leave / d.total) * 100}%` }} />}
          </div>
          <span className="dept-count">{d.total}</span>
        </div>
      ))}
      <div className="dept-legend">
        <span><span className="legend-dot-sm bg-success" />Present</span>
        <span><span className="legend-dot-sm bg-danger" />Absent</span>
        <span><span className="legend-dot-sm bg-warning" />Late</span>
        <span><span className="legend-dot-sm bg-info" />Leave</span>
      </div>
    </>}
  </div>
);

// ─── Vertical Bar (replaces WeeklyBar for Staff) ────────
export const VerticalBar = ({ data = [] }) => (
  <div className="chart-card">
    <div className="chart-title">Weekly attendance %</div>
    <div className="vbar-wrap">
      {(data || []).map((d, i) => (
        <div key={i} className="vbar-col">
          <span className="vbar-label">{d.pct > 0 ? `${d.pct}%` : "—"}</span>
          <div className="vbar-track">
            <div
              className={`vbar-fill ${d.pct < 80 ? "bg-warning" : "bg-success"}`}
              style={{ height: `${d.pct}%` }}
            />
          </div>
          <span className="vbar-day">{d.day}</span>
        </div>
      ))}
    </div>
  </div>
);

// ─── Weekly Bar (kept for Guard tab) ────────────────────
export const WeeklyBar = ({ data = [] }) => (
  <div className="chart-card">
    <div className="chart-title">Weekly attendance %</div>
    {(data || []).map((d, i) => (
      <div key={i} className="bar-row">
        <span className="bar-day">{d.day}</span>
        <div className="bar-track"><div className={`bar-fill ${d.pct < 80 ? "bg-warning" : "bg-success"}`} style={{ width: `${d.pct}%` }} /></div>
        <span className="bar-pct">{d.pct}%</span>
      </div>
    ))}
  </div>
);

// ─── Monthly Heatmap ─────────────────────────────────────
export const MonthlyHeatmap = ({ records }) => {
  const headers = ["M", "T", "W", "T", "F", "S", "S"];
  const month = new Date().toLocaleString("en-US", { month: "long" });
  const byDate = {};
  records.forEach((r) => { if (!r.date) return; if (!byDate[r.date]) byDate[r.date] = { total: 0, present: 0 }; byDate[r.date].total++; if (r.status?.toLowerCase() === "present" || r.status?.toLowerCase() === "on duty") byDate[r.date].present++; });
  const rates = Object.values(byDate).map((d) => d.total > 0 ? d.present / d.total : 0);
  const weeks = [[], [], [], []]; let idx = 0;
  for (let w = 0; w < 4; w++) for (let d = 0; d < 7; d++) {
    if (d >= 5) weeks[w].push("off");
    else if (idx < rates.length) { const rate = rates[idx++]; weeks[w].push(rate >= 0.85 ? "high" : rate >= 0.7 ? "mid" : "low"); }
    else weeks[w].push("off");
  }

  return (
    <div className="chart-card">
      <div className="chart-title">Monthly heatmap ({month})</div>
      <div className="heatmap-grid">
        {headers.map((h, i) => <div key={i} className="hm-header">{h}</div>)}
        {weeks.flat().map((cell, i) => <div key={i} className={`hm-cell hm-${cell}`} />)}
      </div>
      <div className="hm-legend">
        <span><span className="hm-dot hm-high" />High</span>
        <span><span className="hm-dot hm-mid" />Mid</span>
        <span><span className="hm-dot hm-low" />Low</span>
        <span><span className="hm-dot hm-off" />Off</span>
      </div>
    </div>
  );
};

// ─── Top Performers ──────────────────────────────────────
export const TopPerformers = ({ performers = [] }) => (
  <div className="chart-card">
    <div className="chart-title">Top performers</div>
    {(performers || []).length === 0 ? <div className="chart-empty">No data</div> :
      performers.map((p, i) => (
        <div key={i} className="perf-item">
          <div className={`perf-avatar ${i === 0 ? "perf-gold" : "perf-blue"}`}>{p.initials}</div>
          <div><div className="perf-name">{p.name}</div><div className="perf-sub">{p.pct}% · {p.department || p.designation}</div></div>
        </div>
      ))}
  </div>
);

// ─── Shift Split ─────────────────────────────────────────
export const ShiftSplit = ({ data }) => (
  <div className="chart-card">
    <div className="chart-title">Shift-wise today</div>
    {data.map((d, i) => (
      <div key={i} className="dept-row">
        <span className="dept-name">{d.shift}</span>
        <div className="dept-track">
          <div className="dept-seg bg-success" style={{ width: `${d.total > 0 ? (d.present / d.total) * 100 : 0}%` }} />
          {d.present < d.total && <div className="dept-seg bg-danger" style={{ width: `${((d.total - d.present) / d.total) * 100}%` }} />}
        </div>
        <span className="shift-count">{d.present}/{d.total}</span>
      </div>
    ))}
  </div>
);
