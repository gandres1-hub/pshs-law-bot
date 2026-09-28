# PSHS Law Guide

A chatbot that answers questions about the laws governing the **Philippine Science High School (PSHS) System** and cites the law and section behind every answer.

| | |
|---|---|
| **Live app** | https://pshs-law-bot.vercel.app |
| **Repository** | https://github.com/gandres1-hub/pshs-law-bot |
| **Reflection** | [REFLECTION.md](REFLECTION.md) |
| **Demo questions** | [DEMO_QUESTIONS.md](DEMO_QUESTIONS.md) |

Built with [Next.js 15](https://nextjs.org/), the [Vercel AI SDK](https://sdk.vercel.ai/) (streaming, tool calling) and [Upstash Vector](https://upstash.com/docs/vector), starting from the Week 14A RAG starter.

> An unofficial student project, not legal advice. The texts were retyped from public copies and may contain errors; the versions published in the Official Gazette prevail.

## What it does

- Answers questions such as *"Who sits on the PSHS Board of Trustees?"* or *"How did the number of campuses per region change from 1998 to 2025?"*
- Retrieval is a **tool call** (`getInformation`): the model searches the laws only for substantive questions, and can search more than once (for example, once per law when comparing). It skips the search for greetings.
- Answers stream in, with inline citations such as *(RA 12310, Sec. 8)*.
- A **Sources** panel under each answer lists the sections it used, with the law, section, heading, page and a *current law* / *repealed* tag. Each source expands to show its full text.
- It says so when the laws don't cover a question, rather than guessing.

## The corpus

Five documents, 29 pages, in `data/`:

| File | Law | Status |
|---|---|---|
| `ra-12310-2025.pdf` | RA 12310, Expanded PSHS System Act (2025) | **current** |
| `ra-12310-irr-2026.pdf` | Implementing Rules and Regulations of RA 12310 (approved 29 April 2026) | **current** |
| `ra-9036-2001.pdf` | RA 9036, amendments to RA 8496 (2001) | repealed |
| `ra-8496-1998.pdf` | RA 8496, PSHS System Act of 1997 (original text) | repealed |
| `ra-3661-1963.pdf` | RA 3661, Act establishing the PSHS (1963) | repealed |

Philippine laws are not subject to copyright, so the PDFs are included in the repo. They were cleaned before indexing: OCR errors in the IRR were corrected, and hidden watermarks, zero-width characters and a scrambled signature block were fixed. Errors that appear in the official texts themselves were left as written. The repealed laws each carry a short bracketed status note under the title.

## How it works

**Seeding (`lib/seed.ts`, run locally)**

1. Reads each PDF with PDF.js (`pdfjs-dist`) and keeps track of the page each line is on.
2. **Chunks by section.** A new chunk starts at every line beginning with `Section N.`, `SECTION N.` or `SEC. N.`. Quoted section headings inside RA 9036's amendments start with a quotation mark, so they stay inside the section that quotes them. IRR rule headings, the preamble and the signature block are handled separately.
3. Sections longer than 1,500 characters are split between their list items (`(a)`, `9.1`, …), never mid-sentence, and short leftover pieces are merged back.
4. Each chunk begins with a label, for example `[RA 12310 (2025, current law) | Sec. 8. Creation of the PSHS Board of Trustees]`. The label is embedded with the text, so every retrieved passage shows which law it comes from and whether that law is in force.
5. Embeds the 119 chunks with `text-embedding-3-small`. It clears the Upstash index first, so no stale chunks remain, then uploads the chunks with metadata: `law`, `year`, `status`, `section`, `heading`, `rule`, `page`, `part`, `source`.

**Chat (`app/api/chat/route.ts`)**

- `streamText` with `gpt-4o-mini`, one tool (`getInformation`, topK 6) and `maxSteps: 5`.
- The system prompt limits answers to the retrieved text, requires a citation for every fact, defaults to current law, flags repealed laws, and asks for an explicit "not covered" answer when the laws are silent.

**UI (`app/page.tsx`)**: an empty state with example questions and the library list, Markdown answers, combined and de-duplicated sources, and a layout that works on phones.

## Run it locally

Requires **Node.js 22.13 or newer** (needed by `pdfjs-dist` 5).

```bash
npm install
cp .env.example .env.local
# fill in OPENAI_API_KEY, UPSTASH_VECTOR_REST_URL, UPSTASH_VECTOR_REST_TOKEN
```

Create an Upstash Vector index with **1536 dimensions** and **cosine** similarity, with no built-in embedding model.

```bash
npm run seed -- --dry   # chunk the PDFs and print a summary; no API calls
npm run seed            # clear the index, embed and upload (about 119 chunks)
npm run dev             # http://localhost:3000
```

To change the corpus, put PDFs in `data/` and edit the `DOCS` list at the top of `lib/seed.ts`.

## Deploy

The app is deployed on Vercel from this repo. Add the same three variables (`OPENAI_API_KEY`, `UPSTASH_VECTOR_REST_URL`, `UPSTASH_VECTOR_REST_TOKEN`) under **Project → Settings → Environment Variables**, then redeploy. The deployed app reads the index you seeded locally, so seeding is not part of the build.

## Project structure

```
app/
  api/chat/route.ts   chat endpoint: system prompt + getInformation tool
  layout.tsx          title and Open Graph metadata
  page.tsx            chat UI, empty state, sources
lib/seed.ts           PDF → section chunks → embeddings → Upstash
data/                 the five laws (PDF)
```

## Known limitations

- **Follow-up questions can overreach.** An open-ended follow-up ("what makes it different?") sometimes produces points that go beyond the text or lack a citation. See the reflection.
- The corpus is limited to the five laws. Questions about budgets per campus, intake numbers, stipend amounts or alumni are out of scope, and the bot says so.
- RA 8496 is included in its original 1998 form. Its later wording is only visible through RA 9036's amendments.
