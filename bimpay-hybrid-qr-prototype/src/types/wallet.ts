export type FundingModel = "prepaid" | "bank-linked" | "hybrid";
export type BalanceType = "wallet" | "bank";
export type ProfileKind = "person" | "charity" | "church";

export interface SimulatedWallet {
  id: string;
  ownerName: string;
  profileKind: ProfileKind;
  model: FundingModel;
  walletBalance: number;
  bankBalance: number;
  bankName: string;
  bankDetail: string;
  walletIdentifier: string;
  color: string;
  isCustom: boolean;
}

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

export interface WalletLabState {
  wallets: SimulatedWallet[];
  ledger: LedgerEntry[];
}
