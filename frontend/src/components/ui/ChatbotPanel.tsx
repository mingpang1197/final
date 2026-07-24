/**
 * 챗봇 대화 패널 — Solar API + DB/웹 검색 + 시각자료 추천(stub/생성).
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { ChatMessage, ChatVisualAid } from "../../api/client";
import {
  getOpenAISettings,
  sendChatMessage,
  updateOpenAISettings,
} from "../../api/client";
import { EraiLogo } from "./EraiLogo";

interface ChatbotPanelProps {
  open: boolean;
  onClose: () => void;
  docId?: string;
  pagePath?: string;
}

function renderBoldText(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([\s\S]+?)\*\*/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={`plain-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>);
    }
    nodes.push(<strong key={`bold-${match.index}`}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(<span key={`tail-${lastIndex}`}>{text.slice(lastIndex)}</span>);
  }

  if (!nodes.length) {
    return [<span key="plain-0">{text}</span>];
  }

  return nodes;
}

function visualAidImageSrc(aid: ChatVisualAid): string | null {
  if (aid.image_url?.startsWith("http")) return aid.image_url;
  if (aid.image_file) return `/images/${aid.image_file}`;
  if (aid.image_url) return aid.image_url;
  return null;
}

function sourceLabel(source: ChatVisualAid["source"]): string {
  switch (source) {
    case "db":
      return "시각자료 DB";
    case "web":
      return "웹 검색";
    case "generated":
      return "AI 생성";
    default:
      return "준비 중";
  }
}

function VisualAidCard({ aid }: { aid: ChatVisualAid }) {
  const src = visualAidImageSrc(aid);
  return (
    <div className="mt-2 rounded-lg border border-coolgray-20 bg-white p-2 text-left">
      <p className="text-xs font-medium text-primary-90 truncate" title={aid.phrase}>
        {aid.phrase}
      </p>
      {aid.explanation && (
        <p className="text-xs text-coolgray-60 mt-1 line-clamp-3">{aid.explanation}</p>
      )}
      {src ? (
        <img
          src={src}
          alt={aid.title || aid.phrase}
          className="mt-2 max-h-28 w-full object-contain rounded bg-[#f5f0e8]"
          loading="lazy"
        />
      ) : (
        <p className="mt-2 text-xs text-coolgray-60 italic">
          OpenAI API 키를 설정하고 MOCK_IMAGE_GEN=false 이면 AI 그림을 생성할 수 있습니다.
        </p>
      )}
      <p className="text-[10px] text-coolgray-40 mt-1">{sourceLabel(aid.source)}</p>
    </div>
  );
}

export function ChatbotPanel({ open, onClose, docId, pagePath }: ChatbotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [openaiKeyInput, setOpenaiKeyInput] = useState("");
  const [openaiStatus, setOpenaiStatus] = useState<{
    configured: boolean;
    api_key_masked: string;
    image_gen_enabled: boolean;
    source: string;
  } | null>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadOpenAISettings = useCallback(async () => {
    try {
      const status = await getOpenAISettings();
      setOpenaiStatus(status);
    } catch {
      setOpenaiStatus(null);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadOpenAISettings().catch(console.error);
    }
  }, [open, loadOpenAISettings]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading, showSettings]);

  const saveOpenAIKey = useCallback(async () => {
    setSettingsSaving(true);
    setError("");
    try {
      const status = await updateOpenAISettings(openaiKeyInput.trim());
      setOpenaiStatus(status);
      setOpenaiKeyInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "OpenAI 설정 저장 실패");
    } finally {
      setSettingsSaving(false);
    }
  }, [openaiKeyInput]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: "user", content: text };
    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await sendChatMessage(text, messages, docId, pagePath);
      setMessages([
        ...nextHistory,
        {
          role: "assistant",
          content: res.reply,
          visual_aids: res.visual_aids ?? [],
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "챗봇 응답 실패");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }, [docId, input, loading, messages, pagePath]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-end p-4 sm:p-6 pointer-events-none"
      aria-hidden={!open}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/20 pointer-events-auto"
        aria-label="챗봇 닫기"
        onClick={onClose}
      />

      <div className="relative w-full max-w-[420px] h-[min(640px,calc(100vh-6rem))] bg-white border border-coolgray-20 shadow-2xl flex flex-col pointer-events-auto rounded-lg overflow-hidden">
        <header className="flex items-center gap-3 px-4 py-3 border-b border-coolgray-20 bg-coolgray-10 shrink-0">
          <div className="shrink-0 overflow-hidden rounded-md bg-white">
            <EraiLogo size="sm" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-coolgray-90">ERAI 챗봇</p>
            <p className="text-xs text-coolgray-60 truncate">
              {pagePath && pagePath !== "/login" && pagePath !== "/signup"
                ? "현재 화면 · 사용방안 DB"
                : docId
                  ? "현재 문서 맥락 · 시각자료 추천"
                  : "DB · 웹 · 시각자료"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            className="text-xs text-primary-60 hover:text-primary-90 px-2 py-1 shrink-0"
            aria-expanded={showSettings}
          >
            설정
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-coolgray-60 hover:text-coolgray-90 text-xl leading-none px-1"
            aria-label="닫기"
          >
            ×
          </button>
        </header>

        {showSettings && (
          <div className="shrink-0 border-b border-coolgray-20 bg-coolgray-10 px-4 py-3 space-y-2">
            <p className="text-sm font-medium text-coolgray-90">OpenAI API 키</p>
            <p className="text-xs text-coolgray-60 leading-relaxed">
              문구 이해용 AI 시각자료 생성(DALL·E)에 사용합니다. 서버에 저장되며, 키가 없으면
              시각자료 DB·웹 검색만 사용합니다.
            </p>
            {openaiStatus && (
              <p className="text-xs text-coolgray-60">
                현재:{" "}
                {openaiStatus.configured
                  ? `${openaiStatus.api_key_masked} (${openaiStatus.source})`
                  : "미설정"}
                {openaiStatus.image_gen_enabled
                  ? " · AI 생성 사용 가능"
                  : " · AI 생성 꺼짐 (MOCK_IMAGE_GEN=false 필요)"}
              </p>
            )}
            <div className="flex gap-2">
              <input
                type="password"
                value={openaiKeyInput}
                onChange={(e) => setOpenaiKeyInput(e.target.value)}
                placeholder="sk-..."
                autoComplete="off"
                className="flex-1 h-9 px-2 text-sm border border-coolgray-30 bg-white outline-none focus:border-primary-60"
              />
              <button
                type="button"
                onClick={saveOpenAIKey}
                disabled={settingsSaving}
                className="px-3 h-9 bg-primary-60 text-white text-xs font-medium disabled:opacity-50"
              >
                {settingsSaving ? "저장 중" : "저장"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setOpenaiKeyInput("");
                void updateOpenAISettings("").then(setOpenaiStatus).catch(console.error);
              }}
              className="text-xs text-coolgray-60 hover:text-alert underline"
            >
              저장된 키 삭제
            </button>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.length === 0 && !loading && (
            <p className="text-sm text-coolgray-60 text-center py-8 leading-relaxed">
              판결문·이지리드·서비스 사용법을 물어보세요.
              <br />
              답변과 함께 이해를 돕는 시각자료를 추천합니다.
            </p>
          )}

          {messages.map((msg, i) => (
            <div
              key={`${msg.role}-${i}`}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap ${
                  msg.role === "user"
                    ? "bg-primary-60 text-white"
                    : "bg-coolgray-10 text-coolgray-90 border border-coolgray-20"
                }`}
              >
                {msg.role === "assistant" ? renderBoldText(msg.content) : msg.content}
                {msg.role === "assistant" && msg.visual_aids?.length ? (
                  <div className="mt-2 space-y-2 border-t border-coolgray-20 pt-2">
                    <p className="text-xs font-medium text-coolgray-60">시각자료</p>
                    {msg.visual_aids.map((aid, j) => (
                      <VisualAidCard key={`${aid.phrase}-${j}`} aid={aid} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-coolgray-10 border border-coolgray-20 rounded-lg px-3 py-2 text-sm text-coolgray-60">
                답변 생성 중...
              </div>
            </div>
          )}
        </div>

        {error && (
          <p className="px-4 py-2 text-xs text-alert border-t border-coolgray-20 shrink-0">{error}</p>
        )}

        <footer className="p-3 border-t border-coolgray-20 shrink-0">
          <div className="flex gap-2">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="메시지를 입력하세요"
              disabled={loading}
              className="flex-1 h-10 px-3 bg-coolgray-10 border-b border-coolgray-30 text-sm outline-none focus:border-primary-60 disabled:opacity-60"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <button
              type="button"
              onClick={send}
              disabled={loading || !input.trim()}
              className="px-4 h-10 bg-primary-60 text-white text-sm font-medium disabled:opacity-50 hover:bg-primary-90 transition-colors shrink-0"
            >
              전송
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
