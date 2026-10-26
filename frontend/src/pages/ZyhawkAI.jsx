import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Plus, Trash2, ArrowUp, Loader2, Globe, PanelLeftClose, PanelLeftOpen, MessageSquare,
  Paperclip, Mic, MicOff, X, FileText, FileSpreadsheet, Image as ImageIcon, Download,
  Zap, Brain, ChevronDown, Check, MessageCircleMore, Search, ArrowRight, PackageSearch, ClipboardList, Users,
  FileCheck2, ScanText, Wallet, Activity, Truck, FileSearch } from "lucide-react";
import * as XLSX from "xlsx";
import "@fontsource/poppins/500.css";
import "@fontsource/poppins/600.css";
import "@fontsource/poppins/700.css";
import "@fontsource/poppins/800.css";
import api from "../utils/api";
import { ZyHawkIcon, ZyAIWordmark } from "../components/ZyAILogo";

/*
 * ZyAI — chat assistant. Answers from the ERP (orders, intakes,
 * vendors, petty cash — within the user's own permissions) and from the
 * web. Chats are saved per user on the server.
 */
// Starter cards on the empty screen, grouped like the ERP. `ask` sends right
// away; `fill` puts a half-written question in the box for the user to finish;
// `attach` opens the file picker.
const GROUPS = [
  { label: "Track", icon: Activity, items: [
    { icon: PackageSearch, title: "Latest orders", desc: "Show the latest orders for a site", fill: "Show the latest orders for site " },
    { icon: ClipboardList, title: "Pending intakes", desc: "Which intakes are still pending?", ask: "Which intakes are still pending?" },
  ] },
  { label: "Vendors", icon: Users, items: [
    { icon: Truck, title: "Top vendors", desc: "Top 5 vendors by order value", ask: "Top 5 vendors by order value" },
    { icon: FileCheck2, title: "Vendor documents", desc: "Which documents are missing for a vendor?", fill: "Which documents are uploaded and missing for vendor " },
  ] },
  { label: "Extract", icon: ScanText, items: [
    { icon: FileSearch, title: "Bill to table", desc: "Attach a bill photo or PDF — get its items as Excel", attach: true },
    { icon: Wallet, title: "Petty cash", desc: "Petty cash spent this month, by category", ask: "Petty cash spent this month, by category" },
  ] },
];

const MAX_FILES = 5;
const MAX_MB = 10;
const ACCEPT = "image/png,image/jpeg,image/webp,application/pdf,.xlsx,.xls,.csv,.txt";

const fileKind = (f) => (/^image\//.test(f.type || "") ? "image" : /pdf/.test(f.type || "") || /\.pdf$/i.test(f.name) ? "pdf"
  : /\.(xlsx|xls|csv)$/i.test(f.name) ? "sheet" : "file");
const KIND_ICON = { image: ImageIcon, pdf: FileText, sheet: FileSpreadsheet, file: FileText };

// Markdown tables in an answer → rows, for the Excel download
function tablesIn(md) {
  const tables = [];
  let cur = null;
  const cells = (line) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|")
    .map(c => c.trim().replace(/\*\*|__|`/g, "").replace(/^\*(.*)\*$/, "$1"));
  for (const line of (md || "").split("\n")) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      if (/^\s*\|?\s*:?-{2,}/.test(line)) continue; // separator row
      if (!cur) { cur = []; tables.push(cur); }
      cur.push(cells(line));
    } else cur = null;
  }
  return tables.filter(t => t.length > 1);
}

// Numbers like "₹1,25,000" or "12.5" become real numbers in Excel
const toCell = (v) => {
  const n = String(v).replace(/[₹,\s]/g, "");
  return /^-?\d+(\.\d+)?$/.test(n) ? Number(n) : v;
};

function downloadExcel(md, name) {
  const wb = XLSX.utils.book_new();
  tablesIn(md).forEach((t, i) => {
    const ws = XLSX.utils.aoa_to_sheet(t.map((r, ri) => (ri === 0 ? r : r.map(toCell))));
    ws["!cols"] = t[0].map((_, c) => ({ wch: Math.min(40, Math.max(10, ...t.map(r => String(r[c] ?? "").length + 2))) }));
    XLSX.utils.book_append_sheet(wb, ws, `Table ${i + 1}`);
  });
  XLSX.writeFile(wb, `${name}.xlsx`);
}

// Light, clean workspace look: soft grey page, white panels, deep navy for
// strong blocks and the brand cyan → blue as the one accent (flat, no glow).
const FONT = { fontFamily: "'Poppins', system-ui, sans-serif" };
const ACCENT = "bg-gradient-to-r from-[#06b6d4] to-[#1d4ed8]";

// ZyAI's avatar: the hawk on a deep navy tile
function Logo({ size = 32 }) {
  return (
    <div className="bg-[#0b2540] rounded-xl flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <ZyHawkIcon size={size * 0.62} />
    </div>
  );
}

// Hawk + "ZyAI", as in the brand logo ("Zy" in deep navy on this light page)
function Wordmark({ size = 26 }) {
  return (
    <span className="inline-flex items-center gap-[0.3em]">
      <ZyHawkIcon size={size * 1.15} />
      <ZyAIWordmark size={size} tone="light" />
    </span>
  );
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning!" : h < 17 ? "Good afternoon!" : "Good evening!";
};

// Markdown in the app's light look; tables scroll sideways on small screens
const MD = {
  table: ({ children }) => <div className="my-3 overflow-x-auto rounded-xl border border-slate-200 bg-white"><table className="w-full text-[13px]">{children}</table></div>,
  thead: ({ children }) => <thead className="bg-slate-50 text-slate-500">{children}</thead>,
  th: ({ children }) => <th className="text-left font-semibold px-3 py-2.5 border-b border-slate-200 whitespace-nowrap">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2.5 border-b border-slate-100 text-slate-700">{children}</td>,
  p: ({ children }) => <p className="my-2 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="my-2 pl-5 list-disc space-y-1 marker:text-[#0891b2]">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 pl-5 list-decimal space-y-1 marker:text-[#0891b2]">{children}</ol>,
  h1: ({ children }) => <h3 className="mt-3 mb-1 text-[16px] font-bold text-[#0b2540]">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-3 mb-1 text-[15px] font-bold text-[#0b2540]">{children}</h3>,
  h3: ({ children }) => <h3 className="mt-3 mb-1 text-[14px] font-bold text-[#0b2540]">{children}</h3>,
  strong: ({ children }) => <strong className="font-semibold text-[#0b2540]">{children}</strong>,
  a: ({ href, children }) => <a href={href} target="_blank" rel="noreferrer" className="text-[#1d4ed8] hover:underline">{children}</a>,
  code: ({ children }) => <code className="px-1.5 py-0.5 rounded-md bg-slate-100 text-[#0b2540] text-[12px]">{children}</code>,
};

// Answer modes — the backend maps each to its own Gemini models
const MODES = {
  fast:  { label: "Fast",  icon: Zap,   hint: "Quick answers for everyday questions" },
  smart: { label: "Smart", icon: Brain, hint: "Thinks longer — bills, tables, comparisons" },
};
const MODE_KEY = "zyhawk_ai_mode";
const savedMode = () => { try { return MODES[localStorage.getItem(MODE_KEY)] ? localStorage.getItem(MODE_KEY) : "fast"; } catch { return "fast"; } };

function ModePicker({ mode, setMode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const Cur = MODES[mode].icon;
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)} title="Answer mode"
        className="h-9 px-3 rounded-full text-[12px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200/70 flex items-center gap-1.5 transition-colors">
        <Cur size={13} className="text-[#0891b2]" /> {MODES[mode].label} <ChevronDown size={13} className="text-slate-400" />
      </button>
      {open && (
        <div className="absolute bottom-12 right-0 z-20 w-72 rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_-16px_rgba(11,37,64,0.35)] p-1.5">
          {Object.entries(MODES).map(([key, m]) => {
            const Icon = m.icon;
            return (
              <button key={key} type="button" onClick={() => { setMode(key); setOpen(false); }}
                className={`w-full text-left flex items-start gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 ${mode === key ? "bg-[#ecfeff]" : ""}`}>
                <span className={`mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${mode === key ? "bg-[#0b2540] text-[#22d3ee]" : "bg-slate-100 text-slate-500"}`}><Icon size={14} /></span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-semibold text-[#0b2540]">{m.label}</span>
                  <span className="block text-[11px] text-slate-500">{m.hint}</span>
                </span>
                {mode === key && <Check size={15} className="mt-1.5 text-[#0891b2] shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Reveals the newest answer a few characters at a time (typing effect)
function useTyping(text, active) {
  const [shown, setShown] = useState(active ? "" : text);
  useEffect(() => {
    if (!active) { setShown(text); return; }
    let i = 0;
    const step = Math.max(2, Math.ceil(text.length / 120));
    const t = setInterval(() => {
      i += step;
      setShown(text.slice(0, i));
      if (i >= text.length) clearInterval(t);
    }, 16);
    return () => clearInterval(t);
  }, [text, active]);
  return shown;
}

function AssistantMessage({ msg, animate }) {
  const text = useTyping(msg.content, animate);
  const done = text.length >= msg.content.length;
  const hasTable = done && tablesIn(msg.content).length > 0;
  return (
    <div className="flex gap-3">
      <Logo size={30} />
      <div className="min-w-0 flex-1 pt-1 text-[14px] text-slate-700">
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD}>{text}</ReactMarkdown>
        {hasTable && (
          <button type="button" onClick={() => downloadExcel(msg.content, `zyai-${new Date().toISOString().slice(0, 10)}`)}
            className="mt-1 inline-flex items-center gap-1.5 h-8 px-3.5 rounded-full border border-emerald-200 bg-emerald-50 text-emerald-700 text-[12px] font-semibold hover:bg-emerald-100">
            <Download size={13} /> Download Excel
          </button>
        )}
        {msg.sources?.length > 0 && done && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {msg.sources.slice(0, 5).map(s => (
              <a key={s.url} href={s.url} target="_blank" rel="noreferrer" title={s.url}
                className="inline-flex items-center gap-1 max-w-[220px] px-2.5 py-1 rounded-full border border-slate-200 bg-white text-[11px] text-slate-500 hover:text-[#1d4ed8] hover:border-blue-200">
                <Globe size={11} className="shrink-0" /> <span className="truncate">{s.title}</span>
              </a>
            ))}
          </div>
        )}
        {done && MODES[msg.mode] && (() => {
          const Icon = MODES[msg.mode].icon;
          return (
            <div className="mt-2 flex items-center gap-1 text-[11px] text-slate-400">
              <Icon size={11} /> {MODES[msg.mode].label}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export default function ZyhawkAI() {
  const [conversations, setConversations] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [animateId, setAnimateId] = useState(null);
  const [showList, setShowList] = useState(() => window.innerWidth >= 1024);
  const [files, setFiles] = useState([]);        // [{ file, preview? }]
  const [dragging, setDragging] = useState(false);
  const [listening, setListening] = useState(false);
  const [searching, setSearching] = useState(false);
  const [search, setSearch] = useState("");
  const [mode, setModeState] = useState(savedMode);
  const setMode = (m) => { setModeState(m); try { localStorage.setItem(MODE_KEY, m); } catch { /* not saved — fine */ } };
  const fileRef = useRef(null);
  const recRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);
  const me = (() => { try { return JSON.parse(localStorage.getItem("bms_user") || "{}"); } catch { return {}; } })();

  const loadList = () => api.get("/api/ai/conversations").then(r => setConversations(r.data.conversations || [])).catch(() => {});
  useEffect(() => { loadList(); }, []);

  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, sending]);

  const openChat = async (id) => {
    setActiveId(id); setError(""); setAnimateId(null);
    try {
      const { data } = await api.get(`/api/ai/conversations/${id}`);
      setMessages(data.messages || []);
    } catch { setError("Couldn't open that chat"); }
    if (window.innerWidth < 1024) setShowList(false);
  };

  const newChat = () => { setActiveId(null); setMessages([]); setError(""); setInput(""); inputRef.current?.focus(); };

  const clearAll = async () => {
    if (!confirm("Delete all your ZyAI chats? This can't be undone.")) return;
    await api.delete("/api/ai/conversations").catch(() => {});
    newChat();
    loadList();
  };

  const removeChat = async (id) => {
    if (!confirm("Delete this chat?")) return;
    await api.delete(`/api/ai/conversations/${id}`).catch(() => {});
    if (id === activeId) newChat();
    loadList();
  };

  const addFiles = (list) => {
    const picked = [...list];
    const tooBig = picked.find(f => f.size > MAX_MB * 1024 * 1024);
    if (tooBig) { setError(`"${tooBig.name}" is over ${MAX_MB} MB.`); return; }
    setFiles(cur => {
      const next = [...cur, ...picked.map(f => ({ file: f, preview: /^image\//.test(f.type) ? URL.createObjectURL(f) : null }))];
      if (next.length > MAX_FILES) setError(`You can attach up to ${MAX_FILES} files.`);
      return next.slice(0, MAX_FILES);
    });
  };
  const removeFile = (i) => setFiles(cur => cur.filter((_, j) => j !== i));

  // Voice typing (browser speech recognition — free, works in Chrome / Edge)
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  const toggleMic = () => {
    if (listening) { recRef.current?.stop(); return; }
    if (!SpeechRec) { setError("Voice typing isn't supported in this browser — try Chrome or Edge."); return; }
    const rec = new SpeechRec();
    rec.lang = "en-IN";
    rec.interimResults = true;
    rec.continuous = false;
    const base = input ? `${input} ` : "";
    rec.onresult = (e) => setInput(base + [...e.results].map(r => r[0].transcript).join(""));
    rec.onerror = (e) => { if (e.error !== "no-speech" && e.error !== "aborted") setError("Couldn't hear you — check the microphone permission."); };
    rec.onend = () => { setListening(false); inputRef.current?.focus(); };
    recRef.current = rec;
    setListening(true); setError("");
    rec.start();
  };

  const send = async (text) => {
    const message = (text ?? input).trim();
    if ((!message && !files.length) || sending) return;
    recRef.current?.stop();
    const sendFiles = files;
    setInput(""); setError(""); setFiles([]);
    setMessages(m => [...m, {
      id: `u${Date.now()}`, role: "user", content: message || "(attached files)",
      attachments: sendFiles.map(f => ({ name: f.file.name, type: f.file.type, preview: f.preview })),
    }]);
    setSending(true);
    try {
      let body = { conversationId: activeId, message, mode };
      if (sendFiles.length) {
        body = new FormData();
        if (activeId) body.append("conversationId", activeId);
        body.append("message", message);
        body.append("mode", mode);
        sendFiles.forEach(f => body.append("files", f.file));
      }
      const { data } = await api.post("/api/ai/chat", body);
      const reply = { id: `a${Date.now()}`, role: "assistant", content: data.reply, sources: data.sources || [], mode: data.mode };
      setMessages(m => [...m, reply]);
      setAnimateId(reply.id);
      if (!activeId) { setActiveId(data.conversationId); }
      loadList();
    } catch (e) {
      setError(e.response?.data?.error || "ZyAI couldn't answer right now. Please try again.");
    }
    setSending(false);
    inputRef.current?.focus();
  };

  const onKey = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const firstName = (me.name || "").split(" ")[0];
  const empty = messages.length === 0;

  const startCard = (c) => {
    if (c.attach) return fileRef.current?.click();
    if (c.ask) return send(c.ask);
    setInput(c.fill);
    setTimeout(() => { const el = inputRef.current; if (el) { el.focus(); el.setSelectionRange(c.fill.length, c.fill.length); } }, 0);
  };

  const shownChats = search.trim()
    ? conversations.filter(c => (c.title || "").toLowerCase().includes(search.trim().toLowerCase()))
    : conversations;

  return (
    <div className="h-full flex bg-[#f1f4f9] text-slate-700" style={FONT}>
      {/* Chat list */}
      {showList && (
        <aside className="w-[270px] shrink-0 border-r border-slate-200 bg-white flex flex-col">
          <div className="pt-5 pb-4 px-4 flex items-center justify-center relative">
            <Wordmark size={28} />
            <button onClick={() => setShowList(false)} title="Hide chats"
              className="absolute right-3 top-5 w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 hover:bg-slate-100">
              <PanelLeftClose size={15} />
            </button>
          </div>
          <div className="px-4 pb-4 flex items-center gap-2">
            <button onClick={newChat}
              className={`flex-1 h-10 rounded-full ${ACCENT} text-white text-[13px] font-semibold inline-flex items-center justify-center gap-1.5 hover:opacity-95`}>
              <Plus size={16} /> New chat
            </button>
            <button onClick={() => { setSearching(v => !v); setSearch(""); }} title="Search chats"
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${searching ? "bg-[#0b2540] text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}>
              <Search size={16} />
            </button>
          </div>
          {searching && (
            <div className="px-4 pb-3">
              <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search your chats…"
                className="w-full h-9 px-3 rounded-lg border border-slate-200 bg-slate-50 text-[13px] outline-none focus:border-[#06b6d4] focus:bg-white" />
            </div>
          )}
          <div className="px-4 py-2 flex items-center justify-between border-t border-slate-100">
            <span className="text-[11px] text-slate-400">Your conversations</span>
            {conversations.length > 0 && (
              <button onClick={clearAll} className="text-[11px] font-semibold text-[#1d4ed8] hover:underline">Clear All</button>
            )}
          </div>
          <div className="flex-1 overflow-y-auto pb-3 thin-scrollbar-xs">
            {shownChats.length === 0 && (
              <p className="px-4 py-6 text-[12px] text-slate-400 text-center">{search ? "No chats match" : "Your chats will show up here"}</p>
            )}
            {shownChats.map(c => {
              const on = c.id === activeId;
              return (
                <div key={c.id} onClick={() => openChat(c.id)}
                  className={`group flex items-center gap-2.5 pl-4 pr-3 py-2.5 cursor-pointer border-r-2 transition-colors ${on ? "bg-[#eef6ff] border-[#1d4ed8] text-[#1d4ed8]" : "border-transparent text-slate-600 hover:bg-slate-50"}`}>
                  <MessageSquare size={14} className={on ? "text-[#1d4ed8] shrink-0" : "text-slate-400 shrink-0"} />
                  <span className="flex-1 min-w-0 truncate text-[13px]">{c.title}</span>
                  <button onClick={e => { e.stopPropagation(); removeChat(c.id); }} title="Delete chat"
                    className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-600"><Trash2 size={13} /></button>
                </div>
              );
            })}
          </div>
        </aside>
      )}

      {/* Conversation — files can be dropped anywhere on it */}
      <div className="relative flex-1 min-w-0 flex flex-col"
        onDragOver={e => { if ([...e.dataTransfer.types].includes("Files")) { e.preventDefault(); setDragging(true); } }}
        onDragLeave={e => { if (e.currentTarget === e.target) setDragging(false); }}
        onDrop={e => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}>
        {dragging && (
          <div className="absolute inset-3 z-30 rounded-2xl border-2 border-dashed border-[#06b6d4] bg-white/90 flex items-center justify-center pointer-events-none">
            <p className="text-[15px] font-semibold text-[#0b2540]">Drop files to attach (images, PDF, Excel)</p>
          </div>
        )}
        {!showList && (
          <div className="shrink-0 h-14 px-4 flex items-center gap-3 border-b border-slate-200 bg-white">
            <button onClick={() => setShowList(true)} title="Show chats"
              className="w-9 h-9 rounded-lg border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800">
              <PanelLeftOpen size={16} />
            </button>
            <Wordmark size={22} />
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto">
          {empty ? (
            <div className="min-h-full flex flex-col items-center justify-center px-6 py-10">
              <MessageCircleMore size={84} strokeWidth={1.3} className="text-slate-300" />
              <h1 className="mt-5 text-[22px] sm:text-[26px] text-slate-600 text-center">
                <span className="font-bold text-[#0b2540]">{greeting()}</span> How may I assist you{firstName ? `, ${firstName}` : ""}?
              </h1>
              <div className="mt-9 w-full max-w-4xl space-y-4">
                {GROUPS.map(g => {
                  const GIcon = g.icon;
                  return (
                    <div key={g.label} className="flex gap-4">
                      <div className="w-[104px] shrink-0 rounded-2xl bg-[#0b2540] text-white px-4 py-4 flex flex-col justify-center gap-2">
                        <GIcon size={20} className="text-[#22d3ee]" />
                        <span className="text-[15px] font-semibold">{g.label}</span>
                      </div>
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4">
                        {g.items.map(c => {
                          const CIcon = c.icon;
                          return (
                            <button key={c.title} type="button" onClick={() => startCard(c)}
                              className="group text-left rounded-2xl bg-white px-5 py-4 flex items-center gap-4 shadow-[0_1px_2px_rgba(11,37,64,0.06)] ring-1 ring-transparent hover:ring-[#06b6d4]/40 hover:shadow-[0_8px_24px_-12px_rgba(11,37,64,0.25)] transition-all">
                              <span className="flex-1 min-w-0">
                                <CIcon size={22} strokeWidth={1.8} className="text-[#1d4ed8]" />
                                <span className="mt-2 block text-[15px] font-semibold text-[#0b2540]">“{c.title}”</span>
                                <span className="mt-0.5 block text-[12px] text-slate-500 truncate">{c.desc}</span>
                              </span>
                              <ArrowRight size={18} className="text-slate-300 group-hover:text-[#1d4ed8] group-hover:translate-x-0.5 transition-all shrink-0" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8 space-y-6">
              {messages.map(m => m.role === "user" ? (
                <div key={m.id} className="flex flex-col items-end gap-1.5">
                  {m.attachments?.length > 0 && (
                    <div className="flex flex-wrap justify-end gap-1.5 max-w-[80%]">
                      {m.attachments.map((a, i) => {
                        const Icon = KIND_ICON[fileKind(a)];
                        return a.preview ? (
                          <img key={i} src={a.preview} alt={a.name} className="h-24 rounded-xl border border-slate-200 object-cover" />
                        ) : (
                          <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-[12px] text-slate-600">
                            <Icon size={13} className="text-[#1d4ed8]" /> {a.name}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#0b2540] text-white px-4 py-2.5 text-[14px] whitespace-pre-wrap">{m.content}</div>
                </div>
              ) : (
                <AssistantMessage key={m.id} msg={m} animate={m.id === animateId} />
              ))}
              {sending && (
                <div className="flex gap-3 items-center">
                  <Logo size={30} />
                  <div className="flex items-center gap-1.5 text-[13px] text-slate-400">
                    <span className="w-2 h-2 rounded-full bg-[#06b6d4] animate-bounce [animation-delay:-0.3s]" />
                    <span className="w-2 h-2 rounded-full bg-[#0ea5e9] animate-bounce [animation-delay:-0.15s]" />
                    <span className="w-2 h-2 rounded-full bg-[#1d4ed8] animate-bounce" />
                    <span className="ml-1">Thinking…</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Composer */}
        <div className="shrink-0 px-4 sm:px-6 pb-4 pt-2">
          <div className="max-w-3xl mx-auto">
            {error && <p className="mb-2 text-[12px] text-red-600 text-center">{error}</p>}
            <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2.5 shadow-[0_6px_20px_-12px_rgba(11,37,64,0.3)] focus-within:border-[#06b6d4] transition-colors">
              {files.length > 0 && (
                <div className="flex flex-wrap gap-2 pb-2 mb-1 border-b border-slate-100">
                  {files.map((f, i) => {
                    const Icon = KIND_ICON[fileKind(f.file)];
                    return (
                      <div key={i} className="relative">
                        {f.preview ? (
                          <img src={f.preview} alt={f.file.name} className="h-14 w-14 rounded-lg object-cover border border-slate-200" />
                        ) : (
                          <div className="h-14 max-w-[180px] px-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center gap-2">
                            <Icon size={16} className="text-[#1d4ed8] shrink-0" />
                            <span className="text-[12px] text-slate-600 truncate">{f.file.name}</span>
                          </div>
                        )}
                        <button type="button" onClick={() => removeFile(i)} title="Remove"
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-[#0b2540] text-white flex items-center justify-center shadow">
                          <X size={11} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="flex items-end gap-2">
              <input ref={fileRef} type="file" multiple accept={ACCEPT} className="hidden"
                onChange={e => { addFiles(e.target.files || []); e.target.value = ""; }} />
              <button type="button" onClick={() => fileRef.current?.click()} title="Attach image, PDF or Excel"
                className="w-9 h-9 shrink-0 rounded-full text-slate-500 hover:text-[#1d4ed8] hover:bg-slate-100 flex items-center justify-center">
                <Paperclip size={17} />
              </button>
              <textarea ref={inputRef} value={input} onChange={e => setInput(e.target.value)} onKeyDown={onKey}
                onPaste={e => { const imgs = [...(e.clipboardData?.files || [])].filter(f => /^image\//.test(f.type)); if (imgs.length) { e.preventDefault(); addFiles(imgs); } }}
                rows={1} placeholder={listening ? "Listening…" : "Ask anything, or attach a bill photo, PDF or Excel"} autoFocus
                className="flex-1 resize-none max-h-40 py-1.5 text-[14px] text-[#0b2540] placeholder:text-slate-400 outline-none bg-transparent"
                style={{ height: "auto" }}
                onInput={e => { e.target.style.height = "auto"; e.target.style.height = `${Math.min(e.target.scrollHeight, 160)}px`; }} />
              <ModePicker mode={mode} setMode={setMode} />
              <button type="button" onClick={toggleMic} title={listening ? "Stop listening" : "Speak"}
                className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-colors ${listening ? "bg-rose-500 text-white animate-pulse" : "text-slate-500 hover:text-[#1d4ed8] hover:bg-slate-100"}`}>
                {listening ? <MicOff size={17} /> : <Mic size={17} />}
              </button>
              <button onClick={() => send()} disabled={(!input.trim() && !files.length) || sending} title="Send"
                className={`w-9 h-9 shrink-0 rounded-full ${ACCENT} text-white flex items-center justify-center hover:opacity-95 disabled:opacity-35 transition-opacity`}>
                {sending ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={17} strokeWidth={2.4} />}
              </button>
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400 text-center">ZyAI can make mistakes — check important figures in the ERP.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
