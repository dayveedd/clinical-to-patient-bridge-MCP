// pipeline-state.ts
//
// Module-level in-memory cache for passing data between the 3 agent tools
// within a discharge workflow WITHOUT requiring the LLM to echo data as
// tool call arguments (which exhausts PO's output token budget).

export interface CachedPatientData {
  patientName: string;
  conditions: string[];
  medications: string[];
  reports: string[];
  translatedMedications: string[];  // Filled by Pharmacist server-side
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

const cache = new Map<string, CachedPatientData>();

/** Store extracted clinical data for a patient. */
export function storePatientData(
  patientId: string,
  data: Omit<CachedPatientData, "timestamp">,
): void {
  cache.set(patientId, { ...data, timestamp: Date.now() });
}

/** Retrieve cached data. Returns null if missing or expired. */
export function getPatientData(
  patientId: string,
): CachedPatientData | null {
  const entry = cache.get(patientId);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(patientId);
    return null;
  }
  return entry;
}

/** Update translations in cache. */
export function storeTranslations(
  patientId: string,
  translations: string[],
): void {
  const entry = cache.get(patientId);
  if (entry) {
    entry.translatedMedications = translations;
  }
}

/** Clean up expired entries. */
export function pruneExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

setInterval(pruneExpiredEntries, 2 * 60 * 1000);
