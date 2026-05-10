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

        if (cached.medications.length === 0) {
          return McpUtilities.createTextResponse(
            "No structured medications found in FHIR. The Pharmacist will " +
              "rely on the patient's uploaded clinical note. Check the " +
              "conversation context for any medication mentions and translate " +
              "them using these rules:\n" +
              "PO=by mouth, IV=IV line, BID=twice daily, TID=3x daily, " +
              "Q6H=every 6h, Q8H=every 8h, PRN=as needed.\n" +
              "For each med: name, purpose, how to take, side effects, warning signs.\n\n" +
              "Call empathy_engine_compose_brief next.",
          );
        }

        const output =
          "PHARMACIST TRANSLATION INSTRUCTIONS:\n" +
          "Translate each medication below into plain English.\n" +
          "For each: name (generic+brand), purpose, how to take " +
          "(PO=by mouth, IV=IV line, BID=2x/day, TID=3x/day, " +
          "Q6H=every 6h, Q8H=every 8h, PRN=as needed), " +
          "side effects (2-3), warning signs.\n\n" +
          "MEDICATIONS:\n" +
          cached.medications.map((m, i) => `${i + 1}. ${m}`).join("\n") +
          "\n\nINSTRUCTION FOR YOU (THE LLM): Tell the user 'Now, I will translate the medications and compose the final brief.' in a short message, and then IMMEDIATELY call the empathy_engine_compose_brief tool.";

        return McpUtilities.createTextResponse(output);
      },
    );
  },
};
