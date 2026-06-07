import type { FlightDataset } from "./types";

const STORAGE_KEY = "dadflight.datasets.v1";

export function loadDatasets(): FlightDataset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as FlightDataset[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveDatasets(datasets: FlightDataset[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(datasets));
}
