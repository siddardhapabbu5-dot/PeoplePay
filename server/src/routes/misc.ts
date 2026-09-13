import { Router } from "express";
import { z } from "zod";
import { AttendanceStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { requireRoles, canSeeSalary } from "../middleware/auth.js";
import { streamWorkbook } from "../lib/excel.js";
import { streamTablePdf } from "../lib/pdf.js";
import { toNum } from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";

export const dashboardRouter = Router();
export const approvalsRouter = Router();
export const reportsRouter = Router();
export const settingsRouter = Router();

dashboardRouter.get("/", async (req, res) => {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));

  const [
    totalEmployees,
    activeEmployees,
    presentToday,
    absentToday,
    onLeave,
    latestPayroll,
    pendingApprovals,
    recentLogs,
    employees,
  ] = await Promise.all([
    prisma.employee.count(),
    prisma.employee.count({ where: { status: "ACTIVE" } }),
    prisma.attendance.count({ where: { date: start, status: { in: [AttendanceStatus.PRESENT, AttendanceStatus.WORK_FROM_HOME] } } }),
    prisma.attendance.count({ where: { date: start, status: AttendanceStatus.ABSENT } }),
    prisma.attendance.count({ where: { date: start, status: AttendanceStatus.LEAVE } }),
    prisma.payroll.findFirst({ orderBy: [{ year: "desc" }, { month: "desc" }] }),
    prisma.approval.count({ where: { status: "PENDING" } }),
    prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8, include: { user: true } }),
    prisma.employee.findMany({
      where: { status: "ACTIVE" },
      include: { department: true, salaries: { where: { status: "ACTIVE" }, take: 1 } },
    }),
  ]);

  const deptMap = new Map<string, number>();
  for (const e of employees) {
    const name = e.department?.name ?? "Unassigned";
    const ctc = e.salaries[0] ? toNum(e.salaries[0].ctcMonthly) : 0;
    deptMap.set(name, (deptMap.get(name) ?? 0) + ctc);
  }

  const payrolls = await prisma.payroll.findMany({
    orderBy: [{ year: "asc" }, { month: "asc" }],
    take: 12,
  });

  const leaveTrend = await prisma.leaveRequest.groupBy({
    by: ["status"],
    where: { createdAt: { gte: new Date(Date.UTC(today.getUTCFullYear(), 0, 1)) } },
    _count: true,
  });

  const attTrend = await prisma.attendance.groupBy({
    by: ["status"],
    where: { date: { gte: monthStart } },
    _count: true,
  });

  const hidePay = !canSeeSalary(req.user!.role) && req.user!.role !== "EMPLOYEE";

  res.json({
    cards: {
      totalEmployees,
      activeEmployees,
      presentToday,
      absentToday,
      onLeave,
      payrollCost: hidePay ? null : toNum(latestPayroll?.totalGross),
      netSalary: hidePay ? null : toNum(latestPayroll?.totalNet),
      pendingApprovals,
    },
    charts: {
      monthlyPayroll: payrolls.map((p) => ({
        label: `${p.month}/${p.year}`,
        gross: hidePay ? 0 : toNum(p.totalGross),
        net: hidePay ? 0 : toNum(p.totalNet),
      })),
      departmentSalary: [...deptMap.entries()].map(([name, value]) => ({ name, value: hidePay ? 0 : value })),
      headcount: [{ name: "Active", value: activeEmployees }, { name: "Inactive", value: totalEmployees - activeEmployees }],
      attendance: attTrend.map((a) => ({ name: a.status, value: a._count })),
      leave: leaveTrend.map((l) => ({ name: l.status, value: l._count })),
    },
    activity: recentLogs.map((l) => ({
      id: l.id,
      action: l.action,
      entity: l.entity,
      at: l.createdAt,
      user: l.user?.email,
      details: l.details,
    })),
  });
});

approvalsRouter.get("/", async (req, res) => {
  const status = String(req.query.status ?? "PENDING");
  const rows = await prisma.approval.findMany({
    where: { status: status as never },
    orderBy: { submittedAt: "desc" },
  });
  res.json(rows);
});

approvalsRouter.post("/:id/decide", requireRoles("SUPER_ADMIN", "HR_ADMIN", "MANAGER", "FINANCE", "PAYROLL_ADMIN"), async (req, res) => {
  const parsed = z.object({
    status: z.enum(["APPROVED", "REJECTED"]),
    comment: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const approval = await prisma.approval.update({
    where: { id: req.params.id },
    data: {
      status: parsed.data.status,
      comment: parsed.data.comment,
      approverId: req.user!.id,
      decidedAt: new Date(),
    },
  });
  if (approval.type === "LEAVE") {
    await prisma.leaveRequest.update({ where: { id: approval.referenceId }, data: { status: parsed.data.status } }).catch(() => null);
  }
  if (approval.type === "EXPENSE") {
    await prisma.expense.update({ where: { id: approval.referenceId }, data: { status: parsed.data.status } }).catch(() => null);
  }
  if (approval.type === "LOAN") {
    await prisma.loan.update({ where: { id: approval.referenceId }, data: { status: parsed.data.status } }).catch(() => null);
  }
  if (approval.type === "ATTENDANCE_REGULARIZATION" && parsed.data.status === "APPROVED") {
    const reg = await prisma.attendanceRegularization.findUnique({ where: { id: approval.referenceId } });
    if (reg) {
      await prisma.attendanceRegularization.update({ where: { id: reg.id }, data: { status: "APPROVED" } });
    }
  }
  await writeAudit(req.user!.id, "APPROVAL_DECIDE", "Approval", approval.id, parsed.data.status);
  res.json(approval);
});

reportsRouter.get("/payroll", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN", "FINANCE", "HR_ADMIN"), async (req, res) => {
  const year = Number(req.query.year ?? 2026);
  const month = Number(req.query.month ?? 7);
  const format = String(req.query.format ?? "json");
  const payroll = await prisma.payroll.findFirst({
    where: { year, month },
    include: { lines: { include: { employee: { include: { department: true, location: true, designation: true, bankAccount: true } } } } },
  });
  if (!payroll) return res.status(404).json({ error: "No payroll for period" });
  const headers = ["Employee ID", "Name", "Department", "Location", "Gross", "Deductions", "Net"];
  const rows = payroll.lines.map((l) => [
    l.employee.employeeCode,
    `${l.employee.firstName} ${l.employee.lastName}`,
    l.employee.department?.name ?? "",
    l.employee.location?.name ?? "",
    toNum(l.grossEarnings),
    toNum(l.totalDeductions),
    toNum(l.netSalary),
  ]);
  if (format === "xlsx") {
    return streamWorkbook(res, `payroll-report-${year}-${month}.xlsx`, [{ name: "Payroll", headers, rows }]);
  }
  if (format === "pdf") {
    return streamTablePdf(res, `Payroll Register ${month}/${year}`, headers, rows, `payroll-report-${year}-${month}.pdf`);
  }
  res.json({ payroll, rows });
});

reportsRouter.get("/attendance", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "MANAGER"), async (req, res) => {
  const year = Number(req.query.year ?? 2026);
  const month = Number(req.query.month ?? 7);
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0));
  const rows = await prisma.attendance.findMany({
    where: { date: { gte: start, lte: end } },
    include: { employee: { include: { department: true } } },
  });
  const format = String(req.query.format ?? "json");
  const headers = ["Employee ID", "Name", "Date", "In", "Out", "Status"];
  const data = rows.map((r) => [
    r.employee.employeeCode,
    `${r.employee.firstName} ${r.employee.lastName}`,
    r.date.toISOString().slice(0, 10),
    r.punchIn ?? "",
    r.punchOut ?? "",
    r.status,
  ]);
  if (format === "xlsx") return streamWorkbook(res, `attendance-${year}-${month}.xlsx`, [{ name: "Attendance", headers, rows: data }]);
  if (format === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.send([headers.join(","), ...data.map((r) => r.join(","))].join("\n"));
    return;
  }
  res.json(rows);
});

settingsRouter.get("/", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN"), async (_req, res) => {
  const [company, departments, designations, locations, shifts, holidays, rules, users, groups, entities] = await Promise.all([
    prisma.company.findFirst(),
    prisma.department.findMany(),
    prisma.designation.findMany(),
    prisma.location.findMany(),
    prisma.shift.findMany(),
    prisma.holiday.findMany({ orderBy: { date: "asc" } }),
    prisma.statutoryRule.findMany({ orderBy: { code: "asc" } }),
    prisma.user.findMany({ select: { id: true, email: true, role: true, status: true } }),
    prisma.payrollGroup.findMany({ include: { entity: true } }),
    prisma.entity.findMany(),
  ]);
  res.json({ company, departments, designations, locations, shifts, holidays, rules, users, groups, entities });
});

settingsRouter.put("/company", requireRoles("SUPER_ADMIN"), async (req, res) => {
  const company = await prisma.company.findFirst();
  if (!company) return res.status(404).json({ error: "Company missing" });
  const updated = await prisma.company.update({ where: { id: company.id }, data: req.body });
  res.json(updated);
});

settingsRouter.post("/masters/:kind", requireRoles("SUPER_ADMIN", "HR_ADMIN"), async (req, res) => {
  const kind = req.params.kind;
  if (kind === "departments") return res.json(await prisma.department.create({ data: { name: req.body.name } }));
  if (kind === "designations") return res.json(await prisma.designation.create({ data: { name: req.body.name } }));
  if (kind === "locations") return res.json(await prisma.location.create({ data: { name: req.body.name, city: req.body.city, state: req.body.state } }));
  if (kind === "holidays") return res.json(await prisma.holiday.create({ data: { name: req.body.name, date: new Date(req.body.date), year: new Date(req.body.date).getUTCFullYear() } }));
  return res.status(400).json({ error: "Unknown master" });
});

settingsRouter.put("/rules/:id", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN"), async (req, res) => {
  const updated = await prisma.statutoryRule.update({ where: { id: req.params.id }, data: req.body });
  await writeAudit(req.user!.id, "STATUTORY_RULE_UPDATE", "StatutoryRule", updated.id);
  res.json(updated);
});

settingsRouter.get("/audit", requireRoles("SUPER_ADMIN"), async (_req, res) => {
  res.json(await prisma.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 200, include: { user: true } }));
});
