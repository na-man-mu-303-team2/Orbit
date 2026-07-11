import { applyDeckPatch } from "@orbit/editor-core";
import type {
  ApplyDesignAgentProposalResponse,
  Deck,
  DesignAgentProposal,
  Slide
} from "@orbit/shared";
import { ArrowUp } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import {
  applyDesignAgentProposal,
  createDesignAgentMessage
} from "../../design-agent/designAgentApi";
import { DesignProposalPreviewModal } from "./DesignProposalPreviewModal";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  tone?: "error";
};

type PendingPreview = {
  candidateDeck: Deck;
  proposal: DesignAgentProposal;
};

type AiChatPanelProps = {
  projectId: string;
  deck: Deck;
  currentSlide: Slide | null;
  selectedElementIds: string[];
  onProposalApplied: (response: ApplyDesignAgentProposalResponse) => void;
};

const initialMessages: ChatMessage[] = [
  {
    id: "assistant-welcome",
    role: "assistant",
    content: "현재 슬라이드에서 바꾸고 싶은 디자인을 말씀해 주세요."
  }
];

export function AiChatPanel(props: AiChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [draft, setDraft] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [pendingPreview, setPendingPreview] = useState<PendingPreview | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();
    if (!content || !props.currentSlide || isSending) return;

    setMessages((current) => [
      ...current,
      { id: `user-${crypto.randomUUID()}`, role: "user", content }
    ]);
    setDraft("");
    setIsSending(true);

    try {
      const result = await createDesignAgentMessage(props.projectId, {
        ...(sessionIdRef.current ? { sessionId: sessionIdRef.current } : {}),
        content,
        context: {
          deckId: props.deck.deckId,
          baseVersion: props.deck.version,
          canvas: props.deck.canvas,
          slide: props.currentSlide,
          selectedElementIds: props.selectedElementIds,
          theme: props.deck.theme
        }
      });
      sessionIdRef.current = result.sessionId;

      if (result.proposal) {
        const previewResult = applyDeckPatch(props.deck, {
          deckId: result.proposal.deckId,
          baseVersion: result.proposal.baseVersion,
          source: "ai",
          operations: result.proposal.operations
        });
        if (!previewResult.ok) {
          throw new Error("AI 제안의 미리보기를 만들지 못했습니다.");
        }
        setPendingPreview({
          candidateDeck: previewResult.deck,
          proposal: result.proposal
        });
      }

      const warningText = result.proposal?.warnings.length
        ? `\n\n주의: ${result.proposal.warnings.join(" ")}`
        : "";
      setMessages((current) => [
        ...current,
        {
          id: result.responseMessage.messageId,
          role: "assistant",
          content: `${result.responseMessage.content}${
            result.proposal ? "\n\n미리보기를 확인해 주세요." : ""
          }${warningText}`
        }
      ]);
    } catch (error) {
      appendErrorMessage(error);
    } finally {
      setIsSending(false);
    }
  }

  async function handleApplyPreview() {
    if (!pendingPreview || isApplying) return;
    setIsApplying(true);
    try {
      const applied = await applyDesignAgentProposal(
        props.projectId,
        pendingPreview.proposal.proposalId
      );
      props.onProposalApplied(applied);
      setPendingPreview(null);
      setMessages((current) => [
        ...current,
        {
          id: `applied-${applied.proposal.proposalId}`,
          role: "assistant",
          content: "선택한 디자인을 슬라이드에 적용했습니다."
        }
      ]);
    } catch (error) {
      appendErrorMessage(error);
    } finally {
      setIsApplying(false);
    }
  }

  function appendErrorMessage(error: unknown) {
    setMessages((current) => [
      ...current,
      {
        id: `error-${crypto.randomUUID()}`,
        role: "assistant",
        content:
          error instanceof Error
            ? `요청을 처리하지 못했습니다. ${error.message}`
            : "요청을 처리하지 못했습니다.",
        tone: "error"
      }
    ]);
  }

  const canSend = Boolean(draft.trim() && props.currentSlide && !isSending);

  return (
    <section className="ai-chat-panel" aria-label="AI 채팅">
      <div className="ai-chat-history" aria-live="polite">
        {messages.map((message) => (
          <div className={`ai-chat-message ${message.role}`} key={message.id}>
            {message.role === "assistant" ? (
              <span className="ai-chat-avatar" aria-hidden="true">AI</span>
            ) : null}
            <p className={message.tone === "error" ? "error" : undefined}>
              {message.content}
            </p>
          </div>
        ))}
        {isSending ? (
          <div className="ai-chat-message assistant">
            <span className="ai-chat-avatar" aria-hidden="true">AI</span>
            <p>디자인을 검토하고 있습니다...</p>
          </div>
        ) : null}
      </div>

      <form className="ai-chat-composer" onSubmit={handleSubmit}>
        <input
          aria-label="AI에게 메시지 보내기"
          placeholder="바꾸고 싶은 디자인을 말씀해 주세요"
          type="text"
          value={draft}
          disabled={isSending || !props.currentSlide}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button aria-label="메시지 보내기" disabled={!canSend} type="submit">
          <ArrowUp size={17} strokeWidth={2.4} />
        </button>
      </form>

      {pendingPreview ? (
        <DesignProposalPreviewModal
          deck={pendingPreview.candidateDeck}
          slideId={pendingPreview.proposal.slideId}
          summary={pendingPreview.proposal.summary ?? pendingPreview.proposal.title}
          warnings={pendingPreview.proposal.warnings}
          isApplying={isApplying}
          onApply={() => void handleApplyPreview()}
          onClose={() => setPendingPreview(null)}
        />
      ) : null}
    </section>
  );
}
