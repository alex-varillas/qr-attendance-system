# Asistia | QR Attendance System

Open source attendance control with QR codes for a single business. Employees check in by scanning a QR code with their phone (no app to install), and the owner and the administrators follow the day on a dashboard and export reports. You run it on your own server, so the data stays yours.

Spanish version: [README.es.md](README.es.md)

## Features

- **QR check-in, no app.** Each location has its own QR code. The employee scans it, picks their name, enters an optional 4-digit PIN, and checks in, starts or ends a break, or checks out.
- **Location check (optional).** With it on, the server rejects a check-in outside the allowed radius of the location and records the blocked attempt. The location is required, not a hint.
- **Live dashboard.** Who is in, who is late, who is missing, updated as people check in, without reloading.
- **Employees, locations and departments**, with a weekly schedule per business, location or employee, schedule exceptions for a given day, and holidays.
- **Vacations, absence justifications and overtime**, with an approval step.
- **Statistics and reports.** Per-employee statistics and attendance reports in Excel and PDF, kept on the server for later.
- **Roles and permissions.** The owner can do everything; administrators manage the regular employees and get extra permissions only if the owner grants them. Employees have no account.
- **Spanish and English interface**, chosen per installation.
- **Self-hosted.** Docker Compose with PostgreSQL, optional automatic HTTPS, optional email.

## Quick start

You need Docker with Compose.

```sh
git clone https://github.com/alex-varillas/qr-attendance-system.git
cd qr-attendance-system
cp .env.example .env        # set POSTGRES_PASSWORD to a long random value
docker compose up -d
```

Open <http://localhost:3000>. The first screen creates the business and the owner account. After that there is no public sign-up: administrators join with an invitation link from the owner.

Browsers only allow the camera and the location on HTTPS (or on `localhost`), so a real installation needs HTTPS. [docs/installation.md](docs/installation.md) covers the automatic HTTPS option, installing without Docker, updates, backups and recovering a lost password.

## Documentation

- [Installation](docs/installation.md): Docker, HTTPS, without Docker, updates, backups, recovery.
- [Configuration](docs/configuration.md): every environment variable, email, reverse proxy, what leaves your server.
- [Architecture](docs/architecture.md): components, data model, how a check-in is validated, security model.
- [Development](docs/development.md): run it locally, tests, migrations, translations.
- [Contributing](CONTRIBUTING.md), [Security policy](SECURITY.md), [Code of conduct](CODE_OF_CONDUCT.md), [Changelog](CHANGELOG.md).

## Technology

- Frontend: React 19, Vite, Tailwind CSS, TanStack Query.
- Backend: Node.js 24, TypeScript, Fastify, PostgreSQL (Drizzle for the schema and migrations, plain parameterized SQL for queries).
- Installation: Docker Compose, with Caddy for optional HTTPS.

## Development

Requirements: Node.js 24 or newer, and Docker for the database.

```sh
npm run install:all     # installs server/ and web/
npm run db:dev          # PostgreSQL for development on port 55432
cp server/.env.example server/.env
npm run dev:server      # API on http://localhost:3000
npm run dev:web         # web app on http://localhost:5173
```

## Verification

```sh
npm run db:test                   # throwaway PostgreSQL for the tests, on port 55433
npm test                          # server integration tests and web unit tests
npm run lint                      # type check of the server and lint of the web app
npm run test:e2e                  # real browser tests of the whole app (builds the web app first)
npm --prefix web run i18n:check   # every text has an English translation
```

## Structure

```
server/   API: Fastify routes, check-in rules, migrations (server/drizzle), tests
web/      Web app: React, translations (web/src/i18n), end-to-end tests (web/e2e)
docs/     Guides
Dockerfile, docker-compose.yml, Caddyfile   Installation
```

## License

MIT. See [LICENSE](LICENSE).
