// Quotation maths — the same as backend/src/routes/quotations.js (compute),
// so the comparison updates as you pick.

// one item from one quotation: qty × rate, less discount, plus GST
export const lineCost = (qty, q) => {
  if (!q || !(Number(q.rate) > 0)) return null;
  const base = qty * Number(q.rate) * (1 - (Number(q.discountPct) || 0) / 100);
  return Math.round(base * (1 + (Number(q.gstPct) || 0) / 100) * 100) / 100;
};
export const charges = (q) => (Number(q?.freight) || 0) + (Number(q?.otherCharges) || 0);

export function compute(items, quotations, picks) {
  const lines = items.map(it => {
    const qty = Number(it.raised_qty) || 0;
    const offers = quotations.map(q => ({ id: q.id, cost: lineCost(qty, q.items.find(x => x.itemId === it.id)) })).filter(o => o.cost != null);
    const l1 = offers.length ? offers.reduce((a, b) => (b.cost < a.cost ? b : a)) : null;
    const chosen = picks[it.id] || null;
    return { item: it, qty, offers, l1: l1?.id || null, chosen, chosenCost: offers.find(o => o.id === chosen)?.cost ?? null };
  });
  const vendorTotal = Object.fromEntries(quotations.map(q => {
    const sum = lines.reduce((a, l) => a + (l.offers.find(o => o.id === q.id)?.cost || 0), 0);
    return [q.id, Math.round((sum + charges(q)) * 100) / 100];
  }));
  const winners = [...new Set(lines.map(l => l.chosen).filter(Boolean))];
  const total = Math.round((lines.reduce((a, l) => a + (l.chosenCost || 0), 0)
    + winners.reduce((a, id) => a + charges(quotations.find(q => q.id === id)), 0)) * 100) / 100;
  const l1Total = Math.round((lines.reduce((a, l) => a + (l.offers.find(o => o.id === l.l1)?.cost || 0), 0)
    + [...new Set(lines.map(l => l.l1).filter(Boolean))].reduce((a, id) => a + charges(quotations.find(q => q.id === id)), 0)) * 100) / 100;
  return {
    lines, vendorTotal, winners, total, l1Total,
    missing: lines.filter(l => !l.chosen).length,
    allL1: lines.every(l => !l.chosen || l.chosen === l.l1),
    // lowest whole-lot vendor among those who quoted every item
    lotL1: quotations.filter(q => lines.every(l => l.offers.some(o => o.id === q.id)))
      .reduce((a, q) => (!a || vendorTotal[q.id] < vendorTotal[a] ? q.id : a), null),
  };
}

export const inr = (n) => `₹${(Number(n) || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const fmtDay = (iso) => iso ? new Date(`${String(iso).slice(0, 10)}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }).replace(/,/g, "") : "—";
export const fmtWhen = (ts) => ts ? new Date(ts).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).replace(/,/g, "") : "";
