import { Router } from "express";
import { prisma } from "../lib/prisma.js";
import { streamPayslipPdf } from "../lib/pdf.js";
import { toNum } from "../lib/money.js";

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export const payslipsRouter = Router();

payslipsRouter.get("/", async (req, res) => {
  const where: Record<string, unknown> = {};
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId) where.employeeId = req.user!.employeeId;
  else if (req.query.employeeId) where.employeeId = String(req.query.employeeId);
  const rows = await prisma.payslip.findMany({
    where,
    include: {
      employee: { include: { department: true, designation: true } },
      line: true,
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });
  res.json(rows);
});

payslipsRouter.get("/:id/pdf", async (req, res) => {
  const slip = await prisma.payslip.findUnique({
    where: { id: req.params.id },
    include: {
      employee: { include: { department: true, designation: true, statutory: true, bankAccount: true } },
      line: { include: { earnings: true, deductions: true } },
    },
  });
  if (!slip) return res.status(404).json({ error: "Payslip not found" });
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId !== slip.employeeId) {
    return res.status(403).json({ error: "You can only download your own payslip" });
  }
  const company = await prisma.company.findFirst();
  streamPayslipPdf(res, {
    companyName: company?.name ?? "PeoplePay",
    companyAddress: [company?.address, company?.city, company?.state].filter(Boolean).join(", "),
    employeeName: `${slip.employee.firstName} ${slip.employee.lastName}`.trim(),
    employeeCode: slip.employee.employeeCode,
    department: slip.employee.department?.name,
    designation: slip.employee.designation?.name,
    pan: slip.employee.statutory?.pan,
    bankAccount: slip.employee.bankAccount?.accountNumber,
    period: `${MONTHS[slip.month - 1]} ${slip.year}`,
    earnings: slip.line.earnings.map((e) => ({ name: e.name, amount: toNum(e.amount) })),
    deductions: slip.line.deductions.map((d) => ({ name: d.name, amount: toNum(d.amount) })),
    gross: toNum(slip.line.grossEarnings),
    totalDeductions: toNum(slip.line.totalDeductions),
    net: toNum(slip.line.netSalary),
  }, `payslip-${slip.employee.employeeCode}-${slip.year}-${slip.month}.pdf`);
});
