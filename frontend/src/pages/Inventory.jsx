import { Boxes } from "lucide-react";

// Placeholder until GRN / Stock / Issue / Transfer / Return are built.
export default function Inventory() {
  return (
    <div className="min-h-full flex flex-col bg-[#f8fafc]">
      <div className="flex items-center gap-2.5 px-5 sm:px-6 py-3.5 bg-white border-b border-slate-200">
        <h1 className="text-[15px] font-bold text-slate-800">Inventory</h1>
      </div>
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-100 flex items-center justify-center">
            <Boxes size={22} className="text-slate-400" />
          </div>
          <p className="text-sm font-bold text-slate-600">Coming soon</p>
          <p className="text-[12px] text-slate-400 mt-1">GRN, Stock, Issue, Transfer and Return will live here.</p>
        </div>
      </div>
    </div>
  );
}
