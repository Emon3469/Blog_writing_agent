import { describe, expect, it } from "vitest";
import { analyze, excerpt, formatDuration, gradeLabel, stripMarkdown, titleFrom } from "@/lib/text";

describe("stripMarkdown", () => {
  it("removes markdown syntax but keeps readable text", () => {
    const md = "# Title\n\n**Bold** and _italic_ with [a link](https://x.dev) and `code`.\n\n```ts\nconst x = 1;\n```\n\n- item\n> quote\n![img](a.png)";
    const plain = stripMarkdown(md);
    expect(plain).toContain("Title");
    expect(plain).toContain("Bold and italic with a link and");
    expect(plain).not.toMatch(/const x|https:\/\/x\.dev|a\.png|[#*_`>]/);
  });
});

describe("analyze", () => {
  it("returns zeros for empty input", () => {
    expect(analyze("")).toEqual({ words: 0, sentences: 0, paragraphs: 0, readingSeconds: 0, readability: 0, grade: "Very difficult" });
  });

  it("counts words, sentences and paragraphs", () => {
    const stats = analyze("The cat sat. The dog ran fast!\n\nA second paragraph here?");
    expect(stats.words).toBe(11);
    expect(stats.sentences).toBe(3);
    expect(stats.paragraphs).toBe(2);
  });

  it("scores simple text as easier than dense text", () => {
    const easy = analyze("We go out. We see the sun. It is warm. We play.");
    const hard = analyze(
      "Notwithstanding considerable organizational heterogeneity, interdisciplinary collaboration necessitates comprehensive institutional accommodation of epistemological differences.",
    );
    expect(easy.readability).toBeGreaterThan(hard.readability);
    expect(easy.readability).toBeLessThanOrEqual(100);
    expect(hard.readability).toBeGreaterThanOrEqual(0);
  });

  it("estimates reading time at ~230 wpm and ignores code blocks", () => {
    const words = Array.from({ length: 460 }, () => "word").join(" ");
    expect(analyze(words).readingSeconds).toBe(120);
    expect(analyze("```\n" + words + "\n```").words).toBe(0);
  });
});

describe("helpers", () => {
  it("labels grades", () => {
    expect(gradeLabel(90)).toBe("Very easy");
    expect(gradeLabel(70)).toBe("Easy");
    expect(gradeLabel(55)).toBe("Standard");
    expect(gradeLabel(35)).toBe("Difficult");
    expect(gradeLabel(5)).toBe("Very difficult");
  });

  it("formats durations", () => {
    expect(formatDuration(42)).toBe("42s");
    expect(formatDuration(60)).toBe("1m");
    expect(formatDuration(387)).toBe("6m 27s");
  });

  it("builds excerpts without the H1", () => {
    expect(excerpt("# Title\n\nHello **world**, this is a test.", 15)).toBe("Hello world, th…");
    expect(excerpt("")).toBe("");
  });

  it("extracts the first H1 as title", () => {
    expect(titleFrom("intro\n# My Post\n## Section")).toBe("My Post");
    expect(titleFrom("no heading", "Fallback")).toBe("Fallback");
  });
});
