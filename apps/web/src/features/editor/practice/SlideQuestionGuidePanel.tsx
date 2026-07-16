import type { Deck, Slide, SlideQuestionGuide } from "@orbit/shared";
import { useEffect, useState } from "react";

import { fetchDeck } from "../shell/api/deckPersistenceApi";
import {
  createSlideQuestionGuide,
  getSlideQuestionGuide,
  listSlideQuestionGuides,
  waitForSlideQuestionGuideJob,
} from "./slideQuestionGuideApi";

export function SlideQuestionGuidePanel(props: {
  projectId: string;
  deck: Deck;
  slide: Slide | null;
  flushPendingSaves: () => Promise<void>;
}) {
  const [guide, setGuide] = useState<SlideQuestionGuide | null>(null);
  const [hasStaleGuide, setHasStaleGuide] = useState(false);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "generating" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!props.slide) {
      setGuide(null);
      setHasStaleGuide(false);
      return;
    }
    setStatus("loading");
    void listSlideQuestionGuides({
      projectId: props.projectId,
      deckId: props.deck.deckId,
      slideId: props.slide.slideId,
    }).then((guides) => {
      if (!active) return;
      const current = guides.find((candidate) => candidate.deckVersion === props.deck.version) ?? null;
      setGuide(current);
      setHasStaleGuide(!current && guides.length > 0);
      setSelectedQuestionId(current?.items[0]?.questionId ?? null);
      setStatus("idle");
    }).catch(() => {
      if (active) setStatus("error");
    });
    return () => { active = false; };
  }, [props.deck.deckId, props.deck.version, props.projectId, props.slide]);

  async function generate() {
    if (!props.slide) return;
    setStatus("generating");
    setMessage("");
    try {
      await props.flushPendingSaves();
      const serverDeck = await fetchDeck(props.projectId);
      if (!serverDeck.slides.some((slide) => slide.slideId === props.slide?.slideId)) {
        throw new Error("현재 슬라이드가 서버 덱에 없습니다.");
      }
      const created = await createSlideQuestionGuide({
        projectId: props.projectId,
        deckId: serverDeck.deckId,
        slideId: props.slide.slideId,
        expectedDeckVersion: serverDeck.version,
      });
      await waitForSlideQuestionGuideJob(created.job.jobId);
      const next = await getSlideQuestionGuide(props.projectId, created.guideId);
      setGuide(next);
      setHasStaleGuide(false);
      setSelectedQuestionId(next.items[0]?.questionId ?? null);
      setStatus("idle");
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "예상 질문 생성에 실패했습니다.");
    }
  }

  const selected = guide?.items.find((item) => item.questionId === selectedQuestionId) ?? guide?.items[0] ?? null;
  return (
    <div className="editor-question-guide-panel">
      <div className="editor-question-guide-header">
        <div><strong>현재 슬라이드 예상 질문</strong><p>슬라이드와 승인된 참고자료에 근거한 질문 3개를 준비합니다.</p></div>
        <button disabled={!props.slide || status === "generating"} type="button" onClick={() => void generate()}>
          {status === "generating" ? "생성 중…" : guide ? "다시 생성" : "질문 생성"}
        </button>
      </div>
      {message ? <p className="editor-practice-message">{message}</p> : null}
      {hasStaleGuide ? <p className="editor-question-stale">덱이 바뀌어 이전 질문은 숨겼습니다. 현재 버전으로 다시 생성해 주세요.</p> : null}
      {guide && selected ? (
        <div className="editor-question-guide-content">
          <nav aria-label="예상 질문 목록">
            {guide.items.map((item, index) => (
              <button
                aria-current={item.questionId === selected.questionId ? "true" : undefined}
                key={item.questionId}
                type="button"
                onClick={() => setSelectedQuestionId(item.questionId)}
              >
                <span>Q{index + 1}</span>{item.questionText}
              </button>
            ))}
          </nav>
          <article>
            <h4>{selected.questionText}</h4>
            {selected.supportState === "insufficient" ? (
              <div className="editor-question-remediation">
                <strong>근거가 부족합니다</strong>
                <p>{selected.remediation?.message}</p>
                <ul>{selected.remediation?.actions.map((action) => <li key={action}>{action}</li>)}</ul>
              </div>
            ) : (
              <>
                <div className="editor-question-concepts"><strong>핵심 개념</strong>{selected.keyConcepts.map((concept) => <span key={concept.label}>{concept.label}</span>)}</div>
                <details>
                  <summary>추천 답변 보기</summary>
                  <p>{selected.suggestedAnswer?.summary}</p>
                  <ol>{selected.suggestedAnswer?.structure.map((step) => <li key={step}>{step}</li>)}</ol>
                  {selected.suggestedAnswer?.caveats.map((caveat) => <p className="editor-question-caveat" key={caveat}>{caveat}</p>)}
                </details>
              </>
            )}
          </article>
        </div>
      ) : status === "loading" ? (
        <p className="editor-dock-empty">이전 질문을 불러오는 중…</p>
      ) : (
        <p className="editor-dock-empty">질문을 생성하면 이곳에서 바로 연습할 수 있습니다.</p>
      )}
    </div>
  );
}
