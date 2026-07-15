import { getAirportInfo } from "./airportReference";
import { getAirlineName } from "./airlineReference";
import type { DashboardFilters, FlightLeg, SummaryRow, Direction } from "./types";

export interface RankingItem {
  id: string;
  label: string;
  subLabel?: string;
  value: number;
  secondaryValue?: number;
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat("vi-VN").format(value);
}

export function formatDate(value: string): string {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

export function filterRecords(records: FlightLeg[], filters: DashboardFilters): FlightLeg[] {
  const search = filters.search.trim().toLowerCase();
  return records.filter((record) => {
    const market = getAirportInfo(record.marketAirport);
    const origin = getAirportInfo(record.origin);
    const destination = getAirportInfo(record.destination);

    if (filters.dateFrom && record.reportDate < filters.dateFrom) return false;
    if (filters.dateTo && record.reportDate > filters.dateTo) return false;
    if (filters.direction !== "all" && record.direction !== filters.direction) return false;
    if (filters.airline && record.airline !== filters.airline) return false;
    if (filters.origin && record.origin !== filters.origin) return false;
    if (filters.country && market.country !== filters.country) return false;
    if (filters.province && market.province !== filters.province) return false;

    if (filters.flightScope && filters.flightScope !== "all") {
      const isOriginVietnam = getAirportInfo(record.origin).country === "Vietnam";
      const isDestVietnam = getAirportInfo(record.destination).country === "Vietnam";
      const isDomestic = isOriginVietnam && isDestVietnam;
      if (filters.flightScope === "domestic" && !isDomestic) return false;
      if (filters.flightScope === "international" && isDomestic) return false;
    }

    if (!search) return true;

    const haystack = [
      record.airline,
      record.flightNo,
      record.originalFlightNo,
      record.route,
      record.originalRoute,
      origin.city,
      origin.country,
      destination.city,
      destination.country,
      market.city,
      market.province,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(search);
  });
}

export function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) => a.localeCompare(b));
}

export function buildAirportOptions(records: FlightLeg[]) {
  return uniqueSorted(records.map((record) => record.origin));
}

export function buildAirlineOptions(records: FlightLeg[]) {
  return uniqueSorted(records.map((record) => record.airline));
}

export function buildCountryOptions(records: FlightLeg[]) {
  return uniqueSorted(records.map((record) => getAirportInfo(record.marketAirport).country));
}

export function buildProvinceOptions(records: FlightLeg[], country: string) {
  return uniqueSorted(
    records
      .filter((record) => !country || getAirportInfo(record.marketAirport).country === country)
      .map((record) => getAirportInfo(record.marketAirport).province),
  );
}

export function totals(records: FlightLeg[]) {
  const airlines = new Set(records.map((record) => record.airline));
  const countries = new Set(records.map((record) => getAirportInfo(record.marketAirport).country));
  return {
    legs: records.length,
    sourceRows: new Set(records.map((record) => record.sourceRow)).size,
    passengers: records.reduce((sum, record) => sum + record.passengerTotal, 0),
    adults: records.reduce((sum, record) => sum + record.adult, 0),
    children: records.reduce((sum, record) => sum + record.child, 0),
    infants: records.reduce((sum, record) => sum + record.infant, 0),
    arrivals: records.filter((record) => record.direction === "arrival").length,
    departures: records.filter((record) => record.direction === "departure").length,
    arrivalPassengers: records.filter((record) => record.direction === "arrival").reduce((sum, record) => sum + record.passengerTotal, 0),
    departurePassengers: records.filter((record) => record.direction === "departure").reduce((sum, record) => sum + record.passengerTotal, 0),
    baggageKg: records.reduce((sum, record) => sum + record.baggageKg, 0),
    parcelKg: records.reduce((sum, record) => sum + record.parcelKg, 0),
    cargoKg: records.reduce((sum, record) => sum + record.cargoKg, 0),
    airlineCount: airlines.size,
    countryCount: countries.size,
  };
}

function blankSummary(key: string, label: string, subLabel: string, country = "", province = ""): SummaryRow {
  return {
    key,
    label,
    subLabel,
    country,
    province,
    flightCount: 0,
    arrivals: 0,
    departures: 0,
    passengers: 0,
    baggageKg: 0,
    parcelKg: 0,
    cargoKg: 0,
  };
}

function addRecord(summary: SummaryRow, record: FlightLeg) {
  summary.flightCount += 1;
  summary.passengers += record.passengerTotal;
  summary.baggageKg += record.baggageKg;
  summary.parcelKg += record.parcelKg;
  summary.cargoKg += record.cargoKg;
  if (record.direction === "arrival") summary.arrivals += 1;
  if (record.direction === "departure") summary.departures += 1;
}

export function summarizeByMarket(records: FlightLeg[]): SummaryRow[] {
  const groups = new Map<string, SummaryRow>();
  for (const record of records) {
    const airport = getAirportInfo(record.marketAirport);
    const key = airport.code;
    if (!groups.has(key)) {
      groups.set(key, blankSummary(key, `${airport.code} - ${airport.city}`, airport.name, airport.country, airport.province));
    }
    addRecord(groups.get(key)!, record);
  }
  return Array.from(groups.values()).sort((a, b) => b.passengers - a.passengers);
}

export function summarizeByOrigin(records: FlightLeg[]): SummaryRow[] {
  const groups = new Map<string, SummaryRow>();
  for (const record of records) {
    const airport = getAirportInfo(record.origin);
    const key = airport.code;
    if (!groups.has(key)) {
      groups.set(key, blankSummary(key, `${airport.code} - ${airport.city}`, airport.name, airport.country, airport.province));
    }
    addRecord(groups.get(key)!, record);
  }
  return Array.from(groups.values()).sort((a, b) => b.flightCount - a.flightCount);
}

export function summarizeByAirline(records: FlightLeg[]): SummaryRow[] {
  const groups = new Map<string, SummaryRow>();
  for (const record of records) {
    if (!groups.has(record.airline)) {
      const fullName = getAirlineName(record.airline);
      groups.set(record.airline, blankSummary(record.airline, record.airline, fullName));
    }
    addRecord(groups.get(record.airline)!, record);
  }
  return Array.from(groups.values()).sort((a, b) => b.passengers - a.passengers);
}

export const AIRCRAFT_CAPACITIES: Record<string, number> = {
  "319": 144,
  "A320": 180,
  "A321": 220,
  "A330": 377,
  "A333": 377,
  "ATR": 72,
  "B38M": 189,
  "B738": 189,
  "B789": 300,
  "GLEX": 19,
  "A20N": 180,
  "A21N": 220,
  "A350": 305,
  "A359": 305,
  "A35K": 360,
  "B78X": 367,
  "B781": 367,
  "B777": 368,
  "B77W": 368,
  "B772": 310,
  "E190": 110,
  "E195": 124,
  "A339": 377,
  "GLF6": 19,
  "GLF5": 16,
  "GLF4": 16,
  "CL60": 12,
  "CL35": 12,
  "C680": 9,
  "C560": 8,
  "B39M": 215,
  "B739": 215,
  "B748": 410,
};

export function getAircraftCapacity(aircraftType: string): number | null {
  if (!aircraftType) return null;
  const cleanType = aircraftType.trim().toUpperCase();
  
  // Direct match
  if (AIRCRAFT_CAPACITIES[cleanType] !== undefined) {
    return AIRCRAFT_CAPACITIES[cleanType];
  }
  
  // Substring or fuzzy matching (e.g. A321NEO matches A321, ATR72/ATR-72 matches ATR)
  for (const [key, val] of Object.entries(AIRCRAFT_CAPACITIES)) {
    if (cleanType.includes(key) || key.includes(cleanType)) {
      return val;
    }
  }
  
  return null;
}

export function calculateOccupancy(adult: number, child: number, capacity: number): number | null {
  if (!capacity || capacity <= 0) return null;
  const seatOccupying = adult + child;
  return (seatOccupying / capacity) * 100;
}

// --- LEADERBOARD RANKING FUNCTIONS ---

function filterByDirection(records: FlightLeg[], dir: "arrival" | "departure" | "all") {
  return dir === "all" ? records : records.filter(r => r.direction === dir);
}

// 1. Top 10 Đường bay đến thường xuyên nhất (theo số chuyến)
export function getTopRoutesByFlightCount(records: FlightLeg[], dir: "arrival" | "departure" | "all", limit = 10): RankingItem[] {
  const filtered = filterByDirection(records, dir);
  const groups = new Map<string, { count: number, originName: string }>();
  for (const r of filtered) {
    const info = getAirportInfo(r.origin);
    const key = info.code;
    const existing = groups.get(key) || { count: 0, originName: `${info.city} (${info.code})` };
    existing.count += 1;
    groups.set(key, existing);
  }
  return Array.from(groups.entries())
    .map(([id, data]) => ({ id, label: data.originName, value: data.count }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// 2. Top 10 Đường bay đến đông khách nhất
export function getTopRoutesByPassengers(records: FlightLeg[], dir: "arrival" | "departure" | "all", limit = 10): RankingItem[] {
  const filtered = filterByDirection(records, dir);
  const groups = new Map<string, { pax: number, originName: string }>();
  for (const r of filtered) {
    const info = getAirportInfo(r.origin);
    const key = info.code;
    const existing = groups.get(key) || { pax: 0, originName: `${info.city} (${info.code})` };
    existing.pax += r.passengerTotal;
    groups.set(key, existing);
  }
  return Array.from(groups.entries())
    .map(([id, data]) => ({ id, label: data.originName, value: data.pax }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// 3. Top 10 Đường bay đến có tỷ lệ lấp đầy cao nhất
export function getTopRoutesByOccupancy(records: FlightLeg[], dir: "arrival" | "departure" | "all", limit = 10, minFlights = 3): RankingItem[] {
  const filtered = filterByDirection(records, dir);
  const groups = new Map<string, { totalPax: number, totalCap: number, flights: number, originName: string }>();
  for (const r of filtered) {
    const info = getAirportInfo(r.origin);
    const key = info.code;
    const existing = groups.get(key) || { totalPax: 0, totalCap: 0, flights: 0, originName: `${info.city} (${info.code})` };
    const cap = getAircraftCapacity(r.aircraftType);
    if (cap) {
      existing.totalPax += (r.adult + r.child);
      existing.totalCap += cap;
      existing.flights += 1;
    }
    groups.set(key, existing);
  }
  return Array.from(groups.entries())
    .filter(([_, data]) => data.flights >= minFlights && data.totalCap > 0)
    .map(([id, data]) => ({ 
      id, 
      label: data.originName, 
      value: (data.totalPax / data.totalCap) * 100,
      secondaryValue: data.flights 
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// 4. Top 10 Đường bay Quốc tế đến nhộn nhịp nhất (theo lượng khách)
export function getTopInternationalRoutes(records: FlightLeg[], dir: "arrival" | "departure" | "all", limit = 10): RankingItem[] {
  const filtered = filterByDirection(records, dir).filter(r => {
    const info = getAirportInfo(r.origin);
    return info.country !== "Vietnam";
  });
  const groups = new Map<string, { pax: number, originName: string, country: string }>();
  for (const r of filtered) {
    const info = getAirportInfo(r.origin);
    const key = info.code;
    const existing = groups.get(key) || { pax: 0, originName: `${info.city} (${info.code})`, country: info.country };
    existing.pax += r.passengerTotal;
    groups.set(key, existing);
  }
  return Array.from(groups.entries())
    .map(([id, data]) => ({ id, label: data.originName, subLabel: data.country, value: data.pax }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// 5. Top 10 Hãng hàng không chở nhiều khách đến nhất
export function getTopAirlinesByPassengers(records: FlightLeg[], dir: "arrival" | "departure" | "all", limit = 10): RankingItem[] {
  const filtered = filterByDirection(records, dir);
  const groups = new Map<string, number>();
  for (const r of filtered) {
    groups.set(r.airline, (groups.get(r.airline) || 0) + r.passengerTotal);
  }
  return Array.from(groups.entries())
    .map(([airline, pax]) => ({ id: airline, label: airline, value: pax }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// 6. Top 10 Hãng hàng không vận chuyển Cargo/Bưu kiện nhiều nhất
export function getTopAirlinesByCargo(records: FlightLeg[], dir: "arrival" | "departure" | "all", limit = 10): RankingItem[] {
  const filtered = filterByDirection(records, dir);
  const groups = new Map<string, number>();
  for (const r of filtered) {
    groups.set(r.airline, (groups.get(r.airline) || 0) + r.cargoKg + r.parcelKg);
  }
  return Array.from(groups.entries())
    .map(([airline, kg]) => ({ id: airline, label: airline, value: kg }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// 7. Top Hãng hàng không có tỷ lệ lấp đầy tốt nhất
export function getTopAirlinesByOccupancy(records: FlightLeg[], dir: "arrival" | "departure" | "all", limit = 5, minFlights = 3): RankingItem[] {
  const filtered = filterByDirection(records, dir);
  const groups = new Map<string, { totalPax: number, totalCap: number, flights: number }>();
  for (const r of filtered) {
    const existing = groups.get(r.airline) || { totalPax: 0, totalCap: 0, flights: 0 };
    const cap = getAircraftCapacity(r.aircraftType);
    if (cap) {
      existing.totalPax += (r.adult + r.child);
      existing.totalCap += cap;
      existing.flights += 1;
    }
    groups.set(r.airline, existing);
  }
  return Array.from(groups.entries())
    .filter(([_, data]) => data.flights >= minFlights && data.totalCap > 0)
    .map(([airline, data]) => ({ 
      id: airline, 
      label: airline, 
      value: (data.totalPax / data.totalCap) * 100,
      secondaryValue: data.flights 
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// 8. Top 10 Tỉnh/Thành phố nội địa đóng góp nhiều khách đến nhất
export function getTopProvincesByPassengers(records: FlightLeg[], dir: "arrival" | "departure" | "all", limit = 10): RankingItem[] {
  const filtered = filterByDirection(records, dir).filter(r => {
    return getAirportInfo(r.origin).country === "Vietnam";
  });
  const groups = new Map<string, number>();
  for (const r of filtered) {
    const province = getAirportInfo(r.origin).province || "Khác";
    groups.set(province, (groups.get(province) || 0) + r.passengerTotal);
  }
  return Array.from(groups.entries())
    .map(([province, pax]) => ({ id: province, label: province, value: pax }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

// 9. Top 10 Ngày cao điểm nhất
export function getTopDaysByFlights(records: FlightLeg[], dir: "arrival" | "departure" | "all", limit = 10): RankingItem[] {
  const filtered = filterByDirection(records, dir);
  const groups = new Map<string, number>();
  for (const r of filtered) {
    groups.set(r.reportDate, (groups.get(r.reportDate) || 0) + 1);
  }
  return Array.from(groups.entries())
    .map(([date, flights]) => ({ id: date, label: formatDate(date), value: flights }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}
