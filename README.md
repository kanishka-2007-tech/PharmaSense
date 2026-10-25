# PharmaSense — AI-Powered Prescription & Medicine Interaction Checker

A web app that checks a list of medicines against known drug-drug interactions
and explains *why* each one matters, in plain language — not just a
"contraindicated" flag.

**Live demo:** _add your GitHub Pages link here after deploying_

## The problem

In India (and globally), a huge number of adverse drug reactions happen because
patients — especially elderly ones on multiple medications — don't know which
drugs interact badly with each other, or misread doctor handwriting on
prescriptions. Pharmacists catch some of this, but a lot slips through,
especially in rural areas with fewer pharmacists per capita.

## What it does

- **Sidebar navigation** — quick access to the checker, history, and about section
- **Search & add** medicines from a prescription (type-ahead, keyboard
  navigable)
- **Checks every pair** against a curated dataset of ~25 well-documented
  interactions (e.g. Warfarin + Aspirin, Sildenafil + Nitrates, SSRIs +
  Tramadol)
- **Flags duplicate therapy** — two drugs from the same class (e.g. two
  NSAIDs), even when there's no classic "interaction"
- Each finding shows a **severity stamp**, a plain-language explanation of
  the mechanism, and a **"what to do"** recommendation
- **Accounts + history** — sign up, sign in, and revisit your last 8 checks
- **Large text toggle** — accessibility feature for elderly users
- **Emergency info** — sidebar includes emergency guidance

## Tech stack

- **Frontend**: Plain HTML/CSS/JavaScript, served locally with `npx serve`.
- **Backend**: FastAPI with SQLAlchemy and PostgreSQL.
- **Authentication**: bcrypt password hashes and signed JWT bearer tokens.
- **Data**: The curated medicine and interaction catalog is seeded into PostgreSQL
  from `backend/seed_data.json` on first startup.
- **History**: Authenticated checks are evaluated by the API and stored per user.
- **API docs**: Interactive Swagger UI at `http://localhost:8000/docs`.

## Project structure

```
PharmaSense/
├── index.html          # Main checker app (protected — redirects to login)
├── login.html
├── signup.html
├── backend/
│   ├── main.py           # FastAPI routes, models, auth, and interaction checks
│   ├── requirements.txt
│   ├── seed_data.json    # Curated catalog copied from js/data.js
│   └── .env.example
├── docker-compose.yml    # Local PostgreSQL
├── css/
│   ├── styles.css       # Design system, sidebar layout, shared components
│   ├── app.css           # Checker-specific UI styles
│   └── auth.css          # Split-panel login/signup layout
├── js/
│   ├── api.js            # API client and bearer-token handling
│   ├── auth.js           # Signup / login / session guard / logout
│   ├── data.js           # Built-in catalog fallback
│   ├── app.js            # Sidebar + checker UI + API-backed history
│   └── toast.js          # Toast notification helper
├── assets/
│   └── favicon.svg
└── README.md
```

## Running it locally

You need Python 3.11+ and Docker Desktop (or another local PostgreSQL 16
instance). Start PostgreSQL from the repository root:

```bash
docker compose up -d db
```

In PowerShell, create the environment, install the backend dependencies, and
copy the example configuration:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
Copy-Item backend\.env.example backend\.env
```

Replace `JWT_SECRET_KEY` in `backend\.env` with a private random value. For
example, generate one with `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
Then start FastAPI from the repository root:

```powershell
python -m uvicorn main:app --reload --app-dir backend
```

In a second terminal, serve the frontend on a CORS-allowed origin:

```powershell
npx serve . -l 5500
```

Open the URL printed by `serve`, create an account, and start checking
medicines. The first API startup creates the tables and seeds the catalog.
Existing check history is kept in PostgreSQL and is scoped to the signed-in
user.

To run the backend API tests, install the test dependencies and run:

```powershell
pip install -r backend\requirements-dev.txt
python -m pytest backend\tests
```

### API endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/signup` | Create an account and issue a JWT |
| `POST` | `/api/auth/login` | Verify credentials and issue a JWT |
| `GET`, `PATCH` | `/api/users/me` | Read or update the signed-in user's profile |
| `GET` | `/api/medicines` | List/search the medicine catalog |
| `GET` | `/api/interactions` | List curated interaction pairs |
| `POST` | `/api/interactions/check` | Check medicines and save the result |
| `GET` | `/api/history` | List the user's recent checks |
| `GET` | `/api/history/{id}` | Read one of the user's checks |
| `GET` | `/api/health` | Check API availability |

Except for signup, login, catalog, and health routes, requests require
`Authorization: Bearer <token>`. Set `CORS_ORIGINS` and `DATABASE_URL` in
`backend/.env` when using non-default frontend or database addresses.

## Ideas to extend this further

1. **Deploy it** — push to GitHub, enable GitHub Pages. Free, and gives you
   a live link for your resume instead of just a repo.
2. **Swap the dataset for a real API** — [openFDA](https://open.fda.gov/)
   or [RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/) both have free
   drug interaction/label data.
3. **Add OCR** — [Tesseract.js](https://tesseract.projectnaptha.com/) runs
   client-side, so users could photograph a prescription instead of typing.
4. **Add multilingual support** — Hindi, Tamil, etc. for broader accessibility
   in India.

## Disclaimer

This is a portfolio project built on a small, curated subset of
well-documented interactions. It does not cover every medicine or every
interaction and is **not a substitute for a pharmacist or doctor**.
The included JWT secret and database credentials are for local development
only. Before deployment, configure strong secrets, HTTPS, a restricted CORS
allowlist, and production database migrations/backups.
