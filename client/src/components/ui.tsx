import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Button({
  variant = "primary",
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "danger" | "success" | "warn" }) {
  const map = {
    primary: "pp-btn-primary",
    ghost: "pp-btn-ghost",
    danger: "pp-btn-danger",
    success: "pp-btn-success",
    warn: "pp-btn-warn",
  };
  return <button className={cn("pp-btn", map[variant], className)} {...props} />;
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("pp-input", props.className)} {...props} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("pp-input", props.className)} {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("pp-input min-h-24", props.className)} {...props} />;
}

export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("pp-card p-5", className)}>{children}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    ACTIVE: "bg-emerald-50 text-emerald-700",
    PRESENT: "bg-emerald-50 text-emerald-700",
    APPROVED: "bg-emerald-50 text-emerald-700",
    PAID: "bg-emerald-50 text-emerald-700",
    DISBURSED: "bg-emerald-50 text-emerald-700",
    LOCKED: "bg-emerald-50 text-emerald-700",
    PENDING: "bg-orange-50 text-orange-700",
    SUBMITTED: "bg-orange-50 text-orange-700",
    REVIEW: "bg-orange-50 text-orange-700",
    DRAFT: "bg-slate-100 text-slate-600",
    WEEK_OFF: "bg-slate-100 text-slate-600",
    HOLIDAY: "bg-indigo-50 text-indigo-700",
    LEAVE: "bg-sky-50 text-sky-700",
    HALF_DAY: "bg-amber-50 text-amber-700",
    WORKING: "bg-emerald-50 text-emerald-700",
    PUNCHED_OUT: "bg-indigo-50 text-indigo-700",
    ON_BREAK: "bg-orange-50 text-orange-700",
    NOT_PUNCHED_IN: "bg-slate-100 text-slate-600",
    LATE: "bg-amber-50 text-amber-700",
    REJECTED: "bg-red-50 text-red-700",
    ABSENT: "bg-red-50 text-red-700",
    INACTIVE: "bg-red-50 text-red-700",
    CALCULATED: "bg-blue-50 text-blue-700",
    PAYSLIPS_GENERATED: "bg-emerald-50 text-emerald-700",
  };
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold", map[status] ?? "bg-slate-100 text-slate-700")}>
      {status.replaceAll("_", " ")}
    </span>
  );
}

export function EmployeeAvatar({ name, src }: { name: string; src?: string | null }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map((p) => p[0]).join("").toUpperCase();
  if (src) return <img src={src} alt={name} className="h-9 w-9 rounded-full object-cover" />;
  return (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700">
      {initials || "?"}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-16 text-center text-slate-500">
      <div className="text-base font-semibold text-slate-700">{title}</div>
      {hint && <div className="mt-1 text-sm">{hint}</div>}
    </div>
  );
}

export function LoadingState() {
  return <div className="animate-pulse py-12 text-center text-slate-400">Loading…</div>;
}

export function Modal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Modal open={open} title={title} onClose={onClose}>
      <p className="mb-6 text-sm text-slate-600">{body}</p>
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between pt-4 text-sm text-slate-500">
      <span>{total} records</span>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Prev</Button>
        <span className="px-2 py-2">{page} / {pages}</span>
        <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
