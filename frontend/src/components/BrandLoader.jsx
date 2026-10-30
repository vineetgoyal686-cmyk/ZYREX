/* The one loading animation of the app: the logo's "Z" breathing inside a
   spinning cyan ring. CSS lives in index.css (.zy-*).
   Default: pinned to the middle of the screen, so every loader (app, page,
   table) shows in the same spot and nothing jumps between them.
   full: also covers the screen. compact: stays where it's put, for loaders
   inside a popup. size: the Z's font size in px; text: line under it. */
import { useEffect, useState } from "react";

// must match index.css / index.html (zy-breathe / zy-glow 1.8s, zy-spin 1.1s)
const BREATHE = 1800, SPIN = 1100;

// Loaders that follow each other (first screen → page → table) share one
// start time, so the motion carries on instead of jumping back to its start.
// A loader after a quiet moment starts fresh.
const HANDOVER_MS = 500;
let spellStart = typeof window !== "undefined" ? window.__zyStart ?? null : null; // set by index.html
let showing = 0, lastHidden = -Infinity, first = true;
const startTime = () => {
  const now = performance.now();
  // the very first one carries on from the index.html screen
  if (first) { first = false; if (spellStart == null) spellStart = now; return spellStart; }
  if (showing === 0 && now - lastHidden > HANDOVER_MS) spellStart = now;
  return spellStart;
};

export default function BrandLoader({ size, text = "", full = false, compact = false }) {
  const px = size || (compact ? 26 : 52);
  const [elapsed] = useState(() => performance.now() - startTime());
  useEffect(() => {
    showing++;
    return () => { showing--; lastHidden = performance.now(); };
  }, []);
  const cls = full ? "fixed inset-0 z-[9999] flex items-center justify-center bg-[#f8fafc]"
    : compact ? "flex w-full items-center justify-center py-6"
    : "fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 pointer-events-none";
  return (
    <div className={cls} role="status" aria-label={text || "Loading"}>
      <div className="zy-loader" style={{
        "--zy-size": `${px}px`,
        "--zy-d1": `${-(elapsed % BREATHE)}ms`,
        "--zy-d2": `${-(elapsed % SPIN)}ms`,
      }}>
        <div className="zy-mark" aria-hidden="true">
          <span className="zy-track" /><span className="zy-glow" /><span className="zy-ring" />
          <span className="zy-z">Z</span>
        </div>
        {text && <p className="zy-text">{text}</p>}
      </div>
    </div>
  );
}
