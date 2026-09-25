import React, { useEffect, useMemo, useState } from "react";
import { Printer, Download, RotateCcw, UserSquare2, FileSignature, FileCheck2 } from "lucide-react";
import { jsPDF } from "jspdf";
import { authFetch } from "../../utils/authFetch";
import { useOrgId, scopedUrl } from "./orgScope";
import {
  todayISO, addDaysISO, fmtDateOrdinal, financialYear, fmtMoney, numberInWords,
  loadImageData, printPdf,
} from "./letterUtils";

const API = import.meta.env.VITE_API_URL || "http://127.0.0.1:3000";

/* ═══════════════════════════════════════════════════════════
   Defaults — sample content taken from the company's existing
   offer / appointment letter, so a new letter starts filled in.
═══════════════════════════════════════════════════════════ */
const KINDS = {
  offer:       { label: "Offer Letter",       icon: FileSignature, person: "Candidate", refTag: "Off. Ltr", serial: "1580" },
  appointment: { label: "Appointment Letter", icon: FileCheck2,    person: "Employee",  refTag: "App. Ltr", serial: "1585" },
};

const DEFAULT_DOCUMENTS = [
  "All educational certificates;",
  "Two Passport size latest photograph (Not more than 2 months old);",
  "Appointment Letter/Salary Certificate/Pay-Slip from previous employer (If applicable);",
  "Release Letter/Copy of Resignation (Last Employment);",
  "Copy of Aadhaar Card;",
  "Copy of Permanent Account Number (PAN);",
  "Cancelled Cheque.",
].join("\n");

// Letterhead of the sample letter; used when the org is Netzewa, otherwise the org's own details.
const SAMPLE_LETTERHEAD = {
  match: /netzewa/i,
  name: "NETZEWA SUSTAINABLE SOLUTION PRIVATE LIMITED",
  cin: "U52109DL2025PTC441254",
  office: "A-35, Second Floor, FIEE, Complex, Phase-II, Okhla Industrial Estate, South Delhi, New Delhi, Delhi, India, 110020",
  email: "netzewa1@gmail.com",
  phone: "+91 - 9953559454",
};

const orgName = (org) => org?.companyName || org?.company_name || "";
const shortName = (name) => (name.trim().split(/\s+/)[0] || "HR").toUpperCase();

const defaultLetterhead = (org) => {
  if (SAMPLE_LETTERHEAD.match.test(orgName(org))) {
    const { match, ...lh } = SAMPLE_LETTERHEAD;
    return lh;
  }
  return {
    name: orgName(org).toUpperCase(),
    cin: "",
    office: [org?.address, org?.district, org?.state, org?.pincode].filter(Boolean).join(", "),
    email: org?.email || "",
    phone: org?.phone || "",
  };
};

const makeRef = (lhName, kind, city, dateISO) =>
  `${shortName(lhName)}/HR/${(city || "").split(",")[0].trim() || "HO"}/${KINDS[kind].refTag}/${financialYear(dateISO)}/${KINDS[kind].serial}`;

const sampleForm = (lh) => {
  const letterDate = todayISO();
  const city = "Rewari";
  return {
    refOffer: makeRef(lh.name, "offer", city, letterDate),
    refAppointment: makeRef(lh.name, "appointment", city, letterDate),
    letterDate,
    salutation: "Mr.",
    name: "Mohit",
    employeeId: "",
    address: "Khar Khara (300),\nRewari, Haryana - 123106",
    designation: "Data Entry Operator",
    city,
    joiningDate: addDaysISO(3),
    reportingTime: "9:30 A.M.",
    reportingTo: "Neeraj Kumar - Manager Warehouse Operations",
    monthlySalary: "20000",
    probationMonths: "6",
    offerAcceptDays: "2",
    documents: DEFAULT_DOCUMENTS,
    probNoticeOrgDays: "1",
    probNoticeEmpDays: "15",
    noticeDays: "30",
    apptAcceptDays: "7",
    extraTerms: "",
    signatoryName: "Authorized Signatory",
    signatoryDept: "Human Resource Department",
    includeSign: true,
  };
};

/* ═══════════════════════════════════════════════════════════
   Letter content as blocks — rendered by both the preview and the PDF.
   Text supports **bold** runs.
═══════════════════════════════════════════════════════════ */
const words = (n) => numberInWords(n).toLowerCase();
const days = (n) => `${words(n)} day${Number(n) === 1 ? "" : "s"}`;

const splitExtraTerms = (text) => text.split("\n").map(s => s.trim()).filter(Boolean);

function buildBlocks(f, lh, kind) {
  const co = lh.name ? lh.name.replace(/\w\S*/g, w => w[0] + w.slice(1).toLowerCase()) : "the Company";
  const name = f.name.trim() || "__________";
  const first = f.name.trim().split(/\s+/)[0] || KINDS[kind].person;
  const desig = f.designation.trim() || "__________";
  const city = f.city.trim() || "__________";
  const monthly = Number(f.monthlySalary) || 0;
  const annual = monthly * 12;
  const prob = Number(f.probationMonths) || 0;
  const addrLines = f.address.split("\n").map(s => s.trim()).filter(Boolean);

  if (kind === "offer") {
    const points = [
      `We would appreciate if your start date is no later than **${fmtDateOrdinal(f.joiningDate)}**${f.reportingTime.trim() ? ` at ${f.reportingTime.trim().replace(/\.$/, "")}` : ""}.`,
      `**You will be entitled to receive a compensation of Rs. ${fmtMoney(monthly)}/- (${numberInWords(monthly)} Rupees Per Month)**`,
      f.reportingTo.trim() && `You will be reporting to ${f.reportingTo.trim()}.`,
      "Your hours of work will be as per the Company policy and requirement of the project you are working on.",
      `This position is offered subject to satisfactory reference and pre/post-employment checks by the Company${prob ? ` and completion of ${words(prob)}-month probation period during the time your performance will be reviewed` : ""}.`,
      "Please note in case the pre/post-employment checks are found to be unfavourable, the management reserves the right to terminate your appointment forthwith, without any notice or payment in lieu thereof. Hence, it is assumed that the details set out in your application for the job are absolutely correct and that no fact either has been concealed or falsely stated.",
      "You shall always be subject to overall policy of the Company and agree to be bound by the same. It is your responsibility to ask the HR team to provide you with all the policies of the Company and you should abide by all such policies.",
      "Any Income Tax applicable on your remuneration or any other payment made by the Company in respect to taxes will be borne by you and as required by law, will be deducted at source.",
      ...splitExtraTerms(f.extraTerms),
      "Please return the duplicate copy of this letter duly signed in token of your having accepted this employment offer. We will then proceed to create a formal appointment letter at the time of joining, which outlines the detailed Terms & Conditions.",
    ].filter(Boolean);

    return [
      { t: "ref", text: f.refOffer },
      { t: "title", text: "Offer Letter", gapBefore: 8 },
      { t: "p", text: `Date: ${fmtDateOrdinal(f.letterDate)}`, gap: 5 },
      { t: "lines", lines: [name, ...addrLines] },
      { t: "p", text: `**Subject: Letter of offer for the post of ${desig}.**`, gap: 5 },
      { t: "p", text: `Dear ${first},`, gap: 1.5 },
      { t: "p", text: "Congratulations!!", gap: 5 },
      { t: "p", text: `On behalf of **${co}** we are pleased to extend to you an offer of employment for the position of **${desig}** at our ${city} location. Details of terms and conditions of offer are as under:` },
      { t: "ol", items: points, indent: 8 },
      { t: "p", text: `The entire team at **${co}** is looking forward to working with you and we are confident you will be able to make a significant contribution to the success of our organization.` },
      { t: "p", text: `Request you to kindly accept the contents of this letter and return to us an executed copy of the same for our records purposes. Please note that the acceptance copy should reach us within ${days(f.offerAcceptDays)} of issuance of this letter failing which this offer will stand withdrawn and cancelled automatically, without any further notice to you.` },
      { t: "offerSign", co, accepted: `Accepted ${f.salutation ? f.salutation + " " : ""}${name}` },
      ...(f.documents.trim() ? [
        { t: "break" },
        { t: "p", text: "Request you to bring the copies of the following documents at the time of joining along with original copies for verification:" },
        { t: "ol", items: f.documents.split("\n").map(s => s.trim()).filter(Boolean), indent: 8, gap: 8 },
        { t: "p", text: "**NOTE: You are requested to inform your HR coordinator well in advance in case you are unable to provide any of the above-mentioned documents on joining day. In the absence of any above-mentioned documents we will not be able to complete your joining.**" },
      ] : []),
    ];
  }

  /* ── Appointment letter ── */
  const clauses = [
    ["Compensation", ["The above compensation includes agreed monetary value of perquisites. Income Tax where applicable will be deducted at source from your monthly compensation as per government rules."]],
    ["Commencement/term", [`You shall start with effect from ${fmtDateOrdinal(f.joiningDate)}.`]],
    prob > 0 && ["Probation Period", [`You will be on probation for a period of ${prob} (${numberInWords(prob)}) months from the date of joining. Your confirmation or status of probation will be subject to evaluation done by your reporting officer or Directors of organization based on your performance during the probation period. You will be automatically considered as regular employee after the satisfactory completion of your ${words(prob)} months unless specifically communicated to you in writing.`]],
    ["Hours of work", ["You will observe the working hours normally observed by office/ location you are assigned to. The working hours may be subject to change from time to time."]],
    ["Leave", [
      "You will be entitled to National Holidays, casual and sick leaves as per policy of organization. For the purpose of leave the Year Shall run from Jan to Dec.",
      "All leaves shall be applied in one week advance and should be approved by the Reporting Manager/ Project Head/ Team Leader/ Director of the Company. The organization reserves the right to grant or reject leave depending on the urgency and contingency plan.",
    ]],
    ["Performance and Compensation Review", ["Your continuation of employment shall be subject to your meeting the business targets determined by the Company from time to time during the employment with the Company. Any failure to achieve the prescribed targets shall result in a review of terms of your employment with the Company."]],
    ["Transfer", ["The organization shall reserve the right to transfer any location existing or new as per the requirement, the transfer can also happen from one department to another. In such Situation your terms of appointment will remain unchanged."]],
    ["Ownership of work", ["The ownership of any rights to work by the employee during terms of the employment shall remain with the organization."]],
    ["Termination", [
      `During your probation period, services can be terminated by giving ${days(f.probNoticeOrgDays)} notice by the organization however you are required to give notice of ${days(f.probNoticeEmpDays)} for leaving the organisation during the probation period of your services.`,
      "In case of any kind breach of office environment, non-cooperation with office or office colleagues, misbehavior, unauthorized absence, any other act or omission, negligence in disposing off their responsibilities or any kind of other disobedience and/or abandonment of duty or arising out of any performance/disciplinary issue, organization or its authorized people can terminate you at any point of time without any serving of notice.",
      `After confirmation services can be terminated by the organization by giving ${days(f.noticeDays)} of notice or on payment of an amount equivalent to ${days(f.noticeDays)} of salary. In case you decide to leave the organization, you will be required to give ${days(f.noticeDays)} of notice period or on payment of an amount equivalent of ${days(f.noticeDays)} salary.`,
    ]],
    ["Conflict of Interest", ["You shall disclose all your business interests to the Company, whether or not they are similar to or in conflict with the business(es) or activities of the Company, and all circumstances in respect thereof and whether there is, or might be, a conflict between the Company and you."]],
    ["Company Intellectual Property", [
      "The company retains the ownership of the intellectual property rights relating to any inventions, letters, patent, trademarks, service marks, designs, copyrights, drawings, computer programs, know-how and rights of like nature however arising and whether registered and unregistered (Intellectual Property) Concerning work undertaken while in the employment of the Company. You as an employee are bound to keep the above-mentioned safe and secure and shall not cause it to be used for any purpose other than authorized by the Company.",
      "Subject to any relevant legislation, if at any time in the course of your employment you make or discover or participate in the making or discovery of any of the above mentioned relating to or capable of being used in the Company, you shall immediately disclose full details thereof to the company and, at the request and expense of the Company, you shall do all things which may be necessary or desirable for obtaining appropriate forms of protection for such Intellectual property in such parts of the world as may be specified by the company or its nominee. All rights and obligations under this paragraph in respect of intellectual property made or your employment and shall be binding upon your personal representatives.",
    ]],
    ["Return of Company Property", [
      "You shall promptly upon request by the Company and in any event upon the termination of your employment deliver to the Company all list of clients or customers, correspondence, and all other documents, paper and records in whatever forms including but not limited to electronically held data containing or referring to any group Company which may have been prepared by you or come into your possession, custody or control in the course of your employment including any prior employment with any Group Company. You shall not keep any copies of these items.",
      "Company Property also consists the laptop, other assets and documents handed over to you at the time of joining for carrying out work smoothly. This will be your moral duty to take care of those property which are provided by the Company and you will be solely responsible for the damage or any kind of loss or theft. These assets and other things need to be returned before full and final settlement. In case of failure, the necessary action will be taken by the management.",
    ]],
    ["Compliance Rules", ["You shall be subject to compliance rules as determined by the company from time to time or as may be imposed by any regulatory body. It is your responsibility to ensure that you are aware of the compliance rules in force from time to time that you adhere to them. From time to time the company may require that you sign undertakings that you will be abide by the then existing rules and regulations."]],
    ["Other terms and conditions of service", [
      "Professional ethics & Confidentiality: While you are in the service you are not permitted to carry out any business or profession or enter for any part of your time, in any capacity, the services of or be employed by or engaged with any other firm, company or person. You will not divulge to any person/entity or utilize any trade secrets or any other related information (which you may possess by reason of your association with the organization) outside the organization. You and any of your immediate family members will not indulge in any business activity which may be in any way be linked to your current set of activities in the organization or through which some favors may be extended to the said business. You will not indulge in any cash transaction/activity with any of the parties/clients. Any such transaction entered into would be deemed to be violation of the normal working procedures and all consequences would be at sole personal risk and the organization would not be responsible in any way whatsoever.",
      "You will also keep the management of the organization posted of any activity which comes across to you which may be in conflict of the business interest of the organization or any of the clients the organization may be working for. You will adhere to the IT security procedures prescribed by the organization.",
    ]],
    ["Amendments", ["The organization reserves all rights to change any rules regulations as deems fit from time to time and you will be governed by the rules which are in force and as may be added, amended or introduced."]],
    ["Company Policies", ["You will be governed by the Company's policies, as applicable at your level. The Company reserves the right to amend the policies from time to time."]],
    ["Confidentiality", ["You shall not during the course of your employment with the company or any time thereafter, use or disclose or divulge to any person or firm except to the extent permitted in writing by the Company, either during the continuance of your service with the Company or any extension thereof and even after the cessation of your service employment with the Company by any reason whatsoever:"], [
      "Any secret, affairs, confidential information entrusted to you or coming to your knowledge relating to the business of the company or any of its customers in the course of your employment.",
      "Any special and/ or secret knowledge or processes developed by the company or by its collaborators.",
      "The publishing of any book, booklet, brochure or any other publication, whether for remuneration or otherwise relating to the affairs of the company or to your work in the Company.",
      "You shall not disclose to any public papers, journals, pamphlets or leaflets or caused to be disclosed at any time, information or documents, official or otherwise relating to the company or its subsidiaries, except without prior approval.",
    ]],
    ["General", [`You will keep the organization informed about any Change in your residential address or qualification. If you are agreeable to the above-mentioned terms and conditions, please intimate your acceptance to us by returning a copy of this letter, duly signed by us, within ${days(f.apptAcceptDays)} of receipt. In case no confirmation is received within the above-mentioned period the appointment letter shall be deemed to have been withdrawn.`]],
    ...splitExtraTerms(f.extraTerms).map(t => {
      const m = t.match(/^([^:.]{2,50}):\s+(.+)$/);
      return m ? [m[1], [m[2]]] : ["Additional Terms", [t]];
    }),
  ].filter(Boolean);

  return [
    { t: "ref", text: f.refAppointment },
    { t: "title", text: "Appointment Letter", gapBefore: 10 },
    { t: "title", text: "PRIVATE AND CONFIDENTIAL", gap: 7 },
    { t: "p", text: fmtDateOrdinal(f.letterDate) },
    { t: "p", text: `${f.salutation ? f.salutation + " " : ""}${name},` },
    ...(f.employeeId.trim() ? [{ t: "p", text: `Employee ID: ${f.employeeId.trim()}` }] : []),
    { t: "p", text: `Address ${addrLines.join(" ")}` },
    { t: "p", text: `**Dear ${first},**` },
    { t: "p", text: `Referring to our discussions and offer letter mail, we are pleased to appoint you in our organization **${co}.**` },
    { t: "p", text: `**Designation: ${desig}**` },
    { t: "p", text: `**Your annual cost to company would be Rs.${fmtMoney(annual)}/- ( ${numberInWords(annual)} Rupees Only)**, as per the remuneration policy of the Company.` },
    { t: "p", text: "Given below are the terms and conditions of your appointment." },
    ...clauses.map(([title, paras, sub], i) => ({ t: "clause", n: i + 1, title, paras, sub })),
    { t: "p", text: "This appointment is made on the basis of the information as provided by you. If any point of time, any information or details given by you is found incorrect or false, your service will be terminated without any notice, salary in lieu of notice or compensation.", gapBefore: 3 },
    { t: "p", text: "Kindly return the duplicate copy of this letter, duly signed by you, in acceptance of the terms and conditions as set out." },
    { t: "p", text: `We welcome you as member of our team and wish you a rewarding career with **${co}.**` },
    { t: "apptSign", co },
  ];
}

/* ═══════════════════════════════════════════════════════════
   PDF renderer
═══════════════════════════════════════════════════════════ */
const FONT = "helvetica";
// Standard PDF fonts only cover Latin-1; normalise typographic characters.
const clean = (s) => String(s ?? "").replace(/[–—]/g, "-").replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
const parseRuns = (text) => clean(text).split("**").map((part, i) => ({ text: part, bold: i % 2 === 1 })).filter(r => r.text);

async function renderPdf(blocks, lh, { signImg, stampImg, footerLabel, signatory = [] }) {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const W = 210, H = 297, M = 20, CW = W - M * 2, BOTTOM = H - 28, SIZE = 10.5, LH = 5;

  const header = () => {
    doc.setTextColor(0, 0, 0).setDrawColor(0, 0, 0);
    let y = 17;
    doc.setFont(FONT, "bold").setFontSize(16.5);
    doc.splitTextToSize(clean(lh.name).toUpperCase(), CW + 6).forEach(l => { doc.text(l, W / 2, y, { align: "center" }); y += 6.5; });
    doc.setFontSize(10);
    if (lh.cin) { doc.text(`CIN: ${clean(lh.cin)}`, W / 2, y, { align: "center" }); y += 5; }
    if (lh.office) doc.splitTextToSize(`Regd Office: ${clean(lh.office)}`, CW - 8).forEach(l => { doc.text(l, W / 2, y, { align: "center" }); y += 5; });
    const contact = [lh.email && `Email: ${clean(lh.email)}`, lh.phone && `Contact no. ${clean(lh.phone)}`].filter(Boolean).join("; ");
    if (contact) { doc.text(contact, W / 2, y, { align: "center" }); y += 5; }
    doc.setLineWidth(0.8).line(M - 4, y - 2.5, W - M + 4, y - 2.5);
    return y + 7;
  };

  let y = header();
  const newPage = () => { doc.addPage(); y = header(); };
  const ensure = (h) => { if (y + h > BOTTOM) newPage(); };

  // getTextWidth applies kerning but doc.text draws without it, so measure unkerned
  // or words placed piece-by-piece run into each other ("Youwill").
  const textW = (s) => doc.getStringUnitWidth(s, { kerning: {} }) * doc.getFontSize() / doc.internal.scaleFactor;

  /* Wrapped, justified paragraph with inline **bold** runs. */
  const rich = (text, { x = M, width = CW, justify = true } = {}) => {
    const chunks = [];
    let cur = null;
    parseRuns(text).forEach(r => {
      doc.setFont(FONT, r.bold ? "bold" : "normal").setFontSize(SIZE);
      r.text.split(/(\s+)/).forEach(tok => {
        if (!tok) return;
        if (/^\s+$/.test(tok)) { cur = null; return; }
        const piece = { text: tok, bold: r.bold, w: textW(tok) };
        if (cur) { cur.pieces.push(piece); cur.w += piece.w; }
        else { cur = { pieces: [piece], w: piece.w }; chunks.push(cur); }
      });
    });
    doc.setFont(FONT, "normal").setFontSize(SIZE);
    const sp = textW(" ");
    const lines = [];
    let line = [], lw = 0;
    chunks.forEach(c => {
      const add = line.length ? sp + c.w : c.w;
      if (line.length && lw + add > width) { lines.push(line); line = [c]; lw = c.w; }
      else { line.push(c); lw += add; }
    });
    if (line.length) lines.push(line);
    lines.forEach((ln, i) => {
      ensure(LH);
      const used = ln.reduce((s, c) => s + c.w, 0);
      const gap = justify && i < lines.length - 1 && ln.length > 1 ? (width - used) / (ln.length - 1) : sp;
      let cx = x;
      ln.forEach(c => {
        c.pieces.forEach(p => { doc.setFont(FONT, p.bold ? "bold" : "normal").setFontSize(SIZE); doc.text(p.text, cx, y); cx += p.w; });
        cx += gap;
      });
      y += LH;
    });
  };

  const list = (items, { x, width, marker }) => {
    items.forEach((it, i) => {
      ensure(LH);
      doc.setFont(FONT, "normal").setFontSize(SIZE);
      doc.text(marker(i), x, y);
      rich(it, { x: x + 7, width: width - 7 });
      y += 1;
    });
  };

  const signatureImages = (x) => {
    let h = 0;
    if (signImg) { const ih = 14, iw = Math.min(40, (signImg.w / signImg.h) * ih); doc.addImage(signImg.data, "PNG", x, y - 2, iw, ih); h = ih; }
    if (stampImg) { const ih = 22, iw = Math.min(30, (stampImg.w / stampImg.h) * ih); doc.addImage(stampImg.data, "PNG", x + 44, y - 4, iw, ih); h = Math.max(h, ih - 4); }
    y += Math.max(h, 16) + 2;
  };

  const signatoryLines = () => {
    doc.setFont(FONT, "bold").setFontSize(SIZE);
    signatory.filter(Boolean).forEach(l => { doc.text(clean(l), M, y); y += 6; });
  };

  for (const b of blocks) {
    if (b.gapBefore) y += b.gapBefore;
    switch (b.t) {
      case "ref": {
        doc.setFont(FONT, "bold").setFontSize(10);
        const t = clean(b.text);
        doc.text(t, M, y);
        doc.setLineWidth(0.25).line(M, y + 0.9, M + doc.getTextWidth(t), y + 0.9);
        y += 6;
        break;
      }
      case "title": {
        ensure(LH * 2);
        doc.setFont(FONT, "bold").setFontSize(11);
        const t = clean(b.text), tw = doc.getTextWidth(t);
        doc.text(t, W / 2, y, { align: "center" });
        doc.setLineWidth(0.25).line(W / 2 - tw / 2, y + 0.9, W / 2 + tw / 2, y + 0.9);
        y += b.gap ?? 6;
        break;
      }
      case "p": rich(b.text); y += b.gap ?? 3.5; break;
      case "lines":
        doc.setFont(FONT, "normal").setFontSize(SIZE);
        b.lines.forEach(l => { ensure(LH); doc.text(clean(l), M, y); y += LH; });
        y += 4;
        break;
      case "ol":
        list(b.items, { x: M + (b.indent || 0), width: CW - (b.indent || 0), marker: i => `${i + 1}.` });
        y += b.gap ?? 4;
        break;
      case "clause": {
        ensure(LH * 3);
        doc.setFont(FONT, "bold").setFontSize(SIZE);
        doc.text(clean(`${b.n}. ${b.title}:`), M + 3, y);
        y += LH;
        b.paras.forEach((p, i) => { rich(p, { x: M + 3, width: CW - 3 }); if (i < b.paras.length - 1) y += 3; });
        if (b.sub) { y += 1; list(b.sub, { x: M + 10, width: CW - 10, marker: i => `${String.fromCharCode(97 + i)}.` }); }
        y += 4;
        break;
      }
      case "break": newPage(); break;
      case "offerSign": {
        ensure(48);
        y += 4;
        const rightX = W - M - 62, top = y;
        doc.setFont(FONT, "bold").setFontSize(SIZE);
        doc.text("Thanking You.", M, y);
        doc.text(clean(b.accepted), rightX, y);
        doc.setLineWidth(0.3).line(rightX, y + 10, W - M, y + 10);
        y += 7;
        doc.text(clean(`For ${b.co}`), M, y);
        y += 5;
        signatureImages(M);
        signatoryLines();
        y = Math.max(y, top + 20);
        break;
      }
      case "apptSign": {
        ensure(62);
        y += 3;
        doc.setFont(FONT, "bold").setFontSize(SIZE);
        doc.text(clean(`For ${b.co}.`), M, y);
        y += 5;
        signatureImages(M);
        signatoryLines();
        y += 2;
        doc.setLineWidth(0.3).line(M, y, W - M - 10, y);
        y += 6;
        doc.setFont(FONT, "normal").setFontSize(SIZE);
        doc.text("I have read all terms and conditions of the offer and would like to confirm my unconditional acceptance.", M, y);
        y += 9;
        doc.text("Employee Signature:", M, y);
        doc.line(M + 36, y + 0.5, M + 110, y + 0.5);
        y += 6;
        break;
      }
      default: break;
    }
  }

  // Candidate / employee initials line at the bottom-right of every page, as on the printed letter.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setDrawColor(0).setLineWidth(0.3).line(W - M - 50, H - 20, W - M, H - 20);
    doc.setFont(FONT, "normal").setFontSize(7.5).setTextColor(110, 110, 110);
    doc.text(footerLabel, W - M, H - 16, { align: "right" });
    doc.text(`Page ${p} of ${pages}`, M, H - 16);
    doc.setTextColor(0, 0, 0);
  }
  return doc;
}

/* ═══════════════════════════════════════════════════════════
   HTML preview (same blocks)
═══════════════════════════════════════════════════════════ */
const Rich = ({ text }) => parseRuns(text).map((r, i) => r.bold ? <strong key={i}>{r.text}</strong> : <span key={i}>{r.text}</span>);

function PreviewPage({ lh, children, footerLabel }) {
  return (
    <div className="bg-white border border-slate-200 shadow-sm mx-auto w-full max-w-[800px] px-8 sm:px-14 pt-8 pb-6 text-[13px] leading-[1.55] text-black flex flex-col min-h-[1000px]">
      <div className="text-center font-bold">
        <p className="text-[21px] leading-tight">{lh.name}</p>
        {lh.cin && <p className="text-[13px]">CIN: {lh.cin}</p>}
        {lh.office && <p className="text-[13px] px-6">Regd Office: {lh.office}</p>}
        {(lh.email || lh.phone) && <p className="text-[13px]">{[lh.email && `Email: ${lh.email}`, lh.phone && `Contact no. ${lh.phone}`].filter(Boolean).join("; ")}</p>}
      </div>
      <div className="border-b-[3px] border-black -mx-3 mt-1 mb-6" />
      <div className="flex-1">{children}</div>
      <div className="self-end mt-8 w-52 text-right">
        <div className="border-b border-black" />
        <p className="text-[10px] text-slate-500 mt-1">{footerLabel}</p>
      </div>
    </div>
  );
}

function Preview({ blocks, lh, f, org, footerLabel }) {
  const pages = [[]];
  blocks.forEach(b => b.t === "break" ? pages.push([]) : pages[pages.length - 1].push(b));
  const signImgs = f.includeSign && (org?.signUrl || org?.stampUrl) ? (
    <div className="flex items-center gap-4 h-20">
      {org?.signUrl && <img src={org.signUrl} alt="" className="h-14 object-contain" />}
      {org?.stampUrl && <img src={org.stampUrl} alt="" className="h-20 object-contain" />}
    </div>
  ) : <div className="h-16" />;
  const signatory = [f.signatoryName, f.signatoryDept].filter(Boolean).map((l, i) => <p key={i} className="font-bold">{l}</p>);

  const render = (b, i) => {
    const mt = b.gapBefore ? { marginTop: b.gapBefore * 3 } : undefined;
    switch (b.t) {
      case "ref":   return <p key={i} className="font-bold underline text-[12.5px]">{b.text}</p>;
      case "title": return <p key={i} style={mt} className={`text-center font-bold underline ${b.gap ? "mb-6" : "mb-1"}`}>{b.text}</p>;
      case "p":     return <p key={i} style={mt} className="text-justify mb-3"><Rich text={b.text} /></p>;
      case "lines": return <div key={i} className="mb-4">{b.lines.map((l, j) => <p key={j}>{l}</p>)}</div>;
      case "ol":    return (
        <ol key={i} className="list-decimal pl-12 mb-4 space-y-1 text-justify">
          {b.items.map((it, j) => <li key={j}><Rich text={it} /></li>)}
        </ol>);
      case "clause": return (
        <div key={i} className="pl-3 mb-4 text-justify">
          <p className="font-bold">{b.n}. {b.title}:</p>
          {b.paras.map((p, j) => <p key={j} className={j ? "mt-3" : ""}><Rich text={p} /></p>)}
          {b.sub && <ol className="list-[lower-alpha] pl-12 mt-1 space-y-0.5">{b.sub.map((s, j) => <li key={j}>{s}</li>)}</ol>}
        </div>);
      case "offerSign": return (
        <div key={i} className="flex justify-between gap-6 mt-6 mb-4">
          <div>
            <p className="font-bold">Thanking You.</p>
            <p className="font-bold mt-1">For {b.co}</p>
            {signImgs}
            {signatory}
          </div>
          <div className="w-56 shrink-0">
            <p className="font-bold">{b.accepted}</p>
            <div className="border-b border-black mt-8" />
          </div>
        </div>);
      case "apptSign": return (
        <div key={i} className="mt-5">
          <p className="font-bold">For {b.co}.</p>
          {signImgs}
          {signatory}
          <div className="border-b border-black mt-3 mb-2 mr-8" />
          <p>I have read all terms and conditions of the offer and would like to confirm my unconditional acceptance.</p>
          <p className="mt-4">Employee Signature: <span className="inline-block w-72 border-b border-black" /></p>
        </div>);
      default: return null;
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {pages.map((pg, i) => <PreviewPage key={i} lh={lh} footerLabel={footerLabel}>{pg.map(render)}</PreviewPage>)}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   Form UI
═══════════════════════════════════════════════════════════ */
const inp = "w-full border border-slate-200 rounded px-2.5 py-1.5 text-[13px] text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400";
const Field = ({ label, children, span2, hint }) => (
  <label className={`flex flex-col gap-1 ${span2 ? "col-span-2" : ""}`}>
    <span className="text-[11px] font-semibold text-slate-500">{label}</span>
    {children}
    {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
  </label>
);
const Section = ({ title, children, note }) => (
  <div className="bg-white border border-slate-200 rounded-lg">
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100">
      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{title}</p>
      {note && <span className="text-[10px] text-slate-400">{note}</span>}
    </div>
    <div className="p-4 grid grid-cols-2 gap-3">{children}</div>
  </div>
);

const lhKey = (orgId) => `hr_letterhead_${orgId || "default"}`;
const readLetterhead = (org) => {
  try {
    const saved = JSON.parse(localStorage.getItem(lhKey(org?.id)) || "null");
    if (saved && typeof saved === "object") return { ...defaultLetterhead(org), ...saved };
  } catch { /* storage unavailable */ }
  return defaultLetterhead(org);
};

export default function HRLetter({ org, showToast }) {
  const orgId = useOrgId();
  const [kind, setKind]     = useState("offer");
  const [lh, setLh]         = useState(() => readLetterhead(org));
  const [form, setForm]     = useState(() => sampleForm(readLetterhead(org)));
  const [emps, setEmps]     = useState([]);
  const [desigs, setDesigs] = useState([]);
  const [busy, setBusy]     = useState(null);
  const K = KINDS[kind];
  const isAppt = kind === "appointment";

  useEffect(() => {
    try { localStorage.setItem(lhKey(org?.id), JSON.stringify(lh)); } catch { /* storage unavailable */ }
  }, [lh, org?.id]);

  useEffect(() => {
    authFetch(scopedUrl(`${API}/api/organisation/employees`, orgId)).then(r => r.json()).then(j => setEmps(j.contacts || [])).catch(() => {});
    authFetch(scopedUrl(`${API}/api/organisation/org-designations`, orgId)).then(r => r.json()).then(j => setDesigs((j.designations || []).map(d => d.title).filter(Boolean))).catch(() => {});
  }, [orgId]);

  const set   = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setL  = (k) => (e) => setLh(l => ({ ...l, [k]: e.target.value }));

  const prefillFromEmployee = (id) => {
    const e = emps.find(x => String(x.id) === String(id));
    if (!e) return;
    setForm(f => ({
      ...f,
      name: e.personName || f.name,
      employeeId: e.employeeId || "",
      salutation: e.gender?.toLowerCase().startsWith("f") ? "Ms." : e.gender?.toLowerCase().startsWith("m") ? "Mr." : f.salutation,
      address: e.address || f.address,
      designation: e.designation || f.designation,
      city: e.workLocation || f.city,
      reportingTo: e.reportingTo || f.reportingTo,
      joiningDate: e.joiningDate ? String(e.joiningDate).slice(0, 10) : f.joiningDate,
    }));
  };

  const blocks = useMemo(() => buildBlocks(form, lh, kind), [form, lh, kind]);
  const footerLabel = `Signature of the ${K.person.toLowerCase()}`;
  const fileName = `${K.label.replace(/ /g, "_")}_${(form.name.trim() || K.person).replace(/[^\w]+/g, "_")}.pdf`;

  const validate = () => {
    if (!lh.name.trim())          { showToast?.("Enter the company name in the letterhead", "error"); return false; }
    if (!form.name.trim())        { showToast?.(`Enter the ${K.person.toLowerCase()}'s name`, "error"); return false; }
    if (!form.designation.trim()) { showToast?.("Enter the designation", "error"); return false; }
    return true;
  };

  const run = async (mode) => {
    if (!validate()) return;
    setBusy(mode);
    try {
      const [signImg, stampImg] = form.includeSign
        ? await Promise.all([loadImageData(org?.signUrl), loadImageData(org?.stampUrl)])
        : [null, null];
      const doc = await renderPdf(blocks, lh, { signImg, stampImg, footerLabel, signatory: [form.signatoryName, form.signatoryDept] });
      if (mode === "download") doc.save(fileName); else printPdf(doc);
    } catch (err) {
      console.error(err);
      showToast?.("Could not generate the PDF", "error");
    } finally { setBusy(null); }
  };

  const monthly = Number(form.monthlySalary) || 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Letter type + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex border border-slate-300 rounded-lg overflow-hidden bg-white">
          {Object.entries(KINDS).map(([id, k]) => {
            const Icon = k.icon;
            return (
              <button key={id} onClick={() => setKind(id)}
                className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold transition-colors ${kind === id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50"}`}>
                <Icon size={15} /> {k.label}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <button onClick={() => setForm(sampleForm(lh))} title="Reset to sample content"
            className="inline-flex items-center gap-1.5 text-sm font-semibold border border-slate-300 bg-white text-slate-600 px-3 py-2 rounded hover:bg-slate-50">
            <RotateCcw size={14} /> Reset
          </button>
          <button onClick={() => run("print")} disabled={!!busy}
            className="inline-flex items-center gap-1.5 text-sm font-semibold border border-slate-300 bg-white text-slate-700 px-3 py-2 rounded hover:bg-slate-50 disabled:opacity-60">
            <Printer size={14} /> {busy === "print" ? "Preparing…" : "Print"}
          </button>
          <button onClick={() => run("download")} disabled={!!busy}
            className="inline-flex items-center gap-1.5 text-sm font-semibold bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-60">
            <Download size={14} /> {busy === "download" ? "Generating…" : "Download PDF"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[420px_minmax(0,1fr)] gap-5 items-start">
        {/* ── Form ── */}
        <div className="flex flex-col gap-4">
          <Section title="Letterhead" note="Saved for this organisation">
            <Field label="Company name" span2><input className={inp} value={lh.name} onChange={setL("name")} /></Field>
            <Field label="CIN" span2><input className={inp} value={lh.cin} onChange={setL("cin")} /></Field>
            <Field label="Regd office" span2><textarea rows={2} className={inp} value={lh.office} onChange={setL("office")} /></Field>
            <Field label="Email"><input className={inp} value={lh.email} onChange={setL("email")} /></Field>
            <Field label="Contact no."><input className={inp} value={lh.phone} onChange={setL("phone")} /></Field>
          </Section>

          <Section title={K.person}>
            {emps.length > 0 && (
              <Field label="Fill from an existing employee (optional)" span2>
                <div className="relative">
                  <UserSquare2 size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select className={`${inp} pl-8`} value="" onChange={e => prefillFromEmployee(e.target.value)}>
                    <option value="">Select employee…</option>
                    {emps.map(e => <option key={e.id} value={e.id}>{e.personName}{e.employeeId ? ` (${e.employeeId})` : ""}</option>)}
                  </select>
                </div>
              </Field>
            )}
            <Field label="Salutation">
              <select className={inp} value={form.salutation} onChange={set("salutation")}>
                {["Mr.", "Ms.", "Mrs.", "Dr.", ""].map(s => <option key={s} value={s}>{s || "None"}</option>)}
              </select>
            </Field>
            <Field label="Full name *"><input className={inp} value={form.name} onChange={set("name")} /></Field>
            {isAppt && <Field label="Employee ID (optional)" span2><input className={inp} value={form.employeeId} onChange={set("employeeId")} /></Field>}
            <Field label="Address" span2><textarea rows={2} className={inp} value={form.address} onChange={set("address")} /></Field>
          </Section>

          <Section title="Job details">
            <Field label="Designation *">
              <input className={inp} list="hrl-desigs" value={form.designation} onChange={set("designation")} />
              <datalist id="hrl-desigs">{desigs.map(d => <option key={d} value={d} />)}</datalist>
            </Field>
            <Field label="Location"><input className={inp} value={form.city} onChange={set("city")} /></Field>
            <Field label={isAppt ? "Effective from" : "Start date (no later than)"}><input type="date" className={inp} value={form.joiningDate} onChange={set("joiningDate")} /></Field>
            {!isAppt
              ? <Field label="Reporting time"><input className={inp} value={form.reportingTime} onChange={set("reportingTime")} /></Field>
              : <Field label="Probation (months)"><input type="number" min="0" className={inp} value={form.probationMonths} onChange={set("probationMonths")} /></Field>}
            {!isAppt && <Field label="Reporting to" span2><input className={inp} value={form.reportingTo} onChange={set("reportingTo")} /></Field>}
            <Field label="Salary per month (Rs.)" span2
              hint={monthly > 0 ? `${numberInWords(monthly)} per month · Rs. ${fmtMoney(monthly * 12)} per year (${numberInWords(monthly * 12)})` : ""}>
              <input type="number" min="0" className={inp} value={form.monthlySalary} onChange={set("monthlySalary")} />
            </Field>
            {!isAppt && <Field label="Probation (months)"><input type="number" min="0" className={inp} value={form.probationMonths} onChange={set("probationMonths")} /></Field>}
          </Section>

          <Section title="Terms">
            {!isAppt ? (
              <>
                <Field label="Acceptance within (days)"><input type="number" min="1" className={inp} value={form.offerAcceptDays} onChange={set("offerAcceptDays")} /></Field>
                <div />
                <Field label="Documents to bring (one per line)" span2 hint="Leave empty to skip the documents page">
                  <textarea rows={7} className={inp} value={form.documents} onChange={set("documents")} />
                </Field>
              </>
            ) : (
              <>
                <Field label="Probation notice by company (days)"><input type="number" min="0" className={inp} value={form.probNoticeOrgDays} onChange={set("probNoticeOrgDays")} /></Field>
                <Field label="Probation notice by employee (days)"><input type="number" min="0" className={inp} value={form.probNoticeEmpDays} onChange={set("probNoticeEmpDays")} /></Field>
                <Field label="Notice after confirmation (days)"><input type="number" min="0" className={inp} value={form.noticeDays} onChange={set("noticeDays")} /></Field>
                <Field label="Acceptance within (days)"><input type="number" min="1" className={inp} value={form.apptAcceptDays} onChange={set("apptAcceptDays")} /></Field>
              </>
            )}
            <Field label="Additional terms (one per line)" span2
              hint={isAppt ? 'Write "Heading: text" to add a titled clause' : "Added as extra points before the last point"}>
              <textarea rows={3} className={inp} value={form.extraTerms} onChange={set("extraTerms")} />
            </Field>
          </Section>

          <Section title="Letter & signatory">
            <Field label="Reference no." span2>
              <input className={inp} value={isAppt ? form.refAppointment : form.refOffer} onChange={set(isAppt ? "refAppointment" : "refOffer")} />
            </Field>
            <Field label="Letter date"><input type="date" className={inp} value={form.letterDate} onChange={set("letterDate")} /></Field>
            <div />
            <Field label="Signatory"><input className={inp} value={form.signatoryName} onChange={set("signatoryName")} /></Field>
            <Field label="Department"><input className={inp} value={form.signatoryDept} onChange={set("signatoryDept")} /></Field>
            {(org?.signUrl || org?.stampUrl) && (
              <label className="col-span-2 flex items-center gap-1.5 text-[12px] text-slate-600">
                <input type="checkbox" checked={form.includeSign} onChange={set("includeSign")} /> Add company signature & stamp
              </label>
            )}
          </Section>
        </div>

        {/* ── Live preview ── */}
        <div className="xl:sticky xl:top-20 flex flex-col gap-2 min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Preview · {K.label}</p>
          <div className="xl:max-h-[calc(100vh-10rem)] overflow-y-auto rounded bg-slate-100 p-3">
            <Preview blocks={blocks} lh={lh} f={form} org={org} footerLabel={footerLabel} />
          </div>
          <p className="text-[11px] text-slate-400">Page breaks in the PDF are applied automatically.</p>
        </div>
      </div>
    </div>
  );
}
