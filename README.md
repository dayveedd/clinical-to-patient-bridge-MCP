# Clinical-to-Patient Bridge MCP Server

An MCP (Model Context Protocol) server that bridges clinical FHIR data to patient-friendly discharge summaries through a multi-agent orchestration pattern on the [Prompt Opinion](https://promptopinion.ai) platform.

## Architecture

The MCP server exposes three tools that represent specialized agent roles in a discharge workflow:

```
┌─────────────────────────────────────────────────────────┐
│  Prompt Opinion Platform (Chief Resident Agent)         │
│                                                         │
│  Step 1 → clinical_navigator_fetch_data                 │
│           Fetches FHIR data, caches server-side         │
│                                                         │
│  Step 2 → pharmacist_translate_medications              │
│           Reads meds from cache, returns instructions   │
│                                                         │
│  Step 3 → empathy_engine_compose_brief                  │
│           Reads from cache, composes discharge brief    │
│                                                         │
│  Output → Patient-facing discharge summary              │
│           at 6th-grade reading level                    │
└─────────────────────────────────────────────────────────┘
```

### Key Design Decisions

- **Server-side state caching**: Data flows between tools via an in-memory cache (keyed by patient ID) rather than through LLM tool call arguments. This prevents output token exhaustion in PO's LLM context window.
- **No Gemini API calls**: The MCP server is a pure data/instruction layer. All LLM reasoning is handled by PO's platform-configured model, eliminating rate limiting from duplicate API calls.
- **Enforced tool ordering**: Tools include both description-level warnings (`MUST be called after...`) and server-side rejection logic to prevent the LLM from skipping steps.

## FHIR Resource Types Queried

| Resource Type | Purpose |
|---|---|
| `Condition` | Patient diagnoses |
| `MedicationRequest` | Outpatient prescriptions/orders |
| `MedicationStatement` | Patient-reported or imported med history |
| `MedicationAdministration` | Inpatient administered doses (IV drips) |
| `DiagnosticReport` | Lab results, imaging reports |

## Setup

### Prerequisites
- Node.js 18+
- An [ngrok](https://ngrok.com) tunnel (for local development)
- A [Prompt Opinion](https://promptopinion.ai) workspace with a BYO agent

### Install & Run

```bash
npm install
cp .env.example .env
# Edit .env with your FHIR_BASE_URL if needed
npm run start
```

The server starts on port 5000 by default.

### Configure in Prompt Opinion

1. Create a **BYO Agent** named "Chief Resident" with Patient context
2. In the **Tools** tab, add your MCP URL: `https://your-ngrok-url.ngrok-free.dev/mcp`
3. Set the system prompt (see below)

### Recommended System Prompt

```
{{ PatientContextFragment }}
{{ PatientDataFragment }}
{{ McpAppsFragment }}

## Your Role
You are the Chief Resident overseeing patient discharges.

## Discharge Workflow (call tools in this exact order)
1. Call `clinical_navigator_fetch_data` (no arguments needed)
2. Call `pharmacist_translate_medications` (no arguments needed)
3. Read the Pharmacist's medication list, then call
   `empathy_engine_compose_brief` with the translated medications
4. Follow the Empathy Engine's instructions to write the final brief

If the Navigator reports no FHIR data, use the patient's clinical note
from the context above when translating medications and writing the brief.

## Scope
You can: generate discharge briefs, explain conditions/medications.
You cannot: diagnose, prescribe, modify treatments, access other patients.
```

## Project Structure

```
├── index.ts                  # Express server + MCP bootstrap
├── pipeline-state.ts         # In-memory cache for inter-tool data flow
├── fhir-client.ts            # FHIR server HTTP client (SHARP token auth)
├── fhir-utilities.ts         # Patient ID extraction from SHARP JWT
├── fhir-context.ts           # FHIR context type definitions
├── mcp-constants.ts          # MCP header constants
├── mcp-utilities.ts          # MCP response helpers
├── IMcpTool.ts               # Tool interface
├── null-utilities.ts         # Null-check helpers
├── tools/
│   ├── index.ts              # Tool exports (auto-registration)
│   ├── ClinicalNavigatorFetchDataTool.ts   # Step 1: FHIR data fetch
│   ├── PharmacistTranslateMedicationsTool.ts # Step 2: Med translation
│   └── EmpathyEngineComposeBriefTool.ts     # Step 3: Brief composition
```

## Built With

- [MCP SDK](https://github.com/modelcontextprotocol/sdk) — Model Context Protocol
- [Prompt Opinion](https://promptopinion.ai) — Healthcare AI platform
- [FHIR R4](https://hl7.org/fhir/R4/) — Healthcare interoperability standard
- [ngrok](https://ngrok.com) — Secure tunneling for local dev

## License

MIT
