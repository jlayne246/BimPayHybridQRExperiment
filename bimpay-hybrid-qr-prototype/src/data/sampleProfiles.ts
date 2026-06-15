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
  merchantGroupName?: string;
  branchName?: string;
  branchCode?: string;
  settlementModel?: "single-account" | "branch-accounts";
  wallet?: WalletSeed;
}

export interface WalletSeed {
  model: "prepaid" | "bank-linked" | "hybrid" | "bank-direct";
  walletBalance: number;
  bankBalance: number;
  bankName: string;
  bankDetail: string;
  fundingSources?: WalletFundingSourceSeed[];
  walletIdentifier: string;
  walletColor: string;
}

export interface WalletFundingSourceSeed {
  id: string;
  name: string;
  detail: string;
  balance: number;
  priority: number;
  isDefault: boolean;
  enabled: boolean;
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
      bankBalance: 775,
      bankName: "Test Route Bank",
      bankDetail: "Checking ending 9031",
      fundingSources: [
        {
          id: "leah-checking",
          name: "Test Route Bank",
          detail: "Checking ending 9031",
          balance: 775,
          priority: 1,
          isDefault: true,
          enabled: true,
        },
      ],
      walletIdentifier: "WLT-TEST-9031-7714",
      walletColor: "from-violet-700 to-fuchsia-600",
    },
  },
  {
    id: "nia",
    kind: "person",
    name: "Nia Test",
    initials: "NT",
    color: "bg-emerald-600",
    accountReference: "100000000000004",
    financialInstitution: "Test Route 2",
    financialInstitutionAlias: "TESTROC2",
    branchAlias: "TESTROC2",
    participantCode: "333332",
    wallet: {
      model: "hybrid",
      walletBalance: 80,
      bankBalance: 1100,
      bankName: "Two linked accounts",
      bankDetail: "Checking and savings",
      fundingSources: [
        {
          id: "nia-checking",
          name: "Test Community Bank",
          detail: "Everyday checking ending 4418",
          balance: 700,
          priority: 1,
          isDefault: true,
          enabled: true,
        },
        {
          id: "nia-savings",
          name: "Island Credit Union",
          detail: "Rainy-day savings ending 9062",
          balance: 400,
          priority: 2,
          isDefault: false,
          enabled: true,
        },
      ],
      walletIdentifier: "WLT-TEST-4418-9062",
      walletColor: "from-emerald-700 to-cyan-600",
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
      bankBalance: 2400,
      bankName: "Test Parish Credit Union",
      bankDetail: "2 linked accounts",
      fundingSources: [
        {
          id: "church-operating",
          name: "Test Parish Credit Union",
          detail: "Operating account ending 7712",
          balance: 1500,
          priority: 1,
          isDefault: true,
          enabled: true,
        },
        {
          id: "church-building",
          name: "Test Community Bank",
          detail: "Building fund ending 4480",
          balance: 900,
          priority: 2,
          isDefault: false,
          enabled: true,
        },
      ],
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
      bankBalance: 3000,
      bankName: "Test Business Bank",
      bankDetail: "2 linked accounts",
      fundingSources: [
        {
          id: "cafe-operating",
          name: "Test Business Bank",
          detail: "Operating account ending 5814",
          balance: 1800,
          priority: 1,
          isDefault: true,
          enabled: true,
        },
        {
          id: "cafe-reserve",
          name: "Test Commercial Bank",
          detail: "Reserve account ending 9910",
          balance: 1200,
          priority: 2,
          isDefault: false,
          enabled: true,
        },
      ],
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
  {
    id: "harbor-pharmacy-bridgetown",
    kind: "merchant",
    name: "Test Harbor Pharmacy - Bridgetown",
    initials: "HP",
    color: "bg-cyan-700",
    category: "Pharmacy",
    merchantCategoryCode: "5912",
    location: "Bridgetown",
    accountReference: "200000000000010",
    financialInstitution: "Test Route 1",
    financialInstitutionAlias: "TESTROC1",
    branchAlias: "TESTROC1",
    participantCode: "333331",
    merchantGroupName: "Test Harbor Pharmacy",
    branchName: "Bridgetown",
    branchCode: "HP-BGI",
    settlementModel: "single-account",
  },
  {
    id: "harbor-pharmacy-oistins",
    kind: "merchant",
    name: "Test Harbor Pharmacy - Oistins",
    initials: "HP",
    color: "bg-cyan-600",
    category: "Pharmacy",
    merchantCategoryCode: "5912",
    location: "Oistins",
    accountReference: "200000000000010",
    financialInstitution: "Test Route 1",
    financialInstitutionAlias: "TESTROC1",
    branchAlias: "TESTROC1",
    participantCode: "333331",
    merchantGroupName: "Test Harbor Pharmacy",
    branchName: "Oistins",
    branchCode: "HP-OIS",
    settlementModel: "single-account",
  },
  {
    id: "island-home-bridgetown",
    kind: "merchant",
    name: "Test Island Home - Bridgetown",
    initials: "IH",
    color: "bg-indigo-700",
    category: "Home supply store",
    merchantCategoryCode: "5211",
    location: "Bridgetown",
    accountReference: "200000000000011",
    financialInstitution: "Test Route 2",
    financialInstitutionAlias: "TESTROC2",
    branchAlias: "TESTROC2",
    participantCode: "333332",
    merchantGroupName: "Test Island Home",
    branchName: "Bridgetown",
    branchCode: "IH-BGI",
    settlementModel: "branch-accounts",
    wallet: {
      model: "bank-direct",
      walletBalance: 0,
      bankBalance: 2400,
      bankName: "Test Commercial Bank",
      bankDetail: "Bridgetown branch settlement ending 0011",
      walletIdentifier: "BANK-DIRECT-IH-BGI",
      walletColor: "from-indigo-800 to-blue-700",
    },
  },
  {
    id: "island-home-oistins",
    kind: "merchant",
    name: "Test Island Home - Oistins",
    initials: "IH",
    color: "bg-indigo-600",
    category: "Home supply store",
    merchantCategoryCode: "5211",
    location: "Oistins",
    accountReference: "200000000000012",
    financialInstitution: "Test Route 2",
    financialInstitutionAlias: "TESTROC2",
    branchAlias: "TESTROC2",
    participantCode: "333332",
    merchantGroupName: "Test Island Home",
    branchName: "Oistins",
    branchCode: "IH-OIS",
    settlementModel: "branch-accounts",
    wallet: {
      model: "bank-direct",
      walletBalance: 0,
      bankBalance: 1750,
      bankName: "Test Commercial Bank",
      bankDetail: "Oistins branch settlement ending 0012",
      walletIdentifier: "BANK-DIRECT-IH-OIS",
      walletColor: "from-blue-800 to-cyan-700",
    },
  },
];

export const CATALOG_PROFILES: CatalogProfile[] = [...ACCOUNT_PROFILES, ...MERCHANTS];
