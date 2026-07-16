import {
  storyPlanReviewResponseSchema,
  type StoryPlanReviewResponse,
} from "@orbit/shared";
import {
  IconAlertTriangle,
  IconCheck,
  IconClock,
  IconFileText,
  IconInfoCircle,
  IconMinus,
  IconRefresh,
} from "@tabler/icons-react";
import { useEffect, useState } from "react";
import {
  OrbitButton,
  OrbitDialog,
  OrbitStatus,
  OrbitTabs,
  OrbitTextarea,
} from "../../design-system";
import { pollJob } from "./AiPptMockupPage";
import "./story-plan-review.css";

type StoryTab = "flow" | "evidence" | "notes";

export function storyPlanPath(projectId: string, jobId: string) {
  return `/project/${encodeURIComponent(projectId)}/story-plan/${encodeURIComponent(jobId)}`;
}

export function StoryPlanReviewPage(props: {
  jobId: string;
  projectId: string;
}) {
  const [response, setResponse] = useState<StoryPlanReviewResponse | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<StoryTab>("flow");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const next = await requestStoryPlan(props.projectId, props.jobId);
        if (cancelled) return;
        setResponse(next);
        setError("");
        if (next.status === "planning" || next.status === "regenerating") {
          timer = setTimeout(load, 1200);
        } else if (next.status === "approved") {
          const job = await pollJob(next.jobId);
          if (!cancelled && job.status === "succeeded") {
            navigate(`/project/${encodeURIComponent(next.projectId)}`);
          } else if (!cancelled) {
            setError(job.error?.message || job.message);
          }
        }
      } catch (cause) {
        if (!cancelled) {
          setError(
            cause instanceof Error
              ? cause.message
              : "구성을 불러오지 못했습니다.",
          );
        }
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [props.jobId, props.projectId]);

  async function mutate(action: "approve" | "cancel" | "regenerate") {
    if (!response || busy) return;
    if (action !== "cancel" && !response.plan) return;
    setBusy(true);
    setError("");
    try {
      const next = await requestStoryPlanMutation(
        props.projectId,
        props.jobId,
        action,
        action === "cancel"
          ? undefined
          : {
              expectedRevision: response.plan!.revision,
              ...(action === "regenerate" && instruction.trim()
                ? { instruction: instruction.trim() }
                : {}),
            },
      );
      setResponse(next);
      setDialogOpen(false);
      setInstruction("");
      if (action === "approve") {
        const job = await pollJob(next.jobId);
        if (job.status === "succeeded") {
          navigate(`/project/${encodeURIComponent(next.projectId)}`);
        } else {
          setError(job.error?.message || job.message);
        }
      }
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!response) {
    return <StoryPlanLoading error={error} />;
  }

  return (
    <>
      {error ? (
        <p className="story-review-error" role="alert">
          {error}
        </p>
      ) : null}
      <StoryPlanReviewView
        activeTab={activeTab}
        busy={busy}
        onApprove={() => void mutate("approve")}
        onCancel={() => void mutate("cancel")}
        onRegenerate={() => setDialogOpen(true)}
        onTabChange={(tab) => setActiveTab(tab)}
        response={response}
      />
      <OrbitDialog
        footer={
          <>
            <OrbitButton
              onClick={() => setDialogOpen(false)}
              variant="secondary"
            >
              닫기
            </OrbitButton>
            <OrbitButton
              disabled={busy || instruction.length > 240}
              onClick={() => void mutate("regenerate")}
            >
              제안받기
            </OrbitButton>
          </>
        }
        onClose={() => setDialogOpen(false)}
        open={dialogOpen}
        title="다른 구성 제안받기"
      >
        <label className="story-review-instruction">
          <span>바꾸고 싶은 점이 있다면 알려주세요. (선택)</span>
          <OrbitTextarea
            data-orbit-dialog-initial
            maxLength={240}
            onChange={(event) => setInstruction(event.target.value)}
            rows={5}
            value={instruction}
          />
          <small>{instruction.length}/240</small>
        </label>
      </OrbitDialog>
    </>
  );
}

export function StoryPlanReviewView(props: {
  activeTab: StoryTab;
  busy?: boolean;
  onApprove: () => void;
  onCancel: () => void;
  onRegenerate: () => void;
  onTabChange: (tab: StoryTab) => void;
  response: StoryPlanReviewResponse;
}) {
  const plan = props.response.plan;
  if (!plan) {
    return (
      <StoryPlanLoading
        busy={props.busy}
        onCancel={
          props.response.status === "planning" ? props.onCancel : undefined
        }
        status={props.response.status}
      />
    );
  }
  const waiting =
    props.response.status === "planning" ||
    props.response.status === "regenerating";
  const reviewPending = props.response.status === "review-pending";
  const terminal =
    props.response.status === "approved" ||
    props.response.status === "cancelled" ||
    props.response.status === "failed";
  const exhausted = plan.regenerationCount >= plan.regenerationLimit;
  return (
    <section className="story-review-page">
      <header className="story-review-heading">
        <div>
          <p className="story-review-breadcrumb">
            <a href="/createdeck">AI 발표자료 만들기</a>
            <span>/</span>
            <span>구성 확인</span>
          </p>
          <h1>이야기 구성을 확인하세요.</h1>
          <p>
            디자인과 이미지를 만들기 전에 흐름, 참고자료, 발표자 노트를 먼저
            검토합니다.
          </p>
        </div>
        <dl className="story-review-meta">
          <div>
            <IconFileText size={18} />
            <dt>Revision</dt>
            <dd>{plan.revision}</dd>
          </div>
          <div>
            <IconRefresh size={18} />
            <dt>재제안</dt>
            <dd>
              {plan.regenerationCount}/{plan.regenerationLimit}
            </dd>
          </div>
          <div>
            <IconClock size={18} />
            <dt>예상</dt>
            <dd>
              {formatMinutes(plan.totalSeconds)} · {plan.slideCount}장
            </dd>
          </div>
        </dl>
      </header>

      {waiting ? (
        <div className="story-review-progress" role="status">
          {props.response.status === "regenerating"
            ? "기존 구성은 유지한 채 다른 구성을 제안하고 있습니다."
            : "AI가 이야기 구성을 정리하고 있습니다."}
        </div>
      ) : null}
      {props.response.error ? (
        <div className="story-review-error" role="alert">
          {props.response.error.message}
        </div>
      ) : null}

      <OrbitTabs
        activeTab={props.activeTab}
        ariaLabel="이야기 구성 상세"
        onChange={(tab) => props.onTabChange(tab as StoryTab)}
        tabs={[
          { id: "flow", label: "전체 이야기 흐름" },
          { id: "evidence", label: "근거와 참고자료" },
          { id: "notes", label: "발표자 노트" },
        ]}
      >
        {props.activeTab === "flow" ? <StoryFlow plan={plan} /> : null}
        {props.activeTab === "evidence" ? <StoryEvidence plan={plan} /> : null}
        {props.activeTab === "notes" ? <StoryNotes plan={plan} /> : null}
      </OrbitTabs>

      {plan.qualityWarnings.length > 0 || plan.repairReasonCodes.length > 0 ? (
        <aside className="story-review-warning">
          <IconInfoCircle aria-hidden="true" size={18} />
          <strong>참고자료 연결은 사실 검증을 의미하지 않습니다.</strong>
          <span>
            {plan.qualityWarnings.map((warning) => warning.message).join(" ")}
            {plan.repairReasonCodes.length
              ? " AI가 구성 품질을 위해 일부 내용을 자동 조정했습니다."
              : ""}
          </span>
        </aside>
      ) : null}

      <footer className="story-review-actions">
        <OrbitButton
          disabled={props.busy || terminal}
          onClick={props.onCancel}
          variant="quiet"
        >
          생성 취소
        </OrbitButton>
        <div>
          <OrbitButton
            disabled={props.busy || !reviewPending || exhausted}
            onClick={props.onRegenerate}
            variant="secondary"
          >
            다른 구성 제안받기
          </OrbitButton>
          <OrbitButton
            disabled={props.busy || !reviewPending}
            onClick={props.onApprove}
          >
            이 구성으로 생성
          </OrbitButton>
          <span>승인 후 디자인 생성을 시작합니다.</span>
        </div>
      </footer>
    </section>
  );
}

function StoryFlow({
  plan,
}: {
  plan: NonNullable<StoryPlanReviewResponse["plan"]>;
}) {
  return (
    <div className="story-review-table">
      <div className="story-review-table-head">
        <span>순서</span>
        <span>섹션과 역할</span>
        <span>핵심 메시지</span>
        <span>참고자료 상태</span>
        <span>예상 시간</span>
      </div>
      {plan.slides.map((slide) => (
        <article className="story-review-row" key={slide.order}>
          <span
            className={`story-review-order story-review-order-${slide.sourceState}`}
          >
            {slide.order}
          </span>
          <div>
            <small>{slideTypeLabel(slide.slideType)}</small>
            <strong>{slide.title}</strong>
          </div>
          <p>{slide.message}</p>
          <OrbitStatus
            tone={
              slide.sourceState === "connected"
                ? "success"
                : slide.sourceState === "attention"
                  ? "warning"
                  : "neutral"
            }
          >
            {slide.sourceState === "connected" ? (
              <IconCheck aria-hidden="true" size={14} />
            ) : slide.sourceState === "attention" ? (
              <IconAlertTriangle aria-hidden="true" size={14} />
            ) : (
              <IconMinus aria-hidden="true" size={14} />
            )}
            {sourceStateLabel(slide.sourceState)}
          </OrbitStatus>
          <time>{formatSeconds(slide.targetSeconds)}</time>
        </article>
      ))}
    </div>
  );
}

function StoryEvidence({
  plan,
}: {
  plan: NonNullable<StoryPlanReviewResponse["plan"]>;
}) {
  return (
    <div className="story-review-list">
      {plan.slides.map((slide) => (
        <article key={slide.order}>
          <h2>
            {slide.order}. {slide.title}
          </h2>
          <p>{sourceStateLabel(slide.sourceState)}</p>
          {slide.sources.length ? (
            <ul>
              {slide.sources.map((source, index) => (
                <li key={`${source.title}-${index}`}>
                  {source.title} · {sourceTypeLabel(source.type)}
                </li>
              ))}
            </ul>
          ) : (
            <span>연결된 참고자료가 없습니다.</span>
          )}
        </article>
      ))}
    </div>
  );
}

function StoryNotes({
  plan,
}: {
  plan: NonNullable<StoryPlanReviewResponse["plan"]>;
}) {
  return (
    <ol className="story-review-list story-review-notes">
      {plan.slides.map((slide) => (
        <li key={slide.order}>
          <h2>{slide.title}</h2>
          <p>{slide.speakerNotes}</p>
        </li>
      ))}
    </ol>
  );
}

function StoryPlanLoading(props: {
  busy?: boolean;
  error?: string;
  onCancel?: () => void;
  status?: string;
}) {
  return (
    <section className="story-review-loading" role="status">
      <div className="story-review-skeleton" />
      <h1>
        {props.status === "cancelled"
          ? "생성이 취소되었습니다."
          : props.status === "failed"
            ? "구성을 만들지 못했습니다."
            : "이야기 구성을 정리하고 있습니다."}
      </h1>
      <p>{props.error || "잠시만 기다려 주세요."}</p>
      {props.onCancel ? (
        <OrbitButton
          disabled={props.busy}
          onClick={props.onCancel}
          variant="quiet"
        >
          생성 취소
        </OrbitButton>
      ) : null}
    </section>
  );
}

async function requestStoryPlan(projectId: string, jobId: string) {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/story-plan`,
    { credentials: "include" },
  );
  return parseStoryResponse(response);
}

async function requestStoryPlanMutation(
  projectId: string,
  jobId: string,
  action: "approve" | "cancel" | "regenerate",
  body?: Record<string, unknown>,
) {
  const response = await fetch(
    `/api/v1/projects/${encodeURIComponent(projectId)}/jobs/${encodeURIComponent(jobId)}/story-plan/${action}`,
    {
      method: "POST",
      credentials: "include",
      headers: { "content-type": "application/json" },
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  return parseStoryResponse(response);
}

async function parseStoryResponse(response: Response) {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String(payload.message)
        : "요청을 처리하지 못했습니다.";
    throw new Error(message);
  }
  return storyPlanReviewResponseSchema.parse(payload);
}

function navigate(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function formatMinutes(seconds: number) {
  return `${Math.max(1, Math.round(seconds / 60))}분`;
}

function formatSeconds(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

function sourceStateLabel(state: "connected" | "attention" | "none") {
  if (state === "connected") return "참고자료 연결";
  if (state === "attention") return "일부 확인 필요";
  return "참고자료 없음";
}

function sourceTypeLabel(type: string) {
  if (type === "web") return "웹 자료";
  if (type === "uploaded") return "업로드 자료";
  if (type === "topic") return "사용자 입력";
  return "생성 참고자료";
}

function slideTypeLabel(type: string) {
  const labels: Record<string, string> = {
    cover: "도입",
    title: "도입",
    problem: "문제",
    solution: "핵심 제안",
    "feature-grid": "주요 구성",
    process: "실행 계획",
    data: "데이터와 근거",
    comparison: "비교",
    architecture: "구조",
    quote: "핵심 인용",
    chart: "데이터와 근거",
    summary: "다음 결정",
  };
  return labels[type] ?? "핵심 내용";
}
