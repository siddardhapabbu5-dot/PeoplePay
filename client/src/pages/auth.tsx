import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { Button, Input } from "@/components/ui";
import { toast } from "sonner";

export function LoginPage() {
  const { login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("superadmin@peoplepay.local");
  const [password, setPassword] = useState("Admin@123");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Welcome to PeoplePay");
      nav("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold text-slate-900">Sign in</h1>
      <p className="mt-1 text-sm text-slate-500">Payroll and HR for GMR Engineering and Automation</p>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-medium">Email
          <Input className="mt-1" value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        </label>
        <label className="block text-sm font-medium">Password
          <Input className="mt-1" value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />
        </label>
        <div className="flex justify-end">
          <Link to="/forgot-password" className="text-sm text-indigo-700">Forgot password?</Link>
        </div>
        <Button className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
      </form>
      <div className="mt-6 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
        Demo password Admin@123 — superadmin@, hr@, payroll@, finance@, manager@, achyuth@peoplepay.local
      </div>
    </AuthShell>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const res = await api<{ message: string }>("/api/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
    setMsg(res.message);
  }
  return (
    <AuthShell>
      <h1 className="text-2xl font-semibold">Reset password</h1>
      <form className="mt-6 space-y-4" onSubmit={onSubmit}>
        <Input type="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <Button className="w-full">Send reset instructions</Button>
      </form>
      {msg && <p className="mt-4 text-sm text-emerald-700">{msg}</p>}
      <Link to="/login" className="mt-6 inline-block text-sm text-indigo-700">Back to sign in</Link>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="hidden flex-col justify-between bg-indigo-800 p-10 text-white lg:flex">
        <div className="text-2xl font-semibold">PeoplePay</div>
        <div>
          <div className="text-4xl font-semibold leading-tight">Payroll that follows attendance, leave and policy.</div>
          <p className="mt-4 max-w-md text-indigo-100">Guided payroll, Indian statutory rules you can update, and employee self-service — without locking a run before approval.</p>
        </div>
        <div className="text-sm text-indigo-200">GMR Engineering and Automation</div>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
