import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireRoles } from "../middleware/auth.js";
import { writeAudit } from "../lib/audit.js";

export const locationsRouter = Router();

locationsRouter.get("/sites", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "MANAGER"), async (_req, res) => {
  res.json(await prisma.site.findMany({ orderBy: { siteName: "asc" } }));
});

locationsRouter.post("/sites", requireRoles("SUPER_ADMIN", "HR_ADMIN"), async (req, res) => {
  const parsed = z.object({
    siteName: z.string(),
    address: z.string().optional(),
    latitude: z.number(),
    longitude: z.number(),
    allowedRadius: z.number().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const row = await prisma.site.create({ data: { ...parsed.data, allowedRadius: parsed.data.allowedRadius ?? 100 } });
  await writeAudit(req.user!.id, "SITE_CREATE", "Site", row.id);
  res.status(201).json(row);
});

locationsRouter.put("/sites/:id", requireRoles("SUPER_ADMIN", "HR_ADMIN"), async (req, res) => {
  const row = await prisma.site.update({ where: { id: req.params.id }, data: req.body });
  res.json(row);
});

locationsRouter.get("/home-locations", requireRoles("SUPER_ADMIN", "HR_ADMIN"), async (_req, res) => {
  res.json(await prisma.employeeHomeLocation.findMany({ include: { employee: true } }));
});

locationsRouter.post("/home-location", requireRoles("SUPER_ADMIN", "HR_ADMIN"), async (req, res) => {
  const parsed = z.object({
    employeeId: z.string(),
    address: z.string(),
    latitude: z.number(),
    longitude: z.number(),
    allowedRadius: z.number().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const row = await prisma.employeeHomeLocation.upsert({
    where: { employeeId: parsed.data.employeeId },
    update: { ...parsed.data, allowedRadius: parsed.data.allowedRadius ?? 100, active: true },
    create: { ...parsed.data, allowedRadius: parsed.data.allowedRadius ?? 100 },
  });
  await writeAudit(req.user!.id, "HOME_LOCATION_SAVE", "EmployeeHomeLocation", row.id);
  res.json(row);
});

locationsRouter.post("/employee-site", requireRoles("SUPER_ADMIN", "HR_ADMIN"), async (req, res) => {
  const parsed = z.object({
    employeeId: z.string(),
    siteId: z.string(),
    startDate: z.string(),
    endDate: z.string().optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const row = await prisma.employeeSiteAssignment.create({
    data: {
      employeeId: parsed.data.employeeId,
      siteId: parsed.data.siteId,
      startDate: new Date(parsed.data.startDate),
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : undefined,
    },
    include: { site: true },
  });
  res.status(201).json(row);
});

locationsRouter.get("/employee/:id/setup", requireRoles("SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN"), async (req, res) => {
  const home = await prisma.employeeHomeLocation.findUnique({ where: { employeeId: req.params.id } });
  const sites = await prisma.employeeSiteAssignment.findMany({
    where: { employeeId: req.params.id },
    include: { site: true },
  });
  res.json({ home, sites });
});
