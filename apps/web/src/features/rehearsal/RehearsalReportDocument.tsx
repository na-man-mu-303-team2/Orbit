import {
  ChevronDown,
  ChevronUp,
  Download,
  FileText,
  Mic,
  Settings2,
  Sparkles,
  Target,
  Volume2,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { Deck, DeckSlideContextEntry, RehearsalReport, RehearsalRun } from "@orbit/shared";
import { navigateTo } from "./rehearsalUtils";
import { RehearsalSlideAnalysisOverview } from "./RehearsalSlideAnalysisOverview";
import { RehearsalSlideTimingOverview } from "./RehearsalSlideTimingOverview";

const TRANSCRIPT_WINDOW_MS = 30 * 60 * 1000;
const FILLER_CHART_COLORS = [
  "#0072B2",
  "#E69F00",
  "#009E73",
  "#D55E00",
  "#CC79A7",
] as const;

type ReportAiSummary = {
  headline: string;
  paragraphs: string[];
};

type ReportWithOptionalAiSummary = RehearsalReport & {
  aiSummary?: ReportAiSummary | null;
};

function fmt(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${m}분 ${(s % 60).toString().padStart(2, "0")}초`;
}

function fmtDelta(diff: number) {
  const abs = Math.abs(Math.floor(diff));
  const sign = diff >= 0 ? "+" : "−";
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return m > 0 ? `${sign}${m}분 ${s.toString().padStart(2, "0")}초` : `${sign}${s}초`;
}

function fmtPercent(value: number) {
  return `${Math.round(value)}%`;
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeXml(value: string) {
  return escapeHtml(value).replaceAll("'", "&apos;");
}

function downloadTranscriptDocx(title: string, transcript: string) {
  const blob = createTranscriptDocxBlob(title, transcript);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFileName(title)}_전사본.docx`;
  a.click();
  URL.revokeObjectURL(url);
}

function createTranscriptDocxBlob(title: string, transcript: string) {
  const paragraphs = transcript.split(/\r?\n/).map(
    (line) =>
      `<w:p><w:r><w:t xml:space="preserve">${escapeXml(line)}</w:t></w:r></w:p>`,
  );
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>${escapeXml(title)} 전사본</w:t></w:r></w:p>
    ${paragraphs.join("\n")}
    <w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>
  </w:body>
</w:document>`;

  return createZipBlob({
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
    "word/document.xml": documentXml,
  });
}

function sanitizeFileName(value: string) {
  const sanitized = value.trim().replace(/[\\/:*?"<>|]+/g, "_");
  return sanitized || "리허설";
}

function createZipBlob(files: Record<string, string>) {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const centralDirectory: Uint8Array[] = [];
  let offset = 0;

  for (const [path, content] of Object.entries(files)) {
    const name = encoder.encode(path);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const localHeader = createLocalFileHeader(name, data.length, crc);
    chunks.push(localHeader, data);
    centralDirectory.push(createCentralDirectoryHeader(name, data.length, crc, offset));
    offset += localHeader.length + data.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectorySize = centralDirectory.reduce((sum, chunk) => sum + chunk.length, 0);
  chunks.push(...centralDirectory);
  chunks.push(createEndOfCentralDirectory(Object.keys(files).length, centralDirectorySize, centralDirectoryOffset));

  return new Blob([concatUint8Arrays(chunks).buffer], {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

function concatUint8Arrays(chunks: Uint8Array[]) {
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

function createLocalFileHeader(name: Uint8Array, size: number, crc: number) {
  const header = new Uint8Array(30 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 0x0800, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0x0021, true);
  view.setUint32(14, crc, true);
  view.setUint32(18, size, true);
  view.setUint32(22, size, true);
  view.setUint16(26, name.length, true);
  header.set(name, 30);
  return header;
}

function createCentralDirectoryHeader(
  name: Uint8Array,
  size: number,
  crc: number,
  localHeaderOffset: number,
) {
  const header = new Uint8Array(46 + name.length);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, 0x0800, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, 0, true);
  view.setUint16(14, 0x0021, true);
  view.setUint32(16, crc, true);
  view.setUint32(20, size, true);
  view.setUint32(24, size, true);
  view.setUint16(28, name.length, true);
  view.setUint32(42, localHeaderOffset, true);
  header.set(name, 46);
  return header;
}

function createEndOfCentralDirectory(
  entryCount: number,
  centralDirectorySize: number,
  centralDirectoryOffset: number,
) {
  const header = new Uint8Array(22);
  const view = new DataView(header.buffer);
  view.setUint32(0, 0x06054b50, true);
  view.setUint16(8, entryCount, true);
  view.setUint16(10, entryCount, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  return header;
}

function crc32(data: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC32_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

type Props = {
  deck: Deck | null;
  prevReports: RehearsalReport[];
  projectId: string;
  report: RehearsalReport;
  run: RehearsalRun | null;
  runNumber: number | null;
  totalRunCount: number;
};

export function RehearsalReportDocument({
  deck,
  prevReports,
  projectId,
  report,
  run,
  runNumber,
  totalRunCount: _totalRunCount,
}: Props) {
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [slideContexts, setSlideContexts] = useState<DeckSlideContextEntry[] | null>(null);
  const [contextsLoaded, setContextsLoaded] = useState(false);
  const [contextsDeckId, setContextsDeckId] = useState<string | null>(null);
  const [contextsSaving, setContextsSaving] = useState(false);
  const [contextsSaved, setContextsSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/v1/projects/${encodeURIComponent(projectId)}/rehearsal-contexts`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { contexts?: DeckSlideContextEntry[]; deckId?: string | null } | null) => {
        if (cancelled) return;
        if (data?.contexts && data.contexts.length > 0) {
          setSlideContexts(data.contexts);
          setContextsDeckId(data.deckId ?? null);
        }
        setContextsLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setContextsLoaded(true);
      });
    return () => { cancelled = true; };
  }, [projectId]);

  const handleIntentChange = useCallback(
    (slideId: string, messageId: string, newIntent: string) => {
      setContextsSaved(false);
      setSlideContexts((prev) =>
        prev?.map((entry) =>
          entry.slideId !== slideId
            ? entry
            : {
                ...entry,
                intents: entry.intents.map((intent) =>
                  intent.messageId !== messageId ? intent : { ...intent, intent: newIntent }
                ),
              }
        ) ?? prev
      );
    },
    []
  );

  const handleImportanceChange = useCallback(
    (slideId: string, messageId: string, newImportance: "required" | "recommended" | "optional") => {
      setContextsSaved(false);
      setSlideContexts((prev) =>
        prev?.map((entry) =>
          entry.slideId !== slideId
            ? entry
            : {
                ...entry,
                intents: entry.intents.map((intent) =>
                  intent.messageId !== messageId ? intent : { ...intent, importance: newImportance }
                ),
              }
        ) ?? prev
      );
    },
    []
  );

  const saveSlideContexts = useCallback(async () => {
    if (!slideContexts) return;
    const deckId = contextsDeckId ?? report.deckId;
    setContextsSaving(true);
    setContextsSaved(false);
    try {
      const res = await fetch(
        `/api/v1/projects/${encodeURIComponent(projectId)}/rehearsal-contexts`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deckId, contexts: slideContexts }),
        }
      );
      if (res.ok) {
        setContextsSaved(true);
        setTimeout(() => setContextsSaved(false), 2000);
      }
    } finally {
      setContextsSaving(false);
    }
  }, [slideContexts, contextsDeckId, report.deckId, projectId]);

  const coaching = report.coaching;
  const scriptRevisionSuggestions =
    coaching?.scriptRevisionSuggestions?.filter(Boolean).slice(0, 3) ?? [];
  const metrics = report.metrics;
  const slideTimings = report.slideTimings;
  const fillerWordDetails = [...report.fillerWordDetails].sort(
    (a, b) => b.count - a.count,
  );
  const fillerDistribution = fillerWordDetails.slice(0, 5).map((fw, index) => {
    const sharePercent = Math.min(
      100,
      metrics.fillerWordCount > 0 ? (fw.count / metrics.fillerWordCount) * 100 : 0,
    );

    return {
      ...fw,
      color: FILLER_CHART_COLORS[index % FILLER_CHART_COLORS.length]!,
      sharePercent,
    };
  });
  const fillerDistributionGradient =
    fillerDistribution.length > 0
      ? (() => {
          let start = 0;
          return fillerDistribution
            .map((item) => {
              const end = start + item.sharePercent * 3.6;
              const segment = `${item.color} ${start}deg ${end}deg`;
              start = end;
              return segment;
            })
            .join(", ");
        })()
      : "";

  const runDate = run?.createdAt ? formatDate(run.createdAt) : "";
  const title =
    runNumber != null ? `${runNumber}회차 리허설 리포트` : "리허설 리포트";
  const reportWithAiSummary = report as ReportWithOptionalAiSummary;
  const contextSummary = report.contextSummary ?? null;
  const aiSummaryHeadline =
    contextSummary?.headline ??
    reportWithAiSummary.aiSummary?.headline ??
    coaching?.summary ??
    null;
  const aiSummary = reportWithAiSummary.aiSummary ?? (
    coaching?.summary
      ? {
          headline: coaching.summary,
          paragraphs: [
            ...coaching.improvements.slice(0, 2),
            coaching.nextPracticeFocus,
          ].filter(Boolean).slice(0, 3),
        }
      : null
  );

  const transcriptAvailable =
    report.transcriptRetained &&
    report.transcript !== null &&
    Date.now() - Date.parse(report.generatedAt) < TRANSCRIPT_WINDOW_MS;

  const minutesLeft = transcriptAvailable
    ? Math.ceil(
        (TRANSCRIPT_WINDOW_MS -
          (Date.now() - Date.parse(report.generatedAt))) /
          60000,
      )
    : 0;

  // ── 이전 회차 데이터 계산 ──────────────────────────────────────────
  const prevReport = prevReports[0] ?? null; // 직전 회차

  const durationDelta = prevReport
    ? report.metrics.durationSeconds - prevReport.metrics.durationSeconds
    : null;
  const fillerDelta = prevReport
    ? report.metrics.fillerWordCount - prevReport.metrics.fillerWordCount
    : null;

  return (
    <div className="rrd-root">
      {/* ── Hero ── */}
      <section className="rrd-hero">
        <div className="rrd-hero-text">
          <h1 className="rrd-hero-title">{title}</h1>
          <time className="rrd-hero-date">{runDate}</time>
        </div>
        <button
          type="button"
          className="rrd-hero-action"
          onClick={() => navigateTo(`/rehearsal/${encodeURIComponent(projectId)}`)}
        >
          <Mic size={15} />
          바로 다시 리허설
        </button>
      </section>

      {/* ── 1. AI summary ── */}
      <section className="rrd-card rrd-ai-card">
        <header className="rrd-card-head">
          <Sparkles size={16} className="rrd-card-icon rrd-card-icon-ai" />
          <h2>AI 총평</h2>
          {contextSummary && (
            <span
              className={`rrd-context-status-badge rrd-context-status-badge-${contextSummary.overallStatus}`}
            >
              {contextSummary.overallStatus === "clear"
                ? "메시지 전달 명확"
                : contextSummary.overallStatus === "mixed"
                  ? "메시지 전달 혼합"
                  : "메시지 전달 약함"}
            </span>
          )}
        </header>

        <div className="rrd-summary-block">
          <span className="rrd-summary-block-label">한 줄 요약</span>
          {aiSummaryHeadline ? (
            <p className="rrd-ai-summary">{aiSummaryHeadline}</p>
          ) : (
            <p className="rrd-empty-hint">피드백 데이터가 없습니다.</p>
          )}
        </div>

        {contextSummary && (
          <div className="rrd-context-summary-cols">
            {contextSummary.strengths.length > 0 && (
              <div className="rrd-summary-block">
                <span className="rrd-summary-block-label">잘 전달된 점</span>
                <ul className="rrd-context-summary-list">
                  {contextSummary.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </div>
            )}
            {contextSummary.risks.length > 0 && (
              <div className="rrd-summary-block">
                <span className="rrd-summary-block-label">전달 리스크</span>
                <ul className="rrd-context-summary-list rrd-context-summary-list-risk">
                  {contextSummary.risks.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {!contextSummary && (
          <div className="rrd-summary-block">
            <span className="rrd-summary-block-label">총평</span>
            {aiSummary?.paragraphs && aiSummary.paragraphs.length > 0 ? (
              <div className="rrd-ai-paragraphs">
                {aiSummary.paragraphs.slice(0, 3).map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            ) : (
              <p className="rrd-empty-hint">구조화된 AI 총평 데이터가 없습니다.</p>
            )}
          </div>
        )}
      </section>

      {/* ── 2. Overview ── */}
      <section className="rrd-card rrd-overview-card">
        <header className="rrd-card-head">
          <FileText size={16} className="rrd-card-icon" />
          <h2>이번 발표 요약</h2>
        </header>

        <div className="rrd-overview-grid">
          <div className="rrd-overview-metric rrd-overview-metric-primary">
            <span>전체 발표 시간</span>
            <strong>{fmt(metrics.durationSeconds)}</strong>
            <em>
              {durationDelta === null
                ? "비교할 이전 리허설 없음"
                : `직전 대비 ${fmtDelta(durationDelta)}`}
            </em>
          </div>
          <div className="rrd-overview-metric">
            <span>말버릇 총 횟수</span>
            <strong>{metrics.fillerWordCount}회</strong>
            <em>
              {fillerDelta === null
                ? "이전 비교 없음"
                : `직전 대비 ${fillerDelta === 0 ? "변화 없음" : `${fillerDelta > 0 ? "+" : ""}${fillerDelta}회`}`}
            </em>
          </div>
          <div className="rrd-overview-metric">
            <span>긴 멈춤</span>
            <strong>{metrics.pauseCount}회</strong>
            <em>1초 이상 침묵 기준</em>
          </div>
          {contextSummary ? (
            <div className="rrd-overview-metric">
              <span>핵심 메시지 전달</span>
              <strong
                className={`rrd-context-status-value rrd-context-status-value-${contextSummary.overallStatus}`}
              >
                {contextSummary.overallStatus === "clear"
                  ? "명확"
                  : contextSummary.overallStatus === "mixed"
                    ? "혼합"
                    : "약함"}
              </strong>
              <em>키워드 커버리지 {Math.round(metrics.keywordCoverage * 100)}%</em>
            </div>
          ) : (
            <div className="rrd-overview-metric">
              <span>키워드 커버리지</span>
              <strong>{Math.round(metrics.keywordCoverage * 100)}%</strong>
              <em>저장된 장표 키워드 기준</em>
            </div>
          )}
        </div>

        <div className="rrd-overview-columns">
          <RehearsalSlideTimingOverview
            deck={deck}
            formatDuration={fmt}
            slideTimings={slideTimings}
          />
        </div>

      </section>

      <RehearsalSlideAnalysisOverview
        deck={deck}
        formatDelta={fmtDelta}
        formatDuration={fmt}
        prevReports={prevReports}
        report={report}
        slideContextInsights={report.slideContextInsights}
        slideContexts={slideContexts}
        projectId={projectId}
        onSlideContextsSaved={setSlideContexts}
      />

      {/* ── 4. 말버릇 / 멈춤 ── */}
      <section className="rrd-card">
        <header className="rrd-card-head">
          <Volume2 size={16} className="rrd-card-icon" />
          <h2>말버릇 / 멈춤</h2>
        </header>

        <div className="rrd-filler-totals">
          <div className="rrd-filler-total-chip">
            <span>말버릇 총량</span>
            <strong>{metrics.fillerWordCount}회</strong>
          </div>
          <div className="rrd-filler-total-chip">
            <span>긴 멈춤</span>
            <strong>{metrics.pauseCount}회</strong>
          </div>
        </div>

        {fillerWordDetails.length > 0 && (
          <>
            <h3 className="rrd-section-label">상위 표현</h3>
            <div className="rrd-filler-distribution">
              <div
                className="rrd-filler-distribution-chart"
                style={{
                  background: `conic-gradient(${fillerDistributionGradient})`,
                }}
                aria-label="상위 표현 비율 원 그래프"
              >
                <div className="rrd-filler-distribution-inner">
                  <strong>{metrics.fillerWordCount}회</strong>
                  <span>상위 표현</span>
                </div>
              </div>

              <div className="rrd-filler-list-wrap">
                <p className="rrd-filler-list-caption">표현별 비중</p>
                <div className="rrd-filler-list">
                  {fillerDistribution.map((fw) => (
                    <div key={fw.word} className="rrd-filler-row">
                      <div className="rrd-filler-word-group">
                        <span
                          className="rrd-filler-legend-dot"
                          style={{ backgroundColor: fw.color }}
                          aria-hidden="true"
                        />
                        <span className="rrd-filler-word">"{fw.word}"</span>
                      </div>
                      <strong className="rrd-filler-summary">
                        {fmtPercent(fw.sharePercent)} ({fw.count}회)
                      </strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ── 6. 전체 코칭 ── */}
      {coaching && (
        <section className="rrd-card">
          <header className="rrd-card-head">
            <Target size={16} className="rrd-card-icon" />
            <h2>전체 코칭</h2>
          </header>

          {coaching.nextPracticeFocus && (
            <div className="rrd-coaching-focus">
              <span>다음 연습 우선순위</span>
              <p>{coaching.nextPracticeFocus}</p>
            </div>
          )}

          <div className="rrd-coaching-cols">
            {scriptRevisionSuggestions.length > 0 && (
              <div>
                <strong className="rrd-coaching-col-head">대본 수정 제안</strong>
                <ol className="rrd-coaching-list rrd-coaching-list-ordered">
                  {scriptRevisionSuggestions.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            )}
            {coaching.improvements.length > 0 && (
              <div>
                <strong className="rrd-coaching-col-head">개선 포인트</strong>
                <ol className="rrd-coaching-list rrd-coaching-list-ordered">
                  {coaching.improvements.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ol>
              </div>
            )}
            {coaching.strengths.length > 0 && (
              <div>
                <strong className="rrd-coaching-col-head">잘한 점</strong>
                <ul className="rrd-coaching-list">
                  {coaching.strengths.slice(0, 3).map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}

      {/* ── 7. 다음 리허설 평가 기준 ── */}
      {contextsLoaded && slideContexts && slideContexts.length > 0 && (
        <section className="rrd-card rrd-contexts-card">
          <header className="rrd-card-head">
            <Settings2 size={16} className="rrd-card-icon" />
            <h2>다음 리허설 평가 기준</h2>
            <span className="rrd-contexts-hint">다음 리허설부터 이 기준으로 메시지 전달을 평가합니다</span>
          </header>

          <div className="rrd-contexts-slides">
            {slideContexts.map((entry) => {
              const slideTitle =
                deck?.slides.find((s) => s.slideId === entry.slideId)?.title ||
                entry.slideId;
              return (
                <div key={entry.slideId} className="rrd-contexts-slide">
                  <p className="rrd-contexts-slide-title">{slideTitle}</p>
                  <div className="rrd-contexts-intents">
                    {entry.intents.map((intent) => (
                      <div key={intent.messageId} className="rrd-contexts-intent-row">
                        <select
                          className="rrd-contexts-importance-select"
                          value={intent.importance}
                          onChange={(e) =>
                            handleImportanceChange(
                              entry.slideId,
                              intent.messageId,
                              e.target.value as "required" | "recommended" | "optional"
                            )
                          }
                        >
                          <option value="required">필수</option>
                          <option value="recommended">권장</option>
                          <option value="optional">선택</option>
                        </select>
                        <input
                          className="rrd-contexts-intent-input"
                          type="text"
                          value={intent.intent}
                          onChange={(e) =>
                            handleIntentChange(entry.slideId, intent.messageId, e.target.value)
                          }
                        />
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div className="rrd-contexts-footer">
            <button
              type="button"
              className="rrd-contexts-save-btn"
              disabled={contextsSaving}
              onClick={saveSlideContexts}
            >
              {contextsSaving ? "저장 중…" : contextsSaved ? "저장됨" : "기준 저장"}
            </button>
          </div>
        </section>
      )}

      {/* ── 8. 전사본 ── */}
      {transcriptAvailable && (
        <section className="rrd-card rrd-transcript-card">
          <header className="rrd-card-head">
            <FileText size={16} className="rrd-card-icon" />
            <h2>발표 전사본</h2>
            <span className="rrd-transcript-ttl">{minutesLeft}분 후 만료</span>
            <div className="rrd-transcript-actions">
              <button
                type="button"
                className="rrd-transcript-download"
                onClick={() =>
                  downloadTranscriptDocx(
                    deck?.title ?? "리허설",
                    report.transcript ?? "",
                  )
                }
              >
                <Download size={14} />
                DOCX 내려받기
              </button>
              <button
                type="button"
                className="rrd-transcript-toggle"
                onClick={() => setTranscriptOpen((v) => !v)}
                aria-expanded={transcriptOpen}
              >
                {transcriptOpen ? (
                  <ChevronUp size={16} />
                ) : (
                  <ChevronDown size={16} />
                )}
                {transcriptOpen ? "접기" : "펼치기"}
              </button>
            </div>
          </header>

          {transcriptOpen && (
            <pre className="rrd-transcript-body">{report.transcript}</pre>
          )}
        </section>
      )}
    </div>
  );
}
