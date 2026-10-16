import { beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "draftsmith.library.v1";

async function freshStore() {
  vi.resetModules();
  return import("@/lib/store");
}

beforeEach(() => localStorage.clear());

describe("library store", () => {
  it("creates, updates and deletes documents and persists them", async () => {
    const store = await freshStore();
    const doc = store.createDoc({ title: "First", content: "# First\n\nBody", origin: "manual" });
    expect(doc.id).toMatch(/^d_/);
    expect(doc.status).toBe("draft");
    expect(store.getDoc(doc.id)?.title).toBe("First");

    await new Promise((r) => setTimeout(r, 2));
    store.updateDoc(doc.id, { title: "Renamed", status: "published" });
    const updated = store.getDoc(doc.id)!;
    expect(updated.title).toBe("Renamed");
    expect(updated.status).toBe("published");
    expect(updated.updatedAt > updated.createdAt).toBe(true);

    const persisted = JSON.parse(localStorage.getItem(KEY)!);
    expect(persisted.docs[0].title).toBe("Renamed");

    const reloaded = await freshStore();
    expect(reloaded.getDoc(doc.id)?.title).toBe("Renamed");

    reloaded.deleteDoc(doc.id);
    expect(reloaded.getDoc(doc.id)).toBeUndefined();
  });

  it("detaches chats from a deleted document", async () => {
    const store = await freshStore();
    const doc = store.createDoc({ title: "Doc", content: "x", origin: "manual" });
    store.upsertConversation({ id: "c1", title: "Chat", messages: [], docId: doc.id, updatedAt: new Date().toISOString() });
    store.deleteDoc(doc.id);
    const state = JSON.parse(localStorage.getItem(KEY)!);
    expect(state.conversations[0].docId).toBeNull();
  });

  it("imports documents without duplicating ids", async () => {
    const store = await freshStore();
    const doc = store.createDoc({ title: "A", content: "a", origin: "manual" });
    store.importDocs([doc, { ...doc, id: "d_other", title: "B" }]);
    const state = JSON.parse(localStorage.getItem(KEY)!);
    expect(state.docs.map((d: { title: string }) => d.title).sort()).toEqual(["A", "B"]);
  });

  it("keeps conversations sorted and capped", async () => {
    const store = await freshStore();
    for (let i = 0; i < 55; i++) {
      store.upsertConversation({ id: `c${i}`, title: `t${i}`, messages: [], updatedAt: new Date(2026, 0, 1, 0, i).toISOString() });
    }
    const state = JSON.parse(localStorage.getItem(KEY)!);
    expect(state.conversations).toHaveLength(50);
    expect(state.conversations[0].id).toBe("c54");
    store.upsertConversation({ id: "c54", title: "edited", messages: [], updatedAt: new Date(2027, 0, 1).toISOString() });
    expect(JSON.parse(localStorage.getItem(KEY)!).conversations.filter((c: { id: string }) => c.id === "c54")).toHaveLength(1);
  });

  it("caps notices and tracks read state", async () => {
    const store = await freshStore();
    for (let i = 0; i < 25; i++) store.pushNotice({ title: `n${i}`, body: "b" });
    let state = JSON.parse(localStorage.getItem(KEY)!);
    expect(state.notices).toHaveLength(20);
    expect(state.notices[0].title).toBe("n24");
    store.markNoticesRead();
    state = JSON.parse(localStorage.getItem(KEY)!);
    expect(state.notices.every((n: { read: boolean }) => n.read)).toBe(true);
  });

  it("recovers from corrupted storage", async () => {
    localStorage.setItem(KEY, "{definitely not json");
    const store = await freshStore();
    const doc = store.createDoc({ title: "Fresh", content: "x", origin: "manual" });
    expect(store.getDoc(doc.id)).toBeTruthy();
  });

  it("keeps working when storage is full", async () => {
    const store = await freshStore();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const doc = store.createDoc({ title: "In memory", content: "x", origin: "manual" });
    expect(store.getDoc(doc.id)?.title).toBe("In memory");
    spy.mockRestore();
  });

  it("stores and updates preferences", async () => {
    const store = await freshStore();
    store.updatePreferences({ name: "Sam", defaultLength: "long" });
    const saved = JSON.parse(localStorage.getItem("draftsmith.prefs.v1")!);
    expect(saved).toMatchObject({ name: "Sam", defaultLength: "long", includeImages: true });
  });

  it("computes doc metrics", async () => {
    const store = await freshStore();
    const doc = store.createDoc({ title: "M", content: "One two three. Four five.", origin: "manual" });
    const [m] = store.docMetrics([doc]);
    expect(m.words).toBe(5);
    expect(m.doc.id).toBe(doc.id);
  });
});
