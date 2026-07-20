from typing import Literal

from pydantic import BaseModel, Field

DocType = Literal["criminal", "civil", "family", "administrative", "unknown"]
DocumentStage = Literal["uploaded", "summarized", "translated"]


class ImagePlacement(BaseModel):
    id: str
    image_file: str
    line_index: int = 0
    title: str | None = None


class TranslationSegment(BaseModel):
    id: str
    original: str
    easy_text: str
    image_file: str | None = None
    image_url: str | None = None
    title: str | None = None
    source: Literal["db", "solar", "manual"] = "db"
    image_placements: list[ImagePlacement] = Field(default_factory=list)


class ChecklistItemResult(BaseModel):
    id: str
    category: str
    label: str
    status: Literal["pass", "warn", "fail", "manual"]
    detail: str | None = None


class ChecklistReport(BaseModel):
    overall: Literal["pass", "warn", "fail"]
    summary: dict[str, int]
    items: list[ChecklistItemResult] = Field(default_factory=list)


class DocumentResponse(BaseModel):
    id: str
    filename: str
    doc_type: DocType
    stage: DocumentStage
    page_count: int
    full_text: str
    summary: str | None = None
    translation_segments: list[TranslationSegment] = Field(default_factory=list)
    translation_text: str | None = None
    checklist: ChecklistReport | None = None


class SummaryUpdate(BaseModel):
    summary: str
    full_text: str | None = None
    pages: list[str] | None = None
    filename: str | None = None
    doc_type: DocType | None = None


class RefineRequest(BaseModel):
    prompt: str


class TranslationUpdate(BaseModel):
    segments: list[TranslationSegment]
    full_text: str | None = None
    pages: list[str] | None = None
    filename: str | None = None
    doc_type: DocType | None = None
    summary: str | None = None


class ExportRequest(BaseModel):
    summary: str | None = None
    segments: list[TranslationSegment] | None = None
    translation_text: str | None = None
    filename: str | None = None
    doc_type: DocType | None = None
    full_text: str | None = None
    pages: list[str] | None = None


class SummarizeRequest(BaseModel):
    full_text: str | None = None
    doc_type: DocType | None = None
    filename: str | None = None
    pages: list[str] | None = None


class UploadResponse(BaseModel):
    id: str
    filename: str
    doc_type: DocType
    page_count: int
    message: str
    pages: list[str] = Field(default_factory=list)
    full_text: str = ""


class ImageCatalogItem(BaseModel):
    image_file: str
    title: str
    url: str
