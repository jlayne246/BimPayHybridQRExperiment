import { BIMPAY_GUI, BIMPAY_SCHEME, optionalTlv, buildEmvPayload, generateTimestamp, isValidAmount } from "./payload.js";
import type { EmvField, AdditionalDataFields } from "./payload.js";

/** Independent input model. Routing values are caller supplied experimental aliases. */
export interface BiMPayInput {
  merchantName: string;
  merchantCity?: string;
  fiAlias: string;
  branchAlias: string;
  accountReference: string;
  participantCode: string;
  amount?: string;
  amountMode?: "fixed" | "variable";
  currency?: string;
  country?: string;
  merchantCategoryCode?: string;
  payloadFormat?: string;
  initiationMethod?: string;
  gui?: string;
  scheme?: string;
  privateGui?: string;
  /** Local wall-clock YYYYMMDDhhmmss; omitted values are generated per call. */
  timestamp?: string;
  additionalData?: Partial<AdditionalDataFields>;
}
const additionalTags = {
  billNumber: "01", mobileNumber: "02", storeLabel: "03", loyaltyNumber: "04",
  referenceLabel: "05", customerLabel: "06", terminalLabel: "07", purpose: "08",
} as const;
export function buildMerchantAccount(input: Pick<BiMPayInput, "gui" | "fiAlias" | "branchAlias" | "accountReference" | "participantCode" | "scheme">): string {
  return [["00", input.gui ?? BIMPAY_GUI], ["01", input.fiAlias], ["02", input.branchAlias], ["03", input.accountReference], ["04", input.participantCode], ["11", input.scheme ?? BIMPAY_SCHEME]].map(([tag, value]) => optionalTlv(tag, value)).join("");
}
export function buildAdditionalData(input: Partial<AdditionalDataFields> = {}): string {
  return Object.entries(additionalTags).map(([key, tag]) => optionalTlv(tag, input[key as keyof AdditionalDataFields] ?? "")).join("");
}
export function buildPrivateMetadata(gui = BIMPAY_GUI, timestamp = generateTimestamp()): string {
  return optionalTlv("00", gui) + optionalTlv("01", timestamp);
}
export function buildBiMPayFields(input: BiMPayInput): EmvField[] {
  return [
    { tag: "00", value: input.payloadFormat ?? "01" },
    { tag: "01", value: input.initiationMethod ?? "11" },
    { tag: "26", value: buildMerchantAccount(input) },
    { tag: "52", value: input.merchantCategoryCode ?? "0000" },
    { tag: "53", value: input.currency ?? "052" },
    { tag: "54", value: input.amountMode === "fixed" ? input.amount ?? "" : "***" },
    { tag: "58", value: input.country ?? "BB" },
    { tag: "59", value: input.merchantName.slice(0, 25) },
    { tag: "60", value: (input.merchantCity ?? "BRIDGETOWN").slice(0, 15) },
    { tag: "62", value: buildAdditionalData(input.additionalData) },
    { tag: "80", value: buildPrivateMetadata(input.privateGui, input.timestamp) },
  ];
}
/** Returns all validation errors; does not throw for malformed runtime input. */
export function validateBiMPayInput(input: BiMPayInput): string[] {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return ["BiMPay input must be an object."];
  for (const key of ["merchantName", "fiAlias", "branchAlias", "accountReference", "participantCode"] as const) {
    if (typeof input[key] !== "string" || !input[key].trim()) errors.push(`${key} is required.`);
  }
  for (const [key, value] of Object.entries(input)) {
    if (key === "additionalData") continue;
    if (value !== undefined && typeof value !== "string") errors.push(`${key} must be a string.`);
  }
  if (input.amountMode !== undefined && !["fixed", "variable"].includes(input.amountMode)) errors.push("amountMode must be fixed or variable.");
  if (input.amountMode === "fixed" && (typeof input.amount !== "string" || !isValidAmount(input.amount) || !Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0)) errors.push("Fixed amount must be a positive number with zero or two decimal places.");
  if (input.timestamp !== undefined && !/^\d{14}$/.test(input.timestamp)) errors.push("timestamp must contain 14 digits (YYYYMMDDhhmmss).");
  for (const [key, pattern] of [["currency", /^\d{3}$/], ["country", /^[A-Z]{2}$/], ["merchantCategoryCode", /^\d{4}$/]] as const) {
    if (input[key] !== undefined && !pattern.test(input[key]!)) errors.push(`${key} has an invalid format.`);
  }
  if (typeof input.merchantCity === "string" && !input.merchantCity.trim()) errors.push("merchantCity is required.");
  if (input.additionalData !== undefined) {
    if (!input.additionalData || typeof input.additionalData !== "object" || Array.isArray(input.additionalData)) errors.push("additionalData must be an object.");
    else for (const key of Object.keys(additionalTags) as (keyof AdditionalDataFields)[]) {
      if (input.additionalData[key] !== undefined && typeof input.additionalData[key] !== "string") errors.push(`additionalData.${key} must be a string.`);
    }
  }
  for (const key of ["gui", "scheme", "privateGui"] as const) {
    if (input[key] !== undefined && (typeof input[key] !== "string" || !input[key]!.trim())) errors.push(`${key} must be nonempty.`);
  }
  if (errors.length) return errors;
  try { buildEmvPayload(buildBiMPayFields(input)); } catch (error) { errors.push(error instanceof Error ? error.message : "Invalid TLV input."); }
  return errors;
}
export function buildBiMPayPayload(input: BiMPayInput): string {
  const errors = validateBiMPayInput(input);
  if (errors.length) throw new Error(errors.join(" "));
  return buildEmvPayload(buildBiMPayFields(input));
}
