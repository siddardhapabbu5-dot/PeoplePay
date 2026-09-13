import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRoles } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";

export const expensesRouter = Router();
export const loansRouter = Router();

expensesRouter.get("/", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId) where.employeeId = req.user!.employeeId;
  else if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
  if (req.query.status) where.status = String(req.query.status);
  res.json(await prisma.expense.findMany({
    where,
    include: { employee: true, items: true },
    orderBy: { createdAt: "desc" },
  }));
});

expensesRouter.post("/", async (req, res) => {
  const parsed = z.object({
    employeeId: z.string().optional(),
    type: z.string(),
    date: z.string(),
    amount: z.number().positive(),
    description: z.string().optional(),
    project: z.string().optional(),
    submit: z.boolean().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const employeeId = parsed.data.employeeId ?? req.user!.employeeId;
  if (!employeeId) return res.status(400).json({ error: "Employee required" });
  const created = await prisma.expense.create({
    data: {
      employeeId,
      type: parsed.data.type,
      date: new Date(parsed.data.date),
      amount: parsed.data.amount,
      description: parsed.data.description,
      project: parsed.data.project,
      status: parsed.data.submit ? "SUBMITTED" : "DRAFT",
    },
  });
  if (parsed.data.submit) {
    await prisma.approval.create({
      data: {
        type: "EXPENSE",
        referenceId: created.id,
        employeeId,
        title: parsed.data.type,
        amountOrDays: `₹${parsed.data.amount}`,
      },
    });
  }
  res.status(201).json(created);
});

expensesRouter.put("/:id/submit", async (req, res) => {
  const rec = await prisma.expense.update({
    where: { id: req.params.id },
    data: { status: "SUBMITTED" },
  });
  await prisma.approval.create({
    data: {
      type: "EXPENSE",
      referenceId: rec.id,
      employeeId: rec.employeeId,
      title: rec.type,
      amountOrDays: `₹${rec.amount}`,
    },
  });
  res.json(rec);
});

expensesRouter.put("/:id/decide", requireRoles("SUPER_ADMIN", "FINANCE", "MANAGER"), async (req, res) => {
  const status = req.body?.status === "REJECTED" ? "REJECTED" : "APPROVED";
  const rec = await prisma.expense.update({ where: { id: req.params.id }, data: { status } });
  await prisma.approval.updateMany({
    where: { referenceId: rec.id, type: "EXPENSE" },
    data: { status, approverId: req.user!.id, decidedAt: new Date(), comment: req.body?.comment },
  });
  await writeAudit(req.user!.id, `EXPENSE_${status}`, "Expense", rec.id);
  res.json(rec);
});

loansRouter.get("/", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId) where.employeeId = req.user!.employeeId;
  res.json(await prisma.loan.findMany({
    where,
    include: { employee: true, repayments: true },
    orderBy: { startMonth: "desc" },
  }));
});

loansRouter.post("/", async (req, res) => {
  const parsed = z.object({
    employeeId: z.string().optional(),
    type: z.enum(["LOAN", "ADVANCE"]),
    amount: z.number().positive(),
    interest: z.number().optional(),
    tenureMonths: z.number().int().positive(),
    startMonth: z.string(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const employeeId = parsed.data.employeeId ?? req.user!.employeeId;
  if (!employeeId) return res.status(400).json({ error: "Employee required" });
  const principal = parsed.data.amount;
  const r = (parsed.data.interest ?? 0) / 100 / 12;
  const n = parsed.data.tenureMonths;
  const emi = r === 0 ? principal / n : (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  const created = await prisma.loan.create({
    data: {
      employeeId,
      type: parsed.data.type,
      amount: principal,
      interest: parsed.data.interest ?? 0,
      tenureMonths: n,
      startMonth: new Date(parsed.data.startMonth),
      emi: Math.round(emi * 100) / 100,
      balance: principal,
    },
  });
  await prisma.approval.create({
    data: {
      type: "LOAN",
      referenceId: created.id,
      employeeId,
      title: parsed.data.type === "ADVANCE" ? "Salary advance" : "Loan application",
      amountOrDays: `₹${principal}`,
    },
  });
  res.status(201).json(created);
});

loansRouter.put("/:id/decide", requireRoles("SUPER_ADMIN", "FINANCE"), async (req, res) => {
  const status = req.body?.status === "REJECTED" ? "REJECTED" : "APPROVED";
  const rec = await prisma.loan.update({ where: { id: req.params.id }, data: { status } });
  await prisma.approval.updateMany({
    where: { referenceId: rec.id, type: "LOAN" },
    data: { status, approverId: req.user!.id, decidedAt: new Date() },
  });
  res.json(rec);
});
