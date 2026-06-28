const ZEPTOMAIL_URL = "https://api.zeptomail.in/v1.1/email/template";

function fmt(emailOrObj, fallbackName) {
  if (typeof emailOrObj === "string") {
    return { email_address: { address: emailOrObj, name: fallbackName || emailOrObj } };
  }
  return { email_address: { address: emailOrObj.email, name: emailOrObj.name || emailOrObj.email } };
}

/**
 * @param {object} opts
 * @param {string|string[]|{email,name}[]} opts.to     - single email or array
 * @param {string}                         [opts.toName] - used when `to` is a plain string
 * @param {string[]|{email,name}[]}        [opts.cc]
 * @param {string}                         opts.templateKey
 * @param {object}                         opts.mergeInfo
 */
async function sendTemplateEmail({ to, toName, cc = [], templateKey, mergeInfo }) {
  const toArr = Array.isArray(to) ? to : [to];

  const body = {
    from: {
      address: process.env.ZEPTOMAIL_FROM_EMAIL || "noreply@zyhawk.in",
      name:    process.env.ZEPTOMAIL_FROM_NAME  || "Zyhawk",
    },
    to: toArr.map(t => (typeof t === "string" && toArr.length === 1) ? fmt(t, toName) : fmt(t)),
    template_key: templateKey,
    merge_info:   mergeInfo,
  };

  const ccArr = Array.isArray(cc) ? cc : (cc ? [cc] : []);
  if (ccArr.length > 0) body.cc = ccArr.map(c => fmt(c));

  const res = await fetch(ZEPTOMAIL_URL, {
    method:  "POST",
    headers: {
      Authorization:  process.env.ZEPTOMAIL_API_KEY,
      "Content-Type": "application/json",
      Accept:         "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ZeptoMail ${res.status}: ${text}`);
  }
  const json = await res.json();
  console.log("ZeptoMail response:", JSON.stringify(json));
  return json;
}

module.exports = { sendTemplateEmail };
