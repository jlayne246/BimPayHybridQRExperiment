import { expect, it } from "vitest";
import { encodeDebugDuration } from "../src/debugDuration";

it("converts supported units to exact eight-digit whole seconds", () => {
  expect(encodeDebugDuration("", "seconds")).toBe("");
  expect(encodeDebugDuration("0", "seconds")).toBe("00000000");
  expect(encodeDebugDuration("90", "seconds")).toBe("00000090");
  expect(encodeDebugDuration("1.5", "minutes")).toBe("00000090");
  expect(encodeDebugDuration("0.5", "hours")).toBe("00001800");
  expect(encodeDebugDuration("1", "days")).toBe("00086400");
  expect(encodeDebugDuration("99999999", "seconds")).toBe("99999999");
});
it("rejects overflow, fractional seconds and malformed durations without rounding", () => {
  for (const value of ["-1", "NaN", "1e3", "abc", "100000000", "0.5", "9".repeat(25)]) {
    expect(() => encodeDebugDuration(value, "seconds")).toThrow();
  }
  expect(() => encodeDebugDuration("0.001", "hours")).toThrow("whole");
  expect(() => encodeDebugDuration("1158", "days")).toThrow("eight digits");
});
