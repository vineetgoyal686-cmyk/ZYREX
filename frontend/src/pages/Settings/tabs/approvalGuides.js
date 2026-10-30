// Settings › Approval Flow — the guides behind the "Guide" button.
// Each one walks the flow form top to bottom: what to fill in each box,
// with an example. One per tab (overview / order / intake) and one in the form.
// Keep them true to routes/approvalFlows.js.

const NOT_APPLIED = "Abhi lagu nahi hota — save hota hai, par abhi level mein tick kiya hua koi bhi ek aadmi approve kar de to level pura maana jaata hai.";

// the form, box by box — shared by every guide
const FORM_STEPS = (module) => [
  {
    title: "Step 1 · Approval Configuration (sabse upar)",
    items: [
      { name: "Name", what: "Flow ka naam, jo list mein dikhega. Aisa rakho ki dekh ke samajh aaye kis ke liye hai.", eg: module === "order" ? "Order — 5 lakh se upar" : module === "comparison" ? "CS Approval" : "PR Approval — B47" },
      { name: "Status", what: "Active rakho. Inactive flow kabhi use nahi hota (band karna ho to Inactive kar do, delete ki zarurat nahi)." },
      { name: "Description", what: "Optional. Apne liye note.", eg: "Director tabhi jab rakam bada ho" },
      ...(module === "order" ? [{ name: "Self Approve Below Amount (₹)", what: "Is rakam se chhota order bina kisi approval ke seedha Pending Issue mein chala jaata hai. Khaali chhodo to har order approval mein jaayega.", eg: "10,000 likha → ₹6,500 ka order apne aap approve" }] : []),
    ],
  },
  {
    title: "Step 2 · Conditions (ye flow kab lagega)",
    items: [
      { name: "Koi condition nahi", what: "Kuch mat jodo → ye flow har " + (module === "order" ? "order" : module === "comparison" ? "comparison" : "intake") + " pe lagega. Sabse simple." },
      { name: "Condition jodna", what: "\"+ Add another condition\" dabao. Teen box aate hain: FIELD (kis cheez pe — Site, Price…), OPERATOR (is equal to / greater than…), VALUE (kya value).", eg: module === "comparison" ? "Total Amount · greater than or equal · 500000" : module === "order" ? "Price · greater than · 500000" : "Site · is equal to · B-47 IAS House Noida (B47)" },
      { name: "★ All sites", what: "Site / Category / Entity ki list kholo — sabse upar ★ All … milta hai. Use chuno to har site pe lagega." },
      { name: "Ek se zyada site", what: "Site wali condition do baar jodo (Site = B47, Site = BHA). Ek hi cheez ki \"is equal to\" conditions \"YA\" ban jaati hain → B47 ya BHA dono pe lagega." },
      { name: "all conditions / any condition", what: "Jab alag-alag cheezein ho (Site aur Priority): all = dono sach honi chahiye, any = koi ek bhi chalega." },
      { name: "Rakam ki range", what: "Price/Total ki do condition = range.", eg: "greater than 100000 aur less than 500000 → 1 se 5 lakh ke beech" },
    ],
  },
  {
    title: "Step 3 · Levels — kaun approve karega",
    items: [
      { name: "Level banana", what: "\"Enter department name\" box mein department ka naam likho aur + dabao. #1 level ban jaata hai. Doosra level chahiye (pehle wale ke baad koi aur bhi approve kare) to phir naam likh ke + dabao → #2.", eg: "#1 Procurement, #2 Management" },
      { name: "Designation jodna", what: "Level ke andar \"Select a designation\" se designation chuno aur + dabao. Ek level mein ek se zyada designation jod sakte ho.", eg: "Vice President, Purchase Head" },
      { name: "Employees tick karna (sabse zaroori)", what: "Har designation ke neeche us designation ke log dikhte hain. Jo approve karega uske aage ✓ tick karo. Jisko tick kiya wahi approve kar payega — bina tick ki designation kuch nahi karti.", eg: "Data analyst → ✓ Test User" },
      { name: "Required · All users required · All designations required", what: "Ye toggle batate hain ki level pura kab maana jaaye (sab ko approve karna hai ya ek kaafi).", note: NOT_APPLIED },
      { name: "Time Limit", what: "Approver ko kitna time.", note: "Abhi lagu nahi — time khatam hone pe na reminder jaata hai na escalation." },
    ],
  },
  {
    title: "Step 4 · Save",
    items: [
      { name: "Create / Update", what: "Upar right mein button dabao. Flow list mein aa jaayega, Active ke saath." },
      { name: "Kai flow ho to order", what: "List mein upar wala pehle check hota hai — jiski condition pehle match ho wahi lagta hai. Specific flow (jaise 5 lakh se upar) upar rakho, general (bina condition) neeche. ⋮⋮ pakad ke upar-neeche karo." },
    ],
  },
];

const AFTER = {
  order: {
    title: "Bharne ke baad — order ka kya hota hai",
    lines: [
      "Order pe \"Send for Approval\" → upar se pehla matching Order flow lagta hai.",
      "Koi flow match nahi → order seedha Pending Issue (koi approval nahi).",
      "Self-approve rakam se kam → apne aap approve → Pending Issue.",
      "Warna Level #1 ke tick kiye log ko Inbox mein dikhta hai → approve → Level #2 … → aakhri level ke baad Pending Issue.",
      "Send back → order Review mein, banane wala badal ke dobara bhejta hai. Reject → order band.",
    ],
  },
  intake: {
    title: "Bharne ke baad — intake ka kya hota hai",
    lines: [
      "① PR flow: intake approve karne ke liye.",
      "⚠ Abhi PR flow juda nahi hai — intake Inbox se wo koi bhi approve kar deta hai jiske paas Intake ki \"take action\" permission hai.",
      "② CS flow: intake ke Quotations tab mein comparison karke \"Send for Approval\" → upar se pehla matching Comparison flow lagta hai.",
      "CS ke liye flow zaroori hai — koi active flow nahi to comparison bheja hi nahi ja sakta.",
      "Level #1 ke tick kiye log ko Inbox › Intake mein card dikhta hai → Approve → (Level #2 …) → Final.",
      "\"Minimum quotations\" (② ke andar) — itni quotation se kam ho to comparison nahi bhej sakte.",
    ],
  },
};

const EXAMPLE = {
  title: "Example — jaise aapki screen pe hai",
  lines: [
    "Name: PR Approval flow · Status: Active",
    "Conditions: Site = B-47 IAS House Noida, Site = Bootes Heights Alwar → B-47 ya Bootes Heights ke liye.",
    "Level #1 Procurement → Vice President (koi tick nahi — kuch nahi karta) + Data analyst (✓ Test User).",
    "Matlab: is flow mein sirf Test User approve karega. Vice President ko bhi approve karwana hai to uske neeche naam tick karo.",
    "Do log ek ke baad ek chahiye (pehle Test User, phir VP)? To VP ko alag level #2 mein daalo.",
  ],
};

export const GUIDES = {
  overview: {
    title: "Approval Flow kaise banaye",
    intro: "Approval Flow = kaun approve karega aur kab. Order, Intake (PR) aur Comparison (CS) — har ek ke apne flow. Neeche form ko upar se neeche bharne ka tareeka hai.",
    sections: FORM_STEPS("order").map(s => ({ ...s, items: s.items.filter(i => !i.name.startsWith("Self Approve")) })),
    example: EXAMPLE,
    tips: [
      "Order tab mein Order ke flow, Intake tab mein ① PR aur ② CS dono.",
      "Approver ko Inbox mein tabhi dikhega jab uske paas us module ki View permission ho (User Management).",
      "Global Admin kisi bhi level pe approve kar sakta hai.",
    ],
  },
  order: {
    title: "Order ka approval flow kaise bharein",
    intro: "Order tab → \"+ Add Flow\" (ya ✏️ purane flow pe). Form ko upar se neeche aise bharo:",
    sections: FORM_STEPS("order"),
    example: AFTER.order,
    tips: [
      "Order ki conditions: Price (order total), Category, Billing Entity (hamari company), Site.",
      "Approval ki email agle level ke logon ko jaati hai.",
    ],
  },
  intake: {
    title: "Intake ka approval flow kaise bharein",
    intro: "Intake tab mein do hisse: ① Intake Approval (PR) — maal chahiye ya nahi; ② Comparison Approval (CS) — vendor aur rate theek hai ya nahi. Jis hisse ka flow chahiye uske \"+ Add Flow\" se form kholo aur aise bharo:",
    sections: FORM_STEPS("comparison").map(s => s.title.startsWith("Step 2") ? {
      ...s,
      items: [...s.items, { name: "Kaunsi conditions milti hain", what: "① PR: Priority, Intake Type, Category, Site, Raised Qty.  ② CS: Total Amount (chuna hua total, GST + charges ke saath), Site, Priority." }],
    } : s),
    example: AFTER.intake,
    tips: [
      "CS ke liye rakam ke hisaab se do flow: upar \"Total Amount ≥ 500000 → Purchase Head, phir Director (#2)\", neeche \"bina condition → Purchase Head\".",
      "Comparison bhejne ke baad quotations lock ho jaati hain — badalna ho to Withdraw karo.",
    ],
  },
};

// the guide inside the form, for the module being edited (order / intake / comparison)
export const formGuide = (module) => ({
  title: "Ye form kaise bharein",
  intro: "Upar se neeche — 4 step:",
  sections: FORM_STEPS(module),
  example: module === "order" ? AFTER.order : module === "comparison" || module === "intake" ? AFTER.intake : EXAMPLE,
  tips: [
    "Har level mein kam se kam ek aadmi tick hona chahiye, warna us level ko koi approve nahi kar payega (Global Admin ke alawa).",
  ],
});
