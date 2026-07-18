import type { Deck, RehearsalReport } from "@orbit/shared";
import { ArrowRight, AudioLines, CirclePause, Clock3, Gauge, MessageCircleMore, Target } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RehearsalSlideCanvasPreview } from "./RehearsalSlideCanvasPreview";
import "./rehearsal-report-test-view.css";

type Props = { deck: Deck | null; formatDuration: (seconds: number) => string; report: RehearsalReport };

const MOCK_FINDINGS = [
  { icon: Gauge, label: "말하기 속도", description: "분당 214단어로, 권장 범위(120~160단어/분)를 벗어났습니다.", status: "빠름", tone: "danger" },
  { icon: MessageCircleMore, label: "필러 단어", description: "“그”, “음”, “어” 등 필러 단어가 12회 사용되었습니다.", status: "많음", tone: "danger" },
  { icon: CirclePause, label: "긴 침묵", description: "5초 이상 침묵이 1회 발생했습니다.", status: "발생", tone: "warning" },
  { icon: Target, label: "핵심 메시지 전달", description: "핵심 메시지 3개 중 1개만 명확히 전달되었습니다.", status: "미흡", tone: "danger" },
] as const;

export function RehearsalReportTestView({ deck, formatDuration, report }: Props) {
  const fallbackSlideId = deck?.slides[1]?.slideId ?? deck?.slides[0]?.slideId ?? null;
  const [selectedSlideId, setSelectedSlideId] = useState<string | null>(fallbackSlideId);

  useEffect(() => {
    if (!deck?.slides.some((slide) => slide.slideId === selectedSlideId)) {
      setSelectedSlideId(deck?.slides[1]?.slideId ?? deck?.slides[0]?.slideId ?? null);
    }
  }, [deck, selectedSlideId]);

  const foundIndex = deck?.slides.findIndex((slide) => slide.slideId === selectedSlideId) ?? -1;
  const selectedIndex = foundIndex >= 0 ? foundIndex : 0;
  const selectedSlide = deck?.slides[selectedIndex] ?? null;
  const timing = useMemo(
    () => report.slideTimings.find((item) => item.slideId === selectedSlide?.slideId),
    [report.slideTimings, selectedSlide?.slideId],
  );
  const actualSeconds = timing?.actualSeconds ?? 16;
  const targetSeconds = timing?.targetSeconds ?? selectedSlide?.estimatedSeconds ?? 60;
  const timeDelta = actualSeconds - targetSeconds;
  const actualRatio = Math.min(100, Math.max(4, (actualSeconds / Math.max(targetSeconds, 1)) * 100));
  const slideTitle = selectedSlide?.title?.trim() || `슬라이드 ${selectedIndex + 1}`;

  return (
    <section className="rrd-test-view" aria-label="슬라이드 상세 리포트 테스트 화면">
      <header className="rrd-test-heading">
        <div><span>NEW REPORT PREVIEW</span><h2>슬라이드 상세 리포트</h2><p>슬라이드를 선택해 실제 발표 흐름과 코칭 지표를 함께 확인하세요.</p></div>
        <strong>{selectedIndex + 1} / {deck?.slides.length ?? 0}</strong>
      </header>

      {deck && deck.slides.length > 0 ? (
        <nav className="rrd-test-filmstrip" aria-label="분석할 슬라이드 선택">
          {deck.slides.map((slide, index) => (
            <button type="button" className={slide.slideId === selectedSlideId ? "is-selected" : undefined} aria-current={slide.slideId === selectedSlideId ? "true" : undefined} aria-label={`${index + 1}번 슬라이드 ${slide.title || "제목 없음"}`} key={slide.slideId} onClick={() => setSelectedSlideId(slide.slideId)}>
              <span className="rrd-test-filmstrip-canvas"><RehearsalSlideCanvasPreview ariaHidden deck={deck} slide={slide} /></span>
              <span className="rrd-test-filmstrip-meta"><b>{index + 1}</b><span>{slide.title || "제목 없음"}</span></span>
            </button>
          ))}
        </nav>
      ) : <div className="rrd-test-empty">렌더링할 슬라이드가 없습니다.</div>}

      <div className="rrd-test-primary-grid">
        <article className="rrd-test-card rrd-test-slide-detail">
          <header><span>SELECTED SLIDE</span><h3>{selectedIndex + 1}. {slideTitle}</h3></header>
          <div className="rrd-test-slide-body">
            <div className="rrd-test-main-canvas">
              {deck && selectedSlide ? <RehearsalSlideCanvasPreview deck={deck} label={`${selectedIndex + 1}번 슬라이드 ${slideTitle}`} slide={selectedSlide} /> : null}
            </div>
            <div className="rrd-test-duration">
              <div className="rrd-test-duration-title"><Clock3 aria-hidden="true" size={20} /><strong>소요 시간 비교</strong></div>
              <div className="rrd-test-duration-row"><span>실제 소요 시간</span><b>{formatDuration(actualSeconds)}</b><div className="rrd-test-duration-track"><i style={{ width: `${actualRatio}%` }} /></div></div>
              <div className="rrd-test-duration-row is-target"><span>권장 소요 시간</span><b>{formatDuration(targetSeconds)}</b><div className="rrd-test-duration-track"><i /></div></div>
              <div className="rrd-test-duration-delta"><span>시간 차이</span><strong className={timeDelta < 0 ? "is-danger" : "is-success"}>{Math.abs(timeDelta)}초 {timeDelta < 0 ? "부족" : "여유"}</strong></div>
            </div>
          </div>
        </article>

        <aside className="rrd-test-card rrd-test-summary">
          <header><span>AT A GLANCE</span><h3>이 슬라이드 핵심 요약</h3></header>
          <div className="rrd-test-summary-list">
            <SummaryRow icon={Clock3} label="실제 / 권장 시간" value={`${actualSeconds}초 / ${targetSeconds}초`} meta={`${Math.abs(timeDelta)}초 ${timeDelta < 0 ? "부족" : "여유"}`} tone="danger" />
            <SummaryRow icon={AudioLines} label="말하기 속도" value="214 단어/분" meta="권장 120~160단어/분" />
            <SummaryRow icon={MessageCircleMore} label="필러(어/음) 밀도" value="6.7%" meta="권장 3.0% 미만" />
            <SummaryRow icon={CirclePause} label="긴 침묵(5초 이상)" value="1회" meta="권장 0~2회" />
          </div>
          <p className="rrd-test-mock-note">시간 외 발화 지표는 디자인 검토용 목업 데이터입니다.</p>
        </aside>
      </div>

      <section className="rrd-test-findings">
        <header><span>COACHING CHECK</span><h3>이 슬라이드에서 확인한 점</h3></header>
        <div className="rrd-test-findings-list">
          {MOCK_FINDINGS.map((finding) => {
            const Icon = finding.icon;
            return <div className="rrd-test-finding" key={finding.label}><span className="rrd-test-finding-icon"><Icon aria-hidden="true" size={20} /></span><strong>{finding.label}</strong><p>{finding.description}</p><em className={`is-${finding.tone}`}>{finding.status}</em></div>;
          })}
        </div>
      </section>

      <section className="rrd-test-next-practice">
        <span className="rrd-test-next-icon"><Target aria-hidden="true" size={24} /></span>
        <div><span>NEXT PRACTICE</span><strong>{slideTitle} 뒤에 영향 범위를 설명하는 한 문장을 추가해 보세요.</strong></div>
        <button type="button">연습하기 <ArrowRight aria-hidden="true" size={18} /></button>
      </section>
    </section>
  );
}

type SummaryRowProps = { icon: typeof Clock3; label: string; meta: string; tone?: "danger"; value: string };

function SummaryRow({ icon: Icon, label, meta, tone, value }: SummaryRowProps) {
  return <div className="rrd-test-summary-row"><span className="rrd-test-summary-icon"><Icon aria-hidden="true" size={20} /></span><span>{label}</span><strong>{value}</strong><em className={tone ? `is-${tone}` : undefined}>{meta}</em></div>;
}
