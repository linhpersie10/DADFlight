import { collection, doc, getDocs, setDoc } from "firebase/firestore";
import { db } from "./firebase";
import { mergeDynamicAirports } from "./airportReference";
import type { AirportInfo } from "./types";

const COLLECTION_NAME = "dynamic_airports";
const PUBLIC_AIRPORTS_URL = "https://gist.githubusercontent.com/tdreyno/4278655/raw/7b0762c09b519f40397e4c3e100b097d861f5588/airports.json";

// Shared cache to avoid downloading the large JSON multiple times
let publicAirportsCache: any[] | null = null;

export async function loadDynamicAirports(): Promise<Record<string, AirportInfo>> {
  try {
    const snap = await getDocs(collection(db, COLLECTION_NAME));
    const dynamicAirports: Record<string, AirportInfo> = {};
    
    snap.forEach((docSnap) => {
      dynamicAirports[docSnap.id] = docSnap.data() as AirportInfo;
    });

    // Merge into our local memory dictionary
    mergeDynamicAirports(dynamicAirports);
    return dynamicAirports;
  } catch (error) {
    console.error("Error loading dynamic airports from Firestore:", error);
    return {};
  }
}

export async function saveDynamicAirport(airport: AirportInfo) {
  try {
    const docRef = doc(db, COLLECTION_NAME, airport.code);
    await setDoc(docRef, airport);
  } catch (error) {
    console.error(`Error saving airport ${airport.code} to Firestore:`, error);
  }
}

export async function autoDiscoverAirports(missingCodes: string[]): Promise<AirportInfo[]> {
  if (!missingCodes || missingCodes.length === 0) return [];
  
  try {
    if (!publicAirportsCache) {
      console.log("Downloading public airports dictionary for auto-discovery...");
      const response = await fetch(PUBLIC_AIRPORTS_URL);
      if (!response.ok) throw new Error("Failed to fetch public airports JSON");
      publicAirportsCache = await response.json();
    }
    
    const discovered: AirportInfo[] = [];
    const missingSet = new Set(missingCodes.map(c => c.toUpperCase()));
    
    for (const item of publicAirportsCache || []) {
      const code = (item.code || "").toUpperCase();
      if (missingSet.has(code)) {
        const newAirport: AirportInfo = {
          code: code,
          name: item.name || `${code} Airport`,
          city: item.city || item.state || "Unknown",
          province: item.state || item.city || "Unknown",
          country: item.country || "Unknown"
        };
        discovered.push(newAirport);
        missingSet.delete(code);
        if (missingSet.size === 0) break; // found all
      }
    }
    
    // Save discovered airports
    if (discovered.length > 0) {
      const dynamicMap: Record<string, AirportInfo> = {};
      for (const airport of discovered) {
        dynamicMap[airport.code] = airport;
        await saveDynamicAirport(airport);
      }
      // Instantly merge to local dict
      mergeDynamicAirports(dynamicMap);
    }
    
    return discovered;
  } catch (error) {
    console.error("Auto-discovery failed:", error);
    return [];
  }
}
