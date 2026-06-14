import type { MerchantProfile, PersonProfile } from "../data/sampleProfiles";

/** High-level workflow represented by a Scenario Lab request. */
export type ScenarioMode = "interpersonal" | "merchant";
/** Terminal lifecycle states retained in durable Scenario history. */
export type ScenarioTransactionStatus =
  | "authorized"
  | "declined"
  | "expired"
  | "cancelled"
  | "refunded";

/**
 * Completed or otherwise terminal Scenario simulation.
 *
 * This is workflow history only and never implies that Wallet Lab balances
 * were changed.
 */
export interface SimulatedScenarioTransaction {
  id: string;
  mode: ScenarioMode;
  payer: string;
  recipient: string;
  amount: string;
  reference: string;
  status: ScenarioTransactionStatus;
  createdAt: string;
  updatedAt: string;
  receiptNumber: string;
}

/** Scenario data that can be stored locally or published to collaborators. */
export interface ScenarioLabState {
  customPeople: PersonProfile[];
  customMerchants: MerchantProfile[];
  transactions: SimulatedScenarioTransaction[];
}
