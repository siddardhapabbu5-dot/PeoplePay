import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarDays, ClipboardCheck, Receipt, Wallet, FileSpreadsheet, UserRound } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Card, LoadingState } from "@/components/ui";
import { PunchCard } from "@/components/punch-card";
import { money2 } from "@/lib/utils";

export function StaffHomePage() {
  const { user } = useAuth();
  const [balances, setBalances] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    Promise.all([
      api<any[]>("/api/leaves/balances").catch(() => []),
      api<any[]>("/api/payslips").catch(() => []),
    ]).then(([b, p]) => {
      setBalances(b);
      setPayslips(p.slice(0, 3));
      setReady(true);
    });
  }, []);

  if (!ready) return <LoadingState />;

  const links = [
    { to: user?.employee ? `/employees/${user.employee.id}` : "/", label: "My profile", icon: UserRound },
    { to: "/attendance", label: "Attendance", icon: CalendarDays },
    { to: "/leave", label: "Leave", icon: ClipboardCheck },
    { to: "/payslips", label: "Payslips", icon: FileSpreadsheet },
    { to: "/salary", label: "Salary", icon: Wallet },
    { to: "/expenses", label: "Expenses", icon: Receipt },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Hello, {user?.employee?.name ?? "there"}</h1>
        <p className="text-sm text-slate-500">
          {user?.employee?.code} · {user?.employee?.designation} · {user?.employee?.department}
        </p>
      </div>
      <PunchCard />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {links.map((l) => {
          const Icon = l.icon;
          return (
            <Link key={l.to} to={l.to} className="pp-card flex items-center gap-3 p-4 hover:border-indigo-200">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-50 text-indigo-700">
                <Icon size={18} />
              </div>
              <div className="font-medium">{l.label}</div>
            </Link>
          );
        })}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Leave balance</h3>
          {balances.length === 0 && <p className="text-sm text-slate-500">No leave balances found.</p>}
          {balances.map((b) => (
            <div key={b.id} className="flex justify-between border-b border-slate-100 py-2 text-sm">
              <span>{b.leaveType?.name}</span>
              <span className="font-medium">{Number(b.entitled) - Number(b.used)} left</span>
            </div>
          ))}
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Latest payslips</h3>
          {payslips.length === 0 && <p className="text-sm text-slate-500">No payslip yet.</p>}
          {payslips.map((p) => (
            <div key={p.id} className="flex justify-between border-b border-slate-100 py-2 text-sm">
              <span>{p.month}/{p.year}</span>
              <span className="font-medium">{money2(p.line?.netSalary)}</span>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}
