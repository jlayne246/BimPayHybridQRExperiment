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
}

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
  },
];

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
  },
];
