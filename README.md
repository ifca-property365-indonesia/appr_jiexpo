# approval-jiexpo (NestJS)

NestJS port of the Laravel `approval_jiexpo` email-approval service for IFCA JIExpo.
The ERP posts a document to an endpoint, the service emails the approver an Approve / Revise / Reject
link, and the approver's choice is written back through the module's stored procedure.

## Stack

| Concern | Laravel | Here |
| --- | --- | --- |
| Framework | Laravel 10 | NestJS 12 (Express), TypeScript 6 |
| Database | `DB::connection('jiexpo')` (sqlsrv) | `mssql` 12 pool — `DatabaseService` |
| Mail | Mailable + Blade | nodemailer 10 + Eta 4 templates — `MailService` / `ViewService` |
| Link tokens | `Crypt::encrypt` (~800 chars) | 10-char random token + `mgr.approval_link` — `LinkTokenService` |
| Duplicate-send guard | `flock` + marker file | atomic lock file + same marker layout — `MailGuardService` |
| Logs | Monolog channels | `ChannelLogger` (same files/paths) |
| Config | `.env` | `.env` validated with zod at boot |

Approval links carry only a random token (e.g. `.../api/cbppu/A/82wfk44Hgi`); the link data is stored as JSON in
`mgr.approval_link` (create it with `../script/common/mgr.approval_link.Table.sql` before the first start).
Laravel `Crypt` tokens are not supported: this is a standalone service.

## Run

```bash
cp .env.example .env   # fill DB_*, MAIL_*, APP_URL
npm install
npm run build
npm run start:prod
```

Development: `npm run start:dev`. Tests: `npm test`. Type check: `npm run typecheck`.

Requires Node.js ≥ 22.12 (NestJS 12 ships as ESM and is loaded via `require(esm)`).

When deploying behind the existing reverse proxy, forward `/approval_jiexpo/*` to this service with the prefix
stripped so `APP_URL/api/...` and `APP_URL/public/...` resolve as before.

## Transaction log

Every transaction is written as one JSON object per line, one file per document per day:
`storage/logs/transactions/<DDMMYYYY>/<document>.log` (e.g. `23102026/CMEntry.log`, `23102026/LandMap.log`).
All lines of one HTTP request share a `request_id` (also returned as the `X-Request-Id` response header).

| event | when |
| --- | --- |
| `http.request` | every request: method, path, HTTP status, duration, key input fields (doc_no, entity_cd, level_no, ...) |
| `mail.sent` / `mail.failed` | every email: to / cc / bcc, subject, template, SMTP message id or error |
| `mail.skipped` | approval email not sent: no email address, already sent, send in progress |
| `approval.open` | approver opened an Approve / Revise / Cancel link: doc, level, approver, row state |
| `approval.action` | approver confirmed: action, doc_no, procedure, ok / error |
| `approval.invalid-link` | malformed or unknown link token |
| `sp.exec` | every stored-procedure call: procedure, arguments, duration, ok / error |
| `db.error`, `http.error` | failed SQL statements and unhandled request errors, with the message |

Document names come from the route (`src/common/logger/transaction-documents.ts`); `/api/maildata`,
`/api/getaccess` and `/api/processdata/<module>` use the dispatched module (`CbRpb`, `PoOrder`, ...).
Files are never rotated or deleted automatically.

```bash
grep '"doc_no":"CE01"' storage/logs/transactions/23102026/CMEntry.log   # one document
grep '"level":"error"' storage/logs/transactions/23102026/*.log         # all failures of the day
```

## Layout

```
src/
  config/env.ts            env schema (fails fast on bad config)
  common/                  shared infrastructure (see CONVENTIONS.md)
    approval/              send → confirm → action workflow, status meta, maildata registry
    crypto/                Laravel-compatible Crypt + PHP serialize
    database/ mail/ logger/ view/ helpers/
  modules/                 one Nest module per document group (cb, po, cm, pl, land, staff, jobs, apprlist, ...)
views/                     Eta templates: layouts/, pages/ (confirm, result), partials/, email/<group>/
public/                    static images served under /public
storage/                   runtime: mail_cache markers + logs (git-ignored)
```

See `CONVENTIONS.md` for how modules are structured.
