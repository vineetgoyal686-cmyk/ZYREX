// Runs fn every `ms` while this browser tab is visible, and once on coming
// back to the tab if the last run is older than a minute. A tab left open in
// the background makes no requests — every request costs Supabase quota
// (API logs, egress), and nobody is looking at a hidden tab.
// Returns a cleanup function for useEffect.
export function pollWhenVisible(fn, ms) {
  let last = Date.now();
  const run = () => { last = Date.now(); fn(); };
  const id = setInterval(() => { if (!document.hidden) run(); }, ms);
  const onVisible = () => { if (!document.hidden && Date.now() - last > 60_000) run(); };
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    clearInterval(id);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
