/**
 * backup-storage.js — download all files from Supabase Storage buckets locally
 * Usage:
 *   node scripts/backup-storage.js         (prod - reads .env)
 *   node scripts/backup-storage.js --dev   (dev  - reads .env.local)
 */

const path = require("path");
const fs = require("fs");

const isDev = process.argv.includes("--dev");
require("dotenv").config({ path: path.join(__dirname, isDev ? "../.env.local" : "../.env") });

const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

const BUCKETS = [
  "picture",
  "procurement-docs",
  "vendor-docs",
  "finance-docs",
  "historical-data",
  "Intake Docs",
  "models-3d",
];

const envLabel = isDev ? "dev" : "prod";
const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
const outDir = path.join(__dirname, "../../database backup", `storage_backup_${envLabel}_${dateStr}`);

async function listAllFiles(bucket, prefix = "") {
  const results = [];
  const { data, error } = await supabase.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw error;
  for (const item of data) {
    const itemPath = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.id === null) {
      const nested = await listAllFiles(bucket, itemPath);
      results.push(...nested);
    } else {
      results.push(itemPath);
    }
  }
  return results;
}

async function backupBucket(bucket) {
  console.log(`\nBucket: ${bucket}`);
  const files = await listAllFiles(bucket);
  console.log(`  found ${files.length} files`);
  let ok = 0, failed = 0;
  for (const filePath of files) {
    const { data, error } = await supabase.storage.from(bucket).download(filePath);
    if (error) {
      console.log(`  FAILED ${filePath}: ${error.message}`);
      failed++;
      continue;
    }
    const localPath = path.join(outDir, bucket, filePath);
    fs.mkdirSync(path.dirname(localPath), { recursive: true });
    const buf = Buffer.from(await data.arrayBuffer());
    fs.writeFileSync(localPath, buf);
    ok++;
  }
  console.log(`  saved ${ok}, failed ${failed}`);
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  for (const bucket of BUCKETS) {
    try {
      await backupBucket(bucket);
    } catch (err) {
      console.log(`  SKIPPED ${bucket}: ${err.message}`);
    }
  }
  console.log(`\nDone. Saved to: ${outDir}`);
})();
