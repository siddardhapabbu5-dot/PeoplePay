import { useEffect, useState } from "react";
import { LogIn, LogOut, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Button, Card, LoadingState, StatusBadge } from "@/components/ui";

type TodayBundle = {
  employee?: { name: string; code: string; designation?: string; department?: string };
  shift?: { startTime?: string; endTime?: string; name?: string };
  home?: { latitude: number; longitude: number; address?: string } | null;
  sites?: { id: string; latitude: number; longitude: number; siteName?: string }[];
  today?: {
    dayStatus?: string;
    punchIn?: string | null;
    punchOut?: string | null;
    workingMinutes?: number;
    breakMinutes?: number;
    overtimeMin?: number;
  };
};

function mins(n?: number) {
  const m = n ?? 0;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function readGps(fallback?: { latitude: number; longitude: number }) {
  return new Promise<{ latitude: number; longitude: number; gpsAccuracy?: number }>((resolve, reject) => {
    if (!navigator.geolocation) {
      if (fallback) return resolve(fallback);
      return reject(new Error("Location is not available in this browser."));
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        gpsAccuracy: pos.coords.accuracy,
      }),
      (err) => {
        if (fallback) return resolve(fallback);
        reject(new Error(err.message || "Allow location to punch in or out."));
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 5000 },
    );
  });
}

export function PunchCard() {
  const [data, setData] = useState<TodayBundle | null>(null);
  const [now, setNow] = useState(new Date());
  const [busy, setBusy] = useState<"IN" | "OUT" | "BREAK" | null>(null);

  async function load() {
    setData(await api<TodayBundle>("/api/attendance/today"));
  }

  useEffect(() => {
    load().catch((e) => toast.error(e instanceof Error ? e.message : "Could not load attendance"));
  }, []);
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  if (!data) return <Card><LoadingState /></Card>;

  const today = data.today;
  const status = today?.dayStatus ?? "NOT_PUNCHED_IN";
  const punchedIn = status === "WORKING" || status === "ON_BREAK";
  const done = status === "PUNCHED_OUT";

  async function punch(type: "IN" | "OUT") {
    setBusy(type);
    try {
      const fallback = type === "IN"
        ? (data?.home ? { latitude: data.home.latitude, longitude: data.home.longitude } : undefined)
        : (data?.sites?.[0] ? { latitude: data.sites[0].latitude, longitude: data.sites[0].longitude } : undefined);
      const gps = await readGps(fallback);
      const path = type === "OUT" ? "/api/attendance/punch-out" : "/api/attendance/punch-in";
      const res = await api<{ message?: string }>(path, {
        method: "POST",
        body: JSON.stringify({
          ...gps,
          channel: "WEB",
          siteId: type === "OUT" ? data?.sites?.[0]?.id : undefined,
        }),
      });
      toast.success(res.message ?? (type === "OUT" ? "Punched out" : "Punched in"));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Punch failed");
    } finally {
      setBusy(null);
    }
  }

  async function toggleBreak() {
    setBusy("BREAK");
    try {
      const path = status === "ON_BREAK" ? "/api/attendance/break-end" : "/api/attendance/break-start";
      await api(path, { method: "POST", body: "{}" });
      toast.success(status === "ON_BREAK" ? "Break ended" : "Break started");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Break failed");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Today’s attendance</h2>
          <p className="text-sm text-slate-500">
            {now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
            {" · "}
            {now.toLocaleTimeString("en-IN")}
          </p>
          <p className="mt-1 text-xs text-indigo-700">
            Shift {data.shift?.startTime ?? "10:00"} – {data.shift?.endTime ?? "18:30"}
            {data.shift?.name ? ` · ${data.shift.name}` : ""}
          </p>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-4">
        <Stat label="Punch in" value={today?.punchIn ?? "—"} />
        <Stat label="Punch out" value={today?.punchOut ?? "—"} />
        <Stat label="Working" value={mins(today?.workingMinutes)} />
        <Stat label="Break" value={mins(today?.breakMinutes)} />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <Button
          variant="success"
          className="h-14 text-base"
          disabled={!!busy || punchedIn || done}
          onClick={() => punch("IN")}
        >
          <LogIn size={18} />
          {busy === "IN" ? "Punching in…" : "Punch In"}
        </Button>
        <Button
          variant="warn"
          className="h-14 text-base"
          disabled={!!busy || !punchedIn || done}
          onClick={() => punch("OUT")}
        >
          <LogOut size={18} />
          {busy === "OUT" ? "Punching out…" : "Punch Out"}
        </Button>
      </div>

      {punchedIn && (
        <Button variant="ghost" className="mt-3 w-full" disabled={!!busy} onClick={toggleBreak}>
          {status === "ON_BREAK" ? <Play size={16} /> : <Pause size={16} />}
          {busy === "BREAK" ? "Updating…" : status === "ON_BREAK" ? "End break" : "Start break"}
        </Button>
      )}

      {done && (
        <p className="mt-3 text-sm text-slate-500">Today’s attendance is complete.</p>
      )}
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm font-semibold">{value}</div>
    </div>
  );
}
