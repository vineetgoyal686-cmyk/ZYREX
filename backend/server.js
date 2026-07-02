// server.js
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, ".env.local"), override: true });
require("dotenv").config({ path: path.join(__dirname, ".env") });

const express = require("express");

const attendanceRoutes    = require("./src/routes/attendance");
const viewRoutes          = require("./src/routes/view");
const procurementRoutes   = require("./src/routes/procurement");
const authRoutes          = require("./src/routes/auth");
const usersRoutes         = require("./src/routes/users");
const projectsRoutes      = require("./src/routes/projects");
const intakesRoutes       = require("./src/routes/intakes");
const purchaseOrderRoutes = require("./src/routes/purchaseOrders");
const amendmentsRoutes    = require("./src/routes/amendments");
const designationsRoutes   = require("./src/routes/designations");
const departmentsRoutes    = require("./src/routes/departments");
const teamsRoutes          = require("./src/routes/teams");
const actionRequestRoutes  = require("./src/routes/actionRequests");
const auditLogsRoutes        = require("./src/routes/auditLogs");
const requestHandlersRoutes  = require("./src/routes/requestHandlers");
const approvalFlowsRoutes    = require("./src/routes/approvalFlows");
const delegationsRoutes      = require("./src/routes/delegations");
const sopRoutes              = require("./src/routes/sop");
const dashboardRoutes        = require("./src/routes/dashboard");
const historicalOrdersRoutes = require("./src/routes/historicalOrders");
const contactRoutes          = require("./src/routes/contact");
const organisationRoutes     = require("./src/routes/organisation");

const app = express();

// CORS
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});
app.use(express.json({ limit: "5mb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use("/api/attendance",  attendanceRoutes);
app.use("/api/view",        viewRoutes);
app.use("/api/procurement", procurementRoutes);
app.use("/api/auth",        authRoutes);
app.use("/api/users",       usersRoutes);
app.use("/api/projects",    projectsRoutes);
app.use("/api/intakes",     intakesRoutes);
app.use("/api/orders",      purchaseOrderRoutes);
app.use("/api/amendments",  amendmentsRoutes);
app.use("/api/designations",    designationsRoutes);
app.use("/api/departments",     departmentsRoutes);
app.use("/api/teams",           teamsRoutes);
app.use("/api/action-requests", actionRequestRoutes);
app.use("/api/audit-logs",        auditLogsRoutes);
app.use("/api/request-handlers",  requestHandlersRoutes);
app.use("/api/approval-flows",    approvalFlowsRoutes);
app.use("/api/delegations",       delegationsRoutes);
app.use("/api/sop",               sopRoutes);
app.use("/api/dashboard",          dashboardRoutes);
app.use("/api/historical-orders",  historicalOrdersRoutes);
app.use("/api/contact",            contactRoutes);
app.use("/api/organisation",       organisationRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend on port ${PORT}`);
  console.log(`🔗 Connected to: ${process.env.SUPABASE_URL}`);

  // Keep Supabase connection warm — runs every 4 minutes
  const supabase = require("./src/helpers/supabaseHelper");
  setInterval(async () => {
    try {
      await supabase.from("users").select("id").limit(1).single();
    } catch (_) { /* silent — just a ping */ }
  }, 4 * 60 * 1000);
});

process.on("SIGTERM", () => process.exit(0));

process.on("unhandledRejection", (reason, promise) => {
  console.error("UNHANDLED REJECTION — this crashed the server:");
  console.error("Promise:", promise);
  console.error("Reason:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION — this crashed the server:");
  console.error(err);
});
