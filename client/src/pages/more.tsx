import { useEffect, useState } from "react";
import { api, download } from "@/lib/api";
import { fullName, money2 } from "@/lib/utils";
import { Button, Card, Input, LoadingState, Modal, Select, StatusBadge, Textarea } from "@/components/ui";
import { toast } from "sonner";

export function ExpensesPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => api<any[]>("/api/expenses").then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <Module title="Expenses" action={<Button onClick={() => setOpen(true)}>Submit expense</Button>}>
      <Card>
        {!rows ? <LoadingState /> : (
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr>{["Employee", "Type", "Date", "Amount", "Project", "Status", ""].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{fullName(r.employee)}</td>
                  <td className="px-3 py-2">{r.type}</td>
                  <td className="px-3 py-2">{r.date?.slice(0, 10)}</td>
                  <td className="px-3 py-2">{money2(r.amount)}</td>
                  <td className="px-3 py-2">{r.project}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2">
                    {r.status === "SUBMITTED" && (
                      <Button variant="success" onClick={async () => { await api(`/api/expenses/${r.id}/decide`, { method: "PUT", body: JSON.stringify({ status: "APPROVED" }) }); toast.success("Approved — will flow into next payroll"); load(); }}>Approve</Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Modal open={open} title="New expense" onClose={() => setOpen(false)}>
        <ExpenseForm onDone={() => { setOpen(false); load(); }} />
      </Modal>
    </Module>
  );
}

function ExpenseForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ type: "Travel", date: "", amount: 0, description: "", project: "", submit: true });
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      await api("/api/expenses", { method: "POST", body: JSON.stringify({ ...form, amount: Number(form.amount) }) });
      toast.success("Expense submitted");
      onDone();
    }}>
      <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
        <option>Travel</option><option>Food</option><option>Fuel</option><option>Site material</option><option>Other</option>
      </Select>
      <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
      <Input type="number" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
      <Input placeholder="Project / Site" value={form.project} onChange={(e) => setForm({ ...form, project: e.target.value })} />
      <Textarea placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
      <p className="text-xs text-slate-500">Receipt photo / PDF can be attached in a later upload. Approved amounts automatically enter payroll reimbursements.</p>
      <Button type="submit">Submit</Button>
    </form>
  );
}

export function LoansPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const load = () => api<any[]>("/api/loans").then(setRows);
  useEffect(() => { load(); }, []);
  return (
    <Module title="Loans & Advances" action={<Button onClick={() => setOpen(true)}>Apply</Button>}>
      <Card>
        {!rows ? <LoadingState /> : rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between border-b py-3 text-sm">
            <div>
              <div className="font-medium">{fullName(r.employee)} · {r.type}</div>
              <div className="text-slate-500">EMI {money2(r.emi)} · Balance {money2(r.balance)} · {r.tenureMonths} months</div>
            </div>
            <div className="flex items-center gap-2">
              <StatusBadge status={r.status} />
              {r.status === "PENDING" && <Button variant="success" onClick={async () => { await api(`/api/loans/${r.id}/decide`, { method: "PUT", body: JSON.stringify({ status: "APPROVED" }) }); load(); }}>Approve</Button>}
            </div>
          </div>
        ))}
      </Card>
      <Modal open={open} title="Loan / salary advance" onClose={() => setOpen(false)}>
        <LoanForm onDone={() => { setOpen(false); load(); }} />
      </Modal>
    </Module>
  );
}

function LoanForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ type: "ADVANCE", amount: 5000, interest: 0, tenureMonths: 5, startMonth: "2026-09-01" });
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      await api("/api/loans", { method: "POST", body: JSON.stringify(form) });
      toast.success("Submitted for finance approval");
      onDone();
    }}>
      <Select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}><option>ADVANCE</option><option>LOAN</option></Select>
      <Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
      <Input type="number" value={form.interest} onChange={(e) => setForm({ ...form, interest: Number(e.target.value) })} placeholder="Interest %" />
      <Input type="number" value={form.tenureMonths} onChange={(e) => setForm({ ...form, tenureMonths: Number(e.target.value) })} />
      <Input type="date" value={form.startMonth} onChange={(e) => setForm({ ...form, startMonth: e.target.value })} />
      <Button type="submit">Submit</Button>
    </form>
  );
}

export function ApprovalsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const load = () => api<any[]>("/api/approvals").then(setRows);
  useEffect(() => { load(); }, []);
  const groups = ["LEAVE", "ATTENDANCE_REGULARIZATION", "EXPENSE", "SALARY_REVISION", "LOAN", "PAYROLL"];
  return (
    <Module title="Approval center">
      <div className="grid gap-4 md:grid-cols-2">
        {groups.map((g) => (
          <Card key={g}>
            <h3 className="mb-3 font-semibold">{g.replaceAll("_", " ")}</h3>
            {rows?.filter((r) => r.type === g).map((r) => (
              <div key={r.id} className="mb-3 rounded-xl border border-slate-100 p-3 text-sm">
                <div className="font-medium">{r.title}</div>
                <div className="text-slate-500">{r.amountOrDays} · {new Date(r.submittedAt).toLocaleDateString("en-IN")}</div>
                <div className="mt-2 flex gap-2">
                  <Button variant="success" onClick={async () => { await api(`/api/approvals/${r.id}/decide`, { method: "POST", body: JSON.stringify({ status: "APPROVED" }) }); toast.success("Approved"); load(); }}>Approve</Button>
                  <Button variant="danger" onClick={async () => { await api(`/api/approvals/${r.id}/decide`, { method: "POST", body: JSON.stringify({ status: "REJECTED" }) }); load(); }}>Reject</Button>
                </div>
              </div>
            ))}
            {rows && !rows.some((r) => r.type === g) && <p className="text-sm text-slate-400">No pending items</p>}
          </Card>
        ))}
      </div>
    </Module>
  );
}

export function ReportsPage() {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(7);
  const reports = [
    ["Payroll Register", `/api/reports/payroll?year=${year}&month=${month}&format=xlsx`, "xlsx"],
    ["Salary Register PDF", `/api/payroll`, "nav"],
    ["Attendance", `/api/reports/attendance?year=${year}&month=${month}&format=xlsx`, "xlsx"],
    ["Employee Master", `/api/employees/export`, "xlsx"],
  ];
  return (
    <Module title="Reports">
      <Card>
        <div className="mb-4 flex gap-2">
          <Select value={year} onChange={(e) => setYear(Number(e.target.value))}><option>2026</option></Select>
          <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
          </Select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {["Employee Master", "Attendance", "Leave", "Payroll Register", "Salary Register", "Department Salary", "Bank Transfer", "PF Report", "ESI Report", "PT Report", "TDS Report", "LWF Report", "Expense Report", "Loan Report", "Full & Final"].map((name) => (
            <button
              key={name}
              className="rounded-2xl border border-slate-200 bg-white p-4 text-left hover:border-indigo-300"
              onClick={() => {
                if (name.includes("Attendance")) download(`/api/reports/attendance?year=${year}&month=${month}&format=xlsx`, "attendance.xlsx");
                else if (name.includes("Payroll") || name.includes("Salary") || name.includes("Bank") || name.includes("PF") || name.includes("ESI") || name.includes("PT") || name.includes("TDS") || name.includes("LWF") || name.includes("Department")) {
                  download(`/api/reports/payroll?year=${year}&month=${month}&format=xlsx`, "payroll.xlsx");
                } else if (name.includes("Employee")) {
                  window.location.href = "/employees";
                } else {
                  toast.message(`${name} uses the payroll / module export for the selected period`);
                }
              }}
            >
              <div className="font-semibold">{name}</div>
              <div className="text-xs text-slate-500">Excel · PDF · CSV</div>
            </button>
          ))}
        </div>
        <div className="mt-4 hidden">{reports.length}</div>
      </Card>
    </Module>
  );
}

export function CompliancePage() {
  const [rules, setRules] = useState<any[]>([]);
  useEffect(() => {
    api<any>("/api/settings").then((d) => setRules(d.rules ?? [])).catch(() => setRules([]));
  }, []);
  return (
    <Module title="Statutory compliance">
      <p className="mb-3 text-sm text-slate-500">Rates live in the database. Update them here — they are not hard-coded in the payroll engine.</p>
      <div className="grid gap-3">
        {rules.map((r) => (
          <Card key={r.id}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="font-semibold">{r.ruleName} ({r.code})</div>
                <div className="text-sm text-slate-500">{r.state} · effective {r.effectiveDate?.slice(0, 10)}</div>
              </div>
              <StatusBadge status={r.status} />
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-4 text-sm">
              <KV label="Employee %" value={String(r.employeeRate)} />
              <KV label="Employer %" value={String(r.employerRate)} />
              <KV label="Min wage" value={String(r.minimumWage)} />
              <KV label="Max / threshold" value={`${r.maximumWage} / ${r.threshold}`} />
            </div>
          </Card>
        ))}
      </div>
    </Module>
  );
}

export function SettingsPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api("/api/settings").then(setData); }, []);
  if (!data) return <LoadingState />;
  return (
    <Module title="Settings">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="font-semibold">Company</h3>
          <KV label="Name" value={data.company?.name} />
          <KV label="Legal" value={data.company?.legalName} />
          <KV label="City" value={data.company?.city} />
        </Card>
        <Card>
          <h3 className="font-semibold">Departments</h3>
          {data.departments.map((d: any) => <div key={d.id} className="py-1 text-sm">{d.name}</div>)}
        </Card>
        <Card>
          <h3 className="font-semibold">Designations</h3>
          {data.designations.map((d: any) => <div key={d.id} className="py-1 text-sm">{d.name}</div>)}
        </Card>
        <Card>
          <h3 className="font-semibold">Shifts</h3>
          {data.shifts.map((s: any) => <div key={s.id} className="py-1 text-sm">{s.name} {s.startTime}–{s.endTime} OT {s.otStart}</div>)}
        </Card>
        <Card>
          <h3 className="font-semibold">Users & roles</h3>
          {data.users.map((u: any) => <div key={u.id} className="flex justify-between py-1 text-sm"><span>{u.email}</span><StatusBadge status={u.role} /></div>)}
        </Card>
        <Card>
          <h3 className="font-semibold">Holiday calendar</h3>
          {data.holidays.map((h: any) => <div key={h.id} className="py-1 text-sm">{h.date?.slice(0, 10)} · {h.name}</div>)}
        </Card>
      </div>
    </Module>
  );
}

function Module({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{title}</h1>
        {action}
      </div>
      {children}
    </div>
  );
}
function KV({ label, value }: { label: string; value?: string }) {
  return <div className="flex justify-between py-1 text-sm"><span className="text-slate-500">{label}</span><span>{value}</span></div>;
}
