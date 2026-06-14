import type { MerchantProfile, PersonProfile } from "../data/sampleProfiles";

export type ScenarioMode = "interpersonal" | "merchant";
export type ScenarioTransactionStatus =
  | "authorized"
  | "declined"
  | "expired"
  | "cancelled"
  | "refunded";

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

export interface ScenarioLabState {
  customPeople: PersonProfile[];
  customMerchants: MerchantProfile[];
  transactions: SimulatedScenarioTransaction[];
}
