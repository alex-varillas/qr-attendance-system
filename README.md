# Asistia | QR Attendance System

Open source attendance control with QR codes for a single business. Employees check in by scanning a QR code (with optional location verification), and the owner and supervisors follow the day on a dashboard and export reports.

Spanish version: [README.es.md](README.es.md)

## Status

Pre-alpha. The project is being prepared for its first public version. **There is no runnable code in this repository yet**, so nothing here can be installed or used today.

## Planned features

None of these is implemented in this repository yet.

- Check in and out by scanning a QR code, protected by a personal PIN.
- Optional location check: the server rejects check-ins outside the allowed radius of a branch.
- A dashboard with the attendance of the day, late arrivals and absences.
- Employees, branches, departments, schedules and holidays.
- Vacations, absence justifications and overtime.
- Statistics and Excel / PDF reports.
- Roles and permissions for the owner and the administrators.
- Spanish and English interface.

## Planned technology

- Frontend: React, Vite and Tailwind CSS.
- Backend: Node.js, TypeScript and Fastify.
- Database: PostgreSQL.
- Installation: Docker Compose.

## Requirements

To be defined together with the first runnable version.

## Quick start

Not available yet. It will be documented here when the first runnable version exists.

## Verification

There are no test commands yet.

## Structure

The repository currently contains only the project metadata (`.gitignore` and the READMEs). The application code will be added in later steps.

## Documentation

There are no public guides yet. Installation, configuration and architecture guides will live in `docs/`.

## License

MIT. The license file will be added before the first release.
