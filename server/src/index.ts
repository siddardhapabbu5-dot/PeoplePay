import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireAuth } from "./middleware/auth.js";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { attendanceRouter } from "./routes/attendance.js";
import { leavesRouter } from "./routes/leaves.js";
import { salaryRouter } from "./routes/salary.js";
import { payrollRouter } from "./routes/payroll.js";
import { payslipsRouter } from "./routes/payslips.js";
import { expensesRouter, loansRouter } from "./routes/finance.js";
import { approvalsRouter, dashboardRouter, reportsRouter, settingsRouter } from "./routes/misc.js";
import { mobileRouter } from "./routes/mobile.js";
import { locationsRouter } from "./routes/locations.js";

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "8mb" }));

app.get("/api/health", (_req, res) => res.json({ ok: true, name: "PeoplePay" }));
app.use("/api/auth", authRouter);
app.use("/api/employees", requireAuth, employeesRouter);
app.use("/api/attendance", requireAuth, attendanceRouter);
app.use("/api/leaves", requireAuth, leavesRouter);
app.use("/api/salary", requireAuth, salaryRouter);
app.use("/api/salary-structures", requireAuth, salaryRouter);
app.use("/api/payroll", requireAuth, payrollRouter);
app.use("/api/payslips", requireAuth, payslipsRouter);
app.use("/api/expenses", requireAuth, expensesRouter);
app.use("/api/loans", requireAuth, loansRouter);
app.use("/api/approvals", requireAuth, approvalsRouter);
app.use("/api/dashboard", requireAuth, dashboardRouter);
app.use("/api/reports", requireAuth, reportsRouter);
app.use("/api/settings", requireAuth, settingsRouter);
app.use("/api", mobileRouter);
app.use("/api/admin", requireAuth, locationsRouter);
app.post("/api/auth/logout", requireAuth, (_req, res) => res.json({ ok: true }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDist = path.resolve(__dirname, "../../client/dist");
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (_req, res, next) => {
  res.sendFile(path.join(clientDist, "index.html"), (err) => (err ? next() : undefined));
});

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error" });
});

const port = Number(process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`PeoplePay API running on http://localhost:${port}`);
});
