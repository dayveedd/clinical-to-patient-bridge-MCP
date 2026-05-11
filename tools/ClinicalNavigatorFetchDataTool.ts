// tools/ClinicalNavigatorFetchDataTool.ts
//
// [Agent 1 of 3] Clinical Navigator
// Fetches FHIR data server-side, caches it, and returns a response that
// FORCES the LLM to write a message to the user before calling the next tool.
// This breaks PO's parallel tool-batching behavior and keeps the flow sequential.

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
      const name = r.code?.coding?.[0]?.display || r.code?.text || "Unknown";
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
      const parts = [name];
      if (dosageText) parts.push(dosageText);
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
      const type = r.code?.coding?.[0]?.display || r.code?.text || "Report";
      const conclusion = r.conclusion || "";
      return conclusion ? `${type}: ${conclusion}` : type;
    });
}

function extractPatientName(patient: any): string {
  if (!patient?.name?.length) return "the patient";
  const n = patient.name[0];
  const given = n.given?.join(" ") || "";
  const family = n.family || "";
  return `${given} ${family}`.trim() || "the patient";
}

export const ClinicalNavigatorFetchDataToolInstance: IMcpTool = {
  registerTool: (server: McpServer, req: Request) => {
    server.tool(
      "clinical_navigator_fetch_data",
      "[STEP 1] Clinical Navigator. Fetches this patient's clinical data. Call first.",
      {},
      async () => {
        const patientId = FhirUtilities.getPatientIdIfContextExists(req);
        if (!patientId) {
          return McpUtilities.createTextResponse(
            "Error: No patient context.",
            { isError: true },
          );
        }

        try {
          // Parallel FHIR calls with 8-second timeout each
          const timeout = (ms: number) =>
            new Promise<null>((resolve) => setTimeout(() => resolve(null), ms));

          const withTimeout = <T>(p: Promise<T | null>) =>
            Promise.race([p, timeout(8000)]) as Promise<T | null>;

          const [
            patientResource,
            conditionsBundle,
            reportsBundle,
            medRequestsBundle,
            medStatementsBundle,
          ] = await Promise.all([
            withTimeout(FhirClientInstance.read(req, `Patient/${patientId}`)),
            withTimeout(FhirClientInstance.search(req, "Condition", [`patient=${patientId}`])),
            withTimeout(FhirClientInstance.search(req, "DiagnosticReport", [`patient=${patientId}`])),
            withTimeout(FhirClientInstance.search(req, "MedicationRequest", [`patient=${patientId}`])),
            withTimeout(FhirClientInstance.search(req, "MedicationStatement", [`patient=${patientId}`])),
          ]);

          const patientName = extractPatientName(patientResource);
          const conditions = extractConditions(conditionsBundle);
          const medications = [
            ...extractMedications(medRequestsBundle, "Rx"),
            ...extractMedications(medStatementsBundle, "Hx"),
          ];
          const reports = extractReports(reportsBundle);

          storePatientData(patientId, {
            patientName,
            conditions,
            medications,
            reports,
            translatedMedications: [],
          });

          // This response INSTRUCTS the LLM to write a message to the user
          // before calling the next tool. This forces PO into sequential mode.
          return McpUtilities.createTextResponse(
            `NAVIGATOR_RESULT: ${patientName} | ` +
            `${conditions.length} condition(s) | ` +
            `${medications.length} medication(s) | ` +
            `${reports.length} report(s)\n\n` +
            `SAY TO USER: "I have retrieved ${patientName}'s medical records. ` +
            `Now consulting the Pharmacist to translate the medications..."\n\n` +
            `THEN CALL: pharmacist_translate_medications`
          );
        } catch (error) {
          console.error("[clinical_navigator] Error:", error);
          return McpUtilities.createTextResponse(
            `Error fetching clinical data: ${error}`,
            { isError: true },
          );
        }
      },
    );
  },
};
