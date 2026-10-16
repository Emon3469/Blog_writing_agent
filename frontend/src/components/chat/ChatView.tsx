"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  Copy,
  FileText,
  MessageSquarePlus,
  MessagesSquare,
  Paperclip,
  RotateCcw,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Markdown } from "@/components/Markdown";
import { LogoMark } from "@/components/layout/Logo";
import { Popover } from "@/components/ui/Popover";
import { errorMessage, isAbort, streamText } from "@/lib/api";
import {
  deleteConversation,
  upsertConversation,
  useLibrary,
  usePreferences,
  type ChatMessage,
  type Conversation,
} from "@/lib/store";
import { cn, copyText, timeAgo, uid } from "@/lib/utils";

const STARTERS = [
  { title: "Brainstorm topics", prompt: "Give me 10 fresh blog post ideas for a developer audience interested in AI engineering." },
  { title: "Write an outline", prompt: "Create a detailed outline for a blog post titled 'Shipping LLM features without breaking production'." },
  { title: "Punchier headline", prompt: "Suggest 8 punchy headlines for a post about migrating from REST to GraphQL." },
  { title: "Explain simply", prompt: "Explain vector embeddings to a non-technical reader in under 200 words, with an analogy." },
];

function MessageBubble({
  message,
  streaming,
  notice,
  onRetry,
}: {
  message: ChatMessage;
  streaming: boolean;
  notice?: string | null;
  onRetry?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  if (message.role === "user") {
    return (
      <div className="flex animate-rise justify-end">
        <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-sm leading-relaxed text-canvas">
          {message.content}
        </div>
      </div>
    );
  }
  return (
    <div className="group flex animate-rise gap-3">
      <LogoMark className="mt-0.5 h-7 w-7 shrink-0" />
      <div className="min-w-0 flex-1">
        {message.error ? (
          <div className="rounded-2xl border border-danger/30 bg-danger/5 px-4 py-3 text-sm">
            <p className="text-ink">{message.content}</p>
            {onRetry && (
              <button onClick={onRetry} className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-ink hover:underline">
                <RotateCcw className="h-3 w-3" />
                Try again
              </button>
            )}
          </div>
        ) : message.content ? (
          <div className={cn("text-[15px]", streaming && "[&_.prose-draft>*:last-child]:caret")}>
            <Markdown content={message.content} className="chat-markdown prose-sm sm:prose-base" />
          </div>
        ) : (
          <div className="flex h-7 items-center gap-1" role="status" aria-label="Assistant is typing">
            {[0, 1, 2].map((i) => (
              <span key={i} className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted" style={{ animationDelay: `${i * 120}ms` }} />
            ))}
            {notice && <span className="ml-2 text-xs text-muted">{notice}</span>}
          </div>
        )}
        {!streaming && !message.error && message.content && (
          <div className="mt-1.5 flex items-center gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
            <button
              onClick={async () => {
                if (await copyText(message.content)) {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1500);
                }
              }}
              className="btn-ghost p-1.5"
              aria-label="Copy reply"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
            {onRetry && (
              <button onClick={onRetry} className="btn-ghost p-1.5" aria-label="Regenerate reply">
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            )}
            {message.provider && <span className="ml-1 text-[11px] capitalize text-faint">via {message.provider}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

export function ChatView() {
  const params = useSearchParams();
  const router = useRouter();
  const { conversations, docs } = useLibrary();
  const prefs = usePreferences();

  const [activeId, setActiveId] = useState<string | null>(params.get("c"));
  const [draft, setDraft] = useState<Conversation | null>(null);
  const [input, setInput] = useState("");
  const [docId, setDocId] = useState<string | null>(params.get("doc"));
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const stick = useRef(true);

  const stored = conversations.find((c) => c.id === activeId) ?? null;
  const conversation = draft && draft.id === activeId ? draft : stored;
  const messages = useMemo(() => conversation?.messages ?? [], [conversation]);
  const attached = docs.find((d) => d.id === (conversation?.docId ?? docId));

  useEffect(() => () => controllerRef.current?.abort(), []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  const openConversation = (id: string | null) => {
    if (streamingId) controllerRef.current?.abort();
    setActiveId(id);
    setDraft(null);
    router.replace(id ? `/chat?c=${id}` : "/chat", { scroll: false });
  };

  const run = useCallback(
    async (base: Conversation, history: ChatMessage[]) => {
      const reply: ChatMessage = { id: uid("m_"), role: "assistant", content: "" };
      let convo: Conversation = { ...base, messages: [...history, reply], updatedAt: new Date().toISOString() };
      setDraft(convo);
      setActiveId(convo.id);
      setStreamingId(reply.id);
      stick.current = true;

      const controller = new AbortController();
      controllerRef.current = controller;
      const context = docs.find((d) => d.id === base.docId)?.content;
      let frame = 0;
      let latest = "";

      const flush = () => {
        frame = 0;
        convo = { ...convo, messages: convo.messages.map((m) => (m.id === reply.id ? { ...m, content: latest } : m)) };
        setDraft(convo);
      };

      try {
        const { text, provider } = await streamText(
          "/api/chat",
          {
            messages: history.filter((m) => !m.error).map(({ role, content }) => ({ role, content })),
            context: context ? context.slice(0, 24000) : undefined,
          },
          (_, full) => {
            latest = full;
            setNotice(null);
            if (!frame) frame = requestAnimationFrame(flush);
          },
          controller.signal,
          setNotice,
        );
        if (frame) cancelAnimationFrame(frame);
        latest = text;
        flush();
        convo = { ...convo, messages: convo.messages.map((m) => (m.id === reply.id ? { ...m, provider } : m)) };
      } catch (err) {
        if (frame) cancelAnimationFrame(frame);
        if (isAbort(err)) {
          convo = {
            ...convo,
            messages: convo.messages
              .map((m) => (m.id === reply.id ? { ...m, content: latest } : m))
              .filter((m) => m.id !== reply.id || m.content),
          };
        } else {
          convo = {
            ...convo,
            messages: convo.messages.map((m) => (m.id === reply.id ? { ...m, content: errorMessage(err), error: true } : m)),
          };
        }
      } finally {
        controllerRef.current = null;
        setNotice(null);
        setStreamingId(null);
        convo = { ...convo, updatedAt: new Date().toISOString() };
        upsertConversation(convo);
        setDraft(null);
        router.replace(`/chat?c=${convo.id}`, { scroll: false });
      }
    },
    [docs, router],
  );

  const send = (text?: string) => {
    const content = (text ?? input).trim();
    if (!content || streamingId) return;
    const user: ChatMessage = { id: uid("m_"), role: "user", content };
    const base: Conversation = conversation ?? {
      id: uid("c_"),
      title: content.length > 60 ? `${content.slice(0, 57)}…` : content,
      messages: [],
      docId: docId,
      updatedAt: new Date().toISOString(),
    };
    setInput("");
    void run(base, [...base.messages, user]);
  };

  const retry = () => {
    if (!conversation || streamingId) return;
    const idx = conversation.messages.map((m) => m.role).lastIndexOf("user");
    if (idx === -1) return;
    void run(conversation, conversation.messages.slice(0, idx + 1));
  };

  const attachDoc = (id: string | null) => {
    setDocId(id);
    if (conversation) upsertConversation({ ...conversation, docId: id });
  };

  const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant")?.id;
  const firstName = prefs.name.trim().split(/\s+/)[0];

  return (
    <div className="grid h-[calc(100dvh-7.5rem)] min-h-[520px] gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="panel hidden min-h-0 flex-col p-3 lg:flex">
        <button onClick={() => openConversation(null)} className="btn-primary w-full rounded-xl">
          <MessageSquarePlus className="h-4 w-4" />
          New chat
        </button>
        <p className="mb-1.5 mt-4 px-1 text-[11px] font-medium uppercase tracking-wider text-faint">History</p>
        <div className="-mx-1 flex-1 overflow-y-auto px-1 scrollbar-thin">
          {conversations.length === 0 && <p className="px-2 py-3 text-xs text-muted">Your conversations will appear here.</p>}
          {conversations.map((c) => (
            <div
              key={c.id}
              className={cn(
                "group flex items-center gap-2 rounded-xl px-2.5 py-2 text-sm transition",
                c.id === activeId ? "bg-surface text-ink ring-1 ring-line" : "text-muted hover:bg-subtle hover:text-ink",
              )}
            >
              <button onClick={() => openConversation(c.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate">{c.title}</span>
                <span className="block text-[11px] text-faint">{timeAgo(c.updatedAt)}</span>
              </button>
              <button
                onClick={() => {
                  deleteConversation(c.id);
                  if (c.id === activeId) openConversation(null);
                }}
                className="shrink-0 rounded-lg p-1 text-faint opacity-0 transition hover:text-danger group-hover:opacity-100"
                aria-label="Delete conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </aside>

      <section className="card flex min-h-0 flex-col overflow-hidden">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <MessagesSquare className="h-4 w-4 text-muted" strokeWidth={1.75} />
          <p className="min-w-0 flex-1 truncate text-sm font-medium">{conversation?.title ?? "New conversation"}</p>
          <button onClick={() => openConversation(null)} className="btn-ghost px-2 py-1 text-xs lg:hidden">
            <MessageSquarePlus className="h-4 w-4" />
            New
          </button>
        </header>

        <div
          ref={scrollRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          }}
          className="flex-1 overflow-y-auto scrollbar-thin"
        >
          <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-6 md:px-6">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center pt-6 text-center md:pt-12">
                <LogoMark className="h-12 w-12" />
                <h2 className="mt-4 text-xl font-semibold tracking-tight">
                  {firstName ? `Hi ${firstName}, what are we writing today?` : "What are we writing today?"}
                </h2>
                <p className="mt-1.5 max-w-sm text-sm text-muted">
                  Brainstorm, outline, edit or explain. Attach a document and I&apos;ll use it as context.
                </p>
                <div className="mt-8 grid w-full gap-2 sm:grid-cols-2">
                  {STARTERS.map((s) => (
                    <button
                      key={s.title}
                      onClick={() => send(s.prompt)}
                      className="rounded-xl border border-line bg-surface p-3.5 text-left transition hover:-translate-y-0.5 hover:border-line-strong"
                    >
                      <p className="text-sm font-medium">{s.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-muted">{s.prompt}</p>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              messages.map((m) => (
                <MessageBubble
                  key={m.id}
                  message={m}
                  notice={m.id === streamingId ? notice : null}
                  streaming={m.id === streamingId}
                  onRetry={m.id === lastAssistant && !streamingId ? retry : undefined}
                />
              ))
            )}
          </div>
        </div>

        <div className="border-t border-line p-3 md:p-4">
          <div className="mx-auto max-w-3xl">
            {attached && (
              <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-lg bg-subtle px-2.5 py-1 text-xs text-ink-soft">
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{attached.title}</span>
                <button onClick={() => attachDoc(null)} aria-label="Remove attached document" className="text-faint hover:text-ink">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
              className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 transition focus-within:border-line-strong focus-within:ring-4 focus-within:ring-[var(--ring)]"
            >
              <Popover
                align="left"
                className="bottom-full top-auto mb-2 mt-0 w-72"
                trigger={({ toggle }) => (
                  <button type="button" onClick={toggle} className="btn-ghost p-2" aria-label="Attach a document" title="Attach a document">
                    <Paperclip className="h-4 w-4" />
                  </button>
                )}
              >
                {(close) => (
                  <div className="max-h-64 overflow-y-auto scrollbar-thin">
                    <p className="px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-wider text-faint">Use a document as context</p>
                    {docs.length === 0 && <p className="px-2.5 pb-2 text-xs text-muted">No documents yet.</p>}
                    {docs.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => {
                          attachDoc(d.id);
                          close();
                        }}
                        className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-subtle"
                      >
                        <FileText className="h-3.5 w-3.5 shrink-0 text-muted" />
                        <span className="truncate">{d.title}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Popover>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                maxLength={8000}
                placeholder="Ask anything about your writing…"
                className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-sm leading-relaxed outline-none placeholder:text-faint"
              />
              {streamingId ? (
                <button
                  type="button"
                  onClick={() => controllerRef.current?.abort()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-canvas transition hover:opacity-90"
                  aria-label="Stop generating"
                >
                  <Square className="h-3.5 w-3.5 fill-current" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={!input.trim()}
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink text-canvas transition hover:opacity-90 disabled:opacity-30"
                  aria-label="Send message"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
              )}
            </form>
            <p className="mt-2 text-center text-[11px] text-faint">Enter to send · Shift + Enter for a new line</p>
          </div>
        </div>
      </section>
    </div>
  );
}

