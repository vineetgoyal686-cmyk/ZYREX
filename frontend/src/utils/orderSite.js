/** Normalize project/site master fields for order snapshot + list/view display. */
export function normalizeOrderSite(site) {
  if (!site || typeof site !== "object") return {};
  return {
    ...site,
    siteCode: site.siteCode || site.site_code || site.projectCode || site.project_code || "",
    siteName: site.siteName || site.site_name || site.projectName || site.project_name || "",
    siteAddress: site.siteAddress || site.site_address || site.address || "",
  };
}

/** Strip hyphens/underscores for loose comparison (e.g. "B-47" === "B47"). */
export function normalizeSiteCode(code = "") {
  return code.replace(/[-_]/g, "").toUpperCase();
}

export function getOrderSiteCode(order) {
  const s = order?.snapshot?.site || {};
  return s.siteCode || s.site_code || s.projectCode || s.project_code || "";
}

/** Returns true if two site codes refer to the same site (ignoring hyphens/underscores/case). */
export function siteCodeMatch(a = "", b = "") {
  return normalizeSiteCode(a) === normalizeSiteCode(b);
}

export function getOrderSiteName(order) {
  const s = order?.snapshot?.site || {};
  return s.siteName || s.site_name || s.projectName || s.project_name || "";
}

export function getOrderSiteAddress(order) {
  const s = order?.snapshot?.site || {};
  return s.siteAddress || s.site_address || s.address || "";
}
