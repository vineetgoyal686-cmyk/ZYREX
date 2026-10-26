import { Wallet } from "lucide-react";

// Finance › Salary — the tab is in place; payroll is built on top of it later.
export default function Salary() {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Wallet size={22} />
      </div>
      <h1 className="text-lg font-bold text-slate-800">Salary</h1>
      <p className="text-sm text-slate-400">Coming soon</p>
    </div>
  );
}
