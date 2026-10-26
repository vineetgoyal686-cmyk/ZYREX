// ZyAI — chat assistant (Google Gemini, free tier). The model answers
// from the ERP through the read-only tools in helpers/aiTools.js (each runs
// with the asking user's permissions) and from the web through Google Search.
// Chats are saved per user in ai_conversations / ai_messages.
const express  = require("express");
const router   = express.Router();
const supabase = require("../helpers/supabaseHelper");
const { requireAuth } = require("../middleware/auth");
const { requirePerm } = require("../helpers/permHelper");
const multer   = require("multer");
const XLSX     = require("xlsx");
const { DECLARATIONS, EXECUTORS } = require("../helpers/aiTools");

// Attachments: images and PDFs go to Gemini as-is; Excel / CSV / text are
// read here and sent as text. Files aren't stored — only their names are
// kept in the chat history.
const MAX_FILE_MB = 10;
const MAX_SHEET_ROWS = 500;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_FILE_MB * 1024 * 1024, files: 5 } });
const isSheet = (f) => /\.(xlsx|xls|csv)$/i.test(f.originalname) || /spreadsheet|ms-excel|text\/csv/.test(f.mimetype);

function filePart(f) {
  if (/^image\/(png|jpe?g|webp|heic|heif)$/.test(f.mimetype) || f.mimetype === "application/pdf") {
    return { inlineData: { mimeType: f.mimetype, data: f.buffer.toString("base64") } };
  }
  if (isSheet(f)) {
    const wb = XLSX.read(f.buffer, { type: "buffer" });
    const sheets = wb.SheetNames.map(name => {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: "", blankrows: false });
      const cut = rows.length > MAX_SHEET_ROWS;
      const csv = rows.slice(0, MAX_SHEET_ROWS).map(r => r.map(v => String(v).replace(/[\r\n,]+/g, " ")).join(",")).join("\n");
      return `Sheet "${name}" (${rows.length} rows${cut ? `, first ${MAX_SHEET_ROWS} shown` : ""}):\n${csv}`;
    });
    return { text: `Attached spreadsheet "${f.originalname}":\n${sheets.join("\n\n")}` };
  }
  if (/^text\//.test(f.mimetype)) return { text: `Attached file "${f.originalname}":\n${f.buffer.toString("utf8").slice(0, 100000)}` };
  return null;
}

// The user picks Fast or Smart; model names never reach the UI. Each mode's
// models are tried in order: each has its own free quota, so when one is busy
// or out of quota the whole answer is retried on the next. One answer always
// runs on a single model (tool-call turns can't move between models).
const list = (env, fallback) => (process.env[env] || fallback).split(",").map(m => m.trim()).filter(Boolean);
const LITE = /lite/i;
const MODES = {
  fast:  { models: list("GEMINI_FAST_MODELS",  "gemini-3.5-flash-lite,gemini-3.1-flash-lite,gemini-3.5-flash,gemini-3.8-flash"), thinking: "low" },
  smart: { models: list("GEMINI_SMART_MODELS", "gemini-3.5-flash,gemini-3.8-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite"), thinking: "medium" },
};
// What actually answered: Smart that had to fall back to a lite model is labelled Fast
const modeOf = (model) => (LITE.test(model) ? "fast" : "smart");
const API_URL = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const MAX_TOOL_ROUNDS = 6;
const HISTORY_TURNS = 20;

class AiError extends Error {
  constructor(message, status = 500) { super(message); this.status = status; }
}

// One Gemini call (thinking "low" for Fast, "medium" for Smart). Errors that mean "try the
// next model" — busy (503), out of quota (429), model retired / not
// available to this key (404, or 400 saying so) — come back as status 503 /
// 429 so the caller moves on; anything else is a real failure. Capped at 45 s.
async function gemini(body, model, thinking = "low") {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AiError("ZyAI isn't set up yet (GEMINI_API_KEY is missing on the server).", 500);
  let res;
  try {
    res = await fetch(API_URL(model), {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ ...body, generationConfig: { thinkingConfig: { thinkingLevel: thinking } } }),
      signal: AbortSignal.timeout(45000),
    });
  } catch (e) {
    if (e.name === "TimeoutError" || e.name === "AbortError") throw new AiError(`${model} timed out`, 503);
    throw e;
  }
  const data = await res.json().catch(() => ({}));
  if (res.ok) return data;
  const msg = data?.error?.message || `HTTP ${res.status}`;
  console.warn(`ZyAI: ${model} failed — ${res.status} ${msg.slice(0, 160)}`);
  if (res.status === 429) throw new AiError(msg, 429);
  if (res.status === 503 || res.status === 500 || res.status === 404 || /high demand|overloaded|unavailable|no longer available|not found|not supported/i.test(msg))
    throw new AiError(msg, 503);
  throw new AiError(msg, 502);
}

const textOf = (content) => (content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("").trim();

// Google Search runs as its own small request (search grounding) and comes
// back to the main conversation as a tool result, with its links as sources.
// If search isn't available (the free tier often has no search quota) the
// model is told so and answers from what it already knows, flagged as such.
async function webSearch(query, sources, model) {
  let data;
  try {
    data = await gemini({
      contents: [{ role: "user", parts: [{ text: `Search the web and answer concisely, with figures and dates where relevant: ${query}` }] }],
      tools: [{ google_search: {} }],
    }, model);
  } catch (e) {
    if (e instanceof AiError && (e.status === 429 || e.status === 503)) {
      return { unavailable: true, note: "Live web search isn't available right now. Answer from your own knowledge, and tell the user plainly that this wasn't checked online and may be out of date." };
    }
    throw e;
  }
  const cand = data.candidates?.[0];
  (cand?.groundingMetadata?.groundingChunks || []).forEach(ch => {
    if (ch.web?.uri && !sources.some(s => s.url === ch.web.uri)) sources.push({ url: ch.web.uri, title: ch.web.title || ch.web.uri });
  });
  return { answer: textOf(cand?.content) || "No results." };
}

const systemPrompt = (user) => `You are ZyAI, the assistant built into Zyhawk, a construction company ERP (procurement, inventory, finance, HRMS).
Today is ${new Date().toISOString().slice(0, 10)}. You are talking to ${user.name || "a user"} (role: ${user.role}).

How to answer:
- Language: if the user writes in English, reply in English. Otherwise reply in Hinglish — Hindi written in English (Roman) letters, like "Is mahine 2 orders issue hue hain". Never use Devanagari (हिंदी) script unless the user writes in Devanagari.
- The user is asking about THEIR company's data. Whenever they mention a name, code or number you don't already know (a site like B-47, a project, vendor, company, order or intake number), call find_anything first — never say something doesn't exist without searching.
- For anything about the company's own data — orders, intakes, vendors, petty cash, sites — call the tools. Never guess or invent ERP figures; if the tools find nothing, say so.
- For anything outside the ERP (rates, GST/tax rules, laws, standards, news, general knowledge) call web_search.
- Answer exactly what was asked, point to point. No intro line, no restating the question, no extra background, no advice the user didn't ask for. If they ask "which documents are there / missing", give just those two lists.
- When a tool gives counts per item (e.g. missing_count_by_item), report each item separately with its own number — never add different items together into one total.
- Only state what the tools returned. Never say something "may be" missing or "ho sakta hai" — if the tool doesn't give a field, say it isn't available.
- Keep answers short and clear. Use markdown: **bold** for key figures, bullet lists, and tables for lists of records.
- Money is Indian Rupees: write it like ₹1,25,000.
- Dates as DD.MM.YYYY.
- You can only read data, not change it. If asked to create, edit or delete something, explain where in Zyhawk to do it.
- Treasury, loans and salary data are not available to you; if asked, say this information isn't available in ZyAI.
- If a tool says the user has no access to something, tell them they don't have access to that area.
- When the user attaches an image, PDF or spreadsheet, read it carefully. To pull data out (bill items, rates, quantities, a register), put it in a markdown table with clear column headers and every row you can read — the user can download any table you write as Excel with one click, so never say you can't make Excel files. If something is unreadable, mark it "?" rather than guessing.`;

async function runChat(user, history, message, model, fileParts = [], thinking = "low") {
  const sources = [];
  const contents = [
    ...history.map(m => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] })),
    { role: "user", parts: [...fileParts, { text: message }] },
  ];
  const tools = [{ functionDeclarations: DECLARATIONS }];

  for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
    const data = await gemini({ systemInstruction: { parts: [{ text: systemPrompt(user) }] }, contents, tools }, model, thinking);
    const cand = data.candidates?.[0];
    if (!cand?.content) {
      const reason = cand?.finishReason || data.promptFeedback?.blockReason;
      return { reply: reason === "SAFETY" ? "I can't help with that one." : "Sorry, I couldn't come up with an answer. Please try rephrasing.", sources };
    }
    const calls = (cand.content.parts || []).filter(p => p.functionCall);
    if (!calls.length || round === MAX_TOOL_ROUNDS) {
      return { reply: textOf(cand.content) || "Sorry, I couldn't come up with an answer.", sources };
    }
    // Keep the model's turn exactly as returned (incl. thought signatures)
    contents.push(cand.content);
    const responses = await Promise.all(calls.map(async ({ functionCall: fc }) => {
      let result;
      try {
        if (fc.name === "web_search") result = await webSearch(fc.args?.query || message, sources, model);
        else if (EXECUTORS[fc.name]) result = await EXECUTORS[fc.name](user, fc.args || {});
        else result = { error: `Unknown tool ${fc.name}` };
      } catch (e) {
        if (e instanceof AiError && e.status === 429) throw e;
        result = { error: `Lookup failed: ${e.message}` };
      }
      return { functionResponse: { name: fc.name, ...(fc.id ? { id: fc.id } : {}), response: { result } } };
    }));
    contents.push({ role: "user", parts: responses });
  }
  return { reply: "Sorry, I couldn't finish that answer.", sources };
}

const ownConversation = async (userId, id) => {
  const { data } = await supabase.from("ai_conversations").select("*").eq("id", id).eq("user_id", userId).maybeSingle();
  return data;
};

/* GET /api/ai/conversations — the user's chats, newest first */
router.get("/conversations", requireAuth, async (req, res) => {
  const { data, error } = await supabase.from("ai_conversations").select("id, title, updated_at")
    .eq("user_id", req.user.id).order("updated_at", { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ conversations: data || [] });
});

/* GET /api/ai/conversations/:id — one chat with its messages */
router.get("/conversations/:id", requireAuth, async (req, res) => {
  const conv = await ownConversation(req.user.id, req.params.id);
  if (!conv) return res.status(404).json({ error: "Chat not found" });
  const { data, error } = await supabase.from("ai_messages").select("*")
    .eq("conversation_id", conv.id).order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ conversation: conv, messages: data || [] });
});

/* DELETE /api/ai/conversations — "Clear All": every chat of this user only (messages go with them) */
router.delete("/conversations", requireAuth, async (req, res) => {
  const { error } = await supabase.from("ai_conversations").delete().eq("user_id", req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

/* DELETE /api/ai/conversations/:id */
router.delete("/conversations/:id", requireAuth, async (req, res) => {
  const conv = await ownConversation(req.user.id, req.params.id);
  if (!conv) return res.status(404).json({ error: "Chat not found" });
  const { error } = await supabase.from("ai_conversations").delete().eq("id", conv.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
});

// multer errors (too big, too many) as friendly 400s
const acceptFiles = (req, res, next) => upload.array("files", 5)(req, res, (err) => {
  if (!err) return next();
  const msg = err.code === "LIMIT_FILE_SIZE" ? `Each file must be under ${MAX_FILE_MB} MB.`
    : err.code === "LIMIT_FILE_COUNT" || err.code === "LIMIT_UNEXPECTED_FILE" ? "You can attach up to 5 files at a time." : "Couldn't read the attached file.";
  res.status(400).json({ error: msg });
});

/* POST /api/ai/chat — JSON or multipart: { conversationId?, message, mode?: "fast" | "smart", files[] } */
router.post("/chat", requireAuth, requirePerm("zyhawk_ai", "can_view"), acceptFiles, async (req, res) => {
  const files = req.files || [];
  const { models, thinking } = MODES[req.body?.mode] || MODES.fast;
  const message = String(req.body?.message || "").trim() || (files.length ? "Please read the attached file(s) and tell me what's in them." : "");
  if (!message) return res.status(400).json({ error: "Message is empty" });
  if (message.length > 4000) return res.status(400).json({ error: "Message is too long" });

  let fileParts;
  try {
    fileParts = files.map(f => {
      const part = filePart(f);
      if (!part) throw new Error(`"${f.originalname}" isn't supported — attach images, PDFs, Excel, CSV or text files.`);
      return part;
    });
  } catch (e) { return res.status(400).json({ error: e.message }); }
  const attachments = files.map(f => ({ name: f.originalname, type: f.mimetype, size: f.size }));

  try {
    let conv = req.body.conversationId ? await ownConversation(req.user.id, req.body.conversationId) : null;
    let history = [];
    if (conv) {
      const { data } = await supabase.from("ai_messages").select("role, content")
        .eq("conversation_id", conv.id).order("created_at", { ascending: false }).limit(HISTORY_TURNS);
      history = (data || []).reverse();
    }

    let answer, lastErr, usedModel;
    for (const model of models) {
      // a lite fallback inside Smart still thinks lightly — it's there for speed
      try { answer = await runChat(req.user, history, message, model, fileParts, LITE.test(model) ? "low" : thinking); usedModel = model; break; }
      catch (e) {
        if (e instanceof AiError && (e.status === 429 || e.status === 503)) { lastErr = e; continue; }
        throw e;
      }
    }
    if (!answer) {
      throw new AiError(lastErr?.status === 429
        ? "ZyAI has used up Google's free limit for now. Please try again in a few minutes."
        : "ZyAI is busy right now (Google's free servers are overloaded). Please try again in a minute.", lastErr?.status || 503);
    }
    const { reply, sources } = answer;
    const mode = modeOf(usedModel);

    const isNew = !conv;
    if (!conv) {
      const { data, error } = await supabase.from("ai_conversations")
        .insert({ user_id: req.user.id, title: message.replace(/\s+/g, " ").slice(0, 60) }).select("*").single();
      if (error) throw error;
      conv = data;
    }
    // every row lists every column: a bulk insert fills missing ones with null, not the default
    const rows = [
      { conversation_id: conv.id, role: "user", content: message, sources: [], attachments, mode: null },
      { conversation_id: conv.id, role: "assistant", content: reply, sources, attachments: [], mode },
    ];
    let { error: msgErr } = await supabase.from("ai_messages").insert(rows);
    // ai_messages.mode not added yet (zyhawk_ai.sql not re-run) — save without it rather than lose the chat
    if (msgErr && /mode/.test(msgErr.message || "")) {
      ({ error: msgErr } = await supabase.from("ai_messages").insert(rows.map(({ mode: _m, ...r }) => r)));
    }
    if (msgErr) {
      // don't leave an empty chat behind
      if (isNew) await supabase.from("ai_conversations").delete().eq("id", conv.id);
      throw msgErr;
    }
    await supabase.from("ai_conversations").update({ updated_at: new Date().toISOString() }).eq("id", conv.id);

    res.json({ conversationId: conv.id, title: conv.title, reply, sources, attachments, mode });
  } catch (err) {
    console.error("ZyAI error:", err.message);
    // Only our own friendly messages reach the screen, never raw API text
    const friendly = err instanceof AiError && [429, 503].includes(err.status) ? err.message
      : err instanceof AiError && err.status === 500 ? err.message
      : "ZyAI couldn't answer that right now. Please try again.";
    res.status(err.status || 500).json({ error: friendly });
  }
});

module.exports = router;
