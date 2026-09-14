import { useEffect, useState } from "react";
import { api, download } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { fullName, money2, monthLabel } from "@/lib/utils";
import { Button, Card, ConfirmDialog, LoadingState, Select, StatusBadge } from "@/components/ui";
import { toast } from "sonner";

const STEPPER = ["Attendance", "Inputs", "Calculation", "Review", "Approval", "Lock", "Payslips", "Disbursement"];

export function PayrollPage() {
  const [list, setList] = useState<any>(null);
  const [current, setCurrent] = useState<any>(null);
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(7);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"approve" | "lock" | "reject" | null>(null);

  async function refreshList() {
    const data = await api<any>("/api/payroll");
    setList(data);
    if (data.rows?.[0] && !current) {
      const full = await api(`/api/payroll/${data.rows[0].id}`);
      setCurrent(full);
    }
  }
  useEffect(() => { refreshList(); }, []);

  async function openId(id: string) {
    setCurrent(await api(`/api/payroll/${id}`));
  }

  async function run() {
    setBusy(true);
    try {
      const row = await api<any>("/api/payroll/run", { method: "POST", body: JSON.stringify({ year, month }) });
      toast.success("Payroll calculated");
      setCurrent(row);
      refreshList();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function act(path: string, ok: string) {
    if (!current) return;
    setBusy(true);
    try {
      const row = await api(`/api/payroll/${current.id}/${path}`, { method: "POST" });
      toast.success(ok);
      await openId(current.id);
      setCurrent((c: any) => ({ ...c, ...row }));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  }

  const stepIndex = current
    ? Math.min(STEPPER.length - 1, Math.max(0, Math.floor(((current.step ?? 1) - 1) / 2)))
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Payroll</h1>
          <p className="text-sm text-slate-500">Guided run — lock is blocked until finance/payroll approval</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm">Company
            <Select><option>GMR</option></Select>
          </label>
          <label className="text-sm">Entity
            <Select><option>GMR India</option></Select>
          </label>
          <label className="text-sm">Payroll Group
            <Select><option>Monthly Staff</option></Select>
          </label>
          <label className="text-sm">Year
            <Select value={year} onChange={(e) => setYear(Number(e.target.value))}><option>2026</option></Select>
          </label>
          <label className="text-sm">Month
            <Select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
              {Array.from({ length: 12 }, (_, i) => <option key={i + 1} value={i + 1}>{monthLabel(2026, i + 1)}</option>)}
            </Select>
          </label>
          <Button disabled={busy} onClick={run}>Process Payroll</Button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap gap-2">
          {STEPPER.map((s, i) => (
            <div key={s} className={`rounded-full px-3 py-1 text-xs font-semibold ${i <= stepIndex ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-500"}`}>
              {i + 1}. {s}
            </div>
          ))}
        </div>
        {current && (
          <p className="mt-3 text-sm text-slate-500">
            {monthLabel(current.year, current.month)} · {current.periodStart?.slice(0, 10)} — {current.periodEnd?.slice(0, 10)} · <StatusBadge status={current.status} />
          </p>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card><div className="text-sm text-slate-500">Employees</div><div className="text-2xl font-semibold">{current?.employeeCount ?? "—"}</div></Card>
        <Card><div className="text-sm text-slate-500">Gross</div><div className="text-2xl font-semibold">{money2(current?.totalGross)}</div></Card>
        <Card><div className="text-sm text-slate-500">Net</div><div className="text-2xl font-semibold text-emerald-700">{money2(current?.totalNet)}</div></Card>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" disabled={!current || busy} onClick={() => act("review", "Moved to review")}>Review Payroll</Button>
        <Button variant="success" disabled={!current || busy} onClick={() => setConfirm("approve")}>Approve</Button>
        <Button variant="warn" disabled={!current || busy} onClick={() => setConfirm("lock")}>Lock Payroll</Button>
        <Button disabled={!current || busy} onClick={() => act("payslips", "Payslips generated")}>Generate Payslips</Button>
        <Button variant="ghost" disabled={!current || busy} onClick={() => act("disburse", "Marked disbursed")}>Salary Disbursement</Button>
        {current && (
          <>
            <Button variant="ghost" onClick={() => download(`/api/payroll/${current.id}/export.xlsx`, "payroll.xlsx")}>Export Excel</Button>
            <Button variant="ghost" onClick={() => download(`/api/payroll/${current.id}/export.pdf`, "salary-register.pdf")}>Export PDF</Button>
          </>
        )}
      </div>

      <Card>
        {!current ? <LoadingState /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>{["ID", "Name", "Dept", "Paid", "LOP", "OT", "Gross", "Deductions", "Net"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {current.lines?.map((l: any) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{l.employee.employeeCode}</td>
                    <td className="px-3 py-2">{fullName(l.employee)}</td>
                    <td className="px-3 py-2">{l.employee.department?.name}</td>
                    <td className="px-3 py-2">{Number(l.paidDays)}</td>
                    <td className="px-3 py-2">{Number(l.lopDays)}</td>
                    <td className="px-3 py-2">{money2(l.overtimeAmount)}</td>
                    <td className="px-3 py-2">{money2(l.grossEarnings)}</td>
                    <td className="px-3 py-2">{money2(l.totalDeductions)}</td>
                    <td className="px-3 py-2 font-semibold">{money2(l.netSalary)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {list?.rows?.length > 1 && (
        <Card>
          <h3 className="mb-2 font-semibold">Previous runs</h3>
          <div className="flex flex-wrap gap-2">
            {list.rows.map((r: any) => (
              <button key={r.id} onClick={() => openId(r.id)} className="rounded-xl border px-3 py-2 text-sm hover:bg-slate-50">
                {monthLabel(r.year, r.month)} · <StatusBadge status={r.status} />
              </button>
            ))}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={confirm === "approve"}
        title="Approve payroll"
        body="Approve this payroll run? Locking will only be possible after approval."
        confirmLabel="Approve"
        onClose={() => setConfirm(null)}
        onConfirm={() => act("approve", "Payroll approved")}
      />
      <ConfirmDialog
        open={confirm === "lock"}
        title="Lock payroll"
        body="Locking freezes calculations. This is blocked unless the run is already approved."
        danger
        confirmLabel="Lock"
        onClose={() => setConfirm(null)}
        onConfirm={() => act("lock", "Payroll locked")}
      />
    </div>
  );
}

export function SalaryPage() {
  const { user } = useAuth();
  const [own, setOwn] = useState<any>(null);
  const [components, setComponents] = useState<any[]>([]);
  const [structures, setStructures] = useState<any[]>([]);
  useEffect(() => {
    if (user?.employee?.id) {
      api<any>(`/api/salary/employee/${user.employee.id}`).then(setOwn).catch(() => setOwn(null));
    }
    api<any[]>("/api/salary/components").then(setComponents).catch(() => setComponents([]));
    api<any[]>("/api/salary/structures").then(setStructures).catch(() => setStructures([]));
  }, [user?.employee?.id]);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">{user?.role === "EMPLOYEE" || localStorage.getItem("peoplepay_portal") === "staff" ? "My salary" : "Salary structures"}</h1>
      {own?.current && (
        <Card>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><div className="text-sm text-slate-500">Monthly CTC</div><div className="text-xl font-semibold">{money2(own.current.ctc)}</div></div>
            <div><div className="text-sm text-slate-500">Gross</div><div className="text-xl font-semibold">{money2(own.current.grossSalary)}</div></div>
            <div className="text-sm">Basic {money2(own.current.basic)}</div>
            <div className="text-sm">HRA {money2(own.current.hra)}</div>
            <div className="text-sm">Conveyance {money2(own.current.conveyance)}</div>
            <div className="text-sm">Special {money2(own.current.special)}</div>
          </div>
        </Card>
      )}
      {user?.role !== "EMPLOYEE" && localStorage.getItem("peoplepay_portal") !== "staff" && (
        <>
          <Card>
            <h3 className="mb-3 font-semibold">Components</h3>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {components.map((c) => (
                <div key={c.id} className="rounded-xl border border-slate-100 p-3 text-sm">
                  <div className="font-medium">{c.name}</div>
                  <div className="text-slate-500">{c.type} · {c.calcType}</div>
                </div>
              ))}
            </div>
          </Card>
          {structures.map((s) => (
            <Card key={s.id}>
              <h3 className="font-semibold">{s.name}</h3>
              <p className="text-sm text-slate-500">Effective {s.effectiveFrom?.slice(0, 10)}</p>
              <ul className="mt-2 text-sm">
                {s.items?.map((i: any) => <li key={i.id}>{i.component?.name} — {i.calcType} {Number(i.amount) || `${Number(i.percentage)}%`}</li>)}
              </ul>
            </Card>
          ))}
        </>
      )}
    </div>
  );
}

export function PayslipsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  useEffect(() => { api<any[]>("/api/payslips").then(setRows); }, []);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Payslips</h1>
      <Card>
        {!rows ? <LoadingState /> : (
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr>{["Employee", "Period", "Net", "Download"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{fullName(r.employee)} ({r.employee?.employeeCode})</td>
                  <td className="px-3 py-2">{monthLabel(r.year, r.month)}</td>
                  <td className="px-3 py-2">{money2(r.line?.netSalary)}</td>
                  <td className="px-3 py-2"><Button variant="ghost" onClick={() => download(`/api/payslips/${r.id}/pdf`, `payslip.pdf`)}>PDF</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
