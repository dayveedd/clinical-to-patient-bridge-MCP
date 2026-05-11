// tools/PharmacistTranslateMedicationsTool.ts
//
// [Agent 2 of 3] Pharmacist
// Translates medications server-side and returns a response that
// FORCES the LLM to write a message to the user before calling the Empathy Engine.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Request } from "express";
import { IMcpTool } from "../IMcpTool";
import { FhirUtilities } from "../fhir-utilities";
import { McpUtilities } from "../mcp-utilities";
import { getPatientData, storeTranslations } from "../pipeline-state";

const ABBR_MAP: Record<string, string> = {
  "PO": "by mouth",
  "IV": "intravenously",
  "IM": "by injection",
  "BID": "twice daily",
  "TID": "three times daily",
  "QID": "four times daily",
  "QD": "once daily",
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
};

function translateDosage(raw: string): string {
  let result = raw;
  const sorted = Object.keys(ABBR_MAP).sort((a, b) => b.length - a.length);
  for (const abbr of sorted) {
    const replacement = ABBR_MAP[abbr];
    if (replacement) {
      result = result.replace(new RegExp(`\\b${abbr}\\b`, "gi"), replacement);
    }
  }
  return result;
}

export const PharmacistTranslateMedicationsToolInstance: IMcpTool = {
  registerTool: (server: McpServer, req: Request) => {
    server.tool(
      "pharmacist_translate_medications",
      "[STEP 2] Pharmacist. Translates medications. Call after step 1.",
      {},
      async () => {
        const patientId = FhirUtilities.getPatientIdIfContextExists(req);
        if (!patientId) {
          return McpUtilities.createTextResponse(
            "Error: No patient context.", { isError: true }
          );
        }

        const cached = getPatientData(patientId);
        if (!cached) {
          return McpUtilities.createTextResponse(
            "Error: No data. Call clinical_navigator_fetch_data first.",
            { isError: true }
          );
        }

        const translations = cached.medications.length > 0
          ? cached.medications.map((m) => {
              const parts = m.split(" — ");
              const name = parts[0] || "Unknown";
              const dosage = parts[1] ? translateDosage(parts[1]) : "";
              return dosage ? `${name} — ${dosage}` : name;
            })
          : [];

        storeTranslations(patientId, translations);

        const medCount = translations.length;

        // Force LLM to write a message before calling Empathy Engine
        return McpUtilities.createTextResponse(
          `PHARMACIST_RESULT: ${medCount} medication(s) translated.\n\n` +
          `SAY TO USER: "The Pharmacist has translated ${medCount} medication(s) ` +
          `into plain English. Now the Empathy Engine will compose the discharge brief..."\n\n` +
          `THEN CALL: empathy_engine_compose_brief`
        );
      },
    );
  },
};
