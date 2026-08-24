# Sidebar Tabs Documentation

Ye document Zyhawk project ke sidebar tabs ka purpose explain karta hai. Isko reference, handover, planning, ya future development me use kiya ja sakta hai.

## Overview

Sidebar ka main kaam app ke different modules/pages ko navigate karna hai.

- `activeTab` track karta hai ki user abhi kis tab/page par hai.
- Tab click hone par `activeTab` update hota hai.
- Current tab URL hash me save hota hai, jaise `#tab=dashboard&project=...`.
- Page refresh ya browser back/forward ke time same tab restore ho sakta hai.
- Project-specific tabs ke liye pehle project select karna zaroori hai.

## Sidebar Sections

Sidebar mainly 3 parts me divided hai:

1. Global tabs (Global Dashboard, Inbox)
2. Management tabs (Organisation, Audit, Historical Data)
3. Project tabs (project select karne ke baad unlock hote hain)

## Global Tabs

Global tabs bina project select kiye open ho sakte hain.

| Tab | Tab ID | Purpose |
| --- | --- | --- |
| Global Dashboard | `global_dashboard` | Sab projects ka overall overview. |
| Inbox | `approvals` | Pending approvals (Intake, Orders, Payments, Amendments etc.) |
| Profile | `profile` | User profile page. |

## Management Tabs

| Tab | Tab ID | Purpose |
| --- | --- | --- |
| Organisation | `organisation` (+ `organisation__structure`, `organisation__sop`) | Org structure, hierarchy aur SOPs. |
| Audit | `audit` | Placeholder — `Coming Soon` render hota hai, page banaya nahi gaya abhi tak. |
| Historical Data | `historical_data` | Pre-system order records. |

## Create / Setup / Master Data (Global)

| Tab | Tab ID | Purpose |
| --- | --- | --- |
| Create > Intake | `create__intake` | Intake list/dashboard open karta hai. |
| Create > Order | `create__order` | Global order create/edit page. |
| Setup > Vendor | `proc_setup__vendor_list` | Vendor master manage karta hai. |
| Setup > Material Catalog | `proc_setup__item_list` | Items master manage karta hai. |
| Setup > Category | `proc_setup__category_list` | Category setup manage karta hai. |
| Setup > UOM | `proc_setup__uom` | Unit of Measurement manage karta hai. |
| Setup > Terms & Conditions | `proc_setup__term_condition` | Order/document terms and conditions master. |
| Setup > Payment Terms | `proc_setup__payment_terms` | Payment terms master. |
| Setup > Government Laws | `proc_setup__government_laws` | Government laws/clauses master. |
| Setup > Annexure | `proc_setup__annexure` | Annexure master setup. |
| Master Data > Vendor | `master_data` / `master_data__vendor` | Vendor master data page. |
| Master Data > Products | `master_data__products` | Products master data. |
| Master Data > Orders | `master_data__orders` | Orders master data. |
| Master Data > Intakes | `master_data__intakes` | Intakes master data (IntakeList reuse). |
| Master Data > Clauses | `master_data__clauses` | Clauses master data. |
| Master Data > Finance | `master_data__finance` | Finance master data. |

## Project Selector

Project selector sidebar me global/management tabs aur project tabs ke beech me hota hai. Backend se active projects fetch hote hain aur dropdown me show hote hain.

## Project Tabs

Project tabs selected project ke context me kaam karte hain. Agar project select nahi hai, app `Please select a project first` message dikhata hai.

| Section | Tab | Tab ID | Status |
| --- | --- | --- | --- |
| Project | Dashboard | `dashboard` | Live |
| Project | 3D View | `view_3d` | Live |
| Procurement | Intake | `procurement__intake` | Live |
| Procurement | Orders | `procurement__orders` | Live |
| Inventory | Received Material (GRN) | `inventory__received_material_grn` | **Coming Soon** (no page built yet) |
| Inventory | Stock / Inventory | `inventory__stock_inventory` | **Coming Soon** |
| Inventory | Material Issue | `inventory__material_issue` | **Coming Soon** |
| Operations | Work Activity | `operations__work_activity` | **Coming Soon** |
| Operations | Staff Attendance | `operations__staff_attendance` | Live |
| Operations | Manpower | `operations__manpower` | **Coming Soon** |
| Finance | Payments Track | `finance__payments_track` | Live |
| Finance | Site Expenses | `finance__site_expenses` | Live |
| Finance | Petty Cash | `finance__petty_cash` | **Coming Soon** |
| Finance | Reimbursement | `finance__reimbursement` | **Coming Soon** |
| Confidential | LOA | `confidential__loa` | **Coming Soon** |
| Confidential | BOQ | `confidential__boq` | **Coming Soon** |
| Confidential | Drawings | `confidential__drawings` | **Coming Soon** |
| Confidential | RA Bills | `confidential__ra_bills` | **Coming Soon** |

Sab "Coming Soon" tabs `App.jsx` ke render switch me seedha `<ComingSoon />` return karte hain — unke page components abhi banaye nahi gaye hain (jo purani placeholder files pehle padi thi, unhe cleanup me remove kar diya gaya hai, kyunki wo kahin render hi nahi ho rahi thi).

## Footer Actions

| Action | Behavior | Purpose |
| --- | --- | --- |
| Logout | Clears login state | Token aur user data clear karke login screen par bhejta hai. |

## Permission Handling

Sidebar tabs permissions ke basis par show/hide hote hain.

- `global_admin` ko saare tabs visible hote hain.
- `about`/`profile` type tabs always visible hain.
- Non-admin users ke liye `userTabPermissions` ke basis par tabs filter hote hain.
- Har tab ka `tabId` database ke `module_key` se map hota hai (`frontend/src/utils/tabModuleKeys.js`).
- Agar permission load nahi hui hai, gated tabs hidden rehte hain.

## Main Files

| File | Role |
| --- | --- |
| `frontend/src/components/Sidebar.jsx` | Sidebar menu structure (tab list, labels, icons), tab click handling, permission filtering, project selector. |
| `frontend/src/App.jsx` | `activeTab` state, URL hash sync, selected project state, aur active tab ke basis par page rendering (`renderPage()`). |
| `frontend/src/utils/tabModuleKeys.js` | Tab ID → permission module key mapping. |

## Short Summary

Sidebar navigation ka center point `activeTab` hai. `Sidebar.jsx` tab list define karta hai aur active tab set karta hai; `App.jsx` us active tab ke basis par decide karta hai ki kaunsa page/component render hoga. Global/management tabs direct open hote hain, project tabs ke liye selected project required hai. "Coming Soon" wale tabs ka UI already sidebar me hai, lekin unka actual page abhi build nahi hua — jab bhi wo feature banana ho, tab ID already `App.jsx` ke switch me maujood hai, bas naya component bana ke uska case update karna hoga.
