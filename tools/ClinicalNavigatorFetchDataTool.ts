// tools/ClinicalNavigatorFetchDataTool.ts
//
// [Agent 1 of 3] Clinical Navigator
// Fetches FHIR data, extracts relevant fields, stores in server-side cache,
// and returns a SHORT summary to the LLM. The Pharmacist and Empathy Engine
// read from the cache — the LLM never has to echo this data.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp";
import { Request } from "express";
import { IMcpTool } from "../IMcpTool";
import { FhirClientInstance } from "../fhir-client";
import { FhirUtilities } from "../fhir-utilities";
import { McpUtilities } from "../mcp-utilities";
import { storePatientData } from "../pipeline-state";

function extractConditions(bundle: any): string[] {
  if (!bundle?.entry?.length) return [];
  return bundle.entry
    .filter((e: any) => e.resource)
    .map((e: any) => {
      const r = e.resource;
      const name =
        r.code?.coding?.[0]?.display || r.code?.text || "Unknown";
      const status = r.clinicalStatus?.coding?.[0]?.code || "";
      return status ? `${name} (${status})` : name;
    });
}

function extractMedications(bundle: any, label: string): string[] {
  if (!bundle?.entry?.length) return [];
  return bundle.entry
    .filter((e: any) => e.resource)
    .map((e: any) => {
      const r = e.resource;
      const name =
        r.medicationCodeableConcept?.coding?.[0]?.display ||
        r.medicationCodeableConcept?.text ||
        r.medicationReference?.display ||
        "Unknown medication";
      const dosage = r.dosageInstruction?.[0] || r.dosage?.[0];
      const dosageText = dosage?.text || "";
      const route =
        dosage?.route?.coding?.[0]?.display || dosage?.route?.text || "";
      const parts = [name];
      if (dosageText) parts.push(dosageText);
      if (route) parts.push(`(${route})`);
      parts.push(`[${label}]`);
      return parts.join(" — ");
    });
}

function extractReports(bundle: any): string[] {
  if (!bundle?.entry?.length) return [];
  return bundle.entry
    .filter((e: any) => e.resource)
    .map((e: any) => {
      const r = e.resource;
      const type =
        r.code?.coding?.[0]?.display || r.code?.text || "Unknown report";
      const conclusion = r.conclusion || "";
      return conclusion ? `${type}: ${conclusion}` : type;
    });
}

export const ClinicalNavigatorFetchDataToolInstance: IMcpTool = {
  registerTool: (server: McpServer, req: Request) => {
    server.tool(
      "clinical_navigator_fetch_data",
      `[STEP 1 — Clinical Navigator Agent] MANDATORY first step. Fetches
       all clinical data from the FHIR server. You MUST call this before
       any other discharge tool. The other tools will REJECT if this has
       not been called first. No arguments needed.`,
      {},
      async () => {
        const patientId = FhirUtilities.getPatientIdIfContextExists(req);

        if (!patientId) {
          return McpUtilities.createTextResponse(
            "Error: No patient context. Ensure SHARP token is present.",
            { isError: true },
          );
        }

        try {
          const [
            conditionsBundle,
            reportsBundle,
            medRequestsBundle,
            medStatementsBundle,
            medAdminsBundle,
          ] = await Promise.all([
            FhirClientInstance.search(req, "Condition", [
              `patient=${patientId}`,
            ]),
            FhirClientInstance.search(req, "DiagnosticReport", [
              `patient=${patientId}`,
            ]),
            FhirClientInstance.search(req, "MedicationRequest", [
              `patient=${patientId}`,
            ]),
            FhirClientInstance.search(req, "MedicationStatement", [
              `patient=${patientId}`,
            ]),
            FhirClientInstance.search(req, "MedicationAdministration", [
              `patient=${patientId}`,
            ]),
          ]);

          const conditions = extractConditions(conditionsBundle);
          const medications = [
            ...extractMedications(medRequestsBundle, "Rx"),
            ...extractMedications(medStatementsBundle, "Hx"),
            ...extractMedications(medAdminsBundle, "Admin"),
          ];
          const reports = extractReports(reportsBundle);

          // Store in server-side cache for Pharmacist & Empathy Engine
          storePatientData(patientId, { conditions, medications, reports });

          // Return a SHORT summary — the LLM does NOT need the raw data
          const summary =
            `Clinical Navigator fetched data for patient ${patientId}:\n` +
            `• ${conditions.length} condition(s) found\n` +
            `• ${medications.length} medication(s) found\n` +
            `• ${reports.length} diagnostic report(s) found\n\n` +
            (conditions.length + medications.length + reports.length === 0
              ? "⚠️ No structured FHIR data found. Use the patient's uploaded clinical note from the conversation context instead when calling the Pharmacist and Empathy Engine."
              : "Data is ready. Call pharmacist_translate_medications next.");

          return McpUtilities.createTextResponse(summary);
        } catch (error) {
          console.error("[clinical_navigator_fetch_data] Error:", error);
          return McpUtilities.createTextResponse(
            `Error fetching clinical data: ${error}`,
            { isError: true },
          );
        }
      },
    );
  },
};
