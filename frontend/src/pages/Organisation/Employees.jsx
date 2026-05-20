import React from "react";
import { Users } from "lucide-react";

export default function Employees() {
  return (
    <div className="bg-white rounded border border-slate-200 flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center">
        <Users size={24} className="text-slate-400" />
      </div>
      <div className="text-center">
        <p className="text-[15px] font-bold text-slate-700">Employees</p>
        <p className="text-sm text-slate-400 mt-1">Employee directory coming soon</p>
      </div>
    </div>
  );
}
