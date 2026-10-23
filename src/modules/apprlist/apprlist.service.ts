import { rm } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { DatabaseService, type SqlParams } from '../../common/database/database.service';
import { input, todayStamp, type RequestInput } from '../../common/helpers';
import { ChannelLogger } from '../../common/logger/channel-logger.service';
import { MailGuardService } from '../../common/mail/mail-guard.service';
import { ViewService } from '../../common/view/view.service';
import { col, colStr, formatSqlDate, pdoArgs, serializeRow, type SqlRow } from '../jobs/sql-row';
import { likeContains, parseDtRequest, type DtResponse } from './datatables';

/** First pending level of every document still waiting for approval. */
const PENDING_CTE = `
  WITH cte AS (
    SELECT *, ROW_NUMBER() OVER (PARTITION BY doc_no, entity_cd, approve_seq ORDER BY level_no ASC) AS rn
    FROM mgr.cb_cash_request_appr
    WHERE status = 'P' AND currency_cd IS NOT NULL AND LTRIM(RTRIM(entity_cd)) NOT LIKE '%[^0-9]%'
  )`;

/** DataTables column `data` → SQL expression (whitelist for search and ordering). */
const DT_COLUMNS: Record<string, { search: string; order: string }> = {
  entity_cd: { search: 'entity_cd', order: 'entity_cd' },
  doc_no: { search: 'doc_no', order: 'doc_no' },
  approve_seq: { search: 'CONVERT(NVARCHAR(50), approve_seq)', order: 'approve_seq' },
  user_id: { search: 'user_id', order: 'user_id' },
  level_no: { search: 'CONVERT(NVARCHAR(50), level_no)', order: 'level_no' },
  status: { search: 'status', order: 'status' },
  sent_mail_date: { search: 'CONVERT(NVARCHAR(23), sent_mail_date, 121)', order: 'sent_mail_date' },
  module: { search: 'module', order: 'module' },
  TYPE: { search: 'TYPE', order: 'TYPE' },
};

/** Argument layout of each resend SP family (ApprListControllers@sendData $routes params). */
type Shape = 'trx10' | 'ref10' | 'tm11' | 'lm5' | 'lm4' | 'plLyman' | 'plRevision' | 'plOverwrite' | 'poRequest' | 'poSelection';

interface ResendRoute {
  /** mail_cache folder of the approval email (date sub-folder = today). */
  folder: string;
  procedure: string;
  shape: Shape;
}

const r = (folder: string, procedure: string, shape: Shape): ResendRoute => ({ folder, procedure, shape });

/** module → TYPE → resend route (also the SP whitelist). */
const RESEND_ROUTES: Record<string, Record<string, ResendRoute>> = {
  CB: {
    E: r('send_cbfupd', 'mgr.x_send_mail_approval_cb_fupd', 'trx10'),
    U: r('send_cbppu', 'mgr.x_send_mail_approval_cb_ppu', 'trx10'),
    V: r('send_cbppuvvip', 'mgr.x_send_mail_approval_cb_ppu_vvip', 'trx10'),
    D: r('send_cbrpb', 'mgr.x_send_mail_approval_cb_rpb', 'trx10'),
    G: r('send_cbrum', 'mgr.x_send_mail_approval_cb_rum', 'trx10'),
  },
  CM: {
    C: r('send_cmclose', 'mgr.xrl_send_mail_approval_cm_contractclose', 'ref10'),
    B: r('send_cmdone', 'mgr.xrl_send_mail_approval_cm_contractdone', 'ref10'),
    E: r('send_cmentry', 'mgr.xrl_send_mail_approval_cm_contract_entry', 'ref10'),
    A: r('send_cmprogress', 'mgr.xrl_send_mail_approval_cm_progress', 'ref10'),
    F: r('send_cmprogresswu', 'mgr.xrl_send_mail_approval_cm_progress_with_unit', 'ref10'),
    D: r('send_varianorder', 'mgr.xrl_send_mail_approval_cm_varianorder', 'ref10'),
  },
  TM: {
    R: r('send_contract_renew', 'mgr.xrl_send_mail_approval_tm_contractrenew', 'tm11'),
  },
  LM: {
    D: r('send_Land_Boundary', 'mgr.xrl_send_mail_approval_land_boundary', 'lm5'),
    O: r('send_Land_Ccancel_NOP', 'mgr.xrl_send_mail_approval_land_cancel_nop', 'lm5'),
    '1': r('send_Land_Change_Name', 'mgr.xrl_send_mail_approval_land_change_name', 'lm5'),
    U: r('send_Land_Extension_SHGB', 'mgr.xrl_send_mail_approval_land_extension_shgb', 'lm5'),
    F: r('send_Land_Fph', 'mgr.xrl_send_mail_approval_land_fph', 'lm5'),
    M: r('send_Land_Handover_Legal', 'mgr.xrl_send_mail_approval_land_handover_legal', 'lm5'),
    H: r('send_Land_Handover_SHGB', 'mgr.xrl_send_mail_approval_land_handover_shgb', 'lm5'),
    B: r('send_Land_Map', 'mgr.xrl_send_mail_approval_land_map', 'lm5'),
    K: r('send_Land_Measuring', 'mgr.xrl_send_mail_approval_land_measuring', 'lm5'),
    A: r('send_Land_Measuring_SFT', 'mgr.xrl_send_mail_approval_land_measuring_sft', 'lm5'),
    J: r('send_Land_Merge_SHGB', 'mgr.xrl_send_mail_approval_land_sft_merge_shgb', 'lm5'),
    R: r('send_Land_Request', 'mgr.xrl_send_mail_approval_land_request', 'lm5'),
    W: r('send_Land_Request_Legal', 'mgr.xrl_send_mail_approval_land_request_legal', 'lm5'),
    T: r('send_Land_Sertifikat', 'mgr.xrl_send_mail_approval_land_sertifikat', 'lm4'),
    Y: r('send_Land_SFT_BPHTB', 'mgr.xrl_send_mail_approval_land_sft_bphtb', 'lm5'),
    X: r('send_Land_SFT_Propose', 'mgr.xrl_send_mail_approval_land_sft_propose', 'lm5'),
    Z: r('send_Land_SFT_SHGB', 'mgr.xrl_send_mail_approval_land_sft_shgb', 'lm5'),
    S: r('send_Land_SPH', 'mgr.xrl_send_mail_approval_land_sph', 'lm5'),
    Q: r('send_Land_Split_SHGB', 'mgr.xrl_send_mail_approval_land_split_shgb', 'lm5'),
    E: r('send_Land_Submission', 'mgr.xrl_send_mail_approval_land_submission', 'lm5'),
    V: r('send_Land_Verification', 'mgr.xrl_send_mail_approval_land_verification', 'lm5'),
    '2': r('send_Land_Verification_Payment', 'mgr.xrl_send_mail_approval_land_verification_payment', 'lm5'),
  },
  PL: {
    X: r('send_pl_budget_lyman', 'mgr.xrl_send_mail_approval_pl_budget_lyman', 'plLyman'),
    Y: r('send_pl_budget_revision', 'mgr.xrl_send_mail_approval_pl_budget_revision', 'plRevision'),
    A: r('send_Land_PL_Overwrite', 'mgr.xrl_send_mail_approval_pl_overwrite', 'plOverwrite'),
  },
  PO: {
    A: r('send_porder', 'mgr.x_send_mail_approval_po_order', 'trx10'),
    Q: r('send_porequeset', 'mgr.x_send_mail_approval_po_request', 'poRequest'),
    S: r('send_pos', 'mgr.x_send_mail_approval_po_selection', 'poSelection'),
  },
};

export interface SendDataReply {
  status: number;
  body: { message: string };
}

@Injectable()
export class ApprListService {
  constructor(
    private readonly db: DatabaseService,
    private readonly guard: MailGuardService,
    private readonly log: ChannelLogger,
    private readonly views: ViewService,
  ) {}

  /** GET /appr-list */
  page(): string {
    return this.views.render('apprlist/index');
  }

  /** GET /apprlist/data — DataTables server-side processing. */
  async data(query: Record<string, unknown>): Promise<DtResponse<SqlRow>> {
    const dt = parseDtRequest(query);
    const params: SqlParams = {};
    const filters: string[] = [];

    // Global search (yajra smart + multi_term): every word must match one searchable column.
    const searchable = dt.columns.filter((c) => c.searchable && DT_COLUMNS[c.data]);
    dt.search
      .split(/\s+/)
      .filter(Boolean)
      .forEach((term, t) => {
        if (!searchable.length) return;
        params[`q${t}`] = likeContains(term);
        filters.push(`(${searchable.map((c) => `${DT_COLUMNS[c.data].search} LIKE @q${t}`).join(' OR ')})`);
      });
    // Per-column search.
    dt.columns.forEach((c, i) => {
      if (!c.search || !c.searchable || !DT_COLUMNS[c.data]) return;
      params[`c${i}`] = likeContains(c.search);
      filters.push(`${DT_COLUMNS[c.data].search} LIKE @c${i}`);
    });
    const where = ['rn = 1', ...filters].join(' AND ');

    const order = dt.order
      .map((o) => ({ column: dt.columns[o.column], dir: o.dir }))
      .filter((o) => o.column?.orderable && DT_COLUMNS[o.column.data])
      .map((o) => `${DT_COLUMNS[o.column.data].order} ${o.dir}`);
    order.push('doc_no DESC'); // the PHP base query order, kept as tie-breaker

    const paging = dt.length === -1 ? '' : 'OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY';
    const [recordsTotal, recordsFiltered, rows] = await Promise.all([
      this.db.value<number>(`${PENDING_CTE} SELECT COUNT(*) AS n FROM cte WHERE rn = 1`),
      filters.length
        ? this.db.value<number>(`${PENDING_CTE} SELECT COUNT(*) AS n FROM cte WHERE ${where}`, params)
        : undefined,
      this.db.query(`${PENDING_CTE} SELECT * FROM cte WHERE ${where} ORDER BY ${order.join(', ')} ${paging}`, {
        ...params,
        offset: dt.start,
        limit: dt.length,
      }),
    ]);

    return {
      draw: dt.draw,
      recordsTotal: recordsTotal ?? 0,
      recordsFiltered: recordsFiltered ?? recordsTotal ?? 0,
      data: rows.map(serializeRow),
    };
  }

  /** POST /apprlist/sendData — deletes today's "already sent" marker and re-runs the approval-mail SP. */
  async sendData(body: RequestInput): Promise<SendDataReply> {
    const entityCd = input(body, 'entity_cd');
    const docNo = input(body, 'doc_no');
    const userId = input(body, 'user_id');
    const approveSeq = input(body, 'approve_seq');
    this.log.info('resend', `Received Data:  ${JSON.stringify({ entity_cd: entityCd, doc_no: docNo, user_id: userId })}`);

    const row = await this.db.first(
      `SELECT TOP 1 * FROM mgr.cb_cash_request_appr
       WHERE entity_cd = @entity_cd AND doc_no = @doc_no AND user_id = @user_id`,
      { entity_cd: entityCd, doc_no: docNo, user_id: userId },
    );
    const route = row ? RESEND_ROUTES[colStr(row, 'module')]?.[colStr(row, 'TYPE')] : undefined;
    if (!row || !route) return { status: 400, body: { message: 'INVALID REQUEST' } };

    const projectNo = await this.db.value<string>(
      'SELECT TOP 1 project_no FROM mgr.pl_project WHERE entity_cd = @entity_cd',
      { entity_cd: entityCd },
    );
    const userGroup = await this.db.value<string>(
      'SELECT TOP 1 group_name FROM mgr.security_groupings WHERE user_name = @user_id',
      { user_id: userId },
    );
    const spv = await this.db.value<string>('SELECT TOP 1 supervisor FROM mgr.security_users WHERE name = @user_id', {
      user_id: userId,
    });

    const levelNo = col(row, 'level_no');
    const first = Number(levelNo) === 1;
    const ctx = {
      entityCd,
      projectNo: projectNo ?? null,
      docNo,
      trxType: col(row, 'trx_type'),
      refNo: col(row, 'ref_no'),
      trxDate: formatSqlDate(col(row, 'doc_date'), 'YYYYMMDD') || null,
      status: first ? 'P' : 'A',
      downLevel: first ? '0' : Number(levelNo) - 1,
      userGroup: userGroup ?? null,
      userId,
      spv: spv ?? null,
      reason: '0',
    };

    // Delete today's marker (+ stale lock) written when the approval email was first sent.
    const date = todayStamp();
    const marker = this.guard.markerPath(route.folder, [approveSeq, entityCd, docNo, levelNo], 'email_sent', date);
    this.log.info('resend_apprlist', `DELETE CACHE INIT ${JSON.stringify({ dir: `${route.folder}/${date}`, marker, date })}`);
    await rm(marker, { force: true });
    await rm(`${marker}.lock`, { force: true });

    const args = pdoArgs(await this.resendArgs(route.shape, ctx));
    this.log.info('app', `Executing Procedure ${JSON.stringify({ proc: route.procedure, params: args })}`);
    try {
      await this.db.exec(route.procedure, args);
      return { status: 200, body: { message: 'SUCCESS' } };
    } catch (err) {
      this.log.error('app', `${route.procedure} failed for ${docNo}: ${(err as Error).message}`);
      return { status: 400, body: { message: 'FAILED' } };
    }
  }

  private async resendArgs(shape: Shape, c: Record<string, any>): Promise<unknown[]> {
    const approval = [c.status, c.downLevel, c.userGroup, c.userId, c.spv, c.reason];
    switch (shape) {
      case 'trx10':
        return [c.entityCd, c.projectNo, c.docNo, c.trxType, ...approval];
      case 'ref10':
        return [c.entityCd, c.projectNo, c.docNo, c.refNo, ...approval];
      case 'tm11': {
        const renewNo = await this.db.value(
          `SELECT TOP 1 renew_no FROM mgr.pm_tenancy_renew
           WHERE entity_cd = @entity_cd AND project_no = @project_no AND tenant_no = @tenant_no`,
          { entity_cd: c.entityCd, project_no: c.projectNo, tenant_no: c.refNo },
        );
        return [c.entityCd, c.projectNo, c.docNo, c.refNo, renewNo ?? null, ...approval];
      }
      case 'lm5':
        return [c.entityCd, c.docNo, c.status, c.downLevel, c.reason];
      case 'lm4': // land_sertifikat has no remarks parameter
        return [c.entityCd, c.docNo, c.status, c.downLevel];
      case 'plLyman':
        return [c.entityCd, c.projectNo, c.docNo, c.status, c.downLevel, c.userId];
      case 'plRevision':
        return [c.entityCd, c.projectNo, c.docNo, c.trxType, c.status, c.downLevel, c.userId];
      case 'plOverwrite':
        return [c.entityCd, c.projectNo, c.docNo, c.status, c.downLevel, c.reason];
      case 'poRequest':
        return [c.entityCd, c.projectNo, c.docNo, ...approval];
      case 'poSelection':
        return [c.entityCd, c.projectNo, c.docNo, c.refNo, c.trxDate, ...approval];
    }
  }
}
