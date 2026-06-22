import React, { useState, useEffect, useRef } from "react";
import { Lock, Eye, EyeOff, ArrowRight, CheckCircle2 } from "lucide-react";
import api from "../utils/api";

export default function ResetPassword({ onComplete, isInvite = false }) {
  const [password, setPassword]   = useState("");
  const [confirm, setConfirm]     = useState("");
  const [showPw, setShowPw]       = useState(false);
  const [showCf, setShowCf]       = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState("");
  const [success, setSuccess]     = useState(false);
  const [token, setToken]               = useState("");
  const [refreshToken, setRefreshToken] = useState("");
  const [exchanging, setExchanging]     = useState(false);
  const canvasRef = useRef(null);

  // Canvas dot animation — same as Login
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);
    const SPACING = 28, OFFSET = 14, RADIUS = 220;
    let animId, mx = -999, my = -999;
    const draw = (mx, my) => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let x = OFFSET; x < canvas.width; x += SPACING) {
        for (let y = OFFSET; y < canvas.height; y += SPACING) {
          const dist = (mx !== -999) ? Math.hypot(x - mx, y - my) : Infinity;
          let r, g, b, a, radius;
          if (dist < RADIUS) {
            const t = 1 - dist / RADIUS;
            r = Math.round(30 + (148 - 30) * (1 - t));
            g = Math.round(41 + (163 - 41) * (1 - t));
            b = Math.round(59 + (184 - 59) * (1 - t));
            a = 0.25 + t * 0.75; radius = 1.5 + t * 1.0;
          } else { r = 148; g = 163; b = 184; a = 0.4; radius = 1.5; }
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.fill();
        }
      }
    };
    const onMove = (e) => { mx = e.clientX; my = e.clientY; };
    const onLeave = () => { mx = -999; my = -999; };
    const loop = () => { draw(mx, my); animId = requestAnimationFrame(loop); };
    loop();
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      window.removeEventListener("resize", resize);
    };
  }, []);

  // Token extraction
  useEffect(() => {
    const hashParams   = new URLSearchParams(window.location.hash.slice(1));
    const searchParams = new URLSearchParams(window.location.search);

    // Handle Supabase error redirect
    const authErr = hashParams.get("error") || searchParams.get("error");
    const errDesc = hashParams.get("error_description") || searchParams.get("error_description");
    if (authErr) {
      const msg = errDesc ? errDesc.replace(/\+/g, " ") : "Your invite link has expired.";
      setError(`Link expired: ${msg}. Please ask admin to resend the invite.`);
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    // Backend redirect flow (#inv=TOKEN)
    const inv = hashParams.get("inv");
    if (inv) {
      const invType = hashParams.get("type") || "invite";
      setExchanging(true);
      api.post("/api/auth/verify-otp", { token_hash: decodeURIComponent(inv), type: invType })
        .then(({ data }) => { setToken(data.access_token); setRefreshToken(data.refresh_token || ""); window.history.replaceState(null, "", window.location.pathname); })
        .catch(() => setError("Invalid or expired link. Please ask admin to resend the invite."))
        .finally(() => setExchanging(false));
      return;
    }

    // Old hash flow (#access_token=...)
    const t = hashParams.get("access_token");
    const rt = hashParams.get("refresh_token");
    const type = hashParams.get("type");
    if (t && (type === "recovery" || type === "invite")) { setToken(t); setRefreshToken(rt || ""); return; }

    // PKCE query param flow (?token_hash=...&type=...)
    const tokenHash  = searchParams.get("token_hash") || searchParams.get("code");
    const searchType = searchParams.get("type") || (tokenHash ? "invite" : null);
    if (tokenHash && (searchType === "recovery" || searchType === "invite")) {
      setExchanging(true);
      api.post("/api/auth/verify-otp", { token_hash: tokenHash, type: searchType })
        .then(({ data }) => { setToken(data.access_token); setRefreshToken(data.refresh_token || ""); window.history.replaceState(null, "", window.location.pathname); })
        .catch(() => setError("Invalid or expired link. Please request a new invite."))
        .finally(() => setExchanging(false));
      return;
    }

    setError("Invalid or expired link. Please request a new one.");
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return setError("Passwords do not match");
    if (password.length < 8)  return setError("Password must be at least 8 characters");
    setLoading(true); setError("");
    try {
      await api.post("/api/auth/reset-password", { password, refresh_token: refreshToken }, { headers: { Authorization: `Bearer ${token}` } });
      window.history.replaceState(null, "", window.location.pathname);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reset password. Link may have expired.");
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 relative" style={{ backgroundColor: "#e8edf5" }}>
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" />
      <style>{`
        @keyframes floatUp { 0% { transform: translateY(0px) scale(1); opacity: 0; } 10% { opacity: 1; } 90% { opacity: 0.6; } 100% { transform: translateY(-520px) scale(0.6); opacity: 0; } }
        @keyframes floatSway { 0%, 100% { margin-left: 0px; } 50% { margin-left: 18px; } }
        .particle { position: absolute; border-radius: 50%; animation: floatUp linear infinite, floatSway ease-in-out infinite; }
      `}</style>

      <div className="relative z-10 w-full max-w-4xl rounded-md shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-2" style={{ height: 520 }}>

        {/* LEFT: Form */}
        <div className="bg-white flex flex-col justify-center px-10 sm:px-14 py-8">

          {exchanging ? (
            <div className="flex flex-col items-center gap-3 py-8">
              <svg className="animate-spin h-8 w-8 text-teal-500" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              <p className="text-sm text-gray-500 font-medium">Verifying your invite link…</p>
            </div>

          ) : success ? (
            <div className="flex flex-col items-center text-center gap-3 py-8">
              <CheckCircle2 size={48} className="text-teal-500" />
              <h2 className="text-2xl font-bold text-gray-900">Password Set!</h2>
              <p className="text-sm text-gray-500">Your password has been set successfully.</p>
              <button onClick={onComplete} className="mt-4 w-full h-11 rounded-sm bg-[#0f172a] text-white text-xs font-black tracking-widest uppercase hover:bg-[#1e293b] transition flex items-center justify-center gap-2">
                Go to Login <ArrowRight size={14} />
              </button>
            </div>

          ) : (
            <>
              <h2 className="text-3xl font-bold text-gray-900 mb-7">{isInvite ? "Set Password" : "Reset Password"}</h2>

              <form className="space-y-4" onSubmit={handleSubmit}>
                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">New Password</label>
                  <div className="h-11 rounded-sm bg-gray-50 border border-gray-200 flex items-center px-3 gap-2.5 focus-within:border-gray-400 transition-all">
                    <Lock size={14} className="text-gray-400 flex-shrink-0" />
                    <input type={showPw ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)}
                      placeholder="Minimum 8 characters" required
                      className="w-full bg-transparent outline-none text-gray-800 placeholder-gray-400 text-sm" />
                    <button type="button" onClick={() => setShowPw(!showPw)} className="text-gray-400 hover:text-gray-600 transition flex-shrink-0">
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Confirm Password</label>
                  <div className="h-11 rounded-sm bg-gray-50 border border-gray-200 flex items-center px-3 gap-2.5 focus-within:border-gray-400 transition-all">
                    <Lock size={14} className="text-gray-400 flex-shrink-0" />
                    <input type={showCf ? "text" : "password"} value={confirm} onChange={e => setConfirm(e.target.value)}
                      placeholder="Re-enter password" required
                      className="w-full bg-transparent outline-none text-gray-800 placeholder-gray-400 text-sm" />
                    <button type="button" onClick={() => setShowCf(!showCf)} className="text-gray-400 hover:text-gray-600 transition flex-shrink-0">
                      {showCf ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-500 font-medium">{error}</div>
                )}

                <button type="submit" disabled={loading || !token}
                  className="w-full h-11 rounded-sm bg-[#0f172a] text-white text-sm font-bold tracking-wide hover:bg-[#1e293b] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed">
                  {loading ? (
                    <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Saving…</>
                  ) : (
                    <><span className="uppercase tracking-widest text-xs font-black">{isInvite ? "Activate Account" : "Reset Password"}</span><ArrowRight size={15} /></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>

        {/* RIGHT: Brand */}
        <div className="hidden lg:flex flex-col items-center justify-center px-10 py-8 relative overflow-hidden"
          style={{ background: "linear-gradient(160deg, #020c14 0%, #041018 50%, #030e16 100%)" }}>

          {[
            { left: "10%", bottom: "5%",  size: 3, dur: 8,  delay: 0,   color: "rgba(20,184,166,0.7)" },
            { left: "25%", bottom: "10%", size: 2, dur: 11, delay: 2,   color: "rgba(6,182,212,0.5)" },
            { left: "40%", bottom: "0%",  size: 4, dur: 9,  delay: 4,   color: "rgba(20,184,166,0.4)" },
            { left: "60%", bottom: "8%",  size: 2, dur: 13, delay: 1,   color: "rgba(255,255,255,0.3)" },
            { left: "75%", bottom: "3%",  size: 3, dur: 10, delay: 6,   color: "rgba(6,182,212,0.6)" },
            { left: "88%", bottom: "12%", size: 2, dur: 12, delay: 3,   color: "rgba(20,184,166,0.5)" },
          ].map((p, i) => (
            <div key={i} className="particle" style={{ left: p.left, bottom: p.bottom, width: p.size, height: p.size, background: p.color, boxShadow: `0 0 ${p.size * 2}px ${p.color}`, animationDuration: `${p.dur}s, ${p.dur * 1.3}s`, animationDelay: `${p.delay}s, ${p.delay}s` }} />
          ))}

          <div className="relative z-10 flex flex-col items-center text-center">
            <img src="/logo.png" alt="Zyhawk" className="w-60 h-60 object-contain"
              onError={e => { e.target.style.display = "none"; e.target.nextSibling.style.display = "flex"; }} />
            <div style={{ display: "none" }} className="w-56 h-56 items-center justify-center">
              <span className="text-white font-black text-7xl">Z</span>
            </div>
            <div className="mt-8 text-center">
              <p className="text-2xl font-black text-white leading-tight tracking-tight">Welcome to Zyhawk ERP</p>
              <p className="mt-2 text-sm font-medium" style={{ color: "rgba(255,255,255,0.50)" }}>
                {isInvite ? "Set your password to get started." : "Create your new password below."}
              </p>
            </div>
            <div className="mt-4 w-10 h-[2px] rounded-full" style={{ background: "linear-gradient(90deg, #14b8a6, #06b6d4)" }} />
          </div>
        </div>

      </div>
    </div>
  );
}
