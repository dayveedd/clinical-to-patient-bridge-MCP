// tools/EmpathyEngineComposeBriefTool.ts
//
// [Agent 3 of 3] Empathy Engine
// Reads ALL data from cache (conditions, translated medications, reports,
// patient name) and generates the FULL discharge brief SERVER-SIDE.
// Returns the complete brief as the tool response — the LLM just displays it.
// This means the LLM only needs ~10 output tokens for the tool call itself.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Request } from "express";
import { IMcpTool } from "../IMcpTool";
import { FhirUtilities } from "../fhir-utilities";
import { McpUtilities } from "../mcp-utilities";
import { getPatientData } from "../pipeline-state";

function simplifyCondition(condition: string): string {
  // Remove the (active/inactive) status for patient-facing text
  return condition.replace(/\s*\(active\)/gi, "")
                  .replace(/\s*\(inactive\)/gi, "")
                  .replace(/\s*\(resolved\)/gi, "")
                  .trim();
}

function generateBrief(
  patientName: string,
  conditions: string[],
  medications: string[],
  reports: string[],
): string {
  const condList = conditions.length > 0
    ? conditions.map(simplifyCondition).map(c => `  • ${c}`).join("\n")
    : "  • Your care team will discuss your conditions with you.";

  const medList = medications.length > 0
    ? medications.map((m, i) => `  ${i + 1}. ${m}`).join("\n")
    : "  • No medications were recorded. Check with your doctor.";

  const reportList = reports.length > 0
    ? reports.map(r => `  • ${r}`).join("\n")
    : "  • No test results to report at this time.";

  return [
    `# Discharge Instructions`,
    ``,
    `## 👋 Welcome Home`,
    `Welcome back home, ${patientName}! We are so glad you are feeling better.`,
    `This letter explains what happened during your hospital stay and how to`,
    `take care of yourself at home. Please read it carefully.`,
    ``,
    `## 🏥 Why You Were Here`,
    `You were in the hospital because of these health issues:`,
    condList,
    ``,
    `## 💊 Your Medications`,
    `Here are the medications you need to take. Please follow the instructions exactly:`,
    medList,
    ``,
    `## 📋 What Your Tests Showed`,
    reportList,
    ``,
    `## 🏠 Taking Care of Yourself`,
    `  • Take all your medications as described above.`,
    `  • Drink plenty of water and eat healthy meals.`,
    `  • Get plenty of rest, but try short walks when you feel up to it.`,
    `  • Keep all your follow-up appointments.`,
    `  • Ask a family member or friend to help you during recovery.`,
    ``,
    `## ⚠️ When to Call Your Doctor`,
    `Call your doctor right away if you notice:`,
    `  • Fever above 101°F (38.3°C)`,
    `  • Sudden shortness of breath or chest pain`,
    `  • Severe pain that does not go away`,
    `  • Swelling, redness, or warmth at any wound site`,
    `  • Any new symptoms that worry you`,
    ``,
    `## 💙 A Note from Your Care Team`,
    `${patientName}, we are proud of how strong you have been. Recovery takes`,
    `time, so please be patient with yourself. We are here for you every step`,
    `of the way. Do not hesitate to call us if you need anything at all.`,
    ``,
    `Wishing you a smooth and speedy recovery! 💛`,
  ].join("\n");
}

export const EmpathyEngineComposeBriefToolInstance: IMcpTool = {
  registerTool: (server: McpServer, req: Request) => {
    server.tool(
      "empathy_engine_compose_brief",
      "[STEP 3] Empathy Engine Agent. MUST be called after steps 1 and 2. " +
        "Generates the final patient discharge brief. " +
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
            "REJECTED: Call clinical_navigator_fetch_data first, " +
              "then pharmacist_translate_medications. Start from step 1.",
            { isError: true },
          );
        }

        const brief = generateBrief(
          cached.patientName,
          cached.conditions,
          cached.translatedMedications.length > 0
            ? cached.translatedMedications
            : cached.medications,
          cached.reports,
        );

        return McpUtilities.createTextResponse(brief);
      },
    );
  },
};
