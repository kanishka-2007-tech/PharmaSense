# PharmaSense — AI-Powered Prescription & Medicine Interaction Checker

PharmaSense checks a list of medicines against a curated set of known drug
interactions and explains why each one matters in plain language.

## Features

- Search medicines and check combinations against a curated interaction dataset.
- Flag duplicate therapy and explain possible risks.
- Create accounts and revisit the last eight saved checks.
- View a dashboard with check history, dose tracking, and stock/expiry estimates.
- Use the interface's accessibility and language options.

## Technology

The frontend is plain HTML, CSS, and JavaScript. The dependency-free Node.js
backend serves the app and provides account, session, and history APIs.

- Passwords are hashed server-side with Node.js `scrypt`.
- Sessions use HttpOnly cookies.
- Account and check-history data are stored in `data/store.json` by default.
- Dose schedules and home-stock tracking remain in browser storage.

## Run locally

1. Install Node.js 18 or newer.
2. In the repository folder, run:

   ```bash
   npm start
   ```

3. Open **http://localhost:3000**, create an account, and use the app.
   Stop the server with `Ctrl+C`.

No packages or `.env` file are required. The server has portable defaults:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Address the server listens on |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Directory for persistent account and history data |
| `SESSION_TTL_DAYS` | `7` | Session lifetime |

Copy `.env.example` to `.env` only if you want to override these settings.
Existing process environment variables take precedence. For deployment, use a
persistent `DATA_DIR` and set `NODE_ENV=production` when serving through HTTPS;
production sessions then use the `Secure` cookie attribute. Serve the app from
this backend rather than opening its HTML files directly or using a static-only
server.

Accounts from the previous browser-only demo are not imported; create a new
account on the backend. Dose and stock-tracker entries remain in browser
storage.

Run backend integration tests with `npm test`.

## Data and medical disclaimer

The JSON-file backend is for local development and demos, not multi-instance
hosting or sensitive medical records. Protect and back up the data directory;
it is excluded from Git. The interaction database is a small educational subset,
may be incomplete, and is not a substitute for a doctor or pharmacist.

## Project structure

```text
PharmaSense/
├── server.js           # Static file server and auth/history API
├── package.json        # Start and test commands; no external packages
├── .env.example        # Portable optional settings
├── index.html          # Main interaction checker
├── login.html
├── signup.html
├── css/
├── js/
│   ├── auth.js         # Backend API client and session helpers
│   ├── data.js         # Medicine and interaction data
│   ├── app.js          # Checker, dashboard, and history UI
│   └── toast.js
├── assets/
└── server.test.js      # Backend integration tests
```
