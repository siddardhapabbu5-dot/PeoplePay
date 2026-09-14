import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { fullName } from "@/lib/utils";
import { Button, Card, Input, Modal, Select } from "@/components/ui";
import { toast } from "sonner";

export function LocationsAdminPage() {
  const [sites, setSites] = useState<any[]>([]);
  const [homes, setHomes] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [open, setOpen] = useState<"site" | "home" | "assign" | null>(null);
  const load = () => {
    api<any[]>("/api/admin/sites").then(setSites);
    api<any[]>("/api/admin/home-locations").then(setHomes);
    api<any>("/api/employees?pageSize=100").then((d) => setEmployees(d.rows ?? []));
  };
  useEffect(() => { load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Locations & geofence</h1>
          <p className="text-sm text-slate-500">Home = Punch In only · Site = Punch Out only · default radius 100m</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => setOpen("home")}>Save home location</Button>
          <Button variant="ghost" onClick={() => setOpen("assign")}>Assign site</Button>
          <Button onClick={() => setOpen("site")}>Add site</Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 font-semibold">Sites</h3>
          {sites.map((s) => (
            <div key={s.id} className="border-b py-3 text-sm">
              <div className="font-medium">{s.siteName}</div>
              <div className="text-slate-500">{s.address} · {s.latitude}, {s.longitude} · {s.allowedRadius}m</div>
              <MapPreview lat={s.latitude} lng={s.longitude} />
            </div>
          ))}
        </Card>
        <Card>
          <h3 className="mb-3 font-semibold">Employee home locations</h3>
          {homes.map((h) => (
            <div key={h.id} className="border-b py-3 text-sm">
              <div className="font-medium">{fullName(h.employee)} ({h.employee?.employeeCode})</div>
              <div className="text-slate-500">{h.address} · {h.allowedRadius}m</div>
            </div>
          ))}
        </Card>
      </div>
      <Modal open={open === "site"} title="New site" onClose={() => setOpen(null)}>
        <SiteForm onDone={() => { setOpen(null); load(); }} />
      </Modal>
      <Modal open={open === "home"} title="Home location" onClose={() => setOpen(null)}>
        <HomeForm employees={employees} onDone={() => { setOpen(null); load(); }} />
      </Modal>
      <Modal open={open === "assign"} title="Assign site" onClose={() => setOpen(null)}>
        <AssignForm employees={employees} sites={sites} onDone={() => { setOpen(null); load(); }} />
      </Modal>
    </div>
  );
}

function MapPreview({ lat, lng }: { lat: number; lng: number }) {
  return (
    <iframe
      title="map"
      className="mt-2 h-40 w-full rounded-xl border"
      src={`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`}
    />
  );
}

function SiteForm({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({ siteName: "Hyderabad Project Site", address: "Hyderabad", latitude: 17.4, longitude: 78.48, allowedRadius: 100 });
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      await api("/api/admin/sites", { method: "POST", body: JSON.stringify(form) });
      toast.success("Site saved");
      onDone();
    }}>
      <Input value={form.siteName} onChange={(e) => setForm({ ...form, siteName: e.target.value })} />
      <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <div className="grid grid-cols-3 gap-2">
        <Input type="number" step="0.0001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })} />
        <Input type="number" step="0.0001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })} />
        <Input type="number" value={form.allowedRadius} onChange={(e) => setForm({ ...form, allowedRadius: Number(e.target.value) })} />
      </div>
      <MapPreview lat={form.latitude} lng={form.longitude} />
      <Button type="submit">Save site</Button>
    </form>
  );
}

function HomeForm({ employees, onDone }: { employees: any[]; onDone: () => void }) {
  const [form, setForm] = useState({ employeeId: "", address: "Hyderabad", latitude: 17.385, longitude: 78.4867, allowedRadius: 100 });
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      await api("/api/admin/home-location", { method: "POST", body: JSON.stringify(form) });
      toast.success("Home location saved");
      onDone();
    }}>
      <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
        <option value="">Employee</option>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.employeeCode} {fullName(e)}</option>)}
      </Select>
      <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
      <div className="grid grid-cols-3 gap-2">
        <Input type="number" step="0.0001" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: Number(e.target.value) })} />
        <Input type="number" step="0.0001" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: Number(e.target.value) })} />
        <Input type="number" value={form.allowedRadius} onChange={(e) => setForm({ ...form, allowedRadius: Number(e.target.value) })} />
      </div>
      <MapPreview lat={form.latitude} lng={form.longitude} />
      <Button type="submit">Save home location</Button>
    </form>
  );
}

function AssignForm({ employees, sites, onDone }: { employees: any[]; sites: any[]; onDone: () => void }) {
  const [form, setForm] = useState({ employeeId: "", siteId: "", startDate: "2026-09-01" });
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault();
      await api("/api/admin/employee-site", { method: "POST", body: JSON.stringify(form) });
      toast.success("Site assigned");
      onDone();
    }}>
      <Select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
        <option value="">Employee</option>
        {employees.map((e) => <option key={e.id} value={e.id}>{e.employeeCode} {fullName(e)}</option>)}
      </Select>
      <Select value={form.siteId} onChange={(e) => setForm({ ...form, siteId: e.target.value })}>
        <option value="">Site</option>
        {sites.map((s) => <option key={s.id} value={s.id}>{s.siteName}</option>)}
      </Select>
      <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
      <Button type="submit">Assign site</Button>
    </form>
  );
}

export function AttendanceAdminPage() {
  const [data, setData] = useState<any>(null);
  useEffect(() => { api("/api/admin/attendance").then(setData); }, []);
  if (!data) return <p className="text-slate-500">Loading attendance…</p>;
  const c = data.cards;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Live attendance</h1>
      <div className="grid gap-3 sm:grid-cols-4">
        {Object.entries(c).map(([k, v]) => (
          <Card key={k}><div className="text-sm text-slate-500">{k}</div><div className="text-2xl font-semibold">{String(v)}</div></Card>
        ))}
      </div>
      <Card>
        <table className="min-w-full text-sm">
          <thead className="text-xs uppercase text-slate-500">
            <tr>{["Employee", "In", "In loc", "Out", "Out loc", "Hours", "OT", "Status"].map((h) => <th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((r: any) => {
              const inn = r.punches?.find((p: any) => p.type === "IN");
              const out = r.punches?.find((p: any) => p.type === "OUT");
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-2">{r.employee?.firstName} {r.employee?.lastName}</td>
                  <td className="px-2 py-2">{r.punchIn ?? "—"}</td>
                  <td className="px-2 py-2">{inn ? `${Math.round(inn.distance)}m ${inn.locationType}` : "—"}</td>
                  <td className="px-2 py-2">{r.punchOut ?? "—"}</td>
                  <td className="px-2 py-2">{out ? `${Math.round(out.distance)}m ${out.locationType}` : "—"}</td>
                  <td className="px-2 py-2">{r.workingHours}</td>
                  <td className="px-2 py-2">{r.overtimeMin}</td>
                  <td className="px-2 py-2">{r.status}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
