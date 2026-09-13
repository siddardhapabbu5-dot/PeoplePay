import { PrismaClient, UserRole, AttendanceStatus, LeaveCode } from "@prisma/client";
import bcrypt from "bcryptjs";
import { applySandwichAndLongLeave, DEFAULT_SHIFT, evaluateDay } from "../src/lib/attendance-policy.js";
import { LEAVE_CATALOG } from "../src/lib/leave-policy.js";
import { runPayroll, advancePayroll } from "../src/lib/payroll-engine.js";

const prisma = new PrismaClient();

function splitSalary(monthly: number) {
  const basic = Math.round(monthly * 0.5 * 100) / 100;
  const hra = Math.round(monthly * 0.2 * 100) / 100;
  const conveyance = Math.min(1600, monthly);
  const special = Math.round((monthly - basic - hra - conveyance) * 100) / 100;
  return { basic, hra, conveyance, special };
}

function punchAround(seed: number, early = false) {
  const inMin = 10 * 60 + ((seed * 7) % 45) - 20;
  const outMin = early ? 17 * 60 + 40 : 18 * 60 + 30 + ((seed * 11) % 80);
  const fmt = (m: number) => {
    const clamped = Math.max(8 * 60, m);
    const h24 = Math.floor(clamped / 60);
    const min = clamped % 60;
    const ampm = h24 >= 12 ? "PM" : "AM";
    const h12 = ((h24 + 11) % 12) + 1;
    return `${String(h12).padStart(2, "0")}:${String(min).padStart(2, "0")} ${ampm}`;
  };
  return { punchIn: fmt(inMin), punchOut: fmt(outMin) };
}

async function main() {
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.payslip.deleteMany();
  await prisma.payrollDeduction.deleteMany();
  await prisma.payrollEarning.deleteMany();
  await prisma.payrollEmployee.deleteMany();
  await prisma.payroll.deleteMany();
  await prisma.loanRepayment.deleteMany();
  await prisma.loan.deleteMany();
  await prisma.expenseItem.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.taxDeclaration.deleteMany();
  await prisma.attendanceRegularization.deleteMany();
  await prisma.overtime.deleteMany();
  await prisma.attendance.deleteMany();
  await prisma.leaveRequest.deleteMany();
  await prisma.leaveBalance.deleteMany();
  await prisma.employeeTimeline.deleteMany();
  await prisma.document.deleteMany();
  await prisma.bankAccount.deleteMany();
  await prisma.statutoryDetails.deleteMany();
  await prisma.employeeSalary.deleteMany();
  await prisma.salaryStructureItem.deleteMany();
  await prisma.employee.deleteMany();
  await prisma.user.deleteMany();
  await prisma.salaryStructure.deleteMany();
  await prisma.salaryComponent.deleteMany();
  await prisma.leaveType.deleteMany();
  await prisma.leavePolicy.deleteMany();
  await prisma.holiday.deleteMany();
  await prisma.shift.deleteMany();
  await prisma.payrollGroup.deleteMany();
  await prisma.entity.deleteMany();
  await prisma.branch.deleteMany();
  await prisma.department.deleteMany();
  await prisma.designation.deleteMany();
  await prisma.location.deleteMany();
  await prisma.statutoryRule.deleteMany();
  await prisma.company.deleteMany();

  const company = await prisma.company.create({
    data: {
      name: "GMR Engineering and Automation",
      legalName: "GMR Engineering and Automation Pvt Ltd",
      address: "Hyderabad",
      city: "Hyderabad",
      state: "Telangana",
      pincode: "500081",
      phone: "040-00000000",
      email: "hr@gmr.local",
    },
  });
  const entity = await prisma.entity.create({ data: { companyId: company.id, name: "GMR India" } });
  const group = await prisma.payrollGroup.create({ data: { entityId: entity.id, name: "Monthly Staff", payDay: 1 } });
  await prisma.branch.create({ data: { companyId: company.id, name: "Hyderabad HQ", city: "Hyderabad" } });

  const deptNames = ["HR", "Finance", "Operations", "Sales", "IT", "Administration"];
  const departments = Object.fromEntries(
    await Promise.all(deptNames.map(async (name) => [name, await prisma.department.create({ data: { name } })] as const)),
  );
  const desigNames = ["HR Manager", "Accountant", "Site Engineer", "Sales Executive", "Software Engineer", "Admin Executive", "Team Lead", "Technician"];
  const designations = Object.fromEntries(
    await Promise.all(desigNames.map(async (name) => [name, await prisma.designation.create({ data: { name } })] as const)),
  );
  const hyd = await prisma.location.create({ data: { name: "Hyderabad", city: "Hyderabad", state: "Telangana" } });
  const shift = await prisma.shift.create({ data: DEFAULT_SHIFT });

  const components = [
    { name: "Basic", code: "BASIC", type: "EARNING" as const, calcType: "PERCENT_CTC" as const, defaultValue: 50 },
    { name: "HRA", code: "HRA", type: "EARNING" as const, calcType: "PERCENT_CTC" as const, defaultValue: 20 },
    { name: "Special Allowance", code: "SPECIAL", type: "EARNING" as const, calcType: "PERCENT_CTC" as const, defaultValue: 0 },
    { name: "Conveyance", code: "CONVEYANCE", type: "EARNING" as const, calcType: "FIXED" as const, defaultValue: 1600 },
    { name: "Medical Allowance", code: "MEDICAL", type: "EARNING" as const, calcType: "FIXED" as const, defaultValue: 0 },
    { name: "Food Allowance", code: "FOOD", type: "EARNING" as const, calcType: "FIXED" as const, defaultValue: 0 },
    { name: "Other Allowance", code: "OTHER", type: "EARNING" as const, calcType: "FIXED" as const, defaultValue: 0 },
    { name: "Bonus", code: "BONUS", type: "EARNING" as const, calcType: "FIXED" as const, defaultValue: 0 },
    { name: "Overtime", code: "OT", type: "EARNING" as const, calcType: "FIXED" as const, defaultValue: 0 },
    { name: "PF", code: "PF", type: "DEDUCTION" as const, calcType: "PERCENT_BASIC" as const, defaultValue: 12 },
    { name: "ESI", code: "ESI", type: "DEDUCTION" as const, calcType: "PERCENT_GROSS" as const, defaultValue: 0.75 },
    { name: "Professional Tax", code: "PT", type: "DEDUCTION" as const, calcType: "FIXED" as const, defaultValue: 200 },
    { name: "TDS", code: "TDS", type: "DEDUCTION" as const, calcType: "FIXED" as const, defaultValue: 0 },
    { name: "Loan EMI", code: "LOAN", type: "DEDUCTION" as const, calcType: "FIXED" as const, defaultValue: 0 },
    { name: "Salary Advance", code: "ADVANCE", type: "DEDUCTION" as const, calcType: "FIXED" as const, defaultValue: 0 },
    { name: "Other Deduction", code: "OTHER_DED", type: "DEDUCTION" as const, calcType: "FIXED" as const, defaultValue: 0 },
  ];
  for (const c of components) {
    await prisma.salaryComponent.create({ data: c });
  }

  const structure = await prisma.salaryStructure.create({
    data: {
      name: "Standard Staff Structure",
      effectiveFrom: new Date("2026-01-01"),
    },
  });

  await prisma.leavePolicy.create({
    data: {
      name: "GMR Standard 2026",
      annualCasual: 12,
      annualSick: 6,
      monthlyPaidLeave: 1,
      bonusPaidIfNoLeave: 3,
    },
  });
  for (const l of LEAVE_CATALOG) {
    await prisma.leaveType.create({ data: l });
  }
  const leaveTypes = await prisma.leaveType.findMany();

  await prisma.holiday.createMany({
    data: [
      { name: "Republic Day", date: new Date("2026-01-26"), year: 2026 },
      { name: "May Day", date: new Date("2026-05-01"), year: 2026 },
      { name: "Independence Day", date: new Date("2026-08-15"), year: 2026 },
    ],
  });

  const ruleDate = new Date("2026-04-01");
  await prisma.statutoryRule.createMany({
    data: [
      { ruleName: "EPF", code: "PF", state: "ALL", effectiveDate: ruleDate, employeeRate: 12, employerRate: 12, minimumWage: 0, maximumWage: 15000, threshold: 0 },
      { ruleName: "ESI", code: "ESI", state: "ALL", effectiveDate: ruleDate, employeeRate: 0.75, employerRate: 3.25, minimumWage: 0, maximumWage: 0, threshold: 21000 },
      { ruleName: "Professional Tax Telangana", code: "PT", state: "Telangana", effectiveDate: ruleDate, employeeRate: 200, employerRate: 0, threshold: 15000 },
      { ruleName: "TDS placeholder", code: "TDS", state: "ALL", effectiveDate: ruleDate, employeeRate: 0, employerRate: 0, threshold: 50000 },
      { ruleName: "LWF Telangana", code: "LWF", state: "Telangana", effectiveDate: ruleDate, employeeRate: 0, employerRate: 0, threshold: 0 },
    ],
  });

  const passwordHash = await bcrypt.hash("Admin@123", 10);
  const users: Record<string, { id: string }> = {};
  const roleEmails: Array<[UserRole, string]> = [
    ["SUPER_ADMIN", "superadmin@peoplepay.local"],
    ["HR_ADMIN", "hr@peoplepay.local"],
    ["PAYROLL_ADMIN", "payroll@peoplepay.local"],
    ["FINANCE", "finance@peoplepay.local"],
    ["MANAGER", "manager@peoplepay.local"],
  ];
  for (const [role, email] of roleEmails) {
    users[role] = await prisma.user.create({ data: { email, passwordHash, role } });
  }

  type SeedEmp = {
    code: string;
    first: string;
    last: string;
    dept: string;
    desig: string;
    salary: number;
    email: string;
    role?: UserRole;
    phone: string;
    managerCode?: string;
    join: string;
    julyAbsent?: number[];
    julyLeave?: number[];
  };

  const master: SeedEmp[] = [
    { code: "EMP001", first: "Md", last: "Afroz", dept: "Operations", desig: "Team Lead", salary: 22000, email: "afroz@peoplepay.local", role: "MANAGER", phone: "9000000001", join: "2024-04-01" },
    { code: "EMP002", first: "Achyuth", last: "Kumar", dept: "Operations", desig: "Site Engineer", salary: 18000, email: "achyuth@peoplepay.local", phone: "9000000002", managerCode: "EMP001", join: "2024-06-10" },
    { code: "EMP003", first: "Jamshad", last: "Ali", dept: "Operations", desig: "Technician", salary: 30000, email: "jamshad@peoplepay.local", phone: "9000000003", managerCode: "EMP001", join: "2023-11-01", julyLeave: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16] },
    { code: "EMP004", first: "Zakir", last: "Hussain", dept: "Operations", desig: "Site Engineer", salary: 25000, email: "zakir@peoplepay.local", phone: "9000000004", managerCode: "EMP001", join: "2024-01-15" },
    { code: "EMP005", first: "Irfan", last: "Khan", dept: "Operations", desig: "Technician", salary: 25000, email: "irfan@peoplepay.local", phone: "9000000005", managerCode: "EMP001", join: "2024-02-01", julyAbsent: [1, 2, 3, 4, 5, 6, 7, 8] },
    { code: "EMP006", first: "Priya", last: "Sharma", dept: "HR", desig: "HR Manager", salary: 42000, email: "priya@peoplepay.local", role: "HR_ADMIN", phone: "9000000006", join: "2022-08-01" },
    { code: "EMP007", first: "Rahul", last: "Mehta", dept: "Finance", desig: "Accountant", salary: 38000, email: "rahul@peoplepay.local", role: "FINANCE", phone: "9000000007", join: "2023-03-12" },
    { code: "EMP008", first: "Sneha", last: "Reddy", dept: "Finance", desig: "Accountant", salary: 32000, email: "sneha@peoplepay.local", phone: "9000000008", managerCode: "EMP007", join: "2024-09-01" },
    { code: "EMP009", first: "Vikram", last: "Singh", dept: "Sales", desig: "Team Lead", salary: 36000, email: "vikram@peoplepay.local", phone: "9000000009", join: "2023-01-20" },
    { code: "EMP010", first: "Ananya", last: "Iyer", dept: "Sales", desig: "Sales Executive", salary: 24000, email: "ananya@peoplepay.local", phone: "9000000010", managerCode: "EMP009", join: "2025-02-03" },
    { code: "EMP011", first: "Karthik", last: "Rao", dept: "IT", desig: "Software Engineer", salary: 45000, email: "karthik@peoplepay.local", phone: "9000000011", join: "2022-11-14" },
    { code: "EMP012", first: "Divya", last: "Nair", dept: "IT", desig: "Software Engineer", salary: 40000, email: "divya@peoplepay.local", phone: "9000000012", managerCode: "EMP011", join: "2024-07-22" },
    { code: "EMP013", first: "Mohammed", last: "Imran", dept: "Administration", desig: "Admin Executive", salary: 22000, email: "imran@peoplepay.local", phone: "9000000013", join: "2023-05-08" },
    { code: "EMP014", first: "Lakshmi", last: "Prasad", dept: "HR", desig: "Admin Executive", salary: 26000, email: "lakshmi@peoplepay.local", phone: "9000000014", managerCode: "EMP006", join: "2025-01-06" },
    { code: "EMP015", first: "Arjun", last: "Patel", dept: "Operations", desig: "Site Engineer", salary: 28000, email: "arjun@peoplepay.local", phone: "9000000015", managerCode: "EMP001", join: "2024-10-01" },
    { code: "EMP016", first: "Neha", last: "Gupta", dept: "Sales", desig: "Sales Executive", salary: 23000, email: "neha@peoplepay.local", phone: "9000000016", managerCode: "EMP009", join: "2025-06-16" },
    { code: "EMP017", first: "Suresh", last: "Babu", dept: "Administration", desig: "Admin Executive", salary: 21000, email: "suresh@peoplepay.local", phone: "9000000017", join: "2023-09-11" },
    { code: "EMP018", first: "Fatima", last: "Begum", dept: "Finance", desig: "Accountant", salary: 30000, email: "fatima@peoplepay.local", phone: "9000000018", managerCode: "EMP007", join: "2024-04-18" },
    { code: "EMP019", first: "Rohit", last: "Verma", dept: "IT", desig: "Software Engineer", salary: 48000, email: "rohit@peoplepay.local", phone: "9000000019", managerCode: "EMP011", join: "2021-12-01" },
    { code: "EMP020", first: "Meera", last: "Joshi", dept: "HR", desig: "HR Manager", salary: 35000, email: "meera@peoplepay.local", phone: "9000000020", managerCode: "EMP006", join: "2025-03-01" },
  ];

  const createdEmps: Record<string, string> = {};
  for (const e of master) {
    const user = await prisma.user.create({
      data: { email: e.email, passwordHash, role: e.role ?? "EMPLOYEE" },
    });
    const parts = splitSalary(e.salary);
    const emp = await prisma.employee.create({
      data: {
        employeeCode: e.code,
        firstName: e.first,
        lastName: e.last,
        phone: e.phone,
        personalEmail: e.email,
        gender: e.first.match(/Priya|Sneha|Ananya|Divya|Lakshmi|Neha|Fatima|Meera/) ? "FEMALE" : "MALE",
        joiningDate: new Date(e.join),
        employmentType: "FULL_TIME",
        workLocation: "Hyderabad",
        departmentId: departments[e.dept].id,
        designationId: designations[e.desig].id,
        locationId: hyd.id,
        shiftId: shift.id,
        payrollGroupId: group.id,
        userId: user.id,
        address: "Hyderabad, Telangana",
        bankAccount: {
          create: {
            bankName: "HDFC Bank",
            accountNumber: `50100${e.code.slice(3)}8891`,
            ifsc: "HDFC0001234",
            accountHolderName: `${e.first} ${e.last}`,
          },
        },
        statutory: {
          create: {
            pan: `ABCDE${e.code.slice(3)}F`,
            aadhaar: `XXXX-XXXX-${1000 + Number(e.code.slice(3))}`,
            uan: `10012345${e.code.slice(3)}`,
            pfNumber: `TG/HYD/12345/${e.code.slice(3)}`,
            esiNumber: Number(e.salary) <= 21000 ? `ESI${e.code.slice(3)}` : undefined,
            taxRegime: "NEW",
          },
        },
        salaries: {
          create: {
            structureId: structure.id,
            ctcMonthly: e.salary,
            ...parts,
            effectiveFrom: new Date(e.join),
          },
        },
        timeline: {
          create: { type: "JOINED", title: "Joined GMR Engineering and Automation", happenedAt: new Date(e.join) },
        },
      },
    });
    createdEmps[e.code] = emp.id;
    await prisma.leaveBalance.createMany({
      data: leaveTypes.map((t) => ({
        employeeId: emp.id,
        leaveTypeId: t.id,
        year: 2026,
        entitled: t.annualQuota,
        used: e.code === "EMP003" && t.code === LeaveCode.CASUAL ? 12 : 0,
      })),
    });
  }

  for (const e of master) {
    if (e.managerCode && createdEmps[e.managerCode]) {
      await prisma.employee.update({ where: { id: createdEmps[e.code] }, data: { managerId: createdEmps[e.managerCode] } });
    }
  }

  await prisma.employee.update({
    where: { id: createdEmps.EMP001 },
    data: { userId: users.MANAGER.id },
  });

  const casual = leaveTypes.find((t) => t.code === "CASUAL")!;
  await prisma.leaveRequest.create({
    data: {
      employeeId: createdEmps.EMP003,
      leaveTypeId: casual.id,
      startDate: new Date("2026-07-01"),
      endDate: new Date("2026-07-16"),
      days: 16,
      reason: "Long personal leave",
      status: "APPROVED",
    },
  });

  async function seedMonth(year: number, month: number) {
    const dim = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (const e of master) {
      const days = [];
      for (let d = 1; d <= dim; d++) {
        const date = new Date(Date.UTC(year, month - 1, d));
        const absent = month === 7 && e.julyAbsent?.includes(d);
        const leave = month === 7 && e.julyLeave?.includes(d);
        const p = punchAround(d + Number(e.code.slice(3)), d % 9 === 0);
        days.push(
          evaluateDay(
            {
              date,
              punchIn: absent || leave ? null : p.punchIn,
              punchOut: absent || leave ? null : p.punchOut,
              forcedStatus: leave ? AttendanceStatus.LEAVE : absent ? AttendanceStatus.ABSENT : undefined,
            },
            e.salary,
            dim,
            shift,
          ),
        );
      }
      const adjusted = applySandwichAndLongLeave(days);
      await prisma.attendance.createMany({
        data: adjusted.map((a) => ({
          employeeId: createdEmps[e.code],
          date: a.date,
          punchIn: a.punchIn,
          punchOut: a.punchOut,
          workingHours: a.workingHours,
          overtimeMin: a.overtimeMin,
          lateMin: a.lateMin,
          lateDeduction: a.lateDeduction,
          otAmount: a.otAmount,
          status: a.status,
          source: "SEED",
        })),
      });
    }
  }

  await seedMonth(2026, 7);
  await seedMonth(2026, 8);
  await seedMonth(2026, 9);

  await prisma.expense.create({
    data: {
      employeeId: createdEmps.EMP002,
      type: "Travel",
      date: new Date("2026-09-05"),
      amount: 1450,
      description: "Site visit conveyance",
      project: "GMR Site A",
      status: "APPROVED",
    },
  });
  await prisma.loan.create({
    data: {
      employeeId: createdEmps.EMP005,
      type: "ADVANCE",
      amount: 5000,
      interest: 0,
      tenureMonths: 5,
      startMonth: new Date("2026-09-01"),
      emi: 1000,
      balance: 5000,
      status: "APPROVED",
    },
  });
  await prisma.approval.createMany({
    data: [
      { type: "LEAVE", referenceId: "seed-leave", employeeId: createdEmps.EMP010, title: "Casual leave", amountOrDays: "2 day(s)", status: "PENDING" },
      { type: "EXPENSE", referenceId: "seed-exp", employeeId: createdEmps.EMP016, title: "Client entertainment", amountOrDays: "₹2,400", status: "PENDING" },
      { type: "LOAN", referenceId: "seed-loan", employeeId: createdEmps.EMP013, title: "Salary advance", amountOrDays: "₹8,000", status: "PENDING" },
    ],
  });

  const july = await runPayroll(2026, 7, users.PAYROLL_ADMIN.id, group.id);
  await advancePayroll(july.id, "review", users.PAYROLL_ADMIN.id);
  await advancePayroll(july.id, "approve", users.FINANCE.id);
  await advancePayroll(july.id, "lock", users.PAYROLL_ADMIN.id);
  await advancePayroll(july.id, "payslips", users.PAYROLL_ADMIN.id);

  await prisma.auditLog.createMany({
    data: [
      { userId: users.HR_ADMIN.id, action: "EMPLOYEE_CREATE", entity: "Employee", details: "Employee joined" },
      { userId: users.MANAGER.id, action: "LEAVE_APPROVE", entity: "LeaveRequest", details: "Leave approved" },
      { userId: users.FINANCE.id, action: "EXPENSE_APPROVED", entity: "Expense", details: "Expense approved" },
      { userId: users.PAYROLL_ADMIN.id, action: "SALARY_REVISION", entity: "EmployeeSalary", details: "Salary revised" },
      { userId: users.PAYROLL_ADMIN.id, action: "PAYROLL_RUN", entity: "Payroll", details: "Payroll processed" },
    ],
  });

  console.log("Seeded PeoplePay with 20 employees, July 2026 payroll, and GMR master salaries.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
