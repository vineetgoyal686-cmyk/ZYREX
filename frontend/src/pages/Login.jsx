import React, { useState, useRef } from "react";
import {
  User,
  Lock,
  Eye,
  EyeOff,
  Mail,
  ArrowLeft,
  ShieldCheck,
  Grid2X2,
  BarChart3,
  Box,
  ArrowRight,
  Instagram,
  Linkedin,
  Youtube,
  Facebook,
} from "lucide-react";
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
  const bgRef = useRef(null);

  const handleMouseMove = (e) => {
    const el = bgRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${x}%`);
    el.style.setProperty("--my", `${y}%`);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const { data } = await api.post("/api/auth/login", { email, password });
      const userToStore = { ...data.user };
      localStorage.setItem("bms_token", data.token);
      localStorage.setItem("bms_user", JSON.stringify(userToStore));
      onLogin(userToStore);
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

  const features = [
    { label: "Dashboard", icon: Grid2X2 },
    { label: "Analytics", icon: BarChart3 },
    { label: "Inventory", icon: Box },
    { label: "Security", icon: ShieldCheck },
  ];

  const socials = [
    { name: "Instagram", icon: Instagram, color: "text-pink-400" },
    { name: "LinkedIn", icon: Linkedin, color: "text-sky-400" },
    { name: "YouTube", icon: Youtube, color: "text-red-500" },
    { name: "Facebook", icon: Facebook, color: "text-blue-500" },
  ];

  return (
    <div
      ref={bgRef}
      onMouseMove={handleMouseMove}
      className="zx-cursor-bg relative min-h-screen w-full bg-[#020812] flex items-center justify-center p-2 sm:p-3 font-sans overflow-x-hidden"
      style={{ "--mx": "50%", "--my": "50%" }}
    >
      <style>{`
        .zx-cursor-bg::before {
          content: "";
          position: absolute; inset: 0;
          background:
            radial-gradient(600px circle at var(--mx) var(--my), rgba(34,211,238,0.18), transparent 40%),
            radial-gradient(900px circle at var(--mx) var(--my), rgba(20,184,166,0.10), transparent 55%);
          transition: background 0.15s ease-out;
          pointer-events: none;
          z-index: 0;
        }
        .zx-cursor-bg::after {
          content: "";
          position: absolute; inset: 0;
          background-image:
            linear-gradient(rgba(34,211,238,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(34,211,238,0.06) 1px, transparent 1px);
          background-size: 40px 40px;
          mask-image: radial-gradient(500px circle at var(--mx) var(--my), black 0%, transparent 70%);
          -webkit-mask-image: radial-gradient(500px circle at var(--mx) var(--my), black 0%, transparent 70%);
          pointer-events: none;
          z-index: 0;
        }
        @keyframes zx-orb { 0% { transform: translate(0,0); } 50% { transform: translate(30px,-20px); } 100% { transform: translate(0,0); } }
        .zx-orb { animation: zx-orb 12s ease-in-out infinite; }
        @keyframes zx-fade-up { 0% { opacity: 0; transform: translateY(24px); } 100% { opacity: 1; transform: translateY(0); } }
        @keyframes zx-fade-in { 0% { opacity: 0; } 100% { opacity: 1; } }
        @keyframes zx-float { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }
        @keyframes zx-glow { 0%,100% { box-shadow: 0 0 0 0 rgba(34,211,238,0); } 50% { box-shadow: 0 0 40px 6px rgba(34,211,238,0.18); } }
        @keyframes zx-pop { 0% { opacity: 0; transform: scale(.85); } 100% { opacity: 1; transform: scale(1); } }
        .zx-fade-up { animation: zx-fade-up .7s cubic-bezier(.2,.7,.2,1) both; }
        .zx-fade-in { animation: zx-fade-in .9s ease-out both; }
        .zx-float { animation: zx-float 4.5s ease-in-out infinite; }
        .zx-glow { animation: zx-glow 3.5s ease-in-out infinite; }
        .zx-pop { animation: zx-pop .5s cubic-bezier(.2,.9,.3,1.2) both; }
        .zx-input:-webkit-autofill,
        .zx-input:-webkit-autofill:hover,
        .zx-input:-webkit-autofill:focus,
        .zx-input:-webkit-autofill:active {
          -webkit-text-fill-color: #ffffff !important;
          -webkit-box-shadow: 0 0 0 1000px transparent inset !important;
          box-shadow: 0 0 0 1000px transparent inset !important;
          transition: background-color 9999s ease-in-out 0s;
          caret-color: #ffffff;
        }
      `}</style>
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="zx-orb absolute top-10 left-10 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="zx-orb absolute bottom-10 right-20 h-96 w-96 rounded-full bg-teal-500/10 blur-3xl" style={{ animationDelay: "3s" }} />
        <div className="zx-orb absolute top-1/2 left-1/3 h-72 w-72 rounded-full bg-sky-500/10 blur-3xl" style={{ animationDelay: "6s" }} />
      </div>
      <div className="zx-fade-in relative z-10 w-full max-w-7xl lg:h-full lg:max-h-[880px] rounded-2xl sm:rounded-3xl border border-cyan-500/20 bg-[#06111f]/90 backdrop-blur-sm shadow-2xl overflow-hidden grid grid-cols-1 lg:grid-cols-2">

        {/* LEFT SECTION */}
        <div className="relative flex flex-col items-center justify-center px-4 sm:px-8 py-6 text-center bg-[#06111f] overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,#003b46_0%,transparent_55%)] opacity-60" />
          <div className="absolute -top-24 -left-24 h-72 w-72 rounded-full bg-cyan-500/10 blur-3xl zx-glow" />
          <div className="absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-teal-500/10 blur-3xl zx-glow" style={{ animationDelay: "1.5s" }} />

          <div className="relative z-10 w-full flex flex-col items-center">
            <img
              src="/logo.png"
              alt="Zyrex Logo"
              className="w-64 sm:w-96 lg:w-[36rem] max-w-[95%] mx-auto -mt-2 sm:-mt-4 -mb-2 object-contain drop-shadow-[0_22px_55px_rgba(34,211,238,0.4)] zx-float"
            />

            <div className="zx-fade-up" style={{ animationDelay: ".15s" }}>
              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white">
                Smart ERP.{" "}
                <span className="text-cyan-400">Powerful Results.</span>
              </h2>
              <p className="mt-3 sm:mt-4 text-gray-300 text-sm sm:text-base lg:text-lg leading-relaxed max-w-xl mx-auto">
                Manage your entire business with intelligence, automation and real-time insights.
              </p>
            </div>

            <div className="grid grid-cols-4 gap-3 sm:gap-6 mt-6 sm:mt-10">
              {features.map(({ label, icon: Icon }, i) => (
                <div
                  key={label}
                  className="flex flex-col items-center zx-pop cursor-pointer group"
                  style={{ animationDelay: `${0.25 + i * 0.1}s` }}
                >
                  <div className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 rounded-xl sm:rounded-2xl border border-cyan-500/20 bg-white/5 flex items-center justify-center text-cyan-400 shadow-lg shadow-cyan-500/5 transition-all duration-300 group-hover:-translate-y-1 group-hover:border-cyan-400 group-hover:bg-cyan-400/10 group-hover:shadow-cyan-500/30">
                    <Icon size={22} strokeWidth={2} className="sm:w-7 sm:h-7" />
                  </div>
                  <p className="mt-2 text-white text-xs sm:text-sm">{label}</p>
                  <div className="w-10 h-[3px] bg-cyan-400 mt-2 rounded-full transition-all duration-300 group-hover:w-16" />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT SECTION */}
        <div className="relative flex items-center justify-center p-4 sm:p-6 lg:p-10 bg-[#020812] lg:overflow-y-auto">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(34,211,238,0.08),transparent_60%)]" />
          {view === "login" ? (
            <div className="zx-fade-up relative w-full lg:h-full flex flex-col justify-center max-w-2xl mx-auto px-1 sm:px-2 lg:px-8 py-2 sm:py-4">
              <p className="text-cyan-400 font-bold text-sm sm:text-base mb-2">Welcome Back</p>

              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-3">
                Login to <span className="text-cyan-400">your account</span>
              </h2>

              <div className="w-16 h-1 bg-cyan-400 rounded-full mb-6" />

              <form className="space-y-4" onSubmit={handleLogin}>
                <div>
                  <label className="block text-white text-base font-semibold mb-2">Email Address</label>
                  <div className="h-14 rounded-xl border border-cyan-400 flex items-center px-4 gap-3 focus-within:ring-2 focus-within:ring-cyan-500/40 transition">
                    <User className="text-cyan-400" size={20} />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@zyrex.app"
                      required
                      className="zx-input w-full bg-transparent outline-none text-white placeholder-gray-500 text-base"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-white text-base font-semibold mb-2">Password</label>
                  <div className="h-14 rounded-xl border border-slate-600 flex items-center px-4 gap-3 focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-500/40 transition">
                    <Lock className="text-gray-400" size={20} />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter your password"
                      required
                      className="zx-input w-full bg-transparent outline-none text-white placeholder-gray-500 text-base"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="text-gray-400 hover:text-gray-200 transition"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
                    {error}
                  </div>
                )}

                <div className="flex items-center justify-between text-base">
                  <label className="flex items-center gap-2 text-white">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      className="w-4 h-4 accent-cyan-400"
                    />
                    Remember me
                  </label>
                  <button
                    type="button"
                    onClick={() => { setView("forgot"); setError(""); }}
                    className="text-cyan-400 hover:text-cyan-300 transition"
                  >
                    Forgot Password?
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-14 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-400 text-white text-lg font-bold shadow-lg shadow-cyan-500/20 hover:scale-[1.02] transition flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {loading ? "Logging in..." : "Login Now"}
                  {!loading && <ArrowRight size={22} />}
                </button>
              </form>

              <div className="flex items-center gap-4 mt-6 mb-4">
                <div className="h-px flex-1 bg-slate-700" />
                <div className="w-12 h-1 bg-cyan-400 rounded-full" />
                <div className="h-px flex-1 bg-slate-700" />
              </div>

              <div className="grid grid-cols-4 gap-4">
                {socials.map(({ name, icon: Icon, color }, i) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    style={{ animationDelay: `${0.4 + i * 0.08}s` }}
                    className={`zx-pop h-14 rounded-2xl border border-cyan-500/15 bg-white/5 flex items-center justify-center ${color} hover:border-cyan-400 hover:bg-cyan-400/10 hover:-translate-y-1 hover:scale-105 transition-all duration-300`}
                  >
                    <Icon size={24} />
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-center gap-2 text-gray-300 text-sm mt-5 text-center">
                <Lock size={14} />
                <span>Your data is <span className="text-cyan-400">secure</span> with enterprise-grade encryption</span>
              </div>
            </div>
          ) : (
            <div className="relative w-full lg:h-full flex flex-col justify-center max-w-2xl mx-auto px-1 sm:px-2 lg:px-8 py-2 sm:py-4">
              <button
                onClick={() => { setView("login"); setError(""); setForgotSent(false); }}
                className="mb-6 flex w-fit items-center gap-2 text-sm text-slate-400 hover:text-slate-200 transition"
              >
                <ArrowLeft size={16} /> Back to Login
              </button>

              <h2 className="text-3xl sm:text-4xl font-bold text-white mb-3">Forgot Password</h2>
              <p className="text-base text-slate-400">
                {forgotSent ? "Check your email for the reset link." : "Enter your registered email address."}
              </p>
              <div className="mt-4 mb-8 h-1 w-16 rounded-full bg-cyan-400" />

              {forgotSent ? (
                <div className="rounded-2xl border border-green-400/30 bg-green-500/10 px-6 py-5 text-center">
                  <Mail size={34} className="mx-auto mb-3 text-green-400" />
                  <p className="text-sm font-semibold text-green-300">Reset link sent!</p>
                  <p className="mt-1 text-xs text-green-200/80">Check your inbox and click the link to set a new password.</p>
                </div>
              ) : (
                <form onSubmit={handleForgot} className="space-y-6">
                  <div>
                    <label className="block text-white text-base font-semibold mb-2">Email Address</label>
                    <div className="h-14 rounded-xl border border-cyan-400 flex items-center px-4 gap-3">
                      <Mail className="text-cyan-400" size={20} />
                      <input
                        type="email"
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="you@zyrex.app"
                        required
                        className="zx-input w-full bg-transparent outline-none text-white placeholder-gray-500 text-base"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm font-medium text-red-300">
                      {error}
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full h-14 rounded-xl bg-gradient-to-r from-teal-600 to-cyan-400 text-white text-lg font-bold shadow-lg shadow-cyan-500/20 hover:scale-[1.02] transition disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {loading ? "Sending..." : "Send Reset Link"}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Login;
