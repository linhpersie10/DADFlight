import { readSheet } from "read-excel-file/browser";
import type { Direction, FlightDataset, FlightLeg, ReportMeta } from "./types";

type Cell = string | number | boolean | Date | null | undefined;
type Row = Cell[];

const DAD = "DAD";

const COL = {
  airlineOrStt: 1,
  date: 2,
  flightNo: 4,
  aircraft: 6,
  route: 8,
  depTotal: 10,
  depAdult: 13,
  depChild: 15,
  depInfant: 16,
  transferAdult: 17,
  transferChild: 19,
  transferInfant: 20,
  payableAdult: 21,
  payableChild: 22,
  arrTotal: 23,
  arrAdult: 24,
  arrChild: 26,
  arrInfant: 27,
  depBaggage: 28,
  depParcel: 30,
  depCargo: 33,
  depTransit: 34,
  arrBaggage: 36,
  arrParcel: 37,
  arrCargo: 38,
  arrTransit: 39,
};

const MONTHS: Record<string, string> = {
  jan: "01",
  feb: "02",
  mar: "03",
  apr: "04",
  may: "05",
  jun: "06",
  jul: "07",
  aug: "08",
  sep: "09",
  oct: "10",
  nov: "11",
  dec: "12",
};

function text(value: Cell): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function numberValue(value: Cell): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value.replace(/,/g, ""));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function metric(row: Row, index: number): number {
  return numberValue(row[index]) ?? 0;
}

function nullableMetric(row: Row, index: number): number | null {
  return numberValue(row[index]);
}

function parseReportDate(value: Cell): string {
  if (value instanceof Date) {
    // Sử dụng getUTCFullYear, getUTCMonth, getUTCDate vì read-excel-file parse date dưới dạng UTC
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, "0");
    const d = String(value.getUTCDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  const raw = text(value);
  const compact = raw.match(/^(\d{1,2})([A-Za-z]{3})(\d{4})$/);
  if (compact) {
    const [, d, monthText, y] = compact;
    const month = MONTHS[monthText.toLowerCase()];
    if (month) return `${y}-${month}-${d.padStart(2, "0")}`;
  }
  const dashed = raw.match(/(\d{1,2})-(\d{1,2})-(\d{4})/);
  if (dashed) {
    const [, d, m, y] = dashed;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  const slashed = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slashed) {
    const [, d, m, y] = slashed;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 10);
}

function rowHasMetrics(row: Row): boolean {
  return [
    COL.depTotal,
    COL.depAdult,
    COL.depChild,
    COL.depInfant,
    COL.arrTotal,
    COL.arrAdult,
    COL.arrChild,
    COL.arrInfant,
    COL.depBaggage,
    COL.arrBaggage,
  ].some((index) => numberValue(row[index]) !== null);
}

function parseMeta(rows: Row[]): ReportMeta {
  return {
    title: text(rows[3]?.[11]) || "Bao cao tong hop tinh hinh phuc vu chuyen bay",
    airportName: text(rows[1]?.[14]) || "Cang hang khong",
    dateRangeText: text(rows[6]?.[12]),
    printDateText: text(rows[1]?.[35]),
    airlineFilter: text(rows[7]?.[3]) || "Tat ca",
  };
}

function expandFlightPart(part: string, firstPart: string, airline: string): string {
  const cleanPart = part.trim().toUpperCase();
  const cleanAirline = airline.trim().toUpperCase();
  const cleanFirst = firstPart.trim().toUpperCase();

  if (!cleanPart) return cleanFirst;
  if (cleanPart.startsWith(cleanAirline)) return cleanPart;
  if (!/^\d+$/.test(cleanPart)) return `${cleanAirline}${cleanPart}`;

  const firstNumber = cleanFirst.startsWith(cleanAirline)
    ? cleanFirst.slice(cleanAirline.length)
    : cleanFirst.replace(/^[A-Z]+/g, "");

  if (/^\d+$/.test(firstNumber) && cleanPart.length <= 2 && firstNumber.length > cleanPart.length) {
    return `${cleanAirline}${firstNumber.slice(0, firstNumber.length - cleanPart.length)}${cleanPart}`;
  }

  return `${cleanAirline}${cleanPart}`;
}

function splitFlightNumbers(originalFlightNo: string, airline: string): [string, string] {
  const parts = originalFlightNo.split("-").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) {
    const single = expandFlightPart(originalFlightNo, originalFlightNo, airline);
    return [single, single];
  }
  return [expandFlightPart(parts[0], parts[0], airline), expandFlightPart(parts[1], parts[0], airline)];
}

function makeLeg(
  row: Row,
  sourceRow: number,
  reportDate: string,
  airline: string,
  originalFlightNo: string,
  flightNo: string,
  aircraftType: string,
  originalRoute: string,
  origin: string,
  destination: string,
  direction: Direction,
): FlightLeg {
  const isDeparture = direction === "departure";
  const route = `${origin}-${destination}`;
  return {
    id: `${reportDate}-${sourceRow}-${direction}-${flightNo}-${route}`,
    sourceRow,
    reportDate,
    airline,
    originalFlightNo,
    flightNo,
    aircraftType,
    originalRoute,
    route,
    origin,
    destination,
    marketAirport: isDeparture ? destination : origin,
    direction,
    passengerTotal: metric(row, isDeparture ? COL.depTotal : COL.arrTotal),
    adult: metric(row, isDeparture ? COL.depAdult : COL.arrAdult),
    child: metric(row, isDeparture ? COL.depChild : COL.arrChild),
    infant: metric(row, isDeparture ? COL.depInfant : COL.arrInfant),
    transferAdult: isDeparture ? nullableMetric(row, COL.transferAdult) : null,
    transferChild: isDeparture ? nullableMetric(row, COL.transferChild) : null,
    transferInfant: isDeparture ? nullableMetric(row, COL.transferInfant) : null,
    payableAdult: isDeparture ? nullableMetric(row, COL.payableAdult) : null,
    payableChild: isDeparture ? nullableMetric(row, COL.payableChild) : null,
    baggageKg: metric(row, isDeparture ? COL.depBaggage : COL.arrBaggage),
    parcelKg: metric(row, isDeparture ? COL.depParcel : COL.arrParcel),
    cargoKg: metric(row, isDeparture ? COL.depCargo : COL.arrCargo),
    transitKg: nullableMetric(row, isDeparture ? COL.depTransit : COL.arrTransit),
  };
}

function buildLegs(row: Row, sourceRow: number, airline: string, reportDate: string, warnings: string[]): FlightLeg[] {
  const originalFlightNo = text(row[COL.flightNo]);
  const originalRoute = text(row[COL.route]).toUpperCase();
  const aircraftType = text(row[COL.aircraft]).toUpperCase();
  const parts = originalRoute.split("-").map((part) => part.trim()).filter(Boolean);
  const [arrivalFlightNo, departureFlightNo] = splitFlightNumbers(originalFlightNo, airline);

  if (parts.length === 3 && parts[1] === DAD) {
    return [
      makeLeg(row, sourceRow, reportDate, airline, originalFlightNo, arrivalFlightNo, aircraftType, originalRoute, parts[0], DAD, "arrival"),
      makeLeg(row, sourceRow, reportDate, airline, originalFlightNo, departureFlightNo, aircraftType, originalRoute, DAD, parts[2], "departure"),
    ];
  }

  if (parts.length === 2 && parts[1] === DAD) {
    return [makeLeg(row, sourceRow, reportDate, airline, originalFlightNo, arrivalFlightNo, aircraftType, originalRoute, parts[0], DAD, "arrival")];
  }

  if (parts.length === 2 && parts[0] === DAD) {
    return [makeLeg(row, sourceRow, reportDate, airline, originalFlightNo, departureFlightNo, aircraftType, originalRoute, DAD, parts[1], "departure")];
  }

  warnings.push(`Dong ${sourceRow}: khong nhan dien duoc chang bay "${originalRoute}".`);
  return [];
}

export async function parseFlightExcel(file: File): Promise<FlightDataset> {
  const rows = (await readSheet(file)) as Row[];
  if (!rows.length) throw new Error("File Excel khong co du lieu.");
  const meta = parseMeta(rows);
  const warnings: string[] = [];
  const records: FlightLeg[] = [];
  let currentAirline = "";
  let sourceFlightRows = 0;
  let reportDate = "";

  for (let index = 13; index < rows.length; index += 1) {
    const row = rows[index] ?? [];
    const sourceRow = index + 1;
    const marker = text(row[COL.airlineOrStt]);

    if (marker === "Total") break;

    if (marker.startsWith("H") && marker.includes("HK:")) {
      currentAirline = marker.split(":")[1]?.trim().toUpperCase() ?? "";
      continue;
    }

    const stt = numberValue(row[COL.airlineOrStt]);
    if (stt === null || !currentAirline || !rowHasMetrics(row)) continue;

    sourceFlightRows += 1;
    const rowDate = parseReportDate(row[COL.date]);
    if (!reportDate) reportDate = rowDate;
    records.push(...buildLegs(row, sourceRow, currentAirline, rowDate, warnings));
  }

  if (!records.length) {
    throw new Error("Khong tim thay dong chuyen bay hop le trong file Excel.");
  }

  const datasetDate = reportDate || records[0].reportDate;
  return {
    id: datasetDate,
    reportDate: datasetDate,
    fileName: file.name,
    importedAt: new Date().toISOString(),
    meta,
    sourceFlightRows,
    legCount: records.length,
    records,
    warnings,
  };
}
