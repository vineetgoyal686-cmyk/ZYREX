const puppeteer = require("puppeteer");

let browserPromise = null;

const launchBrowser = () => {
  const exePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  if (exePath) console.log("Launching browser with path:", exePath);
  return puppeteer.launch({
    headless: "new",
    executablePath: exePath || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--font-render-hinting=none",
    ],
  });
};

const getBrowser = async () => {
  if (!browserPromise) browserPromise = launchBrowser();
  try {
    const browser = await browserPromise;
    if (!browser.isConnected()) throw new Error("browser disconnected");
    return browser;
  } catch (err) {
    browserPromise = null;
    throw err;
  }
};

const pagePool = [];
const POOL_MAX = 3;

const acquirePage = async () => {
  const browser = await getBrowser();
  const pooled = pagePool.pop();
  if (pooled && !pooled.isClosed()) return pooled;
  const page = await browser.newPage();
  await page.emulateMediaType("print");
  return page;
};

const releasePage = async (page) => {
  if (!page || page.isClosed()) return;
  if (pagePool.length < POOL_MAX) {
    try { await page.goto("about:blank"); pagePool.push(page); return; } catch {}
  }
  try { await page.close(); } catch {}
};

const renderPdf = async (html, { format = "A4", margin, headerTemplate, footerTemplate } = {}) => {
  const page = await acquirePage();
  try {
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    const displayHeaderFooter = Boolean(headerTemplate || footerTemplate);
    return await page.pdf({
      format,
      printBackground: true,
      preferCSSPageSize: true,
      displayHeaderFooter,
      headerTemplate: headerTemplate || "<span></span>",
      footerTemplate: footerTemplate || "<span></span>",
      margin: margin || (displayHeaderFooter
        ? { top: "33mm", bottom: "24mm", left: "10mm", right: "10mm" }
        : { top: "12mm", bottom: "16mm", left: "10mm", right: "10mm" }),
    });
  } finally {
    releasePage(page).catch(() => {});
  }
};

const closeBrowser = async () => {
  if (!browserPromise) return;
  try {
    const b = await browserPromise;
    await b.close();
  } catch {}
  browserPromise = null;
};

process.on("SIGTERM", closeBrowser);
process.on("SIGINT", closeBrowser);

module.exports = { renderPdf, closeBrowser };
