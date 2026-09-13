import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function money(n?: number | null) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
}

export function money2(n?: number | null) {
  if (n == null) return "—";
  return Number(n).toLocaleString("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
}

export function fullName(e?: { firstName?: string; lastName?: string } | null) {
  if (!e) return "—";
  return `${e.firstName ?? ""} ${e.lastName ?? ""}`.trim();
}

export function monthLabel(year: number, month: number) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
}
