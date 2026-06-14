export interface PersonProfile {
  id: string;
  kind: "person";
  name: string;
  initials: string;
  color: string;
  accountReference: string;
  financialInstitution: string;
  financialInstitutionAlias: string;
  branchAlias: string;
  participantCode: string;
  wallet?: WalletSeed;
}

export interface OrganizationProfile {
  id: string;
  kind: "charity" | "church";
  name: string;
  initials: string;
  color: string;
  accountReference: string;
  financialInstitution: string;
  financialInstitutionAlias: string;
  branchAlias: string;
  participantCode: string;
  wallet?: WalletSeed;
}

export interface MerchantProfile {
  id: string;
  kind: "merchant";
  name: string;
  initials: string;
  color: string;
  category: string;
  merchantCategoryCode: string;
  location: string;
  accountReference: string;
  financialInstitution: string;
  financialInstitutionAlias: string;
  branchAlias: string;
  participantCode: string;
  wallet?: WalletSeed;
}

export interface WalletSeed {
  model: "prepaid" | "bank-linked" | "hybrid" | "bank-direct";
  walletBalance: number;
  bankBalance: number;
  bankName: string;
  bankDetail: string;
  walletIdentifier: string;
  walletColor: string;
}

export type AccountProfile = PersonProfile | OrganizationProfile;
export type CatalogProfile = AccountProfile | MerchantProfile;

export const PEOPLE: PersonProfile[] = [
  {
    id: "maya",
    kind: "person",
    name: "Maya Test",
    initials: "MT",
    color: "bg-violet-600",
    accountReference: "100000000000001",
    financialInstitution: "Test Route 1",
    financialInstitutionAlias: "TESTROC1",
    branchAlias: "TESTROC1",
    participantCode: "333331",
    wallet: {
      model: "prepaid",
      walletBalance: 150,
      bankBalance: 850,
      bankName: "Test Bank Account",
      bankDetail: "Checking ending 1184",
      walletIdentifier: "WLT-TEST-8842-1905",
      walletColor: "from-emerald-700 to-teal-600",
    },
  },
  {
    id: "andre",
    kind: "person",
    name: "Andre Test",
    initials: "AT",
    color: "bg-cyan-600",
    accountReference: "100000000000002",
    financialInstitution: "Test Route 2",
    financialInstitutionAlias: "TESTROC2",
    branchAlias: "TESTROC2",
    participantCode: "333332",
    wallet: {
      model: "bank-linked",
      walletBalance: 0,
      bankBalance: 620,
      bankName: "Island Credit Union",
      bankDetail: "Savings ending 4072",
      walletIdentifier: "WLT-TEST-4072-2210",
      walletColor: "from-blue-700 to-indigo-600",
    },
  },
  {
    id: "leah",
    kind: "person",
    name: "Leah Test",
    initials: "LT",
    color: "bg-rose-600",
    accountReference: "100000000000003",
    financialInstitution: "Test Route 1",
    financialInstitutionAlias: "TESTROC1",
    branchAlias: "TESTROC1",
    participantCode: "333331",
    wallet: {
      model: "hybrid",
      walletBalance: 45,
      bankBalance: 475,
      bankName: "Test Route Bank",
      bankDetail: "Checking ending 9031",
      walletIdentifier: "WLT-TEST-9031-7714",
      walletColor: "from-violet-700 to-fuchsia-600",
    },
  },
];

export const ORGANIZATIONS: OrganizationProfile[] = [
  {
    id: "hope-relief-fund",
    kind: "charity",
    name: "Test Hope Relief Fund",
    initials: "HR",
    color: "bg-rose-600",
    accountReference: "300000000000001",
    financialInstitution: "Test Route 1",
    financialInstitutionAlias: "TESTROC1",
    branchAlias: "TESTROC1",
    participantCode: "333331",
    wallet: {
      model: "prepaid",
      walletBalance: 300,
      bankBalance: 1200,
      bankName: "Test Community Bank",
      bankDetail: "Charity account ending 2044",
      walletIdentifier: "WLT-CHARITY-2044",
      walletColor: "from-rose-700 to-pink-600",
    },
  },
  {
    id: "bridgetown-community-church",
    kind: "church",
    name: "Test Bridgetown Community Church",
    initials: "BC",
    color: "bg-amber-600",
    accountReference: "300000000000002",
    financialInstitution: "Test Route 2",
    financialInstitutionAlias: "TESTROC2",
    branchAlias: "TESTROC2",
    participantCode: "333332",
    wallet: {
      model: "hybrid",
      walletBalance: 75,
      bankBalance: 1500,
      bankName: "Test Parish Credit Union",
      bankDetail: "Organization account ending 7712",
      walletIdentifier: "WLT-CHURCH-7712",
      walletColor: "from-amber-600 to-orange-600",
    },
  },
  {
    id: "community-food-program",
    kind: "charity",
    name: "Test Community Food Programme",
    initials: "CF",
    color: "bg-emerald-700",
    accountReference: "300000000000003",
    financialInstitution: "Test Route 1",
    financialInstitutionAlias: "TESTROC1",
    branchAlias: "TESTROC1",
    participantCode: "333331",
    wallet: {
      model: "bank-direct",
      walletBalance: 0,
      bankBalance: 2100,
      bankName: "Test Community Bank",
      bankDetail: "Programme account ending 6630",
      walletIdentifier: "BANK-DIRECT-6630",
      walletColor: "from-emerald-800 to-lime-700",
    },
  },
];

export const ACCOUNT_PROFILES: AccountProfile[] = [...PEOPLE, ...ORGANIZATIONS];

export const MERCHANTS: MerchantProfile[] = [
  {
    id: "cafe",
    kind: "merchant",
    name: "Test Seabreeze Cafe",
    initials: "SC",
    color: "bg-amber-600",
    category: "Cafe and quick service",
    merchantCategoryCode: "5814",
    location: "Bridgetown",
    accountReference: "200000000000001",
    financialInstitution: "Test Route 1",
    financialInstitutionAlias: "TESTROC1",
    branchAlias: "TESTROC1",
    participantCode: "333331",
    wallet: {
      model: "hybrid",
      walletBalance: 125,
      bankBalance: 1800,
      bankName: "Test Business Bank",
      bankDetail: "Business account ending 5814",
      walletIdentifier: "WLT-BUSINESS-5814",
      walletColor: "from-amber-600 to-orange-600",
    },
  },
  {
    id: "market",
    kind: "merchant",
    name: "Test Cane Market",
    initials: "CM",
    color: "bg-emerald-600",
    category: "Grocery and provisions",
    merchantCategoryCode: "5411",
    location: "Oistins",
    accountReference: "200000000000002",
    financialInstitution: "Test Route 2",
    financialInstitutionAlias: "TESTROC2",
    branchAlias: "TESTROC2",
    participantCode: "333332",
    wallet: {
      model: "bank-direct",
      walletBalance: 0,
      bankBalance: 3200,
      bankName: "Test Commercial Bank",
      bankDetail: "Merchant account ending 5411",
      walletIdentifier: "BANK-DIRECT-5411",
      walletColor: "from-emerald-700 to-teal-600",
    },
  },
  {
    id: "taxi",
    kind: "merchant",
    name: "Test Island Taxi",
    initials: "IT",
    color: "bg-blue-600",
    category: "Taxi service",
    merchantCategoryCode: "4121",
    location: "Speightstown",
    accountReference: "200000000000003",
    financialInstitution: "Test Route 1",
    financialInstitutionAlias: "TESTROC1",
    branchAlias: "TESTROC1",
    participantCode: "333331",
    wallet: {
      model: "bank-linked",
      walletBalance: 0,
      bankBalance: 950,
      bankName: "Test Transport Credit Union",
      bankDetail: "Business account ending 4121",
      walletIdentifier: "WLT-BUSINESS-4121",
      walletColor: "from-blue-700 to-indigo-600",
    },
  },
];

export const CATALOG_PROFILES: CatalogProfile[] = [...ACCOUNT_PROFILES, ...MERCHANTS];
