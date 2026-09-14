import { Router } from "express";
import { z } from "zod";
import * as XLSX from "xlsx";
import multer from "multer";
import { AttendanceStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { DEFAULT_SHIFT, evaluateDay } from "../lib/attendance-policy.js";
import { monthDays, toNum } from "../lib/money.js";
import { requireRoles } from "../middleware/auth.js";
import { streamWorkbook } from "../lib/excel.js";
import { writeAudit } from "../lib/audit.js";

export const attendanceRouter = Router();
const upload = multer({ storage: multer.memoryStorage() });

attendanceRouter.get("/", async (req, res) => {
  const from = req.query.from ? new Date(String(req.query.from)) : undefined;
  const to = req.query.to ? new Date(String(req.query.to)) : undefined;
  const employeeId = String(req.query.employeeId ?? "");
  const where: Record<string, unknown> = {};
  if (from && to) where.date = { gte: from, lte: to };
  if (employeeId) where.employeeId = employeeId;
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId) where.employeeId = req.user!.employeeId;
  if (req.user!.role === "MANAGER" && req.user!.employeeId && !employeeId) {
    const team = await prisma.employee.findMany({
      where: { OR: [{ id: req.user!.employeeId }, { managerId: req.user!.employeeId }] },
      select: { id: true },
    });
    where.employeeId = { in: team.map((t) => t.id) };
  }
  const rows = await prisma.attendance.findMany({
    where,
    include: { employee: { include: { department: true, shift: true } } },
    orderBy: [{ date: "desc" }, { employee: { firstName: "asc" } }],
    take: 2000,
  });
  res.json(rows);
});

attendanceRouter.get("/monthly", async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const where: Record<string, unknown> = { date: { gte: start, lte: end } };
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId) where.employeeId = req.user!.employeeId;
  const rows = await prisma.attendance.findMany({
    where,
    include: { employee: true },
  });
  res.json({ year, month, days: monthDays(year, month), rows });
});

attendanceRouter.post("/", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "MANAGER"), async (req, res) => {
  const parsed = z.object({
    employeeId: z.string(),
    date: z.string(),
    punchIn: z.string().optional(),
    punchOut: z.string().optional(),
    status: z.nativeEnum(AttendanceStatus).optional(),
    source: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const emp = await prisma.employee.findUnique({
    where: { id: parsed.data.employeeId },
    include: { shift: true, salaries: { where: { status: "ACTIVE" }, orderBy: { effectiveFrom: "desc" }, take: 1 } },
  });
  if (!emp) return res.status(404).json({ error: "Employee not found" });
  const date = new Date(parsed.data.date);
  const dim = monthDays(date.getUTCFullYear(), date.getUTCMonth() + 1);
  const monthly = emp.salaries[0] ? toNum(emp.salaries[0].ctcMonthly) : 0;
  const calc = evaluateDay(
    { date, punchIn: parsed.data.punchIn, punchOut: parsed.data.punchOut, forcedStatus: parsed.data.status },
    monthly,
    dim,
    emp.shift ?? DEFAULT_SHIFT,
  );
  const row = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId: emp.id, date } },
    update: {
      punchIn: calc.punchIn,
      punchOut: calc.punchOut,
      workingHours: calc.workingHours,
      overtimeMin: calc.overtimeMin,
      lateMin: calc.lateMin,
      lateDeduction: calc.lateDeduction,
      otAmount: calc.otAmount,
      status: calc.status,
      source: parsed.data.source ?? "MANUAL",
    },
    create: {
      employeeId: emp.id,
      date,
      punchIn: calc.punchIn,
      punchOut: calc.punchOut,
      workingHours: calc.workingHours,
      overtimeMin: calc.overtimeMin,
      lateMin: calc.lateMin,
      lateDeduction: calc.lateDeduction,
      otAmount: calc.otAmount,
      status: calc.status,
      source: parsed.data.source ?? "MANUAL",
    },
  });
  res.status(201).json(row);
});

attendanceRouter.put("/:id", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN"), async (req, res) => {
  const parsed = z.object({
    punchIn: z.string().optional(),
    punchOut: z.string().optional(),
    status: z.nativeEnum(AttendanceStatus).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const updated = await prisma.attendance.update({ where: { id: req.params.id }, data: parsed.data });
  res.json(updated);
});

attendanceRouter.post("/regularize", async (req, res) => {
  const parsed = z.object({
    employeeId: z.string().optional(),
    date: z.string(),
    punchIn: z.string().optional(),
    punchOut: z.string().optional(),
    reason: z.string().min(3),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const employeeId = parsed.data.employeeId ?? req.user!.employeeId;
  if (!employeeId) return res.status(400).json({ error: "Employee required" });
  const rec = await prisma.attendanceRegularization.create({
    data: {
      employeeId,
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
      employeeId,
      title: "Attendance regularization",
      amountOrDays: parsed.data.date,
    },
  });
  res.status(201).json(rec);
});

attendanceRouter.post("/import", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN"), upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "CSV or Excel file required" });
  const wb = XLSX.read(req.file.buffer, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet);
  let imported = 0;
  for (const row of rows) {
    const code = String(row.employeeCode ?? row["Employee ID"] ?? row.Employee ?? "").trim();
    if (!code) continue;
    const emp = await prisma.employee.findUnique({
      where: { employeeCode: code },
      include: { shift: true, salaries: { where: { status: "ACTIVE" }, take: 1, orderBy: { effectiveFrom: "desc" } } },
    });
    if (!emp) continue;
    const date = new Date(row.date ?? row.Date);
    if (Number.isNaN(date.getTime())) continue;
    const punchIn = String(row.punchIn ?? row["Punch In"] ?? row.In ?? "");
    const punchOut = String(row.punchOut ?? row["Punch Out"] ?? row.Out ?? "");
    const dim = monthDays(date.getUTCFullYear(), date.getUTCMonth() + 1);
    const monthly = emp.salaries[0] ? toNum(emp.salaries[0].ctcMonthly) : 0;
    const calc = evaluateDay({ date, punchIn, punchOut }, monthly, dim, emp.shift ?? DEFAULT_SHIFT);
    await prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: emp.id, date } },
      update: {
        punchIn: calc.punchIn,
        punchOut: calc.punchOut,
        workingHours: calc.workingHours,
        overtimeMin: calc.overtimeMin,
        lateMin: calc.lateMin,
        lateDeduction: calc.lateDeduction,
        otAmount: calc.otAmount,
        status: calc.status,
        source: "BIOMETRIC_IMPORT",
      },
      create: {
        employeeId: emp.id,
        date,
        punchIn: calc.punchIn,
        punchOut: calc.punchOut,
        workingHours: calc.workingHours,
        overtimeMin: calc.overtimeMin,
        lateMin: calc.lateMin,
        lateDeduction: calc.lateDeduction,
        otAmount: calc.otAmount,
        status: calc.status,
        source: "BIOMETRIC_IMPORT",
      },
    });
    imported += 1;
  }
  await writeAudit(req.user!.id, "ATTENDANCE_IMPORT", "Attendance", undefined, `${imported} rows`);
  res.json({ imported });
});

attendanceRouter.get("/export", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "FINANCE"), async (req, res) => {
  const year = Number(req.query.year ?? new Date().getFullYear());
  const month = Number(req.query.month ?? new Date().getMonth() + 1);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const rows = await prisma.attendance.findMany({
    where: { date: { gte: start, lte: end } },
    include: { employee: true },
    orderBy: [{ employee: { employeeCode: "asc" } }, { date: "asc" }],
  });
  await streamWorkbook(res, `attendance-${year}-${month}.xlsx`, [{
    name: "Attendance",
    headers: ["Employee ID", "Name", "Date", "Punch In", "Punch Out", "Hours", "OT Min", "Late Min", "Status"],
    rows: rows.map((r) => [
      r.employee.employeeCode,
      `${r.employee.firstName} ${r.employee.lastName}`,
      r.date.toISOString().slice(0, 10),
      r.punchIn ?? "",
      r.punchOut ?? "",
      Number(r.workingHours),
      r.overtimeMin,
      r.lateMin,
      r.status,
    ]),
  }]);
});
