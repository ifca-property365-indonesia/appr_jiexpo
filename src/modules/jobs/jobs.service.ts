import { Injectable } from '@nestjs/common';
import { DatabaseService, inParams } from '../../common/database/database.service';
import { now } from '../../common/helpers';
import { ChannelLogger } from '../../common/logger/channel-logger.service';
import { MailGuardService } from '../../common/mail/mail-guard.service';
import {
  AUTO_SEND_SP,
  AUTO_SEND_TEST_SP,
  FEEDBACK_DEFS,
  FEEDBACK_DESCS,
  FEEDBACK_MARKER_PREFIX,
  OLD_FEEDBACK_DEFAULT_DAY,
  OLD_FEEDBACK_MODULES,
  PO_REQUEST_SP,
  PO_SELECTION_SP,
  type FeedbackDef,
} from './jobs.constants';
import { col, colStr, defaultProjectNo, formatSqlDate, pdoArgs, type SqlRow } from './sql-row';

const TABLE = 'mgr.cb_cash_request_appr';
const AUTO_SEND_EXCLUDED_ENTITIES = ['DKY', 'DAN', 'KIA'];
const REASON = '0';

/** Approved rows of one day that are the last approval level of their document. */
const LAST_LEVEL_APPROVED_SQL = `
  SELECT t.* FROM ${TABLE} t
  WHERE t.status = 'A'
    AND DAY(t.approved_date) = @day AND MONTH(t.approved_date) = @month AND YEAR(t.approved_date) = @year
    AND t.level_no = (
      SELECT MAX(a.level_no) FROM ${TABLE} a
      WHERE a.entity_cd = t.entity_cd AND a.approve_seq = t.approve_seq AND a.doc_no = t.doc_no
        AND a.module = t.module AND a.request_type = t.request_type
    )
  ORDER BY t.approved_date DESC`;

export interface JobItem {
  entity_cd: string;
  doc_no: string;
  module: string;
  type: string;
  level_no?: string;
  procedure?: string;
  error?: string;
}

export interface JobSummary {
  job: string;
  total: number;
  processed: number;
  skipped: number;
  failed: number;
  items: JobItem[];
  errors: JobItem[];
}

function item(row: SqlRow, extra: Partial<JobItem> = {}): JobItem {
  return {
    entity_cd: colStr(row, 'entity_cd'),
    doc_no: colStr(row, 'doc_no'),
    module: colStr(row, 'module'),
    type: colStr(row, 'TYPE'),
    level_no: colStr(row, 'level_no'),
    ...extra,
  };
}

function summary(job: string, total: number): JobSummary {
  return { job, total, processed: 0, skipped: 0, failed: 0, items: [], errors: [] };
}

/**
 * Batch jobs triggered by an external cron via HTTP GET (Laravel AutoSend / AutoSendTest /
 * AutoFeedback / CheckFeedback / OldFeedback controllers). Each returns a JSON summary instead of
 * PHP's empty body / var_dump output.
 */
@Injectable()
export class JobsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly guard: MailGuardService,
    private readonly log: ChannelLogger,
  ) {}

  // ------------------------------------------------------------------ GET /api/autosend

  /** Re-triggers the approval email SP for pending rows whose email was never sent. */
  async autoSend(): Promise<JobSummary> {
    const excluded = inParams('ex', AUTO_SEND_EXCLUDED_ENTITIES);
    const rows = await this.db.query(
      `SELECT * FROM ${TABLE}
       WHERE sent_mail_date IS NULL AND status = 'P' AND entity_cd NOT IN (${excluded.sql})
       ORDER BY doc_no DESC`,
      excluded.params,
    );
    const result = summary('autosend', rows.length);

    for (const row of rows) {
      const module = colStr(row, 'module');
      const type = colStr(row, 'TYPE');
      const procedure = module === 'CM' && (type === 'Y' || type === 'F') ? undefined : AUTO_SEND_SP[module]?.[type];
      if (!procedure) {
        result.skipped++;
        continue;
      }

      const levelNo = Number(col(row, 'level_no'));
      let status = 'P';
      let downLevel = 0;
      if (levelNo !== 1) {
        downLevel = levelNo - 1;
        const prevStatus = await this.db.value(
          `SELECT TOP 1 status FROM ${TABLE} WHERE doc_no = @doc_no AND entity_cd = @entity_cd AND level_no = @level_no`,
          { doc_no: col(row, 'doc_no'), entity_cd: col(row, 'entity_cd'), level_no: downLevel },
        );
        if (prevStatus !== 'A') {
          result.skipped++;
          continue;
        }
        status = 'A';
      }

      try {
        await this.db.exec(procedure, await this.autoSendArgs(module, row, status, downLevel));
        result.processed++;
        result.items.push(item(row, { procedure }));
      } catch (err) {
        this.fail(result, row, procedure, err);
      }
    }
    return result;
  }

  private async autoSendArgs(module: string, row: SqlRow, status: string, downLevel: number): Promise<unknown[]> {
    const entityCd = col(row, 'entity_cd');
    const docNo = col(row, 'doc_no');
    // LM: 5-parameter land SPs; land_sertifikat (TYPE T) has no remarks parameter.
    if (module === 'LM') {
      return pdoArgs(
        colStr(row, 'TYPE') === 'T'
          ? [entityCd, docNo, status, downLevel]
          : [entityCd, docNo, status, downLevel, REASON],
      );
    }

    const userId = col(row, 'user_id');
    const { userGroup, supervisor } = await this.userInfo(userId);
    const refNo = col(row, 'ref_no');
    // CM: ref_no (always '' when not a string) instead of trx_type. CB / PO: trx_type.
    const fourth = module === 'CM' ? (typeof refNo === 'string' ? refNo.trim() : '') : col(row, 'trx_type');
    // x_send_mail_approval_po_request (PO TYPE Q) takes 9 parameters: no trx_type.
    const head = module === 'PO' && colStr(row, 'TYPE') === 'Q' ? [] : [fourth];
    return pdoArgs([
      entityCd,
      defaultProjectNo(entityCd),
      docNo,
      ...head,
      status,
      downLevel,
      userGroup,
      userId,
      supervisor,
      REASON,
    ]);
  }

  private async userInfo(userId: unknown) {
    const userGroup = await this.db.value<string>(
      'SELECT TOP 1 group_name FROM mgr.security_groupings WHERE user_name = @user_id',
      { user_id: userId },
    );
    const supervisor = await this.db.value<string>(
      'SELECT TOP 1 supervisor FROM mgr.security_users WHERE name = @user_id',
      { user_id: userId },
    );
    return { userGroup: userGroup ?? null, supervisor: supervisor ?? null };
  }

  // ------------------------------------------------------------------ GET /api/autosendtest

  /**
   * Dry run: lists the EXEC statements AutoSend would issue for pending rows with sent_mail set.
   * The PHP version prepared statements but never executed them (only var_dump'ed them).
   */
  async autoSendTest() {
    const rows = await this.db.query(
      `SELECT * FROM ${TABLE} WHERE sent_mail IS NOT NULL AND status = 'P' ORDER BY entity_cd DESC, doc_no DESC`,
    );
    const statements: string[] = [];
    let skipped = 0;

    for (const row of rows) {
      const module = colStr(row, 'module');
      const type = colStr(row, 'TYPE');
      const entityCd = String(col(row, 'entity_cd') ?? '');
      const projectNo = defaultProjectNo(entityCd);
      const docNo = String(col(row, 'doc_no') ?? '');
      const refNo = String(col(row, 'ref_no') ?? '');
      const userId = String(col(row, 'user_id') ?? '');
      const levelNo = Number(col(row, 'level_no'));
      const status = levelNo === 1 ? 'P' : 'A';
      const downLevel = levelNo === 1 ? '0' : String(levelNo - 1);
      const supervisor = 'Y';
      const userGroup = (await this.userInfo(userId)).userGroup ?? '';

      const tail = (...head: string[]) =>
        [...head, status, downLevel, userGroup, userId, supervisor, REASON].join(',');

      if (module === 'PO' && type === 'S') {
        const date = formatSqlDate(col(row, 'doc_date'), 'DD-MM-YYYY');
        statements.push(`SET NOCOUNT ON; EXEC ${PO_SELECTION_SP} ${entityCd}, ${tail(projectNo, docNo, refNo, date)}`);
      } else if (module === 'PO' && type === 'Q') {
        statements.push(`SET NOCOUNT ON; EXEC ${PO_REQUEST_SP} ${entityCd}, ${tail(projectNo, docNo)}`);
      } else {
        const procedure = AUTO_SEND_TEST_SP[module]?.[type];
        if (!procedure) {
          skipped++;
          continue;
        }
        const fourth = module === 'CM' ? refNo : String(col(row, 'trx_type') ?? '');
        statements.push(`SET NOCOUNT ON; EXEC ${procedure} ${entityCd}, ${tail(projectNo, docNo, fourth)}`);
      }
    }
    return { job: 'autosendtest', count: rows.length, skipped, statements };
  }

  // ------------------------------------------------------------------ feedback jobs

  /** GET /api/autofeedback — runs the feedback SP for today's final approvals without a sent marker. */
  async autoFeedback(): Promise<JobSummary> {
    const rows = await this.lastLevelApproved(Number(now('D')));
    const result = summary('autofeedback', rows.length);

    for (const row of rows) {
      const def = this.feedbackDef(row);
      if (!def) {
        result.skipped++;
        continue;
      }
      const keys = ['approve_seq', 'entity_cd', 'doc_no', 'status'].map((k) => col(row, k));
      await this.runFeedback(result, row, def, this.guard.markerPath(def.folder, keys, FEEDBACK_MARKER_PREFIX));
    }
    return result;
  }

  /**
   * GET /api/oldfeedback — same as autofeedback for one past day of the current month
   * (CB / PO only, marker key without approve_seq, as in the PHP version). `?day=` overrides day 16.
   */
  async oldFeedback(dayParam?: string): Promise<JobSummary> {
    const day = /^\d{1,2}$/.test(dayParam ?? '') ? dayParam! : OLD_FEEDBACK_DEFAULT_DAY;
    const rows = await this.lastLevelApproved(Number(day));
    const result = summary('oldfeedback', rows.length);
    const folderDate = now('YYYYMM') + day;

    for (const row of rows) {
      const def = OLD_FEEDBACK_MODULES.includes(colStr(row, 'module')) ? this.feedbackDef(row) : undefined;
      if (!def) {
        result.skipped++;
        continue;
      }
      const keys = ['entity_cd', 'doc_no', 'status'].map((k) => col(row, k));
      await this.runFeedback(
        result,
        row,
        def,
        this.guard.markerPath(def.folder, keys, FEEDBACK_MARKER_PREFIX, folderDate),
      );
    }
    return result;
  }

  /**
   * GET /api/checkfeedback — read-only: lists doc_no of today's final approvals whose feedback
   * marker (folder dated by approved_date) is missing.
   */
  async checkFeedback() {
    const rows = await this.lastLevelApproved(Number(now('D')));
    const missing: string[] = [];
    for (const row of rows) {
      const def = this.feedbackDef(row);
      if (!def) continue;
      const keys = ['approve_seq', 'entity_cd', 'doc_no', 'status'].map((k) => colStr(row, k));
      const marker = this.guard.markerPath(
        def.folder,
        keys,
        FEEDBACK_MARKER_PREFIX,
        formatSqlDate(col(row, 'approved_date'), 'YYYYMMDD'),
      );
      if (!(await this.guard.isMarked(marker))) missing.push(String(col(row, 'doc_no') ?? ''));
    }
    return { job: 'checkfeedback', total: rows.length, missing_count: missing.length, missing };
  }

  private lastLevelApproved(day: number) {
    return this.db.query(LAST_LEVEL_APPROVED_SQL, {
      day,
      month: Number(now('M')),
      year: Number(now('YYYY')),
    });
  }

  private feedbackDef(row: SqlRow): FeedbackDef | undefined {
    return FEEDBACK_DEFS[colStr(row, 'module')]?.[colStr(row, 'TYPE')];
  }

  private async runFeedback(result: JobSummary, row: SqlRow, def: FeedbackDef, marker: string) {
    if (await this.guard.isMarked(marker)) {
      result.skipped++;
      return;
    }
    try {
      await this.db.exec(
        def.procedure,
        pdoArgs([
          col(row, 'entity_cd'),
          col(row, 'doc_no'),
          col(row, 'level_no'),
          col(row, 'status'),
          col(row, 'TYPE'),
          col(row, 'module'),
          FEEDBACK_DESCS,
          def.label,
          REASON,
        ]),
      );
      result.processed++;
      result.items.push(item(row, { procedure: def.procedure }));
    } catch (err) {
      this.fail(result, row, def.procedure, err);
    }
  }

  private fail(result: JobSummary, row: SqlRow, procedure: string, err: unknown) {
    const error = (err as Error).message;
    result.failed++;
    result.errors.push(item(row, { procedure, error }));
    this.log.error('app', `${result.job}: ${procedure} failed for ${colStr(row, 'doc_no')}: ${error}`);
  }
}
