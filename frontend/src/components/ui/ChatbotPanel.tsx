/**
 * 챗봇 대화 패널 — Solar API + DB/웹 검색 연동.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../../api/client";
import {
  getChatPrompt,
  sendChatMessage,
  updateChatPrompt,
} from "../../api/client";
import { IconChatSolid } from "./icons";

interface ChatbotPanelProps {
  open: boolean;
  onClose: () => void;
  docId?: string;
}

export function ChatbotPanel({ open, onClose, docId }: ChatbotPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [showPromptEditor, setShowPromptEditor] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  const [promptSaving, setPromptSaving] = useState(false);
  const [promptStatus, setPromptStatus] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    getChatPrompt()
      .then((data) => {
        setSystemPrompt(data.system_prompt);
        setPromptDraft(data.system_prompt);
      })
      .catch(() => {
        setError("프롬프트를 불러오지 못했습니다.");
      });
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

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
      const res = await sendChatMessage(text, messages, docId);
      setMessages([...nextHistory, { role: "assistant", content: res.reply }]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "챗봇 응답 실패");
      setMessages(messages);
    } finally {
      setLoading(false);
    }
  }, [docId, input, loading, messages]);

  async function savePrompt() {
    setPromptSaving(true);
    setPromptStatus("");
    try {
      const res = await updateChatPrompt(promptDraft);
      setSystemPrompt(res.system_prompt);
      setPromptStatus("저장됨");
    } catch (err) {
      setPromptStatus(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setPromptSaving(false);
    }
  }

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
          <div className="size-10 rounded-full bg-primary-60 flex items-center justify-center shrink-0">
            <IconChatSolid className="size-6" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-coolgray-90">ERAI 챗봇</p>
            <p className="text-xs text-coolgray-60 truncate">
              {docId ? "현재 문서 맥락 포함" : "DB · 웹 검색 지원"}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowPromptEditor((v) => !v)}
            className="text-xs text-primary-60 hover:underline shrink-0 px-2 py-1"
          >
            프롬프트
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

        {showPromptEditor && (
          <div className="border-b border-coolgray-20 p-3 bg-white shrink-0 max-h-[220px] flex flex-col gap-2">
            <p className="text-xs text-coolgray-60">
              챗봇 system prompt (Solar). 서버에 저장되며 다음 대화부터 적용됩니다.
            </p>
            <textarea
              className="flex-1 min-h-[100px] text-xs border border-coolgray-30 rounded p-2 resize-none outline-none focus:border-primary-60"
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-coolgray-60">{promptStatus}</span>
              <button
                type="button"
                disabled={promptSaving || promptDraft === systemPrompt}
                onClick={savePrompt}
                className="px-3 py-1 text-xs bg-primary-60 text-white rounded disabled:opacity-50"
              >
                {promptSaving ? "저장 중..." : "프롬프트 저장"}
              </button>
            </div>
          </div>
        )}

        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {messages.length === 0 && !loading && (
            <p className="text-sm text-coolgray-60 text-center py-8 leading-relaxed">
              판결문·이지리드·서비스 사용법을 물어보세요.
              <br />
              DB에서 먼저 찾고, 필요하면 웹 검색으로 답합니다.
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
                {msg.content}
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
