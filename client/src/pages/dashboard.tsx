import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { money } from "@/lib/utils";
import { Card, LoadingState } from "@/components/ui";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const COLORS = ["#1e3a8a", "#2563eb", "#059669", "#ea580c", "#dc2626", "#7c3aed"];

export function DashboardPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api("/api/dashboard").then(setData).catch(() => setData(null)); }, []);
  if (!data) return <LoadingState />;
  const c = data.cards;
  const cards = [
    ["Total Employees", c.totalEmployees],
    ["Active Employees", c.activeEmployees],
    ["Present Today", c.presentToday, "green"],
    ["Absent Today", c.absentToday, "red"],
    ["On Leave", c.onLeave, "orange"],
    ["Payroll Cost", money(c.payrollCost)],
    ["Net Salary", money(c.netSalary)],
    ["Pending Approvals", c.pendingApprovals, "orange"],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="text-sm text-slate-500">Workforce, attendance and payroll at a glance</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value, tone]) => (
          <Card key={label}>
            <div className="text-sm text-slate-500">{label}</div>
            <div className={`mt-2 text-2xl font-semibold ${tone === "green" ? "text-emerald-600" : tone === "red" ? "text-red-600" : tone === "orange" ? "text-orange-600" : "text-slate-900"}`}>{value ?? "—"}</div>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Monthly Payroll Cost</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.charts.monthlyPayroll}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="gross" fill="#1e3a8a" name="Gross" radius={6} />
              <Bar dataKey="net" fill="#059669" name="Net" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Department Salary Cost</h3>
          <ResponsiveContainer width="100%" height={240}>
            <PieChart>
              <Pie data={data.charts.departmentSalary} dataKey="value" nameKey="name" outerRadius={90}>
                {data.charts.departmentSalary.map((_: unknown, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Headcount</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data.charts.headcount}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Attendance Trend</h3>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={data.charts.attendance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="value" stroke="#1d4ed8" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
        <Card className="xl:col-span-2">
          <h3 className="mb-3 font-semibold">Leave Trend</h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.charts.leave}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#ea580c" radius={6} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      <Card>
        <h3 className="mb-3 font-semibold">Recent activity</h3>
        <div className="divide-y">
          {data.activity.map((a: any) => (
            <div key={a.id} className="flex items-center justify-between py-3 text-sm">
              <div>
                <div className="font-medium">{pretty(a.action)}</div>
                <div className="text-slate-500">{a.entity}{a.details ? ` · ${a.details}` : ""}</div>
              </div>
              <div className="text-xs text-slate-400">{new Date(a.at).toLocaleString("en-IN")}</div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

function pretty(action: string) {
  const map: Record<string, string> = {
    PAYROLL_RUN: "Payroll processed",
    EMPLOYEE_CREATE: "Employee joined",
    LEAVE_APPROVE: "Leave approved",
    EXPENSE_APPROVED: "Expense approved",
    SALARY_REVISION: "Salary revised",
  };
  return map[action] ?? action.replaceAll("_", " ");
}
