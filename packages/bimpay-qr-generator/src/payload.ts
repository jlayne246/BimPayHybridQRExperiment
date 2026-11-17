export const BIMPAY_GUI = "bb.org.cb.mpqr";
export const BIMPAY_SCHEME = "QRBB";
export interface EmvField {
  tag: string;
  value: string;
}

export interface CoreFields {
  payloadFormat: string;
  initiationMethod: string;
  merchantCategoryCode: string;
  currency: string;
  amount: string;
  country: string;
  merchantName: string;
  merchantCity: string;
}

export interface MerchantAccountFields {
  gui: string;
  fiAlias: string;
  branchAlias: string;
  accountReference: string;
  participantCode: string;
  scheme: string;
}

export interface AdditionalDataFields {
  billNumber: string;
  mobileNumber: string;
  storeLabel: string;
  loyaltyNumber: string;
  referenceLabel: string;
  customerLabel: string;
  terminalLabel: string;
  purpose: string;
}

export interface PrivateFields {
  gui: string;
  requestTimestamp: string;
}

export function tlv(tag: string, value: string): string {
  if (!/^\d{2}$/.test(tag)) throw new Error(`Invalid TLV tag: ${tag}`);
  if (typeof value !== "string") throw new Error(`Tag ${tag} must contain a string.`);
  const normalized = value.trim();
  if (normalized.length > 99) throw new Error(`Tag ${tag} exceeds the 99-character TLV limit.`);
  const length = normalized.length.toString().padStart(2, "0");
  return `${tag}${length}${normalized}`;
}

export function optionalTlv(tag: string, value: string): string {
  return value.trim() ? tlv(tag, value) : "";
}

export function crc16CcittFalse(input: string): string {
  let crc = 0xffff;

  for (let i = 0; i < input.length; i += 1) {
    crc ^= input.charCodeAt(i) << 8;

    for (let bit = 0; bit < 8; bit += 1) {
      crc =
        (crc & 0x8000) !== 0
          ? ((crc << 1) ^ 0x1021) & 0xffff
          : (crc << 1) & 0xffff;
    }
  }

  return crc.toString(16).toUpperCase().padStart(4, "0");
}

export function buildEmvPayload(fields: EmvField[]): string {
  const withoutCrc =
    fields
      .filter((field) => field.value.trim())
      .map((field) => tlv(field.tag, field.value))
      .join("") + "6304";

  return `${withoutCrc}${crc16CcittFalse(withoutCrc)}`;
}

export function generateTimestamp(): string {
  const now = new Date();
  const yyyy = now.getFullYear().toString();
  const mm = (now.getMonth() + 1).toString().padStart(2, "0");
  const dd = now.getDate().toString().padStart(2, "0");
  const hh = now.getHours().toString().padStart(2, "0");
  const mi = now.getMinutes().toString().padStart(2, "0");
  const ss = now.getSeconds().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}${hh}${mi}${ss}`;
}

export function isValidAmount(value: string): boolean {
  return /^\d+(\.\d{2})?$/.test(value.trim());
}

