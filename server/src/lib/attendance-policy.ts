import { AttendanceStatus } from "@prisma/client";
import { parseTimeToMinutes, round2 } from "./money.js";

export const DEFAULT_SHIFT = {
  name: "General",
  startTime: "10:00",
  endTime: "18:30",
  otStart: "19:30",
  fullDayAfter: "17:30",
  earlyDeductBefore: "16:30",
  workMinutes: 510,
};

export type DayInput = {
  date: Date;
  punchIn?: string | null;
  punchOut?: string | null;
  forcedStatus?: AttendanceStatus | null;
  isHoliday?: boolean;
};

export type DayResult = {
  date: Date;
  punchIn: string | null;
  punchOut: string | null;
  workingHours: number;
  lateMin: number;
  overtimeMin: number;
  lateDeduction: number;
  otAmount: number;
  status: AttendanceStatus;
  perDayPay: number;
};

export function evaluateDay(
  input: DayInput,
  monthlySalary: number,
  daysInMonth: number,
  shift = DEFAULT_SHIFT,
): DayResult {
  const perDay = monthlySalary / daysInMonth;
  const perMinute = perDay / shift.workMinutes;
  const start = parseTimeToMinutes(shift.startTime) ?? 10 * 60;
  const end = parseTimeToMinutes(shift.endTime) ?? 18 * 60 + 30;
  const otStart = parseTimeToMinutes(shift.otStart) ?? 19 * 60 + 30;
  const fullDayAfter = parseTimeToMinutes(shift.fullDayAfter) ?? 17 * 60 + 30;
  const earlyCut = parseTimeToMinutes(shift.earlyDeductBefore) ?? 16 * 60 + 30;
  const weekday = input.date.getUTCDay();
  const punchIn = parseTimeToMinutes(input.punchIn);
  const punchOut = parseTimeToMinutes(input.punchOut);

  if (input.forcedStatus === AttendanceStatus.LEAVE) {
    return blank(input, AttendanceStatus.LEAVE, 0);
  }
  if (input.isHoliday || input.forcedStatus === AttendanceStatus.HOLIDAY) {
    return blank(input, AttendanceStatus.HOLIDAY, perDay);
  }

  const hasPunch = punchIn != null || punchOut != null;

  if (weekday === 0 && input.forcedStatus !== AttendanceStatus.PRESENT) {
    return blank(input, AttendanceStatus.WEEK_OFF, perDay);
  }

  if (!hasPunch) {
    return blank(input, AttendanceStatus.ABSENT, 0);
  }

  const inMin = punchIn ?? start;
  const outMin = punchOut ?? end;
  const lateMin = inMin - start;
  const lateDeduction = round2(lateMin * perMinute);
  const overtimeMin = Math.max(0, outMin - otStart);
  const otAmount = round2(overtimeMin * perMinute);
  const workingHours = round2(Math.max(0, outMin - inMin) / 60);

  let status: AttendanceStatus = AttendanceStatus.PRESENT;
  let dayPay = perDay - lateDeduction + otAmount;

  if (punchOut != null && outMin < earlyCut) {
    status = AttendanceStatus.HALF_DAY;
    dayPay = perDay / 2 - Math.max(0, lateDeduction) + otAmount;
  } else if (punchOut != null && outMin < fullDayAfter) {
    const missing = fullDayAfter - outMin;
    dayPay = perDay - lateDeduction - round2(missing * perMinute) + otAmount;
  }

  return {
    date: input.date,
    punchIn: input.punchIn ?? null,
    punchOut: input.punchOut ?? null,
    workingHours,
    lateMin,
    overtimeMin,
    lateDeduction,
    otAmount,
    status,
    perDayPay: round2(Math.max(0, dayPay)),
  };
}

function blank(input: DayInput, status: AttendanceStatus, perDayPay: number): DayResult {
  return {
    date: input.date,
    punchIn: input.punchIn ?? null,
    punchOut: input.punchOut ?? null,
    workingHours: 0,
    lateMin: 0,
    overtimeMin: 0,
    lateDeduction: 0,
    otAmount: 0,
    status,
    perDayPay: round2(perDayPay),
  };
}

export function applySandwichAndLongLeave(days: DayResult[]) {
  const sorted = [...days].sort((a, b) => a.date.getTime() - b.date.getTime());
  const isAbsentLike = (d: DayResult) =>
    d.status === AttendanceStatus.ABSENT || d.status === AttendanceStatus.LEAVE;

  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i];
    if (day.date.getUTCDay() !== 0) continue;
    if (day.status !== AttendanceStatus.WEEK_OFF && day.status !== AttendanceStatus.HOLIDAY) continue;

    const prev = sorted[i - 1];
    const next = sorted[i + 1];
    if (prev && next && isAbsentLike(prev) && isAbsentLike(next)) {
      day.status = AttendanceStatus.ABSENT;
      day.perDayPay = 0;
    }
  }

  let streak = 0;
  for (const day of sorted) {
    if (isAbsentLike(day) || (day.date.getUTCDay() === 0 && day.status === AttendanceStatus.WEEK_OFF && streak >= 2)) {
      if (day.date.getUTCDay() === 0 && streak >= 2 && day.status === AttendanceStatus.WEEK_OFF) {
        day.status = AttendanceStatus.ABSENT;
        day.perDayPay = 0;
      }
      streak += 1;
    } else if (day.status === AttendanceStatus.WEEK_OFF || day.status === AttendanceStatus.HOLIDAY) {
      streak += 1;
    } else {
      streak = 0;
    }
  }

  for (let i = 0; i < sorted.length; i++) {
    const day = sorted[i];
    if (day.date.getUTCDay() !== 0) continue;
    let run = 0;
    for (let j = i; j >= 0 && j > i - 4; j--) {
      const d = sorted[j];
      if (
        d.status === AttendanceStatus.HOLIDAY ||
        d.status === AttendanceStatus.WEEK_OFF ||
        d.status === AttendanceStatus.ABSENT ||
        d.status === AttendanceStatus.LEAVE
      ) {
        run += 1;
      } else break;
    }
    if (run >= 4 && (day.status === AttendanceStatus.WEEK_OFF || day.status === AttendanceStatus.HOLIDAY)) {
      day.status = AttendanceStatus.ABSENT;
      day.perDayPay = 0;
    }
  }

  return sorted;
}
