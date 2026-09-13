import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { inclusiveDays, monthlyPaidLeaveQuota } from "../lib/leave-policy.js";
import { requireRoles } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";

export const leavesRouter = Router();

leavesRouter.get("/types", async (_req, res) => {
  res.json(await prisma.leaveType.findMany({ orderBy: { name: "asc" } }));
});

leavesRouter.get("/balances", async (req, res) => {
  const employeeId = String(req.query.employeeId ?? req.user!.employeeId ?? "");
  if (!employeeId) return res.status(400).json({ error: "Employee required" });
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId !== employeeId) {
    return res.status(403).json({ error: "You can only view your leave balance" });
  }
  const year = Number(req.query.year ?? new Date().getFullYear());
  const rows = await prisma.leaveBalance.findMany({
    where: { employeeId, year },
    include: { leaveType: true },
  });
  res.json(rows);
});

leavesRouter.get("/", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
  if (req.query.status) where.status = String(req.query.status);
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId) where.employeeId = req.user!.employeeId;
  if (req.user!.role === "MANAGER" && req.user!.employeeId) {
    const team = await prisma.employee.findMany({
      where: { OR: [{ id: req.user!.employeeId }, { managerId: req.user!.employeeId }] },
      select: { id: true },
    });
    where.employeeId = { in: team.map((t) => t.id) };
  }
  res.json(await prisma.leaveRequest.findMany({
    where,
    include: { employee: true, leaveType: true },
    orderBy: { createdAt: "desc" },
  }));
});

leavesRouter.post("/", async (req, res) => {
  const parsed = z.object({
    employeeId: z.string().optional(),
    leaveTypeId: z.string(),
    startDate: z.string(),
    endDate: z.string(),
    reason: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const employeeId = parsed.data.employeeId ?? req.user!.employeeId;
  if (!employeeId) return res.status(400).json({ error: "Employee required" });
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId !== employeeId) {
    return res.status(403).json({ error: "Employees can only apply for themselves" });
  }
  const start = new Date(parsed.data.startDate);
  const end = new Date(parsed.data.endDate);
  const days = inclusiveDays(start, end);
  const type = await prisma.leaveType.findUnique({ where: { id: parsed.data.leaveTypeId } });
  if (!type) return res.status(400).json({ error: "Invalid leave type" });

  const prevMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
  const prevEnd = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 0));
  const prevTaken = await prisma.leaveRequest.aggregate({
    where: {
      employeeId,
      status: "APPROVED",
      startDate: { gte: prevMonth, lte: prevEnd },
    },
    _sum: { days: true },
  });
  const quota = monthlyPaidLeaveQuota(Number(prevTaken._sum.days ?? 0));

  const created = await prisma.leaveRequest.create({
    data: {
      employeeId,
      leaveTypeId: type.id,
      startDate: start,
      endDate: end,
      days,
      reason: parsed.data.reason,
    },
  });
  await prisma.leaveBalance.updateMany({
    where: { employeeId, leaveTypeId: type.id, year: start.getUTCFullYear() },
    data: { pending: { increment: days } },
  });
  await prisma.approval.create({
    data: {
      type: "LEAVE",
      referenceId: created.id,
      employeeId,
      title: `${type.name} request`,
      amountOrDays: `${days} day(s)`,
    },
  });
  res.status(201).json({ ...created, monthlyPaidQuota: quota });
});

leavesRouter.put("/:id/approve", requireRoles("SUPER_ADMIN", "HR_ADMIN", "MANAGER"), async (req, res) => {
  const rec = await prisma.leaveRequest.update({
    where: { id: req.params.id },
    data: { status: "APPROVED", comment: req.body?.comment },
    include: { leaveType: true },
  });
  await prisma.leaveBalance.updateMany({
    where: { employeeId: rec.employeeId, leaveTypeId: rec.leaveTypeId, year: rec.startDate.getUTCFullYear() },
    data: { used: { increment: rec.days }, pending: { decrement: rec.days } },
  });
  await prisma.approval.updateMany({
    where: { referenceId: rec.id, type: "LEAVE" },
    data: { status: "APPROVED", approverId: req.user!.id, decidedAt: new Date(), comment: req.body?.comment },
  });
  await prisma.employeeTimeline.create({
    data: {
      employeeId: rec.employeeId,
      type: "LEAVE",
      title: `${rec.leaveType.name} approved`,
      happenedAt: rec.startDate,
    },
  });
  await writeAudit(req.user!.id, "LEAVE_APPROVE", "LeaveRequest", rec.id);
  res.json(rec);
});

leavesRouter.put("/:id/reject", requireRoles("SUPER_ADMIN", "HR_ADMIN", "MANAGER"), async (req, res) => {
  const rec = await prisma.leaveRequest.update({
    where: { id: req.params.id },
    data: { status: "REJECTED", comment: req.body?.comment },
  });
  await prisma.leaveBalance.updateMany({
    where: { employeeId: rec.employeeId, leaveTypeId: rec.leaveTypeId, year: rec.startDate.getUTCFullYear() },
    data: { pending: { decrement: rec.days } },
  });
  await prisma.approval.updateMany({
    where: { referenceId: rec.id, type: "LEAVE" },
    data: { status: "REJECTED", approverId: req.user!.id, decidedAt: new Date(), comment: req.body?.comment },
  });
  await writeAudit(req.user!.id, "LEAVE_REJECT", "LeaveRequest", rec.id);
  res.json(rec);
});

leavesRouter.put("/:id/changes", requireRoles("SUPER_ADMIN", "HR_ADMIN", "MANAGER"), async (req, res) => {
  const rec = await prisma.leaveRequest.update({
    where: { id: req.params.id },
    data: { status: "CHANGES_REQUESTED", comment: req.body?.comment },
  });
  res.json(rec);
});
