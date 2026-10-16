"use client";

import { useSyncExternalStore } from "react";
import { analyze } from "./text";
import { uid } from "./utils";

type Listener = () => void;

function createPersisted<T>(key: string, initial: T) {
  let state: T = initial;
  let loaded = false;
  const listeners = new Set<Listener>();

  const load = () => {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) state = { ...(initial as object), ...JSON.parse(raw) } as T;
    } catch {}
  };

  const persist = () => {
    try {
      window.localStorage.setItem(key, JSON.stringify(state));
    } catch {}
  };

  if (typeof window !== "undefined") {
    window.addEventListener("storage", (e) => {
      if (e.key !== key) return;
      try {
        state = e.newValue ? { ...(initial as object), ...JSON.parse(e.newValue) } : initial;
      } catch {
        state = initial;
      }
      listeners.forEach((l) => l());
    });
  }

  return {
    get: () => {
      load();
      return state;
    },
    set: (updater: (prev: T) => T) => {
      load();
      state = updater(state);
      persist();
      listeners.forEach((l) => l());
    },
    subscribe: (listener: Listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    server: () => initial,
  };
}

export type DocStatus = "draft" | "published";

export type Source = { title: string; url: string; source?: string | null; published_at?: string | null };

export type Doc = {
  id: string;
  title: string;
  content: string;
  topic?: string;
  template?: string;
  kind?: string | null;
  status: DocStatus;
  createdAt: string;
  updatedAt: string;
  sources?: Source[];
  providers?: string[];
  origin: "generated" | "uploaded" | "manual";
};

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string; provider?: string; error?: boolean };

export type Conversation = {
  id: string;
  title: string;
  messages: ChatMessage[];
  docId?: string | null;
  updatedAt: string;
};

export type Notice = { id: string; title: string; body: string; href?: string; at: string; read: boolean };

export type Preferences = {
  name: string;
  defaultLength: "short" | "medium" | "long";
  defaultTone: string;
  defaultAudience: string;
  includeImages: boolean;
};

type LibraryState = {
  docs: Doc[];
  conversations: Conversation[];
  notices: Notice[];
  doneSuggestions: string[];
  suggestionCache: Record<string, { at: string; items: SuggestionItem[] }>;
};

export type SuggestionItem = { title: string; detail: string; kind: string };

const library = createPersisted<LibraryState>("draftsmith.library.v1", {
  docs: [],
  conversations: [],
  notices: [],
  doneSuggestions: [],
  suggestionCache: {},
});

const prefs = createPersisted<Preferences>("draftsmith.prefs.v1", {
  name: "",
  defaultLength: "medium",
  defaultTone: "Clear, confident and practical",
  defaultAudience: "",
  includeImages: true,
});

export function useLibrary() {
  return useSyncExternalStore(library.subscribe, library.get, library.server);
}

export function usePreferences() {
  return useSyncExternalStore(prefs.subscribe, prefs.get, prefs.server);
}

export function useHydrated() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );
}

export function updatePreferences(patch: Partial<Preferences>) {
  prefs.set((p) => ({ ...p, ...patch }));
}

export function getDoc(id: string) {
  return library.get().docs.find((d) => d.id === id);
}

export function createDoc(input: Partial<Doc> & { title: string; content: string; origin: Doc["origin"] }) {
  const now = new Date().toISOString();
  const doc: Doc = { id: uid("d_"), status: "draft", createdAt: now, updatedAt: now, ...input };
  library.set((s) => ({ ...s, docs: [doc, ...s.docs] }));
  return doc;
}

export function updateDoc(id: string, patch: Partial<Doc>) {
  library.set((s) => ({
    ...s,
    docs: s.docs.map((d) => (d.id === id ? { ...d, ...patch, updatedAt: new Date().toISOString() } : d)),
  }));
}

export function deleteDoc(id: string) {
  library.set((s) => ({
    ...s,
    docs: s.docs.filter((d) => d.id !== id),
    conversations: s.conversations.map((c) => (c.docId === id ? { ...c, docId: null } : c)),
  }));
}

export function upsertConversation(conversation: Conversation) {
  library.set((s) => {
    const exists = s.conversations.some((c) => c.id === conversation.id);
    const conversations = exists
      ? s.conversations.map((c) => (c.id === conversation.id ? conversation : c))
      : [conversation, ...s.conversations];
    conversations.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return { ...s, conversations: conversations.slice(0, 50) };
  });
}

export function deleteConversation(id: string) {
  library.set((s) => ({ ...s, conversations: s.conversations.filter((c) => c.id !== id) }));
}

export function pushNotice(notice: Omit<Notice, "id" | "at" | "read">) {
  library.set((s) => ({
    ...s,
    notices: [{ ...notice, id: uid("n_"), at: new Date().toISOString(), read: false }, ...s.notices].slice(0, 20),
  }));
}

export function markNoticesRead() {
  library.set((s) => ({ ...s, notices: s.notices.map((n) => ({ ...n, read: true })) }));
}

export function clearNotices() {
  library.set((s) => ({ ...s, notices: [] }));
}

export function markSuggestionDone(key: string) {
  library.set((s) => ({ ...s, doneSuggestions: [...new Set([...s.doneSuggestions, key])].slice(-200) }));
}

export function cacheSuggestions(docKey: string, items: SuggestionItem[]) {
  library.set((s) => {
    const entries = Object.entries({ ...s.suggestionCache, [docKey]: { at: new Date().toISOString(), items } })
      .sort((a, b) => b[1].at.localeCompare(a[1].at))
      .slice(0, 20);
    return { ...s, suggestionCache: Object.fromEntries(entries) };
  });
}

export function importDocs(docs: Doc[]) {
  library.set((s) => {
    const ids = new Set(s.docs.map((d) => d.id));
    return { ...s, docs: [...docs.filter((d) => d.id && !ids.has(d.id)), ...s.docs] };
  });
}

export function clearLibrary() {
  library.set(() => ({ docs: [], conversations: [], notices: [], doneSuggestions: [], suggestionCache: {} }));
}

export type DocMetrics = ReturnType<typeof analyze> & { doc: Doc };

export function docMetrics(docs: Doc[]): DocMetrics[] {
  return docs.map((doc) => ({ ...analyze(doc.content), doc }));
}
