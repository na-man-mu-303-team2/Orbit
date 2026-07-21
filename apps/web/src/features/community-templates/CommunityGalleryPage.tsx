import {
  type CommunityTemplateCategory,
  type CommunityTemplateDiscoverCard,
  type CommunityTemplateSort,
} from "@orbit/shared";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconEye,
  IconHeart,
  IconMessageCircle,
  IconSearch,
  IconSparkles,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { useMemo, useState } from "react";

import { WorkspaceContainer } from "../../components/patterns";
import {
  GradientButton,
  OrbitButton,
  OrbitEmptyState,
  OrbitInput,
} from "../../components/ui";
import { CommunityTemplatePreview } from "./CommunityTemplatePreview";
import { CommunityTemplateCategoryDropdown } from "./CommunityTemplateCategoryDropdown";
import { PublishCommunityTemplateDialog } from "./PublishCommunityTemplateDialog";
import { fetchCommunityDiscover } from "./communitySocialApi";
import {
  communityTemplateKeys,
  fetchCommunityTags,
} from "./communityTemplateApi";
import "./community-page.css";

const sortOptions: Array<{ label: string; value: CommunityTemplateSort }> = [
  { label: "인기순", value: "popular" },
  { label: "최신순", value: "latest" },
  { label: "추천 자료", value: "recommended" },
];

export function CommunityGalleryPage(props: {
  onNavigate: (path: string) => void;
}) {
  const queryClient = useQueryClient();
  const initialPublishProjectId = useMemo(
    () => new URLSearchParams(window.location.search).get("publishProjectId")?.trim() || undefined,
    [],
  );
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<CommunityTemplateCategory | "">("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [sort, setSort] = useState<CommunityTemplateSort>("popular");
  const [publishOpen, setPublishOpen] = useState(Boolean(initialPublishProjectId));
  const [notice, setNotice] = useState<string | null>(null);
  const templates = useInfiniteQuery({
    queryKey: ["community", "discover", query.trim(), category, tagIds, sort],
    queryFn: ({ pageParam }) =>
      fetchCommunityDiscover({
        query: query.trim() || undefined,
        categoryId: category || undefined,
        tagIds: tagIds.length ? tagIds : undefined,
        sort,
        page: pageParam,
        limit: 18,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    retry: false,
  });
  const availableTagsQuery = {
    scope: "used" as const,
    sort: "popular" as const,
    limit: 20,
  };
  const availableTags = useQuery({
    queryKey: communityTemplateKeys.tags(availableTagsQuery),
    queryFn: () => fetchCommunityTags(availableTagsQuery),
    staleTime: 30_000,
    retry: false,
  });
  const cards = useMemo(
    () => templates.data?.pages.flatMap((page) => page.items) ?? [],
    [templates.data],
  );
  function closePublishDialog() {
    setPublishOpen(false);
    const url = new URL(window.location.href);
    if (url.searchParams.has("publishProjectId")) {
      url.searchParams.delete("publishProjectId");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }
  return (
    <main className="community-page">
      <WorkspaceContainer as="section" className="community-page-hero" width="content">
        <header className="community-page-hero-heading">
          <div>
            <h1>Community</h1>
          </div>
          <GradientButton className="community-page-publish" onClick={() => setPublishOpen(true)}>
            <IconUpload aria-hidden="true" size={17} />
            프로젝트 공유하기
          </GradientButton>
        </header>
        <label className="community-page-search">
          <IconSearch aria-hidden="true" size={19} />
          <OrbitInput
            aria-label="공유된 발표자료 검색"
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="제목, 소개글, 작성자로 검색"
            value={query}
          />
        </label>
      </WorkspaceContainer>

      <WorkspaceContainer as="section" className="community-gallery" width="content">
        <div className="community-gallery-toolbar">
          <div aria-label="커뮤니티 정렬" className="community-gallery-sort" role="tablist">
            {sortOptions.map((option) => (
              <button
                aria-selected={sort === option.value}
                className={sort === option.value ? "is-active" : ""}
                key={option.value}
                onClick={() => setSort(option.value)}
                role="tab"
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          <div className="community-gallery-topic-filter">
            <span className="community-gallery-filter-label">대표 주제</span>
            <CommunityTemplateCategoryDropdown
              id="community-gallery-category"
              onChange={setCategory}
              value={category}
            />
            {category ? (
              <button
                aria-label="대표 주제 필터 해제"
                className="community-gallery-clear-category"
                onClick={() => setCategory("")}
                type="button"
              >
                <IconX aria-hidden="true" size={15} />
              </button>
            ) : null}
          </div>
        </div>
        {availableTags.data?.items.length ? (
          <div aria-label="게시물 태그 필터" className="community-gallery-tag-filters">
            <span>태그</span>
            {availableTags.data.items.map((tag) => {
              const active = tagIds.includes(tag.tagId);
              return (
                <button
                  aria-pressed={active}
                  className={active ? "is-active" : ""}
                  key={tag.tagId}
                  onClick={() =>
                    setTagIds((current) =>
                      active
                        ? current.filter((tagId) => tagId !== tag.tagId)
                        : [...current, tag.tagId],
                    )
                  }
                  type="button"
                >
                  {tag.name}
                </button>
              );
            })}
          </div>
        ) : null}

        {notice ? <div className="community-page-notice" role="status">{notice}</div> : null}
        {templates.isLoading ? (
          <div className="community-gallery-loading" role="status"><IconSparkles size={24} />자료를 큐레이션하고 있습니다.</div>
        ) : templates.isError ? (
          <OrbitEmptyState
            action={<OrbitButton onClick={() => void templates.refetch()}>다시 시도</OrbitButton>}
            description="잠시 후 다시 불러와 주세요."
            title="커뮤니티 자료를 불러오지 못했습니다."
          />
        ) : cards.length ? (
          <>
            <div className="community-gallery-grid">
              {cards.map((card) => (
                <CommunityGalleryCard
                  card={card}
                  key={card.templateId}
                  onOpen={() => props.onNavigate(`/community/${encodeURIComponent(card.templateId)}`)}
                />
              ))}
            </div>
            {templates.hasNextPage ? (
              <OrbitButton
                className="community-gallery-more"
                disabled={templates.isFetchingNextPage}
                onClick={() => void templates.fetchNextPage()}
                variant="secondary"
              >
                {templates.isFetchingNextPage ? "불러오는 중" : "더 많은 자료 보기"}
              </OrbitButton>
            ) : null}
          </>
        ) : (
          <OrbitEmptyState description="검색어나 카테고리를 바꿔보세요." title="조건에 맞는 자료가 없습니다." />
        )}
      </WorkspaceContainer>

      <PublishCommunityTemplateDialog
        initialProjectId={initialPublishProjectId}
        onClose={closePublishDialog}
        onPublished={(title) => {
          closePublishDialog();
          setNotice(`“${title}” 자료를 커뮤니티에 공개했습니다.`);
          void queryClient.invalidateQueries({ queryKey: ["community"] });
        }}
        open={publishOpen}
      />
    </main>
  );
}

function CommunityGalleryCard(props: {
  card: CommunityTemplateDiscoverCard;
  onOpen: () => void;
}) {
  return (
    <article className="community-gallery-card">
      <button className="community-gallery-card-preview" onClick={props.onOpen} type="button">
        <CommunityTemplatePreview card={props.card} />
        <span>{props.card.categoryName}</span>
      </button>
      <button className="community-gallery-card-copy" onClick={props.onOpen} type="button">
        <strong>{props.card.title}</strong>
        {props.card.tags.length ? (
          <span className="community-gallery-card-tags">
            {props.card.tags.slice(0, 3).map((tag) => (
              <span key={tag.tagId}>{tag.name}</span>
            ))}
          </span>
        ) : null}
        <span className="community-gallery-card-author">
          <span aria-hidden="true">
            {props.card.author.avatarUrl ? (
              <img alt="" src={props.card.author.avatarUrl} />
            ) : props.card.author.displayName.slice(0, 1)}
          </span>
          {props.card.author.displayName}
        </span>
        <span className="community-gallery-card-stats">
          <span><IconHeart aria-hidden="true" size={14} />{compactCount(props.card.stats.likeCount)}</span>
          <span><IconEye aria-hidden="true" size={14} />{compactCount(props.card.stats.viewCount)}</span>
          <span><IconMessageCircle aria-hidden="true" size={14} />{compactCount(props.card.stats.commentCount)}</span>
        </span>
      </button>
    </article>
  );
}

export function compactCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}
