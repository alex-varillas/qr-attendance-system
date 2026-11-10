# Configuration

The app is configured with environment variables. With Docker Compose you set them in the `.env` file next to `docker-compose.yml` (start from `.env.example`). Without Docker you set them in the environment of the server process, or in `server/.env` (the `npm start` and `npm run dev` scripts read it).

## Variables

### Docker Compose

| Variable | Default | What it does |
| --- | --- | --- |
| `POSTGRES_PASSWORD` | none, required | Password of the database. Use a long random value. |
| `APP_PORT` | `3000` | Port where the app listens on this machine. |
| `DOMAIN` | `localhost` | Domain served by Caddy. Used only with `--profile https`. |

### The app

| Variable | Default | What it does |
| --- | --- | --- |
| `DATABASE_URL` | none, required | PostgreSQL connection string. Compose builds it from `POSTGRES_PASSWORD`. |
| `PORT` | `3000` | Port of the server process. |
| `HOST` | `0.0.0.0` | Address the server listens on. |
| `DATA_DIR` | `./data` (`/data` in the image) | Folder for uploaded files: employee photos and saved reports. Must be writable and should be backed up. |
| `WEB_DIR` | none (`/app/web/dist` in the image) | Folder with the built web app. When empty the server runs the API only, which is what development uses. |
| `PUBLIC_URL` | the address the browser used | Public address of the installation, used in invitation and password links. Set it when the app is behind a proxy. |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy, so the app reads the client address from `X-Forwarded-For`. Without it every request seems to come from the proxy and the rate limits treat everyone as one client. |
| `COOKIE_SECURE` | `auto` | `true` sends the session cookie only over HTTPS; `false` allows HTTP; empty follows the protocol of each request. Set it to `true` once you have HTTPS. |
| `SESSION_DAYS` | `14` | How long a sign-in lasts. |
| `ALLOWED_ORIGINS` | none | Extra origins allowed to send changes to the API, comma separated. Only needed in development, where the web app runs on another port. |
| `SMTP_URL` | none | Connection to an email server, for example `smtps://user:password@smtp.example.com:465`. See [email](#email). |
| `SMTP_FROM` | `QR Attendance <no-reply@localhost>` | Sender of the emails. |
| `LOG_LEVEL` | `info` | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`. |
| `RATE_LIMIT` | `true` | Per-IP rate limits on the public endpoints. Turn it off only in tests. |

Never commit your `.env`. It holds the database password and, if you use email, the SMTP credentials.

## Email

Email is optional. These are the only emails the app can send, and all of them need `SMTP_URL`:

- **Invitation of an administrator** (link valid for 72 hours). The link is always shown on screen too, so the owner can send it through any channel.
- **"Forgot your password?"** on the sign-in screen (link valid for 2 hours). It always answers the same way, so it cannot be used to find out which emails have an account.

Without `SMTP_URL` everything still works: the owner copies the invitation link from the screen, creates a password link for an administrator from the Employees screen (valid for 24 hours, shown on screen only), and the sign-in screen explains how to get back in. The owner's own password is reset from the server, see [recovering access](installation.md#recovering-access).

If sending fails the error is written to the log and the person sees the same screen as without email.

The app sends nothing else: no reports, no reminders, no marketing.

## HTTPS and reverse proxies

See [installation](installation.md#https). In short: behind any proxy set `TRUST_PROXY=true`, `COOKIE_SECURE=true` and `PUBLIC_URL=https://your.domain`.

## What leaves your server

Nothing is sent to the project's authors: there is no telemetry, no analytics and no update check. These are the only outside services the app talks to, and both are optional for the core use:

- **Address search** (setting the location of a branch on the map). When someone types an address, or clicks the map to find the address of a point, **your server** sends that text or coordinate to the public OpenStreetMap-based services Photon (`photon.komoot.io`) and, as a fallback, Nominatim (`nominatim.openstreetmap.org`). The browser never contacts them. Nothing about employees is sent, only what is typed or clicked in the location editor. If you cannot or do not want to use them, set the coordinates by clicking the map, which does not need them.
- **Map tiles.** The location editor shows an OpenStreetMap map, so the **browser** of the person editing a location loads tiles from `tile.openstreetmap.org`. Employees checking in do not load a map.

The fonts, icons and the QR code generator are bundled with the app. The pages load no third-party scripts, fonts or trackers.

## Data and privacy

- Employee PINs are stored only as argon2id hashes. Passwords too.
- Sign-in tokens, invitation links and password links are stored only as SHA-256 hashes.
- The GPS position of a check-in is stored with the record, and blocked attempts outside the radius are kept to help you see whether the radius is well calibrated. Only the owner and the administrators can see them.
- Employee photos and saved reports are files inside `DATA_DIR`, outside the database.
- Depending on where your employees work, laws about employee data and location tracking may apply to you as the operator of this installation. Tell your employees what is recorded and why.
