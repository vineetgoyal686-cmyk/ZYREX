/* The one loading animation of the app: the logo's "Z" breathing inside a
   spinning cyan ring. CSS lives in index.css (.zy-*).
   Default: pinned to the middle of the screen, so every loader (app, page,
   table) shows in the same spot and nothing jumps between them.
   full: also covers the screen. compact: stays where it's put, for loaders
   inside a popup. size: the Z's font size in px; text: line under it. */
import { useLayoutEffect, useRef } from "react";

// Every loader's animations are pinned to the page's own animation clock
// (startTime 0 = when the page opened). So when one loader takes over from
// another — first screen → page → table — the ring is exactly where the last
// one was, however late the new one reaches the screen. index.html does the
// same for the first screen.
export const syncToPageClock = (el) => {
  try { el?.getAnimations?.({ subtree: true }).forEach(a => { a.startTime = 0; }); } catch { /* old browser: plain CSS timing */ }
};

export default function BrandLoader({ size, text = "", full = false, compact = false }) {
  const px = size || (compact ? 26 : 52);
  const mark = useRef(null);
  useLayoutEffect(() => { syncToPageClock(mark.current); }, []);
  const cls = full ? "fixed inset-0 z-[9999] flex items-center justify-center bg-[#f8fafc]"
    : compact ? "flex w-full items-center justify-center py-6"
    : "fixed left-1/2 top-1/2 z-40 -translate-x-1/2 -translate-y-1/2 pointer-events-none";
  return (
    <div className={cls} role="status" aria-label={text || "Loading"}>
      <div className="zy-loader" style={{ "--zy-size": `${px}px` }}>
        <div ref={mark} className="zy-mark" aria-hidden="true">
          <span className="zy-track" /><span className="zy-glow" /><span className="zy-ring" />
          <span className="zy-z">Z</span>
        </div>
        {text && <p className="zy-text">{text}</p>}
      </div>
    </div>
  );
}
