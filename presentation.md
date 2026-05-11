---
marp: true
theme: default
class: lead
backgroundColor: #f8fafc
color: #0f172a
style: |
  section {
    font-family: 'Inter', -apple-system, sans-serif;
  }
  h1 {
    color: #0284c7;
  }
  strong {
    color: #0369a1;
  }
  .highlight {
    background: #e0f2fe;
    padding: 0.2em 0.4em;
    border-radius: 4px;
  }
---

# 🏥 Clinical-to-Patient Bridge
### Empowering patients through empathetic AI orchestration
*(Hackathon Demo Presentation)*

---

# ⚠️ The Problem: Clinical Jargon

When patients leave the hospital, they receive summaries meant for doctors:
- <span class="highlight">"PO BID PRN"</span>
- <span class="highlight">"Idiopathic Pulmonary Fibrosis"</span>
- Raw, structured FHIR JSON data

**Result:** Patients are overwhelmed, leading to confusion, poor medication adherence, and hospital readmissions.

---

# 💡 The Solution: Multi-Agent Orchestration

We built a system on the **Prompt Opinion** platform where a **Chief Resident Agent** orchestrates three specialized agents using the Model Context Protocol (MCP).

Instead of one massive, hallucination-prone prompt, the workflow is strictly divided into specialized roles.

---

# ⚙️ The Pipeline (MCP Tools)

1. **🧭 Clinical Navigator:** Securely fetches raw FHIR data (Conditions, Medications, Reports).
2. **💊 Pharmacist:** Translates complex medication dosages into plain English and flags side effects.
3. **💙 Empathy Engine:** Composes the final, warm, and easy-to-read discharge summary at a 6th-grade reading level.

---

# 🚀 Technical Innovation: Server-Side State

**The Challenge:** Passing thousands of FHIR tokens between agents exhausts LLM context windows and hits platform rate limits.

**Our Solution:** 
- The MCP server holds the FHIR data in a secure, server-side cache.
- Agents read from the cache internally instead of echoing data.
- **Result:** Zero token exhaustion, 0 extra LLM API calls, completely bulletproof orchestration.

---

# 📊 The Impact

**Before:** `Take 1 tab PO BID PRN`
**After:** `Take 1 tablet by mouth, twice a day, as needed.`

- **Reduces patient anxiety** with empathetic, accessible language.
- **Improves medication adherence** through clear, jargon-free instructions.
- **Saves doctors hours** of manual documentation time.

---

# 🙏 Thank You

**Clinical-to-Patient Bridge**
*Bridging the gap between clinical data and human empathy.*
