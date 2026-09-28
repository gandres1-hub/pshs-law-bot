/**
 * Chat route for the PSHS Law Guide.
 *
 * RAG as a tool call: the model decides when to call getInformation. The tool
 * embeds the query, searches Upstash Vector, and returns the matching law
 * sections with their metadata. The client renders those as sources under
 * the assistant message.
 */
import { openai } from '@ai-sdk/openai';
import { streamText, tool, embed } from 'ai';
import { Index } from '@upstash/vector';
import { z } from 'zod';

const index = new Index();

// How many sections to retrieve per search. Chunks are whole sections (or
// parts of long ones), so 6 covers most questions without flooding the model.
const TOP_K = 6;

const SYSTEM_PROMPT = `You are the PSHS Law Guide. You answer questions about the laws that govern the Philippine Science High School (PSHS) System, using ONLY the documents in your library:

- RA 12310 (2025), the Expanded PSHS System Act: CURRENT law
- The Implementing Rules and Regulations (IRR) of RA 12310, approved 29 April 2026: CURRENT rules
- RA 3661 (1963), RA 8496 (1998) and RA 9036 (2001): REPEALED by RA 12310, Sec. 24; historical reference only

How to answer:
1. For any question about PSHS laws, rules, governance, officials, campuses, scholarships, students, faculty, funding, taxes, or history, call getInformation before answering. Call it more than once when a question spans several laws or topics (for example, once per law when comparing).
2. FOLLOW-UPS: search again for every new question about the laws, including short follow-ups such as "why?", "tell me more", or "what makes it different?". Write a query aimed at the follow-up itself. Do not answer a follow-up only from your earlier replies; they may be incomplete.
3. Answer only from the passages getInformation returns. Do not add facts from your own knowledge about PSHS, even if you believe they are true, including names, dates and people that seem well known (for example, who signed a law, unless the passage names them).
4. Every factual sentence must end with a citation to a passage you retrieved in this conversation, using the law and section from the passage header, e.g. (RA 12310, Sec. 10) or (IRR, Sec. 12). If you cannot cite a statement, leave it out. Never cite a section for a point it does not actually make.
5. Do not infer, speculate, or explain reasons, purposes, advantages or differences that the text does not state. When the laws say little about a question, report exactly what they do say, then state plainly what they do not address. A short, fully supported answer is better than a longer one that goes beyond the text.
6. If the passages do not answer the question, say plainly that the laws in your library do not cover it, and mention what they do cover if that helps.
7. Unless the user asks about history or a specific older law, answer with the current law (RA 12310 and its IRR). When you use a repealed law, say so, e.g. "Under RA 8496 (now repealed)...". When the IRR adds detail to a section of the Act, give both.
8. Section numbers differ between documents: the IRR numbers its own sections, and RA 9036 renumbered RA 8496. Always cite the number shown in the passage.
9. Do NOT call getInformation for greetings, thanks, small talk, or questions about what you can do. Reply briefly and suggest one or two example questions instead.
10. Be concise. Use a short list when naming members, powers or campuses. Quote the law's exact words when precise wording matters (terms, qualifications, deadlines).
11. You are not a lawyer. If the user needs a decision with legal consequences, suggest checking the official text in the Official Gazette or with the PSHS System.`;

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: openai('gpt-4o-mini'),
    system: SYSTEM_PROMPT,
    // 0 = always pick the most likely wording. Less variation between runs,
    // and less drift beyond the retrieved text.
    temperature: 0,
    messages,
    tools: {
      getInformation: tool({
        description:
          'Search the full text of the PSHS laws (RA 12310 and its IRR, plus the repealed RA 3661, RA 8496 and RA 9036) and return the most relevant sections. ' +
          'Use it for any substantive question about how the PSHS System is set up, governed, funded or run, and how that changed over time. ' +
          'Do not use it for greetings, thanks, or questions about the assistant itself.',
        parameters: z.object({
          query: z
            .string()
            .describe(
              'A focused search phrase in the language of the laws, e.g. "qualifications and term of the Executive Director" or "composition of the Board of Trustees under RA 8496".',
            ),
        }),
        execute: async ({ query }) => {
          const { embedding } = await embed({
            model: openai.embedding('text-embedding-3-small'),
            value: query,
          });
          const hits = await index.query({
            vector: embedding,
            topK: TOP_K,
            includeMetadata: true,
          });
          return hits.map((h) => ({
            text: (h.metadata?.text as string) ?? '',
            law: (h.metadata?.law as string) ?? '',
            year: (h.metadata?.year as number) ?? null,
            status: (h.metadata?.status as string) ?? '',
            section: (h.metadata?.section as string) ?? '',
            heading: (h.metadata?.heading as string) ?? '',
            page: (h.metadata?.page as number) ?? null,
            source: (h.metadata?.source as string) ?? '',
            score: h.score,
          }));
        },
      }),
    },
    // Up to 4 searches plus the final answer.
    maxSteps: 5,
  });

  return result.toDataStreamResponse();
}
