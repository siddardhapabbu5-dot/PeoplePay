import { useEffect, useState } from "react";
import { api, download } from "@/lib/api";
import { fullName } from "@/lib/utils";
import { Button, Card, Input, LoadingState, Modal, Select, StatusBadge, Textarea } from "@/components/ui";
import { PunchCard } from "@/components/punch-card";
import { toast } from "sonner";

export function StaffAttendancePage() {
  const [rows, setRows] = useState<any[] | null>(null);
  function load() {
    const now = new Date();
    const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    api<any[]>(`/api/attendance?from=${from}&to=${to}`).then(setRows).catch(() => setRows([]));
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Attendance</h1>
        <p className="text-sm text-slate-500">Punch in when you start work and punch out when you finish.</p>
      </div>
      <PunchCard />
      <Card>
        <h3 className="mb-3 font-semibold">This month</h3>
        {!rows ? <LoadingState /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>{["Date", "In", "Out", "Hours", "OT", "Status"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.slice(0, 40).map((r) => (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-3 py-2">{r.date?.slice(0, 10)}</td>
                    <td className="px-3 py-2">{r.punchIn ?? "—"}</td>
                    <td className="px-3 py-2">{r.punchOut ?? "—"}</td>
                    <td className="px-3 py-2">{Number(r.workingHours ?? 0).toFixed(2)}</td>
                    <td className="px-3 py-2">{r.overtimeMin ?? 0}m</td>
                    <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export function AttendancePage() {
  const [tab, setTab] = useState("Daily");
  const [rows, setRows] = useState<any[] | null>(null);
  const [open, setOpen] = useState(false);
  const [reg, setReg] = useState(false);

  function load() {
    const now = new Date();
    const from = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1)).toISOString().slice(0, 10);
    const to = new Date().toISOString().slice(0, 10);
    api<any[]>(`/api/attendance?from=${from}&to=${to}`).then(setRows);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Attendance</h1>
          <p className="text-sm text-slate-500">Shift 10:00–18:30 · OT after 19:30 · early logout after 17:30 is a full day</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => download("/api/attendance/export?year=2026&month=7", "attendance-july-2026.xlsx")}>Export</Button>
          <Button variant="ghost" onClick={() => setReg(true)}>Regularize</Button>
          <Button onClick={() => setOpen(true)}>Add / Import punch</Button>
        </div>
      </div>
      <div className="flex gap-2">
        {["Daily", "Monthly", "Regularization", "Shifts", "Overtime"].map((t) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1 text-sm ${tab === t ? "bg-indigo-700 text-white" : "bg-white border"}`}>{t}</button>
        ))}
      </div>
      {tab === "Shifts" && (
        <Card>
          <h3 className="font-semibold">General shift</h3>
          <p className="mt-2 text-sm text-slate-600">Start 10:00 · End 18:30 · OT starts 19:30 · Full day after 17:30 · 2-hour early logout deducts pay.</p>
        </Card>
      )}
      {tab === "Overtime" && (
        <Card>
          <p className="text-sm text-slate-600">Overtime is calculated automatically when punch-out is after 7:30 PM, at the per-minute daily rate (monthly salary / days / 510 minutes).</p>
        </Card>
      )}
      {["Daily", "Monthly", "Regularization"].includes(tab) && (
        <Card>
          {!rows ? <LoadingState /> : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="text-xs uppercase text-slate-500">
                  <tr>{["Employee", "Date", "Shift", "In", "Out", "Hours", "OT", "Status"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.slice(0, 80).map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="px-3 py-2">{fullName(r.employee)} <span className="text-slate-400">{r.employee?.employeeCode}</span></td>
                      <td className="px-3 py-2">{r.date?.slice(0, 10)}</td>
                      <td className="px-3 py-2">{r.employee?.shift?.name ?? "General"}</td>
                      <td className="px-3 py-2">{r.punchIn ?? "—"}</td>
                      <td className="px-3 py-2">{r.punchOut ?? "—"}</td>
                      <td className="px-3 py-2">{Number(r.workingHours).toFixed(2)}</td>
                      <td className="px-3 py-2">{r.overtimeMin}m</td>
                      <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}
      <PunchModal open={open} onClose={() => { setOpen(false); load(); }} />
      <RegModal open={reg} onClose={() => setReg(false)} />
    </div>
  );
}

function PunchModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [employees, setEmployees] = useState<any[]>([]);
  const [form, setForm] = useState({ employeeId: "", date: "", punchIn: "10:05 AM", punchOut: "06:40 PM" });
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => { api<any>("/api/employees?pageSize=100").then((d) => setEmployees(d.rows ?? [])); }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (file) {
      const fd = new FormData();
      fd.append("file", file);
      await api("/api/attendance/import", { method: "POST", body: fd });
      toast.success("Biometric / Excel import completed");
    } else {
      await api("/api/attendance", { method: "POST", body: JSON.stringify(form) });
      toast.success("Attendance saved");
    }
    onClose();
  }
  return (
    <Modal open={open} title="Attendance entry / biometric import" onClose={onClose}>
      <form className="space-y-3" onSubmit={save}>
        <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
          <option value="">Select employee</option>
          {employees.map((e) => <option key={e.id} value={e.id}>{e.employeeCode} {fullName(e)}</option>)}
        </Select>
        <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Punch in" value={form.punchIn} onChange={(e) => setForm({ ...form, punchIn: e.target.value })} />
          <Input placeholder="Punch out" value={form.punchOut} onChange={(e) => setForm({ ...form, punchOut: e.target.value })} />
        </div>
        <label className="block text-sm">CSV / Excel biometric import
          <input className="mt-1 block" type="file" accept=".csv,.xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <Button type="submit">Save</Button>
      </form>
    </Modal>
  );
}

function RegModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [form, setForm] = useState({ date: "", punchIn: "", punchOut: "", reason: "" });
  return (
    <Modal open={open} title="Attendance regularization" onClose={onClose}>
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault();
        await api("/api/attendance/regularize", { method: "POST", body: JSON.stringify(form) });
        toast.success("Sent for approval");
        onClose();
      }}>
        <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} required />
        <Input placeholder="Punch in" value={form.punchIn} onChange={(e) => setForm({ ...form, punchIn: e.target.value })} />
        <Input placeholder="Punch out" value={form.punchOut} onChange={(e) => setForm({ ...form, punchOut: e.target.value })} />
        <Textarea placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} required />
        <Button type="submit">Submit</Button>
      </form>
    </Modal>
  );
}

export function LeavePage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [balances, setBalances] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  function load() {
    api<any[]>("/api/leaves").then(setRows);
    api<any[]>("/api/leaves/balances").then(setBalances).catch(() => setBalances([]));
    api<any[]>("/api/leaves/types").then(setTypes);
  }
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Leave</h1>
          <p className="text-sm text-slate-500">18 days / year (12 casual + 6 sick) · 1 paid leave / month · 3 if previous month had none</p>
        </div>
        <Button onClick={() => setOpen(true)}>Apply Leave</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {balances.map((b) => (
          <Card key={b.id}>
            <div className="text-sm text-slate-500">{b.leaveType?.name}</div>
            <div className="text-2xl font-semibold">{Number(b.entitled) - Number(b.used)}</div>
            <div className="text-xs text-slate-400">Used {Number(b.used)} · Pending {Number(b.pending)}</div>
          </Card>
        ))}
      </div>
      <Card>
        {!rows ? <LoadingState /> : (
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-slate-500"><tr>{["Employee", "Type", "From", "To", "Days", "Status", "Actions"].map((h) => <th key={h} className="px-3 py-2 text-left">{h}</th>)}</tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t">
                  <td className="px-3 py-2">{fullName(r.employee)}</td>
                  <td className="px-3 py-2">{r.leaveType?.name}</td>
                  <td className="px-3 py-2">{r.startDate?.slice(0, 10)}</td>
                  <td className="px-3 py-2">{r.endDate?.slice(0, 10)}</td>
                  <td className="px-3 py-2">{Number(r.days)}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} /></td>
                  <td className="px-3 py-2 space-x-1">
                    {r.status === "PENDING" && (
                      <>
                        <Button variant="success" onClick={async () => { await api(`/api/leaves/${r.id}/approve`, { method: "PUT" }); toast.success("Approved"); load(); }}>Approve</Button>
                        <Button variant="danger" onClick={async () => { await api(`/api/leaves/${r.id}/reject`, { method: "PUT" }); toast.success("Rejected"); load(); }}>Reject</Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      <Modal open={open} title="Apply leave" onClose={() => setOpen(false)}>
        <LeaveForm types={types} onDone={() => { setOpen(false); load(); }} />
      </Modal>
    </div>
  );
}

function LeaveForm({ types, onDone }: { types: any[]; onDone: () => void }) {
  const [form, setForm] = useState({ leaveTypeId: "", startDate: "", endDate: "", reason: "" });
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      await api("/api/leaves", { method: "POST", body: JSON.stringify(form) });
      toast.success("Leave submitted");
      onDone();
    }}>
      <Select value={form.leaveTypeId} onChange={(e) => setForm({ ...form, leaveTypeId: e.target.value })} required>
        <option value="">Leave type</option>
        {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </Select>
      <div className="grid grid-cols-2 gap-2">
        <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
        <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} required />
      </div>
      <Textarea placeholder="Reason" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
      <Button type="submit">Submit</Button>
    </form>
  );
}
