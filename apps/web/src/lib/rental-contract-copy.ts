/** Product copy aligned with rental contract / billing spec (parent vs primary subcompany). */

export const rentalContractCopy = {
  /** Side nav, breadcrumbs, and in-app links to /rental/contract */
  platformAgreementNav: "Platform agreement",
  platformAgreementPageTitle: "Platform agreement",
  platformAgreementPageLead:
    "Your agreement with Rental Pro Hub (the rental management platform). View terms, request legal amendments, and sign renewals when platform staff send them.",
  parentVsPrimaryShort:
    "The parent company is the legal entity on your agreement. Your primary subcompany is the default operational unit; only some fields mirror from the parent after legal changes.",
  legalChangeAfterSignature:
    "Save your updates as a draft while you gather details. When everything is correct, submit for platform review. Changes apply only after review and a new contract is signed.",
  legalChangeDraftSaved: "Draft saved. You can return later to add more changes before submitting.",
  legalChangeSubmitted: "Change request submitted. Platform staff will review it and send an updated contract for signature.",
  legalChangeNoChanges:
    "No changes detected compared with your current record. Update at least one field before saving.",
  legalChangeFormattingOnly:
    "Only spacing or formatting differs — the legal values on your contract are unchanged. Save your details below; no contract renewal is needed.",
  legalChangeFormattingSaved:
    "Details updated. No contract renewal was required because the legal values are unchanged.",
  legalChangeFormattingConfirmTitle: "Save formatting changes?",
  legalChangeFormattingConfirmDescription:
    "These edits only change spacing or formatting, not the legal values on your platform agreement. Your company record will be updated without a contract renewal.",
  legalChangeFormattingSaveConfirmLabel: "Save details",
  legalChangeSubstantiveRequired:
    "These changes affect legal details on your contract. Save a draft and submit for platform review when ready.",
  legalChangeNewEntityRequiresContract:
    "Replacing your legal entity always requires a new platform agreement. Make your changes and submit for review.",
  legalChangeSubmitConfirmTitle: "Submit for review?",
  legalChangeSubmitConfirmDescription:
    "Submit this change request to platform staff for review? You will not be able to edit it until they respond.",
  legalChangeSubmitConfirmLabel: "Submit for review",
  legalChangeDiscardConfirmTitle: "Discard draft?",
  legalChangeDiscardConfirmDescription: "Discard your saved draft? This cannot be undone.",
  legalChangeDiscardConfirmLabel: "Discard draft",
  legalChangeInReview: "Your change request is with platform staff for review.",
  legalChangeRejectedTitle: "Your last change request was rejected",
  legalChangeRejectedHint: "Update your details below and submit again when you are ready.",
  legalChangeRejectedPrefix: "Your last change request was rejected:",
  platformAgreementTabActive: "Current agreement",
  platformAgreementTabPrevious: "Previous agreements",
  platformAgreementPreviousLead:
    "Superseded platform agreements are kept for your records. Each entry shows when it stopped being active.",
  platformAgreementPreviousEmpty: "No previous agreements are stored for your company yet.",
  platformAgreementSupersededOn: "Superseded on",
  platformAgreementSignedOn: "Signed on",
  platformAgreementActiveTitle: "Active platform agreement",
  platformAgreementActiveUnavailable: "No active agreement version is on record yet.",
  platformAgreementPreview: "Preview",
  platformAgreementDownload: "Download agreement",
  platformAgreementPreviewTitle: "Agreement preview",
  platformAgreementOpenNewTab: "Open in new tab",
  platformAgreementPdfLoading: "Loading agreement…",
  platformAgreementPdfUnavailable: "PDF not available",
  submitPaymentIntro:
    "Submit payment details for this invoice. Your payment is not confirmed until platform staff validate it. You cannot mark an invoice as paid yourself.",
  awaitingValidation:
    "Awaiting validation — platform staff will confirm or reject your payment submission with a comment.",
  paymentRejected:
    "Your payment submission was rejected. Read the comment, correct details if needed, and submit again.",
  paymentConfirmed: "Payment validated — this invoice is marked paid.",
  noSelfConfirmPaid:
    "Only platform administrators can confirm that an invoice has been paid. Rental users may submit payment evidence only.",
} as const;
