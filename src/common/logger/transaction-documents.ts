/**
 * Route segment (first path part after /api) → document name used as the transaction-log file name
 * (storage/logs/transactions/<DDMMYYYY>/<name>.log). Unknown segments fall back to the segment itself.
 */
export const DOCUMENT_BY_SEGMENT: Record<string, string> = {
  // Cash & Bank
  cbppu: 'CbPpu',
  cbppuvvip: 'CbPpuVvip',
  feedback_cb: 'CbFeedback',
  feedback_cb_fupd: 'CbFupd',
  // Purchasing
  purchase_selection: 'PoSelection',
  poselection: 'PoSelection',
  pos: 'PoSelection',
  feedback_po: 'PoOrder',
  staffaction_por: 'PoRequest',
  staffaction_pos: 'PoSelection',
  // Contract Management
  cmentry: 'CMEntry',
  cmprogress: 'CMProgress',
  cmprogresswu: 'CMProgressWithUnit',
  cmclose: 'CMClose',
  cmdone: 'CMDone',
  varianorder: 'CMVarianOrder',
  contractrenew: 'CMContractRenew',
  feedback_cm_progress: 'CMProgressWithUnit',
  // Budget / PL
  budgetlyman: 'PLBudgetLyman',
  budgetrevision: 'PLBudgetRevision',
  ploverwrite: 'PLOverwrite',
  feedbackbudgetlyman: 'PLBudgetLyman',
  feedbackbudgetrevision: 'PLBudgetRevision',
  // Land
  landboundary: 'LandBoundary',
  landcancelnop: 'LandCancelNop',
  landchangename: 'LandChangeName',
  landextensionshgb: 'LandExtensionShgb',
  landfph: 'LandFph',
  landhandoverlegal: 'LandHandoverLegal',
  landhandovershgb: 'LandHandoverShgb',
  landmap: 'LandMap',
  landmeasuring: 'LandMeasuring',
  landmeasuringsft: 'LandMeasuringSft',
  landmergeshgb: 'LandMergeShgb',
  landrequest: 'LandRequest',
  landrequestlegal: 'LandRequestLegal',
  landsertifikat: 'LandSertifikat',
  landsftbphtb: 'LandSftBphtb',
  landsftpropose: 'LandSftPropose',
  landsftshgb: 'LandSftShgb',
  landsph: 'LandSph',
  landsplitshgb: 'LandSplitShgb',
  landsubmission: 'LandSubmission',
  landverification: 'LandVerification',
  landverificationpayment: 'LandVerificationPayment',
  feedbackland: 'LandFeedback',
  feedbacklandrequest: 'LandRequest',
  feedbackSph: 'LandSph',
  feedbacksubmission: 'LandSubmission',
  // Sales / Tenancy
  agentdeactive: 'SalesAgentDeactive',
  salesdeactive: 'SalesDeactive',
  salesbookingdisc: 'SalesBookingDisc',
  salesbookingpackage: 'SalesBookingPackage',
  saleschangename: 'SalesChangeName',
  saleslot: 'SalesLot',
  saleslotactivity: 'SalesLotActivity',
  lottemp: 'SalesLotTemp',
  contractterminate: 'TMContractTerminate',
  // Staff / jobs / misc
  staffaction: 'StaffAction',
  fileexist: 'FileExist',
  autosend: 'AutoSend',
  autosendtest: 'AutoSendTest',
  autofeedback: 'AutoFeedback',
  checkfeedback: 'CheckFeedback',
  oldfeedback: 'OldFeedback',
  connect: 'System',
};

/** Modules dispatched through /api/maildata, /api/getaccess and /api/processdata/<module>. */
export const DOCUMENT_BY_MAILDATA_MODULE: Record<string, string> = {
  cbrpb: 'CbRpb',
  cbrum: 'CbRum',
  cbfupd: 'CbFupd',
  poorder: 'PoOrder',
  porequest: 'PoRequest',
};
