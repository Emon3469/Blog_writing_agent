from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field

BlogKind = Literal["explainer", "tutorial", "news_roundup", "comparison", "system_design", "opinion"]
ResearchMode = Literal["closed_book", "hybrid", "open_book"]


class Task(BaseModel):
    id: int
    title: str
    goal: str = Field(..., description="One sentence describing what the reader should do or understand.")
    bullets: List[str] = Field(..., description="3 to 6 concrete points to cover, in order.")
    target_words: int = Field(..., description="Target words for the section, between 120 and 450.")
    tags: List[str] = Field(default_factory=list)
    requires_research: bool = False
    requires_citations: bool = False
    requires_code: bool = False


class Plan(BaseModel):
    blog_title: str
    audience: str
    tone: str
    blog_kind: BlogKind = "explainer"
    constraints: List[str] = Field(default_factory=list)
    tasks: List[Task]


class EvidenceItem(BaseModel):
    title: str
    url: str
    published_at: Optional[str] = None
    snippet: Optional[str] = None
    source: Optional[str] = None


class RouterDecision(BaseModel):
    needs_research: bool
    mode: ResearchMode
    reason: str
    queries: List[str] = Field(default_factory=list)


class ImageSpec(BaseModel):
    placeholder: str = Field(..., description="Exactly [[IMAGE_1]], [[IMAGE_2]] or [[IMAGE_3]].")
    alt: str
    caption: str
    prompt: str = Field(..., description="Detailed prompt for a clean, labelled technical illustration.")


class ImagePlan(BaseModel):
    images: List[ImageSpec] = Field(default_factory=list)
    anchors: List[str] = Field(
        default_factory=list,
        description="For each image, the exact '## ' heading line it should be placed under, same order as images.",
    )


class Suggestion(BaseModel):
    title: str = Field(..., description="Short imperative headline, max 7 words.")
    detail: str = Field(..., description="One or two sentences explaining what to change and why.")
    kind: Literal["structure", "clarity", "grammar", "style", "seo", "engagement"] = "clarity"


class SuggestionList(BaseModel):
    suggestions: List[Suggestion] = Field(default_factory=list)
