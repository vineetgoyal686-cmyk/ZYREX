import React from "react";
import { User, Phone, MapPin, Building2, Globe, Mail, Landmark, FileText, CheckCircle, Truck, Percent, Wallet } from "lucide-react";

const normalizeRichTextHtml = (value) =>
  typeof value === "string"
    ? value.replace(/&nbsp;|&#160;|\u00A0/g, " ")
    : value;

const extractListItemsFromHtml = (html) => {
  const normalized = normalizeRichTextHtml(html);
  if (!normalized || typeof document === "undefined") return [];

  const container = document.createElement("div");
  container.innerHTML = normalized;
  const listRoot = container.querySelector("ol, ul");
  if (!listRoot) return [];

  return Array.from(listRoot.querySelectorAll(":scope > li"))
    .map((item) => item.innerHTML?.trim())
    .filter(Boolean);
};

const extractBlocksFromHtml = (html) => {
  const normalized = normalizeRichTextHtml(html);
  if (!normalized || typeof document === "undefined") return [normalized];

  const container = document.createElement("div");
  container.innerHTML = normalized;
  const raw = [];
  container.childNodes.forEach((node) => {
    const h = node.outerHTML || (node.textContent?.trim() ? `<span>${node.textContent}</span>` : "");
    if (h && h.trim()) raw.push(h.trim());
  });
  if (!raw.length) return [normalized];

  // Group a short heading-only block with the block that follows it
  const isHeadingBlock = (h) => {
    const text = h.replace(/<[^>]+>/g, "").trim();
    return text.length < 40 && /<strong>/i.test(h);
  };

  const grouped = [];
  let i = 0;
  while (i < raw.length) {
    if (isHeadingBlock(raw[i]) && i + 1 < raw.length) {
      grouped.push(raw[i] + raw[i + 1]);
      i += 2;
    } else {
      grouped.push(raw[i]);
      i += 1;
    }
  }
  return grouped;
};

/* ── INR to Words Helper ── */
const amountToWords = (amount) => {
  if (!amount || isNaN(amount) || amount === 0) return "Zero Rupees Only";
  const a = ["", "One ", "Two ", "Three ", "Four ", "Five ", "Six ", "Seven ", "Eight ", "Nine ", "Ten ", "Eleven ", "Twelve ", "Thirteen ", "Fourteen ", "Fifteen ", "Sixteen ", "Seventeen ", "Eighteen ", "Nineteen "];
  const b = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
  const numToWords = (n) => {
    let numStr = n.toString();
    if (numStr.length > 9) return "Overflow";
    const nArray = ("000000000" + numStr).substr(-9).match(/^(\d{2})(\d{2})(\d{2})(\d{1})(\d{2})$/);
    if (!nArray) return "";
    let str = "";
    str += nArray[1] != 0 ? (a[Number(nArray[1])] || b[nArray[1][0]] + " " + a[nArray[1][1]]) + "Crore " : "";
    str += nArray[2] != 0 ? (a[Number(nArray[2])] || b[nArray[2][0]] + " " + a[nArray[2][1]]) + "Lakh " : "";
    str += nArray[3] != 0 ? (a[Number(nArray[3])] || b[nArray[3][0]] + " " + a[nArray[3][1]]) + "Thousand " : "";
    str += nArray[4] != 0 ? (a[Number(nArray[4])] || b[nArray[4][0]] + " " + a[nArray[4][1]]) + "Hundred " : "";
    str += nArray[5] != 0 ? ((str != "") ? "and " : "") + (a[Number(nArray[5])] || b[nArray[5][0]] + " " + a[nArray[5][1]]) : "";
    return str.trim();
  };
  const parts = Number(amount).toFixed(2).split(".");
  const rs = parseInt(parts[0], 10);
  const ps = parseInt(parts[1], 10);
  let res = numToWords(rs) + " Rupees";
  if (ps > 0) res += " and " + numToWords(ps) + " Paise";
  return res + " Only";
};

const getAdaptiveFontSize = (value, { base = 13, min = 10, step = 0.5, charsPerStep = 8 } = {}) => {
  const text = String(value || "").trim();
  if (!text) return base;
  const extraChars = Math.max(0, text.length - charsPerStep);
  const reduction = Math.ceil(extraChars / charsPerStep) * step;
  return Math.max(min, Number((base - reduction).toFixed(2)));
};

const getAdaptiveTextStyle = (
  value,
  {
    base = 13,
    min = 10,
    step = 0.5,
    charsPerStep = 8,
    lineHeight = 1.25,
    nowrap = false,
    textTransform,
    letterSpacing,
    fontWeight,
    color,
    marginBottom,
  } = {}
) => ({
  fontSize: `${getAdaptiveFontSize(value, { base, min, step, charsPerStep })}px`,
  lineHeight,
  whiteSpace: nowrap ? "nowrap" : "normal",
  overflowWrap: "anywhere",
  wordBreak: "break-word",
  textTransform,
  letterSpacing,
  fontWeight,
  color,
  marginBottom,
});

const OrderPDFTemplate = ({ order, items = [], comp = {}, vend = {}, site = {}, contacts = [] }) => {
  if (!order) return null;

  const formatSignatureDate = (value) => {
    if (!value) return "--";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "--";

    const parts = new Intl.DateTimeFormat("en-IN", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).formatToParts(date);

    const day = parts.find((part) => part.type === "day")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const year = parts.find((part) => part.type === "year")?.value;

    return [day, month, year].filter(Boolean).join(" - ");
  };

  const formatSubjectText = (value) => {
    if (!value) return "--";
    return String(value).trim();
  };

  const totals = order.totals || {};
  const isSupply = order.order_type === "Supply";
  const FALLBACK = "--";
  const companyDisplayName = comp.companyName || comp.company_name || "Company";
  const vendorDisplayName = vend.vendorName || vend.vendor_name || "Vendor";
  const companySignatoryName = comp.personName || comp.person_name || order.made_by || FALLBACK;
  const vendorSignatoryName = vend.contactPerson || vend.contact_person || vendorDisplayName || FALLBACK;
  const companyDesignation = comp.designation || "Procurement";
  const poDate = formatSignatureDate(order.date_of_creation || order.created_at);

  const fright = Number(totals.frightCharges ?? totals.fright) || 0;
  const frightTax = Number(totals.frightTax ?? 18);
  const subtotal = Number(totals.subtotal) || 0;
  const totalGst = Number(totals.gst) || 0;
  const discAmt = Number(totals.totalDiscountAmt) || 0;
  const discountPct = Number(totals.txDiscountPct || totals.discount_pct) || 0;
  const netItems = subtotal - discAmt;
  const grandTotal = Number(totals.grandTotal) || (netItems + fright + totalGst);

  const groupedItems = React.useMemo(() => {
    const raw = items || [];
    const results = [];
    let currentHead = null;

    for (let i = 0; i < raw.length; i++) {
      const it = raw[i];
      const itemName = it.material_name || it.item_name || it.items?.material_name || it.item?.material_name || "N/A";
      const unit = it.unit || "";

      if (currentHead && currentHead._itemName === itemName && currentHead.unit === unit) {
        results.push({ ...it, _itemName: itemName, _isSubRow: true });
        currentHead._rowSpan++;
      } else {
        const newItem = {
          ...it,
          _itemName: itemName,
          _isSubRow: false,
          _rowSpan: 1,
          _groupSrNo: results.filter(r => !r._isSubRow).length + 1
        };
        results.push(newItem);
        currentHead = newItem;
      }
    }
    return results;
  }, [items]);

  const stripHtml = (value = "") =>
    String(normalizeRichTextHtml(value))
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/(p|div|li|ul|ol)>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&amp;/gi, "&")
      .replace(/\s+/g, " ")
      .trim();

  // --- Line-based pagination constants ---
  // At 11px proportional font in ~780px content area, ~140 chars fit per line.
  // A flow page content area holds ~38 such units; signature block takes ~12 units.
  const CHARS_PER_LINE = 140;
  const LINES_PER_PAGE_FLOW = 32;
  const LINES_PER_PAGE_FIRST = 4;   // conservative — items table + details already fill most of page 1
  const SIGNATURE_LINES = 6;        // stamp + signature text + name + date rows

  // Count how many visual lines a plain-text string will take
  const countTextLines = (text) => {
    if (!text || !text.trim()) return 0;
    return Math.max(1, Math.ceil(text.trim().length / CHARS_PER_LINE));
  };

  // Estimate lines for a list of HTML entries (title + items)
const estimateListUnits = (entries = [], titleLines = 1) =>
    titleLines + entries.reduce((sum, entry) => sum + Math.max(1, countTextLines(stripHtml(entry))), 0);

  // Estimate lines for a single HTML blob (title + content + structural breaks)
  const estimateHtmlUnits = (html, titleLines = 1) => {
    const text = stripHtml(html);
    if (!text) return 0;
    const structuralBreaks = (String(html).match(/<(li|p|div|br|ol|ul)\b/gi) || []).length;
    return titleLines + countTextLines(text) + Math.ceil(structuralBreaks / 4);
  };

  const noteListItems = extractListItemsFromHtml(order.notes);

  const supplementarySections = [
    order.notes
      ? noteListItems.length
        ? { id: "notes", title: "Order Notes", kind: "list", items: noteListItems, units: estimateListUnits(noteListItems, 1) }
        : { id: "notes", title: "Order Notes", kind: "html", content: normalizeRichTextHtml(order.notes), units: estimateHtmlUnits(order.notes, 1) }
      : null,
    order.terms_conditions?.length
      ? (() => {
        const raw = order.terms_conditions;
        if (raw.length === 1) {
          const liItems = extractListItemsFromHtml(raw[0]);
          if (liItems.length) return { id: "terms", title: "Terms & Conditions", kind: "list", items: liItems, units: estimateListUnits(liItems, 1) };
          const blocks = extractBlocksFromHtml(raw[0]);
          return { id: "terms", title: "Terms & Conditions", kind: "blocks", items: blocks, units: estimateListUnits(blocks, 1) };
        }
        const items = raw.map(normalizeRichTextHtml);
        return { id: "terms", title: "Terms & Conditions", kind: "list", items, units: estimateListUnits(items, 1) };
      })()
      : null,
    order.payment_terms?.length
      ? (() => {
        const raw = order.payment_terms;
        if (raw.length === 1) {
          const liItems = extractListItemsFromHtml(raw[0]);
          if (liItems.length) return { id: "payment", title: "Payment Terms", kind: "list", items: liItems, units: estimateListUnits(liItems, 1) };
          const blocks = extractBlocksFromHtml(raw[0]);
          return { id: "payment", title: "Payment Terms", kind: "blocks", items: blocks, units: estimateListUnits(blocks, 1) };
        }
        const items = raw.map(normalizeRichTextHtml);
        return { id: "payment", title: "Payment Terms", kind: "list", items, units: estimateListUnits(items, 1) };
      })()
      : null,
    order.governing_laws?.length
      ? { id: "laws", title: "Governing Laws", kind: "blocks", items: order.governing_laws.map(normalizeRichTextHtml), units: estimateListUnits(order.governing_laws, 1) }
      : null
  ].filter(Boolean);

  const paginateSections = (sections, budget) => {
    const pages = [];
    let currentPage = [];
    let usedUnits = 0;

    sections.forEach((section) => {
      const sectionUnits = Math.max(2, section.units || 2);
      if (currentPage.length > 0 && usedUnits + sectionUnits > budget) {
        pages.push(currentPage);
        currentPage = [];
        usedUnits = 0;
      }
      currentPage.push(section);
      usedUnits += sectionUnits;
    });

    if (currentPage.length > 0) pages.push(currentPage);
    return pages;
  };

  const getPageUnits = (sections = []) => sections.reduce((sum, section) => sum + (section.units || 0), 0);

  const paginateSupplementarySections = (sections, firstBudget, flowBudget) => {
    const pages = [];
    let currentPage = [];
    let currentBudget = firstBudget;
    let usedUnits = 0;

    const pushPage = () => {
      pages.push(currentPage);
      currentPage = [];
      currentBudget = flowBudget;
      usedUnits = 0;
    };

  sections.forEach((section) => {
      if (section.kind === "html") {
        const sectionUnits = Math.max(2, section.units || 2);
        if (currentPage.length > 0 && usedUnits + sectionUnits > currentBudget) {
          pushPage();
        }
        currentPage.push(section);
        usedUnits += sectionUnits;
        return;
      }

      const itemUnits = (section.items || []).map((entry) => Math.max(1, countTextLines(stripHtml(entry))));
      let itemIndex = 0;
      let isContinuation = false;

      while (itemIndex < (section.items || []).length) {
        const titleUnits = isContinuation ? 0 : 2;
        const minimumChunkUnits = titleUnits + itemUnits[itemIndex];

      if (currentPage.length > 0 && usedUnits + itemUnits[itemIndex] > currentBudget) {
          pushPage();
        }

        let chunkItems = [];
        let chunkUnits = isContinuation ? 0 : 2;

        while (itemIndex < section.items.length) {
          const nextItemUnits = itemUnits[itemIndex];
          const projectedUnits = usedUnits + chunkUnits + nextItemUnits;

          if (chunkItems.length > 0 && projectedUnits > currentBudget) break;

          chunkItems.push(section.items[itemIndex]);
          chunkUnits += nextItemUnits;
          itemIndex += 1;

          if (projectedUnits >= currentBudget) break;
        }

        if (chunkItems.length === 0) {
          chunkItems.push(section.items[itemIndex]);
          chunkUnits += itemUnits[itemIndex];
          itemIndex += 1;
        }

        currentPage.push({
          ...section,
          items: chunkItems,
          isContinuation,
          startIndex: itemIndex - chunkItems.length,
          units: chunkUnits,
        });
        usedUnits += chunkUnits;
        isContinuation = true;

        if (itemIndex < section.items.length) pushPage();
      }
    });

    if (currentPage.length > 0) pages.push(currentPage);
    return pages;
  };

  // Budgets are in "lines". Derived from layout constants — no magic numbers.
 const FIRST_PAGE_SECTION_BUDGET = LINES_PER_PAGE_FIRST;                          
const FLOW_PAGE_SECTION_BUDGET = LINES_PER_PAGE_FLOW - 2;                          
const FINAL_PAGE_SECTION_BUDGET = LINES_PER_PAGE_FLOW - SIGNATURE_LINES + 4;   
const CONTINUATION_PAGE_BUDGET = LINES_PER_PAGE_FLOW + 4;  // was -4, increased to pack more     // 36 (dynamic)

const pagedSupplementarySections = paginateSupplementarySections(
  supplementarySections,
  FIRST_PAGE_SECTION_BUDGET,
  CONTINUATION_PAGE_BUDGET
);
  const pageOneSections = pagedSupplementarySections[0] || [];
  const laterSections = pagedSupplementarySections.slice(1);
  const lastPagedSections = laterSections[laterSections.length - 1] || [];
  const lastPagedUnits = getPageUnits(lastPagedSections);
  const canMergeLastPageWithSignatures = lastPagedUnits > 0 && lastPagedUnits <= FINAL_PAGE_SECTION_BUDGET;
  const continuationPages = canMergeLastPageWithSignatures
    ? laterSections.slice(0, -1)
    : laterSections;
  const finalPageSections = canMergeLastPageWithSignatures ? lastPagedSections : [];

  // === ITEM ROW PAGINATION ===
  // Estimate how many "row-height units" each item row occupies
  const estimateItemRowUnits = (it) => {
    let units = 1;
    const desc = it.description;
    if (desc) {
      let points = [];
      try {
        points = typeof desc === 'string' && (desc.startsWith('[') || desc.startsWith('{'))
          ? JSON.parse(desc)
          : Array.isArray(desc) ? desc : [desc];
      } catch (e) { points = [desc]; }
      const descText = points.map(p => String(p).replace(/<[^>]*>/g, '')).join(' ');
      // Each description point is its own line in Supply spec column
      units += Math.max(0, points.length - 1); // extra lines for multi-point descs
      units += Math.max(0, Math.ceil(descText.length / 45) - 1); // wrap penalty (narrower col)
    }
    // Add lines for Model No and Brand — these render as extra rows in spec column
    if (it.model_number) units += 1;
    const bVal = it.make || '';
    if (bVal && bVal !== '[]' && bVal !== 'null') {
      try {
        const parsed = JSON.parse(bVal);
        if (!Array.isArray(parsed) || parsed.length === 1) units += 0.5;
      } catch { units += 0.5; }
    }
    return Math.max(1, units);
  };

  // ── A4 content area budget (in row-units, 1 unit ≈ 24px) ──────────────────────
  // Page 1 has lots of fixed content:
  //   header(60px) + metadata(50px) + details(180px) + subject(35px)
  //   + table-header(28px) + totals-block(115px) + footer-padding ≈ 540px fixed
  // Usable height: 297mm − 10mm(top) − 28mm(bottom padding) ≈ 979px
  // Rows available on page 1 (with totals): (979 − 540) / 24px ≈ 18 → use 13 (safe)
  //
  // Continuation pages fixed content:
  //   header(60px) + table-header(28px) ≈ 88px fixed → 891px for rows = ~37 units
  //   But the LAST item page also shows the totals block (≈115px = 5 units)
  //   So last-page budget = 37 − 5 = 32 → use 26 (safe with descriptions)
  //   Non-last continuation pages: use 32 (safe)

   // rows on the last item page (must leave room for totals block) ← reduced from 26
  // Build item groups: each group = parent row + all its _isSubRow children.
  // Groups are the atomic pagination unit — they must never be split across pages.
  const itemGroups = [];
  for (const row of groupedItems) {
    if (!row._isSubRow) {
      itemGroups.push([row]);
    } else {
      if (itemGroups.length === 0) itemGroups.push([]);
      itemGroups[itemGroups.length - 1].push(row);
    }
  }

  // Two-pass group-aware pagination:
  // Pass 1 – pack groups using PAGE1 / CONT budgets (with intra-group splitting).
  // Pass 2 – ensure the last page never exceeds LASTPAGE budget (reserves space for totals).
const ROW_HEIGHT_PX = 24;
const FOOTER_HEIGHT_PX = 95;
const TOTALS_BLOCK_PX = 150;

// Fixed content heights on each page type (in px)
// PAGE1 without totals: used when page 1 is NOT the last page
const PAGE1_NOTLAST_FIXED_PX =
  60  +  // header
  70  +  // metadata grid
  175 +  // vendor + company details
  35  +  // subject bar
  30  +  // table header row
  FOOTER_HEIGHT_PX + 20; // +20px safety buffer
// PAGE1 with totals: used when page 1 IS also the last page
const PAGE1_FIXED_PX = PAGE1_NOTLAST_FIXED_PX + TOTALS_BLOCK_PX;

const LAST_ITEM_FIXED_PX =
  60  +  // header
  30  +  // table header row
  TOTALS_BLOCK_PX +
  FOOTER_HEIGHT_PX + 20; // +20px safety buffer

const CONT_FIXED_PX =
  60  +  // header
  30  +  // table header row
  FOOTER_HEIGHT_PX + 15; // +15px safety buffer

const A4_CONTENT_PX = 979; // 297mm - 10mm top - 28mm bottom at 96dpi

const maxRowsPx = (fixedPx) => Math.max(A4_CONTENT_PX - fixedPx, ROW_HEIGHT_PX);

// Split a group across a page boundary.
// Returns { firstPart, secondPart } or null if no useful split exists.
const splitGroupAt = (group, remainingPx) => {
  let accPx = 0;
  let splitAt = 0;
  for (let i = 0; i < group.length; i++) {
    const rowPx = estimateItemRowUnits(group[i]) * ROW_HEIGHT_PX;
    if (accPx + rowPx > remainingPx) break;
    accPx += rowPx;
    splitAt = i + 1;
  }
  if (splitAt === 0 || splitAt >= group.length) return null;

  const firstPart = group.slice(0, splitAt).map((r, i) =>
    i === 0 ? { ...r, _rowSpan: splitAt } : r
  );
  const secondPart = group.slice(splitAt).map((r, i) =>
    i === 0
      ? { ...r, _isSubRow: false, _rowSpan: group.length - splitAt, _groupSrNo: group[0]._groupSrNo }
      : r
  );
  return { firstPart, secondPart };
};

const itemPages = (() => {
  const pages = [];
  let current = [];
  let usedPx = 0;
  let isFirstPage = true;

  const budgetPx = (isFirst, isLast) => {
    if (isFirst && isLast) return maxRowsPx(PAGE1_FIXED_PX);
    if (isFirst && !isLast) return maxRowsPx(PAGE1_NOTLAST_FIXED_PX);
    if (isLast)             return maxRowsPx(LAST_ITEM_FIXED_PX);
    return maxRowsPx(CONT_FIXED_PX);
  };

  let currentBudgetPx = budgetPx(true, false);

  for (const group of itemGroups) {
    const groupPx = group.reduce((s, r) => s + estimateItemRowUnits(r) * ROW_HEIGHT_PX, 0);

    if (current.length > 0 && usedPx + groupPx > currentBudgetPx) {
      const remainingPx = currentBudgetPx - usedPx;
      const split = splitGroupAt(group, remainingPx);

      if (split) {
        // Partial group fits — place first part on current page, rest on next
        current.push(...split.firstPart);
        pages.push(current);
        current = [...split.secondPart];
        usedPx = split.secondPart.reduce((s, r) => s + estimateItemRowUnits(r) * ROW_HEIGHT_PX, 0);
      } else {
        // Nothing fits or everything fits — start a fresh page for the whole group
        pages.push(current);
        current = [...group];
        usedPx = groupPx;
      }
      isFirstPage = false;
      currentBudgetPx = budgetPx(false, false);
    } else {
      current.push(...group);
      usedPx += groupPx;
    }
  }
  if (current.length > 0) pages.push(current);
  if (pages.length === 0) return [[]];

  // Trim the LAST page: re-check against LAST_ITEM budget (with split support)
  const lastBudgetPx = budgetPx(pages.length === 1, true);
  const lastPage = pages[pages.length - 1];

  const lastGroups = [];
  for (const row of lastPage) {
    if (!row._isSubRow) lastGroups.push([row]);
    else lastGroups[lastGroups.length - 1].push(row);
  }

  let lastUsedPx = 0;
  let trimAt = -1;
  for (let gi = 0; gi < lastGroups.length; gi++) {
    const gpx = lastGroups[gi].reduce((s, r) => s + estimateItemRowUnits(r) * ROW_HEIGHT_PX, 0);
    if (lastUsedPx + gpx > lastBudgetPx && gi > 0) { trimAt = gi; break; }
    lastUsedPx += gpx;
  }
  if (trimAt > 0) {
    const fittedRows = lastGroups.slice(0, trimAt).flat();
    const remainingLastPx = lastBudgetPx - lastUsedPx;
    const overflowGroup = lastGroups[trimAt];
    const split = overflowGroup ? splitGroupAt(overflowGroup, remainingLastPx) : null;

    if (split && split.firstPart.length > 0) {
      pages[pages.length - 1] = [...fittedRows, ...split.firstPart];
      pages.push([...split.secondPart, ...lastGroups.slice(trimAt + 1).flat()]);
    } else {
      pages[pages.length - 1] = fittedRows;
      pages.push(lastGroups.slice(trimAt).flat());
    }
  }

  return pages;
})();

  const hasItemOverflow = itemPages.length > 1;

  // ── Dynamic supplementary budget for the last item page ───────────────────────
  // When items overflow, we dynamically compute how much vertical space remains
  // on the last item page after rows + totals block, then use that as the budget
  // for supplementary sections (Order Notes, Terms, etc.) on that same page.
  //
  // Pixel math (at 96dpi, box-sizing:border-box):
  //   A4 usable height = 297mm − 10mm(top) − 28mm(bottom) ≈ 979px
  //   1 supplementary line-unit = 979px / LINES_PER_PAGE_FLOW ≈ 25.8px
  //   1 item row-unit           ≈ 24px
  //   Fixed overhead on last item page (header + table-header + totals): ≈ 203px → 8 line-units

  // More accurate overhead accounting:
// header(60px) + divider(2px) + metadata-grid(72px) + details-section(~180px) 
// + subject(35px) + table-header(28px) + totals-block(115px) + footer(60px) = ~552px
// At PX_PER_LINE ≈ 25.8px → ~21 line-units overhead for page 1
// For overflow pages: header(62px) + table-header(28px) + totals(115px) + footer(60px) = ~265px → ~10 line-units
const LAST_ITEM_OVERHEAD_LINES = hasItemOverflow ? 8 : 18;  // tighter, more accurate

const PX_PER_LINE = 979 / LINES_PER_PAGE_FLOW;
const ROW_PX = 24;

const lastItemPageRowUnits = (itemPages[itemPages.length - 1] || [])
  .reduce((s, r) => s + estimateItemRowUnits(r), 0);

// Add extra penalty lines based on how many optional columns are visible
// Each extra column shrinks content cells → descriptions wrap more → more row height
const showModel = totals.showModel === true || (totals.showModel !== false && groupedItems.some(it => it.model_number));
const showBrand = totals.showBrand === true || (totals.showBrand !== false && groupedItems.some(it => it.make || it.brand));
const showDiscount = totals.discount_mode === 'line';
const showRemarks = groupedItems.some(it => it.remarks) && totals.showRemarks !== false;
const extraColumnPenalty = (showDiscount ? 1 : 0) + (showRemarks ? 2 : 0);

const lastItemPageSupBudget = hasItemOverflow
  ? Math.max(2, Math.floor(
      LINES_PER_PAGE_FLOW - LAST_ITEM_OVERHEAD_LINES - extraColumnPenalty
      - (lastItemPageRowUnits * ROW_PX / PX_PER_LINE)
    ))
  : Math.max(2, FIRST_PAGE_SECTION_BUDGET - extraColumnPenalty);
  // For hasItemOverflow: put first supplementary chunk on the last item page.
  // For !hasItemOverflow: put ALL supplementary on continuation/final pages (not the items page)
  // so T&C + Payment Terms appear together instead of being split across pages.
const effectivePagedSup = hasItemOverflow
  ? paginateSupplementarySections(supplementarySections, lastItemPageSupBudget, CONTINUATION_PAGE_BUDGET)
  : paginateSupplementarySections(supplementarySections, CONTINUATION_PAGE_BUDGET, CONTINUATION_PAGE_BUDGET);

  const effectivePageOneSections = hasItemOverflow ? (effectivePagedSup[0] || []) : [];
  const effectiveLaterSections   = hasItemOverflow ? effectivePagedSup.slice(1) : effectivePagedSup;
  const effectiveLastPaged       = effectiveLaterSections[effectiveLaterSections.length - 1] || [];
  const effectiveLastPagedUnits  = getPageUnits(effectiveLastPaged);
  const effectiveCanMerge        = effectiveLastPagedUnits > 0 && effectiveLastPagedUnits <= FINAL_PAGE_SECTION_BUDGET;
  const effectiveContinuationPages   = effectiveCanMerge ? effectiveLaterSections.slice(0, -1) : effectiveLaterSections;
  const effectiveFinalPageSections   = effectiveCanMerge ? effectiveLastPaged : [];

  const totalPages = (itemPages.length - 1) + effectiveContinuationPages.length + 2;

  const renderSupplementarySection = (section, options = {}) => {
    if (!section) return null;
    const compact = options.compact === true;

    const sectionWrapperClass = "supplementary-section";
    const sectionTitleClass = "details-tab mb-3 shadow-sm";

    if (section.kind === "html") {
      return (
        <div key={section.id} className={sectionWrapperClass}>
          <div className={sectionTitleClass}>{section.title}</div>
          <div
            className={
              compact
                ? "supplementary-rich text-[#000000] px-1 leading-[1.45] font-medium whitespace-normal text-[11px] break-words text-justify [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0 [&_li]:text-justify [&_p]:text-justify"
                : "supplementary-rich text-[#000000] px-1 leading-[1.45] font-medium whitespace-normal text-[11px] break-words text-justify [&_ol]:list-decimal [&_ol]:pl-4 [&_ul]:list-disc [&_ul]:pl-4 [&_li]:my-0 [&_li]:text-justify [&_p]:text-justify"
            }
            dangerouslySetInnerHTML={{ __html: section.content }}
          />
        </div>
      );
    }

    if (section.kind === "list") {
      const startIndex = section.startIndex || 0;
      return (
        <div key={section.id} className={sectionWrapperClass}>
          {!section.isContinuation && <div className={sectionTitleClass}>{section.title}</div>}
          <ul className="space-y-1.5 text-[#000000] px-1 list-none">
            {section.items.map((entry, idx) => (
              <li
                key={`${section.id}-${idx}`}
                className={compact ? "flex items-start gap-3 pb-1 w-full" : "flex items-start gap-3 pb-1 w-full"}
                style={{ minWidth: 0 }}
              >
                <span className="text-[#000000] font-black shrink-0 text-[11px] leading-[1.45] text-right">{startIndex + idx + 1}.</span>
                <div
                  className="supplementary-rich"
                  style={{
                    minWidth: 0,
                    display: "block",
                    lineHeight: "1.45",
                    fontWeight: "500",
                    fontSize: "11px",
                    textAlign: "justify"
                  }}
                  dangerouslySetInnerHTML={{ __html: entry }}
                />
              </li>
            ))}
          </ul>
        </div>
      );
    }

    return (
      <div key={section.id} className={sectionWrapperClass}>
        {!section.isContinuation && <div className={sectionTitleClass}>{section.title}</div>}
        <div className="text-[#000000] px-1 w-full">
          {section.items.map((entry, idx) => (
            <div
              key={`${section.id}-${idx}`}
              className={idx === section.items.length - 1 ? "supplementary-rich" : "supplementary-rich mb-2"}
              style={{
                display: "block",
                lineHeight: "1.45",
                fontWeight: "500",
                fontSize: "11px",
                textAlign: "justify"
              }}
              dangerouslySetInnerHTML={{ __html: entry }}
            />
          ))}
        </div>
      </div>
    );
  };

  const renderFooter = (pageNumber) => (
     <>
    <div style={{ position: 'absolute', bottom: '60px', left: 0, right: 0, 
                  height: '4px', background: 'transparent' }} />
    
    <div className="doc-footer">
      <div style={{ position: "relative", minHeight: "26px" }}>
        <div style={{ fontSize: "10.5px", fontWeight: 700, color: "#000000", marginBottom: "1px" }}>
          {comp.companyName || comp.company_name}
        </div>
        <p
          className="pdf-fit-text"
          style={{
            fontSize: "9.5px",
            color: "#000000",
            fontWeight: 500,
            lineHeight: 1.25,
            margin: 0,
            padding: "0 44px",
          }}
        >
          {comp.address || "N/A"}
        </p>
        <div
          style={{
            position: "absolute",
            right: 0,
            top: 0,
            fontSize: "11.5px",
            fontWeight: 800,
            color: "#000000",
            whiteSpace: "nowrap",
          }}
        >
          {pageNumber}
        </div>
      </div>
    </div>
    </>
  );

  return (
    <div className="bg-transparent font-inter p-0 w-full max-w-[210mm] mx-auto relative antialiased" style={{ color: '#1e293b' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        
        .pdf-hex-bg-blue { background-color: #000000 !important; }
        .pdf-hex-text-blue { color: #000000 !important; }
        .pdf-hex-border-blue { border-color: #000000 !important; }

        @media print {
          body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; background: #ffffff !important; }
          .page-container {
             margin: 0 !important;
             box-shadow: none !important;
             padding: 10mm 12mm 30mm 12mm !important;
             width: 210mm !important;
             min-height: 297mm !important;
             position: relative !important;
             overflow: hidden !important;
             box-sizing: border-box !important;
             page-break-after: always !important;
          }
          .page-container:last-child {
             page-break-after: auto !important;
          }
          .doc-footer {
             position: absolute !important;
             bottom: 10mm !important;
             left: 12mm !important;
             right: 12mm !important;
             border-top: 1.5px solid #000000 !important;
             text-align: center !important;
             padding-top: 6px !important;
             background: #ffffff !important;
          }
          .no-print { display: none !important; }
        }

        @media screen {
          .page-container {
            background: #ffffff !important;
            width: 210mm;
            min-height: 297mm;
            max-height: 297mm;
             overflow: hidden !important;
            margin: 10px auto;
            padding: 10mm 12mm 28mm 12mm;
            box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1);
            position: relative;
            border: 1px solid #e2e8f0;
            overflow: hidden !important;
          }
          .doc-footer {
             position: absolute;
             bottom: 10mm;
             left: 12mm;
             right: 12mm;
             border-top: 1.5px solid #000000;
             text-align: center;
             padding-top: 6px;
          }
        }

        .slanted-header-box {
           clip-path: polygon(10% 0, 100% 0, 100% 100%, 0% 100%);
           background-color: #000000 !important;
           color: #ffffff !important;
           padding: 5px 22px 5px 32px;
           min-width: 165px;
           display: flex;
           align-items: center;
           justify-content: center;
        }
/* Row separators via td only — tr border-bottom cuts through rowspan cells in html2canvas */
table tbody td {
  border-bottom: 1px solid #000000 !important;
  border-right:  1px solid #000000 !important;
}

/* Rowspan cells: only group-separator border at span bottom, no internal lines */
table tbody td[rowspan] {
  border-bottom: 1px solid #000000 !important;
  border-right:  1px solid #000000 !important;
  position: relative;
}

/* Last column: outer div already provides right border — avoid double line */
table tbody td:last-child {
  border-right: none !important;
}
table thead th:last-child {
  border-right: none !important;
}

/* Rowspan cells: plain — no internal gradient lines */
table tbody td[rowspan] {
  border-bottom: 1px solid #000000 !important;
  background-image: none !important;
}
  /* Hard clip — nothing can ever bleed into footer zone */
.page-container {
  overflow: hidden !important;
}
  /* Hard clip: table body can never overflow into footer zone */
.page-container > .overflow-hidden {
  max-height: calc(100% - 95px);
}

/* Supplementary sections container — clip before footer */
.supplementary-wrapper {
  overflow: hidden;
  max-height: calc(100% - 60px); /* 60px = footer height */
}

        .details-tab {
           clip-path: polygon(0 0, 100% 0, 85% 100%, 0% 100%);
           background-color: #000000 !important;
           color: #ffffff !important;
           padding: 3px 20px 3px 8px;
           font-weight: 700;
           font-size: 9.5px;
           display: inline-block;
           width: fit-content;
           text-transform: uppercase;
           
           margin-bottom: 8px;
        }

        /* HEADING WITH LINE ON THE RIGHT */
        .item-category-header {
           display: flex;
           align-items: center;
           gap: 10px;
           color: #000000;
           font-weight: 800;
           font-size: 9px;
           text-transform: uppercase;
           margin: 2px 0 1px 0;
        }
        .item-category-header::after {
          content: "";
          flex-grow: 1;
          height: 1.5px;
          background-color: #000000;
        }

        .grid-detail-row {
           display: grid;
           grid-template-columns: 72px 1fr;
           gap: 4px;
           font-size: 9px;
           line-height: 1.25;
           margin-bottom: 2px;
        }
        .grid-detail-label {
           color: #000000;
           font-weight: 700;
           text-transform: uppercase;
           font-size: 8px;
        }
        .grid-detail-value {
          color: #000000;
          font-weight: 500;
          text-transform: none;
        }

        .detail-panel {
          display: flex;
          flex-direction: column;
          gap: 6px;
          width: 100%;
        }

        .section-card {
          width: 100%;
          border: none;
          background: transparent;
          padding: 5px 0px;
          box-sizing: border-box;
        }

        .section-card-title {
          color: #000000;
          font-size: 8.5px;
          font-weight: 800;
          text-transform: uppercase;
          
          margin-bottom: 8px;
          line-height: 1;
        }

        .section-card-text {
          color: #000000;
          font-size: 9px;
          font-weight: 500;
          line-height: 1.28;
          margin: 0;
        }

        .section-card-grid {
          display: grid;
          gap: 2px;
        }

        .contact-row-compact {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          padding: 3px 0;
          border-bottom: 1px solid #d7dfec;
        }

        .contact-row-compact:last-child {
          border-bottom: 0;
          padding-bottom: 0;
        }

        .supplementary-section {
          break-inside: avoid;
          page-break-inside: avoid;
        }

        .quill-content ul { list-style-type: disc !important; padding-left: 12px !important; margin: 4px 0 !important; }
        .quill-content ol { list-style-type: decimal !important; padding-left: 12px !important; margin: 4px 0 !important; }
        .quill-content ol ol, .supplementary-rich ol ol { list-style-type: lower-alpha !important; }
        .quill-content ol ol ol, .supplementary-rich ol ol ol { list-style-type: lower-roman !important; }
        .quill-content .sp-decimal li::before {
          content: none;
        }
        .quill-content p { margin-bottom: 2px !important; }
        .quill-content strong { font-weight: 700 !important; }
        .quill-content em { font-style: italic !important; }
        .quill-content li { display: list-item !important; }
        .quill-content li::marker { font-size: 8px; }

        .ql-align-center { text-align: center !important; }
        .ql-align-right { text-align: right !important; }
        .ql-align-justify { text-align: justify !important; }
        .quill-content { text-align: justify !important; }
        .quill-content p, .quill-content div { text-align: justify; }


        .supplementary-rich,
        .supplementary-rich * {
          max-width: 100%;
          white-space: normal !important;
          word-break: normal !important;
          overflow-wrap: break-word !important;
          word-wrap: break-word !important;
          hyphens: none !important;
          box-sizing: border-box;
          text-align: justify !important;
        }

        .supplementary-rich p,
        .supplementary-rich div,
        .supplementary-rich span,
        .supplementary-rich li {
          display: block;
          text-align: justify !important;
        }
        .supplementary-rich ol li,
        .supplementary-rich ul li {
          display: list-item;
        }

        .pdf-fit-text {
          min-width: 0;
          max-width: 100%;
          white-space: normal;
          overflow-wrap: anywhere;
          word-break: break-word;
        }

        .pdf-fit-nowrap {
          min-width: 0;
          max-width: 100%;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
      `}</style>

      {/* REUSABLE HEADER COMPONENT */}
      {(() => {
        // ── Shared colgroup for both page-1 and overflow item tables ──────────────
        // table-fixed + <colgroup> guarantees identical column widths on every page.
       const renderItemColGroup = () => {
  const showModel = totals.showModel === true || (totals.showModel !== false && groupedItems.some(it => it.model_number));
  const showBrand = totals.showBrand === true || (totals.showBrand !== false && groupedItems.some(it => it.make || it.brand));
  const showDiscount = totals.discount_mode === 'line';
  const showRemarks = groupedItems.some(it => it.remarks) && totals.showRemarks !== false;

  // All fixed-width columns added up precisely:
  // Sr(32) + Unit(44) + Qty(52) + Rate(75) + GST(44) + Amount(82) = 329px base
  // Optional: Disc(44) + Remarks(90) — Model/Brand now embedded in spec column
  const fixedPx = 329
    + (showDiscount ? 44 : 0)
    + (showRemarks ? 90 : 0);

  // A4 content width = 794px page - 45px left padding - 45px right padding = 704px
  // Subtract 2px for left+right table borders
  const totalPx = 702;
  const remainingPx = Math.max(totalPx - fixedPx, 100);

  // For Supply: Item Name gets 32%, Specification gets 68%
  const itemNamePx = Math.round(remainingPx * 0.39);
  const specPx = remainingPx - itemNamePx;

  return (
    <colgroup>
      <col style={{ width: '32px' }} />
      {isSupply ? (
        <>
          <col style={{ width: `${itemNamePx}px` }} />
          <col style={{ width: `${specPx}px` }} />
        </>
      ) : (
        <col style={{ width: `${remainingPx}px` }} />
      )}
      <col style={{ width: '44px' }} />  {/* Unit */}
      <col style={{ width: '52px' }} />  {/* Qty */}
      <col style={{ width: '60px' }} />  {/* Rate */}
      {showDiscount && <col style={{ width: '44px' }} />}
      <col style={{ width: '44px' }} />  {/* GST% */}
      <col style={{ width: '82px' }} />  {/* Amount */}
      {showRemarks && <col style={{ width: '90px' }} />}
    </colgroup>
  );
};

        const renderHeader = () => (
          <>
            <div className="flex justify-between items-center mb-1">
              <div style={{ flexShrink: 0, minWidth: '210px', height: '56px', display: 'flex', alignItems: 'flex-start', overflow: 'visible', paddingLeft: '12px' }}>
                {(comp.logoUrl || comp.logo_url) && (() => {
                  const isSquareLogo = (companyDisplayName || '').toLowerCase().includes('univastu');
                  return isSquareLogo ? (
                    <img
                      src={comp.logoUrl || comp.logo_url}
                      crossOrigin="anonymous"
                      alt="Logo"
                      style={{ height: '65px', width: 'auto', maxWidth: '120px', objectFit: 'contain', objectPosition: 'left top', marginTop: '-18px' }}
                    />
                  ) : (
                    <img
                      src={comp.logoUrl || comp.logo_url}
                      crossOrigin="anonymous"
                      alt="Logo"
                      style={{ height: '85px', width: 'auto', maxWidth: '160px', objectFit: 'contain', objectPosition: 'left top', marginTop: '-29px' }}
                    />
                  );
                })()}
              </div>
              <div className="slanted-header-box">
                <h2 className="text-[15px] font-black uppercase  leading-none m-0" style={{ color: '#ffffff' }}>{isSupply ? 'PURCHASE ORDER' : 'WORK ORDER'}</h2>
              </div>
            </div>
            <div className="w-full h-0.5 bg-[#000000] mb-3"></div>
          </>
        );

        return (
          <>
            {/* PAGE 1 */}
            <div className="page-container" style={{ backgroundColor: '#ffffff' }}>
              {renderHeader()}

              {/* PO METADATA GRID */}
              <div className="flex flex-wrap w-full border border-[#000000] mb-0 overflow-hidden bg-white">
                {[
                  { label: isSupply ? "PO No. :" : "WO No. :", val: order.order_number },
                  { label: isSupply ? "PO Date :" : "WO Date :", val: order.date_of_creation ? new Date(order.date_of_creation).toLocaleDateString("en-IN", { day: '2-digit', month: 'short', year: 'numeric' }) : "--" },
                  { label: "Ref.No. :", val: order.ref_number },
                  { label: "Created By :", val: order.creator_name || order.made_by },
                  { label: "Project :", val: site.siteName || site.site_name || order.project_name },
                  { label: "Requisition By :", val: order.request_by || order.requested_by }
                ].map((item, i) => (
                  <div key={i} className={`flex w-[50%] box-border min-h-[24px] items-center gap-2 px-[6px] py-[2px] ${i % 2 === 0 ? 'border-r border-[#000000]' : ''} ${i < 4 ? 'border-b border-[#000000]' : ''}`}>
                    <span className="min-w-[82px] whitespace-nowrap text-[9.5px] font-black text-[#000000]  uppercase leading-none">{item.label}</span>
                    <span className="flex-1 text-[10.5px] font-bold text-[#000000] leading-snug pdf-fit-text">{item.val || "--"}</span>
                  </div>
                ))}
              </div>

              {/* DETAILS SECTION (ITEMS-STRETCH) */}
              <div className="flex w-full mb-0 items-stretch overflow-hidden border border-t-0 border-[#000000] bg-white">
                {/* Vendor Details */}
                <div className="flex w-1/2 h-full flex-col items-start border-r border-[#000000] px-3 py-2 box-border">
                  <div className="details-tab self-start">Vendor Details</div>
                  <h4
                    className="font-bold text-[#0f172a] mb-1.5  pdf-fit-text"
                    style={getAdaptiveTextStyle(vend.vendorName || vend.vendor_name || "N/A", { base: 11, min: 9.5, step: 0.4, charsPerStep: 14, lineHeight: 1.2 })}
                  >
                    {vend.vendorName || vend.vendor_name || "N/A"}
                  </h4>

                  <div className="detail-panel">
                    <div className="section-card">
                      <div className="section-card-title">Address</div>
                      <p className="section-card-text pdf-fit-text">{vend.address || "N/A"}</p>
                    </div>

                    <div className="section-card">
                      <div className="section-card-title">Bank Details</div>
                      <div className="section-card-grid">
                        <div className="grid-detail-row">
                          <span className="grid-detail-label">Bank Name:</span>
                          <span className="grid-detail-value pdf-fit-text">{vend.bankName || vend.bank_name || "N/A"}</span>
                        </div>
                        <div className="grid-detail-row">
                          <span className="grid-detail-label">Acc No.:</span>
                          <span className="grid-detail-value pdf-fit-text">{vend.accountNo || vend.account_number || "N/A"}</span>
                        </div>
                        <div className="grid-detail-row">
                          <span className="grid-detail-label">IFSC Code:</span>
                          <span className="grid-detail-value pdf-fit-text">{vend.ifsc || vend.ifsc_code || "N/A"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="section-card">
                      <div className="section-card-title">Tax / GST Details</div>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <div className="grid-detail-row" style={{ gridTemplateColumns: '55px 1fr' }}>
                          <span className="grid-detail-label">GST No:</span>
                          <span className="grid-detail-value whitespace-nowrap">{vend.gstin || "N/A"}</span>
                        </div>
                        <div className="grid-detail-row" style={{ gridTemplateColumns: '55px 1fr' }}>
                          <span className="grid-detail-label">Pan No:</span>
                          <span className="grid-detail-value pdf-fit-text">{vend.pan || "N/A"}</span>
                        </div>
                        <div className="grid-detail-row" style={{ gridTemplateColumns: '55px 1fr' }}>
                          <span className="grid-detail-label">MSME No:</span>
                          <span className="grid-detail-value pdf-fit-text">{vend.msme_number || vend.msme || vend.msme_no || "N/A"}</span>
                        </div>
                        <div className="grid-detail-row" style={{ gridTemplateColumns: '55px 1fr' }}>
                          <span className="grid-detail-label">Aadhar No:</span>
                          <span className="grid-detail-value pdf-fit-text">{vend.aadhar || vend.aadhar_no || "N/A"}</span>
                        </div>
                      </div>
                    </div>

                    <div className="section-card mt-auto">
                      <div className="section-card-title">Contact Details</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '9px', lineHeight: '1.25' }}>
                        {/* Row 1: Person Name (left) + Phone No (right) */}
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0px' }}>
                            <span className="grid-detail-label" style={{ minWidth: '68px', fontSize: '8px' }}>Person Name:</span>
                            <span className="grid-detail-value" style={{ whiteSpace: 'nowrap', overflow: 'visible', fontSize: '9px' }}>{vend.contactPerson || vend.contact_person || "N/A"}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0px' }}>
                            <span className="grid-detail-label" style={{ minWidth: '52px', fontSize: '8px' }}>Phone No:</span>
                            <span className="grid-detail-value" style={{ whiteSpace: 'nowrap', fontSize: '9px' }}>{vend.mobile || vend.phone || "N/A"}</span>
                          </div>
                        </div>
                        {/* Row 2: Email ID */}
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0px' }}>
                          <span className="grid-detail-label" style={{ minWidth: '68px', fontSize: '8px' }}>Email ID:</span>
                          <span className="grid-detail-value" style={{ fontSize: '8.5px', textTransform: 'none' }}>{vend.email || "N/A"}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Company Details */}
                <div className="flex w-1/2 h-full flex-col items-start px-3 py-2 box-border">
                  <div className="details-tab self-start">Company Details</div>
                  <h4
                    className="font-bold text-[#0f172a] mb-1.5  pdf-fit-text"
                    style={getAdaptiveTextStyle(comp.companyName || comp.company_name || "N/A", { base: 11, min: 9.5, step: 0.4, charsPerStep: 14, lineHeight: 1.2 })}
                  >
                    {comp.companyName || comp.company_name || "N/A"}
                  </h4>

                  <div className="detail-panel">
                    <div className="section-card">
                      <div className="section-card-title">Site Address</div>
                      <p className="section-card-text pdf-fit-text">{site.siteAddress || site.site_address || "N/A"}</p>
                    </div>

                    <div className="section-card">
                      <div className="section-card-title">Billing Address</div>
                      <p className="section-card-text whitespace-pre-wrap pdf-fit-text">{site.billingAddress || site.billing_address || "N/A"}</p>
                    </div>

                    <div className="section-card">
                      <div className="section-card-title">Tax / GST Details</div>
                      <div className="grid-detail-row" style={{ gridTemplateColumns: '55px 1fr' }}>
                        <span className="grid-detail-label">GST No:</span>
                        <span className="grid-detail-value pdf-fit-text">{comp.gstin || comp.gst_no || "N/A"}</span>
                      </div>
                    </div>

                    <div className="section-card">
                      <div className="section-card-title">Contact Persons</div>
                      {contacts.length > 0 ? contacts.map((c, i) => (
                        <div key={i} className="contact-row-compact">
                          <span className="min-w-0 flex-1 text-[10px] font-medium text-[#000000] leading-snug pdf-fit-text">
                            {c.personName || c.person_name || "N/A"}
                          </span>
                          <div className="flex shrink-0 items-center gap-1.5 text-[#000000]">
                            <Phone className="h-2.5 w-2.5 text-[#000000]" />
                            <span className="text-[9px] font-medium leading-snug pdf-fit-text text-[#000000]">
                              {c.contactNumber || c.contact_number || "N/A"}
                            </span>
                          </div>
                        </div>
                      )) : <p className="text-[9px] italic text-slate-400">--- NA ---</p>}
                    </div>
                  </div>
                </div>
              </div>

              {/* SUBJECT */}
              <div className="border border-t-0 border-[#000000] bg-[#d4d4d8] px-4 py-1.5 mb-3 flex justify-center items-center gap-3">
                <span className="text-[11px] font-bold text-[#18181b] uppercase  leading-none shrink-0">Subject :</span>
                <span
                  className="font-bold  text-[#000000] text-center pdf-fit-text"
                  style={getAdaptiveTextStyle(formatSubjectText(order.subject || order.order_name), { base: 11, min: 9.5, step: 0.4, charsPerStep: 20, lineHeight: 1.25 })}
                >
                  {formatSubjectText(order.subject || order.order_name)}
                </span>
              </div>

              <div className="overflow-hidden border border-[#000000] mb-4 bg-white"  style={{ maxHeight: `${A4_CONTENT_PX - PAGE1_FIXED_PX + TOTALS_BLOCK_PX + FOOTER_HEIGHT_PX}px`, overflow: 'hidden' }}>

                <table className="w-full text-left table-fixed" style={{ borderCollapse: 'collapse' }}>
                  {renderItemColGroup()}
                  <thead className="bg-[#d4d4d8] border-b border-[#000000]">
                    <tr className="text-[#000000] text-[10px] font-black uppercase  leading-none">
                      <th className="border-r border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Sr.</th>
                      {isSupply ? (
                        <>
                          <th className="border-r border-[#000000] px-3 py-1.5 text-center" style={{ width: 'auto' }}>Item Name</th>
                          <th className="border-r border-[#000000] px-3 py-1.5 text-center" style={{ width: 'auto' }}>Specification</th>
                        </>
                      ) : (
                        <th className="border-r border-[#000000] px-3 py-1.5 text-center" style={{ width: 'auto' }}>Item Name & Description</th>
                      )}
                      <th className="border-r border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Unit</th>
                      <th className="border-r border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Qty</th>
                      <th className="border-r border-[#000000] px-3 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Rate</th>
                      {totals.discount_mode === 'line' && (
                        <th className="border-r border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Disc%</th>
                      )}
                      <th className="border-r border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>GST%</th>
                      <th className="px-4 py-1.5 text-center whitespace-nowrap bg-[#000000]/5" style={{ width: '1%' }}>Amount</th>
                      {groupedItems.some(it => it.remarks) && totals.showRemarks !== false && (
                        <th className="border-l border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Remarks</th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="text-[10px]" style={{ borderCollapse: 'collapse' }}>
                    {itemPages[0].map((it, idx) => (
                      <tr key={idx} className="bg-white">
                        {/* Sr No */}
                       {!it._isSubRow && (
  <td
    rowSpan={it._rowSpan}
    className="px-2 border-r border-[#000000] text-center text-[#000000] font-normal bg-[#fcfcfc] align-top text-[10px] whitespace-nowrap"
    style={{
      padding: '6px 4px',
      verticalAlign: 'top',
      borderRight: '1px solid #000000',
      borderBottom: '1px solid #000000',
    }}
  >
    {it._groupSrNo < 10 ? `0${it._groupSrNo}` : it._groupSrNo}
  </td>
)}

                        {isSupply ? (
                          /* Supply PO: separate Item Name (rowspan) + Specification columns */
                          <>
                            {!it._isSubRow && (
  <td
    rowSpan={it._rowSpan}
    className="px-3 border-r border-[#000000] font-bold uppercase text-[#000000] leading-tight text-[10px] align-top"
    style={{
      padding: '6px 8px',
      verticalAlign: 'top',
      borderRight: '1px solid #000000',
      borderBottom: '1px solid #000000',
      backgroundImage: it._rowSpan > 1
        ? `repeating-linear-gradient(to bottom, #fafafa, #fafafa calc(${100 / it._rowSpan}% - 0.5px), #000000 calc(${100 / it._rowSpan}% - 0.5px), #000000 calc(${100 / it._rowSpan}%))`
        : undefined,
      backgroundSize: '100% 100%',
    }}
  >
    {it._itemName}
  </td>
)}
                            <td className="px-3 py-1.5 border-r border-[#000000] text-[10px] text-[#000000] font-normal leading-snug" style={{ minWidth: '200px' }}>
                              <div className="space-y-0.5">
                                {(() => {
                                  const desc = it.description;
                                  if (!desc) return "--";
                                  let points = [];
                                  try { points = typeof desc === 'string' && (desc.startsWith('[') || desc.startsWith('{')) ? JSON.parse(desc) : (Array.isArray(desc) ? desc : [desc]); } catch (e) { points = [desc]; }
                                  return points.map((p, i) => (
                                    <div key={i} className="mb-0.5 last:mb-0">
                                      <span className="font-medium">{p.replace(/<[^>]*>/g, '')}</span>
                                    </div>
                                  ));
                                })()}
                                {showModel && it.model_number && (
                                  <div className="text-[9.5px] mt-0.5"><span className="font-bold text-[#000000]">Model No.:</span> <span className="font-normal">{it.model_number}</span></div>
                                )}
                                {showBrand && (() => { const bVal = it.make || ""; if (!bVal || bVal === "[]" || bVal === "null") return null; let b = bVal; try { const p = JSON.parse(bVal); if (Array.isArray(p)) { if (p.length !== 1) return null; b = p[0]; } else b = p; } catch {} return b ? <div className="text-[9.5px]"><span className="font-bold text-[#000000]">Brand:</span> <span className="font-normal">{b}</span></div> : null; })()}
                              </div>
                            </td>
                          </>
                        ) : (
                          /* SITC/ITC WO: combined Item Name + Description in one column */
                          <td className="px-3 py-2 border-r border-[#000000] text-[10px] text-[#000000] font-normal leading-snug align-top" style={{ minWidth: '280px' }}>
                            {!it._isSubRow && (
                              <div className="font-black uppercase text-[10px] leading-tight mb-1.5 text-[#000000] tracking-wide">
                                {it._itemName}
                              </div>
                            )}
                            <div className="space-y-0.5">
                              {(() => {
                                const desc = it.description;
                                if (!desc) return null;
                                let points = [];
                                try { points = typeof desc === 'string' && (desc.startsWith('[') || desc.startsWith('{')) ? JSON.parse(desc) : (Array.isArray(desc) ? desc : [desc]); } catch (e) { points = [desc]; }
                                return points.map((p, i) => (
                                  <div key={i} className="pdf-fit-text quill-content" dangerouslySetInnerHTML={{ __html: p }} />
                                ));
                              })()}
                              {it.model_number && (
                                <div className="text-[9.5px] mt-0.5"><span className="font-bold text-[#000000]">Model No.:</span> <span className="font-normal">{it.model_number}</span></div>
                              )}
                              {(() => { const bVal = it.make || ""; if (!bVal || bVal === "[]" || bVal === "null") return null; let b = bVal; try { const p = JSON.parse(bVal); if (Array.isArray(p)) { if (p.length !== 1) return null; b = p[0]; } else b = p; } catch {} return b ? <div className="text-[9.5px]"><span className="font-bold text-[#000000]">Brand:</span> <span className="font-normal">{b}</span></div> : null; })()}
                            </div>
                          </td>
                        )}
                        <td className="px-3 py-1.5 border-r border-[#000000] text-center text-[#000000] font-normal text-[10px] whitespace-nowrap">{it.unit || "NOS"}</td>
                        <td className="px-3 py-1.5 border-r border-[#000000] text-center font-normal text-[#000000] text-[10px] whitespace-nowrap">{it.qty}</td>
                        <td className="px-3 py-1.5 border-r border-[#000000] text-right font-normal text-[#000000] text-[10px] whitespace-nowrap">₹ {Number(it.unit_rate).toLocaleString("en-IN")}</td>

                        {/* Discount mapping - Only if Line Mode */}
                        {totals.discount_mode === 'line' && (
                          <td className="px-3 py-1.5 border-r border-[#000000] text-center font-normal text-rose-600 text-[10px]">{Number(it.discount_pct)}%</td>
                        )}

                        <td className="px-3 py-1.5 border-r border-[#000000] text-center font-normal text-[#000000] text-[10px] whitespace-nowrap">{it.tax_pct}%</td>
                        <td className="px-4 py-1.5 text-right font-bold text-[#000000] text-[10px] bg-slate-50 whitespace-nowrap">₹ {Number(it.amount).toLocaleString("en-IN")}</td>
                        {groupedItems.some(it2 => it2.remarks) && totals.showRemarks !== false && (
                          <td className="px-3 py-1.5 border-l border-[#000000] text-left text-[#000000] font-normal text-[10px] whitespace-normal leading-tight">
                            <span className="pdf-fit-text">{it.remarks || "--"}</span>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>

                {!hasItemOverflow && (
                <div className="border-t border-[#000000] bg-white px-3 pt-1.5 pb-2">
                  <div className="flex items-end justify-between gap-4">
                    <div className="w-[360px] max-w-[calc(100%-232px)]">
                      <div className="overflow-hidden bg-[#e4e4e7]">
                        <div className="flex items-start gap-3 px-2 py-3 text-[#000000]">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[#000000]">
                            <FileText size={12} strokeWidth={2.2} />
                          </span>
                          <div className="min-w-0">
                            <div className="mb-1 text-[7.5px] font-bold uppercase  text-[#000000]">
                              Amount In Words
                            </div>
                            <div className="text-[10px] font-bold text-[#000000] leading-snug">
                              {amountToWords(grandTotal)}
                            </div>
                          </div>
                        </div>
                        <div className="h-[3px] bg-[#000000]" />
                      </div>
                    </div>

                    <div className="w-[220px] shrink-0">
                      <div className="flex items-center justify-between gap-5 px-3 py-1 bg-white border-b border-[#e2e8f0]">
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="flex h-4 w-4 items-center justify-center text-[#000000]">
                            <FileText size={8.5} strokeWidth={2.2} />
                          </span>
                          <span className="text-[9.5px] font-bold text-[#000000] uppercase">Subtotal</span>
                        </span>
                        <span className="ml-3 shrink-0 text-[11px] font-bold text-[#000000]">{"\u20B9"} {subtotal.toLocaleString("en-IN")}</span>
                      </div>
                      {discAmt > 0 && (
                        <div className="flex items-center justify-between gap-5 px-3 py-1 bg-white border-b border-[#e2e8f0]">
                          <span className="min-w-0 flex-1 text-[9px] font-bold text-rose-700 uppercase">Discount {discountPct > 0 ? `(${discountPct}%)` : ""}</span>
                          <span className="ml-3 shrink-0 text-[10.5px] font-bold text-rose-700">- {"\u20B9"} {discAmt.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      {fright > 0 && (
                        <div className="flex items-center justify-between gap-5 px-3 py-1 bg-white border-b border-[#e2e8f0]">
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="flex h-4 w-4 items-center justify-center text-[#000000]">
                              <Truck size={8.5} strokeWidth={2.2} />
                            </span>
                            <span className="text-[9px] font-bold text-[#000000]">Freight ({frightTax}%)</span>
                          </span>
                          <span className="ml-3 shrink-0 text-[10.5px] font-bold text-[#000000]">{"\u20B9"} {fright.toLocaleString("en-IN")}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-5 px-3 py-1 bg-white border-b border-[#e2e8f0]">
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          <span className="flex h-4 w-4 items-center justify-center text-[#000000]">
                            <Percent size={8.5} strokeWidth={2.2} />
                          </span>
                          <span className="text-[9.5px] font-bold text-[#000000] uppercase">GST Total</span>
                        </span>
                        <span className="ml-3 shrink-0 text-[11px] font-bold text-[#000000]">{"\u20B9"} {totalGst.toLocaleString("en-IN")}</span>
                      </div>
                      <div className="mt-0.5 bg-[#e4e4e7]">
                        <div className="flex items-center justify-between gap-5 px-3 py-1.5 text-[#000000]">
                          <span className="flex min-w-0 flex-1 items-center gap-1.5">
                            <span className="flex h-4.5 w-4.5 items-center justify-center text-[#000000]">
                              <Wallet size={8.5} strokeWidth={2.2} />
                            </span>
                            <span className="text-[10px] font-bold uppercase ">Grand Total</span>
                          </span>
                          <span className="ml-3 shrink-0 text-[12px] font-bold text-[#000000] leading-none">{"\u20B9"} {grandTotal.toLocaleString("en-IN")}</span>
                        </div>
                        <div className="h-[3px] bg-[#000000]" />
                      </div>
                    </div>
                  </div>
                </div>
                )}
              </div>

              {/* TOTALS & AMOUNT IN WORDS SECTION */}
              <div className="hidden">
                <div className="flex-grow pb-1">
                  <div className="px-4 py-2 border-y border-[#44403c] bg-[#fafaf9] flex justify-center items-center gap-3 mb-1">
                    <span className="text-[10px] font-black text-[#18181b] uppercase  shrink-0">Rupees (in words) :</span>
                    <span className="text-[12px] font-black text-[#000000] uppercase  leading-tight">
                      {amountToWords(grandTotal)}
                    </span>
                  </div>
                </div>

                <div className="w-56 border border-[#e2e8f0] rounded-sm overflow-hidden shadow-sm shrink-0">
                  <div className="flex justify-between p-2.5 px-4 bg-white border-b border-[#f1f5f9]">
                    <span className="text-[10px] font-black text-[#475569] uppercase">Sub Total</span>
                    <span className="text-[12px] font-black text-[#000000]">₹ {subtotal.toLocaleString("en-IN")}</span>
                  </div>
                  {discAmt > 0 && (
                    <div className="flex justify-between p-2.5 px-4 bg-white border-b border-[#f1f5f9]">
                      <span className="text-[9px] font-black text-rose-700 uppercase">TOTAL DISCOUNT {discountPct > 0 ? `(${discountPct}%)` : ""} :</span>
                      <span className="text-[11px] font-black text-rose-700">- ₹ {discAmt.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  {fright > 0 && (
                    <div className="flex justify-between p-2 px-4 bg-white border-b border-[#f1f5f9]">
                      <span className="text-[9.5px] font-black text-[#64748b] uppercase">Freight ({frightTax}%)</span>
                      <span className="text-[11px] font-bold text-[#0f172a]">₹ {fright.toLocaleString("en-IN")}</span>
                    </div>
                  )}
                  <div className="flex justify-between p-2.5 px-4 bg-white border-b border-[#f1f5f9]">
                    <span className="text-[10px] font-black text-[#475569] uppercase">GST Total</span>
                    <span className="text-[12px] font-black text-[#000000]">₹ {totalGst.toLocaleString("en-IN")}</span>
                  </div>
                  <div className="flex justify-between p-3 px-4 bg-[#000000] text-white">
                    <span className="text-[11px] font-black uppercase ">Grand Total</span>
                    <span className="text-[15px] font-black font-mono">₹ {grandTotal.toLocaleString("en-IN")}</span>
                  </div>
                </div>
              </div>

              {/* Page 1 supplementary */}
{/* Page 1 supplementary */}
{!hasItemOverflow && effectivePageOneSections.length > 0 && (
  <div className="mt-3 space-y-5 text-[11px]" 
    style={{ overflow: 'hidden', maxHeight: '180px' }}>  {/* ← add this */}
    {effectivePageOneSections.map((section) => renderSupplementarySection(section, { compact: true }))}
  </div>
)}

              {renderFooter(1)}
            </div>

            {/* ITEM OVERFLOW PAGES */}
            {hasItemOverflow && itemPages.slice(1).map((pageRows, pageIdx) => {
              const isLastItemPage = pageIdx === itemPages.length - 2;
              const pageNum = pageIdx + 2;
              return (
                <div key={`items-page-${pageIdx}`} className="page-container" style={{ backgroundColor: '#ffffff' }}>
                  {renderHeader()}
                  <div className="overflow-hidden border border-[#000000] mb-4 bg-white">
                    <table className="w-full text-left table-fixed" style={{ borderCollapse: 'collapse' }}>
                      {renderItemColGroup()}
                      <thead className="bg-[#d4d4d8] border-b border-[#000000]">
                        <tr className="text-[#000000] text-[10px] font-black uppercase leading-none">
                          <th className="border-r border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Sr.</th>
                          {isSupply ? (
                            <>
                              <th className="border-r border-[#000000] px-3 py-1.5 text-center" style={{ width: 'auto' }}>Item Name</th>
                              <th className="border-r border-[#000000] px-3 py-1.5 text-center" style={{ width: 'auto' }}>Specification</th>
                            </>
                          ) : (
                            <th className="border-r border-[#000000] px-3 py-1.5 text-center" style={{ width: 'auto' }}>Item Name &amp; Description</th>
                          )}
                          <th className="border-r border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Unit</th>
                          <th className="border-r border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Qty</th>
                          <th className="border-r border-[#000000] px-3 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Rate</th>
                          {totals.discount_mode === 'line' && (
                            <th className="border-r border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Disc%</th>
                          )}
                          <th className="border-r border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>GST%</th>
                          <th className="px-4 py-1.5 text-center whitespace-nowrap bg-[#000000]/5" style={{ width: '1%' }}>Amount</th>
                          {groupedItems.some(it => it.remarks) && totals.showRemarks !== false && (
                            <th className="border-l border-[#000000] px-2 py-1.5 text-center whitespace-nowrap" style={{ width: '1%' }}>Remarks</th>
                          )}
                        </tr>
                      </thead>
                      <tbody className="text-[10px]" style={{ borderCollapse: 'collapse' }}>
                        {pageRows.map((it, idx) => (
                          <tr key={idx} className="bg-white">
                            {!it._isSubRow && (
  <td
    rowSpan={it._rowSpan}
    className="px-2 border-r border-[#000000] text-center text-[#000000] font-normal bg-[#fcfcfc] align-top text-[10px] whitespace-nowrap"
    style={{
      padding: '6px 4px',
      verticalAlign: 'top',
      borderRight: '1px solid #000000',
      borderBottom: '1px solid #000000',
    }}
  >
    {it._groupSrNo < 10 ? `0${it._groupSrNo}` : it._groupSrNo}
  </td>
)}
                            {isSupply ? (
                              <>
                                {!it._isSubRow && (
  <td
    rowSpan={it._rowSpan}
    className="px-3 border-r border-[#000000] font-bold uppercase text-[#000000] leading-tight text-[10px] align-top"
    style={{
      padding: '6px 8px',
      verticalAlign: 'top',
      borderRight: '1px solid #000000',
      borderBottom: '1px solid #000000',
      backgroundImage: it._rowSpan > 1
        ? `repeating-linear-gradient(to bottom, #fafafa, #fafafa calc(${100 / it._rowSpan}% - 0.5px), #000000 calc(${100 / it._rowSpan}% - 0.5px), #000000 calc(${100 / it._rowSpan}%))`
        : undefined,
      backgroundSize: '100% 100%',
    }}
  >
    {it._itemName}
  </td>
)}
                                <td className="px-3 py-1.5 border-r border-[#000000] text-[10px] text-[#000000] font-normal leading-snug" style={{ minWidth: '200px' }}>
                                  <div className="space-y-0.5">
                                    {(() => {
                                      const desc = it.description;
                                      if (!desc) return '--';
                                      let points = [];
                                      try { points = typeof desc === 'string' && (desc.startsWith('[') || desc.startsWith('{')) ? JSON.parse(desc) : (Array.isArray(desc) ? desc : [desc]); } catch (e) { points = [desc]; }
                                      return points.map((p, i) => (
                                        <div key={i} className="mb-0.5 last:mb-0"><span className="font-medium">{p.replace(/<[^>]*>/g, '')}</span></div>
                                      ));
                                    })()}
                                    {showModel && it.model_number && (
                                      <div className="text-[9.5px] mt-0.5"><span className="font-bold text-[#000000]">Model No.:</span> <span className="font-normal">{it.model_number}</span></div>
                                    )}
                                    {showBrand && (() => { const bVal = it.make || ''; if (!bVal || bVal === '[]' || bVal === 'null') return null; let b = bVal; try { const p = JSON.parse(bVal); if (Array.isArray(p)) { if (p.length !== 1) return null; b = p[0]; } else b = p; } catch {} return b ? <div className="text-[9.5px]"><span className="font-bold text-[#000000]">Brand:</span> <span className="font-normal">{b}</span></div> : null; })()}
                                  </div>
                                </td>
                              </>
                            ) : (
                              <td className="px-3 py-2 border-r border-[#000000] text-[10px] text-[#000000] font-normal leading-snug align-top" style={{ minWidth: '280px' }}>
                                {!it._isSubRow && (
                                  <div className="font-bold uppercase text-[10px] leading-tight mb-1.5 text-[#000000] tracking-wide">{it._itemName}</div>
                                )}
                                <div className="space-y-0.5">
                                  {(() => {
                                    const desc = it.description;
                                    if (!desc) return null;
                                    let points = [];
                                    try { points = typeof desc === 'string' && (desc.startsWith('[') || desc.startsWith('{')) ? JSON.parse(desc) : (Array.isArray(desc) ? desc : [desc]); } catch (e) { points = [desc]; }
                                    return points.map((p, i) => (
                                      <div key={i} className="pdf-fit-text quill-content" dangerouslySetInnerHTML={{ __html: p }} />
                                    ));
                                  })()}
                                  {showModel && it.model_number && (
                                    <div className="text-[9.5px] mt-0.5"><span className="font-bold text-[#000000]">Model No.:</span> <span className="font-normal">{it.model_number}</span></div>
                                  )}
                                  {showBrand && (() => { const bVal = it.make || ''; if (!bVal || bVal === '[]' || bVal === 'null') return null; let b = bVal; try { const p = JSON.parse(bVal); if (Array.isArray(p)) { if (p.length !== 1) return null; b = p[0]; } else b = p; } catch {} return b ? <div className="text-[9.5px]"><span className="font-bold text-[#000000]">Brand:</span> <span className="font-normal">{b}</span></div> : null; })()}
                                </div>
                              </td>
                            )}
                            <td className="px-3 py-1.5 border-r border-[#000000] text-center text-[#000000] font-normal text-[10px] whitespace-nowrap">{it.unit || 'NOS'}</td>
                            <td className="px-3 py-1.5 border-r border-[#000000] text-center font-normal text-[#000000] text-[10px] whitespace-nowrap">{it.qty}</td>
                            <td className="px-3 py-1.5 border-r border-[#000000] text-right font-normal text-[#000000] text-[10px] whitespace-nowrap">₹ {Number(it.unit_rate).toLocaleString('en-IN')}</td>
                            {totals.discount_mode === 'line' && (
                              <td className="px-3 py-1.5 border-r border-[#000000] text-center font-normal text-rose-600 text-[10px]">{Number(it.discount_pct)}%</td>
                            )}
                            <td className="px-3 py-1.5 border-r border-[#000000] text-center font-normal text-[#000000] text-[10px] whitespace-nowrap">{it.tax_pct}%</td>
                            <td className="px-4 py-1.5 text-right font-bold text-[#000000] text-[10px] bg-slate-50 whitespace-nowrap">₹ {Number(it.amount).toLocaleString('en-IN')}</td>
                            {groupedItems.some(it2 => it2.remarks) && totals.showRemarks !== false && (
                              <td className="px-3 py-1.5 border-l border-[#000000] text-left text-[#000000] font-normal text-[10px] whitespace-normal leading-tight">
                                <span className="pdf-fit-text">{it.remarks || '--'}</span>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {isLastItemPage && (
                      <div className="-mx-px -mb-px border border-[#000000] bg-white px-3 pt-1.5 pb-2 shadow-[inset_0_1px_0_#000000]">
                        <div className="flex items-stretch justify-between gap-4">
                          <div className="flex w-[360px] max-w-[calc(100%-232px)]">
                            <div className="flex h-full min-h-[84px] w-full flex-col overflow-hidden bg-[#e4e4e7]">
                              <div className="flex flex-1 items-start gap-3 px-2 py-3 text-[#000000]">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[#000000]"><FileText size={12} strokeWidth={2.2} /></span>
                                <div className="min-w-0">
                                  <div className="mb-1 text-[7.5px] font-bold uppercase text-[#000000]">Amount In Words</div>
                                  <div className="text-[10px] font-bold text-[#000000] leading-snug">{amountToWords(grandTotal)}</div>
                                </div>
                              </div>
                              <div className="h-[3px] bg-[#000000]" />
                            </div>
                          </div>
                          <div className="w-[220px] shrink-0">
                            <div className="flex items-center justify-between gap-5 px-3 py-1 bg-white border-b border-[#e2e8f0]">
                              <span className="flex min-w-0 flex-1 items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center text-[#000000]"><FileText size={8.5} strokeWidth={2.2} /></span><span className="text-[9.5px] font-bold text-[#000000] uppercase">Subtotal</span></span>
                              <span className="ml-3 shrink-0 text-[11px] font-bold text-[#000000]">{"\u20B9"} {subtotal.toLocaleString('en-IN')}</span>
                            </div>
                            {discAmt > 0 && (
                              <div className="flex items-center justify-between gap-5 px-3 py-1 bg-white border-b border-[#e2e8f0]">
                                <span className="min-w-0 flex-1 text-[9px] font-bold text-rose-700 uppercase">Discount {discountPct > 0 ? `(${discountPct}%)` : ''}</span>
                                <span className="ml-3 shrink-0 text-[10.5px] font-bold text-rose-700">- {"\u20B9"} {discAmt.toLocaleString('en-IN')}</span>
                              </div>
                            )}
                            {fright > 0 && (
                              <div className="flex items-center justify-between gap-5 px-3 py-1 bg-white border-b border-[#e2e8f0]">
                                <span className="flex min-w-0 flex-1 items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center text-[#000000]"><Truck size={8.5} strokeWidth={2.2} /></span><span className="text-[9px] font-bold text-[#000000]">Freight ({frightTax}%)</span></span>
                                <span className="ml-3 shrink-0 text-[10.5px] font-bold text-[#000000]">{"\u20B9"} {fright.toLocaleString('en-IN')}</span>
                              </div>
                            )}
                            <div className="flex items-center justify-between gap-5 px-3 py-1 bg-white border-b border-[#e2e8f0]">
                              <span className="flex min-w-0 flex-1 items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center text-[#000000]"><Percent size={8.5} strokeWidth={2.2} /></span><span className="text-[9.5px] font-bold text-[#000000] uppercase">GST Total</span></span>
                              <span className="ml-3 shrink-0 text-[11px] font-bold text-[#000000]">{"\u20B9"} {totalGst.toLocaleString('en-IN')}</span>
                            </div>
                            <div className="mt-0.5 bg-[#e4e4e7]">
                              <div className="flex items-center justify-between gap-5 px-3 py-1.5 text-[#000000]">
                                <span className="flex min-w-0 flex-1 items-center gap-1.5"><span className="flex h-4.5 w-4.5 items-center justify-center text-[#000000]"><Wallet size={8.5} strokeWidth={2.2} /></span><span className="text-[10px] font-bold uppercase">Grand Total</span></span>
                                <span className="ml-3 shrink-0 text-[12px] font-bold text-[#000000] leading-none">{"\u20B9"} {grandTotal.toLocaleString('en-IN')}</span>
                              </div>
                              <div className="h-[3px] bg-[#000000]" />
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                  {isLastItemPage && effectivePageOneSections.length > 0 && (
                    <div className="mt-3 space-y-5 text-[11px]">
                      {effectivePageOneSections.map((section) => renderSupplementarySection(section, { compact: true }))}
                    </div>
                  )}
                  {renderFooter(pageNum)}
                </div>
              );
            })}

            {/* SUPPLEMENTARY DETAIL PAGES */}
            {effectiveContinuationPages.map((pageSections, pageIndex) => (
              <div key={`supplementary-page-${pageIndex}`} className="page-container" style={{ backgroundColor: '#ffffff' }}>
                {renderHeader()}
               <div className="space-y-5 text-[11px]"
  style={{ overflow: 'hidden', maxHeight: 'calc(297mm - 80px)' }}>
  {pageSections.map(renderSupplementarySection)}
</div>
                {renderFooter(itemPages.length + pageIndex + 1)}
              </div>
            ))}

            <div className="page-container" style={{ backgroundColor: '#ffffff' }}>
              {renderHeader()}

              <div className="space-y-5 text-[11px]">
                {effectiveFinalPageSections.map(renderSupplementarySection)}

                {/* Authorized Signatures */}
                <div className="mt-6 pt-4">
                  <div className="flex items-start justify-between gap-12 px-1" style={{ width: '94%', margin: '0 auto', transform: 'translateX(18px)' }}>
                    {/* Company Side */}
                    <div style={{ width: '41%', display: 'flex', justifyContent: 'flex-start', paddingRight: '20px' }}>
                      <div style={{ width: '320px', maxWidth: '100%', paddingTop: '10px' }}>
                        <p
                          className="pdf-fit-text"
                          style={getAdaptiveTextStyle(companyDisplayName, { base: 13, min: 10.5, step: 0.5, charsPerStep: 12, lineHeight: 1.2, textTransform: 'uppercase', fontWeight: 900, color: '#000000', marginBottom: '16px' })}
                        >
                          {companyDisplayName}
                        </p>
                        <div style={{ position: 'relative', height: '110px', marginBottom: '14px' }}>
                          {(comp.stampUrl || comp.stamp_url) && (
                            <img src={comp.stampUrl || comp.stamp_url} crossOrigin="anonymous" alt="Stamp"
                              style={{ position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)', height: '100px', maxWidth: '110px', objectFit: 'contain', opacity: 0.7 }} />
                          )}
                          {(comp.signUrl || comp.sign_url) && (
  <img src={comp.signUrl || comp.sign_url} crossOrigin="anonymous" alt="Signature"
    style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', 
    height: '80px', maxWidth: '200px', objectFit: 'contain', zIndex: 10,
    filter: 'brightness(0) saturate(100%) invert(0) contrast(2)' }} />
)}
                          {!(comp.stampUrl || comp.stamp_url) && !(comp.signUrl || comp.sign_url) && (
                            <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', borderBottom: '1.5px solid #94a3b8' }} />
                          )}
                        </div>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#000000', marginBottom: '14px' }}>
                          (Authorized Signature)
                        </p>
                        <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#000000' }}>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <span style={{ fontWeight: 700, width: '52px', flexShrink: 0 }}>Name:</span>
                            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{companySignatoryName} ({companyDesignation})</span>
                          </div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <span style={{ fontWeight: 700, width: '52px', flexShrink: 0 }}>Date:</span>
                            <span style={{ fontWeight: 600 }}>{poDate !== '--' ? poDate : ''}</span>
                          </div>

                        </div>
                        <div style={{ display: 'none' }}>
                          <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Authorized Signatory</p>
                          <p style={{ color: '#334155' }}><span style={{ fontWeight: 700, color: '#0f172a' }}>Name: </span>{comp.personName || comp.person_name || order.made_by || '—'}</p>
                          <p style={{ color: '#334155' }}><span style={{ fontWeight: 700, color: '#0f172a' }}>Designation: </span>{comp.designation || 'Procurement'}</p>
                          <p style={{ color: '#334155' }}><span style={{ fontWeight: 700, color: '#0f172a' }}>Date: </span>{order.created_at ? new Date(order.created_at).toLocaleDateString("en-IN") : '—'}</p>
                        </div>
                      </div>
                    </div>
                    {/* Vendor Side */}
                    <div style={{ width: '41%', display: 'flex', justifyContent: 'flex-end', paddingLeft: '20px' }}>
                      <div style={{ width: '320px', maxWidth: '100%', paddingTop: '10px' }}>
                        <p
                          className="pdf-fit-text"
                          style={getAdaptiveTextStyle(vendorDisplayName, { base: 13, min: 10.5, step: 0.5, charsPerStep: 12, lineHeight: 1.2, textTransform: 'uppercase', fontWeight: 900, color: '#000000', marginBottom: '16px' })}
                        >
                          {vendorDisplayName}
                        </p>
                        <div style={{ height: '110px', marginBottom: '14px' }} />
                        <div style={{ display: 'none' }}>
                          <div style={{ position: 'absolute', bottom: 0, left: 0, width: '100%', borderBottom: '1.5px solid #94a3b8' }} />
                        </div>
                        <p style={{ fontSize: '13px', fontWeight: 600, color: '#000000', marginBottom: '14px' }}>
                          (Agreed & Accepted by)
                        </p>
                        <div style={{ fontSize: '13px', lineHeight: '1.8', color: '#000000' }}>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <span style={{ fontWeight: 700, width: '52px', flexShrink: 0 }}>Name:</span>
                            <span style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{vendorSignatoryName}</span>
                          </div>
                          <div style={{ display: 'flex', gap: '2px' }}>
                            <span style={{ fontWeight: 700, width: '52px', flexShrink: 0 }}>Date:</span>
                            <span style={{ fontWeight: 600 }}></span>
                          </div>
                        </div>
                        <div style={{ display: 'none' }}>
                          <p style={{ fontWeight: 800, color: '#0f172a', marginBottom: '4px' }}>Authorized Signatory</p>
                          <p style={{ color: '#334155' }}><span style={{ fontWeight: 700, color: '#0f172a' }}>Name: </span>{vend.contactPerson || vend.contact_person || vend.vendorName || vend.vendor_name || '—'}</p>
                          <p style={{ color: '#334155' }}><span style={{ fontWeight: 700, color: '#0f172a' }}>Designation: </span></p>
                          <p style={{ color: '#334155' }}><span style={{ fontWeight: 700, color: '#0f172a' }}>Date: </span>__________</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

              </div>
              {renderFooter(totalPages)}
            </div>
          </>
        );
      })()}
    </div>
  );
};

export default OrderPDFTemplate;

