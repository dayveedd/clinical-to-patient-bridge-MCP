// pipeline-state.ts
//
// Module-level in-memory cache for passing data between the 3 agent tools
// within a discharge workflow WITHOUT requiring the LLM to echo data as
// tool call arguments (which exhausts PO's output token budget).
//
// Flow:
//   1. Navigator fetches FHIR data → stores in cache → returns short summary
//   2. Pharmacist reads meds from cache → returns compact instructions
//   3. Empathy Engine reads all data from cache → returns brief instructions
//
// Cache entries auto-expire after 5 minutes to prevent stale data.

export interface CachedPatientData {
  conditions: string[];
  medications: string[];
  reports: string[];
  pharmacistTranslation?: string;  // Set by Chief Resident via Empathy Engine arg
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

/** Clean up expired entries (called periodically). */
export function pruneExpiredEntries(): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

// Prune every 2 minutes
setInterval(pruneExpiredEntries, 2 * 60 * 1000);
