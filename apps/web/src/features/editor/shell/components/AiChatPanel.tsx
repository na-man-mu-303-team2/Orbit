import { ArrowUp } from "lucide-react";
import { useState, type FormEvent } from "react";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

const initialMessages: ChatMessage[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    content: "무엇을 만들고 싶은지 알려주세요. 현재 프레젠테이션을 함께 다듬어 드릴게요."
  }
];

export function AiChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const content = draft.trim();
    if (!content) {
      return;
    }

    setMessages((current) => [
      ...current,
      {
        id: `user-${Date.now()}`,
        role: "user",
        content
      }
    ]);
    setDraft("");
  }

  return (
    <section className="ai-chat-panel" aria-label="AI 채팅">
      <div className="ai-chat-history" aria-live="polite">
        {messages.map((message) => (
          <div
            className={`ai-chat-message ${message.role}`}
            key={message.id}
          >
            {message.role === "assistant" ? (
              <span className="ai-chat-avatar" aria-hidden="true">
                AI
              </span>
            ) : null}
            <p>{message.content}</p>
          </div>
        ))}
      </div>

      <form className="ai-chat-composer" onSubmit={handleSubmit}>
        <input
          aria-label="AI에게 메시지 보내기"
          placeholder="AI에게 무엇이든 물어보세요"
          type="text"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          aria-label="메시지 보내기"
          disabled={!draft.trim()}
          type="submit"
        >
          <ArrowUp size={17} strokeWidth={2.4} />
        </button>
      </form>
    </section>
  );
}
