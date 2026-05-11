// tools/EmpathyEngineComposeBriefTool.ts
//
// [Agent 3 of 3] Empathy Engine
// Reads conditions and reports from the server-side cache (stored by
// Navigator). Accepts the Pharmacist's translated medications as a single
// short argument. Returns composition instructions for the final brief.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Request } from "express";
import { z } from "zod";
import { IMcpTool } from "../IMcpTool";
import { FhirUtilities } from "../fhir-utilities";
import { McpUtilities } from "../mcp-utilities";
import { getPatientData } from "../pipeline-state";

export const EmpathyEngineComposeBriefToolInstance: IMcpTool = {
  registerTool: (server: McpServer, req: Request) => {
    server.tool(
      "empathy_engine_compose_brief",
      `[STEP 3 — Empathy Engine Agent] MUST be called after BOTH step 1
       (clinical_navigator_fetch_data) AND step 2
       (pharmacist_translate_medications). Will REJECT otherwise. Composes
       the final patient discharge brief.`,
      {
        translated_medications: z
          .string()
          .describe("The Pharmacist's plain-English medication translations."),
      },
      async ({ translated_medications }) => {
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
            "REJECTED: You must call clinical_navigator_fetch_data FIRST, " +
              "then pharmacist_translate_medications SECOND, before calling " +
              "this tool. Start from step 1.",
            { isError: true },
          );
        }

        const conditions =
          cached.conditions.length > 0
            ? cached.conditions.join("; ")
            : "See patient's clinical note for conditions.";
        const reports =
          cached.reports.length > 0
            ? cached.reports.join("; ")
            : "No diagnostic reports available.";

        const output =
          "EMPATHY ENGINE — COMPOSE DISCHARGE BRIEF:\n" +
          "Write at 6th-grade level. Short sentences. No jargon.\n\n" +
          "SECTIONS:\n" +
          "1. 👋 Welcome Home (warm greeting)\n" +
          "2. 🏥 Why You Were Here (conditions in simple terms)\n" +
          "3. 💊 Your Medications (use translated list below)\n" +
          "4. 📋 What Your Tests Showed (reports in plain terms)\n" +
          "5. 🏠 Taking Care of Yourself (3-5 tips)\n" +
          "6. ⚠️ When to Call Your Doctor (specific signs)\n" +
          "7. 💙 Note from Your Care Team (encouraging close)\n\n" +
          `CONDITIONS: ${conditions}\n\n` +
          `REPORTS: ${reports}\n\n` +
          `TRANSLATED MEDICATIONS:\n${translated_medications}`;

        return McpUtilities.createTextResponse(output);
      },
    );
  },
};
