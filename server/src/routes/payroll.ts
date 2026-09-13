import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { advancePayroll, PAYROLL_STEPS, runPayroll } from "../lib/payroll-engine.js";
import { requireRoles } from "../middleware/auth.js";
import { streamWorkbook } from "../lib/excel.js";
import { streamTablePdf } from "../lib/pdf.js";
import { toNum } from "../lib/money.js";

export const payrollRouter = Router();

payrollRouter.get("/", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN", "HR_ADMIN", "FINANCE"), async (_req, res) => {
  const rows = await prisma.payroll.findMany({
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: { _count: { select: { lines: true } } },
  });
  res.json({ steps: PAYROLL_STEPS, rows });
});

payrollRouter.post("/run", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN"), async (req, res) => {
  const parsed = z.object({
    year: z.number(),
    month: z.number().min(1).max(12),
    payrollGroupId: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const result = await runPayroll(parsed.data.year, parsed.data.month, req.user!.id, parsed.data.payrollGroupId);
    res.json(result);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Payroll run failed" });
  }
});

payrollRouter.get("/:id", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN", "HR_ADMIN", "FINANCE"), async (req, res) => {
  const row = await prisma.payroll.findUnique({
    where: { id: req.params.id },
    include: {
      lines: {
        include: {
          employee: { include: { department: true, designation: true, bankAccount: true } },
          earnings: true,
          deductions: true,
        },
        orderBy: { employee: { employeeCode: "asc" } },
      },
    },
  });
  if (!row) return res.status(404).json({ error: "Payroll not found" });
  res.json({ ...row, steps: PAYROLL_STEPS });
});

async function act(req: Parameters<typeof payrollRouter.post>[1] extends never ? never : any, res: any, action: "review" | "approve" | "lock" | "payslips" | "disburse") {
  try {
    const row = await advancePayroll(req.params.id, action, req.user!.id);
    res.json(row);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Action failed" });
  }
}

payrollRouter.post("/:id/review", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN"), (req, res) => act(req, res, "review"));
payrollRouter.post("/:id/approve", requireRoles("SUPER_ADMIN", "FINANCE", "PAYROLL_ADMIN"), (req, res) => act(req, res, "approve"));
payrollRouter.post("/:id/lock", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN"), (req, res) => act(req, res, "lock"));
payrollRouter.post("/:id/payslips", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN"), (req, res) => act(req, res, "payslips"));
payrollRouter.post("/:id/disburse", requireRoles("SUPER_ADMIN", "FINANCE", "PAYROLL_ADMIN"), (req, res) => act(req, res, "disburse"));

payrollRouter.get("/:id/export.xlsx", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN", "FINANCE"), async (req, res) => {
  const row = await prisma.payroll.findUnique({
    where: { id: req.params.id },
    include: { lines: { include: { employee: { include: { department: true, bankAccount: true } }, earnings: true, deductions: true } } },
  });
  if (!row) return res.status(404).json({ error: "Not found" });
  await streamWorkbook(res, `payroll-${row.year}-${row.month}.xlsx`, [{
    name: "Payroll Register",
    headers: ["Employee ID", "Name", "Department", "Paid Days", "LOP", "Gross", "Deductions", "Net", "Bank", "Account"],
    rows: row.lines.map((l) => [
      l.employee.employeeCode,
      `${l.employee.firstName} ${l.employee.lastName}`,
      l.employee.department?.name ?? "",
      Number(l.paidDays),
      Number(l.lopDays),
      toNum(l.grossEarnings),
      toNum(l.totalDeductions),
      toNum(l.netSalary),
      l.employee.bankAccount?.bankName ?? "",
      l.employee.bankAccount?.accountNumber ?? "",
    ]),
  }]);
});

payrollRouter.get("/:id/export.pdf", requireRoles("SUPER_ADMIN", "PAYROLL_ADMIN", "FINANCE"), async (req, res) => {
  const row = await prisma.payroll.findUnique({
    where: { id: req.params.id },
    include: { lines: { include: { employee: { include: { department: true } } } } },
  });
  if (!row) return res.status(404).json({ error: "Not found" });
  streamTablePdf(
    res,
    `Salary Register ${row.month}/${row.year}`,
    ["Code", "Name", "Dept", "Paid", "Gross", "Ded", "Net"],
    row.lines.map((l) => [
      l.employee.employeeCode,
      `${l.employee.firstName} ${l.employee.lastName}`,
      l.employee.department?.name ?? "",
      Number(l.paidDays),
      toNum(l.grossEarnings),
      toNum(l.totalDeductions),
      toNum(l.netSalary),
    ]),
    `salary-register-${row.year}-${row.month}.pdf`,
  );
});
