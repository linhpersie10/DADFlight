import { getAirportInfo } from "./airportReference";
import type { DashboardFilters, FlightLeg, SummaryRow } from "./types";

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
      groups.set(record.airline, blankSummary(record.airline, record.airline, "Hang hang khong"));
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
