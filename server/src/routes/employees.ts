import { Router } from "express";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "../lib/prisma.js";
import { writeAudit } from "../lib/audit.js";
import { canSeeSalary, requireRoles } from "../middleware/auth.js";
import { streamWorkbook } from "../lib/excel.js";

export const employeesRouter = Router();

const employeeSchema = z.object({
  firstName: z.string().min(1),
  lastName: z.string().optional().default(""),
  dateOfBirth: z.string().optional(),
  gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional(),
  phone: z.string().optional(),
  personalEmail: z.string().email().optional().or(z.literal("")),
  address: z.string().optional(),
  employeeCode: z.string().min(1),
  joiningDate: z.string(),
  departmentId: z.string().optional(),
  designationId: z.string().optional(),
  locationId: z.string().optional(),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN", "CONSULTANT"]).optional(),
  managerId: z.string().optional(),
  workLocation: z.string().optional(),
  shiftId: z.string().optional(),
  payrollGroupId: z.string().optional(),
  bank: z.object({
    bankName: z.string(),
    accountNumber: z.string(),
    ifsc: z.string(),
    accountHolderName: z.string(),
  }).optional(),
  statutory: z.object({
    pan: z.string().optional(),
    aadhaar: z.string().optional(),
    uan: z.string().optional(),
    esiNumber: z.string().optional(),
    pfNumber: z.string().optional(),
    taxRegime: z.enum(["OLD", "NEW"]).optional(),
  }).optional(),
  ctcMonthly: z.number().optional(),
  createLogin: z.boolean().optional(),
  loginEmail: z.string().email().optional(),
  role: z.enum(["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "MANAGER", "EMPLOYEE", "FINANCE"]).optional(),
});

function maskSalary<T extends Record<string, unknown>>(row: T, allowed: boolean) {
  if (allowed) return row;
  const clone = { ...row };
  delete clone.salaries;
  return clone;
}

employeesRouter.get("/", async (req, res) => {
  const q = String(req.query.q ?? "").trim();
  const status = String(req.query.status ?? "");
  const departmentId = String(req.query.departmentId ?? "");
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(5, Number(req.query.pageSize ?? 20)));
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (departmentId) where.departmentId = departmentId;
  if (q) {
    where.OR = [
      { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } },
      { employeeCode: { contains: q, mode: "insensitive" } },
      { personalEmail: { contains: q, mode: "insensitive" } },
    ];
  }
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId) {
    where.id = req.user!.employeeId;
  } else if (req.user!.role === "MANAGER" && req.user!.employeeId) {
    where.OR = [{ id: req.user!.employeeId }, { managerId: req.user!.employeeId }];
  }

  const [total, rows] = await Promise.all([
    prisma.employee.count({ where }),
    prisma.employee.findMany({
      where,
      include: {
        department: true,
        designation: true,
        location: true,
        manager: true,
        shift: true,
        salaries: { where: { status: "ACTIVE" }, orderBy: { effectiveFrom: "desc" }, take: 1 },
      },
      orderBy: { employeeCode: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const allowed = canSeeSalary(req.user!.role);
  res.json({
    total,
    page,
    pageSize,
    rows: rows.map((r) => maskSalary(r as unknown as Record<string, unknown>, allowed)),
  });
});

employeesRouter.get("/export", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN"), async (_req, res) => {
  const rows = await prisma.employee.findMany({
    include: { department: true, designation: true, location: true, manager: true },
    orderBy: { employeeCode: "asc" },
  });
  await streamWorkbook(res, "employees.xlsx", [{
    name: "Employees",
    headers: ["Employee ID", "Name", "Department", "Designation", "Location", "Joining Date", "Type", "Manager", "Status"],
    rows: rows.map((e) => [
      e.employeeCode,
      `${e.firstName} ${e.lastName}`.trim(),
      e.department?.name ?? "",
      e.designation?.name ?? "",
      e.location?.name ?? "",
      e.joiningDate.toISOString().slice(0, 10),
      e.employmentType,
      e.manager ? `${e.manager.firstName} ${e.manager.lastName}` : "",
      e.status,
    ]),
  }]);
});

employeesRouter.get("/:id", async (req, res) => {
  const employee = await prisma.employee.findUnique({
    where: { id: req.params.id },
    include: {
      department: true,
      designation: true,
      location: true,
      manager: true,
      shift: true,
      bankAccount: true,
      statutory: true,
      documents: true,
      salaries: { orderBy: { effectiveFrom: "desc" } },
      timeline: { orderBy: { happenedAt: "desc" } },
      leaveBalances: { include: { leaveType: true } },
      user: { select: { email: true, role: true, status: true } },
    },
  });
  if (!employee) return res.status(404).json({ error: "Employee not found" });
  if (req.user!.role === "EMPLOYEE" && req.user!.employeeId !== employee.id) {
    return res.status(403).json({ error: "You can only view your own profile" });
  }
  if (req.user!.role === "MANAGER" && req.user!.employeeId !== employee.id && employee.managerId !== req.user!.employeeId) {
    return res.status(403).json({ error: "Managers can only view their team" });
  }
  const payload = employee as unknown as Record<string, unknown>;
  if (!canSeeSalary(req.user!.role) && req.user!.employeeId !== employee.id) {
    delete payload.salaries;
    delete payload.bankAccount;
  }
  res.json(payload);
});

employeesRouter.post("/", requireRoles("SUPER_ADMIN", "HR_ADMIN"), async (req, res) => {
  const parsed = employeeSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const created = await prisma.employee.create({
    data: {
      firstName: d.firstName,
      lastName: d.lastName ?? "",
      dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : undefined,
      gender: d.gender,
      phone: d.phone,
      personalEmail: d.personalEmail || undefined,
      address: d.address,
      employeeCode: d.employeeCode,
      joiningDate: new Date(d.joiningDate),
      departmentId: d.departmentId,
      designationId: d.designationId,
      locationId: d.locationId,
      employmentType: d.employmentType,
      managerId: d.managerId,
      workLocation: d.workLocation,
      shiftId: d.shiftId,
      payrollGroupId: d.payrollGroupId,
      bankAccount: d.bank ? { create: d.bank } : undefined,
      statutory: d.statutory ? { create: d.statutory } : undefined,
      timeline: {
        create: { type: "JOINED", title: "Joined organization", happenedAt: new Date(d.joiningDate) },
      },
    },
  });

  if (d.ctcMonthly) {
    const basic = Math.round(d.ctcMonthly * 0.5);
    const hra = Math.round(d.ctcMonthly * 0.2);
    const conveyance = Math.min(1600, d.ctcMonthly);
    const special = d.ctcMonthly - basic - hra - conveyance;
    await prisma.employeeSalary.create({
      data: {
        employeeId: created.id,
        ctcMonthly: d.ctcMonthly,
        basic,
        hra,
        conveyance,
        special,
        effectiveFrom: new Date(d.joiningDate),
      },
    });
  }

  if (d.createLogin && d.loginEmail) {
    const passwordHash = await bcrypt.hash("Welcome@123", 10);
    const user = await prisma.user.create({
      data: { email: d.loginEmail.toLowerCase(), passwordHash, role: d.role ?? "EMPLOYEE" },
    });
    await prisma.employee.update({ where: { id: created.id }, data: { userId: user.id } });
  }

  const types = await prisma.leaveType.findMany();
  const year = new Date().getFullYear();
  if (types.length) {
    await prisma.leaveBalance.createMany({
      data: types.map((t) => ({
        employeeId: created.id,
        leaveTypeId: t.id,
        year,
        entitled: t.annualQuota,
      })),
    });
  }

  await writeAudit(req.user!.id, "EMPLOYEE_CREATE", "Employee", created.id, created.employeeCode);
  res.status(201).json(created);
});

employeesRouter.put("/:id", requireRoles("SUPER_ADMIN", "HR_ADMIN"), async (req, res) => {
  const parsed = employeeSchema.partial().safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const d = parsed.data;
  const updated = await prisma.employee.update({
    where: { id: req.params.id },
    data: {
      firstName: d.firstName,
      lastName: d.lastName,
      dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : undefined,
      gender: d.gender,
      phone: d.phone,
      personalEmail: d.personalEmail || undefined,
      address: d.address,
      employeeCode: d.employeeCode,
      joiningDate: d.joiningDate ? new Date(d.joiningDate) : undefined,
      departmentId: d.departmentId,
      designationId: d.designationId,
      locationId: d.locationId,
      employmentType: d.employmentType,
      managerId: d.managerId,
      workLocation: d.workLocation,
      shiftId: d.shiftId,
    },
  });
  if (d.bank) {
    await prisma.bankAccount.upsert({
      where: { employeeId: updated.id },
      update: d.bank,
      create: { employeeId: updated.id, ...d.bank },
    });
  }
  if (d.statutory) {
    await prisma.statutoryDetails.upsert({
      where: { employeeId: updated.id },
      update: d.statutory,
      create: { employeeId: updated.id, ...d.statutory },
    });
  }
  await writeAudit(req.user!.id, "EMPLOYEE_UPDATE", "Employee", updated.id);
  res.json(updated);
});

employeesRouter.delete("/:id", requireRoles("SUPER_ADMIN", "HR_ADMIN"), async (req, res) => {
  const updated = await prisma.employee.update({
    where: { id: req.params.id },
    data: { status: "INACTIVE", exitDate: new Date() },
  });
  await prisma.employeeTimeline.create({
    data: { employeeId: updated.id, type: "EXIT", title: "Employee deactivated", happenedAt: new Date() },
  });
  await writeAudit(req.user!.id, "EMPLOYEE_DEACTIVATE", "Employee", updated.id);
  res.json(updated);
});
