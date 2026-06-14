/** Input needed to build the constrained, test-only Scenario Lab payload. */
export interface SandboxPaymentRequest {
  recipientName: string;
  city: string;
  accountReference: string;
  participantCode: string;
  financialInstitutionAlias: string;
  branchAlias: string;
  merchantCategoryCode: string;
  amount: string;
  reference: string;
  storeLabel?: string;
  amountMode?: "fixed" | "variable";
  initiationMethod?: "11" | "12";
}

/** One human-readable validation result rendered before QR generation. */
export interface SandboxValidationCheck {
  id: string;
  label: string;
  detail: string;
  status: "pass" | "warning" | "error";
}

export const BIMPAY_GUI = "bb.org.cb.mpqr";
export const BIMPAY_SCHEME = "QRBB";

function tlv(tag: string, value: string): string {
  const normalized = value.trim();
  return `${tag}${normalized.length.toString().padStart(2, "0")}${normalized}`;
}

/** Encodes an optional field without emitting an empty TLV record. */
function optionalTlv(tag: string, value?: string): string {
  return value?.trim() ? tlv(tag, value) : "";
}

/** Implements the CRC variant used by the EMV-style payload footer. */
function crc16CcittFalse(input: string): string {
  let crc = 0xffff;

  for (let index = 0; index < input.length; index += 1) {
    crc ^= input.charCodeAt(index) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Builds a deterministic test payload from a validated Scenario request.
 *
 * The branch/store code is carried in additional-data tag 62.03 so merchants
 * sharing a settlement account can still reconcile by location.
 */
export function buildSandboxEmvPayload(request: SandboxPaymentRequest): string {
  const merchantAccount = [
    tlv("00", BIMPAY_GUI),
    tlv("01", request.financialInstitutionAlias),
    tlv("02", request.branchAlias),
    tlv("03", request.accountReference),
    tlv("04", request.participantCode),
    tlv("10", BIMPAY_SCHEME),
  ].join("");

  const additionalData = [
    optionalTlv("03", request.storeLabel?.slice(0, 25)),
    tlv("05", request.reference.slice(0, 25) || "TEST REQUEST"),
    tlv("08", `TEST ONLY ${request.reference}`.slice(0, 25)),
  ].join("");

  const timestamp = new Date()
    .toISOString()
    .replace(/\D/g, "")
    .slice(0, 14);
  const privateData = [
    tlv("00", BIMPAY_GUI),
    tlv("01", timestamp),
  ].join("");

  const fields = [
    tlv("00", "01"),
    tlv("01", request.initiationMethod ?? "12"),
    tlv("26", merchantAccount),
    tlv("52", request.merchantCategoryCode),
    tlv("53", "052"),
    tlv("54", request.amountMode === "variable" ? "***" : request.amount),
    tlv("58", "BB"),
    tlv("59", request.recipientName.toUpperCase().slice(0, 25)),
    tlv("60", request.city.toUpperCase().slice(0, 15)),
    tlv("62", additionalData),
    tlv("80", privateData),
  ].join("");

  const payloadWithoutCrc = `${fields}6304`;
  return `${payloadWithoutCrc}${crc16CcittFalse(payloadWithoutCrc)}`;
}

/** Accepts positive decimal amounts with exactly two fractional digits. */
export function isValidSandboxAmount(value: string): boolean {
  return /^\d+(\.\d{2})$/.test(value) && Number(value) > 0;
}

/** Returns all request checks so the UI can display errors and warnings together. */
export function validateSandboxPaymentRequest(
  request: SandboxPaymentRequest
): SandboxValidationCheck[] {
  const expectedParticipant =
    request.financialInstitutionAlias === "TESTROC1"
      ? "333331"
      : request.financialInstitutionAlias === "TESTROC2"
        ? "333332"
        : "";
  const normalizedName = request.recipientName.trim();
  const normalizedCity = request.city.trim();
  const normalizedReference = request.reference.trim();

  return [
    {
      id: "route",
      label: "BiMPay test route",
      detail: expectedParticipant
        ? `${request.financialInstitutionAlias} is paired with ${expectedParticipant}.`
        : "Use TESTROC1 or TESTROC2.",
      status:
        expectedParticipant &&
        request.branchAlias === request.financialInstitutionAlias &&
        request.participantCode === expectedParticipant
          ? "pass"
          : "error",
    },
    {
      id: "account",
      label: "Synthetic account reference",
      detail: "Must contain 6-24 digits and must not be a real account identifier.",
      status: /^\d{6,24}$/.test(request.accountReference) ? "pass" : "error",
    },
    {
      id: "name",
      label: "Recipient name",
      detail:
        normalizedName.length > 25
          ? "The value will be truncated to 25 characters in tag 59."
          : "Tag 59 is present and within its field limit.",
      status: !normalizedName ? "error" : normalizedName.length > 25 ? "warning" : "pass",
    },
    {
      id: "city",
      label: "Merchant city",
      detail:
        normalizedCity.length > 15
          ? "The value will be truncated to 15 characters in tag 60."
          : "Tag 60 is present and within its field limit.",
      status: !normalizedCity ? "error" : normalizedCity.length > 15 ? "warning" : "pass",
    },
    {
      id: "mcc",
      label: "Merchant category",
      detail: "Tag 52 must contain exactly four digits.",
      status: /^\d{4}$/.test(request.merchantCategoryCode) ? "pass" : "error",
    },
    {
      id: "amount",
      label: "Transaction amount",
      detail:
        request.amountMode === "variable"
          ? 'Tag 54 will contain "***" and the payer supplies the amount after scanning.'
          : "A fixed amount with two decimal places is required.",
      status:
        request.amountMode === "variable" || isValidSandboxAmount(request.amount)
          ? "pass"
          : "error",
    },
    {
      id: "reference",
      label: "Test-only reference",
      detail:
        normalizedReference.length > 25
          ? "Additional-data values will be truncated to fit their TLV fields."
          : "The reference is present in test-only additional data.",
      status: !normalizedReference
        ? "error"
        : normalizedReference.length > 25
          ? "warning"
          : "pass",
    },
    {
      id: "protocol",
      label: "Protocol identifiers",
      detail: `${BIMPAY_GUI} and ${BIMPAY_SCHEME} will be included in tags 26 and 80.`,
      status: "pass",
    },
  ];
}

/** Verifies the final tag 63 value without interpreting the payload as legitimate. */
export function validateSandboxPayloadCrc(payload: string): boolean {
  const crcIndex = payload.lastIndexOf("6304");
  if (crcIndex < 0 || payload.length < crcIndex + 8) return false;

  const expected = crc16CcittFalse(payload.slice(0, crcIndex + 4));
  return payload.slice(crcIndex + 4, crcIndex + 8).toUpperCase() === expected;
}
