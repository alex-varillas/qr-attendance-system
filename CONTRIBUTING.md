# Contributing

Thanks for wanting to help. This project is small on purpose: attendance control with QR codes for **one business per installation**, easy to install and to understand. Contributions that keep it that way are the easiest to accept.

## Before you start

- **Bugs and ideas:** open an issue first for anything bigger than a small fix, so we agree on the approach before you spend time on it.
- **Security problems:** do not open a public issue. Follow [SECURITY.md](SECURITY.md).
- **Scope.** Things that fit: fixes, tests, translations, accessibility, documentation, clearer screens, and features that a single business needs. Things that do not fit: multi-tenant or hosted-service features (plans, billing, several businesses in one installation), and anything that sends data to a third party by default.

## Set up

[docs/development.md](docs/development.md) explains how to run the project, the test commands and the conventions. In short:

```sh
npm run install:all
npm run db:dev && npm run db:test
cp server/.env.example server/.env
npm run dev:server        # in one terminal
npm run dev:web           # in another
```

## Making a change

1. Fork the repository and create a branch from `main`: `fix/short-name`, `feat/short-name`, `docs/short-name`.
2. Keep the change focused: one topic per pull request.
3. Add or update tests. A change to check-in, authorization, PIN handling or the security model needs its tests in the same pull request.
4. Make sure everything passes:

   ```sh
   npm test
   npm run lint
   npm run test:e2e
   npm --prefix web run i18n:check
   ```

5. Update the documentation in `docs/` and the [changelog](CHANGELOG.md) if the change alters something they describe or that users will notice.
6. Open the pull request and explain what changed and why.

## Commit messages

English, in the form `type(scope): description`, in the imperative and in lowercase after the colon:

```
fix(checkin): reject a check-in without coordinates
feat(web): add a language selector to the setup
docs(install): explain how to restore a backup
```

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`.

## Translations

Every text a person reads goes through `t()` and has an English entry in `web/src/i18n/en.js`; `npm --prefix web run i18n:check` checks it. Translate whole sentences, never pieces. The rules are in [docs/development.md](docs/development.md#translations). To improve a translation, edit the dictionary and open a pull request. To add a language, open an issue first.

## Style

- No secrets, keys or personal data in code, tests, screenshots or examples. Use made-up data.
- Follow the style of the surrounding code. ESLint and the TypeScript checker are the referees.
- Prefer boring and explicit over clever. A rule that protects data (authorization, PIN, location) should be easy to read and to test.

## License

By contributing you agree that your contribution is licensed under the [MIT license](LICENSE) of the project.
