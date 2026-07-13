import type {
  RehearsalFocusItem,
  RehearsalFocusKind,
  RehearsalFocusProfile,
} from "@orbit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Plus,
  Target,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  OrbitButton,
  OrbitField,
  OrbitIconButton,
  OrbitInput,
  OrbitSelect,
  OrbitStatus,
} from "../../design-system";
import {
  fetchRehearsalFocusProfile,
  putRehearsalFocusProfile,
  RehearsalFocusProfileConflictError,
} from "./rehearsalFocusProfileApi";
import "./rehearsal-focus-profile.css";

const kindOptions: ReadonlyArray<{ value: RehearsalFocusKind; label: string }> =
  [
    { value: "opening", label: "도입" },
    { value: "closing", label: "마무리" },
    { value: "timing", label: "시간" },
    { value: "semantic-coverage", label: "핵심 내용" },
    { value: "filler-words", label: "습관어" },
    { value: "pauses", label: "멈춤" },
    { value: "custom", label: "직접 입력" },
  ];

export function RehearsalFocusProfilePanel(props: {
  onReadyChange?: (ready: boolean) => void;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => ["rehearsal-focus-profile", props.projectId] as const,
    [props.projectId],
  );
  const profileQuery = useQuery({
    queryKey,
    queryFn: () => fetchRehearsalFocusProfile(props.projectId),
    retry: false,
  });
  const hydratedProfileKey = useRef<string | null>(null);
  const [currentProfile, setCurrentProfile] =
    useState<RehearsalFocusProfile | null>(null);
  const [draftItems, setDraftItems] = useState<RehearsalFocusItem[]>([]);
  const [conflictProfile, setConflictProfile] =
    useState<RehearsalFocusProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (profileQuery.data === undefined) return;
    const revision = profileQuery.data?.revision ?? 0;
    const profileKey = `${props.projectId}:${revision}`;
    if (hydratedProfileKey.current === profileKey) return;
    hydratedProfileKey.current = profileKey;
    setCurrentProfile(profileQuery.data);
    setDraftItems(cloneItems(profileQuery.data?.items ?? []));
    setConflictProfile(null);
  }, [profileQuery.data, props.projectId]);

  const dirty = !sameItems(draftItems, currentProfile?.items ?? []);
  const ready =
    profileQuery.isError ||
    (!profileQuery.isLoading && !saving && !dirty && !conflictProfile);

  useEffect(() => {
    props.onReadyChange?.(ready);
  }, [props.onReadyChange, ready]);

  async function saveProfile() {
    const normalized = draftItems.map((item, index) => ({
      ...item,
      priority: (index + 1) as 1 | 2 | 3,
      label: item.label.trim(),
    }));
    if (normalized.some((item) => !item.label)) {
      setError("각 목표의 내용을 입력해 주세요.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");
    try {
      const saved = await putRehearsalFocusProfile(props.projectId, {
        expectedRevision: currentProfile?.revision ?? 0,
        items: normalized,
      });
      hydratedProfileKey.current = `${props.projectId}:${saved.revision}`;
      setCurrentProfile(saved);
      setDraftItems(cloneItems(saved.items));
      setConflictProfile(null);
      queryClient.setQueryData(queryKey, saved);
      setMessage(`연습 목표 Revision ${saved.revision} 저장 완료`);
    } catch (cause) {
      if (cause instanceof RehearsalFocusProfileConflictError) {
        setConflictProfile(cause.currentProfile);
        setError(cause.message);
      } else {
        setError(
          cause instanceof Error
            ? cause.message
            : "연습 목표를 저장하지 못했습니다.",
        );
      }
    } finally {
      setSaving(false);
    }
  }

  function useLatestProfile() {
    const latest = conflictProfile ?? currentProfile;
    hydratedProfileKey.current = `${props.projectId}:${latest?.revision ?? 0}`;
    setCurrentProfile(latest);
    setDraftItems(cloneItems(latest?.items ?? []));
    setConflictProfile(null);
    setError("");
    setMessage(
      latest
        ? `서버의 최신 Revision ${latest.revision}을 확인했습니다.`
        : "변경을 취소했습니다.",
    );
    queryClient.setQueryData(queryKey, latest);
  }

  if (profileQuery.isLoading) {
    return (
      <section
        className="rehearsal-focus-profile-card"
        aria-busy="true"
        aria-label="연습 목표"
      >
        <Target aria-hidden="true" size={24} />
        <div>
          <h2>이번 연습 목표를 불러오고 있어요.</h2>
          <p>저장된 목표를 확인한 뒤 리허설을 시작할 수 있습니다.</p>
        </div>
      </section>
    );
  }

  if (profileQuery.isError) {
    return (
      <section
        className="rehearsal-focus-profile-card rehearsal-focus-profile-load-error"
        role="status"
      >
        <AlertTriangle aria-hidden="true" size={24} />
        <div>
          <h2>연습 목표를 불러오지 못했어요.</h2>
          <p>
            기존 리허설은 계속할 수 있으며 서버에 저장된 목표가 있으면 실행 시
            자동으로 고정됩니다.
          </p>
        </div>
        <OrbitButton
          variant="secondary"
          onClick={() => void profileQuery.refetch()}
        >
          다시 불러오기
        </OrbitButton>
      </section>
    );
  }

  return (
    <RehearsalFocusProfileEditor
      conflictProfile={conflictProfile}
      currentRevision={currentProfile?.revision ?? 0}
      dirty={dirty}
      draftItems={draftItems}
      error={error}
      message={message}
      onAdd={() => setDraftItems((items) => addFocusItem(items))}
      onDiscard={useLatestProfile}
      onMove={(index, direction) =>
        setDraftItems((items) => moveFocusItem(items, index, direction))
      }
      onRemove={(index) =>
        setDraftItems((items) =>
          renumberFocusItems(
            items.filter((_, itemIndex) => itemIndex !== index),
          ),
        )
      }
      onSave={() => void saveProfile()}
      onUpdate={(index, patch) =>
        setDraftItems((items) =>
          items.map((item, itemIndex) =>
            itemIndex === index ? { ...item, ...patch } : item,
          ),
        )
      }
      saving={saving}
    />
  );
}

export function RehearsalFocusProfileEditor(props: {
  conflictProfile: RehearsalFocusProfile | null;
  currentRevision: number;
  dirty: boolean;
  draftItems: RehearsalFocusItem[];
  error: string;
  message: string;
  onAdd: () => void;
  onDiscard: () => void;
  onMove: (index: number, direction: -1 | 1) => void;
  onRemove: (index: number) => void;
  onSave: () => void;
  onUpdate: (index: number, patch: Partial<RehearsalFocusItem>) => void;
  saving: boolean;
}) {
  return (
    <section
      className="rehearsal-focus-profile-card"
      aria-labelledby="rehearsal-focus-profile-title"
    >
      <header className="rehearsal-focus-profile-header">
        <span>
          <Target aria-hidden="true" size={22} />
        </span>
        <div>
          <p className="orbit-ds-eyebrow">PRACTICE FOCUS</p>
          <h2 id="rehearsal-focus-profile-title">이번 연습에서 확인할 목표</h2>
          <p>
            최대 3개까지 저장하며, 저장된 목표만 이번 리허설 Snapshot에
            고정됩니다.
          </p>
        </div>
        <OrbitStatus tone={props.dirty ? "warning" : "lilac"}>
          {props.dirty
            ? "변경 사항 있음"
            : props.currentRevision > 0
              ? `Revision ${props.currentRevision}`
              : "새 목표"}
        </OrbitStatus>
      </header>

      <div className="rehearsal-focus-profile-list">
        {props.draftItems.length === 0 ? (
          <p className="rehearsal-focus-profile-empty">
            아직 저장된 목표가 없습니다. 목표 없이 시작하거나 필요한 목표를
            추가하세요.
          </p>
        ) : null}
        {props.draftItems.map((item, index) => (
          <div className="rehearsal-focus-profile-row" key={item.focusItemId}>
            <strong>{index + 1}순위</strong>
            <OrbitField
              id={`rehearsal-focus-kind-${item.focusItemId}`}
              label="목표 종류"
            >
              <OrbitSelect
                value={item.kind}
                onChange={(event) =>
                  props.onUpdate(index, {
                    kind: event.target.value as RehearsalFocusKind,
                    targetScope: null,
                  })
                }
              >
                {kindOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </OrbitSelect>
            </OrbitField>
            <OrbitField
              id={`rehearsal-focus-label-${item.focusItemId}`}
              label="목표 내용"
            >
              <OrbitInput
                maxLength={160}
                value={item.label}
                onChange={(event) =>
                  props.onUpdate(index, { label: event.target.value })
                }
              />
            </OrbitField>
            <div className="rehearsal-focus-profile-row-actions">
              <OrbitIconButton
                aria-label={`${index + 1}순위 목표를 위로 이동`}
                disabled={index === 0}
                onClick={() => props.onMove(index, -1)}
              >
                <ArrowUp size={17} />
              </OrbitIconButton>
              <OrbitIconButton
                aria-label={`${index + 1}순위 목표를 아래로 이동`}
                disabled={index === props.draftItems.length - 1}
                onClick={() => props.onMove(index, 1)}
              >
                <ArrowDown size={17} />
              </OrbitIconButton>
              <OrbitIconButton
                aria-label={`${index + 1}순위 목표 삭제`}
                onClick={() => props.onRemove(index)}
              >
                <Trash2 size={17} />
              </OrbitIconButton>
            </div>
          </div>
        ))}
      </div>

      {props.conflictProfile ? (
        <aside className="rehearsal-focus-profile-conflict" role="alert">
          <AlertTriangle aria-hidden="true" size={20} />
          <div>
            <strong>
              서버의 최신 Revision {props.conflictProfile.revision}
            </strong>
            <ol>
              {props.conflictProfile.items.map((item) => (
                <li key={item.focusItemId}>{item.label}</li>
              ))}
            </ol>
          </div>
        </aside>
      ) : null}

      {props.error ? (
        <p className="rehearsal-focus-profile-error" role="alert">
          {props.error}
        </p>
      ) : null}
      {props.message ? (
        <p className="rehearsal-focus-profile-message" aria-live="polite">
          {props.message}
        </p>
      ) : null}

      <footer className="rehearsal-focus-profile-actions">
        <OrbitButton
          icon={<Plus aria-hidden="true" size={17} />}
          variant="secondary"
          disabled={
            props.draftItems.length >= 3 || Boolean(props.conflictProfile)
          }
          onClick={props.onAdd}
        >
          목표 추가
        </OrbitButton>
        {props.dirty || props.conflictProfile ? (
          <OrbitButton variant="quiet" onClick={props.onDiscard}>
            {props.conflictProfile ? "서버 최신 목표로 바꾸기" : "변경 취소"}
          </OrbitButton>
        ) : null}
        <OrbitButton
          disabled={
            props.saving || !props.dirty || Boolean(props.conflictProfile)
          }
          onClick={props.onSave}
        >
          {props.saving ? "저장 중" : "목표 저장"}
        </OrbitButton>
      </footer>
    </section>
  );
}

export function renumberFocusItems(items: RehearsalFocusItem[]) {
  return items.map((item, index) => ({
    ...item,
    priority: (index + 1) as 1 | 2 | 3,
  }));
}

export function moveFocusItem(
  items: RehearsalFocusItem[],
  index: number,
  direction: -1 | 1,
) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return renumberFocusItems(next);
}

function addFocusItem(items: RehearsalFocusItem[]) {
  if (items.length >= 3) return items;
  return [
    ...items,
    {
      focusItemId: createFocusItemId(),
      priority: (items.length + 1) as 1 | 2 | 3,
      kind: "custom" as const,
      label: "",
      targetScope: null,
    },
  ];
}

function createFocusItemId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `focus_item_${crypto.randomUUID()}`;
  }
  return `focus_item_${Date.now()}_${fallbackId++}`;
}

function cloneItems(items: readonly RehearsalFocusItem[]) {
  return items.map((item) => ({
    ...item,
    targetScope: item.targetScope ? { ...item.targetScope } : null,
  }));
}

function sameItems(
  left: readonly RehearsalFocusItem[],
  right: readonly RehearsalFocusItem[],
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

let fallbackId = 0;
