# Demo Questions: PSHS Law Guide

**Live app:** https://pshs-law-bot.vercel.app · **Repo:** https://github.com/gandres1-hub/pshs-law-bot

These prompts show each behavior the project is graded on: grounded answers with accurate citations, retrieval used as a tool only when needed, cross-law reasoning, an honest "I don't know", and one known weakness. Start each numbered item with **New chat**, and open **Sources** under each answer to check the citations.

---

### 1. "Who sits on the PSHS Board of Trustees?"

**Why:** This is a direct lookup with a clear right answer in one section, which tests basic retrieval and citation accuracy.

**What to look for:** The full list of members, citing **RA 12310, Sec. 8** and **IRR, Sec. 8**, and the four-year term of the private-sector members. Both sources are tagged *current law*.

**Result:** Correct and complete. It cited both the Act and the IRR.

---

### 2. "How did the number of campuses per region change from 2001 to 2025?"

**Why:** This answer isn't in any single section. It needs one repealed law and one current law, so it tests whether the model searches **more than once** and keeps track of which law is in force.

**What to look for:** One campus per region under **RA 9036, Sec. 1** (repealed), compared with at least two per region, not in the same province, under **RA 12310, Sec. 5** (current). Sources come from both laws.

**Result:** Correct. It ran two searches and contrasted the two laws with the right citations.

---

### 3. "What is the passing score for the NCE?"

**Why:** The question sounds like it belongs, but the laws don't answer it. It tests whether the bot says so instead of guessing, which the RAG Correctness criterion grades directly.

**What to look for:** A clear statement that the laws in the library don't specify a passing score. At most, it points to the related definition of qualified students in **IRR, Sec. 4.7**.

**Result:** It said the laws don't cover this and pointed to IRR Sec. 4.7, without inventing a number.

---

### 4. "Hi!"

**Why:** It tests the other half of tool calling: skipping retrieval when it isn't needed.

**What to look for:** A short greeting with example questions, and **no Sources panel**, which means no search ran.

**Result:** It replied with suggestions and ran no search.

---

### 5. Drill-down on the Main Campus (a known weakness)

**5a. "What does the law say about the Main Campus?"**

**Why:** This is a lookup that spans several documents. The Main Campus appears in RA 12310, in the IRR, and in the repealed RA 9036.

**What to look for:** **RA 12310, Sec. 6(a)** (Main Campus in Diliman, Quezon City) and **IRR, Sec. 6** (the Quezon City campus keeps its status as the Main Campus).

**Result:** Answered correctly, with citations.

**5b. Follow-up, in the same chat: "What makes the Main Campus different from the other campuses?"**

**Why:** This is included on purpose as a failure case. The laws name the Main Campus but say little about how it differs, so an open-ended follow-up tempts the model to infer.

**What happened (first version):** Two of its four points went beyond the library. One cited a real section out of context, and the other had no citation. When challenged, the model admitted those points were its own reasoning. A rerun in a new chat was better, but that was variability and a fresh context, not learning, because the app keeps no memory between chats.

**What I changed:** Temperature 0, plus prompt rules to search again on every follow-up, cite a retrieved passage for every factual sentence, and not infer reasons or differences the text doesn't state.

**What happens now:** It states firmly, with a citation, that the laws only list the Main Campus among the campuses. It still adds that the name is "likely" or "implied" because it was the first campus, and possibly because of its location, but labels this clearly as its own inference, not law. That's better, but not fully fixed.

**What it shows:** Prompt rules reduce overreach on open-ended follow-ups but don't eliminate it, which is why grounding needs to be tested and not assumed.

---

### 6. Signatures: one answer in the text, one not

**6a. "Which President signed the law creating the first PSHS campus?"**

**6b. "Which President signed the expanded PSHS law?"**

**Why:** This pair tests whether the bot relies on the text or on general knowledge. The name is well known in both cases, but my copy of RA 3661 ends only with "Approved, June 22, 1963" and names no President, while RA 12310's signature block does.

**What to look for:** For 6a, a statement that the text doesn't specify who signed it. For 6b, **Ferdinand Marcos Jr.**, cited to RA 12310's approval and signatures.

**Result:** Both correct after the grounding fix. It said the text doesn't specify who signed RA 3661, and correctly named Ferdinand Marcos Jr. for RA 12310.
