/**
 * Single Olam MAX calling menu contract.
 * Both phone providers use the SAME data, source records, and result taxonomy.
 * Only SignalWire may originate a billable outbound phone call.
 */
export const olamCallingMenu = Object.freeze({
  "1": "make_call",
  "2": "report_external_call",
  "3": "call_history",
  "4": "create_contact",
  "5": "schedule_call",
  "*": "back"
});
export const olamCallHistoryActions = Object.freeze({
  "1": "redial",
  "2": "listen_statistics",
  "3": "enter_statistics",
  "4": "edit_selected_field",
  "5": "save_as_contact",
  "6": "hide_this_call_only",
  "*": "back"
});
export const olamContactEntrySequence = Object.freeze(["phone","name","address_optional"]);
export const olamCallingPolicy = Object.freeze({
  providerOutbound: "signalwire",
  yemotMayReadAndWriteStatistics: true,
  schedulingIsAutomaticDial: false,
  scheduledDeskAdvanceMinutes: 25,
  historyOptionsWindowSeconds: 2,
  historyHiddenDoesNotDeleteFinancialRecords: true,
  manualCallProviderVerified: false,
  lastUsedPurposeMustRemainChangeable: true,
  campaignRootMenuIsConditional: true
});
