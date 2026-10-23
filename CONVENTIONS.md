# Porting conventions (Laravel → NestJS)

Source app: `../approval_jiexpo` (Laravel 10). Reference port: `src/modules/cb/cb-ppu.*` + `views/email/cb/ppu.eta`.

## Layout
- `src/common/` — shared infrastructure (do not duplicate it in modules):
  - `approval/approval.service.ts` — the 3-step flow: `sendApprovalMail()` (+ `outcomeText()` / `outcomeCallback()`),
    `confirmationPage()`, `runAction()`, `projectDescs()`, `resultPage()`, and raw access to `db`, `crypt`, `views`, `mail`, `guard`, `log`.
  - `approval/approval-status.ts` — `statusMeta(status)` (A/R/C labels, colours, images), `normalizeReason(reason, fallback)`.
  - `approval/maildata.registry.ts` — modules reachable via `/api/maildata` + `/api/getaccess` register here in `onModuleInit`.
  - `crypto/laravel-crypt.service.ts` — `encrypt()/decrypt()` compatible with Laravel `Crypt` (same APP_KEY).
  - `database/database.service.ts` — `query/first/value/exists` with named params (`@doc_no`), `exec(sp, args[])`, `inParams()`.
  - `mail/mail.service.ts`, `mail/mail-guard.service.ts` — nodemailer + send-once markers (`storage/app/mail_cache/...`).
  - `logger/channel-logger.service.ts` — Laravel log channels (`sendmail`, `sendmailapproval`, `sendmailfeedback`, `resend`, `resend_apprlist`, `app`).
  - `helpers/` — `entityName`, `input`, `emailInput`, `explode`, `cleanList`, `pairAttachments`, `approverList`,
    `flattenNewlines`, `numberFormat`, `safeNumber`, `safeDateFormat`, `formatDate`, `parseDate`, `now`, `todayStamp`, `isFilled`.
- `src/modules/<group>/` — one Nest module per group; controllers stay thin, logic lives in services.
- `views/` — Eta templates (`.eta`). `layouts/email.eta` (header logo + entity name, grey body, "do not reply", footer),
  `layouts/page.eta`, `pages/confirm.eta`, `pages/result.eta`, `partials/{action-buttons,attachments,approvers,signature,detail-table}.eta`.
  Email templates: `views/email/<group>/<name>.eta`, starting with `<% layout('/layouts/email') %>`.
  Helpers available unprefixed in templates: `url, asset, logo, entityName, isFilled, numberFormat, formatDate, safeNumber, safeDateFormat`.
  Use `<%= %>` (escaped). Use `<%~ %>` only for `include(...)` / trusted HTML.

## Rules
- Keep every Laravel route path and HTTP method identical (`/api/...`). Controllers use `@Controller('api/<segment>')`.
- Keep request field names, encrypted payload keys (`data2Encrypt`), stored-procedure names and argument order,
  `type`/`type_module`/`text` values, cache folder names and marker key order exactly as in PHP — the ERP, the
  database and already-sent email links depend on them.
- Response shape: plain string where PHP returned a string, JSON (with the same HTTP status) where PHP returned
  `response()->json(...)`, HTML (via `ViewService`/`ApprovalService`) where PHP returned a view.
- Entity name always goes through `entityName()` (default PT JAKARTA INTERNATIONAL EXPO).
- Collapse copy-pasted controllers into one service driven by a definition table when they only differ by
  constants (type code, SP, text, template, cache folder) — see `PPU`/`PPU_VVIP` in `cb-ppu.service.ts`.
- Drop dead Laravel code: `Artisan::call('config:cache')`, `Cache::flush()`, unused variables, `var_dump`, commented code.
- `if ($sth == true)` in PHP is always true; failures are exceptions. `runAction()` renders the fail page on exceptions.
- SQL: never interpolate request data; use named parameters. Table/column names are as in PHP (`mgr.` schema).
- No new dependencies without a strong reason.
