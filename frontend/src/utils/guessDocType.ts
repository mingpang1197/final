/**
 * 업로드 전 파일명(·짧은 힌트)에서 사건부호로 doc_type 추정 — backend parser.classify_case_number와 동일 기준.
 */
import type { DocType } from "../api/client";

export type KnownDocType = Exclude<DocType, "unknown">;

const CIVIL_SYMBOLS = new Set([
  "가", "가합", "가단", "가소", "나", "다", "라", "마", "그", "바", "머", "자", "차", "러",
  "재가합", "재가단", "재가소", "재나", "재다", "재라", "재마", "재그", "재머", "재자", "재차",
  "준재가합", "준재가단", "준재가소", "준재나", "준재다", "준재라", "준재자", "준재머",
  "카", "카단", "카합", "카공", "카담", "카조", "카구", "카경", "카정", "카단조", "카합조",
  "타경", "타채", "타기", "타인", "타배", "타집",
  "차전", "비", "비단", "비합", "과", "과단", "과합", "동", "인", "전", "지", "상",
]);

const CRIMINAL_SYMBOLS = new Set([
  "고", "고합", "고단", "고정", "고약", "노", "도", "로", "모", "오", "보", "코", "조", "토",
  "초", "초적", "초보", "초기", "초사", "초치", "초재",
  "감고", "감노", "감도", "감로", "감모", "감오", "감토", "감초",
  "재고합", "재고단", "재고정", "재고약", "재노", "재도", "재감고", "재감노", "재감도",
  "고약전",
  "치고", "치노", "치도", "치오", "치초", "치로", "치모",
  "전고", "전노", "전도", "전오", "전초", "전로", "전모",
  "보고", "보노", "보도", "보오", "보초", "보로", "보모",
]);

const FAMILY_SYMBOLS = new Set([
  "준재너단", "준재너합",
  "드", "드합", "드단", "르", "므", "브", "스", "으", "너", "츠",
  "즈", "즈합", "즈단", "즈기", "느", "느합", "느단",
  "후개", "후감", "후기",
  "재드", "재드합", "재드단", "재르", "재므", "재브", "재스", "재너",
  "재즈합", "재즈단", "재즈기", "재느합", "재느단", "재으",
  "준재드", "준재드합", "준재드단", "준재르", "준재므", "준재브", "준재스",
  "준재즈기", "준재느합", "준재느단",
  "정", "정단", "정합",
]);

const ADMIN_SYMBOLS = new Set([
  "구", "구합", "구단", "누", "두", "루", "무", "부", "사", "아",
  "재구", "재구합", "재구단", "재누", "재두", "재루", "재무", "재아", "재부",
  "준재구", "준재구합", "준재구단", "준재누", "준재두", "준재루", "준재아",
]);

const CASE_NUMBER_LABEL = /사\s*건\s*번\s*호/;
const CASE_NUM_PATTERN = /(?:19|20)\d{2}[\s\n]*[가-힣]{1,4}[\s\n]*\d+/g;

function extractCaseNumbersAboveLabel(text: string, maxLinesBefore = 5): string[] {
  const lines = text.split(/\r?\n/);
  const found: string[] = [];
  const seen = new Set<string>();
  const append = (raw: string) => {
    const normalized = raw.replace(/[^0-9가-힣]/g, "");
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      found.push(raw.trim());
    }
  };
  for (let i = 0; i < lines.length; i++) {
    if (!CASE_NUMBER_LABEL.test(lines[i])) continue;
    const start = Math.max(0, i - maxLinesBefore);
    for (let j = start; j < i; j++) {
      for (const m of lines[j].matchAll(CASE_NUM_PATTERN)) {
        append(m[0]);
      }
    }
  }
  return found;
}

function extractCaseNumbersBelowLabel(text: string, maxLinesAfter = 5): string[] {
  const lines = text.split(/\r?\n/);
  const found: string[] = [];
  const seen = new Set<string>();
  const append = (raw: string) => {
    const normalized = raw.replace(/[^0-9가-힣]/g, "");
    if (normalized && !seen.has(normalized)) {
      seen.add(normalized);
      found.push(raw.trim());
    }
  };
  for (let i = 0; i < lines.length; i++) {
    if (CASE_NUMBER_LABEL.test(lines[i])) {
      for (let j = i; j < Math.min(i + maxLinesAfter, lines.length); j++) {
        for (const m of lines[j].matchAll(CASE_NUM_PATTERN)) {
          append(m[0]);
        }
      }
      continue;
    }
    if (lines[i].trim() !== "사") continue;
    let geonIndex: number | null = null;
    for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
      if (lines[j].trim() === "건") {
        geonIndex = j;
        break;
      }
    }
    if (geonIndex === null) continue;
    for (let j = geonIndex; j < Math.min(geonIndex + maxLinesAfter, lines.length); j++) {
      for (const m of lines[j].matchAll(CASE_NUM_PATTERN)) {
        append(m[0]);
      }
    }
  }
  return found;
}

function classifyCaseNumber(caseNum: string): KnownDocType | null {
  const cleaned = caseNum.replace(/[^0-9가-힣]/g, "");
  const match = /^(\d{2,4})([가-힣]{1,4})\d+/.exec(cleaned);
  if (!match) return null;
  const symbol = match[2];
  if (CIVIL_SYMBOLS.has(symbol)) return "civil";
  if (CRIMINAL_SYMBOLS.has(symbol)) return "criminal";
  if (FAMILY_SYMBOLS.has(symbol)) return "family";
  if (ADMIN_SYMBOLS.has(symbol)) return "administrative";
  return null;
}

function voteFromText(hint: string): KnownDocType | null {
  const votes = new Map<KnownDocType, number>();
  const bump = (t: KnownDocType, weight = 1) => votes.set(t, (votes.get(t) ?? 0) + weight);
  const priorityNorm = new Set<string>();
  for (const raw of extractCaseNumbersAboveLabel(hint)) {
    priorityNorm.add(raw.replace(/[^0-9가-힣]/g, ""));
    const kind = classifyCaseNumber(raw);
    if (kind === "criminal" || kind === "civil" || kind === "family") bump(kind, 5);
  }
  for (const raw of extractCaseNumbersBelowLabel(hint)) {
    priorityNorm.add(raw.replace(/[^0-9가-힣]/g, ""));
    const kind = classifyCaseNumber(raw);
    if (kind) bump(kind, 5);
  }
  for (const m of hint.matchAll(CASE_NUM_PATTERN)) {
    const norm = m[0].replace(/[^0-9가-힣]/g, "");
    if (priorityNorm.has(norm)) continue;
    const kind = classifyCaseNumber(m[0]);
    if (kind) bump(kind, 1);
  }
  if (votes.size === 0) return null;
  let best: KnownDocType = "civil";
  let bestN = 0;
  for (const [t, n] of votes) {
    if (n > bestN) {
      bestN = n;
      best = t;
    }
  }
  return best;
}

/** 파일명 등에서 사건부호를 읽어 초기 선택 유형을 반환한다. */
export function guessDocTypeFromFilename(filename: string): KnownDocType {
  return voteFromText(filename) ?? "civil";
}

/** 업로드(OCR) 후 사건 유형 모달 기본값 — 서버 분류 우선. */
export function docTypeForUploadModal(serverType: DocType, filename: string): KnownDocType {
  if (serverType !== "unknown") return serverType;
  return guessDocTypeFromFilename(filename);
}
