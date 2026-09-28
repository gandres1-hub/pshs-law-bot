'use client';

import { useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import type { Message } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';

// ---------------------------------------------------------------------------
// Content
// ---------------------------------------------------------------------------

const EXAMPLES = [
  'Who sits on the PSHS Board of Trustees?',
  'What are the qualifications and term of the Executive Director?',
  'How did the number of campuses per region change from 1998 to 2025?',
  'Which campuses exist today, and where are new ones being considered?',
  'Are PSHS faculty members required to take the civil service exam?',
  'What does the IRR add about Deputy Executive Directors?',
];

const LIBRARY = [
  { law: 'RA 12310', year: 2025, name: 'Expanded PSHS System Act', status: 'current' },
  { law: 'IRR of RA 12310', year: 2026, name: 'Implementing Rules and Regulations', status: 'current' },
  { law: 'RA 9036', year: 2001, name: 'Amendments to RA 8496', status: 'repealed' },
  { law: 'RA 8496', year: 1998, name: 'PSHS System Act of 1997', status: 'repealed' },
  { law: 'RA 3661', year: 1963, name: 'Act establishing the PSHS', status: 'repealed' },
] as const;

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

type Source = {
  text?: string;
  law?: string;
  year?: number | null;
  status?: string;
  section?: string;
  heading?: string;
  page?: number | null;
  score?: number;
};

/** All sources an answer used, across every search it ran, without duplicates. */
function collectSources(m: Message): Source[] {
  const byKey = new Map<string, Source>();
  for (const inv of m.toolInvocations ?? []) {
    if (inv.state !== 'result' || inv.toolName !== 'getInformation') continue;
    for (const s of (inv.result as Source[]) ?? []) {
      const key = `${s.law}|${s.section}|${(s.text ?? '').slice(0, 120)}`;
      const seen = byKey.get(key);
      if (!seen || (s.score ?? 0) > (seen.score ?? 0)) byKey.set(key, s);
    }
  }
  return [...byKey.values()].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
}

/** The chunk text without the "[RA 12310 (2025, current law) | ...]" header line. */
function sourceBody(s: Source) {
  return (s.text ?? '').replace(/^\[[^\]\n]*\]\n/, '');
}

function StatusPill({ status }: { status?: string }) {
  if (status === 'current')
    return (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200">
        current law
      </span>
    );
  if (status === 'repealed')
    return (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800 ring-1 ring-amber-200">
        repealed
      </span>
    );
  return null;
}

function Sources({ sources }: { sources: Source[] }) {
  if (sources.length === 0) return null;
  return (
    <details className="group mt-2 w-full max-w-[min(100%,42rem)] text-sm">
      <summary className="inline-flex cursor-pointer select-none items-center gap-1.5 rounded-md px-1 py-0.5 text-slate-600 hover:text-slate-900">
        <span className="transition-transform group-open:rotate-90">▸</span>
        Sources ({sources.length})
      </summary>
      <ol className="mt-2 space-y-2">
        {sources.map((s, i) => (
          <li key={i} className="rounded-lg border border-slate-200 bg-white">
            <details className="group/src">
              <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2">
                <span className="font-semibold text-slate-900">{s.law}</span>
                <span className="text-slate-700">
                  {s.section}
                  {s.heading ? ` · ${s.heading}` : ''}
                </span>
                {s.page ? <span className="text-slate-500">p. {s.page}</span> : null}
                <StatusPill status={s.status} />
                <span className="ml-auto text-xs text-slate-400 group-open/src:hidden">show text</span>
                <span className="ml-auto hidden text-xs text-slate-400 group-open/src:inline">hide</span>
              </summary>
              <p className="whitespace-pre-line border-t border-slate-100 px-3 py-2 text-[13px] leading-relaxed text-slate-700">
                {sourceBody(s)}
              </p>
            </details>
          </li>
        ))}
      </ol>
    </details>
  );
}

// ---------------------------------------------------------------------------
// Markdown in answers
// ---------------------------------------------------------------------------

const md: Components = {
  p: ({ children }) => <p className="my-2 first:mt-0 last:mb-0">{children}</p>,
  ul: ({ children }) => <ul className="my-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="my-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-slate-900">{children}</strong>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-blue-700 underline">
      {children}
    </a>
  ),
  blockquote: ({ children }) => (
    <blockquote className="my-2 border-l-2 border-slate-300 pl-3 text-slate-600">{children}</blockquote>
  ),
  h1: ({ children }) => <p className="my-2 font-semibold">{children}</p>,
  h2: ({ children }) => <p className="my-2 font-semibold">{children}</p>,
  h3: ({ children }) => <p className="my-2 font-semibold">{children}</p>,
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function Page() {
  const { messages, input, handleInputChange, handleSubmit, append, setMessages, status, error, reload } =
    useChat({ api: '/api/chat' });

  const busy = status === 'submitted' || status === 'streaming';
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  const last = messages[messages.length - 1];
  const searching =
    status === 'submitted' ||
    (busy && last?.role === 'assistant' && (last.toolInvocations ?? []).some((t) => t.state !== 'result') && !last.content);

  const ask = (q: string) => {
    if (!busy) append({ role: 'user', content: q });
  };

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-800 text-lg font-bold text-white" aria-hidden>
            §
          </div>
          <div className="min-w-0">
            <h1 className="text-base font-bold leading-tight sm:text-lg">PSHS Law Guide</h1>
            <p className="truncate text-xs text-slate-500 sm:text-sm">
              Answers from the laws governing the Philippine Science High School System
            </p>
          </div>
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => setMessages([])}
              disabled={busy}
              className="ml-auto shrink-0 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-100 disabled:opacity-40"
            >
              New chat
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
        {messages.length === 0 ? (
          <section className="space-y-6">
            <div>
              <h2 className="text-xl font-semibold sm:text-2xl">Ask about the PSHS laws</h2>
              <p className="mt-2 text-slate-600">
                Ask how the PSHS System is set up and governed: its Board, officials, campuses, scholars, faculty and
                funding, and how the rules changed from 1963 to today. Answers come only from the texts below, and each
                one cites the law and section it relies on.
              </p>
            </div>

            <div>
              <h3 className="mb-2 text-sm font-medium text-slate-500">Try a question</h3>
              <div className="flex flex-wrap gap-2">
                {EXAMPLES.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="rounded-full border border-blue-200 bg-white px-3 py-1.5 text-left text-sm text-blue-900 shadow-sm hover:border-blue-400 hover:bg-blue-50"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-medium text-slate-500">What&apos;s in the library</h3>
              <ul className="divide-y divide-slate-100">
                {LIBRARY.map((d) => (
                  <li key={d.law} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-2 text-sm">
                    <span className="font-semibold">{d.law}</span>
                    <span className="text-slate-600">
                      {d.name} ({d.year})
                    </span>
                    <span className="ml-auto">
                      <StatusPill status={d.status} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-xs leading-relaxed text-slate-500">
              An unofficial student project, not legal advice. The texts were retyped from public copies and may contain
              errors; the official versions in the Official Gazette prevail. Questions outside these laws (for example,
              exam scores or school calendars) will get an &ldquo;I don&apos;t know.&rdquo;
            </p>
          </section>
        ) : (
          <ul className="space-y-5">
            {messages.map((m) =>
              m.role === 'user' ? (
                <li key={m.id} className="flex justify-end">
                  <span className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-blue-800 px-4 py-2 text-white">
                    {m.content}
                  </span>
                </li>
              ) : (
                <li key={m.id} className="flex flex-col items-start">
                  {m.content && (
                    <div className="max-w-full rounded-2xl rounded-bl-md border border-slate-200 bg-white px-4 py-3 leading-relaxed sm:max-w-[90%]">
                      <ReactMarkdown components={md}>{m.content}</ReactMarkdown>
                    </div>
                  )}
                  <Sources sources={collectSources(m)} />
                </li>
              ),
            )}

            {searching && (
              <li className="flex items-center gap-2 text-sm text-slate-500">
                <span className="h-2 w-2 animate-pulse rounded-full bg-blue-700" />
                Searching the laws…
              </li>
            )}

            {error && (
              <li className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Something went wrong: {error.message}{' '}
                <button type="button" onClick={() => reload()} className="font-medium underline">
                  Try again
                </button>
              </li>
            )}
          </ul>
        )}
        <div ref={bottomRef} />
      </main>

      <div className="sticky bottom-0 border-t border-slate-200 bg-white/95 backdrop-blur">
        <form onSubmit={handleSubmit} className="mx-auto flex max-w-3xl gap-2 px-4 py-3">
          <input
            value={input}
            onChange={handleInputChange}
            aria-label="Your question"
            className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-100"
            placeholder="Ask about the Board, officials, campuses, scholarships…"
            disabled={busy}
          />
          <button
            type="submit"
            disabled={!input.trim() || busy}
            className="rounded-lg bg-blue-800 px-4 py-2 font-medium text-white hover:bg-blue-900 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
