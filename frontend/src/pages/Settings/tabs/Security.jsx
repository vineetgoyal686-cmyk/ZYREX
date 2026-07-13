import React, { useState } from "react";
import {
  ShieldCheck, Mail, Loader2, SendHorizonal,
  CheckCircle2, Eye, EyeOff, KeyRound,
} from "lucide-react";
import api from "../../../utils/api";
import { inp, lbl, btnPrimary } from "../utils";

export default function Security({ currentUser, showToast }) {
  const [secStep, setSecStep] = useState(1);
  const [otpLoading, setOtpLoading] = useState(false);
  const [otp, setOtp] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  const sendOtp = async () => {
    setOtpLoading(true);
    try {
      await api.post("/api/auth/send-otp", { email: currentUser.email });
      setSecStep(2);
      showToast(`OTP sent to ${currentUser.email}`);
    } catch (err) {
      showToast(err.response?.data?.error || "Failed to send OTP", "error");
    } finally { setOtpLoading(false); }
  };

  const verifyOtpAndChange = async (e) => {
    e.preventDefault();
    if (newPw !== confirmPw) return showToast("Passwords do not match", "error");
    if (newPw.length < 8)    return showToast("Password must be at least 8 characters", "error");
    if (!otp.trim())         return showToast("Enter the OTP", "error");
    setOtpLoading(true);
    try {
      await api.post("/api/auth/verify-otp-change-password", {
        email: currentUser.email, otp, newPassword: newPw,
      });
      showToast("Password changed successfully!");
      setSecStep(1);
      setOtp(""); setNewPw(""); setConfirmPw("");
    } catch (err) {
      showToast(err.response?.data?.error || "Invalid OTP or failed", "error");
    } finally { setOtpLoading(false); }
  };

  return (
    <div className="flex flex-col min-h-full">
      {/* Sticky header — full-width, attached to the Settings sidebar; stays put while the form below scrolls */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 shadow-sm">
        <div className="flex items-center gap-2.5 px-6 py-3.5">
          <div className="w-8 h-8 rounded-sm bg-linear-to-br from-blue-500 to-purple-600 flex items-center justify-center shrink-0">
            <ShieldCheck size={16} className="text-white" />
          </div>
          <h2 className="text-base font-black text-slate-800">Change Password</h2>
        </div>
      </div>

      <div className="p-6">
      <div className="bg-white rounded-none shadow-sm border border-slate-100 p-6 max-w-lg">
      <div className="bg-slate-50 border border-slate-100 rounded-sm px-3 py-2 mb-5">
        <p className="text-xs text-slate-500">OTP will be sent to your email for verification</p>
      </div>
      <div className="flex items-center gap-2 mb-7">
        {[{ n: 1, label: "Send OTP" }, { n: 2, label: "Verify & Set" }].map(({ n, label }) => (
          <React.Fragment key={n}>
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black transition-all
                ${secStep >= n ? "bg-linear-to-br from-blue-600 to-purple-600 text-white shadow" : "bg-slate-100 text-slate-400"}`}>
                {secStep > n ? <CheckCircle2 size={14} /> : n}
              </div>
              <span className={`text-xs font-semibold hidden sm:block ${secStep >= n ? "text-slate-700" : "text-slate-400"}`}>{label}</span>
            </div>
            {n < 2 && <div className={`flex-1 h-px ${secStep > n ? "bg-blue-400" : "bg-slate-200"}`} />}
          </React.Fragment>
        ))}
      </div>

      {secStep === 1 && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-100 rounded-sm">
            <Mail size={18} className="text-blue-500 shrink-0" />
            <div>
              <p className="text-xs font-bold text-blue-700 uppercase tracking-widest">OTP will be sent to</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5">{currentUser.email}</p>
            </div>
          </div>
          <button onClick={sendOtp} disabled={otpLoading} className={btnPrimary}>
            {otpLoading ? <Loader2 size={16} className="animate-spin" /> : <SendHorizonal size={16} />}
            Send OTP to Email
          </button>
        </div>
      )}

      {secStep === 2 && (
        <form onSubmit={verifyOtpAndChange} className="space-y-4">
          <div className="p-3 bg-green-50 border border-green-200 rounded-sm flex items-center gap-2 mb-2">
            <CheckCircle2 size={16} className="text-green-500 shrink-0" />
            <p className="text-sm text-green-700 font-medium">OTP sent to <strong>{currentUser.email}</strong></p>
          </div>

          <div>
            <span className={lbl}>Enter OTP</span>
            <input className={`${inp} text-center text-2xl font-black tracking-[0.4em]`}
              placeholder="• • • • • •" maxLength={8}
              value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} required />
          </div>

          <div>
            <span className={lbl}>New Password</span>
            <div className="relative">
              <input type={showNewPw ? "text" : "password"} className={`${inp} pr-11`}
                placeholder="Minimum 8 characters" value={newPw} autoComplete="new-password"
                onChange={(e) => setNewPw(e.target.value)} required />
              <button type="button" onClick={() => setShowNewPw(!showNewPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div>
            <span className={lbl}>Confirm New Password</span>
            <div className="relative">
              <input type={showConfirmPw ? "text" : "password"} className={`${inp} pr-11`}
                placeholder="Re-enter password" value={confirmPw} autoComplete="new-password"
                onChange={(e) => setConfirmPw(e.target.value)} required />
              <button type="button" onClick={() => setShowConfirmPw(!showConfirmPw)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3 pt-1">
            <button type="submit" disabled={otpLoading} className={btnPrimary}>
              {otpLoading ? <Loader2 size={16} className="animate-spin" /> : <KeyRound size={16} />}
              Verify & Update Password
            </button>
            <button type="button"
              onClick={() => { setSecStep(1); setOtp(""); setNewPw(""); setConfirmPw(""); }}
              className="text-sm text-slate-500 hover:text-slate-700 px-3 py-2 rounded-sm hover:bg-slate-100 transition-colors">
              Resend OTP
            </button>
          </div>
        </form>
      )}
      </div>
      </div>
    </div>
  );
}
