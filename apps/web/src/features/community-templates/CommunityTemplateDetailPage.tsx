import {
  demoIds,
  type CommunityTemplateCard,
  type CommunityTemplateComment,
  type CommunityTemplateDetail,
} from "@orbit/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconArrowLeft,
  IconCheck,
  IconHeart,
  IconPencil,
  IconShare3,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { WorkspaceContainer } from "../../components/patterns";
import {
  GradientButton,
  OrbitButton,
  OrbitEmptyState,
  OrbitIconButton,
  OrbitTextarea,
} from "../../components/ui";
import { CommunityTemplatePreview } from "./CommunityTemplatePreview";
import { compactCount } from "./CommunityGalleryPage";
import { useCommunityTemplate } from "./communityTemplateApi";
import {
  createCommunityComment,
  deleteCommunityComment,
  fetchCommunityComments,
  fetchCommunityDetail,
  recordCommunityShare,
  recordCommunityView,
  setCommunityLike,
  updateCommunityComment,
} from "./communitySocialApi";
import "./community-page.css";

export function CommunityTemplateDetailPage(props: {
  onNavigate: (path: string) => void;
  templateId: string;
}) {
  const queryClient = useQueryClient();
  const recordedView = useRef<string | null>(null);
  const [comment, setComment] = useState("");
  const [submittingComment, setSubmittingComment] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingBody, setEditingBody] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [likeBusy, setLikeBusy] = useState(false);
  const [useBusy, setUseBusy] = useState(false);
  const detail = useQuery({
    queryKey: ["community", "detail", props.templateId],
    queryFn: () => fetchCommunityDetail(props.templateId),
    retry: false,
  });
  const comments = useQuery({
    queryKey: ["community", "comments", props.templateId],
    queryFn: () => fetchCommunityComments(props.templateId, { page: 1, limit: 50 }),
    retry: false,
  });

  useEffect(() => {
    if (!detail.data || recordedView.current === props.templateId) return;
    recordedView.current = props.templateId;
    void recordCommunityView(props.templateId)
      .then((engagement) => {
        queryClient.setQueryData<CommunityTemplateDetail>(
          ["community", "detail", props.templateId],
          (current) => current ? { ...current, stats: engagement.stats } : current,
        );
      })
      .catch(() => undefined);
  }, [detail.data, props.templateId, queryClient]);

  const slideCards = useMemo(
    () => detail.data ? detail.data.snapshot.slides.map((slide) => ({
      ...detail.data,
      preview: {
        canvas: detail.data.snapshot.canvas,
        theme: detail.data.snapshot.theme,
        slide,
      },
    } satisfies CommunityTemplateCard)) : [],
    [detail.data],
  );

  async function toggleLike() {
    if (!detail.data || likeBusy) return;
    setLikeBusy(true);
    setActionError(null);
    try {
      const result = await setCommunityLike(props.templateId, !detail.data.likedByMe);
      queryClient.setQueryData<CommunityTemplateDetail>(
        ["community", "detail", props.templateId],
        { ...detail.data, likedByMe: result.likedByMe, stats: result.stats },
      );
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "좋아요를 반영하지 못했습니다.");
    } finally {
      setLikeBusy(false);
    }
  }

  async function shareTemplate() {
    if (!detail.data) return;
    const shareData = { title: detail.data.title, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(window.location.href);
      const result = await recordCommunityShare(props.templateId);
      queryClient.setQueryData<CommunityTemplateDetail>(
        ["community", "detail", props.templateId],
        { ...detail.data, stats: result.stats },
      );
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      setActionError("공유 링크를 만들지 못했습니다.");
    }
  }

  async function useTemplate() {
    if (useBusy) return;
    setUseBusy(true);
    setActionError(null);
    try {
      const result = await useCommunityTemplate({
        workspaceId: demoIds.workspaceId,
        templateId: props.templateId,
        clientRequestId: crypto.randomUUID(),
      });
      props.onNavigate(`/project/${encodeURIComponent(result.project.projectId)}`);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "템플릿을 적용하지 못했습니다.");
      setUseBusy(false);
    }
  }

  async function submitComment() {
    const body = comment.trim();
    if (!body || submittingComment) return;
    setSubmittingComment(true);
    setActionError(null);
    try {
      await createCommunityComment(props.templateId, body);
      setComment("");
      await Promise.all([comments.refetch(), detail.refetch()]);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : "댓글을 등록하지 못했습니다.");
    } finally {
      setSubmittingComment(false);
    }
  }

  async function saveComment(item: CommunityTemplateComment) {
    const body = editingBody.trim();
    if (!body) return;
    await updateCommunityComment(props.templateId, item.commentId, body);
    setEditingId(null);
    await comments.refetch();
  }

  async function removeComment(item: CommunityTemplateComment) {
    if (!window.confirm("댓글을 삭제할까요?")) return;
    await deleteCommunityComment(props.templateId, item.commentId);
    await Promise.all([comments.refetch(), detail.refetch()]);
  }

  if (detail.isLoading) return <div className="community-detail-loading" role="status"><IconSparkles size={24} />발표자료를 펼치고 있습니다.</div>;
  if (detail.isError || !detail.data) {
    return <OrbitEmptyState action={<OrbitButton onClick={() => props.onNavigate("/community")}>커뮤니티로 돌아가기</OrbitButton>} description="삭제되었거나 접근할 수 없는 자료입니다." title="발표자료를 찾을 수 없습니다." />;
  }
  const template = detail.data;

  return (
    <main className="community-detail-page">
      <header className="community-detail-header">
        <WorkspaceContainer as="div" className="community-detail-header-inner" width="content">
          <OrbitIconButton aria-label="커뮤니티로 돌아가기" onClick={() => props.onNavigate("/community")}><IconArrowLeft size={19} /></OrbitIconButton>
          <div><h1>{template.title}</h1><p>{template.category} · 전체 {template.snapshot.slides.length}장</p></div>
          <div className="community-detail-header-actions">
            <OrbitButton icon={<IconShare3 size={16} />} onClick={() => void shareTemplate()} variant="secondary">공유하기</OrbitButton>
            <OrbitButton icon={<IconHeart size={16} />} loading={likeBusy} onClick={() => void toggleLike()} variant={template.likedByMe ? "primary" : "secondary"}>{compactCount(template.stats.likeCount)} 좋아요</OrbitButton>
          </div>
        </WorkspaceContainer>
      </header>

      <WorkspaceContainer as="div" className="community-detail-layout" width="content">
        <section className="community-detail-slides" aria-label="템플릿 슬라이드">
          {slideCards.map((card, index) => (
            <article className="community-detail-slide" key={`${card.templateId}-${index}`}>
              <span>SLIDE {index + 1}</span>
              <CommunityTemplatePreview card={card} />
            </article>
          ))}
        </section>

        <aside className="community-detail-sidebar">
          <section className="community-detail-creator">
            <div className="community-detail-author"><span>{template.author.displayName.slice(0, 1)}</span><div><strong>{template.author.displayName}</strong><small>ORBIT Creator</small></div></div>
            <div className="community-detail-description"><strong>제작자 한마디</strong><p>{template.description || "발표의 흐름과 시각적 완성도를 함께 고려한 템플릿입니다. 내 콘텐츠에 맞게 자유롭게 활용해 보세요."}</p></div>
            <dl className="community-detail-stats">
              <div><dt>좋아요</dt><dd>{compactCount(template.stats.likeCount)}</dd></div>
              <div><dt>조회수</dt><dd>{compactCount(template.stats.viewCount)}</dd></div>
              <div><dt>사용</dt><dd>{compactCount(template.stats.useCount)}</dd></div>
              <div><dt>공유</dt><dd>{compactCount(template.stats.shareCount)}</dd></div>
            </dl>
            <GradientButton disabled={useBusy} onClick={() => void useTemplate()}><IconSparkles size={17} />{useBusy ? "적용 중" : "이 템플릿 사용하기"}</GradientButton>
          </section>

          <section className="community-detail-comments">
            <header><h2>댓글 <span>{template.stats.commentCount}</span></h2></header>
            <OrbitTextarea maxLength={500} onChange={(event) => setComment(event.currentTarget.value)} placeholder="제작자에게 따뜻한 조언과 감상을 남겨주세요." rows={3} value={comment} />
            <div className="community-comment-submit"><small>{comment.length} / 500</small><OrbitButton disabled={!comment.trim()} loading={submittingComment} onClick={() => void submitComment()}>등록</OrbitButton></div>
            {comments.data?.items.map((item) => (
              <article className="community-comment" key={item.commentId}>
                <span className="community-comment-avatar">{item.author.displayName.slice(0, 1)}</span>
                <div>
                  <header><strong>{item.author.displayName}</strong><time>{formatRelativeDate(item.createdAt)}</time></header>
                  {editingId === item.commentId ? (
                    <div className="community-comment-edit"><OrbitTextarea maxLength={500} onChange={(event) => setEditingBody(event.currentTarget.value)} rows={3} value={editingBody} /><div><OrbitIconButton aria-label="수정 취소" onClick={() => setEditingId(null)}><IconX size={15} /></OrbitIconButton><OrbitIconButton aria-label="수정 저장" onClick={() => void saveComment(item)}><IconCheck size={15} /></OrbitIconButton></div></div>
                  ) : <p>{item.body}</p>}
                  {item.ownedByMe && editingId !== item.commentId ? (
                    <div className="community-comment-actions"><button onClick={() => { setEditingId(item.commentId); setEditingBody(item.body); }} type="button"><IconPencil size={13} />수정</button><button onClick={() => void removeComment(item)} type="button"><IconTrash size={13} />삭제</button></div>
                  ) : null}
                </div>
              </article>
            ))}
            {comments.isLoading ? <p className="community-comments-state">댓글을 불러오는 중입니다.</p> : null}
          </section>
        </aside>
      </WorkspaceContainer>

      {actionError ? <div className="community-detail-error" role="alert">{actionError}</div> : null}
      <button className={`community-detail-floating-like${template.likedByMe ? " is-active" : ""}`} disabled={likeBusy} onClick={() => void toggleLike()} type="button"><IconHeart size={19} />{template.likedByMe ? "좋아요 취소" : "좋아요 누르기"}</button>
    </main>
  );
}

function formatRelativeDate(value: string) {
  const elapsed = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.floor(elapsed / 60_000));
  if (minutes < 1) return "방금 전";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return new Date(value).toLocaleDateString("ko-KR");
}
