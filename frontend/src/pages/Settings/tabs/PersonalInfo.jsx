import React, { useState, useRef, useEffect } from "react";
import {
  UserCircle, Mail, Phone, Building2, Briefcase, Camera,
  FolderOpen, Trash2, Save, Loader2, Pencil, LayoutDashboard, X, ShieldAlert,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import api from "../../../utils/api";
import { ROLE_BADGE } from "../constants";
import { inp, lbl, resizeImage, resizeSignature } from "../utils";

const GRADIENTS = [
  { name: "Midnight", value: "linear-gradient(135deg, #1a1f3c 0%, #2d1b69 100%)" },
  { name: "Ocean",    value: "linear-gradient(135deg, #0f172a 0%, #2563eb 100%)" },
  { name: "Sunset",   value: "linear-gradient(135deg, #4c1d95 0%, #db2777 100%)" },
  { name: "Emerald",  value: "linear-gradient(135deg, #064e3b 0%, #059669 100%)" },
  { name: "Coal",     value: "linear-gradient(135deg, #111827 0%, #374151 100%)" },
  { name: "Royal",    value: "linear-gradient(135deg, #1e1b4b 0%, #4338ca 100%)" },
];

export default function PersonalInfo({ currentUser, showToast, onProfileUpdate, designations = [] }) {
  const uiSettings = currentUser.profile_permissions?.ui || {};
  const roleLabel = ROLE_BADGE[currentUser.role]?.label || "User";

  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState({
    name:       currentUser.name       || "",
    contact_no: currentUser.contact_no || "",
  });

  const [avatar, setAvatar]               = useState(currentUser.avatar || null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarLightbox, setAvatarLightbox] = useState(false);

  const [coverImage, setCoverImage]       = useState(uiSettings.cover_image || null);
  const [coverLoading, setCoverLoading]   = useState(false);
  const [headerTheme, setHeaderTheme]     = useState(uiSettings.header_theme || GRADIENTS[0].value);
  const [showThemePicker, setShowThemePicker] = useState(false);

  const [signature, setSignature]               = useState(currentUser.signature || uiSettings.signature || null);
  const [signatureLoading, setSignatureLoading] = useState(false);

  const fileRef      = useRef();
  const coverFileRef = useRef();
  const signatureRef = useRef();

  // ── Service Lock (global_admin only) ──
  const isGlobalAdmin = currentUser.role === "global_admin";
  const [showLockPanel, setShowLockPanel] = useState(false);
  const [lockLoading, setLockLoading]   = useState(false);
  const [lockSaving, setLockSaving]     = useState(false);
  const [isLocked, setIsLocked]         = useState(false);
  const [lockMessage, setLockMessage]   = useState("Your card payment has failed. Please complete the payment to resume service.");

  useEffect(() => {
    if (!isGlobalAdmin) return;
    setLockLoading(true);
    api.get("/api/auth/service-lock")
      .then(({ data }) => {
        setIsLocked(!!data.is_locked);
        if (data.message) setLockMessage(data.message);
      })
      .catch(() => {})
      .finally(() => setLockLoading(false));
  }, [isGlobalAdmin]);

  const saveServiceLock = async (nextLocked) => {
    setLockSaving(true);
    try {
      await api.put("/api/auth/service-lock", { is_locked: nextLocked, message: lockMessage });
      setIsLocked(nextLocked);
      showToast(nextLocked ? "Service locked — non-admin users are now blocked" : "Service unlocked — users can log in normally");
    } catch {
      showToast("Failed to update service lock", "error");
    } finally {
      setLockSaving(false);
    }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.put("/api/auth/profile", profile);
      const updated = { ...currentUser, ...data.user };
      localStorage.setItem("bms_user", JSON.stringify(updated));
      onProfileUpdate?.(updated);
      showToast("Profile updated successfully");
    } catch { showToast("Failed to update profile", "error"); }
    finally { setLoading(false); }
  };

  const handleAvatarChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setAvatarLoading(true);
    try {
      const base64 = await resizeImage(file);
      setAvatar(base64);
      const { data } = await api.post("/api/auth/avatar", { avatar: base64 });
      setAvatar(data.url);
      const updated = { ...currentUser, avatar: data.url };
      localStorage.setItem("bms_user", JSON.stringify(updated));
      onProfileUpdate?.(updated);
      showToast("Profile picture updated successfully");
    } catch (err) {
      showToast(err?.response?.data?.error || err?.message || "Upload failed", "error");
    } finally { setAvatarLoading(false); }
  };

  const deleteAvatar = async () => {
    setAvatar(null);
    const updated = { ...currentUser, avatar: null };
    localStorage.setItem("bms_user", JSON.stringify(updated));
    onProfileUpdate?.(updated);
    try { await api.delete("/api/auth/avatar"); } catch { /* silent */ }
    showToast("Profile picture removed");
  };

  const handleCoverChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setCoverLoading(true);
    try {
      const base64 = await resizeImage(file);
      const { data } = await api.post("/api/auth/cover", { cover: base64 });
      setCoverImage(data.url);
      const updated = { ...currentUser, profile_permissions: { ...currentUser.profile_permissions, ui: { ...uiSettings, cover_image: data.url } } };
      localStorage.setItem("bms_user", JSON.stringify(updated));
      onProfileUpdate?.(updated);
      showToast("Cover image updated");
    } catch { showToast("Cover upload failed", "error"); }
    finally { setCoverLoading(false); }
  };

  const deleteCover = async () => {
    setCoverImage(null);
    const updated = { ...currentUser, profile_permissions: { ...currentUser.profile_permissions, ui: { ...uiSettings, cover_image: null } } };
    localStorage.setItem("bms_user", JSON.stringify(updated));
    onProfileUpdate?.(updated);
    try { await api.delete("/api/auth/cover"); } catch { /* silent */ }
    showToast("Cover removed");
  };

  const changeHeaderTheme = async (themeValue) => {
    try {
      setHeaderTheme(themeValue);
      setShowThemePicker(false);
      if (coverImage) { setCoverImage(null); await api.delete("/api/auth/cover"); }
      await api.put("/api/auth/profile", { header_theme: themeValue });
      const updated = { ...currentUser, profile_permissions: { ...currentUser.profile_permissions, ui: { ...uiSettings, header_theme: themeValue, cover_image: null } } };
      localStorage.setItem("bms_user", JSON.stringify(updated));
      onProfileUpdate?.(updated);
      showToast("Theme applied effectively");
    } catch { showToast("Failed to save theme", "error"); }
  };

  const handleSignatureChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    e.target.value = "";
    setSignatureLoading(true);
    try {
      const base64 = await resizeSignature(file);
      setSignature(base64);
      const { data } = await api.post("/api/auth/signature", { signature: base64 });
      setSignature(data.url);
      const updated = { ...currentUser, signature: data.url };
      localStorage.setItem("bms_user", JSON.stringify(updated));
      onProfileUpdate?.(updated);
      showToast("Signature uploaded successfully");
    } catch (err) {
      showToast(err?.response?.data?.error || "Signature upload failed", "error");
    } finally { setSignatureLoading(false); }
  };

  const deleteSignature = async () => {
    setSignature(null);
    const updated = { ...currentUser, signature: null };
    localStorage.setItem("bms_user", JSON.stringify(updated));
    onProfileUpdate?.(updated);
    try { await api.delete("/api/auth/signature"); } catch { /* silent */ }
    showToast("Signature removed");
  };

  return (
    <>
      {/* Hidden file inputs */}
      <input ref={fileRef}      type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
      <input ref={coverFileRef} type="file" accept="image/*" className="hidden" onChange={handleCoverChange} />
      <input ref={signatureRef} type="file" accept="image/*" className="hidden" onChange={handleSignatureChange} />

      {/* Avatar Lightbox */}
      {avatarLightbox && avatar && (
        <div className="fixed inset-0 z-[9999] bg-black/80 flex items-center justify-center p-6"
          onClick={() => setAvatarLightbox(false)}>
          <div className="relative" onClick={e => e.stopPropagation()}>
            <img src={avatar} alt="avatar" className="max-h-[80vh] max-w-[80vw] rounded-sm shadow-2xl object-contain" />
            <button onClick={() => setAvatarLightbox(false)}
              className="absolute -top-3 -right-3 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-lg hover:bg-slate-100 transition">
              <X size={16} className="text-slate-700" />
            </button>
          </div>
        </div>
      )}

      {/* Profile Header Card */}
      <div className="shrink-0 pt-3 pb-3 sm:pt-4 sm:pb-4 border-b border-slate-200/80 bg-[#f0f2f5]">
        <div className="relative group/header transition-all duration-500 rounded-none shadow-xl hover:shadow-2xl overflow-visible">
          <div className="absolute inset-0 rounded-none overflow-hidden transition-all duration-500 pointer-events-none"
            style={{ background: coverImage ? `url(${coverImage}) center/cover no-repeat` : headerTheme }}>
            <div className={`absolute inset-0 transition-opacity duration-300 ${coverImage ? "bg-black/40 backdrop-blur-[1px]" : "bg-black/10"}`} />
            <div className="absolute inset-0 bg-linear-to-t from-black/60 to-transparent opacity-80" />
          </div>

          <div className="absolute top-5 right-5 flex items-center gap-3 opacity-0 group-hover/header:opacity-100 transition-all duration-300 z-50">
            <div className="relative">
              <button onClick={() => setShowThemePicker(!showThemePicker)}
                className="w-10 h-10 rounded-sm bg-black/20 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-black/40 transition-all shadow-xl active:scale-90"
                title="Change Theme">
                <LayoutDashboard size={20} />
              </button>
              <AnimatePresence>
                {showThemePicker && (
                  <motion.div
                    initial={{ opacity: 0, y: 15, scale: 0.9 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 15, scale: 0.9 }}
                    className="absolute right-0 top-full mt-4 w-64 bg-white/95 backdrop-blur-2xl rounded-sm shadow-[0_20px_50px_rgba(0,0,0,0.2)] border border-slate-200/50 p-4 z-[100] origin-top-right overflow-visible"
                    style={{ position: "absolute", right: 0 }}>
                    <div className="flex items-center justify-between mb-4 px-1">
                      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Premium Themes</p>
                      <button onClick={() => setShowThemePicker(false)} className="text-slate-300 hover:text-slate-500 transition-colors"><X size={14} /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      {GRADIENTS.map((g) => (
                        <button key={g.name} onClick={() => changeHeaderTheme(g.value)}
                          className={`h-12 rounded-sm border-2 transition-all hover:scale-110 shadow-sm active:scale-90 ${headerTheme === g.value ? "border-indigo-500 ring-2 ring-indigo-500/10" : "border-slate-100"}`}
                          style={{ background: g.value }} title={g.name} />
                      ))}
                    </div>
                    <button onClick={() => { setCoverImage(null); deleteCover(); setShowThemePicker(false); }}
                      className="w-full mt-5 py-3 text-[10px] font-black text-slate-400 hover:text-red-500 transition-all uppercase tracking-[0.2em] border-t border-slate-100 flex items-center justify-center gap-2">
                      <Trash2 size={12} /> Reset Background
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
            <button onClick={() => coverFileRef.current.click()}
              className="w-10 h-10 rounded-sm bg-black/20 backdrop-blur-xl border border-white/20 flex items-center justify-center text-white hover:bg-black/40 transition-all shadow-xl active:scale-90"
              title="Upload Cover">
              {coverLoading ? <Loader2 size={18} className="animate-spin" /> : <Camera size={20} />}
            </button>
          </div>

          <div className="relative flex flex-col md:flex-row items-center gap-6 z-20 p-6 md:p-10">
            <div className="relative group shrink-0 mt-10 md:mt-0">
              <div className="w-20 h-20 rounded-sm border-2 border-white/20 overflow-hidden shadow-lg flex items-center justify-center"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)" }}>
                {avatarLoading ? (
                  <Loader2 size={24} className="text-white animate-spin" />
                ) : avatar ? (
                  <img src={avatar} alt="avatar" className="w-full h-full object-cover"
                    onError={async () => {
                      try {
                        const { data } = await api.get("/api/auth/refresh-avatar");
                        setAvatar(data.url || null);
                        const updated = { ...currentUser, avatar: data.url || null };
                        localStorage.setItem("bms_user", JSON.stringify(updated));
                        if (!data.url) onProfileUpdate?.(updated);
                      } catch { setAvatar(null); }
                    }} />
                ) : (
                  <span className="text-white font-black text-3xl select-none">
                    {currentUser.name?.charAt(0)?.toUpperCase() || "?"}
                  </span>
                )}
              </div>
              <div className={`absolute inset-0 rounded-sm bg-black/60 flex items-center justify-center gap-2 transition-opacity ${avatarLoading ? "opacity-0 pointer-events-none" : "opacity-0 group-hover:opacity-100"}`}>
                {avatar && (
                  <button onClick={() => setAvatarLightbox(true)} className="flex flex-col items-center gap-0.5">
                    <FolderOpen size={16} className="text-white" />
                    <span className="text-[9px] text-white font-bold">View</span>
                  </button>
                )}
                <button onClick={() => fileRef.current.click()} className="flex flex-col items-center gap-0.5">
                  <Camera size={16} className="text-white" />
                  <span className="text-[9px] text-white font-bold">Edit</span>
                </button>
                {avatar && (
                  <button onClick={deleteAvatar} className="flex flex-col items-center gap-0.5">
                    <Trash2 size={16} className="text-red-300" />
                    <span className="text-[9px] text-red-300 font-bold">Del</span>
                  </button>
                )}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-lg font-black text-white leading-tight">{currentUser.name || "—"}</h2>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-0.5 rounded-sm"
                  style={{ background: "rgba(139,92,246,0.3)", color: "#c4b5fd", border: "1px solid rgba(139,92,246,0.4)" }}>
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-400 inline-block" />
                  {roleLabel}
                </span>
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-300 px-2 py-0.5 rounded-sm bg-white/10">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                  Active
                </span>
              </div>
              <p className="text-xs text-white/40 mt-1 truncate">{currentUser.email}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="w-full min-w-0 overflow-x-hidden py-4 md:py-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:items-stretch">

          {/* Current Info */}
          <div className="lg:col-span-1 lg:h-full min-h-0 flex flex-col">
            <div className="bg-white rounded-none shadow-sm border border-slate-100 p-6 flex-1 flex flex-col min-h-0 w-full">
              <p className={lbl + " mb-5"}>Current Info</p>
              <div className="space-y-4 flex-1 min-h-0">
                {[
                  { icon: UserCircle,  label: "Full Name",   value: currentUser.name,        color: "text-indigo-500", bg: "bg-indigo-50" },
                  { icon: Mail,        label: "Email",        value: currentUser.email,       color: "text-blue-500",   bg: "bg-blue-50"   },
                  { icon: Phone,       label: "Contact",      value: currentUser.contact_no,  color: "text-green-500",  bg: "bg-green-50"  },
                  { icon: Building2,   label: "Role",         value: ROLE_BADGE[currentUser.role]?.label || "User", color: "text-violet-500", bg: "bg-violet-50", isRole: true },
                  { icon: Briefcase,   label: "Designation",  value: currentUser.designation, color: "text-orange-500", bg: "bg-orange-50" },
                  { icon: Building2,   label: "Department",   value: currentUser.department,  color: "text-purple-500", bg: "bg-purple-50" },
                ].map(({ icon: Icon, label: l, value, color, bg, isRole }) => (
                  <div key={l} className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-sm ${bg} flex items-center justify-center shrink-0`}>
                      <Icon size={15} className={color} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{l}</p>
                      {isRole ? (
                        <span className={`inline-flex items-center text-[11px] font-black px-2 py-0.5 rounded-sm mt-0.5 ${ROLE_BADGE[currentUser.role]?.color || "bg-slate-100 text-slate-700"}`}>
                          {value}
                        </span>
                      ) : (
                        <p className="text-sm font-semibold text-slate-700 truncate mt-0.5">{value || "—"}</p>
                      )}
                    </div>
                  </div>
                ))}
                {/* Access Profiles */}
                {(currentUser.access_profile_ids?.length > 0) && (
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-sm bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                      <Briefcase size={15} className="text-violet-500" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Access Profile</p>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {currentUser.access_profile_ids.map(id => {
                          const d = designations.find(x => x.id === id);
                          return d ? (
                            <span key={id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm bg-violet-50 text-violet-700 text-[10px] font-bold border border-violet-100">
                              {d.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Edit Form */}
          <div className="lg:col-span-2 lg:h-full min-h-0 flex flex-col">
            <div className="bg-white rounded-none shadow-sm border border-slate-100 p-6 flex-1 flex flex-col min-h-0 w-full">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-sm bg-indigo-50 flex items-center justify-center shrink-0">
                    <UserCircle size={18} className="text-indigo-600" />
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-800">Edit Profile</h2>
                    <p className="text-xs text-slate-500">Update your personal information</p>
                  </div>
                </div>
                <div className="shrink-0 sm:self-start">
                  <button type="submit" form="edit-profile-form" disabled={loading}
                    className="inline-flex items-center justify-center gap-1.5 rounded-none bg-linear-to-r from-blue-600 to-indigo-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm border border-indigo-700/20 hover:from-blue-700 hover:to-indigo-700 hover:shadow transition-all active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none">
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                    Save Changes
                  </button>
                </div>
              </div>

              <form id="edit-profile-form" onSubmit={saveProfile} className="space-y-4 flex-1 min-h-0">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <span className={lbl}>Full Name *</span>
                    <div className="relative">
                      <UserCircle size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input className={`${inp} pl-10`} value={profile.name}
                        onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))} required />
                    </div>
                  </div>
                  <div>
                    <span className={lbl}>Email Address</span>
                    <div className="relative">
                      <Mail size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
                      <input className={`${inp} pl-10 opacity-50 cursor-not-allowed`} value={currentUser.email || ""} disabled />
                    </div>
                  </div>
                  <div>
                    <span className={lbl}>Contact Number</span>
                    <div className="relative">
                      <Phone size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input className={`${inp} pl-10`} value={profile.contact_no}
                        onChange={(e) => setProfile((p) => ({ ...p, contact_no: e.target.value }))}
                        placeholder="+91 98765 43210" />
                    </div>
                  </div>
                  <div>
                    <span className={lbl}>Designation</span>
                    <div className="relative">
                      <Briefcase size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input className={`${inp} pl-10 bg-slate-50 cursor-not-allowed text-slate-500`}
                        value={currentUser.designation || "Not assigned"} readOnly disabled
                        title="Designation is managed by your administrator" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-sm">
                        Admin
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Set by your administrator. Contact admin to change.</p>
                  </div>

                  {/* Access Profile — read-only, set by admin */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className={lbl}>Access Profile</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-sm">Admin</span>
                    </div>
                    <div className={`${inp} bg-slate-50 cursor-not-allowed min-h-[46px] flex flex-wrap gap-1.5 items-center`}>
                      {currentUser.access_profile_ids?.length > 0 ? (
                        currentUser.access_profile_ids.map(id => {
                          const d = designations.find(x => x.id === id);
                          return d ? (
                            <span key={id} className="inline-flex items-center px-2.5 py-0.5 rounded-sm bg-violet-100 text-violet-700 text-[11px] font-bold border border-violet-200">
                              {d.name}
                            </span>
                          ) : null;
                        })
                      ) : (
                        <span className="text-slate-400 text-[13px]">Not assigned</span>
                      )}
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Set by your administrator. Contact admin to change.</p>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className={lbl}>Department</span>
                      <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-sm">Admin</span>
                    </div>
                    <div className="relative">
                      <Building2 size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                      <input className={`${inp} pl-10 bg-slate-50 cursor-not-allowed text-slate-500`}
                        value={currentUser.department || "Not assigned"} readOnly disabled
                        title="Department is managed by your administrator" />
                    </div>
                    <p className="text-[10px] text-slate-400 mt-1.5 ml-1">Set by your administrator. Contact admin to change.</p>
                  </div>
                </div>
              </form>
            </div>
          </div>

          {/* Signature */}
          <div className="lg:col-span-3">
            <div className="bg-white rounded-none shadow-sm border border-slate-100 p-6">
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-sm bg-amber-50 flex items-center justify-center shrink-0">
                  <Pencil size={16} className="text-amber-600" />
                </div>
                <div>
                  <h2 className="text-base font-black text-slate-800">Signature</h2>
                  <p className="text-xs text-slate-500">Your signature is used on documents and purchase orders</p>
                </div>
              </div>
              <div className="flex flex-col sm:flex-row items-start gap-6">
                <div className="w-full sm:w-64 h-32 rounded-sm border-2 border-dashed border-slate-200 bg-white flex items-center justify-center overflow-hidden shrink-0 relative group">
                  {signatureLoading ? (
                    <Loader2 size={24} className="text-amber-400 animate-spin" />
                  ) : signature ? (
                    <>
                      <img src={signature} alt="Signature" className="max-h-full max-w-full object-contain p-2" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-sm flex items-center justify-center gap-3">
                        <button type="button" onClick={() => signatureRef.current.click()}
                          className="flex flex-col items-center gap-1 text-white">
                          <Camera size={16} /><span className="text-[10px] font-bold">Change</span>
                        </button>
                        <button type="button" onClick={deleteSignature}
                          className="flex flex-col items-center gap-1 text-red-400">
                          <Trash2 size={16} /><span className="text-[10px] font-bold">Remove</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center">
                      <Pencil size={24} className="text-slate-300 mx-auto mb-1" />
                      <p className="text-[11px] text-slate-400 font-medium">No signature</p>
                    </div>
                  )}
                </div>
                <div className="flex-1 space-y-3">
                  <p className="text-[12px] text-slate-500 leading-relaxed">
                    Upload a clear image of your handwritten signature (PNG or JPG recommended).
                    It will appear on purchase orders and official documents generated from this platform.
                  </p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <button type="button" onClick={() => signatureRef.current.click()} disabled={signatureLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold rounded-sm shadow-sm shadow-amber-200 transition-all active:scale-95 disabled:opacity-60">
                      {signatureLoading ? <Loader2 size={14} className="animate-spin" /> : <Camera size={14} />}
                      {signature ? "Change Signature" : "Upload Signature"}
                    </button>
                    {signature && (
                      <button type="button" onClick={deleteSignature}
                        className="flex items-center gap-2 px-4 py-2 text-sm font-bold text-rose-500 hover:text-rose-600 hover:bg-rose-50 rounded-sm transition-all">
                        <Trash2 size={14} /> Remove
                      </button>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-400">Accepted: PNG, JPG, JPEG · Max size: 5MB</p>
                </div>
              </div>
            </div>
          </div>

          {isGlobalAdmin && !showLockPanel && (
            <button
              type="button"
              onClick={() => setShowLockPanel(true)}
              className="mt-6 inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-500 border border-slate-200 rounded-sm hover:bg-slate-50 hover:text-slate-700 transition-all"
            >
              <ShieldAlert size={14} className="text-rose-400" /> Service Lock
            </button>
          )}

          {isGlobalAdmin && showLockPanel && (
            <div className="bg-white rounded-sm border border-slate-100 p-6 mt-6">
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <ShieldAlert size={16} className="text-rose-500" />
                  <h3 className="text-sm font-bold text-slate-800">Service Lock</h3>
                </div>
                <button type="button" onClick={() => setShowLockPanel(false)}
                  className="p-1 text-slate-400 hover:text-slate-600 rounded-sm transition-all">
                  <X size={16} />
                </button>
              </div>
              <p className="text-xs text-slate-400 mb-4">
                When enabled, every other user — including super_admin and admin — is blocked from logging in
                (and signed-in sessions get signed out within a few minutes) and shown the message below
                instead. Only your global_admin account stays exempt. Use this if a client hasn't cleared a
                pending payment.
              </p>

              {lockLoading ? (
                <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={14} className="animate-spin" /> Loading...</div>
              ) : (
                <>
                  <div className={`flex items-center justify-between px-4 py-3 rounded-sm border mb-4 ${isLocked ? "bg-rose-50 border-rose-200" : "bg-slate-50 border-slate-100"}`}>
                    <div>
                      <p className={`text-xs font-bold ${isLocked ? "text-rose-700" : "text-slate-600"}`}>
                        {isLocked ? "Service is currently LOCKED" : "Service is currently active"}
                      </p>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {isLocked ? "Non-admin users cannot use the software right now." : "All users can log in and use the software normally."}
                      </p>
                    </div>
                    <button
                      type="button"
                      disabled={lockSaving}
                      onClick={() => saveServiceLock(!isLocked)}
                      className={`shrink-0 px-4 py-2 text-xs font-bold rounded-sm transition-all disabled:opacity-60 ${
                        isLocked ? "bg-slate-800 hover:bg-slate-900 text-white" : "bg-rose-600 hover:bg-rose-700 text-white"
                      }`}
                    >
                      {lockSaving ? "Saving..." : isLocked ? "Unlock Service" : "Lock Service"}
                    </button>
                  </div>

                  <label className={lbl}>Message shown to blocked users</label>
                  <textarea
                    value={lockMessage}
                    onChange={e => setLockMessage(e.target.value)}
                    rows={3}
                    className={`${inp} resize-none`}
                    placeholder="Your card payment has failed. Please complete the payment to resume service."
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      type="button"
                      disabled={lockSaving}
                      onClick={() => saveServiceLock(isLocked)}
                      className="px-4 py-2 text-xs font-bold text-slate-600 border border-slate-200 rounded-sm hover:bg-slate-50 transition-all disabled:opacity-60"
                    >
                      Save Message
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

        </div>
      </div>
    </>
  );
}
