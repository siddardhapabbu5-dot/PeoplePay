# PeoplePay Attendance API

Base URL: `http://localhost:4000`

Auth: `Authorization: Bearer <jwt>`

## Auth
- `POST /api/auth/login` `{ login, password, portal: "staff" | "admin" }`
- `POST /api/auth/logout`
- `GET /api/auth/me`

## Employee (mobile)
- `GET /api/employee/profile`
- `GET /api/employee/home-location`
- `GET /api/employee/sites`
- `GET /api/attendance/today`
- `GET /api/attendance/monthly?year=&month=`
- `GET /api/attendance/date/:date`
- `POST /api/attendance/validate-location?type=IN|OUT`
- `POST /api/attendance/selfie` multipart field `selfie`
- `POST /api/attendance/punch-in` `{ latitude, longitude, gpsAccuracy, selfiePath, deviceId }`
- `POST /api/attendance/punch-out`
- `POST /api/attendance/break-start`
- `POST /api/attendance/break-end`
- `POST /api/attendance/regularization`

Server validates geofence with Haversine. Punch In = home only. Punch Out = assigned site only. Timestamp is server time.

## Admin
- `GET|POST /api/admin/sites`
- `POST /api/admin/home-location`
- `POST /api/admin/employee-site`
- `GET /api/admin/attendance`
- `GET /api/payroll/attendance-summary`
- `POST /api/payroll/sync-attendance`
