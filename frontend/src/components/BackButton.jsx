import { createContext, useContext } from "react";
import { ArrowLeft } from "lucide-react";

// Set by App when the open page sits under a hub (e.g. Registration):
// { label, onBack }. Pages drop <BackButton /> into their header; it shows
// nothing when there's no hub to go back to.
export const BackContext = createContext(null);

export default function BackButton() {
  const back = useContext(BackContext);
  if (!back) return null;
  return (
    <button type="button" onClick={back.onBack} title={`Back to ${back.label}`}
      className="w-8 h-8 shrink-0 rounded-lg border border-slate-200 bg-white flex items-center justify-center text-slate-500 hover:text-slate-800 hover:border-slate-300 hover:bg-slate-50 transition-colors">
      <ArrowLeft size={16} />
    </button>
  );
}
