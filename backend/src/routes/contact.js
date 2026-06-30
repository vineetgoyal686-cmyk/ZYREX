const express = require("express");
const router = express.Router();
const { sendRawEmail } = require("../utils/mailer");

const CONTACT_TO_EMAIL = process.env.CONTACT_TO_EMAIL || "info@zyhawk.in";

const escapeHtml = (s) =>
  String(s || "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));

router.post("/", async (req, res) => {
  try {
    const { name, company, email, message } = req.body || {};
    if (!name || !company || !email || !message) {
      return res.status(400).json({ error: "name, company, email and message are required" });
    }

    const html = `
      <div style="font-family: Arial, sans-serif; font-size: 14px; color: #1e293b;">
        <h2 style="margin: 0 0 16px;">New Demo Request — Zyhawk Landing Page</h2>
        <p><strong>Name:</strong> ${escapeHtml(name)}</p>
        <p><strong>Company:</strong> ${escapeHtml(company)}</p>
        <p><strong>Email:</strong> ${escapeHtml(email)}</p>
        <p><strong>Message:</strong></p>
        <p style="white-space: pre-wrap;">${escapeHtml(message)}</p>
      </div>
    `;

    await sendRawEmail({
      to: CONTACT_TO_EMAIL,
      subject: `New Demo Request from ${name} (${company})`,
      html,
      replyTo: { email, name },
    });

    res.json({ success: true });
  } catch (err) {
    console.error("Contact form error:", err.message);
    res.status(500).json({ error: "Failed to send message. Please try again later." });
  }
});

module.exports = router;
