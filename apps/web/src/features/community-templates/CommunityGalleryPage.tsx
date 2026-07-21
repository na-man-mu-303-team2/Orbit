import {
  type CommunityTemplateCategory,
  type CommunityTemplateDiscoverCard,
  type CommunityTemplateSort,
} from "@orbit/shared";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  IconEye,
  IconHeart,
  IconMessageCircle,
  IconSearch,
  IconSparkles,
  IconUpload,
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
import { PublishCommunityTemplateDialog } from "./PublishCommunityTemplateDialog";
import { fetchCommunityDiscover } from "./communitySocialApi";
import "./community-page.css";

const categoryOptions: Array<{
  label: string;
  value: CommunityTemplateCategory | undefined;
}> = [
  { label: "전체", value: undefined },
  { label: "비즈니스", value: "business" },
  { label: "교육", value: "education" },
  { label: "포트폴리오", value: "portfolio" },
  { label: "이벤트", value: "event" },
];

const sortOptions: Array<{ label: string; value: CommunityTemplateSort }> = [
  { label: "인기순", value: "popular" },
  { label: "최신순", value: "latest" },
  { label: "추천 자료", value: "recommended" },
];

export function CommunityGalleryPage(props: {
  onNavigate: (path: string) => void;
}) {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [category, setCategory] =
    useState<CommunityTemplateCategory | undefined>();
  const [sort, setSort] = useState<CommunityTemplateSort>("popular");
  const [publishOpen, setPublishOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const templates = useInfiniteQuery({
    queryKey: ["community", "discover", query.trim(), category, sort],
    queryFn: ({ pageParam }) =>
      fetchCommunityDiscover({
        query: query.trim() || undefined,
        category,
        sort,
        page: pageParam,
        limit: 18,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.hasMore ? lastPage.page + 1 : undefined,
    retry: false,
  });
  const cards = useMemo(
    () => templates.data?.pages.flatMap((page) => page.items) ?? [],
    [templates.data],
  );
  return (
    <main className="community-page">
      <WorkspaceContainer as="section" className="community-page-hero" width="content">
        <header className="community-page-hero-heading">
          <div>
            <h1>Orbit Community</h1>
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
          <span className="community-gallery-filter-label">발표 주제</span>
          <div aria-label="커뮤니티 카테고리" className="community-gallery-categories">
            {categoryOptions.map((option) => (
              <button
                className={category === option.value ? "is-active" : ""}
                key={option.label}
                onClick={() => setCategory(option.value)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

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
        onClose={() => setPublishOpen(false)}
        onPublished={(title) => {
          setPublishOpen(false);
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
        <span>{categoryLabel(props.card.category)}</span>
      </button>
      <button className="community-gallery-card-copy" onClick={props.onOpen} type="button">
        <strong>{props.card.title}</strong>
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

function categoryLabel(category: CommunityTemplateCategory) {
  return categoryOptions.find((option) => option.value === category)?.label ?? category;
}

export function compactCount(value: number) {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}m`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}
