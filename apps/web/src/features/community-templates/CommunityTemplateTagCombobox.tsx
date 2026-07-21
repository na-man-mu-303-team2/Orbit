import { useQuery } from "@tanstack/react-query";
import { IconPlus, IconTag, IconX } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { DropdownMenu, DropdownMenuItem } from "../../components/ui";
import {
  communityTemplateKeys,
  fetchCommunityTags,
} from "./communityTemplateApi";
import "./community-template-gallery.css";

const maxTags = 5;

export function CommunityTemplateTagCombobox(props: {
  disabled?: boolean;
  id: string;
  onChange: (tags: string[]) => void;
  value: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tagQuery = {
    query: query.trim() || undefined,
    scope: "all" as const,
    sort: "popular" as const,
    limit: 8,
  };
  const suggestions = useQuery({
    enabled: open,
    queryKey: communityTemplateKeys.tags(tagQuery),
    queryFn: () => fetchCommunityTags(tagQuery),
    staleTime: 30_000,
    retry: false,
  });
  const normalizedSelected = useMemo(
    () => new Set(props.value.map(normalize)),
    [props.value],
  );
  const candidate = query.trim();
  const exactMatch = suggestions.data?.items.some(
    (tag) => normalize(tag.name) === normalize(candidate),
  );

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  function add(name: string) {
    const trimmed = name.trim();
    if (
      !trimmed ||
      normalizedSelected.has(normalize(trimmed)) ||
      props.value.length >= maxTags
    ) {
      return;
    }
    props.onChange([...props.value, trimmed]);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="community-template-tag-combobox" ref={rootRef}>
      {props.value.length ? (
        <div className="community-template-selected-tags">
          {props.value.map((tag) => (
            <span key={normalize(tag)}>
              {tag}
              <button
                aria-label={tag + " 태그 제거"}
                disabled={props.disabled}
                onClick={() =>
                  props.onChange(
                    props.value.filter((item) => item !== tag),
                  )
                }
                type="button"
              >
                <IconX aria-hidden="true" size={13} />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="community-template-tag-input-wrap">
        <IconTag aria-hidden="true" size={17} />
        <input
          disabled={props.disabled || props.value.length >= maxTags}
          id={props.id}
          maxLength={30}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder={
            props.value.length >= maxTags
              ? "태그를 최대 5개 선택했습니다."
              : "예: 생성형 AI, 신입 온보딩, UX 리서치"
          }
          value={query}
        />
      </div>
      {open && (query.trim() || suggestions.data?.items.length) ? (
        <DropdownMenu
          align="start"
          aria-label="태그 추천"
          className="community-template-tag-menu"
          variant="white"
        >
          {(suggestions.data?.items ?? [])
            .filter((tag) => !normalizedSelected.has(normalize(tag.name)))
            .map((tag) => (
              <DropdownMenuItem key={tag.tagId} onClick={() => add(tag.name)}>
                <span>{tag.name}</span>
                <small>{tag.usageCount}개 게시물</small>
              </DropdownMenuItem>
            ))}
          {candidate && !exactMatch ? (
            <DropdownMenuItem
              icon={<IconPlus size={16} />}
              onClick={() => add(candidate)}
            >
              “{candidate}” 태그 만들기
            </DropdownMenuItem>
          ) : null}
        </DropdownMenu>
      ) : null}
      <small>
        {props.value.length} / {maxTags}
      </small>
    </div>
  );
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("ko-KR");
}
