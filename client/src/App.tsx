import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/layout";
import { LoginPage, ForgotPasswordPage } from "@/pages/auth";
import { DashboardPage } from "@/pages/dashboard";
import { StaffHomePage } from "@/pages/staff-home";
import { EmployeeProfilePage, EmployeesPage } from "@/pages/employees";
import { AttendancePage, LeavePage, StaffAttendancePage } from "@/pages/attendance-leave";
import { PayrollPage, PayslipsPage, SalaryPage } from "@/pages/payroll";
import { ApprovalsPage, CompliancePage, ExpensesPage, LoansPage, ReportsPage, SettingsPage } from "@/pages/more";
import { AttendanceAdminPage, LocationsAdminPage } from "@/pages/locations-admin";
import { LoadingState } from "@/components/ui";

function HomePage() {
  const { user } = useAuth();
  const staffPortal = localStorage.getItem("peoplepay_portal") === "staff";
  if (user?.role === "EMPLOYEE" || staffPortal) return <StaffHomePage />;
  return <DashboardPage />;
}

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function StaffBlocked({ children }: { children: React.ReactNode; to?: string }) {
  const { user } = useAuth();
  const staffPortal = localStorage.getItem("peoplepay_portal") === "staff";
  if (user?.role === "EMPLOYEE" || staffPortal) return <Navigate to="/" replace />;
  return children;
}

function AttendanceGate() {
  const { user } = useAuth();
  const staffPortal = localStorage.getItem("peoplepay_portal") === "staff";
  if (user?.role === "EMPLOYEE" || staffPortal) return <StaffAttendancePage />;
  return <AttendancePage />;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/staff-login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        path="/"
        element={
          <Guard>
            <AppLayout />
          </Guard>
        }
      >
        <Route index element={<HomePage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:id" element={<EmployeeProfilePage />} />
        <Route path="attendance" element={<AttendanceGate />} />
        <Route path="admin/attendance" element={<StaffBlocked><AttendanceAdminPage /></StaffBlocked>} />
        <Route path="admin/locations" element={<StaffBlocked><LocationsAdminPage /></StaffBlocked>} />
        <Route path="leave" element={<LeavePage />} />
        <Route path="payroll" element={<PayrollPage />} />
        <Route path="salary" element={<SalaryPage />} />
        <Route path="payslips" element={<PayslipsPage />} />
        <Route path="compliance" element={<CompliancePage />} />
        <Route path="expenses" element={<ExpensesPage />} />
        <Route path="loans" element={<LoansPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="approvals" element={<ApprovalsPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}
