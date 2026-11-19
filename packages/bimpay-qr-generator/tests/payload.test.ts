import { describe, it, expect } from "vitest";
import { tlv, crc16CcittFalse, buildEmvPayload, buildBiMPayPayload, validateBiMPayInput, buildMerchantAccount, buildAdditionalData } from "../src/pure.js";
import type { BiMPayInput } from "../src/pure.js";
const input: BiMPayInput = { merchantName: "EXAMPLE", fiAlias: "BANKBB", branchAlias: "BANKBB", accountReference: "00123", participantCode: "00001", timestamp: "20260501123456" };
function parse(payload: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < payload.length;) {
    const length = Number(payload.slice(i + 2, i + 4));
    result[payload.slice(i, i + 2)] = payload.slice(i + 4, i + 4 + length);
    i += 4 + length;
  }
  return result;
}
describe("experimental payload compatibility", () => {
  it("encodes TLVs using existing trimming and character lengths", () => {
    expect(tlv("59", " Example ")).toBe("5907Example");
    expect(tlv("01", "")).toBe("0100");
    expect(() => tlv("1", "x")).toThrow("tag");
    expect(() => tlv("01", "x".repeat(100))).toThrow("99");
    expect(() => tlv("01", 42 as unknown as string)).toThrow("string");
  });
  it("matches CRC-16/CCITT-FALSE check fixtures", () => {
    expect(crc16CcittFalse("123456789")).toBe("29B1");
    expect(crc16CcittFalse("")).toBe("FFFF");
    expect(buildEmvPayload([{ tag: "00", value: "01" }])).toBe("0002016304AAE6");
  });
  it("preserves tag mappings, defaults and injected timestamps", () => {
    const payload = buildBiMPayPayload({ ...input, additionalData: { billNumber: "B1", referenceLabel: "REF", purpose: "APPEAL" } });
    const tags = parse(payload);
    expect(tags["54"]).toBe("***");
    expect(parse(tags["26"])).toEqual({ "00": "bb.org.cb.mpqr", "01": "BANKBB", "02": "BANKBB", "03": "00123", "04": "00001", "11": "QRBB" });
    expect(parse(tags["62"])).toEqual({ "01": "B1", "05": "REF", "08": "APPEAL" });
    expect(parse(tags["80"])).toEqual({ "00": "bb.org.cb.mpqr", "01": input.timestamp });
    expect(tags["53"]).toBe("052");
    expect(tags["60"]).toBe("BRIDGETOWN");
    expect(payload.slice(-4)).toBe(crc16CcittFalse(payload.slice(0, -4)));
    expect(buildBiMPayPayload({ ...input, additionalData: { billNumber: "B1", referenceLabel: "REF", purpose: "APPEAL" } })).toBe(payload);
  });
  it("preserves fixed amount spelling and legacy name truncation", () => {
    const tags = parse(buildBiMPayPayload({ ...input, amountMode: "fixed", amount: "50.00", merchantName: "x".repeat(30) }));
    expect(tags["54"]).toBe("50.00");
    expect(tags["59"]).toHaveLength(25);
    expect(buildAdditionalData({})).toBe("");
    expect(buildMerchantAccount(input)).toContain("1104QRBB");
  });
  it.each(["", "0", "-1.00", "3.5", "abc", "1.000", "1e2"])("rejects malformed fixed amounts %s", amount => {
    expect(validateBiMPayInput({ ...input, amountMode: "fixed", amount }).length).toBeGreaterThan(0);
  });
  it("rejects missing fields, malformed runtime values and oversized nested data", () => {
    expect(validateBiMPayInput({ ...input, merchantName: "", fiAlias: "" })).toHaveLength(2);
    expect(validateBiMPayInput(null as unknown as BiMPayInput)).toHaveLength(1);
    expect(validateBiMPayInput({ ...input, merchantCity: 42 } as unknown as BiMPayInput).length).toBeGreaterThan(0);
    expect(() => buildBiMPayPayload({ ...input, accountReference: "x".repeat(90) })).toThrow("99");
    expect(() => buildBiMPayPayload({ ...input, additionalData: { purpose: "x".repeat(100) } })).toThrow("99");
    expect(() => buildBiMPayPayload({ ...input, timestamp: "bad" })).toThrow("timestamp");
    expect(validateBiMPayInput({ ...input, currency: "BBD", country: "B", merchantCategoryCode: "12" })).toHaveLength(3);
  });
});

it("supports static/dynamic initiation independently of amount mode and optional experimental 80.02", () => {
  const old = parse(buildBiMPayPayload(input));
  expect(old["01"]).toBe("11");
  expect(parse(old["80"])["02"]).toBeUndefined();
  const tags = parse(buildBiMPayPayload({ ...input, initiationMethod: "12", privateTimerSeconds: "00000090" }));
  expect(tags["01"]).toBe("12");
  expect(tags["54"]).toBe("***");
  expect(parse(tags["80"])).toEqual({ "00": "bb.org.cb.mpqr", "01": input.timestamp, "02": "00000090" });
  const fixed = parse(buildBiMPayPayload({ ...input, initiationMethod: "11", amountMode: "fixed", amount: "50.00" }));
  expect(fixed["01"]).toBe("11");
  expect(fixed["54"]).toBe("50.00");
  expect(tags["63"]).toBe(crc16CcittFalse(buildBiMPayPayload({ ...input, initiationMethod: "12", privateTimerSeconds: "00000090" }).slice(0, -4)));
});
it.each(["90", "000000090", "-0000090", "00000.90", "abcdefgh"])("rejects malformed private timer %s", privateTimerSeconds => {
  expect(() => buildBiMPayPayload({ ...input, privateTimerSeconds })).toThrow("eight digits");
});
it("rejects unsupported initiation methods", () => {
  expect(validateBiMPayInput({ ...input, initiationMethod: "13" })).toContain("initiationMethod must be 11 (static) or 12 (dynamic).");
});
