import { createContext, useContext } from "react";

// The organisation currently opened in OrgDetail. Every tab reads and writes
// master data (divisions, departments, employees…) scoped to this company.
export const OrgScopeContext = createContext(null);

export const useOrgId = () => useContext(OrgScopeContext);

/** Appends ?company_id= to a GET url when an org is selected. */
export const scopedUrl = (url, orgId) =>
  orgId ? `${url}${url.includes("?") ? "&" : "?"}company_id=${encodeURIComponent(orgId)}` : url;
