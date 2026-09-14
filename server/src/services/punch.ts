import { AttendanceStatus, LocationType, PunchType, VerificationStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { formatClock, haversineMetres, insideGeofence, todayUtcDate } from "../lib/geo.js";
import { parseTimeToMinutes } from "../lib/money.js";
import { writeAudit } from "../lib/audit.js";

export async function attendanceRules() {
  return (
    (await prisma.attendanceRule.findFirst()) ??
    (await prisma.attendanceRule.create({ data: { name: "Default" } }))
  );
}

export async function todayAttendance(employeeId: string) {
  const date = todayUtcDate();
  return prisma.attendance.findUnique({
    where: { employeeId_date: { employeeId, date } },
    include: {
      punches: { orderBy: { timestamp: "asc" } },
      breaks: { orderBy: { breakStart: "asc" } },
    },
  });
}

export async function employeeLocationContext(employeeId: string) {
  const employee = await prisma.employee.findUnique({
    where: { id: employeeId },
    include: {
      shift: true,
      department: true,
      designation: true,
      homeLocation: true,
      siteAssignments: {
        where: { status: "ACTIVE" },
        include: { site: true },
        orderBy: { startDate: "desc" },
      },
    },
  });
  if (!employee) throw new Error("Employee not found");
  const now = new Date();
  const sites = employee.siteAssignments
    .filter((a) => a.startDate <= now && (!a.endDate || a.endDate >= now) && a.site.status === "ACTIVE")
    .map((a) => a.site);
  return { employee, home: employee.homeLocation, sites };
}

type PunchInput = {
  employeeId: string;
  latitude: number;
  longitude: number;
  gpsAccuracy?: number;
  address?: string;
  selfiePath?: string;
  deviceId?: string;
  ipAddress?: string;
  mockGps?: boolean;
  channel?: "WEB" | "MOBILE";
};

export async function punchIn(input: PunchInput) {
  const rules = await attendanceRules();
  const { employee, home } = await employeeLocationContext(input.employeeId);
  if (!home || !home.active) throw new Error("Home location is not configured. Contact HR.");
  const web = input.channel === "WEB";
  if (rules.locationRequired && (input.latitude == null || input.longitude == null)) {
    throw new Error("Please enable location services.");
  }
  if (!web && input.gpsAccuracy != null && input.gpsAccuracy > rules.maxGpsAccuracyMetres) {
    throw new Error("GPS accuracy is insufficient. Please move to an open area and try again.");
  }
  const geo = insideGeofence(input.latitude, input.longitude, home.latitude, home.longitude, home.allowedRadius);
  if (!geo.allowed && !web) {
    const err = Object.assign(new Error("Punch In is allowed only from your registered home location."), {
      code: "OUTSIDE_HOME",
      current: { latitude: input.latitude, longitude: input.longitude },
      home: { latitude: home.latitude, longitude: home.longitude, address: home.address },
      distance: geo.distance,
      allowedRadius: home.allowedRadius,
    });
    throw err;
  }

  const date = todayUtcDate();
  const existing = await todayAttendance(input.employeeId);
  const livePunches = existing?.punches?.length ?? 0;
  if (livePunches && existing?.punchIn && !existing.punchOut) throw new Error("You have already punched in today.");
  if (livePunches && existing?.punchOut) throw new Error("Today's attendance is already completed.");

  const serverNow = new Date();
  const shiftStart = parseTimeToMinutes(employee.shift?.startTime ?? "09:00") ?? 9 * 60;
  const lateMin = Math.max(0, serverNow.getUTCHours() * 60 + serverNow.getUTCMinutes() - shiftStart - rules.graceMinutes);
  const status = lateMin > 0 ? AttendanceStatus.LATE : AttendanceStatus.PRESENT;
  const verification = input.mockGps || (web && !geo.allowed) ? VerificationStatus.SUSPICIOUS : VerificationStatus.VERIFIED;
  const source = web ? "WEB_GPS" : "MOBILE_GPS";

  const row = await prisma.attendance.upsert({
    where: { employeeId_date: { employeeId: input.employeeId, date } },
    update: {
      punchIn: formatClock(serverNow),
      punchOut: null,
      workingHours: 0,
      workingMinutes: 0,
      overtimeMin: 0,
      breakMinutes: 0,
      earlyLeavingMinutes: 0,
      lateMin,
      status,
      source,
      approved: verification !== VerificationStatus.SUSPICIOUS,
    },
    create: {
      employeeId: input.employeeId,
      date,
      shiftId: employee.shiftId,
      punchIn: formatClock(serverNow),
      lateMin,
      status,
      source,
      approved: verification !== VerificationStatus.SUSPICIOUS,
    },
  });

  await prisma.punchRecord.create({
    data: {
      employeeId: input.employeeId,
      attendanceId: row.id,
      type: PunchType.IN,
      timestamp: serverNow,
      latitude: input.latitude,
      longitude: input.longitude,
      gpsAccuracy: input.gpsAccuracy,
      address: input.address ?? home.address,
      locationType: LocationType.HOME,
      distance: geo.distance,
      selfiePath: input.selfiePath,
      deviceId: input.deviceId,
      ipAddress: input.ipAddress,
      verificationStatus: verification,
    },
  });
  await writeAudit(undefined, "PUNCH_IN", "Attendance", row.id, input.employeeId);
  return todayBundle(input.employeeId);
}

export async function punchOut(input: PunchInput & { siteId?: string }) {
  const rules = await attendanceRules();
  const { employee, sites } = await employeeLocationContext(input.employeeId);
  if (!sites.length) throw new Error("No active site is assigned. Contact HR.");
  const web = input.channel === "WEB";
  if (!web && input.gpsAccuracy != null && input.gpsAccuracy > rules.maxGpsAccuracyMetres) {
    throw new Error("GPS accuracy is insufficient. Please move to an open area and try again.");
  }

  const existing = await todayAttendance(input.employeeId);
  if (!existing?.punchIn) throw new Error("You must punch in before punching out.");
  if (existing.punchOut) throw new Error("Today's attendance is already completed.");
  const openBreak = existing.breaks.find((b) => !b.breakEnd);
  if (openBreak) throw new Error("End your break before punching out.");

  const scored = sites.map((site) => ({
    site,
    ...insideGeofence(input.latitude, input.longitude, site.latitude, site.longitude, site.allowedRadius),
  }));
  const match = input.siteId
    ? scored.find((s) => s.site.id === input.siteId)
    : scored.find((s) => s.allowed) ?? scored.sort((a, b) => a.distance - b.distance)[0];
  if ((!match || !match.allowed) && !web) {
    const nearest = scored.sort((a, b) => a.distance - b.distance)[0];
    throw Object.assign(new Error("Punch Out is allowed only from your assigned site location."), {
      code: "OUTSIDE_SITE",
      current: { latitude: input.latitude, longitude: input.longitude },
      site: nearest?.site,
      distance: nearest?.distance,
      allowedRadius: nearest?.site.allowedRadius,
    });
  }
  if (!match) {
    throw new Error("No active site is assigned. Contact HR.");
  }

  const serverNow = new Date();
  const punchInAt = existing.punches.find((p) => p.type === "IN")?.timestamp ?? serverNow;
  const breakMinutes = existing.breaks.reduce((s, b) => s + b.breakMinutes, 0);
  const workingMinutes = Math.max(0, Math.round((serverNow.getTime() - punchInAt.getTime()) / 60000) - breakMinutes);
  const overtimeMin = Math.max(0, workingMinutes - rules.requiredMinutes);
  const shiftEnd = parseTimeToMinutes(employee.shift?.endTime ?? "18:00") ?? 18 * 60;
  const earlyLeavingMinutes = Math.max(0, shiftEnd - (serverNow.getUTCHours() * 60 + serverNow.getUTCMinutes()));
  const verification = input.mockGps || (web && !match.allowed) ? VerificationStatus.SUSPICIOUS : VerificationStatus.VERIFIED;
  const status =
    workingMinutes < rules.halfDayMinutes ? AttendanceStatus.HALF_DAY : workingMinutes < rules.requiredMinutes && earlyLeavingMinutes > 30 ? AttendanceStatus.HALF_DAY : AttendanceStatus.PRESENT;

  await prisma.attendance.update({
    where: { id: existing.id },
    data: {
      punchOut: formatClock(serverNow),
      breakMinutes,
      workingMinutes,
      workingHours: Math.round((workingMinutes / 60) * 100) / 100,
      overtimeMin,
      earlyLeavingMinutes,
      status,
      source: web ? "WEB_GPS" : "MOBILE_GPS",
      approved: verification !== VerificationStatus.SUSPICIOUS,
    },
  });

  await prisma.punchRecord.create({
    data: {
      employeeId: input.employeeId,
      attendanceId: existing.id,
      type: PunchType.OUT,
      timestamp: serverNow,
      latitude: input.latitude,
      longitude: input.longitude,
      gpsAccuracy: input.gpsAccuracy,
      address: input.address ?? match.site.address,
      locationType: LocationType.SITE,
      siteId: match.site.id,
      distance: match.distance,
      selfiePath: input.selfiePath,
      deviceId: input.deviceId,
      ipAddress: input.ipAddress,
      verificationStatus: verification,
    },
  });
  await writeAudit(undefined, "PUNCH_OUT", "Attendance", existing.id, input.employeeId);
  return todayBundle(input.employeeId);
}

export async function startBreak(employeeId: string) {
  const existing = await todayAttendance(employeeId);
  if (!existing?.punchIn || existing.punchOut) throw new Error("You can start a break only while working.");
  if (existing.breaks.some((b) => !b.breakEnd)) throw new Error("A break is already in progress.");
  await prisma.breakRecord.create({
    data: { employeeId, attendanceId: existing.id, breakStart: new Date() },
  });
  return todayBundle(employeeId);
}

export async function endBreak(employeeId: string) {
  const existing = await todayAttendance(employeeId);
  const open = existing?.breaks.find((b) => !b.breakEnd);
  if (!open) throw new Error("No active break.");
  const end = new Date();
  const minutes = Math.max(1, Math.round((end.getTime() - open.breakStart.getTime()) / 60000));
  await prisma.breakRecord.update({
    where: { id: open.id },
    data: { breakEnd: end, breakMinutes: minutes },
  });
  const total = (existing?.breaks.filter((b) => b.breakEnd).reduce((s, b) => s + b.breakMinutes, 0) ?? 0) + minutes;
  await prisma.attendance.update({ where: { id: existing!.id }, data: { breakMinutes: total } });
  return todayBundle(employeeId);
}

export async function todayBundle(employeeId: string) {
  const { employee, home, sites } = await employeeLocationContext(employeeId);
  const today = await todayAttendance(employeeId);
  const live = (today?.punches?.length ?? 0) > 0;
  const openBreak = today?.breaks.find((b) => !b.breakEnd);
  const punchInAt = today?.punches.find((p) => p.type === "IN")?.timestamp;
  let workingMinutes = live ? today?.workingMinutes ?? 0 : 0;
  if (live && today?.punchIn && !today.punchOut && punchInAt) {
    const breakDone = today.breaks.reduce((s, b) => s + (b.breakEnd ? b.breakMinutes : Math.round((Date.now() - b.breakStart.getTime()) / 60000)), 0);
    workingMinutes = Math.max(0, Math.round((Date.now() - punchInAt.getTime()) / 60000) - breakDone);
  }
  const punchIn = live ? today?.punchIn ?? null : null;
  const punchOut = live ? today?.punchOut ?? null : null;
  const dayStatus = !punchIn
    ? "NOT_PUNCHED_IN"
    : punchOut
      ? "PUNCHED_OUT"
      : openBreak
        ? "ON_BREAK"
        : "WORKING";
  return {
    employee: {
      id: employee.id,
      name: `${employee.firstName} ${employee.lastName}`.trim(),
      code: employee.employeeCode,
      phone: employee.phone,
      email: employee.personalEmail,
      photoPath: employee.photoPath,
      department: employee.department?.name,
      designation: employee.designation?.name,
      managerId: employee.managerId,
    },
    shift: employee.shift,
    home,
    sites,
    today: today
      ? {
          ...today,
          punchIn,
          punchOut,
          dayStatus,
          workingMinutes,
          breakMinutes: live ? today.breakMinutes : 0,
          overtimeMin: live ? today.overtimeMin : 0,
          distanceFromHome: today.punches.find((p) => p.type === "IN")?.distance,
          distanceFromSite: today.punches.find((p) => p.type === "OUT")?.distance,
        }
      : { dayStatus: "NOT_PUNCHED_IN", punchIn: null, punchOut: null, workingMinutes: 0, breakMinutes: 0, overtimeMin: 0 },
    serverTime: new Date().toISOString(),
  };
}

export function distancePreview(lat: number, lon: number, targetLat: number, targetLon: number, radius: number) {
  const distance = haversineMetres(lat, lon, targetLat, targetLon);
  return {
    distance,
    allowedRadius: radius,
    verified: distance <= radius,
    status: distance <= radius ? "LOCATION VERIFIED" : "OUTSIDE GEOFENCE",
  };
}
