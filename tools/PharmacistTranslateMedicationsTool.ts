// tools/PharmacistTranslateMedicationsTool.ts
//
// [Agent 2 of 3] Pharmacist
// Reads medication data from the server-side cache (stored by Navigator),
// builds compact translation instructions, and returns them. The LLM does
// NOT need to pass any medication data as arguments — zero data echoing.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Request } from "express";
import { IMcpTool } from "../IMcpTool";
import { FhirUtilities } from "../fhir-utilities";
import { McpUtilities } from "../mcp-utilities";
import { getPatientData } from "../pipeline-state";

export const PharmacistTranslateMedicationsToolInstance: IMcpTool = {
  registerTool: (server: McpServer, req: Request) => {
    server.tool(
      "pharmacist_translate_medications",
      `[STEP 2 — Pharmacist Agent] MUST be called after
       clinical_navigator_fetch_data. Will REJECT otherwise. Reads the
       medication data from step 1 and provides translation instructions.
       No arguments needed.`,
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
            "Error: No data in cache. Call clinical_navigator_fetch_data first.",
            { isError: true },
          );
        }

        // Medications stay in cache — do NOT return them here.
        // Returning raw medication data bloats the LLM context and causes
        // the output token budget to be exhausted before the Empathy Engine
        // can be called. The Empathy Engine reads medications from cache directly.
        const medCount = cached.medications.length;
        const output =
          medCount === 0
            ? "Pharmacist: No structured medications found in FHIR. " +
              "The Empathy Engine will use any medication context from the " +
              "patient's clinical note. Call empathy_engine_compose_brief next."
            : `Pharmacist: ${medCount} medication(s) staged for translation. ` +
              "The Empathy Engine will provide translation rules and the " +
              "medication list. Call empathy_engine_compose_brief next.";

        return McpUtilities.createTextResponse(output);
      },
    );
  },
};
