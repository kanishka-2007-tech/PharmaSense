# PharmaSense — Medicine Interaction Checker

A web app that checks a list of medicines against known drug-drug interactions
and explains *why* each one matters, in plain language — not just a
"contraindicated" flag.

**Live demo:** _add your GitHub Pages link here after deploying_

## The problem

Adverse drug reactions from unrecognized medicine combinations are a leading,
preventable cause of hospital admissions — especially for patients on
multiple prescriptions and in areas with fewer pharmacists per capita.
Pharmacists catch a lot of this, but not everything makes it through.

## What it does

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

## Tech stack

Plain HTML/CSS/JS — no build step, no framework, runs by opening
`index.html` (or via `npx serve`, see below). Deliberately dependency-light
so the whole thing is easy to read, extend, and deploy for free.

- **Auth**: client-side demo auth (`js/auth.js`) — accounts and sessions
  live in `localStorage`/`sessionStorage`. **This is not secure and is not
  meant to be** — it exists so the project runs with zero backend. A real
  build would hash+salt passwords server-side and issue a signed session
  token from an API.
- **Data**: `js/data.js` holds the medicine list and interaction pairs as
  plain JS objects.
- **Logic**: `js/app.js` handles search, chip management, the interaction
  check itself, and history.
- **Styling**: `css/styles.css` (shared design tokens + nav + forms),
  `css/app.css` (checker-specific UI), `css/auth.css` (login/signup layout).

## Project structure

```
PharmaSense/
├── index.html          # Main checker app (protected — redirects to login)
├── login.html
├── signup.html
├── css/
│   ├── styles.css       # Design tokens, nav, buttons, forms, toast
│   ├── app.css           # Search/chips/results/history styles
│   └── auth.css           # Split-panel login/signup layout
├── js/
│   ├── auth.js           # Signup / login / session guard / logout
│   ├── data.js             # Medicine + interaction dataset
│   ├── app.js               # Checker logic + history
│   └── toast.js               # Toast notification helper
├── assets/
│   └── favicon.svg
└── README.md
```

## Running it locally

No build step needed — but browsers restrict some features (like
`localStorage` in certain setups) on the raw `file://` protocol, so a tiny
local server is the safer way to run it:

```bash
cd PharmaSense
npx serve .
# or: python3 -m http.server 5500
```

Then open the printed local URL, sign up with any name/email/password
(8+ characters), and start adding medicines.

## Ideas to extend this further

1. **Deploy it** — push to GitHub, enable GitHub Pages. Free, and gives you
   a live link for your resume instead of just a repo.
2. **Swap the dataset for a real API** — [openFDA](https://open.fda.gov/)
   or [RxNorm](https://www.nlm.nih.gov/research/umls/rxnorm/) both have free
   drug interaction/label data.
3. **Add OCR** — [Tesseract.js](https://tesseract.projectnaptha.com/) runs
   client-side, so users could photograph a prescription instead of typing.
4. **Add a real backend** — move users + interaction data into Postgres,
   wrap it in a small FastAPI or Express service, hash passwords with
   bcrypt, and issue JWTs. Turns this from a frontend demo into a full-stack
   project.

## Disclaimer

This is a portfolio project built on a small, curated subset of
well-documented interactions. It does not cover every medicine or every
interaction and is **not a substitute for a pharmacist or doctor**.
