/**
 * State list + async city/place lists from GeoNames (~5.5L populated places in India, class P),
 * merged with `indiaLocationSupplement.json` for extra aliases.
 *
 * Static JSON files: `public/india-locations/part-{index}.json` (index matches INDIA_STATES).
 * Regenerate: `npm run build:india-geonames` (from frontend/). Attribution: GeoNames CC BY 4.0.
 */
import supplement from "./indiaLocationSupplement.json";

export const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
];

const listCache = new Map();

function mergeSupplement(stateName, list) {
  const extra = supplement[stateName];
  if (!Array.isArray(extra) || !extra.length) return [...list].sort((a, b) => a.localeCompare(b));
  const set = new Set(list);
  for (const x of extra) {
    const s = String(x || "").trim();
    if (s) set.add(s);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/**
 * @param {string} stateName
 * @returns {Promise<string[]>}
 */
export async function loadCitiesForState(stateName) {
  if (!stateName) return [];
  if (listCache.has(stateName)) return listCache.get(stateName);

  const idx = INDIA_STATES.indexOf(stateName);
  if (idx < 0) return [];

  const base = (import.meta.env.BASE_URL || "/").replace(/\/?$/, "/");
  const url = `${base}india-locations/part-${idx}.json`;

  let list = [];
  try {
    const res = await fetch(url);
    if (res.ok) list = await res.json();
  } catch {
    list = [];
  }

  const merged = mergeSupplement(stateName, Array.isArray(list) ? list : []);
  listCache.set(stateName, merged);
  return merged;
}
