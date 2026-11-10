# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for a security problem.

Report it privately with the **Report a vulnerability** button in the **Security** tab of the repository (GitHub private vulnerability reporting). Include:

- what you found and where (file, endpoint or screen);
- the steps to reproduce it, with made-up data;
- what an attacker could do with it.

We will acknowledge the report, work on a fix with you, and credit you in the release notes if you wish. Please give us reasonable time to publish a fix before you disclose the problem.

## Supported versions

Security fixes go to the latest release and to `main`. Run a recent version and read the [changelog](CHANGELOG.md) when you update.

## What is in scope

The application in this repository: the API, the web app and the installation files (`Dockerfile`, `docker-compose.yml`, `Caddyfile`). Examples: bypassing authorization, reading or changing data of the business without permission, getting a check-in accepted outside the rules (PIN lockout, location radius), injection, session or cross-site problems, and unsafe file handling.

Out of scope: problems in your own server or network, an installation without HTTPS, a weak `POSTGRES_PASSWORD`, social engineering, and denial of service by sheer traffic.

## How the project protects itself

[docs/architecture.md](docs/architecture.md#security-model) describes the security model: argon2id hashes for passwords and PINs, hashed session and link tokens, `HttpOnly` and `SameSite` cookies, an origin check on changes, rate limits, validated input and parameterized SQL, and per-endpoint authorization covered by tests.

## Hardening an installation

- Use HTTPS, with `COOKIE_SECURE=true`, and `TRUST_PROXY=true` behind a proxy ([installation](docs/installation.md#https)).
- Use a long random `POSTGRES_PASSWORD` and keep `.env` out of version control.
- Do not expose the database port. The provided `docker-compose.yml` does not publish it.
- Turn on the location check and PINs if someone sharing a QR code with a person who is not there would matter to you.
- Back up the database and the files, and try a restore ([backups](docs/installation.md#backups)).
- Keep the installation updated.
