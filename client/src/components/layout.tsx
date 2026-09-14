import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import {
  Bell, Building2, CalendarDays, ClipboardCheck, CreditCard, FileSpreadsheet,
  Home, IndianRupee, LayoutDashboard, LogOut, Menu, Receipt, Settings,
  Shield, Users, Wallet, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useMemo, useState } from "react";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "MANAGER", "FINANCE", "EMPLOYEE"] },
  { to: "/employees", label: "Employees", icon: Users, roles: ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "MANAGER", "FINANCE"] },
  { to: "/attendance", label: "Attendance", icon: CalendarDays, roles: ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN", "MANAGER", "EMPLOYEE"] },
  { to: "/admin/attendance", label: "Live punches", icon: CalendarDays, roles: ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN"] },
  { to: "/admin/locations", label: "Locations", icon: Building2, roles: ["SUPER_ADMIN", "HR_ADMIN"] },
  { to: "/leave", label: "Leave", icon: ClipboardCheck, roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "EMPLOYEE"] },
  { to: "/payroll", label: "Payroll", icon: IndianRupee, roles: ["SUPER_ADMIN", "PAYROLL_ADMIN", "FINANCE", "HR_ADMIN"] },
  { to: "/salary", label: "Salary", icon: Wallet, roles: ["SUPER_ADMIN", "PAYROLL_ADMIN", "HR_ADMIN", "FINANCE", "EMPLOYEE"] },
  { to: "/payslips", label: "Payslips", icon: FileSpreadsheet, roles: ["SUPER_ADMIN", "PAYROLL_ADMIN", "FINANCE", "EMPLOYEE", "HR_ADMIN"] },
  { to: "/compliance", label: "Compliance", icon: Shield, roles: ["SUPER_ADMIN", "PAYROLL_ADMIN", "FINANCE"] },
  { to: "/expenses", label: "Expenses", icon: Receipt, roles: ["SUPER_ADMIN", "FINANCE", "MANAGER", "EMPLOYEE", "HR_ADMIN"] },
  { to: "/loans", label: "Loans & Advances", icon: CreditCard, roles: ["SUPER_ADMIN", "FINANCE", "EMPLOYEE", "HR_ADMIN"] },
  { to: "/reports", label: "Reports", icon: FileSpreadsheet, roles: ["SUPER_ADMIN", "PAYROLL_ADMIN", "FINANCE", "HR_ADMIN"] },
  { to: "/approvals", label: "Approvals", icon: ClipboardCheck, roles: ["SUPER_ADMIN", "HR_ADMIN", "MANAGER", "FINANCE", "PAYROLL_ADMIN"] },
  { to: "/settings", label: "Settings", icon: Settings, roles: ["SUPER_ADMIN", "HR_ADMIN", "PAYROLL_ADMIN"] },
];

const MOBILE_ADMIN = [
  { to: "/", label: "Home", icon: Home },
  { to: "/employees", label: "People", icon: Users },
  { to: "/attendance", label: "Attend", icon: CalendarDays },
  { to: "/leave", label: "Leave", icon: ClipboardCheck },
  { to: "/payroll", label: "Payroll", icon: IndianRupee },
];

const MOBILE_STAFF = [
  { to: "/", label: "Home", icon: Home },
  { to: "/attendance", label: "Punch", icon: CalendarDays },
  { to: "/leave", label: "Leave", icon: ClipboardCheck },
  { to: "/payslips", label: "Payslip", icon: FileSpreadsheet },
  { to: "/salary", label: "Salary", icon: Wallet },
];

export function AppLayout() {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(false);
  const loc = useLocation();
  const navigate = useNavigate();
  const isStaff = user?.role === "EMPLOYEE" || localStorage.getItem("peoplepay_portal") === "staff";
  const items = NAV.filter((n) => can(...(n.roles as never[]))).filter((n) => !(isStaff && ["/employees", "/admin/attendance", "/admin/locations", "/payroll", "/compliance", "/reports", "/approvals", "/settings"].includes(n.to)));
  const mobile = isStaff ? MOBILE_STAFF : MOBILE_ADMIN;
  const crumbs = useMemo(() => loc.pathname.split("/").filter(Boolean), [loc.pathname]);

  return (
    <div className="min-h-screen bg-[#f3f4f6]">
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white transition-transform lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full",
      )}>
        <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-700 text-white font-bold">P</div>
          <div>
            <div className="font-semibold text-slate-900">PeoplePay</div>
            <div className="text-[11px] text-slate-500">{isStaff ? "GMR staff self-service" : "GMR · Payroll + HRMS"}</div>
          </div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)}><X size={18} /></button>
        </div>
        <nav className="space-y-1 overflow-y-auto p-3">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium",
                  isActive ? "bg-indigo-50 text-indigo-800" : "text-slate-600 hover:bg-slate-50",
                )}
              >
                <Icon size={18} />
                {item.label}
              </NavLink>
            );
          })}
        </nav>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <button className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)}><Menu size={18} /></button>
          <div className="hidden text-sm text-slate-500 md:flex">
            <span>Home</span>
            {crumbs.map((c) => (
              <span key={c} className="before:mx-2 before:content-['/'] capitalize">{c.replaceAll("-", " ")}</span>
            ))}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden md:block">
              <input className="pp-input w-56" placeholder="Search employees, payroll..." />
            </div>
            <button className="relative rounded-lg p-2 hover:bg-slate-100"><Bell size={18} /><span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-orange-500" /></button>
            <div className="relative">
              <button onClick={() => setProfile((v) => !v)} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-slate-50">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-700 text-xs font-bold text-white">
                  {(user?.employee?.name ?? user?.email ?? "U")[0].toUpperCase()}
                </div>
                <div className="hidden text-left sm:block">
                  <div className="text-sm font-medium">{user?.employee?.name ?? user?.email}</div>
                  <div className="text-[11px] text-slate-500">{user?.role.replaceAll("_", " ")}</div>
                </div>
              </button>
              {profile && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                  {user?.employee && (
                    <button className="w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => { setProfile(false); navigate(`/employees/${user.employee!.id}`); }}>
                      My profile
                    </button>
                  )}
                  <button className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50" onClick={logout}>
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>
        <main className="px-4 py-6 pb-24 lg:px-8">
          <Outlet />
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-slate-200 bg-white md:hidden">
        {mobile.map((m) => {
          const Icon = m.icon;
          const active = m.to === "/" ? loc.pathname === "/" : loc.pathname.startsWith(m.to);
          return (
            <NavLink key={m.to} to={m.to} className={cn("flex flex-col items-center py-2 text-[11px]", active ? "text-indigo-700" : "text-slate-500")}>
              <Icon size={18} />
              {m.label}
            </NavLink>
          );
        })}
      </nav>
      <div className="hidden" aria-hidden><Building2 /></div>
    </div>
  );
}
