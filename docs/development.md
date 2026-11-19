# Development

## Requirements

- Node.js 24 or newer. The server runs TypeScript directly (type stripping), so there is no build step for it.
- Docker, for PostgreSQL in development and in the tests.
- For the end-to-end tests, Google Chrome or Microsoft Edge (or set `CHROME_PATH` to a Chrome executable).

## Layout

```
server/
  src/          app.ts, config.ts, auth.ts, routes/, lib/ (check-in rules, files, mailer...), db/ (schema)
  drizzle/      generated SQL migrations
  test/         integration tests, one file per area
web/
  src/          App.jsx, pages/, components/, hooks/, lib/ (API client, live events), utils/, i18n/
  e2e/          browser tests of the whole app
  scripts/      i18n-check.mjs
docs/           guides
```

`server/` and `web/` are separate packages with their own `package.json` and lock file. The root `package.json` only has convenience scripts.

## Run it locally

```sh
npm run install:all            # installs server/ and web/
npm run db:dev                 # PostgreSQL on localhost:55432 (data kept in a Docker volume)
cp server/.env.example server/.env
npm run dev:server             # API on http://localhost:3000, restarts on changes
npm run dev:web                # web app on http://localhost:5173, proxies /api to the server
```

Open <http://localhost:5173>. On an empty database the first screen creates the business and the owner. To start from scratch, `docker compose -f docker-compose.dev.yml down -v` deletes the development database.

The web app is served by Vite, so it talks to the API from another origin: `server/.env.example` already sets `ALLOWED_ORIGINS=http://localhost:5173` for the cross-origin check.

## Tests

Start the throwaway test database first. It lives in memory, so it is empty every time it starts:

```sh
npm run db:test                # PostgreSQL on localhost:55433
```

| Command | What it runs |
| --- | --- |
| `npm test` | Server integration tests and web unit tests |
| `npm --prefix server test` | Server only. Each test file creates its own database and app |
| `npm --prefix web test` | Web unit tests (`node --test`) |
| `npm run lint` | `tsc --noEmit` on the server and ESLint on the web app |
| `npm run test:e2e` | Builds the web app and drives it in a real browser, with a new database and server per run |
| `npm --prefix web run i18n:check` | Fails if a text has no English translation |
| `npm --prefix web run screenshots` | Regenerates the images in `docs/images` from the real app with made-up data (needs `npm run db:test` and Chrome or Edge) |

The server tests talk to a real PostgreSQL, not mocks. Point them at another one with `TEST_DATABASE_URL` (a user that can create databases, `postgres://user:pass@host:port/postgres`).

The rules worth protecting have tests that were checked by breaking the rule on purpose: authorization of every endpoint, the PIN lockout, the location radius and the accuracy cap, the lock that serializes simultaneous marks, file validation and the "no route is public by accident" table. When you change one of those areas, keep or extend its tests.

## Database changes

1. Edit `server/src/db/schema.ts`.
2. Run `npm --prefix server run db:generate` and review the SQL it writes in `server/drizzle`.
3. Commit the schema change and the migration together.

The server applies pending migrations at startup. Never edit a migration that was already released: add a new one.

## Translations

The interface is in Spanish and English. The Spanish text written in the code is the key of the English dictionary:

```jsx
import { t, tn } from '../../i18n'

<h1>{t('Empleados')}</h1>                                  // 'Empleados' | 'Employees'
<p>{t('Hola, {0}', [name])}</p>                            // values go in {0}, {1}...
<p>{tn(count, '{0} reporte', '{0} reportes')}</p>          // quantities: two full phrases
```

Rules:

- Every text a person reads goes through `t()` (or `tn()`), and every new text gets its entry in `web/src/i18n/en.js`. `npm --prefix web run i18n:check` fails otherwise. A text with no entry only falls back to Spanish at runtime.
- Never build a sentence by gluing pieces. Translate whole phrases, with `{0}` for the values, because other languages order words differently.
- A constant defined at module level cannot call `t()` when the file loads (the language is not known yet). Use a getter: `{ get label() { return t('Guardar') } }`.
- Do not name a variable or a parameter `t`: it hides the translation function. ESLint rejects it.
- Dates, months and weekdays come from `web/src/utils/dates.js`, which follows the language through `Intl`. Do not format them by hand.
- The server answers in English. A message the user can see needs its Spanish version in `web/src/i18n/serverMessages.js`, and `i18n:check` verifies it.
- A screen that can be open while the language changes (the layout, Settings, the setup) calls `useLocale()` so it redraws.

To add a language, add its dictionary next to `en.js` and register it in `DICTIONARIES` and `SUPPORTED_LOCALES` in `web/src/i18n/index.js`, extend the language selectors in Settings and Setup, give `serverMessages.js` its version, and add the code to the `locale` enums in `server/src/routes/auth.ts` and `server/src/routes/settings.ts`.

## Releases

1. Move the entries of `## [Unreleased]` in `CHANGELOG.md` under a new `## [x.y.z] - date` heading, and set the version in the three `package.json` files.
2. Merge that through a pull request, then tag `main`: `git tag vx.y.z && git push origin vx.y.z`.
3. The **Release** workflow publishes the Docker image to `ghcr.io/alex-varillas/qr-attendance-system` (tags `x.y.z`, `x.y` and `latest`, for amd64 and arm64) and creates the GitHub release with the notes of that version from the changelog.

## Conventions

- Commits are written in English: `type(scope): description`, for example `fix(checkin): reject a check-in without coordinates`.
- A change that touches check-in, authorization, PIN handling or the security model needs its tests in the same commit.
- No secrets in the repository. Configuration goes through environment variables.
- Keep the guides in `docs/` true: if a change alters something they describe, update them in the same change.
