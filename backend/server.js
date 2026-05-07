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
const approvalsRoutes     = require("./src/routes/approvals");
const amendmentsRoutes    = require("./src/routes/amendments");
const designationsRoutes   = require("./src/routes/designations");
const actionRequestRoutes  = require("./src/routes/actionRequests");

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
app.use("/api/approvals",   approvalsRoutes);
app.use("/api/amendments",  amendmentsRoutes);
app.use("/api/designations",    designationsRoutes);
app.use("/api/action-requests", actionRequestRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅ Backend on port ${PORT}`);
  console.log(`🔗 Connected to: ${process.env.SUPABASE_URL}`);
});

process.on("SIGTERM", () => process.exit(0));
