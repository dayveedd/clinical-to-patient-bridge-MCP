// tools/PharmacistTranslateMedicationsTool.ts
//
// [Agent 2 of 3] Pharmacist
// Reads medication data from cache, translates clinical abbreviations
// into plain English SERVER-SIDE (no LLM needed), stores translations
// in cache, returns a SHORT confirmation.
// This means zero data enters or exits the LLM for this step.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Request } from "express";
import { IMcpTool } from "../IMcpTool";
import { FhirUtilities } from "../fhir-utilities";
import { McpUtilities } from "../mcp-utilities";
import { getPatientData, storeTranslations } from "../pipeline-state";

// Abbreviation → plain English mapping
const ABBR_MAP: Record<string, string> = {
  "PO": "by mouth",
  "IV": "by IV (intravenous line)",
  "IM": "by injection",
  "SC": "by injection under the skin",
  "SQ": "by injection under the skin",
  "BID": "twice a day",
  "TID": "three times a day",
  "QID": "four times a day",
  "QD": "once a day",
  "QHS": "at bedtime",
  "Q4H": "every 4 hours",
  "Q6H": "every 6 hours",
  "Q8H": "every 8 hours",
  "Q12H": "every 12 hours",
  "PRN": "as needed",
  "AC": "before meals",
  "PC": "after meals",
  "STAT": "immediately",
  "tab": "tablet",
  "tabs": "tablets",
  "cap": "capsule",
  "caps": "capsules",
  "mg": "mg",
  "mL": "mL",
  "mcg": "micrograms",
};

function translateDosage(raw: string): string {
  let translated = raw;
  // Replace abbreviations (longest first to avoid partial matches)
  const sorted = Object.keys(ABBR_MAP).sort((a, b) => b.length - a.length);
  for (const abbr of sorted) {
    const regex = new RegExp(`\\b${abbr}\\b`, "gi");
    const replacement = ABBR_MAP[abbr];
    if (replacement) {
      translated = translated.replace(regex, replacement);
    }
  }
  return translated;
}

function translateMedication(raw: string): string {
  // raw format: "Name — Dosage Text — (Route) — [Label]"
  const parts = raw.split(" — ");
  const name = parts[0] || "Unknown medication";
  const dosage = parts.length > 1 ? translateDosage(parts[1]!) : "";
  const route = parts.length > 2 ? translateDosage(parts[2]!) : "";

  let result = `${name}`;
  if (dosage) result += ` — ${dosage}`;
  if (route && !route.includes("[")) result += ` ${route}`;
  return result;
}

export const PharmacistTranslateMedicationsToolInstance: IMcpTool = {
  registerTool: (server: McpServer, req: Request) => {
    server.tool(
      "pharmacist_translate_medications",
      "[STEP 2] Pharmacist Agent. MUST be called after step 1. " +
        "Translates medications into plain English. " +
        "No arguments needed.",
      {},
      async () => {
        const patientId = FhirUtilities.getPatientIdIfContextExists(req);
        if (!patientId) {
          return McpUtilities.createTextResponse(
            "Error: No patient context.",
            { isError: true },
          );
        }

        const cached = getPatientData(patientId);

        if (!cached) {
          return McpUtilities.createTextResponse(
            "Error: Call clinical_navigator_fetch_data first.",
            { isError: true },
          );
        }

        if (cached.medications.length === 0) {
          storeTranslations(patientId, []);
          return McpUtilities.createTextResponse(
            "Pharmacist: No medications found. " +
              "Call empathy_engine_compose_brief next.",
          );
        }

        // Translate server-side — LLM never sees raw med data
        const translations = cached.medications.map(translateMedication);
        storeTranslations(patientId, translations);

        return McpUtilities.createTextResponse(
          `Pharmacist: Translated ${translations.length} medication(s) ` +
            "into plain English. Call empathy_engine_compose_brief next.",
        );
      },
    );
  },
};
