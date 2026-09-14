import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, signToken } from "../middleware/auth.js";

export const authRouter = Router();

function sessionEmployee(employee: {
  id: string;
  firstName: string;
  lastName: string;
  employeeCode: string;
  photoPath: string | null;
  department: { name: string } | null;
  designation: { name: string } | null;
} | null) {
  if (!employee) return null;
  return {
    id: employee.id,
    name: `${employee.firstName} ${employee.lastName}`.trim(),
    code: employee.employeeCode,
    department: employee.department?.name,
    designation: employee.designation?.name,
    photoPath: employee.photoPath,
  };
}

authRouter.post("/login", async (req, res) => {
  const parsed = z.object({
    email: z.string().optional(),
    login: z.string().optional(),
    password: z.string().min(1),
    portal: z.enum(["admin", "staff"]).optional(),
  }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Employee ID or email and password required" });

  const identifier = (parsed.data.login || parsed.data.email || "").trim();
  if (!identifier) return res.status(400).json({ error: "Enter your employee ID or email" });

  const include = { employee: { include: { department: true, designation: true } } } as const;
  let user = identifier.includes("@")
    ? await prisma.user.findFirst({
        where: { email: identifier.toLowerCase(), status: "ACTIVE" },
        include,
      })
    : null;

  if (!user) {
    const employee = await prisma.employee.findFirst({
      where: {
        OR: [
          { employeeCode: { equals: identifier, mode: "insensitive" } },
          { personalEmail: { equals: identifier.toLowerCase(), mode: "insensitive" } },
        ],
      },
      include: { user: { include } },
    });
    user = employee?.user ?? null;
    if (!user && employee) {
      return res.status(401).json({ error: "This employee does not have a login yet. Ask HR to enable staff access." });
    }
  }

  if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Invalid credentials" });
  const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  if (parsed.data.portal === "staff" && !user.employee) {
    return res.status(403).json({
      error: "This is an admin account. On Staff sign-in use an employee ID such as EMP002, then password Admin@123.",
    });
  }

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
      employee: sessionEmployee(user.employee),
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
    employee: sessionEmployee(user.employee),
  });
});
