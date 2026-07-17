import type {
  Job,
  StoryPlanApproveRequest,
  StoryPlanReviewResponse,
} from "@orbit/shared";
import {
  IconChevronDown,
  IconChevronUp,
  IconClock,
  IconFileText,
  IconGripVertical,
  IconInfoCircle,
  IconRefresh,
} from "@tabler/icons-react";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  OrbitButton,
  OrbitDialog,
  OrbitInput,
  OrbitTabs,
  OrbitTextarea,
} from "../../components/ui";
import {
  requestStoryPlan,
  requestStoryPlanMutation,
  saveStoryApprovalDraft,
  storyGenerationPath,
  storyStyleColorPath,
} from "./story-plan-api";
import "./story-plan-review.css";

export {
  storyGenerationPath,
  storyPlanPath,
  storyStyleColorPath,
} from "./story-plan-api";

type StoryTab = "outline" | "script";
type StoryPlan = NonNullable<StoryPlanReviewResponse["plan"]>;
type StorySlide = StoryPlan["slides"][number];
type StoryApprovalSlide = NonNullable<
  StoryPlanApproveRequest["slides"]
>[number];
type StoryPlanEdit =
  | { kind: "reorder"; orders: number[] }
  | { kind: "speaker-notes"; order: number; speakerNotes: string };

const DAILY_IMAGE_BUDGET_WARNING =
  "Daily image asset budget retained remaining placeholders.";

export function hasUnsavedStoryScripts(
  slides: ReadonlyArray<Pick<StorySlide, "sourceOrder" | "speakerNotes">>,
  drafts: Readonly<Record<number, string>>,
) {
  return slides.some((slide) => {
    const draft = drafts[slide.sourceOrder];
    return draft !== undefined && draft !== slide.speakerNotes;
  });
}

export function storyReviewJobFailureMessage(
  job: Pick<Job, "error" | "message" | "result">,
) {
  const warnings = job.result?.warnings;
  if (
    Array.isArray(warnings) &&
    warnings.includes(DAILY_IMAGE_BUDGET_WARNING)
  ) {
    return "AI 이미지 일일 생성 한도를 모두 사용했습니다. 한도가 초기화된 후 다시 시도해 주세요.";
  }
  return job.error?.message || job.message || "AI PPT를 생성하지 못했습니다.";
}

export function storyPlanRegenerationPollingKey(
  response: StoryPlanReviewResponse | null,
) {
  return response?.status === "regenerating"
    ? response.plan?.regenerationCount
    : undefined;
}

export function StoryPlanReviewPage(props: {
  jobId: string;
  projectId: string;
}) {
  const [response, setResponse] = useState<StoryPlanReviewResponse | null>(
    null,
  );
  const [activeTab, setActiveTab] = useState<StoryTab>("outline");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [scriptDrafts, setScriptDrafts] = useState<Record<number, string>>({});
  const [storyDrafts, setStoryDrafts] = useState<StoryApprovalSlide[]>([]);
  const mutationInFlight = useRef(false);
  const regenerationPollingKey = storyPlanRegenerationPollingKey(response);
  const responseSlides = response?.plan?.slides;

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
          navigate(storyGenerationPath(next.projectId, next.jobId));
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
  }, [props.jobId, props.projectId, regenerationPollingKey]);

  useEffect(() => {
    setScriptDrafts({});
    setStoryDrafts(
      responseSlides?.map(({ sourceOrder, title, message }) => ({
        sourceOrder,
        title,
        message,
      })) ?? [],
    );
  }, [response?.plan?.revision, responseSlides]);

  const draftResponse = useMemo(() => {
    if (!response?.plan || storyDrafts.length !== response.plan.slides.length) {
      return response;
    }
    const slidesBySourceOrder = new Map(
      response.plan.slides.map((slide) => [slide.sourceOrder, slide]),
    );
    const slides = storyDrafts.flatMap((draft, index) => {
      const slide = slidesBySourceOrder.get(draft.sourceOrder);
      return slide ? [{ ...slide, ...draft, order: index + 1 }] : [];
    });
    if (slides.length !== response.plan.slides.length) return response;
    return {
      ...response,
      plan: {
        ...response.plan,
        outline: {
          ...response.plan.outline,
          slideTitles: slides.map((slide) => slide.title),
        },
        slides,
      },
    };
  }, [response, storyDrafts]);

  const hasUnsavedScripts = hasUnsavedStoryScripts(
    response?.plan?.slides ?? [],
    scriptDrafts,
  );

  async function editStoryPlan(edit: StoryPlanEdit) {
    if (!response?.plan || mutationInFlight.current) return;
    mutationInFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const next = await requestStoryPlanMutation(
        props.projectId,
        props.jobId,
        "edit",
        { ...edit, expectedRevision: response.plan.revision },
      );
      setScriptDrafts({});
      setResponse(next);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "구성 변경사항을 저장하지 못했습니다.",
      );
      if (edit.kind === "reorder") {
        const latest = await requestStoryPlan(
          props.projectId,
          props.jobId,
        ).catch(() => null);
        if (latest) {
          setResponse(latest);
          setScriptDrafts({});
        }
      }
    } finally {
      mutationInFlight.current = false;
      setBusy(false);
    }
  }

  function reorderSlides(fromOrder: number, toOrder: number) {
    if (!response?.plan || fromOrder === toOrder) return;
    if (hasUnsavedScripts) {
      setActiveTab("script");
      setError("대본 변경사항을 먼저 저장해 주세요.");
      return;
    }
    setStoryDrafts((current) => {
      const next = [...current];
      const [moved] = next.splice(fromOrder - 1, 1);
      if (!moved) return current;
      next.splice(toOrder - 1, 0, moved);
      return next;
    });
  }

  async function saveScript(sourceOrder: number) {
    const speakerNotes = scriptDrafts[sourceOrder]?.trim();
    if (!speakerNotes) {
      setError("대본은 비워 둘 수 없습니다.");
      return;
    }
    const order = response?.plan?.slides.find(
      (slide) => slide.sourceOrder === sourceOrder,
    )?.order;
    if (!order) return;
    await editStoryPlan({ kind: "speaker-notes", order, speakerNotes });
  }

  function updateStoryDraft(
    sourceOrder: number,
    field: "title" | "message",
    value: string,
  ) {
    setStoryDrafts((current) =>
      current.map((slide) =>
        slide.sourceOrder === sourceOrder
          ? { ...slide, [field]: value }
          : slide,
      ),
    );
  }

  function continueToStyle() {
    if (!response?.plan || hasUnsavedScripts) {
      setError("대본 변경사항을 먼저 저장해 주세요.");
      return;
    }
    if (
      storyDrafts.length !== response.plan.slides.length ||
      storyDrafts.some((slide) => !slide.title.trim() || !slide.message.trim())
    ) {
      setError("슬라이드 제목과 핵심 메시지를 모두 입력해 주세요.");
      return;
    }
    const saved = saveStoryApprovalDraft(props.projectId, props.jobId, {
      expectedRevision: response.plan.revision,
      slides: storyDrafts.map((slide) => ({
        ...slide,
        title: slide.title.trim(),
        message: slide.message.trim(),
      })),
    });
    if (!saved) {
      setError("스토리 변경사항을 다음 단계로 전달하지 못했습니다.");
      return;
    }
    navigate(storyStyleColorPath(props.projectId, props.jobId));
  }

  async function mutate(action: "cancel" | "regenerate") {
    if (!response || mutationInFlight.current) return;
    if (action !== "cancel" && (!response.plan || hasUnsavedScripts)) {
      setError("대본 변경사항을 먼저 저장해 주세요.");
      return;
    }
    mutationInFlight.current = true;
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
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "요청을 처리하지 못했습니다.",
      );
    } finally {
      mutationInFlight.current = false;
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
        onApprove={continueToStyle}
        onCancel={() => void mutate("cancel")}
        hasUnsavedScripts={hasUnsavedScripts}
        onRegenerate={() => setDialogOpen(true)}
        onReorder={reorderSlides}
        onSaveScript={(order) => void saveScript(order)}
        onScriptChange={(order, value) =>
          setScriptDrafts((current) => ({ ...current, [order]: value }))
        }
        onStoryChange={updateStoryDraft}
        onTabChange={(tab) => setActiveTab(tab)}
        response={draftResponse ?? response}
        scriptDrafts={scriptDrafts}
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
  hasUnsavedScripts?: boolean;
  onApprove: () => void;
  onCancel: () => void;
  onRegenerate: () => void;
  onReorder: (fromOrder: number, toOrder: number) => void;
  onSaveScript: (order: number) => void;
  onScriptChange: (order: number, value: string) => void;
  onStoryChange: (
    sourceOrder: number,
    field: "title" | "message",
    value: string,
  ) => void;
  onTabChange: (tab: StoryTab) => void;
  response: StoryPlanReviewResponse;
  scriptDrafts: Record<number, string>;
}) {
  const plan = props.response.plan;
  if (!plan) {
    return (
      <StoryPlanLoading
        busy={props.busy}
        error={props.response.error?.message}
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
        ariaLabel="이야기 구성"
        onChange={(tab) => props.onTabChange(tab as StoryTab)}
        tabs={[
          { id: "outline", label: "목차" },
        ]}
      >
        {props.activeTab === "outline" ? (
          <StoryOutline
            disabled={props.busy || !reviewPending || props.hasUnsavedScripts}
            onReorder={props.onReorder}
            onStoryChange={props.onStoryChange}
            plan={plan}
          />
        ) : null}
      </OrbitTabs>
      {props.hasUnsavedScripts ? (
        <p className="story-review-unsaved" role="status">
          대본 변경사항을 저장하면 목차 순서를 다시 바꿀 수 있습니다.
        </p>
      ) : null}

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
            disabled={
              props.busy ||
              !reviewPending ||
              exhausted ||
              props.hasUnsavedScripts
            }
            onClick={props.onRegenerate}
            variant="secondary"
          >
            다른 구성 제안받기
          </OrbitButton>
          <OrbitButton
            disabled={props.busy || !reviewPending || props.hasUnsavedScripts}
            onClick={props.onApprove}
          >
            스타일 선택
          </OrbitButton>
          <span>다음 단계에서 폰트와 컬러를 선택합니다.</span>
        </div>
      </footer>
    </section>
  );
}

function StoryOutline(props: {
  disabled?: boolean;
  onReorder: (fromOrder: number, toOrder: number) => void;
  onStoryChange: (
    sourceOrder: number,
    field: "title" | "message",
    value: string,
  ) => void;
  plan: StoryPlan;
}) {
  return (
    <div className="story-review-card-list">
      {props.plan.slides.map((slide, index) => (
        <StoryCard
          disabled={props.disabled}
          index={index}
          key={slide.order}
          onReorder={props.onReorder}
          slide={slide}
          total={props.plan.slides.length}
        >
          <div className="story-review-card-heading">
            <div>
              <small>{slideTypeLabel(slide.slideType)}</small>
              <OrbitInput
                aria-label={`${slide.order}번 슬라이드 제목`}
                disabled={props.disabled}
                maxLength={200}
                onChange={(event) =>
                  props.onStoryChange(
                    slide.sourceOrder,
                    "title",
                    event.currentTarget.value,
                  )
                }
                value={slide.title}
              />
            </div>
            <time>{formatSeconds(slide.targetSeconds)}</time>
          </div>
          <OrbitTextarea
            aria-label={`${slide.order}번 슬라이드 핵심 메시지`}
            disabled={props.disabled}
            maxLength={1000}
            onChange={(event) =>
              props.onStoryChange(
                slide.sourceOrder,
                "message",
                event.currentTarget.value,
              )
            }
            rows={3}
            value={slide.message}
          />
        </StoryCard>
      ))}
    </div>
  );
}

function StoryCard(props: {
  children: ReactNode;
  disabled?: boolean;
  index: number;
  onReorder: (fromOrder: number, toOrder: number) => void;
  slide: StorySlide;
  total: number;
}) {
  return (
    <article
      aria-label={`${props.slide.order}번 ${props.slide.title}`}
      className="story-review-card"
      draggable={!props.disabled}
      onDragOver={(event) => {
        if (!props.disabled) event.preventDefault();
      }}
      onDragStart={(event) => {
        if (props.disabled) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", String(props.slide.order));
      }}
      onDrop={(event) => {
        if (props.disabled) return;
        event.preventDefault();
        const fromOrder = Number(event.dataTransfer.getData("text/plain"));
        if (Number.isInteger(fromOrder)) {
          props.onReorder(fromOrder, props.slide.order);
        }
      }}
    >
      <div className="story-review-card-order" aria-hidden="true">
        <IconGripVertical size={18} />
        <span>{props.slide.order}</span>
      </div>
      <div className="story-review-card-content">{props.children}</div>
      <div className="story-review-move-actions">
        <button
          aria-label={`${props.slide.title} 위로 이동`}
          disabled={props.disabled || props.index === 0}
          onClick={() =>
            props.onReorder(props.slide.order, props.slide.order - 1)
          }
          type="button"
        >
          <IconChevronUp aria-hidden="true" size={17} />
        </button>
        <button
          aria-label={`${props.slide.title} 아래로 이동`}
          disabled={props.disabled || props.index === props.total - 1}
          onClick={() =>
            props.onReorder(props.slide.order, props.slide.order + 1)
          }
          type="button"
        >
          <IconChevronDown aria-hidden="true" size={17} />
        </button>
      </div>
    </article>
  );
}

export function moveStorySlideOrder(
  orders: number[],
  fromOrder: number,
  toOrder: number,
): number[] {
  const fromIndex = orders.indexOf(fromOrder);
  const toIndex = orders.indexOf(toOrder);
  if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return orders;
  const next = [...orders];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved!);
  return next;
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
