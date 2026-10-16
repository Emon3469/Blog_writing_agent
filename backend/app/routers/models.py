from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, Field, field_validator


class GenerateRequest(BaseModel):
    topic: str = Field(..., min_length=3, max_length=400)
    tone: Optional[str] = Field(default=None, max_length=80)
    audience: Optional[str] = Field(default=None, max_length=120)
    template: Optional[str] = Field(default=None, max_length=80)
    length: Literal["short", "medium", "long"] = "medium"
    include_images: bool = False
    force_research: bool = False
    notes: Optional[str] = Field(default=None, max_length=1000)

    @field_validator("topic")
    @classmethod
    def strip_topic(cls, value: str) -> str:
        value = " ".join(value.split())
        if len(value) < 3:
            raise ValueError("Topic is too short")
        return value


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., max_length=24000)


class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., min_length=1, max_length=40)
    context: Optional[str] = Field(default=None, max_length=24000)


class ToolRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=20000)
    instructions: Optional[str] = Field(default=None, max_length=500)


class SuggestRequest(BaseModel):
    text: str = Field(..., min_length=40, max_length=30000)
