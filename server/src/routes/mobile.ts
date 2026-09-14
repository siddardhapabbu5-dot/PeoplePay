import { Router } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRoles } from "../middleware/auth.js";
import { distancePreview } from "../services/punch.js";
import { endBreak, punchIn, punchOut, startBreak, todayBundle } from "../services/punch.js";
import { writeAudit } from "../lib/audit.js";

export const mobileRouter = Router();

const selfieDir = path.resolve(process.cwd(), "uploads", "selfies");
fs.mkdirSync(selfieDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, selfieDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`),
  }),
  limits: { fileSize: 6 * 1024 * 1024 },
});

function employeeId(req: { user?: { employeeId?: string; role: string } }, bodyId?: string) {
  if (req.user?.role === "EMPLOYEE") return req.user.employeeId;
  return bodyId || req.user?.employeeId;
}

mobileRouter.get("/employee/profile", requireAuth, async (req, res) => {
  const id = employeeId(req);
  if (!id) return res.status(400).json({ error: "Employee profile not linked" });
  try {
    res.json(await todayBundle(id));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

mobileRouter.get("/employee/home-location", requireAuth, async (req, res) => {
  const id = employeeId(req);
  if (!id) return res.status(400).json({ error: "Employee required" });
  const home = await prisma.employeeHomeLocation.findUnique({ where: { employeeId: id } });
  res.json(home);
});

mobileRouter.get("/employee/sites", requireAuth, async (req, res) => {
  const id = employeeId(req);
  if (!id) return res.status(400).json({ error: "Employee required" });
  const rows = await prisma.employeeSiteAssignment.findMany({
    where: { employeeId: id, status: "ACTIVE" },
    include: { site: true },
  });
  res.json(rows.map((r) => r.site));
});

mobileRouter.get("/attendance/today", requireAuth, async (req, res) => {
  const id = employeeId(req);
  if (!id) return res.status(400).json({ error: "Employee required" });
  res.json(await todayBundle(id));
});

mobileRouter.get("/attendance/monthly", requireAuth, async (req, res) => {
  const id = employeeId(req, String(req.query.employeeId ?? ""));
  if (!id) return res.status(400).json({ error: "Employee required" });
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId !== id) {
    return res.status(403).json({ error: "You can only view your attendance" });
  }
  const year = Number(req.query.year ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const rows = await prisma.attendance.findMany({
    where: { employeeId: id, date: { gte: start, lte: end } },
    include: { punches: true, breaks: true },
    orderBy: { date: "asc" },
  });
  res.json({ year, month, rows });
});

mobileRouter.get("/attendance/date/:date", requireAuth, async (req, res) => {
  const id = employeeId(req);
  if (!id) return res.status(400).json({ error: "Employee required" });
  const date = new Date(req.params.date);
  const row = await prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId: id, date } },
    include: { punches: { include: { site: true } }, breaks: true, employee: true },
  });
  res.json(row);
});

const punchSchema = z.object({
  latitude: z.number(),
  longitude: z.number(),
  gpsAccuracy: z.number().optional(),
  address: z.string().optional(),
  deviceId: z.string().optional(),
  siteId: z.string().optional(),
  mockGps: z.boolean().optional(),
  channel: z.enum(["WEB", "MOBILE"]).optional(),
});

mobileRouter.post("/attendance/validate-location", requireAuth, async (req, res) => {
  const parsed = punchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const id = employeeId(req);
  if (!id) return res.status(400).json({ error: "Employee required" });
  const type = String(req.query.type ?? "IN");
  const home = await prisma.employeeHomeLocation.findUnique({ where: { employeeId: id } });
  const sites = await prisma.employeeSiteAssignment.findMany({
    where: { employeeId: id, status: "ACTIVE" },
    include: { site: true },
  });
  if (type === "IN") {
    if (!home) return res.status(400).json({ error: "Home location is not configured." });
    return res.json({
      type: "HOME",
      target: home,
      ...distancePreview(parsed.data.latitude, parsed.data.longitude, home.latitude, home.longitude, home.allowedRadius),
    });
  }
  const scored = sites.map((s) => ({
    site: s.site,
    ...distancePreview(parsed.data.latitude, parsed.data.longitude, s.site.latitude, s.site.longitude, s.site.allowedRadius),
  }));
  const best = scored.sort((a, b) => a.distance - b.distance)[0];
  if (!best) return res.status(400).json({ error: "No site assigned." });
  res.json({ type: "SITE", target: best.site, ...best });
});

mobileRouter.post("/attendance/selfie", requireAuth, upload.single("selfie"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Camera selfie is required" });
  res.json({ selfiePath: `selfies/${req.file.filename}` });
});

mobileRouter.get("/attendance/photo/:file", requireAuth, async (req, res) => {
  const file = path.basename(req.params.file);
  const full = path.join(selfieDir, file);
  if (!fs.existsSync(full)) return res.status(404).json({ error: "Photo not found" });
  res.sendFile(full);
});

mobileRouter.post("/attendance/punch-in", requireAuth, async (req, res) => {
  const parsed = punchSchema.extend({ selfiePath: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const id = employeeId(req);
  if (!id) return res.status(400).json({ error: "Employee required" });
  try {
    const result = await punchIn({
      ...parsed.data,
      employeeId: id,
      ipAddress: req.ip,
    });
    res.json({ message: "PUNCH IN SUCCESSFUL", ...result });
  } catch (e: any) {
    res.status(400).json({
      error: e.message,
      code: e.code,
      current: e.current,
      home: e.home,
      distance: e.distance,
      allowedRadius: e.allowedRadius,
    });
  }
});

mobileRouter.post("/attendance/punch-out", requireAuth, async (req, res) => {
  const parsed = punchSchema.extend({ selfiePath: z.string().optional() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const id = employeeId(req);
  if (!id) return res.status(400).json({ error: "Employee required" });
  try {
    const result = await punchOut({ ...parsed.data, employeeId: id, ipAddress: req.ip });
    res.json({ message: "PUNCH OUT SUCCESSFUL", ...result });
  } catch (e: any) {
    res.status(400).json({
      error: e.message,
      code: e.code,
      current: e.current,
      site: e.site,
      distance: e.distance,
      allowedRadius: e.allowedRadius,
    });
  }
});

mobileRouter.post("/attendance/break-start", requireAuth, async (req, res) => {
  const id = employeeId(req);
  if (!id) return res.status(400).json({ error: "Employee required" });
  try {
    res.json(await startBreak(id));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

mobileRouter.post("/attendance/break-end", requireAuth, async (req, res) => {
  const id = employeeId(req);
  if (!id) return res.status(400).json({ error: "Employee required" });
  try {
    res.json(await endBreak(id));
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Failed" });
  }
});

mobileRouter.post("/attendance/regularization", requireAuth, async (req, res) => {
  const parsed = z.object({
    date: z.string(),
    punchIn: z.string().optional(),
    punchOut: z.string().optional(),
    reason: z.string().min(3),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const employeeIdValue = employeeId(req);
  if (!employeeIdValue) return res.status(400).json({ error: "Employee required" });
  const rec = await prisma.attendanceRegularization.create({
    data: {
      employeeId: employeeIdValue,
      date: new Date(parsed.data.date),
      punchIn: parsed.data.punchIn,
      punchOut: parsed.data.punchOut,
      reason: parsed.data.reason,
    },
  });
  await prisma.approval.create({
    data: {
      type: "ATTENDANCE_REGULARIZATION",
      referenceId: rec.id,
      employeeId: employeeIdValue,
      title: "Missing punch regularization",
      amountOrDays: parsed.data.date,
    },
  });
  res.status(201).json(rec);
});

mobileRouter.get("/attendance/regularization", requireAuth, async (req, res) => {
  const id = employeeId(req);
  const where = req.user!.role === "EMPLOYEE" && id ? { employeeId: id } : {};
  res.json(await prisma.attendanceRegularization.findMany({
    where,
    include: { employee: true },
    orderBy: { createdAt: "desc" },
  }));
});

mobileRouter.get("/admin/attendance", requireAuth, requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "MANAGER"), async (req, res) => {
  const date = req.query.date ? new Date(String(req.query.date)) : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
  const rows = await prisma.attendance.findMany({
    where: { date },
    include: {
      employee: { include: { department: true, homeLocation: true, siteAssignments: { include: { site: true } } } },
      punches: { include: { site: true } },
    },
  });
  const employees = await prisma.employee.count({ where: { status: "ACTIVE" } });
  res.json({
    date,
    cards: {
      totalEmployees: employees,
      present: rows.filter((r) => ["PRESENT", "LATE", "WORK_FROM_HOME"].includes(r.status)).length,
      absent: rows.filter((r) => r.status === "ABSENT").length,
      leave: rows.filter((r) => ["LEAVE", "PAID_LEAVE", "UNPAID_LEAVE"].includes(r.status)).length,
      late: rows.filter((r) => r.lateMin > 0 || r.status === "LATE").length,
      missingPunch: rows.filter((r) => r.punchIn && !r.punchOut).length,
      overtime: rows.filter((r) => r.overtimeMin > 0).length,
    },
    rows,
  });
});

mobileRouter.get("/payroll/attendance-summary", requireAuth, requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "FINANCE"), async (req, res) => {
  const year = Number(req.query.year ?? 2026);
  const month = Number(req.query.month ?? new Date().getMonth() + 1);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const employees = await prisma.employee.findMany({
    where: { status: "ACTIVE" },
    include: { attendance: { where: { date: { gte: start, lte: end } } } },
  });
  const summary = employees.map((e) => {
    const a = e.attendance;
    return {
      employeeId: e.employeeCode,
      name: `${e.firstName} ${e.lastName}`,
      workingDays: end.getUTCDate(),
      present: a.filter((x) => ["PRESENT", "LATE"].includes(x.status)).length,
      paidLeave: a.filter((x) => x.status === "LEAVE" || x.status === "PAID_LEAVE").length,
      unpaidLeave: a.filter((x) => x.status === "UNPAID_LEAVE").length,
      absent: a.filter((x) => x.status === "ABSENT").length,
      halfDay: a.filter((x) => x.status === "HALF_DAY").length,
      lop: a.filter((x) => x.status === "ABSENT" || x.status === "UNPAID_LEAVE").length,
      otHours: Math.round(a.reduce((s, x) => s + x.overtimeMin, 0) / 60),
      lateMinutes: a.reduce((s, x) => s + x.lateMin, 0),
    };
  });
  res.json({ year, month, summary });
});

mobileRouter.post("/payroll/sync-attendance", requireAuth, requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN"), async (_req, res) => {
  await writeAudit(_req.user!.id, "PAYROLL_SYNC_ATTENDANCE", "Payroll", undefined, "Attendance imported into payroll period");
  res.json({ ok: true, message: "Attendance imported. Run payroll to calculate LOP and overtime." });
});
