# PeoplePay

Enterprise payroll + HRMS for GMR Engineering and Automation. Built from the July 2026 salary workbook and the company leave/attendance policy.

## Stack

- React + Vite + TypeScript + Tailwind
- Express + Prisma + PostgreSQL
- JWT auth, role-based access, PDF payslips, Excel import/export

## Quick start

```bash
docker compose up -d
# Postgres is published on localhost:5434
npm install
cd server && npx prisma generate && npx prisma db push && npm run seed
cd ..
npm run dev
```

- App: http://localhost:5173
- API: http://localhost:4000

## Demo logins

Password for all accounts: `Admin@123`

| Role | Email |
| --- | --- |
| Super Admin | superadmin@peoplepay.local |
| HR | hr@peoplepay.local |
| Payroll | payroll@peoplepay.local |
| Finance | finance@peoplepay.local |
| Manager (Md Afroz) | manager@peoplepay.local |
| Employee | afroz@peoplepay.local |

## Company policy encoded in the engine

1. 18 leaves / year — 12 casual + 6 sick
2. Shift 10:00–18:30; OT starts after 19:30
3. Logout after 17:30 is a full day; 2 hours early deducts pay
4. Saturday + Sunday + Monday absent → Sunday treated as absent
5. Four continuous holidays ending Sunday → Sunday absent
6. 1 paid leave every month
7. If previous month had no leave, next month gets 3 paid leaves
8. Long leave counts Sundays as absent

Master salaries from July 2026: Afroz 22,000 · Achyuth 18,000 · Jamshad 30,000 · Zakir 25,000 · Irfan 25,000

Statutory PF/ESI/PT/TDS/LWF rates are stored in `StatutoryRule` and can be edited in Settings — they are not hard-coded.
