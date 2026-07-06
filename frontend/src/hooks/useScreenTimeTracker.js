import { useEffect, useRef } from "react";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";
const TICK_MS = 15000;      // how often we check activity and accrue seconds
const FLUSH_MS = 30000;     // how often we send accumulated seconds to the backend
const IDLE_LIMIT_MS = 5 * 60 * 1000; // stop counting after 5 min with no input

// Tracks active (visible + focused + not-idle) time spent on the current
// module and periodically reports it to /api/screen-time/heartbeat.
// Uses fixed-quantum accrual (always +TICK seconds per tick when conditions
// hold) instead of timestamp deltas, so a laptop sleep/resume can't inflate
// the count with one giant delta.
export function useScreenTimeTracker(moduleKey) {
  const secondsRef = useRef(0);
  const lastActivityRef = useRef(null);
  const moduleKeyRef = useRef(moduleKey);

  const flush = (keyOverride) => {
    const key = keyOverride || moduleKeyRef.current;
    const seconds = secondsRef.current;
    if (!key || seconds <= 0) return;
    secondsRef.current = 0;
    const token = localStorage.getItem("bms_token");
    if (!token) return;
    fetch(`${API}/api/screen-time/heartbeat`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ module_key: key, seconds }),
    }).catch(() => { /* silent — best-effort telemetry */ });
  };

  const flushBeacon = () => {
    const key = moduleKeyRef.current;
    const seconds = secondsRef.current;
    if (!key || seconds <= 0) return;
    secondsRef.current = 0;
    const token = localStorage.getItem("bms_token");
    if (!token) return;
    // sendBeacon can't set an Authorization header, so the token travels in the body.
    const blob = new Blob(
      [JSON.stringify({ module_key: key, seconds, token })],
      { type: "application/json" }
    );
    navigator.sendBeacon?.(`${API}/api/screen-time/heartbeat-beacon`, blob);
  };

  useEffect(() => {
    lastActivityRef.current = Date.now();
    const markActive = () => { lastActivityRef.current = Date.now(); };
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, markActive, { passive: true }));

    const tickId = setInterval(() => {
      if (!moduleKeyRef.current) return; // not logged in / no module yet — nothing to attribute time to
      const isVisible = document.visibilityState === "visible";
      const isFocused = document.hasFocus();
      const isActive = Date.now() - lastActivityRef.current < IDLE_LIMIT_MS;
      if (isVisible && isFocused && isActive) {
        secondsRef.current += TICK_MS / 1000;
      }
    }, TICK_MS);

    const flushId = setInterval(() => flush(), FLUSH_MS);

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushBeacon);
    window.addEventListener("beforeunload", flushBeacon);

    return () => {
      events.forEach(e => window.removeEventListener(e, markActive));
      clearInterval(tickId);
      clearInterval(flushId);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushBeacon);
      window.removeEventListener("beforeunload", flushBeacon);
    };
  }, []);

  // On module switch, flush the previous module's accumulated seconds first.
  useEffect(() => {
    if (moduleKeyRef.current !== moduleKey) {
      flush(moduleKeyRef.current);
      moduleKeyRef.current = moduleKey;
    }
  }, [moduleKey]);
}
