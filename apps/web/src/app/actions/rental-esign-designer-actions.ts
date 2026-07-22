import {
  applyRentalOwnerSignatureQuickAction,
  configureRentalEsignSignatureModeAction,
  getRentalOwnerSavedSignatureAction,
  refreshRentalHireEnvelopePdfAction,
  resendRentalEsignEnvelopeAction,
  saveRentalEsignFieldLayoutAction,
  sendRentalEsignEnvelopeAction,
} from "@/app/actions/rental-esign";

export const rentalEsignDesignerActions = {
  saveFieldLayout: saveRentalEsignFieldLayoutAction,
  sendEnvelope: sendRentalEsignEnvelopeAction,
  resendEnvelope: resendRentalEsignEnvelopeAction,
  getOwnerSavedSignature: getRentalOwnerSavedSignatureAction,
  applyOwnerSignatureQuick: applyRentalOwnerSignatureQuickAction,
  configureSignatureMode: configureRentalEsignSignatureModeAction,
  refreshContractPdf: refreshRentalHireEnvelopePdfAction,
};
