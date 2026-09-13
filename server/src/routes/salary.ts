import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRoles } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";

export const salaryRouter = Router();

salaryRouter.get("/components", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "FINANCE"), async (_req, res) => {
  res.json(await prisma.salaryComponent.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] }));
});

salaryRouter.get("/structures", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "FINANCE"), async (_req, res) => {
  res.json(await prisma.salaryStructure.findMany({
    include: { items: { include: { component: true } } },
    orderBy: { effectiveFrom: "desc" },
  }));
});

salaryRouter.post("/structures", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN"), async (req, res) => {
  const parsed = z.object({
    name: z.string(),
    effectiveFrom: z.string(),
    items: z.array(z.object({
      componentId: z.string(),
      calcType: z.enum(["FIXED", "PERCENT_BASIC", "PERCENT_GROSS", "PERCENT_CTC"]),
      amount: z.number().optional(),
      percentage: z.number().optional(),
    })),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const created = await prisma.salaryStructure.create({
    data: {
      name: parsed.data.name,
      effectiveFrom: new Date(parsed.data.effectiveFrom),
      items: {
        create: parsed.data.items.map((i) => ({
          componentId: i.componentId,
          calcType: i.calcType,
          amount: i.amount ?? 0,
          percentage: i.percentage ?? 0,
        })),
      },
    },
    include: { items: { include: { component: true } } },
  });
  res.status(201).json(created);
});

salaryRouter.get("/employee/:employeeId", async (req, res) => {
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId !== req.params.employeeId) {
    return res.status(403).json({ error: "You can only view your own salary" });
  }
  if (req.user!.role === "MANAGER" && req.user!.employeeId !== req.params.employeeId) {
    return res.status(403).json({ error: "Salary is restricted" });
  }
  const rows = await prisma.employeeSalary.findMany({
    where: { employeeId: req.params.employeeId },
    include: { structure: true },
    orderBy: { effectiveFrom: "desc" },
  });
  const current = rows[0];
  if (!current) return res.json({ current: null, history: [] });
  const ctc = Number(current.ctcMonthly);
  const gross = Number(current.basic) + Number(current.hra) + Number(current.conveyance) + Number(current.special) + Number(current.other);
  res.json({
    current: {
      ...current,
      ctc,
      grossSalary: gross,
      totalEarnings: gross,
      totalDeductions: 0,
      netSalary: gross,
    },
    history: rows,
  });
});

salaryRouter.post("/revise", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN"), async (req, res) => {
  const parsed = z.object({
    employeeId: z.string(),
    ctcMonthly: z.number().positive(),
    effectiveFrom: z.string(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { employeeId, ctcMonthly, effectiveFrom } = parsed.data;
  await prisma.employeeSalary.updateMany({
    where: { employeeId, status: "ACTIVE" },
    data: { status: "INACTIVE", effectiveTo: new Date(effectiveFrom) },
  });
  const basic = Math.round(ctcMonthly * 0.5 * 100) / 100;
  const hra = Math.round(ctcMonthly * 0.2 * 100) / 100;
  const conveyance = Math.min(1600, ctcMonthly);
  const special = Math.round((ctcMonthly - basic - hra - conveyance) * 100) / 100;
  const row = await prisma.employeeSalary.create({
    data: { employeeId, ctcMonthly, basic, hra, conveyance, special, effectiveFrom: new Date(effectiveFrom) },
  });
  await prisma.employeeTimeline.create({
    data: {
      employeeId,
      type: "SALARY_REVISION",
      title: `Salary revised to ₹${ctcMonthly.toLocaleString("en-IN")}`,
      happenedAt: new Date(effectiveFrom),
    },
  });
  await prisma.approval.create({
    data: {
      type: "SALARY_REVISION",
      referenceId: row.id,
      employeeId,
      title: "Salary revision",
      amountOrDays: `₹${ctcMonthly}`,
      status: "APPROVED",
    },
  });
  await writeAudit(req.user!.id, "SALARY_REVISION", "EmployeeSalary", row.id);
  res.status(201).json(row);
});
