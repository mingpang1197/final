"""Load summary and writing rule YAML prompts."""

from __future__ import annotations

from pathlib import Path
from typing import Any

import yaml

from backend.config import PROMPTS_DIR
from backend.models.schemas import DocType

DOC_TYPE_FILES: dict[DocType, str] = {
    "criminal": "criminal.yaml",
    "civil": "civil.yaml",
    "family": "family.yaml",
    "administrative": "administrative.yaml",
    "unknown": "criminal.yaml",
}


def _load_yaml(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    with path.open(encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def load_summary_prompt(doc_type: DocType) -> dict[str, Any]:
    filename = DOC_TYPE_FILES.get(doc_type, "criminal.yaml")
    return _load_yaml(PROMPTS_DIR / "summary" / filename)


def load_writing_rules(doc_type: DocType) -> dict[str, Any]:
    filename = DOC_TYPE_FILES.get(doc_type, "criminal.yaml")
    return _load_yaml(PROMPTS_DIR / "writing_rules" / filename)


def load_easy_read_style() -> dict[str, Any]:
    return _load_yaml(PROMPTS_DIR / "writing_rules" / "easy_read_style.yaml")


def _format_easy_read_style(style: dict[str, Any]) -> str:
    if not style:
        return ""
    lines: list[str] = ["## 이지리드 공통 작성 규칙 (반드시 준수)"]
    for key, title in (
        ("words", "단어"),
        ("sentences", "문장"),
        ("paragraphs", "문단"),
    ):
        rules = (style.get("content") or {}).get(key) or []
        if rules:
            lines.append(f"\n### {title}")
            for rule in rules:
                lines.append(f"- {rule}")
    fmt = style.get("format") or {}
    for key, title in (
        ("typography", "글자"),
        ("layout", "지면"),
        ("volume", "분량"),
        ("page_numbers", "쪽번호"),
    ):
        rules = fmt.get(key) or []
        if rules:
            lines.append(f"\n### {title}")
            for rule in rules:
                lines.append(f"- {rule}")
    return "\n".join(lines)


def build_summary_system_prompt(doc_type: DocType) -> str:
    summary = load_summary_prompt(doc_type)
    rules = load_writing_rules(doc_type)
    parts = [
        summary.get("system_prompt", "당신은 판결문 요약 전문가입니다."),
        "",
        "## 요약 출력 형식",
        summary.get("output_format", ""),
        "",
        "## 작성 규칙 (반드시 준수)",
        _format_writing_rules(rules),
        "",
        "## Few-shot 예시",
        _format_examples(rules.get("examples", [])),
    ]
    return "\n".join(p for p in parts if p is not None)


def build_translation_system_prompt(doc_type: DocType) -> str:
    rules = load_writing_rules(doc_type)
    style = load_easy_read_style()
    parts = [
        "당신은 발달장애인이 이해할 수 있는 이지리드(Easy-Read) 판결문 작성 전문가입니다.",
        "아래 **공통 작성 규칙**, **판결 유형별 규칙**, **예시**를 반드시 따르세요.",
        "",
        _format_easy_read_style(style),
        "",
        "## 판결 유형별 작성 규칙",
        _format_writing_rules(rules),
        "",
        "## Few-shot 예시",
        _format_examples(rules.get("examples", [])),
    ]
    return "\n".join(p for p in parts if p)


def _format_writing_rules(rules: dict[str, Any]) -> str:
    if not rules:
        return "(작성 규칙 파일 없음)"
    lines: list[str] = []
    if rules.get("section_label"):
        lines.append(f"대상 섹션: {rules['section_label']}")
    order = rules.get("section_order", [])
    if order:
        lines.append(f"섹션 순서: {', '.join(order)}")
    sections = rules.get("sections", {})
    for key, cfg in sections.items():
        if not isinstance(cfg, dict):
            continue
        lines.append(f"\n### {key}")
        if cfg.get("heading"):
            lines.append(f"- 제목: {cfg['heading']}")
        if cfg.get("avoid_terms"):
            lines.append(f"- 사용 금지: {', '.join(cfg['avoid_terms'])}")
        if cfg.get("placement"):
            lines.append(f"- 배치: {cfg['placement']}")
        for rule in cfg.get("rules", []):
            lines.append(f"- {rule}")
        for pr in cfg.get("phrase_rules", []):
            if isinstance(pr, dict):
                lines.append(f"- {pr.get('match', '')} → {pr.get('write', '')}")
    return "\n".join(lines)


def _format_examples(examples: list[Any]) -> str:
    if not examples:
        return "(예시 없음)"
    blocks: list[str] = []
    for ex in examples:
        if not isinstance(ex, dict):
            continue
        label = ex.get("label", ex.get("id", ""))
        blocks.append(f"### {label}")
        blocks.append(f"[판결원문]\n{ex.get('source', '').strip()}")
        blocks.append(f"[이지리드]\n{ex.get('easy_read', '').strip()}")
    return "\n\n".join(blocks)
