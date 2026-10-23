import {
  entityName,
  input,
  safeDateFormat,
  safeNumber,
  type RequestInput,
} from '../../common/helpers';
import {
  at,
  carbonDate,
  landBase,
  list,
  omit,
  phpNumber,
  raw,
  row,
  str,
  strToArray,
} from './land.helpers';

type Data = Record<string, any>;

/** Bordered table rendered under the detail rows (views/email/land/approval.eta). */
export interface LandGrid {
  title?: string;
  headers: string[];
  rows: string[][];
}

/** What views/email/land/approval.eta needs besides the `$dataArray` payload. */
export interface LandView {
  intro: string;
  rows?: [string, string][];
  grid?: LandGrid;
  attachmentsIntro?: string;
  approversIntro?: string;
  /** 'id' → Indonesian clarification / thank-you block (LandMergeShgb). */
  lang?: 'id';
}

/** One Land approval module (formerly one copy-pasted Land*Controller). */
export interface LandDefinition {
  /** Route segment (/api/<link>) and email button link. */
  link: string;
  /** cb_cash_request_appr.TYPE (data2Encrypt.type). */
  type: string;
  /** data2Encrypt.text — also used in log lines and result pages. */
  text: string;
  /** EXEC <procedure> entity_cd, doc_no, status, level_no, reason */
  procedure: string;
  /** storage/app/mail_cache/<cacheFolder>/<Ymd>/email_sent_<approve_seq>_<entity_cd>_<doc_no>_<level_no>.txt */
  cacheFolder: string;
  /** `$dataArray` — fed to the email template (the JSON callback only returns data.encrypted). */
  payload(body: RequestInput): Data;
  /** Email body (intro text, detail rows, grid). */
  view(d: Data): LandView;
  /** `$data2Encrypt` — defaults to {@link standardEncrypt}. */
  encrypt?(body: RequestInput, def: LandDefinition): Data;
  /** Bind level_no as int (LandSplitShgb used a named `(int)` binding). */
  levelNoAsInt?: boolean;
  /**
   * getaccess arguments when the SP does not take the standard
   * (entity_cd, doc_no, status, level_no, reason) list.
   */
  args?(data: Data, status: string, body: RequestInput): unknown[];
  /** POST /api/<link>/feedback cache folder (LandFph / LandVerification only). */
  feedbackFolder?: string;
}


/** Columns of the processData() where-clause — every Land controller includes approve_seq. */
export const LAND_KEY_FIELDS = [
  'doc_no',
  'entity_cd',
  'approve_seq',
  'level_no',
  'type',
  'module',
] as const;

export function standardEncrypt(body: RequestInput, def: LandDefinition): Data {
  return {
    entity_cd: input(body, 'entity_cd'),
    email_address: input(body, 'email_addr'),
    level_no: input(body, 'level_no'),
    approve_seq: input(body, 'approve_seq'),
    doc_no: input(body, 'doc_no'),
    entity_name: entityName(body.entity_name),
    type: def.type,
    type_module: 'LM',
    text: def.text,
  };
}

const rp = (v: unknown) => `Rp. ${str(v)}`;
const subjectNo = (label: string, no: unknown) => `Need Approval for ${label} No.  ${str(no)}`;

// ------------------------------------------------------------------------------------------ table

export const LAND_BOUNDARY: LandDefinition = {
  link: 'landboundary',
  type: 'D',
  text: 'Land Boundary',
  procedure: 'mgr.xrl_send_mail_approval_land_boundary',
  cacheFolder: 'send_Land_Boundary',
  payload: (b) => ({
    ...landBase(b),
    boundary_ref: raw(b, 'boundary_ref'),
    officer_cd: raw(b, 'officer_cd'),
    off_name: raw(b, 'off_name'),
    subject: subjectNo('Land Boundary', b.doc_no),
    link: 'landboundary',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk SPK Pematokan bidang tanah dengan detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('Nomor SPK Pematokan', d.boundary_ref),
      row('Petugas Pematokan', d.off_name),
      row('Tanggal Pematokan', d.transaction_date),
    ],
  }),
};

export const LAND_CANCEL_NOP: LandDefinition = {
  link: 'landcancelnop',
  type: 'O',
  text: 'Land Cancel NOP',
  procedure: 'mgr.xrl_send_mail_approval_land_cancel_nop',
  cacheFolder: 'send_Land_Ccancel_NOP', // sic — existing marker folder
  payload: (b) => ({
    ...landBase(b),
    sppt_name: raw(b, 'sppt_name'),
    nop_no: raw(b, 'nop_no'),
    owner_name: raw(b, 'owner_name'),
    cancel_remarks: raw(b, 'cancel_remarks'),
    subject: subjectNo('Land Cancel NOP', b.doc_no),
    link: 'landcancelnop',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk proses Pembatalan NOP dengan detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('NOP', d.nop_no),
      row('Nama pada SPPT', d.sppt_name),
      row('Nama Pemilik', d.owner_name),
      row('Tanggal Cancel NOP', d.transaction_date),
      // Blade read the misspelled 'cancell_remarks' key (undefined → mail failed).
      row('Alasan Pembatalan', d.cancel_remarks),
    ],
  }),
};

export const LAND_CHANGE_NAME: LandDefinition = {
  link: 'landchangename',
  type: '1',
  text: 'Land Change Name',
  procedure: 'mgr.xrl_send_mail_approval_land_change_name',
  cacheFolder: 'send_Land_Change_Name',
  payload: (b) => ({
    ...omit(landBase(b), 'descs', 'transaction_date'),
    change_no: raw(b, 'change_no'),
    land_title_no: raw(b, 'land_title_no'),
    land_title_area: raw(b, 'land_title_area'),
    land_title_name: raw(b, 'land_title_name'),
    land_title_pt: raw(b, 'land_title_pt'),
    payment_dt_descs: list(b, 'payment_dt_descs'),
    payment_amount: list(b, 'payment_amount'),
    subject: subjectNo('Land Change Name', b.change_no),
    link: 'landchangename',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Gambar Ukur yang terbentuk dengan detail :',
    rows: [
      row('Nomor Dokumen', d.change_no),
      row('No. Alas Hak', d.land_title_no),
      row('Luas Alas Hak', d.land_title_area),
      row('Nama Alas Hak (Awal)', d.land_title_name),
      row('Nama Alas Hak (Baru)', d.land_title_pt),
    ],
    grid: {
      title: 'Rincian Biaya',
      headers: ['No', 'Rincian', 'Nominal'],
      // number_format((float) $amount, 0, ',', '.')
      rows: (d.payment_dt_descs as string[]).map((desc, i) => [
        String(i + 1),
        desc,
        `Rp. ${phpNumber(at(d.payment_amount, i), 0).replaceAll(',', '.')}`,
      ]),
    },
  }),
};

export const LAND_EXTENSION_SHGB: LandDefinition = {
  link: 'landextensionshgb',
  type: 'U',
  text: 'Land SHGB Extension',
  procedure: 'mgr.xrl_send_mail_approval_land_extension_shgb',
  cacheFolder: 'send_Land_Extension_SHGB',
  payload: (b) => ({
    ...omit(landBase(b), 'transaction_date'),
    shgb_no: list(b, 'shgb_no'),
    nop_no: list(b, 'nop_no'),
    nib_no: list(b, 'nib_no'),
    nib_no_extension: list(b, 'nib_no_extension', ';'),
    shgb_area: list(b, 'shgb_area').map((v) => phpNumber(v)),
    shgb_date: list(b, 'shgb_date').map(carbonDate),
    shgb_date_extension: list(b, 'shgb_date_extension', ';').map(carbonDate),
    shgb_expired: list(b, 'shgb_expired').map(carbonDate),
    shgb_expired_extension: list(b, 'shgb_expired_extension').map(carbonDate),
    clarify_user: raw(b, 'clarify_user'),
    clarify_email: raw(b, 'clarify_email'),
    subject: `Need Approval for ${b.doc_no ?? ''}`,
    link: 'landextensionshgb',
  }),
  view: (d) => {
    const cols = [
      'shgb_no',
      'nop_no',
      'nib_no',
      'shgb_date',
      'shgb_expired',
      'shgb_area',
      'nib_no_extension',
      'shgb_date_extension',
      'shgb_expired_extension',
    ];
    const shgb = d.shgb_no as string[];
    // First row always; following rows only when shgb_no, nop_no and nib_no all have that index.
    const idx = shgb
      .map((_, i) => i)
      .filter((i) => i === 0 || (d.nop_no[i] !== undefined && d.nib_no[i] !== undefined));
    return {
      intro: 'Tolong berikan persetujuan untuk proses Perpanjangan SHGB dengan detail :',
      grid: {
        headers: [
          'No. SHGB',
          'No. NOP',
          'No. NIB',
          'Tanggal SHGB Terbit',
          'Tanggal SHGB Expired',
          'Luas SHGB (M²)',
          'No. NIB (BARU)',
          'Tanggal SHGB Terbit (BARU)',
          'Tanggal SHGB Expired (BARU)',
        ],
        rows: idx.map((i) => cols.map((c) => at(d[c], i))),
      },
    };
  },
};

export const LAND_HANDOVER_LEGAL: LandDefinition = {
  link: 'landhandoverlegal',
  type: 'M',
  text: 'Land Handover Legal',
  procedure: 'mgr.xrl_send_mail_approval_land_handover_legal',
  cacheFolder: 'send_Land_Handover_Legal',
  payload: (b) => {
    return {
      ...landBase(b),
      approve_list: strToArray(b.approve_exist),
      customer_name: strToArray(b.customer_name),
      shgb_no: raw(b, 'shgb_no'),
      nop_no: raw(b, 'nop_no'),
      shgb_name: raw(b, 'shgb_name'),
      shgb_area: phpNumber(b.shgb_area, 0),
      handover_to: strToArray(b.handover_to),
      remarks: strToArray(b.remarks),
      subject: `Need Approval for Land Handover Legal No. ${b.doc_no ?? ''}`,
      link: 'landhandoverlegal',
    };
  },
  view: (d) => {
    const join = (v: unknown) => (Array.isArray(v) ? v.join('; ') : str(v));
    return {
      intro: 'Tolong berikan persetujuan untuk Proses Penyerahan SHGB & SPPT :',
      grid: {
        headers: [
          'No. SHGB',
          'Nama',
          'Luas SHGB (m²)',
          'Diserahkan pada',
          'Nama Customer',
          'Tanggal Serah Terima',
          'Keterangan',
        ],
        // shgb_no is a single value here, so Blade always took its "single SHGB" branch.
        rows:
          d.shgb_no === null
            ? []
            : [
                [
                  join(d.shgb_no),
                  join(d.shgb_name),
                  join(d.shgb_area),
                  join(d.handover_to),
                  join(d.customer_name),
                  join(d.transaction_date),
                  join(d.remarks),
                ],
              ],
      },
    };
  },
};

export const LAND_HANDOVER_SHGB: LandDefinition = {
  link: 'landhandovershgb',
  type: 'H',
  text: 'Land Handover SHGB',
  procedure: 'mgr.xrl_send_mail_approval_land_handover_shgb',
  cacheFolder: 'send_Land_Handover_SHGB',
  payload: (b) => ({
    ...landBase(b),
    shgb_no: raw(b, 'shgb_no'),
    nop_no: raw(b, 'nop_no'),
    shgb_name: raw(b, 'shgb_name'),
    shgb_area: phpNumber(b.shgb_area),
    handover_to: raw(b, 'handover_to'),
    subject: subjectNo('Land Handover SHGB', b.doc_no),
    link: 'landhandovershgb',
  }),
  // The Blade view was a copy of the boundary mail reading keys this payload never had
  // (boundary_ref, off_name) — every send failed. Rows below show the real handover fields.
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk proses Serah Terima SHGB dengan detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('No. SHGB', d.shgb_no),
      row('NOP', d.nop_no),
      row('Nama SHGB', d.shgb_name),
      row('Luas SHGB (m²)', d.shgb_area),
      row('Diserahkan pada', d.handover_to),
      row('Tanggal Serah Terima', d.transaction_date),
    ],
  }),
};

export const LAND_MAP: LandDefinition = {
  link: 'landmap',
  type: 'B',
  text: 'Land Map',
  procedure: 'mgr.xrl_send_mail_approval_land_map',
  cacheFolder: 'send_Land_Map',
  payload: (b) => ({
    ...landBase(b),
    nop_no: raw(b, 'nop_no'),
    name_owner: raw(b, 'name_owner'),
    land_area_spk: raw(b, 'land_area_spk'),
    land_area_bpn: raw(b, 'land_area_bpn'),
    map_land_no: raw(b, 'map_land_no'),
    land_title_no: raw(b, 'land_title_no'),
    land_area_final: raw(b, 'land_area_final'),
    subject: subjectNo('Land Map', b.doc_no),
    link: 'landmap',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Gambar Ukur yang terbentuk dengan detail :',
    rows: [
      row('Nomor Dokumen', d.map_land_no),
      row('No. Alas Hak', d.land_title_no),
      row('Nama Alas Hak', d.name_owner),
      row('Luas Gambar Ukur', d.land_area_final),
      row('Tanggal Gambar Ukur', d.transaction_date),
    ],
  }),
};

export const LAND_MEASURING: LandDefinition = {
  link: 'landmeasuring',
  type: 'K',
  text: 'Land Measuring',
  procedure: 'mgr.xrl_send_mail_approval_land_measuring',
  cacheFolder: 'send_Land_Measuring',
  payload: (b) => ({
    ...landBase(b),
    ref_no: raw(b, 'ref_no'),
    descs_officer: raw(b, 'descs_officer'),
    measuring_descs: raw(b, 'measuring_descs'),
    subject: subjectNo('Land Measuring', b.doc_no),
    link: 'landmeasuring',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk SPK Pengukuran bidang tanah dengan detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('Petugas Pengukuran', d.descs_officer),
      row('Tanggal Pengukuran', d.transaction_date),
      row('Keterangan', d.measuring_descs),
    ],
  }),
};

export const LAND_MEASURING_SFT: LandDefinition = {
  link: 'landmeasuringsft',
  type: 'A',
  text: 'Land Measuring SFT',
  procedure: 'mgr.xrl_send_mail_approval_land_measuring_sft',
  cacheFolder: 'send_Land_Measuring_SFT',
  payload: (b) => ({
    ...omit(landBase(b), 'descs'),
    kloter: raw(b, 'kloter'),
    file_no: raw(b, 'file_no'),
    nib_no: raw(b, 'nib_no'),
    measuring_amt: phpNumber(b.measuring_amt),
    subject: subjectNo('Land Measuring SFT', b.doc_no),
    link: 'landmeasuringsft',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Proses Pengukuran BPN, dengan detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('Kloter', d.kloter),
      row('No Berkas', d.file_no),
      row('Nomor Induk Bidang', d.nib_no),
      row('Tanggal Pengukuran', d.transaction_date),
      row('Biaya PNBP Pengukuran', rp(d.measuring_amt)),
    ],
  }),
};

export const LAND_MERGE_SHGB: LandDefinition = {
  link: 'landmergeshgb',
  type: 'J',
  text: 'Land Merge SHGB',
  procedure: 'mgr.xrl_send_mail_approval_land_sft_merge_shgb',
  cacheFolder: 'send_Land_Merge_SHGB',
  payload: (b) => ({
    ...landBase(b),
    merge_ref_no: raw(b, 'merge_ref_no'),
    merge_nop: raw(b, 'merge_nop'),
    merge_area: phpNumber(b.merge_area),
    shgb_ref_no: list(b, 'shgb_ref_no'),
    clarify_user: raw(b, 'clarify_user'),
    clarify_email: raw(b, 'clarify_email'),
    subject: `Need Approval for ${b.doc_no ?? ''}`,
    link: 'landmergeshgb',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Proses Penggabungan SHGB dengan detail berikut:',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('Nomor SHGB (Merge)', d.merge_ref_no),
      row('Luas SHGB (Merge)', d.merge_area),
      row('Tanggal Penggabungan SHGB', d.transaction_date),
      ...(d.shgb_ref_no as string[]).map((no, i) =>
        row(i === 0 ? 'SHGB yang digabungkan' : '', no),
      ),
    ],
    attachmentsIntro: 'Untuk melihat detail transaksi, klik tautan di bawah ini:',
    approversIntro: 'Permintaan ini telah disetujui oleh:',
    lang: 'id',
  }),
};

const REQUEST_DETAIL_TEXT: Record<string, string> = {
  A: 'Tolong berikan persetujuan untuk proses AP Advanced dengan detail :',
  I: 'Tolong berikan persetujuan untuk proses AP Invoice dengan detail :',
};

export const LAND_REQUEST: LandDefinition = {
  link: 'landrequest',
  type: 'R',
  text: 'Land Request',
  procedure: 'mgr.xrl_send_mail_approval_land_request',
  cacheFolder: 'send_Land_Request',
  payload: (b) => ({
    ...omit(landBase(b), 'transaction_date'),
    type: list(b, 'type', ';'),
    name_owner: list(b, 'name_owner', ';'),
    nop_no: list(b, 'nop_no', ';'),
    sph_trx_no: list(b, 'sph_trx_no', ';'),
    request_amt: list(b, 'request_amt', ';').map((v) => phpNumber(v)),
    detail_text:
      REQUEST_DETAIL_TEXT[String(b.payment_cd ?? '')] ??
      'Tolong berikan persetujuan untuk Pengajuan Pembayaran dengan detail :',
    subject: subjectNo('Land Request', b.doc_no),
    link: 'landrequest',
  }),
  view: (d) => ({
    intro: d.detail_text,
    grid: {
      headers: ['Nomor Dokumen', 'Rincian Pengajuan', 'Nominal Pengajuan'],
      rows: (d.type as string[]).map((t, i) => [String(d.doc_no ?? ''), t, at(d.request_amt, i)]),
    },
  }),
};

export const LAND_SFT_BPHTB: LandDefinition = {
  link: 'landsftbphtb',
  type: 'Y',
  text: 'Land SFT BPHTB',
  procedure: 'mgr.xrl_send_mail_approval_land_sft_bphtb',
  cacheFolder: 'send_Land_SFT_BPHTB',
  payload: (b) => ({
    ...landBase(b),
    bphtb_ref_no: raw(b, 'bphtb_ref_no'),
    nib_no: raw(b, 'nib_no'),
    nop_bphtb: raw(b, 'nop_bphtb'),
    bphtb_amt: phpNumber(b.bphtb_amt),
    land_title_no: list(b, 'land_title_no'),
    subject: subjectNo('Land SFT BPHTB', b.doc_no),
    link: 'landsftbphtb',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Proses BPHTB dengan detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('Nomor BPHTB', d.bphtb_ref_no),
      ...(d.land_title_no as string[]).map((t, i) =>
        row(i === 0 ? 'Nomor Alas Hak' : '', `${i + 1}. ${t}`),
      ),
      row('NOP BPHTB', d.nop_bphtb),
      row('Tanggal BPHTB', d.transaction_date),
      row('Nominal BPHTB', rp(d.bphtb_amt)),
    ],
  }),
};

export const LAND_SFT_PROPOSE: LandDefinition = {
  link: 'landsftpropose',
  type: 'X',
  text: 'Land SFT Propose',
  procedure: 'mgr.xrl_send_mail_approval_land_sft_propose',
  cacheFolder: 'send_Land_SFT_Propose',
  payload: (b) => ({
    ...landBase(b),
    ref_no: raw(b, 'ref_no'),
    sk_no: raw(b, 'sk_no'),
    sk_amt: phpNumber(b.sk_amt),
    subject: subjectNo('Land SFT Propose', b.doc_no),
    link: 'landsftpropose',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Permohonan SK HAK dengan Detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('Nomor Permohonan SK', d.ref_no),
      row('Nomor SK', d.sk_no),
      row('Tanggal Pengajuan SK HAK', d.transaction_date),
      row('Biaya PNBP SK HAK', rp(d.sk_amt)),
    ],
  }),
};

export const LAND_SFT_SHGB: LandDefinition = {
  link: 'landsftshgb',
  type: 'Z',
  text: 'Land SFT SHGB',
  procedure: 'mgr.xrl_send_mail_approval_land_sft_shgb',
  cacheFolder: 'send_Land_SFT_SHGB',
  payload: (b) => ({
    ...landBase(b),
    shgb_ref_no: raw(b, 'shgb_ref_no'),
    nop_no_new: raw(b, 'nop_no_new'),
    pbt_area_nib: phpNumber(b.pbt_area_nib),
    shgb_amt: phpNumber(b.shgb_amt),
    subject: subjectNo('Land SFT SHGB', b.doc_no),
    link: 'landsftshgb',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Proses SHGB dengan detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('Nomor SHGB', d.shgb_ref_no),
      row('NOP SHGB', d.nop_no_new),
      row('Luas PBT', d.pbt_area_nib),
      row('Tanggal SHGB', d.transaction_date),
      row('Biaya SK SHGB', d.shgb_amt),
    ],
  }),
};

export const LAND_SPH: LandDefinition = {
  link: 'landsph',
  type: 'S',
  text: 'Land SPH',
  procedure: 'mgr.xrl_send_mail_approval_land_sph',
  cacheFolder: 'send_Land_SPH',
  payload: (b) => ({
    ...landBase(b),
    nop_no: raw(b, 'nop_no'),
    name_owner: raw(b, 'name_owner'),
    land_title_no: raw(b, 'land_title_no'),
    land_title_name: raw(b, 'land_title_name'),
    laf: phpNumber(b.laf),
    baf: phpNumber(b.baf),
    sph_amt: phpNumber(b.sph_amt),
    book_amt: phpNumber(b.book_amt),
    total_amt: phpNumber(b.total_amt),
    subject: subjectNo('Land SPH', b.doc_no),
    link: 'landsph',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk pengalihan Hak pada transaksi di bawah ini :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('No. Alas Hak', d.land_title_no),
      row('Nama Alas Hak', d.land_title_name),
      row('Luas Tanah yang disepakati', `${d.laf} m²`),
      row('Luas Bangunan yang disepakati', `${d.baf} m²`),
      row('Tanggal Penandatanganan SPH', d.transaction_date),
      row('Uang Tanda Jadi', rp(d.book_amt)),
      row('Pembayaran Bidang Tanah', rp(d.total_amt)),
      row('Nominal SPH', rp(d.sph_amt)),
    ],
  }),
};

export const LAND_SPLIT_SHGB: LandDefinition = {
  link: 'landsplitshgb',
  type: 'Q',
  text: 'Land Split SHGB',
  procedure: 'mgr.xrl_send_mail_approval_land_split_shgb',
  cacheFolder: 'send_Land_Split_SHGB',
  levelNoAsInt: true,
  payload: (b) => ({
    ...omit(landBase(b), 'transaction_date'),
    approve_list: strToArray(b.approve_exist),
    shgb_no: strToArray(b.shgb_no),
    shgb_no_bpn: strToArray(b.shgb_no_bpn),
    nop_no: strToArray(b.nop_no),
    nib_no: strToArray(b.nib_no),
    shgb_date: strToArray(b.shgb_date).map(safeDateFormat),
    shgb_expired: strToArray(b.shgb_expired).map(safeDateFormat),
    shgb_area: strToArray(b.shgb_area).map((v) => safeNumber(v)),
    shgb_no_split: b.shgb_no_split ?? '',
    shgb_no_bpn_split: b.shgb_no_bpn_split ?? '',
    nop_no_split: b.nop_no_split ?? '',
    nib_no_split: b.nib_no_split ?? '',
    shgb_date_split: safeDateFormat(b.shgb_date_split),
    shgb_expired_split: safeDateFormat(b.shgb_expired_split),
    shgb_area_split: safeNumber(b.shgb_area_split),
    remaining_area: safeNumber(b.remaining_area),
    split_status_hd: strToArray(b.split_status_hd),
    split_status_hdstr: strToArray(b.split_status_hdstr),
    split_status_dtstr: strToArray(b.split_status_dtstr),
    subject: `Need Approval for Split SHGB No. ${b.doc_no ?? ''}`,
    link: 'landsplitshgb',
  }),
  view: (d) => {
    const s = str;
    const parent = [
      s(d.shgb_no_split),
      s(d.shgb_no_bpn_split),
      s(d.nop_no_split),
      s(d.nib_no_split),
      s(d.shgb_date_split),
      s(d.shgb_expired_split),
      s(d.shgb_area_split),
      s(d.remaining_area),
      (d.split_status_hdstr as string[]).join('; '),
      '',
    ];
    const required = ['shgb_no_bpn', 'nop_no', 'nib_no', 'shgb_date', 'shgb_expired', 'shgb_area'];
    const children = (d.shgb_no as string[])
      .map((_, i) => i)
      .filter((i) => i === 0 || required.every((c) => d[c][i] !== undefined))
      .map((i) => [
        at(d.shgb_no, i),
        at(d.shgb_no_bpn, i),
        at(d.nop_no, i),
        at(d.nib_no, i),
        at(d.shgb_date, i),
        at(d.shgb_expired, i),
        '',
        at(d.shgb_area, i),
        at(d.split_status_dtstr, i),
        '',
      ]);
    return {
      intro: `Tolong berikan persetujuan untuk proses Pemecahan SHGB ${s(d.shgb_no_split)} dengan detail :`,
      grid: {
        headers: [
          'No. SHGB',
          'No. SHGB BPN',
          'No. SPPT',
          'No. NIB',
          'Tanggal Terbit',
          'Tanggal Expired',
          'Luas Awal SHGB (M²)',
          'Luas Akhir SHGB (M²)',
          'Induk / Pecahan',
          'Keterangan',
        ],
        rows: [parent, ...children],
      },
    };
  },
};

export const LAND_VERIFICATION_PAYMENT: LandDefinition = {
  link: 'landverificationpayment',
  type: '2',
  text: 'Land Verification Payment',
  procedure: 'mgr.xrl_send_mail_approval_land_verification_payment',
  cacheFolder: 'send_Land_Verification_Payment',
  payload: (b) => ({
    ...omit(landBase(b), 'descs', 'transaction_date'),
    verification_no: raw(b, 'verification_no'),
    land_title_no: raw(b, 'land_title_no'),
    land_title_area: raw(b, 'land_title_area'),
    book_no: raw(b, 'book_no'),
    incoming_form_no: raw(b, 'incoming_form_no'),
    sph_amt_m2: phpNumber(b.sph_amt_m2),
    pph_amt: phpNumber(b.pph_amt),
    bphtb_amt: phpNumber(b.bphtb_amt),
    submission_tax_no: raw(b, 'submission_tax_no'),
    pph_payment_date: carbonDate(b.pph_payment_date),
    pph_reg_date: carbonDate(b.pph_reg_date),
    pph_validation_date: carbonDate(b.pph_validation_date),
    // PHP read $request->change_no, which the SP never sends (the subject ended with "No. ").
    subject: subjectNo('Land Verification Payment', b.verification_no ?? b.doc_no),
    link: 'landverificationpayment',
  }),
  view: (d) => ({
    intro: `Tolong berikan persetujuan untuk proses Verifikasi Pembayaran ${d.verification_no ?? ''} dengan detail:`,
    rows: [
      row('Nomor Dokumen', d.verification_no),
      row('No. Alas Hak', d.land_title_no),
      row('Luas Alas Hak', d.land_title_area),
      row('No. Buku', d.book_no),
      row('No. Form Berkas Masuk', d.incoming_form_no),
      row('Nominal SPH (Rp./m2)', d.sph_amt_m2),
      row('Nominal PPh', d.pph_amt),
      row('Nominal BPHTB', d.bphtb_amt),
      row('No. Form Pengajuan PPh & BPHTB', d.submission_tax_no),
      row('Tanggal Bayar PPh & BPHTB', d.pph_payment_date),
      row('Tanggal Pendaftaran Validasi PPh & BPHTB', d.pph_reg_date),
      row('Tanggal Validasi PPh & BPHTB', d.pph_validation_date),
    ],
  }),
};

export const LAND_FPH: LandDefinition = {
  link: 'landfph',
  type: 'F',
  text: 'Land FPH',
  procedure: 'mgr.xrl_send_mail_approval_land_fph',
  cacheFolder: 'send_Land_Fph',
  feedbackFolder: 'feedback/feedback_Land_Fph',
  payload: (b) => ({
    ...omit(landBase(b), 'approve_seq'),
    no_alas_hak: raw(b, 'no_alas_hak'),
    name_alas_hak: raw(b, 'name_alas_hak'),
    luas_alas_hak: raw(b, 'luas_alas_hak'),
    name_owner: raw(b, 'name_owner'),
    total_amt: phpNumber(b.total_amt),
    book_amt: phpNumber(b.book_amt),
    clarify_user: raw(b, 'clarify_user'),
    clarify_email: raw(b, 'clarify_email'),
    subject: `Need Approval for ${b.doc_no ?? ''}`,
    link: 'LandFph', // sic — only echoed in the callback; the mail buttons use /api/landfph
  }),
  encrypt: (b, def) => ({
    entity_cd: input(b, 'entity_cd'),
    project_no: input(b, 'project_no'),
    email_address: input(b, 'email_addr'),
    level_no: input(b, 'level_no'),
    approve_seq: input(b, 'approve_seq'),
    doc_no: input(b, 'doc_no'),
    usergroup: input(b, 'usergroup'),
    user_id: input(b, 'user_id'),
    supervisor: input(b, 'supervisor'),
    entity_name: entityName(b.entity_name),
    type: def.type,
    type_module: 'LM',
    text: def.text,
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Form Penawaran Harga dengan detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('Nama PT', entityName(d.entity_name)),
      row('No. Alas Hak', d.no_alas_hak),
      row('Nama Alas Hak', d.name_alas_hak),
      row('Luas Alas Hak', d.luas_alas_hak),
      row('Nama Pemilik', d.name_owner),
      row('Tanggal FPH', d.transaction_date),
      row('Harga yang disepakati', rp(d.total_amt)),
      row('Uang Tanda Jadi', rp(d.book_amt)),
    ],
  }),
};

export const LAND_VERIFICATION: LandDefinition = {
  link: 'landverification',
  type: 'V',
  text: 'Land Verification',
  procedure: 'mgr.xrl_send_mail_approval_land_Verification',
  cacheFolder: 'send_Land_Verification',
  feedbackFolder: 'feedback/feedback_Land_Verification',
  payload: (b) => ({
    ...landBase(b),
    nop_no: raw(b, 'nop_no'),
    name_owner: raw(b, 'name_owner'),
    own_descs: raw(b, 'own_descs'),
    land_title_no: raw(b, 'land_title_no'),
    land_title_name: raw(b, 'land_title_name'),
    subject: subjectNo('Land Verification', b.doc_no),
    link: 'LandVerification', // sic — see LAND_FPH.link
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Verifikasi Dokumen Lahan dengan detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('No. Alas Hak', d.land_title_no),
      row('Nama Alas Hak', d.land_title_name),
      row('Jenis Alas Hak', d.own_descs),
      row('Tanggal Verifikasi Dokumen', d.transaction_date),
    ],
  }),
};

export const LAND_REQUEST_LEGAL: LandDefinition = {
  link: 'landrequestlegal',
  type: 'W',
  text: 'Land Request Legal',
  procedure: 'mgr.xrl_send_mail_approval_land_request_legal',
  cacheFolder: 'send_Land_Request_Legal',
  payload: (b) => ({
    ...omit(landBase(b), 'transaction_date'),
    type: list(b, 'type', ';'),
    request_amt: list(b, 'request_amt', ';').map((v) => phpNumber(v)),
    subject: subjectNo('Land Request Legal', b.doc_no),
    link: 'landrequestlegal',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Pengajuan Biaya Legal dengan detail :',
    grid: {
      headers: ['Nomor Dokumen', 'Rincian Pengajuan', 'Nominal Pengajuan'],
      rows: (d.type as string[]).map((t, i) => [str(d.doc_no), t, rp(at(d.request_amt, i))]),
    },
  }),
};

export const LAND_SERTIFIKAT: LandDefinition = {
  link: 'landsertifikat',
  type: 'T',
  text: 'Land Sertifikat',
  procedure: 'mgr.xrl_send_mail_approval_land_sertifikat',
  cacheFolder: 'send_Land_Sertifikat',
  payload: (b) => ({
    ...omit(landBase(b), 'transaction_date'),
    change_date: str(b.change_date).trim() === '' ? '' : carbonDate(b.change_date),
    subject: subjectNo('Land Sertifikat', b.doc_no),
    link: 'landsertifikat',
  }),
  view: (d) => ({
    intro: 'Tolong berikan persetujuan untuk Pengajuan Sertifikat dengan detail :',
    rows: [
      row('Nomor Dokumen', d.doc_no),
      row('Keterangan', d.descs),
      row('Tanggal Pengajuan', d.change_date),
    ],
  }),
  // EXEC mgr.xrl_send_mail_approval_land_sertifikat entity_cd, doc_no, status, level_no (no remarks)
  args: (data, status) => [data.entity_cd, data.doc_no, status, data.level_no],
};

/** Every module served by the generic Land controllers. */
export const LAND_DEFINITIONS: readonly LandDefinition[] = [
  LAND_BOUNDARY,
  LAND_CANCEL_NOP,
  LAND_CHANGE_NAME,
  LAND_EXTENSION_SHGB,
  LAND_HANDOVER_LEGAL,
  LAND_HANDOVER_SHGB,
  LAND_MAP,
  LAND_MEASURING,
  LAND_MEASURING_SFT,
  LAND_MERGE_SHGB,
  LAND_REQUEST,
  LAND_SFT_BPHTB,
  LAND_SFT_PROPOSE,
  LAND_SFT_SHGB,
  LAND_SPH,
  LAND_SPLIT_SHGB,
  LAND_VERIFICATION_PAYMENT,
  LAND_FPH,
  LAND_VERIFICATION,
  LAND_REQUEST_LEGAL,
  LAND_SERTIFIKAT,
];
