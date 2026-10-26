// Names typed in ALL CAPS ("A K ENTERPRISES", "JHANSI EXHIBITION CENTRE")
// read as "A K Enterprises", "Jhansi Exhibition Centre". Short forms stay in
// capitals (A, K, HR, PVT, LTD, IAS, BTC…), as do known abbreviations and
// anything with a digit or a dot. A name that already has small letters is
// left exactly as it was typed.
const KEEP = new Set([
  "BITL", "HDFC", "ICICI", "IDBI", "IDFC", "UCO", "SBI", "PNB", "BOB", "CBI",
  "LLP", "OPC", "HUF", "INC", "NHAI", "CPWD", "PWD", "DLF", "NCR", "HSIIDC", "UPSIDC",
]);
// common three-letter words that should still read as words
const WORDS3 = new Set(["THE", "AND", "NEW", "OLD", "FOR", "ALL", "SON", "SONS", "TOP", "ONE", "TWO", "BIG", "SKY", "SUN", "AIR",
  "RAM", "SAI", "JAI", "MAA", "DEV", "RAJ", "SRI", "OM"]);

function niceName(name) {
  const s = String(name ?? "");
  if (!s.trim() || /[a-z]/.test(s)) return s;
  return s.replace(/[A-Z0-9][A-Z0-9.&'’-]*/g, (w) => {
    if (/[\d.]/.test(w) || KEEP.has(w)) return w;
    if (w.length <= 3 && !WORDS3.has(w)) return w;
    return w[0] + w.slice(1).toLowerCase();
  });
}

module.exports = { niceName };
