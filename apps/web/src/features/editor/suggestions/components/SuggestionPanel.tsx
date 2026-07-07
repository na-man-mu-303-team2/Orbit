import type { AiSuggestion, ApplyAiSuggestionResponse, Deck } from "@orbit/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, RefreshCw, Sparkles, X } from "lucide-react";
import {
  aiSuggestionsQueryKey,
  applyAiSuggestion,
  fetchAiSuggestions,
  rejectAiSuggestion
} from "../api/suggestionApi";

export function SuggestionPanel(props: {
  deck: Deck;
  projectId: string;
  slideId: string | null;
  onApplySuccess: (response: ApplyAiSuggestionResponse) => void;
}) {
  const { deck, projectId, slideId, onApplySuccess } = props;
  const queryClient = useQueryClient();
  const queryParams = {
    deckId: deck.deckId,
    slideId: slideId ?? undefined
  };
  const suggestionsQuery = useQuery({
    queryKey: aiSuggestionsQueryKey(projectId, queryParams),
    queryFn: () => fetchAiSuggestions(projectId, queryParams),
    enabled: Boolean(slideId),
    retry: false
  });
  const applyMutation = useMutation({
    mutationFn: (suggestionId: string) => applyAiSuggestion(projectId, suggestionId),
    onSuccess: (response) => {
      onApplySuccess(response);
      void queryClient.invalidateQueries({
        queryKey: ["ai-suggestions", projectId]
      });
    }
  });
  const rejectMutation = useMutation({
    mutationFn: (suggestionId: string) => rejectAiSuggestion(projectId, suggestionId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ["ai-suggestions", projectId]
      });
    }
  });
  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  const hasPendingMutation = applyMutation.isPending || rejectMutation.isPending;

  return (
    <section className="suggestion-panel" aria-label="AI 제안">
      <div className="suggestion-panel-header">
        <div>
          <p className="panel-kicker">Suggestions</p>
          <h3>AI 제안 검토</h3>
        </div>
        <button
          className="icon-button"
          type="button"
          onClick={() => void suggestionsQuery.refetch()}
          disabled={!slideId || suggestionsQuery.isFetching}
          aria-label="AI 제안 새로고침"
          title="AI 제안 새로고침"
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {!slideId ? (
        <SuggestionState message="선택된 슬라이드가 없습니다." />
      ) : suggestionsQuery.isPending ? (
        <SuggestionState message="AI 제안을 불러오는 중입니다." />
      ) : suggestionsQuery.isError ? (
        <SuggestionState
          tone="danger"
          message={
            suggestionsQuery.error instanceof Error
              ? suggestionsQuery.error.message
              : "AI 제안을 불러오지 못했습니다."
          }
        />
      ) : suggestions.length === 0 ? (
        <SuggestionState message="현재 슬라이드에 검토할 AI 제안이 없습니다." />
      ) : (
        <div className="suggestion-list">
          {suggestions.map((suggestion) => (
            <SuggestionCard
              key={suggestion.suggestionId}
              suggestion={suggestion}
              disabled={hasPendingMutation}
              onApply={() => applyMutation.mutate(suggestion.suggestionId)}
              onReject={() => rejectMutation.mutate(suggestion.suggestionId)}
            />
          ))}
        </div>
      )}

      {applyMutation.isError ? (
        <SuggestionState
          tone="danger"
          message={
            applyMutation.error instanceof Error
              ? applyMutation.error.message
              : "AI 제안을 적용하지 못했습니다."
          }
        />
      ) : null}

      {rejectMutation.isError ? (
        <SuggestionState
          tone="danger"
          message={
            rejectMutation.error instanceof Error
              ? rejectMutation.error.message
              : "AI 제안을 거절하지 못했습니다."
          }
        />
      ) : null}
    </section>
  );
}

function SuggestionCard(props: {
  suggestion: AiSuggestion;
  disabled: boolean;
  onApply: () => void;
  onReject: () => void;
}) {
  const { suggestion, disabled, onApply, onReject } = props;
  const operationCount = suggestion.patch.operations.length;

  return (
    <article className={`suggestion-card suggestion-card-${suggestion.status}`}>
      <div className="suggestion-card-header">
        <Sparkles size={16} />
        <div>
          <strong>{suggestion.title}</strong>
          {suggestion.summary ? <p>{suggestion.summary}</p> : null}
        </div>
        <span className={`suggestion-status suggestion-status-${suggestion.status}`}>
          {statusLabel(suggestion.status)}
        </span>
      </div>
      <div className="suggestion-meta">
        <span>v{suggestion.baseVersion}</span>
        <span>{operationCount} changes</span>
      </div>
      {suggestion.status === "pending" ? (
        <div className="suggestion-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onReject}
            disabled={disabled}
          >
            <X size={15} />
            거절
          </button>
          <button
            className="primary-button"
            type="button"
            onClick={onApply}
            disabled={disabled}
          >
            <Check size={15} />
            적용
          </button>
        </div>
      ) : null}
    </article>
  );
}

function SuggestionState(props: {
  message: string;
  tone?: "info" | "danger";
}) {
  return (
    <p className={`suggestion-state suggestion-state-${props.tone ?? "info"}`}>
      {props.message}
    </p>
  );
}

function statusLabel(status: AiSuggestion["status"]) {
  switch (status) {
    case "applied":
      return "적용됨";
    case "rejected":
      return "거절됨";
    case "pending":
      return "대기";
  }
}
