# Changelog

All notable changes are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [semantic versioning](https://semver.org/).

## [Unreleased]

### Added

First public version.

- Check-in by QR code, one code per location, with an optional 4-digit PIN (lockout after 5 wrong tries in 5 minutes) and break start and end.
- Optional location check: the server refuses a check-in outside the allowed radius and records the blocked attempt.
- Live dashboard of the day, with late arrivals and absences.
- Employees, locations, departments, weekly schedules (per business, location or employee), schedule exceptions and holidays.
- Vacations with balance, absence justifications with an approval step, and overtime authorizations.
- Per-employee statistics, and attendance reports in Excel and PDF kept on the server.
- Employee import from a CSV file, with Spanish or English column names.
- Roles: owner, administrators with grantable permissions, and employees without an account.
- Spanish and English interface, chosen per installation.
- Sign-in with sessions, invitations and password links; optional email; a command to recover the owner's password.
- Installation with Docker Compose and PostgreSQL, with optional automatic HTTPS through Caddy.
- Guides in `docs/`, and tests: server integration tests, web unit tests and end-to-end tests in a real browser.
