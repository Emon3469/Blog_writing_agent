import type { LucideIcon } from "lucide-react";
import {
  BookOpen,
  Boxes,
  GitCompareArrows,
  GraduationCap,
  ListOrdered,
  Megaphone,
  Newspaper,
  PenLine,
} from "lucide-react";

export type Template = {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  tone: string;
  length: "short" | "medium" | "long";
  example: string;
  notes?: string;
  research?: boolean;
};

export const TEMPLATES: Template[] = [
  {
    id: "blog-post",
    name: "Blog Post",
    description: "A well-structured long-form article with a strong hook, clear sections and takeaways.",
    icon: PenLine,
    tone: "Clear, confident and practical",
    length: "medium",
    example: "Why small teams should adopt trunk-based development",
  },
  {
    id: "essay",
    name: "Essay",
    description: "Develop and present a strategic argument with evidence, counterpoints and a firm conclusion.",
    icon: BookOpen,
    tone: "Thoughtful, persuasive and well-reasoned",
    length: "medium",
    example: "The case for boring technology in 2026",
    notes: "Write as an argumentative essay with a clear thesis and addressed counterarguments.",
  },
  {
    id: "tutorial",
    name: "Technical Tutorial",
    description: "Step-by-step guide with runnable code, prerequisites and troubleshooting tips.",
    icon: GraduationCap,
    tone: "Hands-on, precise and encouraging",
    length: "long",
    example: "Build a streaming chat API with FastAPI and Server-Sent Events",
    notes: "Include prerequisites, numbered steps, code snippets for most sections and a troubleshooting section.",
  },
  {
    id: "news-roundup",
    name: "News Roundup",
    description: "Up-to-date digest of what happened this week, grounded in cited sources.",
    icon: Newspaper,
    tone: "Crisp, neutral and informative",
    length: "medium",
    example: "This week in AI: model releases and policy updates",
    research: true,
  },
  {
    id: "comparison",
    name: "Comparison",
    description: "Side-by-side evaluation with criteria, tables and a clear recommendation.",
    icon: GitCompareArrows,
    tone: "Balanced, analytical and decisive",
    length: "medium",
    example: "PostgreSQL vs MongoDB for a growing SaaS product",
    notes: "Include at least one comparison table and a 'which should you choose' section.",
    research: true,
  },
  {
    id: "system-design",
    name: "System Design",
    description: "Architecture deep-dive covering requirements, components, trade-offs and scaling.",
    icon: Boxes,
    tone: "Rigorous and engineering-focused",
    length: "long",
    example: "Designing a URL shortener that handles 10k requests per second",
  },
  {
    id: "listicle",
    name: "Listicle",
    description: "Scannable numbered list of tips or tools, each with a short explanation.",
    icon: ListOrdered,
    tone: "Lively, punchy and useful",
    length: "short",
    example: "9 VS Code extensions that save me an hour a day",
    notes: "Structure the body as a numbered list of items with a short explanation for each.",
  },
  {
    id: "launch",
    name: "Product Launch",
    description: "Announcement post that explains the problem, the solution and how to get started.",
    icon: Megaphone,
    tone: "Energetic, customer-centric and clear",
    length: "short",
    example: "Introducing offline mode for our mobile app",
  },
];

export function findTemplate(id?: string | null) {
  return TEMPLATES.find((t) => t.id === id);
}
