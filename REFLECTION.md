# Reflection: PSHS Law Guide

**Live app:** https://pshs-law-bot.vercel.app · **Repo:** https://github.com/gandres1-hub/pshs-law-bot

## Corpus and why I chose it

The bot answers questions about the laws that govern the Philippine Science High School System: RA 12310 (2025) and its IRR (approved April 2026), which are current, plus RA 3661 (1963), RA 8496 (1998) and RA 9036 (2001), which RA 12310 repealed. Together they are five documents and 29 pages.

I dropped two other options first. The PSHS Student Affairs QMS manual was scanned, its OCR text scrambled the procedure tables, and its footer requires management approval to release it. My dissertation is unpublished, and a public bot would make its content readable. The laws are public domain, divided into numbered sections, and a subject I know well enough to catch mistakes. The repealed laws also let the bot answer questions about how the System changed.

Preparing the texts took real work: about 40 OCR errors fixed in the IRR ("sha11", "Aldan" for Aklan), a hidden watermark and zero-width characters removed, and RA 9036's signature block repaired, since it had paired names with the wrong offices. I left errors that are in the official texts themselves ("The Stare") unchanged.

## The trickiest decision

The trickiest decision was how to chunk the laws so the bot could tell current law from repealed law. The starter cut text into 800-character windows. That would have split provisions mid-sentence and lost track of which law a passage came from, and several of the laws have near-identical sections. Instead, I made one chunk per section, which gives 119 chunks. Sections longer than 1,500 characters are split between their list items, and every chunk begins with a label such as `[RA 12310 (2025, current law) | Sec. 8. Creation of the PSHS Board of Trustees]`. That label is embedded with the text, so a retrieved passage always shows its law and status. The system prompt tells the bot to default to current law and to flag anything repealed.

I also replaced the starter's PDF library, which failed at random on Node 24, and fixed its page numbers, which were all "1".

## One thing it does well

It answers direct lookups accurately, with citations you can check: "Who sits on the Board of Trustees?" returns the full list citing RA 12310 Sec. 8 and IRR Sec. 8. For history questions it searches more than once, for example contrasting RA 9036's one campus per region with RA 12310's two or more. It declines questions the laws don't cover (the NCE passing score), and doesn't search at all for "Hi".

## One thing it does badly

It overreaches on follow-up questions. I asked what the law says about the Main Campus, and that answer was fine. Then I asked what makes the Main Campus different from the other campuses. Two of its four points were not supported by the library: one cited a real section but used it out of context, and the other had no citation at all. When I pushed back, it admitted those points were its own reasoning, not the text.

My reading is that an open-ended "what makes it different" follow-up invites the model to infer, and it mixed those inferences in with the cited facts. When I started a new chat and asked the same thing, the answer was better. That wasn't learning: the app keeps no memory between chats, and the model isn't updated by my feedback. The new chat simply started without its earlier answers, and the model's output varies from run to run. The lesson is that one good run isn't evidence, and grounding has to be enforced rather than assumed, because most users won't push back.

## What I would do with another week

1. **Enforce grounding.** Set the temperature to 0. Require a fresh search on every follow-up and a citation on every claim. Tell the model explicitly not to compare or infer beyond what the text says.
2. **Build an evaluation set.** Write about 20 questions, including follow-ups, each with the section it should cite. Run each several times after every change, since a single run hides variability.
3. **Widen the corpus.** Questions about per-campus budgets, intake numbers, stipends and alumni fall outside the laws. Adding Board resolutions and scholarship rules would answer questions people actually ask.
