import os
import json
import time
import uuid
import base64
import random
from google import genai
from google.genai import types

client = genai.Client()

# Python will force these to be unique
FIRST_NAMES = ["Arthur", "Eleanor", "Marcus", "Chloe", "Silas", "Amina", "Barnaby", "Clara", "Julian", "Maya", "Elias",
               "Nadia", "Finn", "Zara", "Oliver"]
LAST_NAMES = ["Sterling", "Vanderbuilt", "Chen", "Okafor", "Montgomery", "Rios", "Chang", "Patel", "Dubois", "Novak",
              "Nkosi", "Kim", "Silva", "Cohen", "Alves"]
THEMES = ["Cardiology", "Endocrinology (Diabetes)", "Pulmonology (Lungs)", "Neurology", "Gastroenterology", "Oncology",
          "Rheumatology"]


def get_unique_profile(used_names):
    """Generates a guaranteed unique name and random medical theme."""
    while True:
        first = random.choice(FIRST_NAMES)
        last = random.choice(LAST_NAMES)
        full_name = f"{first} {last}"
        if full_name not in used_names:
            used_names.add(full_name)
            return first, last, random.choice(THEMES)


def generate_clinical_data(first_name, last_name, theme):
    """Forces the LLM to use the specific name and medical theme."""

    # Note the double curly braces {{ }} needed for JSON in Python f-strings
    prompt = f"""
    Generate complex clinical data for ONE synthetic patient. 
    You MUST use the exact name: {first_name} {last_name}.
    The patient's primary medical conditions MUST be related to: {theme}.

    Return ONLY valid JSON matching this exact structure, with no markdown formatting.

    {{
      "first_name": "{first_name}",
      "last_name": "{last_name}",
      "gender": "male", 
      "dob": "1950-05-12",
      "conditions": [
        {{"name": "Severe Condition", "code": "I50.9"}}
      ],
      "medications": [
        {{"name": "Medication tab", "dosage": "Take 1 tab PO BID PRN"}}
      ],
      "clinical_note": "Pt presents with acute exacerbation. Ordered meds and strict monitoring. Will titrate meds. F/U in 2 days."
    }}

    CRITICAL: 
    - Provide 2 severe conditions and 3 complex medications related to {theme}.
    - 'clinical_note' MUST be a highly realistic, 3-sentence doctor's consult note packed with medical abbreviations.
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json")
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Error fetching from Gemini: {e}")
        return None


def build_fhir_entries(clinical_data):
    """Maps the data into strict FHIR R4 and base64 encodes the document."""
    patient_uuid = str(uuid.uuid4())
    patient_urn = f"urn:uuid:{patient_uuid}"
    entries = []

    # 1. Patient Resource
    entries.append({
        "fullUrl": patient_urn,
        "resource": {
            "resourceType": "Patient",
            "name": [{"family": clinical_data["last_name"], "given": [clinical_data["first_name"]]}],
            "gender": clinical_data["gender"],
            "birthDate": clinical_data["dob"]
        },
        "request": {"method": "POST", "url": "Patient"}
    })

    # 2. Condition Resources
    for cond in clinical_data.get("conditions", []):
        entries.append({
            "fullUrl": f"urn:uuid:{str(uuid.uuid4())}",
            "resource": {
                "resourceType": "Condition",
                "clinicalStatus": {"coding": [
                    {"system": "http://terminology.hl7.org/CodeSystem/condition-clinical", "code": "active"}]},
                "code": {"coding": [{"system": "http://hl7.org/fhir/sid/icd-10", "code": cond.get("code", "R69"),
                                     "display": cond["name"]}], "text": cond["name"]},
                "subject": {"reference": patient_urn}
            },
            "request": {"method": "POST", "url": "Condition"}
        })

    # 3. MedicationRequest Resources
    for med in clinical_data.get("medications", []):
        entries.append({
            "fullUrl": f"urn:uuid:{str(uuid.uuid4())}",
            "resource": {
                "resourceType": "MedicationRequest",
                "status": "active",
                "intent": "order",
                "medicationCodeableConcept": {"text": med["name"]},
                "subject": {"reference": patient_urn},
                "dosageInstruction": [{"text": med["dosage"]}]
            },
            "request": {"method": "POST", "url": "MedicationRequest"}
        })

    # 4. DocumentReference Resource
    note_text = clinical_data.get("clinical_note", "No clinical notes available at this time.")
    note_b64 = base64.b64encode(note_text.encode('utf-8')).decode('utf-8')

    entries.append({
        "fullUrl": f"urn:uuid:{str(uuid.uuid4())}",
        "resource": {
            "resourceType": "DocumentReference",
            "status": "current",
            "subject": {"reference": patient_urn},
            "type": {
                "coding": [{"system": "http://loinc.org", "code": "11488-4", "display": "Consult note"}]
            },
            "content": [{
                "attachment": {
                    "contentType": "text/plain",
                    "data": note_b64
                }
            }]
        },
        "request": {"method": "POST", "url": "DocumentReference"}
    })

    return entries


def build_master_bundle(target_patient_count=5):
    print(f"Generating {target_patient_count} uniquely themed patients...")

    master_bundle = {"resourceType": "Bundle", "type": "transaction", "entry": []}
    used_names = set()
    successful_patients = 0

    while successful_patients < target_patient_count:
        first, last, theme = get_unique_profile(used_names)
        clinical_data = generate_clinical_data(first, last, theme)

        if clinical_data:
            fhir_entries = build_fhir_entries(clinical_data)
            master_bundle["entry"].extend(fhir_entries)
            successful_patients += 1
            print(f"[{successful_patients}/{target_patient_count}] Generated {first} {last} ({theme}).")
        time.sleep(2)

    with open("complex_patients_diverse.json", "w") as f:
        json.dump(master_bundle, f, indent=2)
    print("\nDone! Output saved to 'complex_patients_diverse_update.json'")


if __name__ == "__main__":
    # You can safely crank this up to 10 or 20 now without fear of duplicates!
    build_master_bundle(target_patient_count=15)