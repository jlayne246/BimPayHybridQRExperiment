export const DURATION_UNITS = { seconds: 1, minutes: 60, hours: 3600, days: 86400 } as const;
export type DurationUnit = keyof typeof DURATION_UNITS;

/** Experimental 80.02 convention only: exactly eight decimal digits of whole seconds. */
export function encodeDebugDuration(value: string, unit: DurationUnit): string {
  const text = value.trim();
  if (!text) return "";
  if (text.length > 24 || !/^\d+(?:\.\d+)?$/.test(text)) throw new Error("Enter a non-negative duration, for example 90 or 1.5.");
  if (!Object.hasOwn(DURATION_UNITS, unit)) throw new Error("Choose a supported duration unit.");
  const [whole, fraction = ""] = text.split(".");
  const denominator = 10n ** BigInt(fraction.length);
  const numerator = BigInt(whole + fraction) * BigInt(DURATION_UNITS[unit]);
  if (numerator % denominator !== 0n) throw new Error("The duration must convert to a whole number of seconds.");
  const seconds = numerator / denominator;
  if (seconds > 99999999n) throw new Error("80.02 can hold at most 99,999,999 seconds (eight digits).");
  return seconds.toString().padStart(8, "0");
}
