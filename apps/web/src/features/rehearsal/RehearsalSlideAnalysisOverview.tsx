import { ChevronLeft, ChevronRight, FileText, Layers, SlidersHorizontal, X } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import type {
  Deck,
  DeckSlideContextEntry,
  RehearsalMessageCoverageItem,
  RehearsalReport,
  RehearsalSlideContextInsight,
} from "@orbit/shared";
import { buildRehearsalSlideAnalysisCards } from "./rehearsalSlideAnalysisModel";

const PAGE_SIZE = 3;

const IMPORTANCE_LABEL: Record<string, string> = {
  required: "필수",
  recommended: "권장",
  optional: "선택",
};

const MESSAGE_STATUS_LABEL: Record<RehearsalMessageCoverageItem["status"], string> = {
  delivered: "전달됨",
  partial: "부분 전달",
  missed: "전달 누락",
  unclear: "표현 불명확",
  misleading: "의도와 다름",
};

const PRONUNCIATION_ISSUE_PATTERN =
  /(발음|전사|들려|들릴|혼동|오타|용어 사용|용어 선택|추정)/;

function splitPronunciationIssues(insight: RehearsalSlideContextInsight) {
  const explicit = (insight.pronunciationCautions ?? []).filter(Boolean);
  const fallbackFromIssues =
    explicit.length === 0
      ? insight.deliveryIssues.filter((issue) =>
          PRONUNCIATION_ISSUE_PATTERN.test(issue),
        )
      : [];
  const pronunciationIssues = explicit.length > 0 ? explicit : fallbackFromIssues;
  const deliveryIssues = insight.deliveryIssues.filter(
    (issue) => !pronunciationIssues.includes(issue),
  );

  return { deliveryIssues, pronunciationIssues };
}

type Props = {
  deck: Deck | null;
  formatDelta: (diff: number) => string;
  formatDuration: (totalSeconds: number) => string;
  prevReports: RehearsalReport[];
  report: RehearsalReport;
  slideContextInsights?: RehearsalSlideContextInsight[];
  slideContexts?: DeckSlideContextEntry[] | null;
  projectId?: string;
  onSlideContextsSaved?: (updated: DeckSlideContextEntry[]) => void;
};

export function RehearsalSlideAnalysisOverview({
  deck,
  formatDelta,
  formatDuration,
  prevReports,
  report,
  slideContextInsights,
  slideContexts,
  projectId,
  onSlideContextsSaved,
}: Props) {
  const [page, setPage] = useState(0);
  const [modalSlideId, setModalSlideId] = useState<string | null>(null);
  const [editingEntry, setEditingEntry] = useState<DeckSlideContextEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);

  const openModal = useCallback((slideId: string) => {
    const entry = slideContexts?.find((e) => e.slideId === slideId) ?? null;
    setEditingEntry(entry ? { ...entry, intents: entry.intents.map((i) => ({ ...i })) } : null);
    setModalSlideId(slideId);
  }, [slideContexts]);

  const closeModal = useCallback(() => {
    setModalSlideId(null);
    setEditingEntry(null);
    setSaving(false);
  }, []);

  const handleIntentChange = useCallback((messageId: string, newIntent: string) => {
    setEditingEntry((prev) =>
      prev ? { ...prev, intents: prev.intents.map((i) => i.messageId !== messageId ? i : { ...i, intent: newIntent }) } : prev
    );
  }, []);

  const handleImportanceChange = useCallback((messageId: string, value: string) => {
    setEditingEntry((prev) =>
      prev ? { ...prev, intents: prev.intents.map((i) => i.messageId !== messageId ? i : { ...i, importance: value as "required" | "recommended" | "optional" }) } : prev
    );
  }, []);

  const saveModal = useCallback(async () => {
    if (!editingEntry || !projectId || !slideContexts) return;
    const updated = slideContexts.map((e) => e.slideId === editingEntry.slideId ? editingEntry : e);
    setSaving(true);
    try {
      const res = await fetch(
        `/api/v1/projects/${encodeURIComponent(projectId)}/rehearsal-contexts`,
        { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ deckId: report.deckId, contexts: updated }) }
      );
      if (res.ok) {
        onSlideContextsSaved?.(updated);
        setSavedId(editingEntry.slideId);
        setTimeout(() => { setSavedId(null); closeModal(); }, 1200);
      }
    } finally {
      setSaving(false);
    }
  }, [editingEntry, projectId, slideContexts, report.deckId, onSlideContextsSaved, closeModal]);

  const insightBySlide = useMemo(
    () =>
      new Map(
        (slideContextInsights ?? []).map((insight) => [insight.slideId, insight]),
      ),
    [slideContextInsights],
  );
  const coverageBySlide = useMemo(() => {
    const map = new Map<string, RehearsalMessageCoverageItem[]>();
    for (const item of report.messageCoverage ?? []) {
      const list = map.get(item.slideId) ?? [];
      list.push(item);
      map.set(item.slideId, list);
    }
    return map;
  }, [report.messageCoverage]);

  const problemCards = useMemo(
    () => buildRehearsalSlideAnalysisCards(deck, prevReports, report),
    [deck, prevReports, report],
  );
  const totalPages = Math.max(1, Math.ceil(problemCards.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages - 1);
  const visibleCards = problemCards.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE,
  );

  return (
    <section className="rrd-card">
      <header className="rrd-card-head">
        <Layers size={16} className="rrd-card-icon" />
        <h2>장표별 분석</h2>
        {problemCards.length > 0 && (
          <span className="rrd-card-count">{problemCards.length}장</span>
        )}
      </header>

      {problemCards.length === 0 ? (
        <p className="rrd-empty-hint">
          현재 리허설에서 별도 개선이 필요한 장표가 없습니다.
        </p>
      ) : (
        <>
          <div className="rrd-slide-analysis-list">
            {visibleCards.map((card) => {
              const insight = insightBySlide.get(card.slideId);
              const coverageItems = coverageBySlide.get(card.slideId) ?? [];
              const criteriaEntry =
                slideContexts?.find((entry) => entry.slideId === card.slideId) ?? null;
              const issueGroups = insight ? splitPronunciationIssues(insight) : null;
              return (
                <div key={card.slideId} className="rrd-slide-analysis-item">
                  <div className="rrd-slide-analysis-thumb">
                    {card.thumbnailUrl ? (
                      <img
                        src={card.thumbnailUrl}
                        alt=""
                        className="rrd-slide-thumb-img"
                      />
                    ) : (
                      <div className="rrd-slide-thumb-placeholder">
                        <FileText size={18} />
                      </div>
                    )}
                  </div>

                  <div className="rrd-slide-analysis-body">
                    <div className="rrd-slide-analysis-title-row">
                      <strong className="rrd-slide-analysis-title">
                        {card.slideLabel}
                      </strong>
                      {insight && (
                        <span
                          className={`rrd-context-status-badge rrd-context-status-badge-${insight.deliveryStatus}`}
                        >
                          {insight.deliveryStatus === "clear"
                            ? "전달 명확"
                            : insight.deliveryStatus === "partial"
                              ? "일부 전달"
                              : "전달 약함"}
                        </span>
                      )}
                      {slideContexts?.some((e) => e.slideId === card.slideId) && (
                        <button
                          type="button"
                          className="rrd-slide-criteria-btn"
                          onClick={() => openModal(card.slideId)}
                          title="이 슬라이드의 평가 기준 보기·편집"
                        >
                          <SlidersHorizontal size={13} />
                          평가 기준
                        </button>
                      )}
                    </div>

                    {insight ? (
                      <>
                        {coverageItems.length > 0 && (
                          <div className="rrd-slide-row rrd-slide-row-priority">
                            <span className="rrd-slide-row-label">핵심 메시지별 판단</span>
                            <div className="rrd-message-coverage-list">
                              {coverageItems.map((item, index) => {
                                const matchedIntent =
                                  criteriaEntry?.intents.find(
                                    (intent) => intent.messageId === item.messageId,
                                  ) ?? null;

                                return (
                                  <div
                                    key={`${item.slideId}:${item.messageId}`}
                                    className="rrd-message-coverage-item"
                                  >
                                    <div className="rrd-message-coverage-head">
                                      <strong>
                                        메시지 {index + 1}
                                        {matchedIntent?.intent
                                          ? ` · ${matchedIntent.intent}`
                                          : ""}
                                      </strong>
                                      <span
                                        className={`rrd-message-coverage-badge rrd-message-coverage-badge-${item.status}`}
                                      >
                                        {MESSAGE_STATUS_LABEL[item.status]}
                                      </span>
                                    </div>
                                    <div className="rrd-message-coverage-detail">
                                      <span className="rrd-message-coverage-label">전달 근거</span>
                                      <p>{item.evidenceSummary || "-"}</p>
                                    </div>
                                    <div className="rrd-message-coverage-detail">
                                      <span className="rrd-message-coverage-label">보완 피드백</span>
                                      <p>{item.feedback || "-"}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {insight.actualSpokenSummary && (
                          <div className="rrd-slide-row">
                            <span className="rrd-slide-row-label">실제 발화 요약</span>
                            <p className="rrd-slide-spoken-summary">
                              {insight.actualSpokenSummary}
                            </p>
                          </div>
                        )}

                        {issueGroups && issueGroups.pronunciationIssues.length > 0 && (
                          <div className="rrd-slide-row rrd-slide-row-secondary">
                            <span className="rrd-slide-row-label">발음 주의</span>
                            <ul className="rrd-slide-feedback-list rrd-slide-feedback-list-caution">
                              {issueGroups.pronunciationIssues.map((issue) => (
                                <li key={issue} className="rrd-slide-feedback-item">
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {issueGroups && issueGroups.deliveryIssues.length > 0 && (
                          <div className="rrd-slide-row rrd-slide-row-priority">
                            <span className="rrd-slide-row-label">전달 문제점</span>
                            <ul className="rrd-slide-feedback-list">
                              {issueGroups.deliveryIssues.map((issue) => (
                                <li key={issue} className="rrd-slide-feedback-item">
                                  {issue}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        <div className="rrd-slide-row">
                          <span className="rrd-slide-row-label">다음 연습 제안</span>
                          <p className="rrd-slide-recommended-fix">
                            {insight.recommendedFix || "-"}
                          </p>
                        </div>

                        {/* {card.missedKeywords.length > 0 && (
                          <div className="rrd-slide-row rrd-slide-row-secondary">
                            <span className="rrd-slide-row-label">누락 키워드</span>
                            <div className="rrd-keyword-chips">
                              {card.missedKeywords.map((keyword) => (
                                <span key={keyword} className="rrd-keyword-chip">
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          </div>
                        )} */}
                      </>
                    ) : (
                      <>
                        {coverageItems.length > 0 && (
                          <div className="rrd-slide-row rrd-slide-row-priority">
                            <span className="rrd-slide-row-label">핵심 메시지별 판단</span>
                            <div className="rrd-message-coverage-list">
                              {coverageItems.map((item, index) => {
                                const matchedIntent =
                                  criteriaEntry?.intents.find(
                                    (intent) => intent.messageId === item.messageId,
                                  ) ?? null;

                                return (
                                  <div
                                    key={`${item.slideId}:${item.messageId}`}
                                    className="rrd-message-coverage-item"
                                  >
                                    <div className="rrd-message-coverage-head">
                                      <strong>
                                        메시지 {index + 1}
                                        {matchedIntent?.intent
                                          ? ` · ${matchedIntent.intent}`
                                          : ""}
                                      </strong>
                                      <span
                                        className={`rrd-message-coverage-badge rrd-message-coverage-badge-${item.status}`}
                                      >
                                        {MESSAGE_STATUS_LABEL[item.status]}
                                      </span>
                                    </div>
                                    <div className="rrd-message-coverage-detail">
                                      <span className="rrd-message-coverage-label">전달 근거</span>
                                      <p>{item.evidenceSummary || "-"}</p>
                                    </div>
                                    <div className="rrd-message-coverage-detail">
                                      <span className="rrd-message-coverage-label">보완 피드백</span>
                                      <p>{item.feedback || "-"}</p>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        <div className="rrd-slide-row rrd-slide-row-priority">
                          <span className="rrd-slide-row-label">개선 피드백</span>
                          <ul className="rrd-slide-feedback-list">
                            {card.feedbackItems.map((item) => (
                              <li key={item} className="rrd-slide-feedback-item">
                                {item}
                              </li>
                            ))}
                          </ul>
                        </div>

                        {/* <div className="rrd-slide-row">
                          <span className="rrd-slide-row-label">놓친 핵심 메시지</span>
                          {card.missedKeywords.length > 0 ? (
                            <div className="rrd-keyword-chips">
                              {card.missedKeywords.map((keyword) => (
                                <span key={keyword} className="rrd-keyword-chip">
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="rrd-muted">직접 누락된 핵심 메시지는 없습니다.</span>
                          )}
                        </div> */}

                        <div className="rrd-slide-row">
                          <span className="rrd-slide-row-label">문제 신호</span>
                          {card.signalTags.length > 0 ? (
                            <div className="rrd-recurring-tags">
                              {card.signalTags.map((tag) => (
                                <span key={tag} className="rrd-recurring-tag">
                                  {tag}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="rrd-muted">반복 신호는 크지 않습니다.</span>
                          )}
                        </div>
                      </>
                    )}

                    <div className="rrd-slide-row rrd-slide-row-secondary">
                      <span className="rrd-slide-row-label">참고 시간</span>
                      <div className="rrd-slide-metric-summary">
                        <span>이번 {formatDuration(card.actualSeconds)}</span>
                        <span>
                          평균{" "}
                          {card.averageSeconds != null
                            ? formatDuration(card.averageSeconds)
                            : "집계 중"}
                        </span>
                        <span>
                          대비{" "}
                          {card.diffSeconds != null
                            ? formatDelta(card.diffSeconds)
                            : "집계 중"}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {problemCards.length > PAGE_SIZE && (
            <div className="rrd-slide-pagination">
              <button
                type="button"
                className="rrd-slide-page-button"
                onClick={() => setPage((current) => Math.max(0, current - 1))}
                disabled={currentPage === 0}
              >
                <ChevronLeft size={14} />
                이전
              </button>
              <span className="rrd-slide-page-status">
                {currentPage + 1} / {totalPages}
              </span>
              <button
                type="button"
                className="rrd-slide-page-button"
                onClick={() =>
                  setPage((current) => Math.min(totalPages - 1, current + 1))
                }
                disabled={currentPage >= totalPages - 1}
              >
                다음
                <ChevronRight size={14} />
              </button>
            </div>
          )}
        </>
      )}

      {modalSlideId && (
        <div className="rrd-criteria-overlay" onClick={closeModal}>
          <div className="rrd-criteria-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rrd-criteria-modal-head">
              <h3 className="rrd-criteria-modal-title">
                {deck?.slides.find((s) => s.slideId === modalSlideId)?.title || modalSlideId}
                <span className="rrd-criteria-modal-subtitle">평가 기준</span>
              </h3>
              <button type="button" className="rrd-criteria-modal-close" onClick={closeModal}>
                <X size={16} />
              </button>
            </div>

            {editingEntry && editingEntry.intents.length > 0 ? (
              <div className="rrd-criteria-modal-body">
                {editingEntry.intents.map((intent) => (
                  <div key={intent.messageId} className="rrd-criteria-intent-row">
                    <select
                      className="rrd-contexts-importance-select"
                      value={intent.importance}
                      onChange={(e) => handleImportanceChange(intent.messageId, e.target.value)}
                    >
                      {Object.entries(IMPORTANCE_LABEL).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    <input
                      className="rrd-contexts-intent-input"
                      type="text"
                      value={intent.intent}
                      onChange={(e) => handleIntentChange(intent.messageId, e.target.value)}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <p className="rrd-empty-hint rrd-criteria-modal-empty">
                이 슬라이드에 저장된 평가 기준이 없습니다.
              </p>
            )}

            {editingEntry && projectId && (
              <div className="rrd-criteria-modal-footer">
                <button type="button" className="rrd-criteria-cancel-btn" onClick={closeModal}>
                  취소
                </button>
                <button
                  type="button"
                  className="rrd-contexts-save-btn"
                  disabled={saving}
                  onClick={saveModal}
                >
                  {saving ? "저장 중…" : savedId === modalSlideId ? "저장됨" : "저장"}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
