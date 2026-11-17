<h1 align="center">Sanctuary</h1>

<p align="center">
  <img width="160" height="160" alt="Sanctuary" src="frontend/public/brand/logo.svg" />
</p>

<p align="center">
  Tesorería de la iglesia: diezmos, ofrendas, miembros, informes y constancias de impuestos.<br>
  <em>Church treasury: tithes, offerings, members, reports and tax statements.</em>
</p>

---

## Background

I have been part of my church's congregation for about five years. When I came across the treasury department, I noticed that offerings were still being tracked with a pen and a journal: no computers, no software. As a software engineer whose passion is web development, I saw a real problem I could solve for people I know.

Sanctuary replaces that journal. Instead of tracking down every member, adding up totals by hand and worrying about where to keep the notebook, the treasury team records each offering in seconds and gets the totals, trends and statements instantly.

## What it does

The app is in **Spanish first**, with English one click away. It has light and dark modes, large type and large buttons, and it uses plain words throughout. It was designed for volunteers who are not technical.

| Area | What you get |
|---|---|
| **Inicio** (dashboard) | Year and month totals compared with the same point last year, offerings by month (this year over last), split by fund, top givers, giving by year and by payment method, latest offerings, goal progress, and a *Novedades* feed that points out trends: 30-day change, best month, new givers, and regular givers who have stopped. |
| **Ofrendas** | Every tithe and offering, with search, period, fund and method filters, and an Excel (CSV) download. Recording one takes a name (or envelope number), an amount and Enter. |
| **Conteos** | One count sheet per service: rapid entry, a cash check by bill and coin that tells you whether the drawer balances, closing and reopening, and a printable sheet with signature lines for the two counters. |
| **Miembros** | A directory with photo avatars, contact details, envelope numbers and status. Each profile shows the year's total, the change from last year, the last 12 months, a breakdown by fund and the full history. |
| **Informes** | Eight ready-made reports (summary, by month, by member, by fund, by method, detail, one member's statement, counts) for any period. Print them, download them as PDF or Excel, or e-mail them. E-mailing a member statement to many members sends each person only their own. |
| **Impuestos** | Year-end contribution statements: a checklist of what each statement needs, IRS guidance in plain words ($250 rule, January 31, required wording), flags for missing addresses or e-mails, a PDF per member or all at once, and e-mail delivery with a record of what was sent. Funds such as food sales can be marked as not deductible. |
| **Metas** | Campaigns such as "new roof" tied to a fund and dates. Progress is calculated automatically. |
| **Asistente** (AI) | Ask questions in your own words ("which members haven't given in two months?") and get answers with real numbers from your data. |
| **Actividad** | A log of who did what. Everyone on the team can change everything, so every change is recorded. |
| **Configuración** | Church details and logo, funds, team and invitation codes, your profile (photo, language, theme, password), CSV import with Spanish or English column names, and backups. |

### AI features (Google Gemini)

These turn on as soon as a key is present and stay hidden until then:

- **Resumen inteligente**: a short daily summary at the top of the dashboard.
- **Asistente**: a chat that queries the database through tools scoped to your church, so it can only see your church's records and its numbers come from real queries.
- **Explicar con IA**: a plain-language explanation of any report, which can be included in the PDF.
- **Dictar o pegar notas**: inside a count, type or dictate "María López 50 diezmo, 135 de ofrenda suelta…" and check the rows it finds before adding them.
- **Mejorar el mensaje**: drafts the e-mail that goes out with reports and statements.

### Accounts and access

- Whoever registers first creates the church. Everyone else joins with an **invitation code** (`Configuración → Equipo`), which can be limited by number of uses and expiry date, and revoked.
- There is **one role**: anyone in the church can see and change everything. Data from different churches is completely separated.
- Password reset works by e-mail with a link that expires after one hour. Using it signs the account out everywhere else.

## Try it in your browser (GitHub Codespaces)

You can run Sanctuary without installing anything on your computer:

1. On the repository page on GitHub, click **Code → Codespaces → Create codespace** (pick the branch first if it isn't `main`).
2. Wait two or three minutes while it installs everything and loads the demo church. Sanctuary then opens in a new tab on port **5173**.
3. Sign in with `demo@sanctuary.app` / `sanctuary123`.

**AI and e-mail:** add `GEMINI_API_KEY` (and, optionally, `SMTP_HOST`, `SMTP_USER`, `SMTP_PASS`) as Codespaces secrets at <https://github.com/settings/codespaces>, give them access to this repository, and restart the codespace. **Code → Codespaces → ⋯ → New with options** also asks for them. Keys saved this way never end up in the repository.

**Good to know:**
- The database keeps its data while you stop and start the codespace. Deleting the codespace deletes the data.
- A codespace stops itself after 30 idle minutes, and personal accounts include a monthly allowance of free hours.
- Server logs are in `/tmp/sanctuary-api.log` and `/tmp/sanctuary-web.log`. If the app ever stops, run `bash .devcontainer/start.sh` in the terminal.
- This is a workspace for trying and developing Sanctuary, not hosting for the church team. For that, see *Running in production* below.

## Getting started (on your own computer)

Requirements: **Node.js 20+** and **PostgreSQL 14+**.

```bash
git clone https://github.com/Tonys-Coding/Sanctuary.git
cd Sanctuary
```

**1. Backend**

```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` and `JWT_SECRET`. The tables are created automatically when the server starts.

```bash
npm run seed   # optional: demo church with 2+ years of sample data
npm run dev    # API on http://localhost:5001
```

The demo account is `demo@sanctuary.app` / `sanctuary123`, and its invitation code is `GRACIA24`.

**2. Frontend** (in a second terminal)

```bash
cd frontend
npm install
npm run dev    # http://localhost:5173
```

### Turning on AI

1. Get a free key at <https://aistudio.google.com/apikey>.
2. In `backend/.env`, set `GEMINI_API_KEY=your-key`.
3. Restart the backend.

The model defaults to `gemini-3.8-flash` and can be changed with `GEMINI_MODEL`. If the key or model is wrong, the app shows a clear message rather than failing silently.

### Turning on e-mail

Fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` in `backend/.env`. Gmail, Outlook, Brevo and most providers work. Until then, password-reset links are printed in the backend console, and e-mail buttons explain that e-mail isn't configured.

### Bringing over data from the first version of Sanctuary

Create your account in the new app, then run:

```bash
cd backend
npm run import-legacy -- your-email@church.org
```

This copies the old `givers` (with their photos) and `offerings` tables into your church and turns the old categories into funds. The old tables are only read, never changed. You can also import any spreadsheet saved as CSV from `Configuración → Importar y respaldar`.

### Running in production

```bash
cd frontend && npm run build
cd ../backend && npm run build && NODE_ENV=production npm start
```

The backend serves the built frontend, so there is only one process to run. Set `APP_URL` to the public address so links in e-mails work. Uploaded photos are stored in `backend/uploads/` (or `UPLOAD_DIR`), so back that folder up along with the database.

## Tests

```bash
cd backend && npm test
```

The tests run against a real PostgreSQL database (`TEST_DATABASE_URL`, which defaults to `sanctuary_test`) and a stand-in Gemini server. They cover registration and invitations, separation between churches, reports and PDFs, tax rules, counts, password reset, the AI tool-calling loop and CSV import.

## Tech stack

| Front end | Back end |
|---|---|
| React 19 + TypeScript, Vite | Node.js + Express 5 + TypeScript |
| Tailwind CSS v4 (light and dark design tokens) | PostgreSQL (`pg`), schema in `backend/src/schema.sql` |
| TanStack Query, React Router | Cookie sessions (JWT, httpOnly), bcrypt, rate limiting |
| Recharts, Lucide icons | PDFKit (reports and statements), Nodemailer, Sharp (photos) |
| Young Serif + Figtree | Google Gemini REST API with function calling |

```
Sanctuary/
├── backend/src
│   ├── routes/     auth, org, members, funds, offerings, batches, goals, reports, ai, data
│   ├── lib/        analytics, reports, pdf, gemini, mailer, files, csv
│   ├── scripts/    seed, importLegacy
│   └── tests/
└── frontend/src
    ├── pages/      one file per screen
    ├── components/ shared UI, charts, forms
    └── lib/        API client, app context (language, theme, formatting), labels
```

## Author

Anthony Salto: [@Tonys-Coding](https://github.com/Tonys-Coding)
