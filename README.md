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

The frontend is plain HTML, CSS, and JavaScript. The Node.js backend serves the
app and provides account, session, and history APIs.

- Passwords are hashed server-side with Node.js `scrypt`.
- Sessions use HttpOnly cookies.
- Local account and check-history data are stored in `data/store.json`.
- Vercel deployments use a Neon Postgres database for account and history data.
- Dose schedules and home-stock tracking remain in browser storage.

## Run locally

1. Install Node.js 20 or newer.
2. In the repository folder, run:

   ```bash
   npm start
   ```

3. Open **http://localhost:3000**, create an account, and use the app.
   Stop the server with `Ctrl+C`.

The local server has portable defaults and does not require a database or
`.env` file:

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Address the server listens on |
| `PORT` | `3000` | HTTP port |
| `DATA_DIR` | `./data` | Directory for persistent account and history data |
| `SESSION_TTL_DAYS` | `7` | Session lifetime |

Copy `.env.example` to `.env` only if you want to override these settings.
Existing process environment variables take precedence. The JSON-file backend
is intended for local development and demos, not multi-instance hosting.

If the hosted API is unavailable, the sign-up and sign-in pages fall back to a
browser-only demo account. Passwords are PBKDF2-hashed before being stored in
that browser, and check history stays in the same browser. This fallback does
not sync across browsers or devices; use the Vercel/Neon setup below for
server-backed accounts.

## Deploy to Vercel

The Vercel deployment serves the static frontend and routes `/api/*` to a
serverless function backed by Neon Postgres. Before deploying:

1. Create a Neon Postgres project and copy its connection string.
2. In Vercel project settings, add `DATABASE_URL` with that connection string
   for each environment you deploy (Production, Preview, and/or Development).
   The database role must be allowed to create tables and indexes; PharmaSense
   initializes its schema automatically on the first API request.
3. Redeploy the project. Vercel detects the `api/[...path].js` function
   automatically.

`SESSION_TTL_DAYS` is optional and defaults to `7`. Set it in Vercel to override
the session lifetime. Production sessions use the `Secure` cookie attribute.
Accounts from local `data/store.json` are not migrated; create a new account
after deployment.

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
├── api/
│   └── [...path].js    # Vercel serverless API backed by Neon Postgres
├── package.json        # Start and test commands
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
├── auth.test.js        # Browser-only account fallback tests
├── server.test.js      # Local backend integration tests
└── vercel.test.js      # Vercel API configuration test
```
