import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, download } from "@/lib/api";
import { fullName, money } from "@/lib/utils";
import { Button, Card, ConfirmDialog, EmployeeAvatar, Input, LoadingState, Modal, Pagination, Select, StatusBadge } from "@/components/ui";
import { toast } from "sonner";

export function EmployeesPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [data, setData] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [deactivate, setDeactivate] = useState<any>(null);
  const nav = useNavigate();

  function load() {
    api(`/api/employees?q=${encodeURIComponent(q)}&page=${page}`).then(setData);
  }
  useEffect(() => { load(); }, [q, page]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Employees</h1>
          <p className="text-sm text-slate-500">Master data including GMR July 2026 staff</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => download("/api/employees/export", "employees.xlsx")}>Export Excel</Button>
          <Button onClick={() => setOpen(true)}>Add Employee</Button>
        </div>
      </div>
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <Input placeholder="Search name, ID, email" value={q} onChange={(e) => { setPage(1); setQ(e.target.value); }} />
        </div>
        {!data ? <LoadingState /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="text-xs uppercase text-slate-500">
                <tr>{["ID", "Employee", "Department", "Designation", "Location", "Joined", "Type", "Manager", "Status", "Actions"].map((h) => <th key={h} className="px-3 py-2">{h}</th>)}</tr>
              </thead>
              <tbody>
                {data.rows.map((e: any) => (
                  <tr key={e.id} className="border-t border-slate-100 hover:bg-slate-50">
                    <td className="px-3 py-3 font-medium">{e.employeeCode}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <EmployeeAvatar name={fullName(e)} src={e.photoPath} />
                        <div>
                          <div className="font-medium">{fullName(e)}</div>
                          <div className="text-xs text-slate-500">{e.personalEmail}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">{e.department?.name}</td>
                    <td className="px-3 py-3">{e.designation?.name}</td>
                    <td className="px-3 py-3">{e.location?.name}</td>
                    <td className="px-3 py-3">{e.joiningDate?.slice(0, 10)}</td>
                    <td className="px-3 py-3">{e.employmentType?.replaceAll("_", " ")}</td>
                    <td className="px-3 py-3">{e.manager ? fullName(e.manager) : "—"}</td>
                    <td className="px-3 py-3"><StatusBadge status={e.status} /></td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <Button variant="ghost" onClick={() => nav(`/employees/${e.id}`)}>View</Button>
                        <Button variant="ghost" onClick={() => nav(`/employees/${e.id}?tab=salary`)}>Salary</Button>
                        <Button variant="ghost" onClick={() => setDeactivate(e)}>Deactivate</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />
          </div>
        )}
      </Card>
      <EmployeeForm open={open} onClose={() => { setOpen(false); load(); }} />
      <ConfirmDialog
        open={!!deactivate}
        title="Deactivate employee"
        body={`Deactivate ${deactivate ? fullName(deactivate) : ""}? This marks an exit and stops payroll inclusion.`}
        danger
        confirmLabel="Deactivate"
        onClose={() => setDeactivate(null)}
        onConfirm={async () => {
          await api(`/api/employees/${deactivate.id}`, { method: "DELETE" });
          toast.success("Employee deactivated");
          setDeactivate(null);
          load();
        }}
      />
    </div>
  );
}

function EmployeeForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [masters, setMasters] = useState<any>({ departments: [], designations: [], locations: [], shifts: [] });
  useEffect(() => { if (open) api<any>("/api/settings").then(setMasters).catch(() => undefined); }, [open]);
  const [form, setForm] = useState({
    firstName: "", lastName: "", dateOfBirth: "", gender: "MALE", phone: "", personalEmail: "", address: "",
    employeeCode: "", joiningDate: "", employmentType: "FULL_TIME", workLocation: "Hyderabad",
    departmentId: "", designationId: "", locationId: "", shiftId: "",
    bankName: "HDFC Bank", accountNumber: "", ifsc: "", accountHolderName: "",
    pan: "", aadhaar: "", uan: "", esiNumber: "", pfNumber: "", taxRegime: "NEW",
    ctcMonthly: 25000, createLogin: true, loginEmail: "",
  });
  function set<K extends keyof typeof form>(k: K, v: (typeof form)[K]) { setForm((f) => ({ ...f, [k]: v })); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    await api("/api/employees", {
      method: "POST",
      body: JSON.stringify({
        ...form,
        ctcMonthly: Number(form.ctcMonthly),
        loginEmail: form.loginEmail || form.personalEmail,
        bank: { bankName: form.bankName, accountNumber: form.accountNumber, ifsc: form.ifsc, accountHolderName: form.accountHolderName || `${form.firstName} ${form.lastName}` },
        statutory: { pan: form.pan, aadhaar: form.aadhaar, uan: form.uan, esiNumber: form.esiNumber, pfNumber: form.pfNumber, taxRegime: form.taxRegime },
      }),
    });
    toast.success("Employee created");
    onClose();
  }

  return (
    <Modal open={open} title="Add Employee" onClose={onClose}>
      <form className="space-y-5" onSubmit={submit}>
        <Section title="Personal Information">
          <Field label="First Name"><Input required value={form.firstName} onChange={(e) => set("firstName", e.target.value)} /></Field>
          <Field label="Last Name"><Input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} /></Field>
          <Field label="Date of Birth"><Input type="date" value={form.dateOfBirth} onChange={(e) => set("dateOfBirth", e.target.value)} /></Field>
          <Field label="Gender"><Select value={form.gender} onChange={(e) => set("gender", e.target.value)}><option>MALE</option><option>FEMALE</option><option>OTHER</option></Select></Field>
          <Field label="Phone"><Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></Field>
          <Field label="Email"><Input type="email" value={form.personalEmail} onChange={(e) => set("personalEmail", e.target.value)} /></Field>
          <Field label="Address" wide><Input value={form.address} onChange={(e) => set("address", e.target.value)} /></Field>
        </Section>
        <Section title="Employment Information">
          <Field label="Employee ID"><Input required value={form.employeeCode} onChange={(e) => set("employeeCode", e.target.value)} /></Field>
          <Field label="Joining Date"><Input type="date" required value={form.joiningDate} onChange={(e) => set("joiningDate", e.target.value)} /></Field>
          <Field label="Department"><Select value={form.departmentId} onChange={(e) => set("departmentId", e.target.value)}><option value="">Select</option>{masters.departments?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Designation"><Select value={form.designationId} onChange={(e) => set("designationId", e.target.value)}><option value="">Select</option>{masters.designations?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Location"><Select value={form.locationId} onChange={(e) => set("locationId", e.target.value)}><option value="">Select</option>{masters.locations?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Shift"><Select value={form.shiftId} onChange={(e) => set("shiftId", e.target.value)}><option value="">Select</option>{masters.shifts?.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select></Field>
          <Field label="Employment Type"><Select value={form.employmentType} onChange={(e) => set("employmentType", e.target.value)}><option>FULL_TIME</option><option>PART_TIME</option><option>CONTRACT</option><option>INTERN</option></Select></Field>
          <Field label="Work Location"><Input value={form.workLocation} onChange={(e) => set("workLocation", e.target.value)} /></Field>
          <Field label="Monthly CTC"><Input type="number" value={form.ctcMonthly} onChange={(e) => set("ctcMonthly", Number(e.target.value))} /></Field>
        </Section>
        <Section title="Bank Information">
          <Field label="Bank Name"><Input value={form.bankName} onChange={(e) => set("bankName", e.target.value)} /></Field>
          <Field label="Account Number"><Input value={form.accountNumber} onChange={(e) => set("accountNumber", e.target.value)} /></Field>
          <Field label="IFSC"><Input value={form.ifsc} onChange={(e) => set("ifsc", e.target.value)} /></Field>
          <Field label="Account Holder"><Input value={form.accountHolderName} onChange={(e) => set("accountHolderName", e.target.value)} /></Field>
        </Section>
        <Section title="Statutory Information">
          <Field label="PAN"><Input value={form.pan} onChange={(e) => set("pan", e.target.value)} /></Field>
          <Field label="Aadhaar (placeholder)"><Input value={form.aadhaar} onChange={(e) => set("aadhaar", e.target.value)} /></Field>
          <Field label="UAN"><Input value={form.uan} onChange={(e) => set("uan", e.target.value)} /></Field>
          <Field label="ESI Number"><Input value={form.esiNumber} onChange={(e) => set("esiNumber", e.target.value)} /></Field>
          <Field label="PF Number"><Input value={form.pfNumber} onChange={(e) => set("pfNumber", e.target.value)} /></Field>
          <Field label="Tax Regime"><Select value={form.taxRegime} onChange={(e) => set("taxRegime", e.target.value)}><option>NEW</option><option>OLD</option></Select></Field>
        </Section>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit">Save employee</Button>
        </div>
      </form>
    </Modal>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-semibold text-indigo-800">{title}</h3>
      <div className="grid gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}
function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return <label className={`text-sm ${wide ? "sm:col-span-2" : ""}`}>{label}<div className="mt-1">{children}</div></label>;
}

const TABS = ["Overview", "Personal", "Employment", "Attendance", "Leave", "Salary", "Documents", "Expenses", "Loans", "Payslips", "Tax"];

export function EmployeeProfilePage() {
  const { id } = useParams();
  const [tab, setTab] = useState("Overview");
  const [emp, setEmp] = useState<any>(null);
  useEffect(() => { api(`/api/employees/${id}`).then(setEmp); }, [id]);
  if (!emp) return <LoadingState />;
  const salary = emp.salaries?.[0];

  return (
    <div className="space-y-4">
      <Card>
        <div className="flex flex-wrap items-center gap-4">
          <EmployeeAvatar name={fullName(emp)} src={emp.photoPath} />
          <div className="flex-1">
            <h1 className="text-xl font-semibold">{fullName(emp)}</h1>
            <p className="text-sm text-slate-500">{emp.employeeCode} · {emp.designation?.name} · {emp.department?.name}</p>
          </div>
          <StatusBadge status={emp.status} />
          <Link className="text-sm text-indigo-700" to="/employees">Back to list</Link>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1 text-sm ${tab === t ? "bg-indigo-700 text-white" : "bg-slate-100 text-slate-600"}`}>{t}</button>
          ))}
        </div>
      </Card>

      {tab === "Overview" && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <h3 className="mb-3 font-semibold">Employment</h3>
            <KV label="Joined" value={emp.joiningDate?.slice(0, 10)} />
            <KV label="Type" value={emp.employmentType} />
            <KV label="Manager" value={emp.manager ? fullName(emp.manager) : "—"} />
            <KV label="Location" value={emp.location?.name} />
            <KV label="Shift" value={emp.shift?.name} />
          </Card>
          <Card>
            <h3 className="mb-3 font-semibold">Timeline</h3>
            <div className="space-y-3">
              {emp.timeline?.map((t: any) => (
                <div key={t.id} className="border-l-2 border-indigo-200 pl-3">
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="text-xs text-slate-500">{t.type} · {t.happenedAt?.slice(0, 10)}</div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
      {tab === "Personal" && (
        <Card>
          <KV label="Phone" value={emp.phone} />
          <KV label="Email" value={emp.personalEmail} />
          <KV label="Gender" value={emp.gender} />
          <KV label="Address" value={emp.address} />
        </Card>
      )}
      {tab === "Employment" && (
        <Card>
          <KV label="Department" value={emp.department?.name} />
          <KV label="Designation" value={emp.designation?.name} />
          <KV label="Work location" value={emp.workLocation} />
        </Card>
      )}
      {tab === "Salary" && (
        <Card>
          {salary ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <KV label="Monthly CTC" value={money(Number(salary.ctcMonthly))} />
              <KV label="Basic" value={money(Number(salary.basic))} />
              <KV label="HRA" value={money(Number(salary.hra))} />
              <KV label="Conveyance" value={money(Number(salary.conveyance))} />
              <KV label="Special Allowance" value={money(Number(salary.special))} />
            </div>
          ) : <p className="text-sm text-slate-500">No salary assigned or hidden by role.</p>}
        </Card>
      )}
      {tab === "Documents" && (
        <Card>
          <p className="text-sm text-slate-500 mb-3">Profile Photo, Resume, Offer Letter, Appointment Letter, ID Proof, Bank Proof, Other</p>
          {emp.documents?.length ? emp.documents.map((d: any) => <div key={d.id}>{d.type} · {d.fileName}</div>) : <p className="text-sm text-slate-400">No documents uploaded yet.</p>}
        </Card>
      )}
      {["Attendance", "Leave", "Expenses", "Loans", "Payslips", "Tax"].includes(tab) && (
        <Card>
          <p className="text-sm text-slate-600">Open the {tab.toLowerCase()} module filtered for this employee.</p>
          <div className="mt-3">
            <Link className="text-indigo-700 text-sm" to={`/${tab === "Leave" ? "leave" : tab.toLowerCase()}`}>{tab} module →</Link>
          </div>
        </Card>
      )}
    </div>
  );
}

function KV({ label, value }: { label: string; value?: string | null }) {
  return <div className="flex justify-between border-b border-slate-100 py-2 text-sm"><span className="text-slate-500">{label}</span><span className="font-medium">{value || "—"}</span></div>;
}
