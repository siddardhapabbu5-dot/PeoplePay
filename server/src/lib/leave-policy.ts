import { LeaveCode } from "@prisma/client";

export const COMPANY_LEAVE_POLICY = {
  annualTotal: 18,
  casual: 12,
  sick: 6,
  monthlyPaidLeave: 1,
  bonusPaidIfPreviousMonthZero: 3,
};

export function monthlyPaidLeaveQuota(previousMonthLeavesTaken: number) {
  if (previousMonthLeavesTaken <= 0) {
    return COMPANY_LEAVE_POLICY.bonusPaidIfPreviousMonthZero;
  }
  return COMPANY_LEAVE_POLICY.monthlyPaidLeave;
}

export function inclusiveDays(start: Date, end: Date) {
  const ms = Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate()) -
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
  return Math.floor(ms / 86400000) + 1;
}

export const LEAVE_CATALOG: Array<{
  name: string;
  code: LeaveCode;
  paid: boolean;
  annualQuota: number;
  carryForward: boolean;
  encashable: boolean;
}> = [
  { name: "Casual Leave", code: "CASUAL", paid: true, annualQuota: 12, carryForward: false, encashable: false },
  { name: "Sick Leave", code: "SICK", paid: true, annualQuota: 6, carryForward: false, encashable: false },
  { name: "Earned Leave", code: "EARNED", paid: true, annualQuota: 0, carryForward: true, encashable: true },
  { name: "Privilege Leave", code: "PRIVILEGE", paid: true, annualQuota: 0, carryForward: true, encashable: true },
  { name: "Loss of Pay", code: "LOSS_OF_PAY", paid: false, annualQuota: 0, carryForward: false, encashable: false },
  { name: "Maternity Leave", code: "MATERNITY", paid: true, annualQuota: 182, carryForward: false, encashable: false },
  { name: "Paternity Leave", code: "PATERNITY", paid: true, annualQuota: 15, carryForward: false, encashable: false },
  { name: "Comp Off", code: "COMP_OFF", paid: true, annualQuota: 0, carryForward: false, encashable: false },
  { name: "Paid Leave", code: "PAID", paid: true, annualQuota: 12, carryForward: false, encashable: false },
];
