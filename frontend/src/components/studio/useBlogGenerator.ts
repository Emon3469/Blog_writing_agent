"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { errorMessage, isAbort, streamEvents, type StreamEvent } from "@/lib/api";
import type { Source } from "@/lib/store";

export type StageId = "router" | "research" | "plan" | "writing" | "images" | "done";
export type StageStatus = "idle" | "active" | "done" | "skipped" | "error";

export type SectionState = {
  id: number;
  title: string;
  goal?: string;
  words: number;
  content: string;
  status: "pending" | "writing" | "done";
};

export type PlanInfo = {
  blog_title: string;
  audience: string;
  tone: string;
  blog_kind: string;
};

export type GenerationResult = {
  title: string;
  markdown: string;
  mode?: string;
  blogKind?: string | null;
  providers: string[];
  sources: Source[];
  elapsedMs: number;
};

export type GenerateInput = {
  topic: string;
  tone?: string;
  audience?: string;
  template?: string;
  length: "short" | "medium" | "long";
  include_images: boolean;
  force_research: boolean;
  notes?: string;
};

const INITIAL_STAGES: Record<StageId, StageStatus> = {
  router: "idle",
  research: "idle",
  plan: "idle",
  writing: "idle",
  images: "idle",
  done: "idle",
};

export function useBlogGenerator(onComplete: (result: GenerationResult, input: GenerateInput) => void) {
  const [running, setRunning] = useState(false);
  const [stages, setStages] = useState(INITIAL_STAGES);
  const [route, setRoute] = useState<{ mode: string; reason: string; queries: string[] } | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [plan, setPlan] = useState<PlanInfo | null>(null);
  const [sections, setSections] = useState<SectionState[]>([]);
  const [result, setResult] = useState<GenerationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const controllerRef = useRef<AbortController | null>(null);
  const sectionsRef = useRef<SectionState[]>([]);
  const frameRef = useRef<number | null>(null);
  const completeRef = useRef(onComplete);

  useEffect(() => {
    completeRef.current = onComplete;
  }, [onComplete]);

  useEffect(
    () => () => {
      controllerRef.current?.abort();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  const scheduleFlush = useCallback(() => {
    if (frameRef.current) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setSections(sectionsRef.current.map((s) => ({ ...s })));
    });
  }, []);

  const patchSection = useCallback(
    (id: number, patch: (s: SectionState) => Partial<SectionState>) => {
      sectionsRef.current = sectionsRef.current.map((s) => (s.id === id ? { ...s, ...patch(s) } : s));
      scheduleFlush();
    },
    [scheduleFlush],
  );

  const setStage = (id: StageId, status: StageStatus) => setStages((s) => ({ ...s, [id]: status }));

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    sectionsRef.current = [];
    setStages(INITIAL_STAGES);
    setRoute(null);
    setSources([]);
    setPlan(null);
    setSections([]);
    setResult(null);
    setError(null);
    setNotice(null);
    setStartedAt(null);
    setRunning(false);
  }, []);

  const handle = useCallback(
    (event: StreamEvent, input: GenerateInput) => {
      switch (event.type) {
        case "stage": {
          const stage = event.stage as StageId;
          setStages((s) => {
            const next = { ...s, [stage]: "active" as StageStatus };
            if (stage === "research" || stage === "plan") next.router = "done";
            if (stage === "plan" && s.research === "idle") next.research = "skipped";
            if (stage === "plan" && s.research === "active") next.research = "done";
            if (stage === "images") next.writing = "done";
            return next;
          });
          break;
        }
        case "notice":
        case "queued":
          setNotice(String(event.message || ""));
          break;
        case "route":
          setRoute({ mode: String(event.mode), reason: String(event.reason || ""), queries: (event.queries as string[]) || [] });
          break;
        case "research":
          setSources((event.sources as Source[]) || []);
          setStage("research", "done");
          break;
        case "plan": {
          setNotice(null);
          const p = event.plan as PlanInfo & { tasks: { id: number; title: string; goal: string; target_words: number }[] };
          setPlan({ blog_title: p.blog_title, audience: p.audience, tone: p.tone, blog_kind: p.blog_kind });
          sectionsRef.current = p.tasks.map((t) => ({
            id: t.id,
            title: t.title,
            goal: t.goal,
            words: t.target_words,
            content: "",
            status: "pending",
          }));
          setSections(sectionsRef.current);
          setStages((s) => ({ ...s, plan: "done", writing: "active" }));
          break;
        }
        case "section_start":
          patchSection(Number(event.id), () => ({ status: "writing" }));
          break;
        case "section_delta":
          setNotice(null);
          patchSection(Number(event.id), (s) => ({ content: s.content + String(event.delta ?? "") }));
          break;
        case "section_reset":
          patchSection(Number(event.id), () => ({ content: "" }));
          break;
        case "section_done":
          patchSection(Number(event.id), () => ({ content: String(event.markdown ?? ""), status: "done" }));
          break;
        case "done": {
          const res: GenerationResult = {
            title: String(event.title || input.topic),
            markdown: String(event.markdown || ""),
            mode: event.mode as string | undefined,
            blogKind: (event.blog_kind as string | null) ?? null,
            providers: (event.providers as string[]) || [],
            sources: (event.sources as Source[]) || [],
            elapsedMs: Number(event.elapsed_ms || 0),
          };
          setStages((s) => ({
            ...s,
            writing: "done",
            images: input.include_images ? (s.images === "active" ? "done" : "skipped") : "skipped",
            done: "done",
          }));
          setNotice(null);
          setResult(res);
          completeRef.current(res, input);
          break;
        }
      }
    },
    [patchSection],
  );

  const start = useCallback(
    async (input: GenerateInput) => {
      reset();
      const controller = new AbortController();
      controllerRef.current = controller;
      setRunning(true);
      setStartedAt(Date.now());
      setStages({ ...INITIAL_STAGES, router: "active" });
      let finished = false;
      try {
        await streamEvents(
          "/api/generate",
          input,
          (event) => {
            if (event.type === "done") finished = true;
            handle(event, input);
          },
          controller.signal,
        );
        if (!finished) throw new Error("The connection closed before the post was finished. Please try again.");
      } catch (err) {
        if (isAbort(err)) {
          setError("Generation stopped.");
        } else {
          setError(errorMessage(err));
        }
        setStages((s) => {
          const next = { ...s };
          (Object.keys(next) as StageId[]).forEach((k) => {
            if (next[k] === "active") next[k] = "error";
          });
          return next;
        });
      } finally {
        if (controllerRef.current === controller) controllerRef.current = null;
        setNotice(null);
        setRunning(false);
      }
    },
    [handle, reset],
  );

  const stop = useCallback(() => controllerRef.current?.abort(), []);

  return { running, stages, route, sources, plan, sections, result, error, notice, startedAt, start, stop, reset };
}
