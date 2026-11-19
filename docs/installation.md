# Installation

QR Attendance System runs as two containers: the app (API and web app together) and PostgreSQL. Everything the app stores lives in two places: the database, and a folder for uploaded files (employee photos and saved reports).

## What you need

- A machine that stays on: a small server or VPS.
- Docker with Compose.
- For real use, a domain name that points to the machine. Browsers only allow the camera and the location on HTTPS (or on `localhost`), and employees need both to check in.

## With Docker Compose

```sh
git clone https://github.com/alex-varillas/qr-attendance-system.git
cd qr-attendance-system
cp .env.example .env
```

Edit `.env` and set `POSTGRES_PASSWORD` to a long random value. The other settings have defaults; see [configuration](configuration.md).

There are two ways to start it. The first downloads the published Docker image (Linux amd64 and arm64), which is faster and is the one to use for updates:

```sh
docker compose -f docker-compose.yml -f docker-compose.image.yml up -d
```

The second builds the image from the source on your machine (a few minutes the first time):

```sh
docker compose up -d
```

Either way the database and its tables are created when the app starts. Open <http://localhost:3000>. The first screen asks for:

- the name of the business, an optional tax ID, its time zone and the language of the interface (you can change them later in Settings);
- the owner account (first name, last name, email, password);
- the usual working hours, with an optional break, which become the schedule of the business.

![The first-run setup](images/setup.webp)

That screen works once. When it is done the system is closed to public sign-up, and from then on people only enter with an account the owner invites.

Check that it is healthy:

```sh
docker compose ps                       # the app should say "healthy"
curl http://localhost:3000/api/health   # {"ok":true}
```

## HTTPS

The simplest way is the Caddy profile that comes with the project. It gets and renews a certificate by itself.

1. Point a domain (for example `attendance.example.com`) to the machine. Ports 80 and 443 must be reachable from the internet.
2. Add to `.env`:

   ```
   DOMAIN=attendance.example.com
   PUBLIC_URL=https://attendance.example.com
   TRUST_PROXY=true
   COOKIE_SECURE=true
   ```

3. Start everything with the profile:

   ```sh
   docker compose --profile https up -d
   ```

`TRUST_PROXY=true` makes the app read the real client address from Caddy, which matters for the rate limits. `COOKIE_SECURE=true` makes the session cookie travel only over HTTPS. `PUBLIC_URL` is the address used in invitation and password links.

If you already have a reverse proxy (nginx, Traefik, a load balancer), do not use the profile: send traffic to the app on port 3000 (`APP_PORT`), keep `TRUST_PROXY=true` and `COOKIE_SECURE=true`, and make sure the proxy passes the `X-Forwarded-For` header and does not buffer the `/api/events` stream (it is a long-lived connection that feeds the live dashboard).

## Without Docker

You need Node.js 24 or newer and a PostgreSQL database.

```sh
npm run install:all
npm --prefix web run build
cd server
DATABASE_URL=postgres://user:password@localhost:5432/attendance \
WEB_DIR=../web/dist DATA_DIR=/var/lib/qr-attendance \
npm start
```

The server applies the database migrations when it starts. `DATA_DIR` must be a folder the process can write to. Run it under a service manager (systemd, for example) so it restarts by itself, and put a reverse proxy with HTTPS in front of it as described above.

## Updating

With the published image, pick the version in `.env` (`APP_VERSION=0.1.0`; without it you follow `latest`) and run:

```sh
git pull
docker compose -f docker-compose.yml -f docker-compose.image.yml pull
docker compose -f docker-compose.yml -f docker-compose.image.yml up -d
```

If you build from the source instead: `git pull` and `docker compose up -d --build`.

Database migrations run automatically when the new version starts. Read the [changelog](../CHANGELOG.md) before updating, and make a [backup](#backups) first.

## Backups

Back up both places, together:

```sh
# The database
docker compose exec -T db pg_dump -U qras qras > backup-$(date +%F).sql

# The uploaded files (employee photos and saved reports)
docker run --rm -v qr-attendance_app-data:/data -v "$PWD":/backup alpine \
  tar czf /backup/files-$(date +%F).tar.gz -C /data .
```

To restore on a fresh installation, start only the database, load the dump, then start the app:

```sh
docker compose up -d db
docker compose exec -T db psql -U qras qras < backup-2026-01-01.sql
docker compose up -d
```

Unpack the files archive into the `app-data` volume the same way (`tar xzf` inside a throwaway container). Keep backups on another machine, and try a restore from time to time: a backup nobody has restored is a hope, not a backup.

## Recovering access

Only the owner and the administrators have accounts. If one of them forgets their password:

- With email configured, they use "Forgot your password?" on the sign-in screen and get a link.
- Without email, the owner can create a password link for an administrator from the Employees screen.
- If the owner is locked out, someone with access to the server prints a one-time link:

  ```sh
  docker compose exec app node src/cli/reset-password.ts owner@example.com
  ```

  Without Docker: `npm --prefix server run reset-password -- owner@example.com`. The link is valid for 24 hours and signs out the account's open sessions when used. It starts with `PUBLIC_URL` when that is set and with `http://localhost:3000` otherwise: if you reach the app at another address, replace that part of the link with it.

## Uninstalling

```sh
docker compose down        # stops it and keeps the data
docker compose down -v     # also deletes the database and the files: this cannot be undone
```
