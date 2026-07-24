from __future__ import annotations

"""AI 프롬프트 조립 (YAML 기반).

역할: 판결 유형별 요약·이지리드 작성 규칙 YAML을 읽어 Solar system prompt를 만든다.
주요 기능: build_summary_system_prompt, build_translation_system_prompt.
관계: config(PROMPTS_DIR), models/schemas(DocType), upstage·translator(소비).
"""

from pathlib import Path
from typing import Any

import yaml

from backend.config import DATA_DIR, PROMPTS_DIR
from backend.models.schemas import DocType
from backend.services.easy_read_sanitize import STANDARD_CLOSING

DOC_TYPE_FILES: dict[DocType, str] = {
    "criminal": "criminal.yaml",
    "civil": "civil.yaml",
    "family": "family.yaml",
    "administrative": "administrative.yaml",
    "unknown": "criminal.yaml",
}

_TRANSLATION_OUTPUT_RULES_COMMON = """
## 번역 출력 규칙 (반드시 준수)

1. **문서 제목·표지 줄 금지** — 아래 형태는 **절대 출력하지 마세요**.
   - `<민사판결 이지리드 — …>`, `<형사판결 이지리드 — …>` 등
   - `# <…판결…이지리드…>` 형태의 표지·케이스명 한 줄
   - `<…판결 이지리드 — 작성 요점>`
2. **첫 줄부터 바로 본문 소제목**으로 시작합니다. 아래 **판결 유형별 맨 앞 순서**를 따르세요.
3. `주문`, `청구취지` 같은 원문 용어는 쓰지 말고 규칙의 쉬운 소제목만 사용.
4. 중요한 날짜·금액·판결 결론 등을 강조할 때 `**강조할 글**` 형식(마크다운 굵게)으로 표시하세요.
5. 본문 **맨 마지막 줄**은 반드시 아래 문장 **한 줄만** 출력 (다른 마무리 문구 금지):
   {standard_closing}
6. `※` 면책 문구, `---` 구분선, `이하 빈칸`, `이 요약은 판결문…` 등 **별도 마무리·안내 문구 출력 금지**.
""".strip().replace("{standard_closing}", STANDARD_CLOSING)

_TRANSLATION_OUTPUT_RULES_CRIMINAL_FAMILY = """
## 판결 유형별 맨 앞 소제목 순서 (형사·가사)

1. **`<이 판결의 결론>`** — 주문·선고 내용 (가장 먼저, **유일한 첫 소제목**)
2. **`<이런 결론을 내린 이유>`** — 그다음 이유 전체의 제목
3. 그 아래는 형사·가사 작성 규칙의 하위 소제목(범죄사실·증거·법령·주장·양형, 이혼·양육 등)을 **규칙 순서대로**

**가사 특이**: 가사소송법상 기재사항은 민사에 준하나, **이지리드 소제목 순서만은 형사와 동일**하다.
표현·이유 4단·용어 치환은 `civil.yaml`(민사)을 참고하고, 이혼·양육·친권 등은 `family.yaml`을 따른다.
가사비송 결정서(부록 3-3형)도 같은 순서(결론 → 이유)로 작성한다.

**절대 사용 금지 (형사·가사)**:
- `<이 소송에서 …>`, `<{원고}가 요구하는 것>`, `<{원고}가 원하는 것>` 등 **민사·행정 청구 블록**
- 피고인·당사자 **주장**을 맨 위 청구란처럼 쓰지 말 것 — 형사는 `<피고인 또는 변호인의 주장·쟁점에 대한 판단>` **이유 안**에만
""".strip()

_TRANSLATION_OUTPUT_RULES_CIVIL_ADMIN = """
## 판결 유형별 맨 앞 소제목 순서 (민사·행정)

원문 대응: 청구취지 → 주문 → 이유. 이지리드도 같은 순서로 작성합니다.

1. **`<이 소송에서 {원고}가 요구하는 것>`** 또는 **`<{원고}가 원하는 것>`**
   - 행정: `{원고}`는 청구인(국민) 이름, **행정청에 무엇을 요구하는지** 쉬운 말로
   - 이유에서 청구를 자세히 설명할 때는 이 서두 청구 블록을 **생략**해도 됩니다
2. **`<이 판결의 결론>`** — 주문·선고 (청구 블록 **다음**)
3. **`<이런 결론을 내린 이유>`** — 그다음 이유·쟁점·항변 등 **유형별 규칙 순서**
   - 기초사실·당사자 주장은 축약·생략 가능. **판단(중요 쟁점 1~3개)**을 중점 작성

청구와 결론을 **한 소제목에 합칠 때만** `<{원고}가 원하는 것과 이 판결의 결론>` 사용 (규칙 예시 참고).
민사·행정은 이해 전달을 위해 **재량**을 두되, 두괄식으로 청구·결론을 분명하게 적으세요.
**형사 전용** 소제목(`<범죄사실>` 등)은 민사·행정에서 사용하지 마세요.
""".strip()

_CRIMINAL_FAMILY_TYPES = frozenset({"criminal", "family", "unknown"})


def translation_output_rules(doc_type: DocType) -> str:
    common = _TRANSLATION_OUTPUT_RULES_COMMON
    if doc_type in _CRIMINAL_FAMILY_TYPES:
        return f"{common}\n\n{_TRANSLATION_OUTPUT_RULES_CRIMINAL_FAMILY}"
    if doc_type in ("civil", "administrative"):
        return f"{common}\n\n{_TRANSLATION_OUTPUT_RULES_CIVIL_ADMIN}"
    return f"{common}\n\n{_TRANSLATION_OUTPUT_RULES_CRIMINAL_FAMILY}"


def translation_user_structure_hint(doc_type: DocType) -> str:
    """Solar user 프롬프트용 — 유형별 맨 앞 소제목 한 줄 요약."""
    if doc_type in _CRIMINAL_FAMILY_TYPES:
        return (
            "맨 앞 소제목은 **반드시 `<이 판결의 결론>`만**으로 시작하세요. "
            "그다음 `<이런 결론을 내린 이유>` 및 유형별 하위 소제목을 작성하세요. "
            "`<이 소송에서 …>`, `<…가 요구하는 것>`(민사·행정 청구 틀)은 **사용하지 마세요**. "
            "가사도 형사와 같은 순서입니다(청구 블록 맨 앞 금지)."
        )
    if doc_type in ("civil", "administrative"):
        return (
            "맨 앞 소제목 순서: **① `<이 소송에서 {원고}가 요구하는 것>`(또는 `<{원고}가 원하는 것>`) "
            "→ ② `<이 판결의 결론>` → ③ `<이런 결론을 내린 이유>`**. "
            "전부 인용 시에는 `<{원고}가 원하는 것과 이 판결의 결론>`으로 합칠 수 있습니다. "
            "이유에서는 중요 쟁점 판단 1~3개에 집중하고, 이유에서 청구를 자세히 쓰면 서두 청구는 생략하세요."
        )
    return translation_user_structure_hint("criminal")


# 하위 호환 (import TRANSLATION_OUTPUT_RULES)
TRANSLATION_OUTPUT_RULES = translation_output_rules("criminal")

SUMMARY_COMMON_RULES = """
## 요약 공통 규칙 (반드시 준수)

1. **입력 판결문 전문만** 사용 — 원문에 없는 사건·인물·형량·쟁점을 **추가·추측하지 마세요**.
2. **이지리드 번역이 아닙니다** — "감옥에 ~해야 합니다", "저지른 범죄는 이렇습니다", `<이 판결의 결론>` 같은 **쉬운 말·이지리드 소제목 금지**.
3. **판결문체·중립** — 법원이 인정한 사실과 주문·이유를 **발췌·압축**합니다.
4. 사건번호·당사자명·날짜·금액은 **원문과 일치**하게 적으세요.
5. OCR이 불완전해 내용이 거의 없으면, **"원문 텍스트 부족으로 요약 불가"** 한 줄만 출력하세요.
""".strip()


def _translation_output_order_hint(doc_type: DocType) -> str:
    rules = load_writing_rules(doc_type)
    order = rules.get("section_order") or []
    sections = rules.get("sections") or {}
    lines = ["## 번역 시 본문 소제목 순서 (이지리드 출력용)"]
    for key in order:
        if key == "overview":
            continue
        cfg = sections.get(key)
        if isinstance(cfg, dict) and cfg.get("heading"):
            lines.append(f"- {cfg['heading']}")
    return "\n".join(lines) if len(lines) > 1 else ""


def build_summary_system_prompt(doc_type: DocType) -> str:
    summary = load_summary_prompt(doc_type)
    parts = [
        summary.get("system_prompt", "당신은 판결문 발췌·요약 전문가입니다."),
        "",
        SUMMARY_COMMON_RULES,
        "",
        "## 요약 출력 형식",
        summary.get("output_format", ""),
    ]
    return "\n".join(p for p in parts if p is not None)


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


def build_translation_system_prompt(doc_type: DocType) -> str:
    rules = load_writing_rules(doc_type)
    style = load_easy_read_style()
    order_hint = _translation_output_order_hint(doc_type)
    parts = [
        "당신은 발달장애인이 이해할 수 있는 이지리드(Easy-Read) 판결문 작성 전문가입니다.",
        "입력으로 **발췌 요약**과 **판결문 원문 발췌**가 주어집니다. 요약·원문에 없는 내용을 invent하지 마세요.",
        "아래 **공통 작성 규칙**, **판결 유형별 규칙**, **예시**를 반드시 따르세요.",
        "",
        translation_output_rules(doc_type),
        "",
        _format_easy_read_style(style),
        "",
        "## 판결 유형별 작성 규칙",
        _format_writing_rules(rules, for_translation=True),
        "",
        order_hint,
        "",
        "## Few-shot 예시",
        _format_examples(rules.get("examples", [])),
    ]
    return "\n".join(p for p in parts if p)


def _format_writing_rules(rules: dict[str, Any], *, for_translation: bool = False) -> str:
    if not rules:
        return "(작성 규칙 파일 없음)"
    lines: list[str] = []
    if rules.get("section_label"):
        lines.append(f"대상 섹션: {rules['section_label']}")
    order = rules.get("section_order", [])
    if order:
        visible = [k for k in order if not (for_translation and k == "overview")]
        if visible:
            lines.append(f"섹션 순서: {', '.join(visible)}")
    sections = rules.get("sections", {})
    for key, cfg in sections.items():
        if for_translation and key == "overview":
            continue
        if not isinstance(cfg, dict):
            continue
        lines.append(f"\n### {key}")
        if cfg.get("heading") and not (for_translation and key == "overview"):
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


def excerpt_full_text_for_translation(full_text: str, max_chars: int = 16000) -> str:
    """번역 프롬프트에 넣을 원문 발췌 (토큰 한도)."""
    text = (full_text or "").strip()
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    head = (max_chars * 2) // 3
    tail = max_chars - head - 40
    return f"{text[:head]}\n\n...(원문 중략)...\n\n{text[-tail:]}"


CHATBOT_PROMPT_OVERRIDE = DATA_DIR / "chatbot_prompt.yaml"


def load_chatbot_prompt() -> str:
    """챗봇 system prompt — 사용자 수정본(data/) 우선, 없으면 기본 YAML."""
    if CHATBOT_PROMPT_OVERRIDE.exists():
        data = _load_yaml(CHATBOT_PROMPT_OVERRIDE)
        custom = (data.get("system_prompt") or "").strip()
        if custom:
            return custom
    data = _load_yaml(PROMPTS_DIR / "chatbot.yaml")
    return (data.get("system_prompt") or "당신은 ERAI 판결문 보조 챗봇입니다.").strip()


def save_chatbot_prompt(system_prompt: str) -> None:
    CHATBOT_PROMPT_OVERRIDE.parent.mkdir(parents=True, exist_ok=True)
    with CHATBOT_PROMPT_OVERRIDE.open("w", encoding="utf-8") as f:
        yaml.safe_dump({"system_prompt": system_prompt.strip()}, f, allow_unicode=True, sort_keys=False)
