export interface TransitBranch {
  transitCode: string;
  addressLine1: string;
  note: string;
  discontinued: boolean;
}

export interface TransitInstitution {
  partyName: string;
  bic: string;
  branches: TransitBranch[];
}

const branches = (rows: Array<[string, string, string?]>): TransitBranch[] => rows.map(([transitCode, addressLine1, note = ""]) => ({
  transitCode, addressLine1, note, discontinued: note.startsWith("DISCONTINUED"),
}));

// Transcribed from Branch Transit Code Update - May 2026, pages 1-4.
// Preserve leading zeros, duplicate source rows, spellings, and status notes.
export const TRANSIT_DIRECTORY: TransitInstitution[] = [
  { partyName: "AFFINITY PLUS CREDIT UNION LTD", bic: "AFPUBBB2", branches: branches([
    ["00000", "AFFINITY PLUS"],
  ]) },
  { partyName: "BANK OF NOVA SCOTIA", bic: "NOSCBBBB", branches: branches([
    ["36285", "WARRENS"], ["40055", "BROAD STREET"],
    ["62935", "BNS WILDEY", "DISCONTINUED"], ["63685", "BNS HOLETOWN", "DISCONTINUED"],
    ["66555", "HAGGATT HALL"], ["70565", "ROCKLEY COCONUT WALK", "DISCONTINUED"],
    ["80655", "BNS BLACK ROCK", "DISCONTINUED"], ["06155", "SPCG Offshore Banking"], ["82925", "Offshore Banking"],
  ]) },
  { partyName: "BARBADOS PUBLIC WORKS COOP", bic: "BPWCBBB2", branches: branches([
    ["00000", "CREDIT UNION LIMITED"],
  ]) },
  { partyName: "CENTRAL BANK OF BARBADOS", bic: "CBABBBBB", branches: branches([
    ["00001", "CHURCH VILLAGE BRIDGETOWN"],
  ]) },
  { partyName: "CIBC FIRST CARIBBEAN INT BANK", bic: "FCIBBBBB", branches: branches([
    ["07676", "FCB WARRENS", "DISCONTINUED"], ["09127", "WILDEY", "DISCONTINUED"],
    ["09172", "OISTINS", "DISCONTINUED"], ["09316", "BROAD STREET", "DISCONTINUED"],
    ["09111", "SPEIGHTSTOWN", "DISCONTINUED"], ["08036", "Trust & Merchant Bank", "DISCONTINUED"],
    ["07626", "Commercial Banking Centre"], ["08006", "FONTABELLE", "DISCONTINUED"],
    ["09110", "WILDEY", "DISCONTINUED"], ["09112", "WILDEY", "DISCONTINUED"],
    ["09116", "CR NELSON FAIRCHILD STREET", "DISCONTINUED"], ["09127", "WILDEY"],
    ["09286", "OISTINS"], ["09326", "WARRENS SUPERCENTRE"], ["09586", "SHERATON"],
    ["09606", "BROAD STREET"], ["09616", "WORTHING/ RENDEZVOUS"], ["09636", "SPEIGHTSTOWN"], ["09646", "HOLETOWN"],
  ]) },
  { partyName: "CITY OF BRIDGETOWN COOP", bic: "CBCCBBBB", branches: branches([
    ["00000", "CREDIT UNION LIMITED"],
  ]) },
  { partyName: "FIRST CITIZENS", bic: "FCTTBBBB", branches: branches([
    ["00001", "BROAD STREET"], ["00002", "COLLYMORE ROCK"], ["00003", "BIG B RENDEZOUS"],
    ["00004", "J BSSARGENTS VILLAGE"], ["00007", "SOMERLEY"], ["00008", "WELCHES"], ["00009", "COVERLEY"], ["00010", "WILDEY"],
  ]) },
  { partyName: "REPUBLIC BANK", bic: "BNBABBBB", branches: branches([
    ["00001", "FAIRCHILD STREET", "DISCONTINUED"], ["00002", "BROAD STREET"],
    ["00004", "AIRPORT", "DISCONTINUED"], ["00005", "COCONUT WALK", "FORMERLY WILDEY"],
    ["00006", "SPEIGHTSTOWN"], ["00009", "EMERALD CITY/ SIX ROADS"], ["00010", "WARRENS"],
    ["00014", "WORTHING", "DISCONTINUED ON MAY 1ST 2026. BRANCH MERGED WITH WILDEY TO CONTINUE AS COCONUT WALK"],
    ["00017", "HOLETOWN LIMEGROVE"], ["01010", "RBL WARRENS", "DISCONTINUED"], ["01014", "RBL WORTHING", "DISCONTINUED"],
  ]) },
  { partyName: "ROYAL BANK OF CANADA", bic: "ROYCBBBB", branches: branches([
    ["00001", "LOWER BROAD STREET"], ["00003", "HASTINGS"], ["00004", "SIX ROADS"], ["00005", "SUNSET CREST"],
    ["05605", "ST LAWRENCE"], ["06465", "PRIVATE BANKING"], ["09415", "UNIVERSITY HILL"],
    ["09425", "SUNSET CREST HOLETOWN"], ["09435", "BROAD STREET"], ["09545", "HASTINGS"],
    ["09565", "SPEIGHTSTOWN"], ["09785", "CHELSTON PARK COLLYMORE ROCK"], ["09455", "HINCKS STREET BRANCH"],
  ]) },
  { partyName: "SAGICOR BANK BARBADOS LTD", bic: "SBBLBBBB", branches: branches([
    ["00000", "WORTHING CORPORATE CENTRE"],
  ]) },
];
