/** Supported ways a simulated profile can source outgoing funds. */
export type FundingModel = "prepaid" | "bank-linked" | "hybrid" | "bank-direct";
/** Ledger bucket affected by a movement. */
export type BalanceType = "wallet" | "bank";
/** Business role represented by a wallet profile. */
export type ProfileKind = "person" | "business" | "charity" | "church";

/**
 * One independently balanced bank or credit-union account linked to a wallet.
 *
 * Transactions use a single enabled source. Priority is used only to choose a
 * fallback/default source; it does not authorize splitting across accounts.
 */
export interface WalletFundingSource {
  id: string;
  name: string;
  detail: string;
  balance: number;
  priority: number;
  isDefault: boolean;
  enabled: boolean;
}

/**
 * Complete client-side representation of a wallet profile.
 *
 * `bankBalance` mirrors the sum of `fundingSources` for compatibility and
 * display. Source-level balances are authoritative for bank-funded operations.
 */
export interface SimulatedWallet {
  id: string;
  ownerName: string;
  profileKind: ProfileKind;
  model: FundingModel;
  walletBalance: number;
  bankBalance: number;
  bankName: string;
  bankDetail: string;
  fundingSources: WalletFundingSource[];
  walletIdentifier: string;
  color: string;
  isCustom: boolean;
}

/** A signed sandbox movement shown in a profile's activity ledger. */
export interface LedgerEntry {
  id: string;
  ownerId: string;
  title: string;
  detail: string;
  amount: number;
  balanceType: BalanceType;
  createdAt: string;
  reference: string;
}

/** Serializable state persisted locally or published as a workspace snapshot. */
export interface WalletLabState {
  wallets: SimulatedWallet[];
  ledger: LedgerEntry[];
}
