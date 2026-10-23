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
| Link tokens | `Crypt::encrypt` | `LaravelCryptService` (same algorithm, same `APP_KEY`) |
| Duplicate-send guard | `flock` + marker file | atomic lock file + same marker layout — `MailGuardService` |
| Logs | Monolog channels | `ChannelLogger` (same files/paths) |
| Config | `.env` | `.env` validated with zod at boot |

Approval links carry a short random token (e.g. `82wfk44Hgi`, `LinkTokenService`); the link data is stored
encrypted with `APP_KEY` in `mgr.approval_link` (create it with `../script/common/mgr.approval_link.Table.sql`).
Long tokens from the PHP app or older links keep working as long as `APP_KEY` and `APP_URL` are unchanged.

## Run

```bash
cp .env.example .env   # fill DB_*, MAIL_*, APP_KEY (copy from Laravel .env), APP_URL
npm install
npm run build
npm run start:prod
```

Development: `npm run start:dev`. Tests: `npm test`. Type check: `npm run typecheck`.

Requires Node.js ≥ 22.12 (NestJS 12 ships as ESM and is loaded via `require(esm)`).

When deploying behind the existing reverse proxy, forward `/approval_jiexpo/*` to this service with the prefix
stripped so `APP_URL/api/...` and `APP_URL/public/...` resolve as before.

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
