import React from "react";
import { Filter, ChevronDown, Maximize2 } from "lucide-react";
import { cx, levelBadge, initials } from "./helpers";
import { Users } from "lucide-react";
import { ORG_TREE } from "./data";

// ── Org tree node ─────────────────────────────────────────────────────────────
const OrgNode = ({ node }) => {
  const children = node.children || [];
  const multiChild = children.length > 1;

  return (
    <div className="inline-flex flex-col items-center">
      <div className="bg-white border border-slate-200 rounded shadow-sm px-3.5 py-3 flex items-center gap-3 min-w-[180px] max-w-[210px]">
        <div className={cx("w-11 h-11 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0", node.color || "bg-slate-500")}>
          {initials(node.name)}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-bold text-slate-800 leading-tight truncate">{node.name}</p>
          <p className="text-[11px] text-slate-500 leading-tight mt-0.5 truncate">{node.role}</p>
          <span className={cx("inline-block mt-1.5 px-2 py-0.5 rounded text-[10px] font-semibold", levelBadge(node.level))}>
            Level {node.level}
          </span>
        </div>
      </div>

      {children.length > 0 && (
        <div className="flex flex-col items-center">
          <div className="w-px h-7 bg-slate-300" />
          <div className="flex items-start">
            {children.map((child, idx) => {
              const isFirst = idx === 0;
              const isLast  = idx === children.length - 1;
              return (
                <div key={child.id} className="flex flex-col items-center">
                  <div className="relative flex justify-center" style={{ width: "100%" }}>
                    {multiChild && (
                      <div className="absolute bg-slate-300" style={{
                        height: 1, top: 0,
                        left:  isFirst ? "50%" : 0,
                        right: isLast  ? "50%" : 0,
                      }} />
                    )}
                    <div className="w-px h-7 bg-slate-300" />
                  </div>
                  <div className="px-3">
                    <OrgNode node={child} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {node.teamMembers && children.length === 0 && (
        <div className="flex flex-col items-center">
          <div className="w-px h-7 bg-slate-300" />
          <div className="bg-white border border-slate-200 rounded px-5 py-2.5 flex items-center gap-2.5 min-w-[120px]">
            <Users size={15} className="text-blue-400 shrink-0" />
            <div>
              <p className="text-[14px] font-bold text-slate-700 leading-none">{node.teamMembers}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">Team Members</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default function OrgChart() {
  return (
    <div className="bg-white rounded border border-slate-200 p-5">
      <div className="flex items-start justify-between mb-5">
        <div>
          <p className="text-[15px] font-bold text-slate-800">Organization Hierarchy</p>
          <p className="text-xs text-slate-400 mt-0.5">Visualize reporting structure across the organization</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="flex items-center gap-1.5 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
            <Filter size={12} /> Filter
          </button>
          <button className="flex items-center gap-1.5 border border-slate-200 rounded px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50 transition-colors">
            Levels <ChevronDown size={12} />
          </button>
          <button className="border border-slate-200 rounded p-1.5 text-slate-500 hover:bg-slate-50 transition-colors">
            <Maximize2 size={14} />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto pb-4">
        <div className="inline-flex justify-center min-w-full py-2">
          <OrgNode node={ORG_TREE} />
        </div>
      </div>
    </div>
  );
}
