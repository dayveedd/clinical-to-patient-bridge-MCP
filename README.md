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

You are the Chief Resident overseeing patient discharges.

## Workflow
When asked anything about a patient, follow these steps in order:

Step 1 — Call `clinical_navigator_fetch_data`. After it returns, relay its response to the user in your own words.

Step 2 — Call `pharmacist_translate_medications`. After it returns, relay its response to the user in your own words.

Step 3 — Call `empathy_engine_compose_brief`. After it returns, copy and display the FULL text content from the tool response directly to the user. Do not shorten it. Do not summarize it.

## Critical Rules
- After EACH tool call, write a short message to the user before calling the next tool.
- When the empathy_engine_compose_brief tool returns, output its full text directly. Do NOT say "I am launching an interface." Display the discharge brief as written.
- Stay within your role. You can: explain conditions, list medications, generate discharge briefs. You cannot: diagnose new conditions or prescribe medications.
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
├── Presentation_Deck.html    # Browser-viewable demo presentation
├── tools/
│   ├── index.ts              # Tool exports (auto-registration)
│   ├── ClinicalNavigatorFetchDataTool.ts    # Step 1: FHIR data fetch
│   ├── PharmacistTranslateMedicationsTool.ts # Step 2: Med translation
│   └── EmpathyEngineComposeBriefTool.ts     # Step 3: Brief composition
├── scripts/
│   └── generate_fhir_bundle.py  # Python script to generate synthetic FHIR patients
└── data/
    └── complex_patients_diverse.json  # FHIR R4 bundle with 15 complex patients
```

## Synthetic Patient Data

The Prompt Opinion demo environment provides basic single-condition patients that are
insufficient for showcasing the full capability of the pipeline. To properly demonstrate
medication translation and empathetic brief generation, 15 complex synthetic patients
were generated with realistic multi-morbidity profiles.

### `scripts/generate_fhir_bundle.py`

A Python script that generates a valid FHIR R4 Bundle containing 15 synthetic patients.
Each patient has:

- Between 2 and 5 active diagnoses (e.g. Idiopathic Pulmonary Fibrosis, Atrial Fibrillation,
  Chronic Kidney Disease, Type 2 Diabetes with neuropathy, Congestive Heart Failure)
- Between 3 and 7 medications with full clinical dosing notation using abbreviations
  such as `PO BID PRN`, `IV QHS`, `TID AC` — exactly the kind of notation that
  patients cannot parse without help
- One or two DiagnosticReports with typed clinical conclusions

**Requirements:**

```bash
pip install fhir.resources
```

**Run:**

```bash
python scripts/generate_fhir_bundle.py
# Outputs: data/complex_patients_diverse.json
```

### `data/complex_patients_diverse.json`

A pre-generated FHIR R4 Bundle containing the 15 synthetic patients, ready to be
uploaded to any HAPI FHIR server. To load it into a HAPI FHIR server:

```bash
curl -X POST https://your-hapi-fhir-server/fhir \
  -H "Content-Type: application/fhir+json" \
  -d @data/complex_patients_diverse.json
```

Once uploaded, configure the FHIR Base URL in Prompt Opinion to point to your HAPI
FHIR server. The patients will appear in the PO patient selector and can be used
immediately with the Chief Resident agent.

## Built With

- [MCP SDK](https://github.com/modelcontextprotocol/sdk) — Model Context Protocol
- [Prompt Opinion](https://promptopinion.ai) — Healthcare AI platform
- [FHIR R4](https://hl7.org/fhir/R4/) — Healthcare interoperability standard
- [ngrok](https://ngrok.com) — Secure tunneling for local dev

## License

MIT
