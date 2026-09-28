# Reflection: PSHS Law Guide

**Live app:** https://pshs-law-bot.vercel.app · **Repo:** https://github.com/gandres1-hub/pshs-law-bot

## Corpus and why I chose it

The bot answers questions about the laws governing the Philippine Science High School System: RA 12310 (2025) and its IRR (2026), which are current, and RA 3661, RA 8496 and RA 9036, which RA 12310 repealed. That's five documents, 29 pages.

I dropped two options first: the Student Affairs QMS manual was scanned, garbled by OCR, and needs management approval to release, and my dissertation is unpublished. The laws are public domain, divided into numbered sections, and a subject I know well enough to catch mistakes; the repealed ones let the bot answer history questions.

Cleanup mattered: I fixed about 40 OCR errors in the IRR, removed a hidden watermark, and repaired RA 9036's signature block, which paired names with the wrong offices. Errors in the official texts themselves stayed as written.

## The trickiest decision

The trickiest decision was chunking the laws so the bot could tell current from repealed law. The starter's 800-character windows would have split provisions mid-sentence and lost track of which law a passage came from. Instead, I made one chunk per section, which gives 119 chunks. Long sections are split between list items, and every chunk begins with a label such as `[RA 12310 (2025, current law) | Sec. 8. Creation of the PSHS Board of Trustees]`. The label is embedded with the text, so every retrieved passage shows its law and status, and the prompt tells the bot to default to current law. I also replaced the starter's PDF library, which failed at random on Node 24.

## One thing it does well

Direct lookups are accurate and checkable: the Board of Trustees question returns the full list citing RA 12310 Sec. 8 and IRR Sec. 8. History questions trigger several searches, e.g. one campus per region (RA 9036) versus two or more (RA 12310). It declines what the laws don't cover (the NCE passing score) and doesn't search for "Hi".

## One thing it does badly

It overreaches on open-ended follow-ups. After a good answer on what the law says about the Main Campus, I asked what makes it different from the other campuses. Two of its four points weren't in the library: one cited a real section out of context, the other cited nothing. When I pushed back, it admitted those points were its own reasoning. A new chat gave a better answer, but that wasn't learning: the app keeps no memory between chats, so the new chat simply started without its earlier answers, and output varies between runs.

**What I changed.** Temperature 0, plus prompt rules: search again on every follow-up, cite a retrieved passage for every factual sentence, and don't infer reasons or differences the text doesn't state.

**Result.** Better, not fixed. The follow-up now states firmly, with a citation, that the laws only list the Main Campus among the campuses. It still adds that it is "likely" called that because it was the first campus, but now labels this as its own inference, not law. Asked which President signed RA 3661, it says the text doesn't specify (my copy doesn't name him), yet correctly names Ferdinand Marcos Jr. for RA 12310, whose signature block is in the text. The lesson is that prompts reduce overreach but don't eliminate it; grounding has to be enforced and then tested, not assumed.

## What I would do with another week

1. **Remove the last overreach:** forbid even labeled speculation, or show it in a separate "not from the laws" note.
2. **Build an evaluation set:** about 20 questions with follow-ups and expected sections, each run several times per change.
3. **Widen the corpus:** Board resolutions and scholarship rules, for the budget, intake and stipend questions the laws can't answer.
