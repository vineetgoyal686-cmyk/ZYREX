import React, { useState, useEffect, useRef } from "react";
import { Lock, Eye, EyeOff, Mail, ArrowRight } from "lucide-react";
import api from "../utils/api";

const Login = ({ onLogin }) => {
  const [view, setView] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [forgotEmail, setForgotEmail] = useState("");
  const [forgotSent, setForgotSent] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    resize();
    window.addEventListener("resize", resize);

    const SPACING = 28;
    const OFFSET = 14; // CSS dots center at 14px (28/2) within each tile
    const RADIUS = 220;
    let animId;

    const draw = (mx, my) => {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let x = OFFSET; x < canvas.width; x += SPACING) {
        for (let y = OFFSET; y < canvas.height; y += SPACING) {
          const dist = (mx !== -999) ? Math.hypot(x - mx, y - my) : Infinity;
          let r, g, b, a, radius;
          if (dist < RADIUS) {
            const t = 1 - dist / RADIUS;
            // near cursor: dark/black, bold
            r = Math.round(30 + (148 - 30) * (1 - t));
            g = Math.round(41 + (163 - 41) * (1 - t));
            b = Math.round(59 + (184 - 59) * (1 - t));
            a = 0.25 + t * 0.75;
            radius = 1.5 + t * 1.0;
          } else {
            r = 148; g = 163; b = 184; a = 0.4; radius = 1.5;
          }
          ctx.beginPath();
          ctx.arc(x, y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
          ctx.fill();
        }
      }
    };

    let mx = -999, my = -999;
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

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      localStorage.setItem("bms_token", data.token);
      localStorage.setItem("bms_user", JSON.stringify(data.user));
      if (data.refresh_token) {
        localStorage.setItem("bms_refresh_token", data.refresh_token);
      }
      onLogin(data.user);
    } catch (err) {
      setError(err.response?.data?.error || "Login failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.post("/api/auth/forgot-password", { email: forgotEmail });
      setForgotSent(true);
    } catch {
      setError("Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-4 relative"
      style={{ backgroundColor: "#e8edf5" }}
    >
      {/* Canvas — teal dots appear at cursor */}
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-0" />
      <style>{`
        @keyframes floatUp {
          0%   { transform: translateY(0px) scale(1); opacity: 0; }
          10%  { opacity: 1; }
          90%  { opacity: 0.6; }
          100% { transform: translateY(-520px) scale(0.6); opacity: 0; }
        }
        @keyframes floatSway {
          0%, 100% { margin-left: 0px; }
          50%       { margin-left: 18px; }
        }
        .particle {
          position: absolute;
          border-radius: 50%;
          animation: floatUp linear infinite, floatSway ease-in-out infinite;
        }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus,
        input:-webkit-autofill:active {
          -webkit-text-fill-color: #1f2937 !important;
          -webkit-box-shadow: 0 0 0 1000px #f9fafb inset !important;
          box-shadow: 0 0 0 1000px #f9fafb inset !important;
          caret-color: #1f2937;
        }
      `}</style>

      {/* Card */}
      <div className="relative z-10 w-full max-w-4xl rounded-md shadow-xl overflow-hidden grid grid-cols-1 lg:grid-cols-2" style={{ height: 560 }}>

        {/* ── LEFT: Form (white) ── */}
        <div className="bg-white flex flex-col justify-center px-10 sm:px-14 py-8">

          <a href="https://zyhawk.in" className="inline-flex items-center gap-1 text-[11px] text-gray-400 hover:text-gray-600 transition mb-6 w-fit">
            ← Back to website
          </a>

          <h2 className="text-3xl font-bold text-gray-900 mb-7">Login</h2>

          {view === "login" ? (
            <form className="space-y-4" onSubmit={handleLogin}>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Email Address</label>
                <div className="h-11 rounded-sm bg-gray-50 border border-gray-200 flex items-center px-3 gap-2.5 focus-within:border-gray-400 transition-all">
                  <Mail size={14} className="text-gray-400 flex-shrink-0" />
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="name@company.com"
                    required
                    className="w-full bg-transparent outline-none text-gray-800 placeholder-gray-400 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Password</label>
                <div className="h-11 rounded-sm bg-gray-50 border border-gray-200 flex items-center px-3 gap-2.5 focus-within:border-gray-400 transition-all">
                  <Lock size={14} className="text-gray-400 flex-shrink-0" />
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    required
                    className="w-full bg-transparent outline-none text-gray-800 placeholder-gray-400 text-sm"
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="text-gray-400 hover:text-gray-600 transition flex-shrink-0">
                    {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-500 font-medium">{error}</div>
              )}

              <div className="flex justify-end">
                <button type="button" onClick={() => { setView("forgot"); setError(""); }} className="text-[11px] text-teal-500 hover:text-teal-400 font-semibold transition">
                  Forgot Password?
                </button>
              </div>

              <label className="flex items-center gap-2 text-gray-400 cursor-pointer select-none text-xs">
                <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)} className="w-3.5 h-3.5 accent-teal-500 rounded" />
                Remember me
              </label>

              <button
                type="submit"
                disabled={loading}
                className="w-full h-11 rounded-sm bg-[#0f172a] text-white text-sm font-bold tracking-wide hover:bg-[#1e293b] active:scale-[0.99] transition-all flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Signing in...</>
                ) : (
                  <><span className="uppercase tracking-widest text-xs font-black">Sign In</span><ArrowRight size={15} /></>
                )}
              </button>

            </form>

          ) : (
            <div>
              <button onClick={() => { setView("login"); setError(""); setForgotSent(false); }} className="mb-5 text-xs text-gray-400 hover:text-gray-700 transition flex items-center gap-1">
                ← Back to Sign In
              </button>

              {forgotSent ? (
                <div className="rounded-xl border border-green-200 bg-green-50 p-5 text-center">
                  <Mail size={28} className="mx-auto mb-2 text-green-500" />
                  <p className="text-sm font-semibold text-green-700">Reset link sent!</p>
                  <p className="text-xs text-green-600 mt-1">Check your inbox to reset your password.</p>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">Email Address</label>
                    <div className="h-11 rounded-lg border border-gray-200 bg-gray-50 flex items-center px-3 gap-2.5 focus-within:border-teal-400 focus-within:ring-2 focus-within:ring-teal-400/20 transition-all">
                      <Mail size={15} className="text-gray-400" />
                      <input type="email" value={forgotEmail} onChange={e => setForgotEmail(e.target.value)} placeholder="you@company.com" required className="w-full bg-transparent outline-none text-gray-800 placeholder-gray-400 text-sm" />
                    </div>
                  </div>
                  {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-500">{error}</div>}
                  <button type="submit" disabled={loading} className="w-full h-11 rounded-lg bg-gradient-to-r from-teal-500 to-cyan-400 text-white text-sm font-bold hover:scale-[1.015] transition-all disabled:opacity-60">
                    {loading ? "Sending..." : "Send Reset Link"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>

        {/* ── RIGHT: Brand (dark) ── */}
        <div className="hidden lg:flex flex-col items-center justify-center px-10 py-8 relative overflow-hidden"
          style={{ background: "linear-gradient(160deg, #020c14 0%, #041018 50%, #030e16 100%)" }}>



          {/* Floating particles */}
          {[
            { left: "10%",  bottom: "5%",  size: 3, dur: 8,  delay: 0,   color: "rgba(20,184,166,0.7)" },
            { left: "25%",  bottom: "10%", size: 2, dur: 11, delay: 2,   color: "rgba(6,182,212,0.5)" },
            { left: "40%",  bottom: "0%",  size: 4, dur: 9,  delay: 4,   color: "rgba(20,184,166,0.4)" },
            { left: "60%",  bottom: "8%",  size: 2, dur: 13, delay: 1,   color: "rgba(255,255,255,0.3)" },
            { left: "75%",  bottom: "3%",  size: 3, dur: 10, delay: 6,   color: "rgba(6,182,212,0.6)" },
            { left: "88%",  bottom: "12%", size: 2, dur: 12, delay: 3,   color: "rgba(20,184,166,0.5)" },
            { left: "18%",  bottom: "20%", size: 2, dur: 15, delay: 7,   color: "rgba(255,255,255,0.2)" },
            { left: "52%",  bottom: "15%", size: 3, dur: 14, delay: 5,   color: "rgba(20,184,166,0.35)" },
            { left: "33%",  bottom: "25%", size: 2, dur: 10, delay: 9,   color: "rgba(6,182,212,0.4)" },
            { left: "80%",  bottom: "30%", size: 2, dur: 16, delay: 2.5, color: "rgba(20,184,166,0.3)" },
          ].map((p, i) => (
            <div key={i} className="particle" style={{
              left: p.left, bottom: p.bottom,
              width: p.size, height: p.size,
              background: p.color,
              boxShadow: `0 0 ${p.size * 2}px ${p.color}`,
              animationDuration: `${p.dur}s, ${p.dur * 1.3}s`,
              animationDelay: `${p.delay}s, ${p.delay}s`,
            }} />
          ))}

          {/* Logo + tagline */}
          <div className="relative z-10 flex flex-col items-center text-center">
            <img
              src="/logo.png"
              alt="Zyhawk"
              className="w-60 h-60 object-contain"
              onError={e => {
                e.target.style.display = 'none';
                e.target.nextSibling.style.display = 'flex';
              }}
            />
            <div style={{ display: 'none' }} className="w-56 h-56 items-center justify-center">
              <span className="text-white font-black text-7xl">Z</span>
            </div>

            <div className="mt-8 text-center">
              <p className="text-2xl font-black text-white leading-tight tracking-tight">Welcome to Zyhawk ERP</p>
              <p className="mt-2 text-sm font-medium" style={{ color: "rgba(255,255,255,0.50)" }}>
                Your business, fully in control.
              </p>
            </div>

            <div className="mt-4 w-10 h-[2px] rounded-full" style={{ background: "linear-gradient(90deg, #14b8a6, #06b6d4)" }} />
          </div>
        </div>

      </div>
    </div>
  );
};

export default Login;
