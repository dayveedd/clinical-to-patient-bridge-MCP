// tools/index.ts
//
// Three-tool agent chain representing the multi-agent orchestration:
//   1. Clinical Navigator → fetches FHIR data, caches server-side
//   2. Pharmacist → reads from cache, returns translation instructions
//   3. Empathy Engine → reads from cache, composes discharge brief

import { ClinicalNavigatorFetchDataToolInstance } from "./ClinicalNavigatorFetchDataTool";
import { PharmacistTranslateMedicationsToolInstance } from "./PharmacistTranslateMedicationsTool";
import { EmpathyEngineComposeBriefToolInstance } from "./EmpathyEngineComposeBriefTool";

export { ClinicalNavigatorFetchDataToolInstance };       // Step 1
export { PharmacistTranslateMedicationsToolInstance };    // Step 2
export { EmpathyEngineComposeBriefToolInstance };         // Step 3
