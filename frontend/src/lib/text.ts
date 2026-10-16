export type TextStats = {
  words: number;
  sentences: number;
  paragraphs: number;
  readingSeconds: number;
  readability: number;
  grade: string;
};

const WORDS_PER_MINUTE = 230;

export function stripMarkdown(md: string) {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/\|/g, " ")
    .replace(/[*_~]/g, "")
    .replace(/<[^>]+>/g, " ");
}

function syllables(word: string) {
  const w = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!w) return 0;
  if (w.length <= 3) return 1;
  const trimmed = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, "").replace(/^y/, "");
  const groups = trimmed.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

export function gradeLabel(score: number) {
  if (score >= 80) return "Very easy";
  if (score >= 65) return "Easy";
  if (score >= 50) return "Standard";
  if (score >= 30) return "Difficult";
  return "Very difficult";
}

export function analyze(markdown: string): TextStats {
  const text = stripMarkdown(markdown || "");
  const words = text.match(/[A-Za-z0-9'’-]+/g) ?? [];
  const wordCount = words.length;
  const sentenceCount = Math.max(1, (text.match(/[^.!?\n]+[.!?]+(\s|$)/g) ?? []).length || (wordCount ? 1 : 0));
  const paragraphs = (markdown || "").split(/\n\s*\n/).filter((p) => p.trim()).length;
  const syl = words.reduce((sum, w) => sum + syllables(w), 0);

  const score = wordCount
    ? 206.835 - 1.015 * (wordCount / sentenceCount) - 84.6 * (syl / Math.max(1, wordCount))
    : 0;
  const readability = Math.round(Math.max(0, Math.min(100, score)));

  return {
    words: wordCount,
    sentences: wordCount ? sentenceCount : 0,
    paragraphs,
    readingSeconds: Math.round((wordCount / WORDS_PER_MINUTE) * 60),
    readability,
    grade: gradeLabel(readability),
  };
}

export function formatDuration(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

export function excerpt(markdown: string, length = 120) {
  const body = (markdown || "").replace(/^#\s+.*$/m, "");
  const clean = stripMarkdown(body).replace(/\s+/g, " ").trim();
  return clean.length > length ? `${clean.slice(0, length).trimEnd()}…` : clean;
}

export function titleFrom(markdown: string, fallback = "Untitled draft") {
  const match = (markdown || "").match(/^#\s+(.+)$/m);
  return (match?.[1] ?? fallback).trim().slice(0, 140);
}
