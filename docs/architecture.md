# Architecture

## Overview

```
 Employee's phone                 Owner / administrator
 (scans the QR code)              (web app)
        |                               |
        +---------- HTTPS --------------+
                       |
              +-----------------+
              |  Caddy (option) |  certificates, reverse proxy
              +--------+--------+
                       |
              +--------v--------+        +------------------+
              |  app            |        |  PostgreSQL      |
              |  Fastify API    +------->+  all the records |
              |  + built web app|        +------------------+
              |                 |
              |  DATA_DIR volume: photos and saved reports
              +-----------------+
```

One Node.js process serves both the API (`/api/...`) and the built web app. There is exactly one business per installation: no tenants, no `company_id` anywhere.

| Part | Where | Notes |
| --- | --- | --- |
| API | `server/src` | Fastify 5, TypeScript run directly by Node 24, Zod for input validation |
| Database | PostgreSQL | Schema in `server/src/db/schema.ts`, migrations in `server/drizzle`, applied when the server starts |
| Web app | `web/src` | React 19, Vite, Tailwind CSS, TanStack Query, React Router |
| Files | `DATA_DIR` | Employee photos and saved reports, outside the database |

Drizzle is used for the schema and the migrations only. Queries are plain parameterized SQL written with `pg`, which keeps the check-in rules (transactions, locks, time zone arithmetic) explicit.

## Who can do what

| Who | Account | Can |
| --- | --- | --- |
| Owner | yes | Everything: business settings, locations, administrators and their permissions, all employees, the QR code, reports |
| Administrator | yes | Manage the regular employees, see the dashboard, justify absences, generate reports. Two extra permissions are granted one by one by the owner: `manage_settings` (departments, lateness tolerance, default schedule, approving absences) and `manage_holidays` |
| Employee | no | Checks in from the QR screen, with an optional PIN |

Employees do not have accounts: the check-in screen is public and lists the employees that can check in at that location, so anyone with the QR code can pick a name. That is why the PIN and the location check exist. Use them when this matters to you.

Every API route is registered with its access level, and a test fails if any route outside the public ones answers without a session. Authorization is checked in each endpoint: the owner is the only one who can create or promote administrators, and an administrator cannot touch the owner or other administrators.

## Data model

17 tables.

| Table | Holds |
| --- | --- |
| `business` | The one row: name, tax ID, time zone, language, lateness tolerance, location check settings and the coordinates of the main place. A unique index guarantees a single row |
| `users`, `sessions`, `auth_tokens` | Accounts of the owner and the administrators (argon2id hash), sign-in sessions, and one-time invitation and password links |
| `employees` | Everyone who checks in, including the owner and administrators: name, document, job title, department, assigned location, role, permissions, PIN hash |
| `locations`, `departments` | Branches (each with its own QR code, coordinates and radius) and departments |
| `schedules`, `schedule_exceptions` | Weekly blocks of days with start, end and optional break (for the business, a location or an employee), and one-day exceptions |
| `attendance_records` | The marks: `checkin`, `break_start`, `break_end`, `checkout`, with time, location and the coordinates sent |
| `geo_blocked_attempts`, `pin_attempts` | Check-ins refused for being out of range, and PIN tries (for the lockout) |
| `absence_justifications`, `vacation_adjustments`, `overtime_authorizations` | Absences with their approval status, manual adjustments of the vacation balance, and overtime the employee agreed to |
| `holidays` | Holidays of the business |
| `reports` | The saved Excel and PDF reports (the file is in `DATA_DIR`) |

Timestamps are stored in UTC. The business time zone decides what "today" is, and every day-based rule (marks of the day, lateness, reports) is computed in it.

## How a check-in is validated

`POST /api/public/checkin` runs `registerCheckin` (`server/src/lib/checkin.ts`) in one transaction, locked per employee with an advisory lock. Two simultaneous taps can neither exceed the marks of the day nor register the same step twice. In order:

1. The employee must exist and be active, and if they are assigned to a location, the QR code must be that location's.
2. **PIN.** If the employee has one, it is required. After 5 wrong tries in 5 minutes the employee is locked for 5 minutes, and while locked the PIN is not even checked, so guessing is no faster than waiting. Failed tries are recorded and committed (the function returns the failure instead of throwing, so it is not rolled back).
3. **Location.** If the check is on for that place, coordinates are required, and the server refuses the mark without creating a record when the distance is beyond the allowed radius. The GPS accuracy the phone reports widens the radius by at most 100 meters, so a noisy phone is not punished unfairly. Refused attempts are stored in `geo_blocked_attempts`. A place with the check on but without coordinates or radius refuses everyone (it fails closed) instead of letting everyone through. The client is never trusted to decide: a direct API call without coordinates is refused like one that is too far.
4. **Which mark.** The sequence of the day is check-in, break start, break end, check-out when the schedule of that day has a break, and check-in, check-out when it has none. After the last mark the employee gets a "you already checked in everything today" answer.

## Security model

- Passwords and PINs are stored as argon2id hashes. Session, invitation and password tokens are random, and only their SHA-256 hash is stored.
- The session lives in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` over HTTPS). No token is kept in JavaScript.
- State-changing requests that carry an `Origin` must come from the same host, the public URL or an allowed origin, as a second layer after `SameSite`.
- Per-IP rate limits on every public endpoint (sign-in, setup, password and invitation flows, check-in) and on address search. Behind a proxy set `TRUST_PROXY` so the limits see the real client.
- Sign-in spends the same time whether the account exists or not, and the "Forgot your password?" answer is the same for any email.
- Uploaded photos and reports are identified by their first bytes, never by the name or type the client declares. Photos are stored under the id of the employee and reports under a random name, never under the name the client sent.
- The location of the employee is stored only with the mark, and blocked attempts only for the owner and the administrators.
- Input is validated with Zod on every endpoint, and every SQL value is a parameter.

Report a vulnerability as described in [SECURITY.md](../SECURITY.md).

## Live updates

The dashboard listens to `GET /api/events`, a Server-Sent Events stream. When a mark is recorded the server publishes an event and the open dashboards refresh the day. After a dropped connection the page refreshes what it may have missed. One connection is shared by the whole page. There is no polling.

## Reports

The browser builds the attendance report (Excel with SheetJS, PDF with jsPDF) from the data of the period (`GET /api/reports/data`), so the server does not render documents. The finished file is then uploaded to `POST /api/reports`, which checks its first bytes, stores it in `DATA_DIR` and lists it in the history, from where it can be downloaded again or deleted. Each employee is reported from the day they were added (or from their first mark, if that is earlier), so a new hire does not show absences before they joined.

## Language

The interface is in Spanish or English, one language per installation, chosen at setup and changed in Settings. The source text of each screen is written in Spanish and is the key of the English dictionary (`web/src/i18n/en.js`), so a text without a translation stays in Spanish instead of breaking a screen. Dates, month and weekday names follow the language through `Intl`. The server answers in English, and the web app shows its messages in the language of the screen. See [development](development.md#translations).

## Maintenance jobs

The server runs one maintenance task when it starts and then every hour: it deletes expired sessions, used or expired links and old PIN tries. Nothing else runs in the background.
