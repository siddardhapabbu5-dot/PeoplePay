import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { AppLayout } from "@/components/layout";
import { LoginPage, ForgotPasswordPage } from "@/pages/auth";
import { DashboardPage } from "@/pages/dashboard";
import { EmployeeProfilePage, EmployeesPage } from "@/pages/employees";
import { AttendancePage, LeavePage } from "@/pages/attendance-leave";
import { PayrollPage, PayslipsPage, SalaryPage } from "@/pages/payroll";
import { ApprovalsPage, CompliancePage, ExpensesPage, LoansPage, ReportsPage, SettingsPage } from "@/pages/more";
import { LoadingState } from "@/components/ui";

function Guard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <LoadingState />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route
        path="/"
        element={
          <Guard>
            <AppLayout />
          </Guard>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="employees" element={<EmployeesPage />} />
        <Route path="employees/:id" element={<EmployeeProfilePage />} />
        <Route path="attendance" element={<AttendancePage />} />
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
