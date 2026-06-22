import React, { useState, useEffect } from "react";
import { Lock, Eye, EyeOff, CheckCircle2, ArrowRight, Loader2 } from "lucide-react";
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

  useEffect(() => {
    const hashParams   = new URLSearchParams(window.location.hash.slice(1));
    const searchParams = new URLSearchParams(window.location.search);

    // Handle Supabase error redirect (e.g. expired link)
    const authErr = hashParams.get("error") || searchParams.get("error");
    const errDesc = hashParams.get("error_description") || searchParams.get("error_description");
    if (authErr) {
      const msg = errDesc ? errDesc.replace(/\+/g, " ") : "Your invite link has expired.";
      setError(`Link expired or invalid: ${msg}. Please ask admin to resend the invite.`);
      window.history.replaceState(null, "", window.location.pathname);
      return;
    }

    // 0. Backend redirect flow (#inv=TOKEN_HASH&type=invite) — most reliable
    const inv = hashParams.get("inv");
    if (inv) {
      const invType = hashParams.get("type") || "invite";
      setExchanging(true);
      api.post("/api/auth/verify-otp", { token_hash: decodeURIComponent(inv), type: invType })
        .then(({ data }) => {
          setToken(data.access_token);
          setRefreshToken(data.refresh_token || "");
          window.history.replaceState(null, "", window.location.pathname);
        })
        .catch(() => setError("Invalid or expired link. Please ask admin to resend the invite."))
        .finally(() => setExchanging(false));
      return;
    }

    // 1. Try old hash-based flow first (#access_token=...&type=invite/recovery)
    const t    = hashParams.get("access_token");
    const rt   = hashParams.get("refresh_token");
    const type = hashParams.get("type");
    if (t && (type === "recovery" || type === "invite")) {
      setToken(t);
      setRefreshToken(rt || "");
      return;
    }

    // 2. Try new PKCE flow (?token_hash=... or ?code=...&type=invite/recovery)
    const tokenHash  = searchParams.get("token_hash") || searchParams.get("code");
    const searchType = searchParams.get("type") || (tokenHash ? "invite" : null);
    if (tokenHash && (searchType === "recovery" || searchType === "invite")) {
      setExchanging(true);
      api.post("/api/auth/verify-otp", { token_hash: tokenHash, type: searchType })
        .then(({ data }) => {
          setToken(data.access_token);
          setRefreshToken(data.refresh_token || "");
          // Clean URL so refresh doesn't re-trigger
          window.history.replaceState(null, "", window.location.pathname);
        })
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

    setLoading(true);
    setError("");
    try {
      await api.post(
        "/api/auth/reset-password",
        { password, refresh_token: refreshToken },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      // Clear the hash so refreshing doesn't re-trigger this page
      window.history.replaceState(null, "", window.location.pathname);
      setSuccess(true);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to reset password. Link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen w-full items-center justify-center bg-gradient-to-br from-slate-900 via-gray-900 to-blue-900 p-6 relative overflow-hidden">
      {/* Background blobs */}
      <div className="absolute -top-40 -right-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-purple-500/10 rounded-full blur-3xl animate-pulse" />
      <div className="absolute inset-0 bg-[radial-gradient(#2d3748_1px,transparent_1px)] [background-size:40px_40px] opacity-10" />

      <div className="relative z-10 w-full max-w-md bg-white/90 backdrop-blur-xl rounded-[2rem] shadow-2xl shadow-blue-500/20 border border-white/30 px-8 py-10">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center shadow-lg">
            <Lock size={24} className="text-white" />
          </div>
        </div>

        {exchanging ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 size={32} className="animate-spin text-blue-600" />
            <p className="text-sm text-gray-500 font-medium">Verifying your invite link…</p>
          </div>
        ) : success ? (
          <div className="text-center">
            <div className="flex justify-center mb-4">
              <CheckCircle2 size={48} className="text-green-500" />
            </div>
            <h2 className="text-2xl font-black text-gray-900 mb-2">Password Reset!</h2>
            <p className="text-sm text-gray-500 mb-6">Your password has been updated successfully.</p>
            <button
              onClick={onComplete}
              className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 py-3.5 text-sm font-bold uppercase tracking-widest text-white shadow-lg hover:shadow-xl transition-all flex items-center justify-center gap-2"
            >
              Go to Login <ArrowRight size={16} />
            </button>
          </div>
        ) : (
          <>
            <div className="mb-7">
              <h2 className="text-3xl font-black text-gray-900 leading-none">{isInvite ? "Set Your Password" : "Set New Password"}</h2>
              <p className="mt-2 text-sm text-gray-500">{isInvite ? "Welcome! Set a password to activate your account." : "Choose a strong password for your account."}</p>
              <div className="mt-3 h-1 w-16 bg-gradient-to-r from-blue-600 to-purple-600 rounded-full" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 block">New Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                  <input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-2xl bg-white/80 py-3.5 pl-11 pr-11 text-sm font-medium text-gray-800 outline-none border-2 border-gray-200 focus:border-blue-500 focus:bg-white transition-all shadow-sm"
                    placeholder="Minimum 8 characters"
                    required
                  />
                  <button type="button" onClick={() => setShowPw(!showPw)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold uppercase tracking-widest text-gray-500 block">Confirm Password</label>
                <div className="relative group">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 group-focus-within:text-blue-600 transition-colors" size={18} />
                  <input
                    type={showCf ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="w-full rounded-2xl bg-white/80 py-3.5 pl-11 pr-11 text-sm font-medium text-gray-800 outline-none border-2 border-gray-200 focus:border-blue-500 focus:bg-white transition-all shadow-sm"
                    placeholder="Re-enter password"
                    required
                  />
                  <button type="button" onClick={() => setShowCf(!showCf)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors">
                    {showCf ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-600 font-medium">
                  {error}
                </div>
              )}

              <div className="pt-1">
                <button
                  type="submit"
                  disabled={loading || !token}
                  className="w-full rounded-2xl bg-gradient-to-r from-blue-600 to-purple-600 py-3.5 text-sm font-bold uppercase tracking-widest text-white shadow-lg shadow-blue-500/30 transition-all hover:shadow-xl disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? "UPDATING..." : "RESET PASSWORD"}
                </button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
