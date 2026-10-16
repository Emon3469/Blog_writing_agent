import { afterEach, describe, expect, it, vi } from "vitest";
import { TEMPLATES, findTemplate } from "@/lib/templates";
import { cn, compactNumber, slugify, timeAgo, uid } from "@/lib/utils";

afterEach(() => vi.useRealTimers());

describe("utils", () => {
  it("slugifies titles safely", () => {
    expect(slugify("Hello, World! 2026 — Edition")).toBe("hello-world-2026-edition");
    expect(slugify("???")).toBe("draft");
    expect(slugify("a".repeat(200))).toHaveLength(80);
  });

  it("formats relative time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
    expect(timeAgo("2026-10-16T11:59:50Z")).toBe("just now");
    expect(timeAgo("2026-10-16T11:30:00Z")).toBe("30m ago");
    expect(timeAgo("2026-10-16T07:00:00Z")).toBe("5h ago");
    expect(timeAgo("2026-10-13T12:00:00Z")).toBe("3d ago");
    expect(timeAgo("2026-09-01T12:00:00Z")).toBe("01/09/2026");
  });

  it("merges class names", () => {
    expect(cn("p-2", false && "hidden", "p-4")).toBe("p-4");
  });

  it("creates unique ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => uid("x_")));
    expect(ids.size).toBe(200);
  });

  it("formats numbers compactly", () => {
    expect(compactNumber(1484)).toBe("1,484");
    expect(compactNumber(25000)).toBe("25K");
  });
});

describe("templates", () => {
  it("have unique ids and resolve by id", () => {
    expect(new Set(TEMPLATES.map((t) => t.id)).size).toBe(TEMPLATES.length);
    expect(findTemplate("essay")?.name).toBe("Essay");
    expect(findTemplate("missing")).toBeUndefined();
    expect(findTemplate(null)).toBeUndefined();
  });
});
