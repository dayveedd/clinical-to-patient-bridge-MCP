// tools/ClinicalNavigatorFetchDataTool.ts
//
// [Agent 1 of 3] Clinical Navigator
// Fetches FHIR data by patient ID (from SHARP JWT), extracts only relevant
// fields, and stores compact data in server-side cache. Also fetches the
// Patient resource to get the patient's name for the final brief.
// Returns a SHORT summary (~50 tokens) so the LLM can proceed quickly.

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

function extractPatientName(patientResource: any): string {
  if (!patientResource?.name?.length) return "Patient";
  const name = patientResource.name[0];
  const given = name.given?.join(" ") || "";
  const family = name.family || "";
  return `${given} ${family}`.trim() || "Patient";
}

export const ClinicalNavigatorFetchDataToolInstance: IMcpTool = {
  registerTool: (server: McpServer, req: Request) => {
    server.tool(
      "clinical_navigator_fetch_data",
      "[STEP 1] Clinical Navigator Agent. MANDATORY first step. " +
        "Fetches clinical data from the FHIR server. " +
        "Other tools will REJECT if this has not been called. " +
        "No arguments needed.",
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
            patientResource,
            conditionsBundle,
            reportsBundle,
            medRequestsBundle,
            medStatementsBundle,
            medAdminsBundle,
          ] = await Promise.all([
            FhirClientInstance.read(req, `Patient/${patientId}`),
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

          const patientName = extractPatientName(patientResource);
          const conditions = extractConditions(conditionsBundle);
          const medications = [
            ...extractMedications(medRequestsBundle, "Rx"),
            ...extractMedications(medStatementsBundle, "Hx"),
            ...extractMedications(medAdminsBundle, "Admin"),
          ];
          const reports = extractReports(reportsBundle);

          storePatientData(patientId, {
            patientName,
            conditions,
            medications,
            reports,
            translatedMedications: [],
          });

          const summary =
            `Navigator: Fetched data for ${patientName}. ` +
            `${conditions.length} condition(s), ` +
            `${medications.length} medication(s), ` +
            `${reports.length} report(s). ` +
            "Call pharmacist_translate_medications next.";

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
