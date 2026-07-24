/**
 * 플로팅 FAB + 챗 패널 통합 위젯.
 */
import { useState } from "react";
import { useLocation } from "react-router-dom";
import { ChatbotFab } from "./ChatbotFab";
import { ChatbotPanel } from "./ChatbotPanel";

interface ChatbotWidgetProps {
  docId?: string;
}

export function ChatbotWidget({ docId }: ChatbotWidgetProps) {
  const [open, setOpen] = useState(false);
  const location = useLocation();

  return (
    <>
      <ChatbotFab onClick={() => setOpen(true)} />
      <ChatbotPanel
        open={open}
        onClose={() => setOpen(false)}
        docId={docId}
        pagePath={location.pathname}
      />
    </>
  );
}
