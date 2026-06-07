import type { AirportInfo } from "./types";

const AIRPORTS: Record<string, AirportInfo> = {
  ALA: { code: "ALA", name: "Almaty International Airport", city: "Almaty", province: "Almaty", country: "Kazakhstan" },
  BKK: { code: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok", province: "Bangkok", country: "Thailand" },
  BMV: { code: "BMV", name: "Buon Ma Thuot Airport", city: "Buon Ma Thuot", province: "Dak Lak", country: "Vietnam" },
  CJJ: { code: "CJJ", name: "Cheongju International Airport", city: "Cheongju", province: "North Chungcheong", country: "South Korea" },
  CXR: { code: "CXR", name: "Cam Ranh International Airport", city: "Cam Ranh", province: "Khanh Hoa", country: "Vietnam" },
  DAD: { code: "DAD", name: "Da Nang International Airport", city: "Da Nang", province: "Da Nang", country: "Vietnam" },
  DMK: { code: "DMK", name: "Don Mueang International Airport", city: "Bangkok", province: "Bangkok", country: "Thailand" },
  HAN: { code: "HAN", name: "Noi Bai International Airport", city: "Ha Noi", province: "Ha Noi", country: "Vietnam" },
  HKG: { code: "HKG", name: "Hong Kong International Airport", city: "Hong Kong", province: "Hong Kong", country: "Hong Kong" },
  HKT: { code: "HKT", name: "Phuket International Airport", city: "Phuket", province: "Phuket", country: "Thailand" },
  HPH: { code: "HPH", name: "Cat Bi International Airport", city: "Hai Phong", province: "Hai Phong", country: "Vietnam" },
  ICN: { code: "ICN", name: "Incheon International Airport", city: "Seoul", province: "Incheon", country: "South Korea" },
  KHH: { code: "KHH", name: "Kaohsiung International Airport", city: "Kaohsiung", province: "Kaohsiung", country: "Taiwan" },
  KHV: { code: "KHV", name: "Khabarovsk Novy Airport", city: "Khabarovsk", province: "Khabarovsk Krai", country: "Russia" },
  KUL: { code: "KUL", name: "Kuala Lumpur International Airport", city: "Kuala Lumpur", province: "Selangor", country: "Malaysia" },
  MFM: { code: "MFM", name: "Macau International Airport", city: "Macau", province: "Macau", country: "Macau" },
  MNL: { code: "MNL", name: "Ninoy Aquino International Airport", city: "Manila", province: "Metro Manila", country: "Philippines" },
  NQZ: { code: "NQZ", name: "Nursultan Nazarbayev International Airport", city: "Astana", province: "Astana", country: "Kazakhstan" },
  NRT: { code: "NRT", name: "Narita International Airport", city: "Tokyo", province: "Chiba", country: "Japan" },
  PQC: { code: "PQC", name: "Phu Quoc International Airport", city: "Phu Quoc", province: "Kien Giang", country: "Vietnam" },
  PUS: { code: "PUS", name: "Gimhae International Airport", city: "Busan", province: "Busan", country: "South Korea" },
  RGN: { code: "RGN", name: "Yangon International Airport", city: "Yangon", province: "Yangon", country: "Myanmar" },
  SAI: { code: "SAI", name: "Siem Reap Angkor International Airport", city: "Siem Reap", province: "Siem Reap", country: "Cambodia" },
  SGN: { code: "SGN", name: "Tan Son Nhat International Airport", city: "Ho Chi Minh City", province: "Ho Chi Minh City", country: "Vietnam" },
  SIN: { code: "SIN", name: "Changi Airport", city: "Singapore", province: "Singapore", country: "Singapore" },
  SVO: { code: "SVO", name: "Sheremetyevo International Airport", city: "Moscow", province: "Moscow", country: "Russia" },
  TPE: { code: "TPE", name: "Taiwan Taoyuan International Airport", city: "Taipei", province: "Taoyuan", country: "Taiwan" },
  VTE: { code: "VTE", name: "Wattay International Airport", city: "Vientiane", province: "Vientiane", country: "Laos" },
  XSP: { code: "XSP", name: "Seletar Airport", city: "Singapore", province: "Singapore", country: "Singapore" },
  ZNZ: { code: "ZNZ", name: "Abeid Amani Karume International Airport", city: "Zanzibar", province: "Zanzibar", country: "Tanzania" },
};

export function getAirportInfo(code: string): AirportInfo {
  const normalized = code.trim().toUpperCase();
  return (
    AIRPORTS[normalized] ?? {
      code: normalized,
      name: normalized,
      city: "Chua xac dinh",
      province: "Chua xac dinh",
      country: "Chua xac dinh",
    }
  );
}

export function formatAirport(code: string): string {
  const airport = getAirportInfo(code);
  return `${airport.code} - ${airport.city}`;
}
