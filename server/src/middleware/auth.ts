import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { UserRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type AuthUser = {
  id: string;
  email: string;
  role: UserRole;
  employeeId?: string;
};

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function signToken(user: AuthUser) {
  return jwt.sign(user, process.env.JWT_SECRET || "peoplepay-dev-secret-change-in-production", {
    expiresIn: process.env.JWT_EXPIRES_IN || "12h",
  });
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice(7) : undefined;
  if (!token) return res.status(401).json({ error: "Authentication required" });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET || "peoplepay-dev-secret-change-in-production") as AuthUser;
    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { employee: true },
    });
    if (!user || user.status !== "ACTIVE") return res.status(401).json({ error: "Invalid session" });
    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      employeeId: user.employee?.id,
    };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

export function requireRoles(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return res.status(401).json({ error: "Authentication required" });
    if (req.user.role === "SUPER_ADMIN") return next();
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You do not have permission for this action" });
    }
    next();
  };
}

export function canSeeSalary(role: UserRole) {
  return ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "FINANCE"].includes(role);
}

export function isSelfOrPrivileged(req: Request, employeeId: string) {
  if (!req.user) return false;
  if (["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "FINANCE"].includes(req.user.role)) return true;
  return req.user.employeeId === employeeId;
}
