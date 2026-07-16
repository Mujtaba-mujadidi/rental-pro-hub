/** Product copy aligned with rental contract / billing spec (parent vs primary subcompany). */

export const rentalContractCopy = {
  parentVsPrimaryShort:
    "The parent company is the legal entity on your agreement. Your primary subcompany is the default operational unit; only some fields mirror from the parent after legal changes.",
  legalChangeAfterSignature:
    "Amendments to parent company legal details apply only after the change has been reviewed and signed. Your primary operational unit is updated only for trading-style name and primary contact fields that mirror the contract.",
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
