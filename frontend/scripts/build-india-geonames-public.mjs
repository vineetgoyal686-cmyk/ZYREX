/**
 * Downloads GeoNames IN.zip + admin1CodesASCII.txt, streams IN.txt,
 * emits one JSON array per app state under public/india-locations/part-{index}.json
 * (same order as INDIA_STATES in src/data/indiaStateCities.js).
 *
 * License: GeoNames data CC BY 4.0 — see public/india-locations/ATTRIBUTION.txt
 *
 * Run from frontend/: npm run build:india-geonames
 */
import fs from "fs";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";
import unzipper from "unzipper";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const cacheDir = path.join(__dirname, ".cache", "geonames");
const outDir = path.join(__dirname, "../public/india-locations");
const zipPath = path.join(cacheDir, "IN.zip");
const inTxtPath = path.join(cacheDir, "IN.txt");
const admin1Path = path.join(cacheDir, "admin1CodesASCII.txt");

/** Must match src/data/indiaStateCities.js order exactly (used for part-{i}.json). */
const INDIA_STATES = [
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

const GEONAMES_ADMIN1_TO_APP = {
  "Andaman and Nicobar": "Andaman and Nicobar Islands",
};

async function ensureFile(url, dest) {
  if (fs.existsSync(dest)) return;
  console.log("Downloading", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`GET ${url} → ${res.status}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
}

async function ensureInTxt() {
  fs.mkdirSync(cacheDir, { recursive: true });
  if (fs.existsSync(inTxtPath)) return;
  await ensureFile("https://download.geonames.org/export/dump/IN.zip", zipPath);
  console.log("Extracting IN.txt from IN.zip …");
  const directory = await unzipper.Open.file(zipPath);
  const entry = directory.files.find((d) => d.path === "IN.txt");
  if (!entry) throw new Error("IN.txt not found inside IN.zip");
  await new Promise((resolve, reject) => {
    entry
      .stream()
      .pipe(fs.createWriteStream(inTxtPath))
      .on("finish", resolve)
      .on("error", reject);
  });
  console.log("Extracted →", inTxtPath);
}

function loadAdmin1Map() {
  const txt = fs.readFileSync(admin1Path, "utf8");
  /** admin1 numeric code (e.g. "10") → GeoNames English name */
  const byCode = new Map();
  for (const line of txt.split(/\r?\n/)) {
    if (!line.startsWith("IN.")) continue;
    const p = line.split("\t");
    const code = p[0].split(".")[1];
    const name = p[1];
    byCode.set(code, name);
  }
  return byCode;
}

function toAppState(geonamesStateName) {
  return GEONAMES_ADMIN1_TO_APP[geonamesStateName] || geonamesStateName;
}

async function main() {
  await ensureInTxt();
  await ensureFile("https://download.geonames.org/export/dump/admin1CodesASCII.txt", admin1Path);

  const admin1ByCode = loadAdmin1Map();
  const stateIndex = new Map(INDIA_STATES.map((s, i) => [s, i]));
  /** @type {Map<number, Set<string>>} */
  const byIdx = new Map();
  for (let i = 0; i < INDIA_STATES.length; i++) byIdx.set(i, new Set());

  let lines = 0;
  let added = 0;
  const rl = readline.createInterface({
    input: fs.createReadStream(inTxtPath, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    lines++;
    const f = line.split("\t");
    if (f.length < 11) continue;
    if (f[8] !== "IN") continue;
    if (f[6] !== "P") continue;
    const admin1 = f[10];
    const gnName = admin1ByCode.get(admin1);
    if (!gnName) continue;
    const appState = toAppState(gnName);
    const idx = stateIndex.get(appState);
    if (idx === undefined) continue;
    const label = (f[2] || f[1] || "").trim();
    if (!label) continue;
    byIdx.get(idx).add(label);
    added++;
  }

  fs.mkdirSync(outDir, { recursive: true });
  for (let i = 0; i < INDIA_STATES.length; i++) {
    const arr = [...byIdx.get(i)].sort((a, b) => a.localeCompare(b));
    fs.writeFileSync(path.join(outDir, `part-${i}.json`), JSON.stringify(arr), "utf8");
    console.log(INDIA_STATES[i], arr.length);
  }

  const manifest = {
    version: 1,
    source: "GeoNames (https://www.geonames.org/) — IN.txt populated places (feature class P)",
    license: "CC BY 4.0",
    states: INDIA_STATES,
    totalApprox: added,
    ingestedLines: lines,
  };
  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  fs.writeFileSync(
    path.join(outDir, "ATTRIBUTION.txt"),
    `This directory contains place names derived from GeoNames (https://www.geonames.org/),\n` +
      `country dump IN.txt (populated places, feature class P).\n\n` +
      `License: Creative Commons Attribution 4.0 License\n` +
      `https://creativecommons.org/licenses/by/4.0/\n\n` +
      `You must attribute GeoNames when redistributing or displaying this data.\n`
  );

  console.log("Done. Rows scanned:", lines, "place rows added:", added, "→", outDir);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
