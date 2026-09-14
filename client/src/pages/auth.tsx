import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Eye, EyeOff, Lock, Mail, User } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api } from "@/lib/api";
import { toast } from "sonner";

const REMEMBER_KEY = "peoplepay_remember_login";

export function LoginPage() {
  const location = useLocation();
  const staff = location.pathname.startsWith("/staff");
  return <LoginForm key={staff ? "staff" : "admin"} portal={staff ? "staff" : "admin"} />;
}

function LoginForm({ portal }: { portal: "admin" | "staff" }) {
  const { login } = useAuth();
  const nav = useNavigate();
  const isStaff = portal === "staff";
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(REMEMBER_KEY);
    if (saved) {
      setIdentifier(saved);
      setRemember(true);
    }
  }, [isStaff]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      if (remember) localStorage.setItem(REMEMBER_KEY, identifier);
      else localStorage.removeItem(REMEMBER_KEY);
      await login(identifier, password, portal);
      toast.success(isStaff ? "Welcome to staff self-service" : "Welcome to PeoplePay");
      nav("/");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="login-tabs">
        <Link to="/login" className={!isStaff ? "on" : ""}>Admin</Link>
        <Link to="/staff-login" className={isStaff ? "on" : ""}>Staff</Link>
      </div>
      <form className="login-form" onSubmit={onSubmit}>
        <label className="login-field">
          <Mail size={16} strokeWidth={1.75} />
          <input
            name={isStaff ? "employeeCode" : "email"}
            value={identifier}
            onChange={(e) => setIdentifier(e.target.value)}
            autoComplete={isStaff ? "off" : "username"}
            placeholder={isStaff ? "Employee ID" : "Email ID"}
            required
          />
        </label>
        <label className="login-field">
          <Lock size={16} strokeWidth={1.75} />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Password"
            required
          />
          <button
            type="button"
            className="login-eye"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((v) => !v)}
          >
            {showPassword ? <EyeOff size={16} strokeWidth={1.75} /> : <Eye size={16} strokeWidth={1.75} />}
          </button>
        </label>
        <div className="login-meta">
          <label className="login-remember">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember me
          </label>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
        <button className="login-submit" disabled={busy} type="submit">
          {busy ? "SIGNING IN…" : "LOGIN"}
        </button>
      </form>
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
      <form className="login-form" onSubmit={onSubmit}>
        <label className="login-field">
          <Mail size={16} strokeWidth={1.75} />
          <input type="email" placeholder="Email ID" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <button className="login-submit" type="submit">SEND RESET</button>
      </form>
      {msg && <p className="login-msg">{msg}</p>}
      <Link to="/login" className="login-back">Back to login</Link>
    </AuthShell>
  );
}

function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-avatar" aria-hidden>
          <User size={52} strokeWidth={1.25} />
        </div>
        {children}
      </div>
      <div className="login-brand">PeoplePay · GMR</div>
    </div>
  );
}
