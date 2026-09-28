/**
 * Seed Upstash Vector with the PSHS laws in data/.
 *
 *   npm run seed            -> reset the index, chunk, embed and upload
 *   npm run seed -- --dry   -> only chunk and print a summary (no API calls)
 *
 * Chunking strategy: one chunk per section of each law, because a section is
 * the smallest unit a legal answer should cite. Sections longer than
 * MAX_CHARS are split between their list items (a), (b)... or 9.1, 9.2...,
 * and every piece repeats the law and section name in a short header, so
 * each chunk still makes sense on its own.
 */
import { config as loadEnv } from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';

// Next.js reads .env.local automatically; this script does not.
loadEnv({ path: path.join(process.cwd(), '.env.local') });
import { Index } from '@upstash/vector';
import { embedMany } from 'ai';
import { openai } from '@ai-sdk/openai';
// PDF.js (Mozilla's PDF engine). The starter's pdf-parse bundles a 2018
// copy of it that fails at random on Node 24 ("bad XRef entry",
// "Command token too long"), so we use the maintained package directly.
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

// ---------------------------------------------------------------------------
// The corpus. Edit this list if you add or remove a file in data/.
// ---------------------------------------------------------------------------
type Status = 'current' | 'repealed';
type Doc = {
  file: string;
  id: string; // short, unique; used in chunk ids
  law: string; // label shown in citations
  title: string;
  year: number;
  status: Status;
};

const DOCS: Doc[] = [
  { file: 'ra-3661-1963.pdf', id: 'ra3661', law: 'RA 3661', title: 'An Act to Establish the Philippine Science High School', year: 1963, status: 'repealed' },
  { file: 'ra-8496-1998.pdf', id: 'ra8496', law: 'RA 8496', title: 'Philippine Science High School (PSHS) System Act of 1997', year: 1998, status: 'repealed' },
  { file: 'ra-9036-2001.pdf', id: 'ra9036', law: 'RA 9036', title: 'Act amending RA 8496 (governance and scope of the PSHS System)', year: 2001, status: 'repealed' },
  { file: 'ra-12310-2025.pdf', id: 'ra12310', law: 'RA 12310', title: 'Expanded Philippine Science High School (PSHS) System Act', year: 2025, status: 'current' },
  { file: 'ra-12310-irr-2026.pdf', id: 'irr12310', law: 'IRR of RA 12310', title: 'Implementing Rules and Regulations of RA 12310', year: 2026, status: 'current' },
];

const DATA_DIR = path.join(process.cwd(), 'data');
const MAX_CHARS = 1500; // longest chunk body before a section is split
const MIN_CHARS = 400; // never leave a piece shorter than this at a split

// A new section starts on a line that BEGINS with "Section 5.", "SECTION 1." or
// "SEC. 5.". Quoted headings inside amending acts ("SEC. 5. Scope ...) start
// with a quotation mark, so they stay inside the section that quotes them.
const SECTION_RE = /^(?:Section|SECTION|SEC\.?)\s+(\d+)\.\s*(.*)$/;
const RULE_RE = /^(RULE [IVX]+)\s*-\s*(.+)$/; // IRR rule headings
const TITLE_RE = /^(TITLE [IVX]+)\s*-\s*(.+)$/; // RA 8496 title headings
const APPROVED_RE = /^Approved\b/; // start of the signature block
// A line that starts a list item or a new quoted passage: (a) / 9.1 / 1. / "
const ITEM_RE = /^(?:\([a-z]\)|\d+(?:\.\d+)*\.?\s|")/;

type Line = { text: string; page: number };
type Section = {
  key: string; // "Sec. 9", "Preamble", "Signatures"
  heading: string; // "Powers and Functions of the PSHS Board of Trustees"
  rule?: string; // IRR only: "RULE IV - GOVERNANCE"
  lines: Line[];
};
export type Chunk = {
  id: string;
  text: string; // header + body; this is what gets embedded and displayed
  meta: {
    text: string;
    source: string;
    law: string;
    title: string;
    year: number;
    status: Status;
    section: string;
    heading: string;
    rule?: string;
    page: number;
    part: number;
    parts: number;
  };
};

/** Read a PDF into lines of text, remembering the page each line is on. */
async function readLines(file: string): Promise<Line[]> {
  const data = new Uint8Array(fs.readFileSync(path.join(DATA_DIR, file)));
  const pdf = await getDocument({ data, useSystemFonts: true, verbosity: 0 }).promise;
  const lines: Line[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    // Start a new line whenever the text moves to a new vertical position.
    let current = '';
    let lastY: number | undefined;
    const flush = () => {
      const text = current.replace(/\s+/g, ' ').trim();
      if (text) lines.push({ text, page: p });
      current = '';
    };
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (lastY !== undefined && Math.abs(y - lastY) > 1) flush();
      current += item.str;
      lastY = y;
    }
    flush();
  }
  await pdf.destroy();
  return lines;
}

// A bare title such as "Transitory Provision." (no " - " after it).
const BARE_TITLE_RE = /^([A-Z][\w-]*(?:\s+(?:[A-Z][\w-]*|of|and|the|for|in|to|from|on|into))*)\.$/;

/**
 * Heading = text before " - " when the section has a title
 * ("Powers and Functions of the PSHS Board of Trustees. - The Board shall ...").
 * Sections of the amending act RA 9036 quote other sections' headings; those
 * are not this section's heading, so anything containing a quote is skipped.
 */
function findHeading(afterNumber: string): string {
  const dash = afterNumber.indexOf(' - ');
  if (dash > 0 && dash < 150) {
    const h = afterNumber.slice(0, dash).replace(/\.$/, '');
    return h.includes('"') ? '' : h;
  }
  const bare = afterNumber.match(BARE_TITLE_RE);
  return bare ? bare[1] : '';
}

/** Group a document's lines into sections. */
function splitSections(lines: Line[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { key: 'Preamble', heading: 'Title and preamble', lines: [] };
  let rule: string | undefined;
  let signatures = false;

  for (const line of lines) {
    if (!signatures && APPROVED_RE.test(line.text)) {
      sections.push(current);
      current = { key: 'Signatures', heading: 'Approval and signatures', lines: [] };
      signatures = true;
    }
    if (!signatures) {
      const r = line.text.match(RULE_RE) ?? line.text.match(TITLE_RE);
      if (r) {
        rule = `${r[1]} - ${r[2]}`;
        continue; // the rule name goes into metadata and the chunk header
      }
      const s = line.text.match(SECTION_RE);
      if (s) {
        sections.push(current);
        // Heading = text before " - " when the section has a title
        // ("Section 9. Powers and Functions ... . - The Board shall ...").
        current = { key: `Sec. ${s[1]}`, heading: findHeading(s[2]), rule, lines: [] };
        current.lines.push(line);
        continue;
      }
    }
    current.lines.push(line);
  }
  sections.push(current);
  return sections.filter((s) => s.lines.length > 0);
}

/**
 * Titled sections can wrap onto a second line before their " - "
 * ("Section 7. Restriction on the Conversion ... PSHS / Campus. - The ...").
 * Look at the joined first two lines to recover those headings.
 */
function fixHeading(sec: Section) {
  if (sec.heading || !sec.key.startsWith('Sec.')) return;
  const joined = sec.lines.slice(0, 2).map((l) => l.text).join(' ');
  const m = joined.match(/^(?:Section|SECTION|SEC\.?)\s+\d+\.\s*(.*?)\.?\s+-\s/);
  if (m && m[1].length < 150 && !m[1].includes('"')) sec.heading = m[1];
}

/** Split a section into bodies of at most MAX_CHARS, breaking between list items. */
function packSection(sec: Section): { body: string; page: number }[] {
  // Units: a list item plus its wrapped continuation lines.
  const items: Line[] = [];
  sec.lines.forEach((line, i) => {
    // Signature blocks keep one line per name/title so they stay readable.
    if (i === 0 || ITEM_RE.test(line.text) || sec.key === 'Signatures') items.push({ ...line });
    else items[items.length - 1].text += ' ' + line.text;
  });
  // A long paragraph with no list items (e.g. RA 3661 Sec. 4) is broken
  // into sentences so it can still be split.
  const units: Line[] = items.flatMap((u) =>
    u.text.length <= MAX_CHARS
      ? [u]
      : u.text.split(/(?<=[.;])\s+(?=[A-Z(])/).map((t) => ({ text: t, page: u.page })),
  );
  const parts: { body: string; page: number }[] = [];
  let body = '';
  let page = units[0].page;
  for (const u of units) {
    if (body.length >= MIN_CHARS && body.length + u.text.length + 1 > MAX_CHARS) {
      parts.push({ body, page });
      body = '';
      page = u.page;
    }
    body = body ? `${body}\n${u.text}` : u.text;
  }
  if (body) parts.push({ body, page });
  // Fold a short leftover tail back into the previous piece.
  if (parts.length > 1 && parts[parts.length - 1].body.length < MIN_CHARS) {
    const tail = parts.pop()!;
    parts[parts.length - 1].body += `\n${tail.body}`;
  }
  return parts;
}

export async function buildChunks(): Promise<Chunk[]> {
  const chunks: Chunk[] = [];
  for (const doc of DOCS) {
    let lines: Line[];
    try {
      lines = await readLines(doc.file);
    } catch (e) {
      throw new Error(`Could not read data/${doc.file}: ${(e as Error).message ?? e}`);
    }
    const sections = splitSections(lines);
    let n = 0;
    for (const sec of sections) {
      fixHeading(sec);
      const parts = packSection(sec);
      parts.forEach((p, i) => {
        const label = [
          `${doc.law} (${doc.year}, ${doc.status === 'current' ? 'current law' : 'repealed'})`,
          sec.rule,
          sec.heading ? `${sec.key}. ${sec.heading}` : sec.key,
          parts.length > 1 ? `part ${i + 1} of ${parts.length}` : undefined,
        ]
          .filter(Boolean)
          .join(' | ');
        const text = `[${label}]\n${p.body}`;
        chunks.push({
          id: `${doc.id}-${String(n++).padStart(3, '0')}`,
          text,
          meta: {
            text,
            source: doc.file,
            law: doc.law,
            title: doc.title,
            year: doc.year,
            status: doc.status,
            section: sec.key,
            heading: sec.heading,
            ...(sec.rule ? { rule: sec.rule } : {}),
            page: p.page,
            part: i + 1,
            parts: parts.length,
          },
        });
      });
    }
  }
  return chunks;
}

function printSummary(chunks: Chunk[]) {
  for (const doc of DOCS) {
    const mine = chunks.filter((c) => c.meta.source === doc.file);
    console.log(`\n${doc.law} — ${mine.length} chunks`);
    for (const c of mine) {
      const m = c.meta;
      const part = m.parts > 1 ? ` (${m.part}/${m.parts})` : '';
      console.log(`  ${c.id}  p.${m.page}  ${m.section}${part}  ${m.heading}  [${m.text.length} chars]`);
    }
  }
  const sizes = chunks.map((c) => c.text.length);
  console.log(`\nTotal: ${chunks.length} chunks, ${Math.min(...sizes)}–${Math.max(...sizes)} chars each`);
}

async function main() {
  console.log('Reading and chunking the PDFs in data/…');
  const chunks = await buildChunks();
  printSummary(chunks);

  if (process.argv.includes('--dry')) {
    console.log('\nDry run: nothing was embedded or uploaded.');
    return;
  }

  if (!process.env.UPSTASH_VECTOR_REST_URL || !process.env.UPSTASH_VECTOR_REST_TOKEN) {
    console.error('Missing UPSTASH_VECTOR_REST_URL / UPSTASH_VECTOR_REST_TOKEN. Set them in .env.local.');
    process.exit(1);
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('Missing OPENAI_API_KEY in .env.local.');
    process.exit(1);
  }

  console.log('\nEmbedding…');
  const { embeddings } = await embedMany({
    model: openai.embedding('text-embedding-3-small'),
    values: chunks.map((c) => c.text),
  });

  const index = new Index();
  // Start from an empty index so no chunks from an earlier run (or the
  // sample PDF) are left behind.
  console.log('Clearing the index…');
  await index.reset();

  const records = chunks.map((c, i) => ({ id: c.id, vector: embeddings[i], metadata: c.meta }));
  console.log(`Upserting ${records.length} chunks to Upstash Vector…`);
  const BATCH = 100;
  for (let i = 0; i < records.length; i += BATCH) {
    await index.upsert(records.slice(i, i + BATCH));
  }
  console.log('✅ Done. Run `npm run dev` and chat at http://localhost:3000');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
