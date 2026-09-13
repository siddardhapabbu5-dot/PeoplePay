import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, signToken } from "../middleware/auth.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const parsed = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valid email and password required" });

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
    include: { employee: { include: { department: true, designation: true } } },
  });
  if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const token = signToken({
    id: user.id,
    email: user.email,
    role: user.role,
    employeeId: user.employee?.id,
  });

  res.json({
    token,
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
      employee: user.employee
        ? {
            id: user.employee.id,
            name: `${user.employee.firstName} ${user.employee.lastName}`.trim(),
            code: user.employee.employeeCode,
            department: user.employee.department?.name,
            designation: user.employee.designation?.name,
            photoPath: user.employee.photoPath,
          }
        : null,
    },
  });
});

authRouter.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Valid email required" });
  res.json({
    message: "If an account exists, a reset link will be sent. Contact your HR admin to reset the password.",
  });
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { employee: { include: { department: true, designation: true } } },
  });
  if (!user) return res.status(404).json({ error: "User not found" });
  res.json({
    id: user.id,
    email: user.email,
    role: user.role,
    employee: user.employee
      ? {
          id: user.employee.id,
          name: `${user.employee.firstName} ${user.employee.lastName}`.trim(),
          code: user.employee.employeeCode,
          department: user.employee.department?.name,
          designation: user.employee.designation?.name,
          photoPath: user.employee.photoPath,
        }
      : null,
  });
});
