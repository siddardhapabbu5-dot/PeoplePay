import { AttendanceStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma.js";
import { applySandwichAndLongLeave, DEFAULT_SHIFT, evaluateDay } from "./attendance-policy.js";
import { computeStatutory } from "./statutory.js";
import { monthDays, periodBounds, round2, toNum } from "./money.js";
import { writeAudit } from "./audit.js";

export const PAYROLL_STEPS = [
  { step: 1, key: "attendance", label: "Attendance & Leave" },
  { step: 2, key: "joiners", label: "New Joiners & Exits" },
  { step: 3, key: "revisions", label: "Bonus & Salary Revision" },
  { step: 4, key: "overtime", label: "Overtime" },
  { step: 5, key: "reimbursements", label: "Reimbursements" },
  { step: 6, key: "loans", label: "Loans & Advances" },
  { step: 7, key: "deductions", label: "Deductions" },
  { step: 8, key: "tax", label: "Tax Calculation" },
  { step: 9, key: "calculation", label: "Payroll Calculation" },
  { step: 10, key: "review", label: "Review" },
  { step: 11, key: "approval", label: "Approval" },
  { step: 12, key: "lock", label: "Lock Payroll" },
  { step: 13, key: "payslips", label: "Generate Payslips" },
  { step: 14, key: "disbursement", label: "Salary Disbursement" },
] as const;

function salarySplit(monthly: number) {
  const basic = round2(monthly * 0.5);
  const hra = round2(monthly * 0.2);
  const conveyance = Math.min(1600, round2(monthly * 0.1));
  const special = round2(monthly - basic - hra - conveyance);
  return { basic, hra, conveyance, special };
}

export async function runPayroll(year: number, month: number, actorId?: string, groupId?: string) {
  const { start, end } = periodBounds(year, month);
  const dim = monthDays(year, month);

  const existing = await prisma.payroll.findFirst({
    where: { year, month, payrollGroupId: groupId ?? null },
  });
  if (existing && (existing.status === "LOCKED" || existing.status === "DISBURSED" || existing.status === "PAYSLIPS_GENERATED")) {
    throw new Error("Payroll is locked for this period");
  }

  const payroll = existing
    ? await prisma.payroll.update({
        where: { id: existing.id },
        data: { status: "CALCULATED", step: 9, periodStart: start, periodEnd: end },
      })
    : await prisma.payroll.create({
        data: {
          year,
          month,
          periodStart: start,
          periodEnd: end,
          payrollGroupId: groupId,
          status: "CALCULATED",
          step: 9,
        },
      });

  const employees = await prisma.employee.findMany({
    where: {
      status: "ACTIVE",
      joiningDate: { lte: end },
      OR: [{ exitDate: null }, { exitDate: { gte: start } }],
      ...(groupId ? { payrollGroupId: groupId } : {}),
    },
    include: {
      salaries: { where: { status: "ACTIVE" }, orderBy: { effectiveFrom: "desc" }, take: 1 },
      shift: true,
      attendance: { where: { date: { gte: start, lte: end } } },
      leaveRequests: {
        where: { status: "APPROVED", startDate: { lte: end }, endDate: { gte: start } },
      },
      expenses: { where: { status: "APPROVED", date: { gte: start, lte: end } } },
      loans: { where: { status: "APPROVED" } },
    },
  });

  await prisma.payrollEmployee.deleteMany({ where: { payrollId: payroll.id } });

  let totalGross = 0;
  let totalNet = 0;
  let totalDeductions = 0;

  for (const emp of employees) {
    const salaryRow = emp.salaries[0];
    const monthly = salaryRow ? toNum(salaryRow.ctcMonthly) : 0;
    const split = salaryRow
      ? {
          basic: toNum(salaryRow.basic),
          hra: toNum(salaryRow.hra),
          conveyance: toNum(salaryRow.conveyance),
          special: toNum(salaryRow.special),
        }
      : salarySplit(monthly);

    const shift = emp.shift ?? DEFAULT_SHIFT;
    const attByDate = new Map(emp.attendance.map((a) => [a.date.toISOString().slice(0, 10), a]));
    const dayResults = [];

    for (let d = 1; d <= dim; d++) {
      const date = new Date(Date.UTC(year, month - 1, d));
      const key = date.toISOString().slice(0, 10);
      const row = attByDate.get(key);
      const onLeave = emp.leaveRequests.some(
        (l) => date >= l.startDate && date <= l.endDate,
      );
      dayResults.push(
        evaluateDay(
          {
            date,
            punchIn: row?.punchIn,
            punchOut: row?.punchOut,
            forcedStatus: onLeave ? AttendanceStatus.LEAVE : row?.status,
          },
          monthly,
          dim,
          {
            name: shift.name,
            startTime: shift.startTime,
            endTime: shift.endTime,
            otStart: shift.otStart,
            fullDayAfter: shift.fullDayAfter,
            earlyDeductBefore: shift.earlyDeductBefore,
            workMinutes: shift.workMinutes,
          },
        ),
      );
    }

    const adjusted = applySandwichAndLongLeave(dayResults);
    const presentDays = adjusted.filter((d) =>
      [AttendanceStatus.PRESENT, AttendanceStatus.WORK_FROM_HOME, AttendanceStatus.HALF_DAY].includes(d.status),
    ).reduce((s, d) => s + (d.status === AttendanceStatus.HALF_DAY ? 0.5 : 1), 0);
    const paidLeaveDays = adjusted.filter((d) => d.status === AttendanceStatus.LEAVE && d.perDayPay > 0).length;
    const weekOffPaid = adjusted.filter((d) => d.status === AttendanceStatus.WEEK_OFF || d.status === AttendanceStatus.HOLIDAY).length;
    const lopDays = adjusted.filter((d) => d.status === AttendanceStatus.ABSENT || (d.status === AttendanceStatus.LEAVE && d.perDayPay === 0)).length;
    const halfAdjust = adjusted.filter((d) => d.status === AttendanceStatus.HALF_DAY).length * 0.5;
    const paidDays = round2(dim - lopDays - halfAdjust);
    const ratio = dim ? paidDays / dim : 0;

    const basic = round2(split.basic * ratio);
    const hra = round2(split.hra * ratio);
    const conveyance = round2(split.conveyance * ratio);
    const special = round2(split.special * ratio);
    const overtimeAmount = round2(adjusted.reduce((s, d) => s + d.otAmount, 0));
    const lateDeduction = round2(adjusted.reduce((s, d) => s + Math.max(0, d.lateDeduction), 0));
    const reimbursements = round2(emp.expenses.reduce((s, e) => s + toNum(e.amount), 0));
    const activeLoans = emp.loans.filter((l) => toNum(l.balance) > 0);
    const loanEmi = round2(activeLoans.filter((l) => l.type === "LOAN").reduce((s, l) => s + toNum(l.emi), 0));
    const advance = round2(activeLoans.filter((l) => l.type === "ADVANCE").reduce((s, l) => s + Math.min(toNum(l.emi), toNum(l.balance)), 0));

    const statutory = await computeStatutory({
      basic,
      gross: basic + hra + conveyance + special,
      on: end,
    });

    const earnings = [
      { name: "Basic", code: "BASIC", amount: basic },
      { name: "HRA", code: "HRA", amount: hra },
      { name: "Conveyance", code: "CONVEYANCE", amount: conveyance },
      { name: "Special Allowance", code: "SPECIAL", amount: special },
      { name: "Overtime", code: "OT", amount: overtimeAmount },
      { name: "Reimbursements", code: "REIMB", amount: reimbursements },
    ].filter((e) => e.amount !== 0);

    const deductions = [
      { name: "Late Deductions", code: "LATE", amount: lateDeduction },
      { name: "PF", code: "PF", amount: statutory.pfEmployee },
      { name: "ESI", code: "ESI", amount: statutory.esiEmployee },
      { name: "Professional Tax", code: "PT", amount: statutory.pt },
      { name: "TDS", code: "TDS", amount: statutory.tds },
      { name: "LWF", code: "LWF", amount: statutory.lwf },
      { name: "Loan EMI", code: "LOAN", amount: loanEmi },
      { name: "Salary Advance", code: "ADVANCE", amount: advance },
    ].filter((d) => d.amount !== 0);

    const grossEarnings = round2(earnings.reduce((s, e) => s + e.amount, 0));
    const totalDed = round2(deductions.reduce((s, d) => s + d.amount, 0));
    const netSalary = emp.holdSalary ? 0 : round2(grossEarnings - totalDed);

    totalGross += grossEarnings;
    totalNet += netSalary;
    totalDeductions += totalDed;

    await prisma.payrollEmployee.create({
      data: {
        payrollId: payroll.id,
        employeeId: emp.id,
        paidDays,
        lopDays,
        presentDays: round2(presentDays + paidLeaveDays + weekOffPaid),
        overtimeAmount,
        lateDeduction,
        reimbursements,
        loanEmi,
        advance,
        grossEarnings,
        totalDeductions: totalDed,
        netSalary,
        holdSalary: emp.holdSalary,
        earnings: { create: earnings },
        deductions: { create: deductions },
      },
    });
  }

  const updated = await prisma.payroll.update({
    where: { id: payroll.id },
    data: {
      totalGross,
      totalNet,
      totalDeductions,
      employeeCount: employees.length,
      status: "CALCULATED",
    },
    include: {
      lines: {
        include: { employee: { include: { department: true, designation: true, bankAccount: true } }, earnings: true, deductions: true },
        orderBy: { employee: { firstName: "asc" } },
      },
    },
  });

  await writeAudit(actorId, "PAYROLL_RUN", "Payroll", payroll.id, `${year}-${month}`);
  return updated;
}

export async function advancePayroll(id: string, action: "review" | "approve" | "lock" | "payslips" | "disburse", actorId?: string) {
  const payroll = await prisma.payroll.findUnique({ where: { id } });
  if (!payroll) throw new Error("Payroll not found");

  if (action === "review") {
    if (payroll.status === "LOCKED") throw new Error("Payroll already locked");
    return prisma.payroll.update({ where: { id }, data: { status: "REVIEW", step: 10 } });
  }
  if (action === "approve") {
    if (payroll.status === "LOCKED") throw new Error("Payroll already locked");
    return prisma.payroll.update({
      where: { id },
      data: { status: "APPROVED", step: 11, approvedById: actorId, approvedAt: new Date() },
    });
  }
  if (action === "lock") {
    if (payroll.status !== "APPROVED" && payroll.status !== "REVIEW") {
      throw new Error("Payroll must be approved before lock");
    }
    if (payroll.status !== "APPROVED") {
      throw new Error("Never allow payroll to be locked without approval");
    }
    await writeAudit(actorId, "PAYROLL_LOCK", "Payroll", id);
    return prisma.payroll.update({
      where: { id },
      data: { status: "LOCKED", step: 12, lockedAt: new Date() },
    });
  }
  if (action === "payslips") {
    if (payroll.status !== "LOCKED" && payroll.status !== "PAYSLIPS_GENERATED") {
      throw new Error("Lock payroll before generating payslips");
    }
    const lines = await prisma.payrollEmployee.findMany({ where: { payrollId: id } });
    for (const line of lines) {
      await prisma.payslip.upsert({
        where: { employeeId_year_month: { employeeId: line.employeeId, year: payroll.year, month: payroll.month } },
        update: { lineId: line.id },
        create: {
          employeeId: line.employeeId,
          lineId: line.id,
          year: payroll.year,
          month: payroll.month,
        },
      });
    }
    await writeAudit(actorId, "PAYSLIPS_GENERATED", "Payroll", id);
    return prisma.payroll.update({ where: { id }, data: { status: "PAYSLIPS_GENERATED", step: 13 } });
  }
  if (action === "disburse") {
    if (payroll.status !== "PAYSLIPS_GENERATED" && payroll.status !== "LOCKED") {
      throw new Error("Generate payslips before disbursement");
    }
    const lines = await prisma.payrollEmployee.findMany({
      where: { payrollId: id },
      include: { employee: { include: { loans: true } } },
    });
    for (const line of lines) {
      const recover = toNum(line.loanEmi) + toNum(line.advance);
      if (recover <= 0) continue;
      let remaining = recover;
      for (const loan of line.employee.loans.filter((l) => l.status === "APPROVED" && toNum(l.balance) > 0)) {
        const take = Math.min(remaining, toNum(loan.balance));
        if (take <= 0) continue;
        await prisma.loan.update({
          where: { id: loan.id },
          data: { balance: new Prisma.Decimal(round2(toNum(loan.balance) - take)) },
        });
        await prisma.loanRepayment.create({
          data: {
            loanId: loan.id,
            month: payroll.periodStart,
            amount: take,
            paid: true,
          },
        });
        remaining -= take;
      }
    }
    await writeAudit(actorId, "PAYROLL_DISBURSED", "Payroll", id);
    return prisma.payroll.update({ where: { id }, data: { status: "DISBURSED", step: 14 } });
  }
  return payroll;
}
