export type Direction = "arrival" | "departure";

export type AirportInfo = {
  code: string;
  name: string;
  city: string;
  province: string;
  country: string;
};

export type FlightLeg = {
  id: string;
  sourceRow: number;
  reportDate: string;
  airline: string;
  originalFlightNo: string;
  flightNo: string;
  aircraftType: string;
  originalRoute: string;
  route: string;
  origin: string;
  destination: string;
  marketAirport: string;
  direction: Direction;
  passengerTotal: number;
  adult: number;
  child: number;
  infant: number;
  transferAdult: number | null;
  transferChild: number | null;
  transferInfant: number | null;
  payableAdult: number | null;
  payableChild: number | null;
  baggageKg: number;
  parcelKg: number;
  cargoKg: number;
  transitKg: number | null;
};

export type ReportMeta = {
  title: string;
  airportName: string;
  dateRangeText: string;
  printDateText: string;
  airlineFilter: string;
};

export type FlightDataset = {
  id: string;
  reportDate: string;
  fileName: string;
  importedAt: string;
  meta: ReportMeta;
  sourceFlightRows: number;
  legCount: number;
  records: FlightLeg[];
  warnings: string[];
};

export type DashboardFilters = {
  direction: "all" | Direction;
  airline: string;
  origin: string;
  country: string;
  province: string;
  search: string;
  dateFrom: string; // "YYYY-MM-DD" | ""
  dateTo: string;   // "YYYY-MM-DD" | ""
  flightScope: "all" | "domestic" | "international";
};

export type SummaryRow = {
  key: string;
  label: string;
  subLabel: string;
  country: string;
  province: string;
  flightCount: number;
  arrivals: number;
  departures: number;
  passengers: number;
  baggageKg: number;
  parcelKg: number;
  cargoKg: number;
};

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  fullName?: string;
  photoURL: string;
  isApproved: boolean;
  isAdmin?: boolean;
  isSuperadmin?: boolean;
  isRejected?: boolean;
  requestedApps?: string[];
  pinCode?: string; // Hashed PIN
  hasPin?: boolean; // True if PIN is set
  role?: 'admin' | 'user' | 'superadmin';
  status?: 'approved' | 'pending' | 'rejected';
  lastLoginAt?: any;
  createdAt: any;
  updatedAt: any;
}

