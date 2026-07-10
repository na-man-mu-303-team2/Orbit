from __future__ import annotations

import re


def compact_meaningful_phrases(
    values: list[str],
    *,
    max_items: int,
    max_length: int,
) -> list[str]:
    return [
        value
        for value in compact_texts(values, max_items=max_items, max_length=max_length)
        if is_meaningful_phrase(value, max_length=max_length)
    ]


def compact_texts(
    values: list[str],
    *,
    max_items: int,
    max_length: int,
) -> list[str]:
    return [
        value[:max_length]
        for value in compact(values)
        if value
    ][:max_items]


def is_meaningful_explicit_keyword(value: str) -> bool:
    normalized = value.strip()
    return (
        1 < len(normalized) <= 80
        and not is_generic_imported_title(normalized)
        and is_meaningful_term(normalized)
    )


def is_meaningful_phrase(value: str, *, max_length: int) -> bool:
    normalized = value.strip()
    if not 1 < len(normalized) <= max_length:
        return False
    if is_generic_imported_title(normalized):
        return False

    tokens = re.findall(
        r"[A-Za-z][A-Za-z0-9_-]{1,}|[가-힣][가-힣A-Za-z0-9_-]{0,}",
        normalized,
    )
    meaningful_tokens = [
        token
        for raw_token in tokens
        if (token := normalize_term(raw_token)) and is_meaningful_term(token)
    ]
    return bool(meaningful_tokens)


def is_generic_imported_title(value: str) -> bool:
    return bool(_GENERIC_IMPORTED_TITLE_RE.fullmatch(value.strip()))


def normalize_term(value: str) -> str:
    candidate = value.strip()
    if has_korean(candidate):
        return strip_korean_particle(candidate)
    return candidate


def strip_korean_particle(value: str) -> str:
    candidate = value
    changed = True
    while changed:
        changed = False
        for particle in _KOREAN_PARTICLES:
            if not candidate.endswith(particle):
                continue
            base = candidate[: -len(particle)]
            if len(base) < 2:
                continue
            candidate = base
            changed = True
            break
    return candidate


def is_meaningful_term(value: str) -> bool:
    if not 1 < len(value) <= 40:
        return False
    if is_generic_imported_title(value):
        return False
    if value in _KOREAN_STOP_WORDS:
        return False

    lowered = value.casefold()
    if lowered in _ENGLISH_STOP_WORDS:
        return False
    if any(value.endswith(ending) for ending in _KOREAN_VERB_ENDINGS):
        return False
    return not value.isdecimal()


def has_korean(value: str) -> bool:
    return bool(re.search(r"[가-힣]", value))


def compact(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        normalized = value.strip()
        key = normalized.casefold()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


_KOREAN_STOP_WORDS = {
    "그것",
    "그런",
    "그러한",
    "그리고",
    "그래서",
    "내용",
    "다시",
    "다음",
    "다음은",
    "대한",
    "대해",
    "대해서",
    "마지막",
    "마지막으로",
    "먼저",
    "바로",
    "방식",
    "부분",
    "본격적인",
    "본격적",
    "보면",
    "보시면",
    "보겠습니다",
    "설명",
    "슬라이드",
    "하지만",
    "아까",
    "앞서",
    "여기",
    "여기서",
    "오늘",
    "오늘은",
    "이번",
    "이번에는",
    "이것",
    "이러한",
    "이를",
    "이제",
    "저것",
    "저희",
    "저희는",
    "정도",
    "특히",
    "되는",
    "됩니다",
    "된다",
    "입니다",
    "있는",
    "있고",
    "있다",
    "있습니다",
    "하는",
    "합니다",
    "한다",
    "했습니다",
    "에서",
    "으로",
    "핵심",
}


_KOREAN_PARTICLES = (
    "께서는",
    "에게는",
    "에서는",
    "으로는",
    "이라는",
    "이라고",
    "라는",
    "라고",
    "에는",
    "에게",
    "에서",
    "으로",
    "처럼",
    "부터",
    "까지",
    "보다",
    "께서",
    "로",
    "와",
    "과",
    "은",
    "는",
    "이",
    "가",
    "을",
    "를",
    "에",
    "의",
    "도",
    "만",
    "서",
)

_KOREAN_VERB_ENDINGS = (
    "합니다",
    "했습니다",
    "됩니다",
    "드립니다",
    "입니다",
    "있습니다",
    "하겠습니다",
    "보겠습니다",
    "같습니다",
)

_ENGLISH_STOP_WORDS = {
    "and",
    "are",
    "for",
    "from",
    "here",
    "our",
    "slide",
    "slides",
    "that",
    "the",
    "this",
    "we",
    "with",
}

_GENERIC_IMPORTED_TITLE_RE = re.compile(
    r"(?:slide\s+\d+|슬라이드\s*\d+)",
    re.IGNORECASE,
)
