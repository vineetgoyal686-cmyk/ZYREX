import { CheckCircle2, XCircle } from "lucide-react";

export default function Toast({ msg, type }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-sm px-5 py-3 shadow-lg text-sm font-semibold
      ${type === "success" ? "bg-green-50 border border-green-200 text-green-700" : "bg-red-50 border border-red-200 text-red-700"}`}>
      {type === "success" ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
      {msg}
    </div>
  );
}
