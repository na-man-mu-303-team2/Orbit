from __future__ import annotations

import hashlib
import re
import time
from collections import OrderedDict
from datetime import UTC, datetime
from typing import Any, Callable, Literal
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse

from pydantic import BaseModel, ConfigDict, Field


ResearchIssueCode = Literal[
    "query-unavailable",
    "provider-call-failed",
    "no-citations",
    "vetting-failed",
    "official-missing",
]

MAX_WEB_RESEARCH_ATTEMPTS = 1


class OfficialWebSource(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    source_id: str = Field(alias="sourceId", min_length=1, max_length=128)
    url: str = Field(min_length=1, max_length=2_048)
    title: str = Field(min_length=1, max_length=500)
    content: str = Field(min_length=1, max_length=4_000)
    content_hash: str = Field(alias="contentHash", pattern=r"^[a-f0-9]{64}$")
    retrieved_at: str = Field(alias="retrievedAt")

    def source_ref(self) -> dict[str, str]:
        return {
            "kind": "web",
            "sourceId": self.source_id,
            "url": self.url,
            "title": self.title,
            "authority": "official",
            "contentHash": self.content_hash,
            "retrievedAt": self.retrieved_at,
        }


class OfficialWebResearchSummary(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    status: Literal["succeeded", "unavailable"]
    attempts: int = Field(ge=0, le=2)
    official_source_count: int = Field(alias="officialSourceCount", ge=0, le=5)
    issue_codes: list[ResearchIssueCode] = Field(alias="issueCodes", max_length=5)
    researched_at: str | None = Field(alias="researchedAt")


class OfficialWebResearchResult(BaseModel):
    summary: OfficialWebResearchSummary
    sources: list[OfficialWebSource] = Field(max_length=5)


class WebSourceCandidate(BaseModel):
    source_id: str
    url: str
    title: str
    content: str

    def official_source(self, *, retrieved_at: str) -> OfficialWebSource:
        return OfficialWebSource(
            sourceId=self.source_id,
            url=self.url,
            title=self.title,
            content=self.content,
            contentHash=hashlib.sha256(self.content.encode("utf-8")).hexdigest(),
            retrievedAt=retrieved_at,
        )


class WebSourceSearchResult(BaseModel):
    attempts: int = Field(ge=0, le=1)
    issue_codes: list[ResearchIssueCode] = Field(max_length=5)
    researched_at: str | None
    candidates: list[WebSourceCandidate] = Field(max_length=10)
    duration_ms: int = Field(ge=0)


def search_web_source_candidates(
    *,
    title: str,
    challenge_topics: list[str],
    terminology: list[str],
    client: Any,
    model: str,
    now: Callable[[], datetime] | None = None,
    timeout_seconds: float = 12.0,
) -> WebSourceSearchResult:
    started_at = time.perf_counter()
    subject = " ".join(title.split()).strip()[:500]
    if len(subject) < 2:
        return WebSourceSearchResult(
            attempts=0,
            issue_codes=["query-unavailable"],
            researched_at=None,
            candidates=[],
            duration_ms=_duration_ms(started_at),
        )

    now_factory = now or (lambda: datetime.now(UTC))
    researched_at = _iso_datetime(now_factory())
    provider_failed = False
    saw_response = False
    saw_candidates = False

    for attempt in range(1, MAX_WEB_RESEARCH_ATTEMPTS + 1):
        try:
            response = client.responses.create(
                model=model,
                tools=[{"type": "web_search", "search_context_size": "low"}],
                include=["web_search_call.action.sources"],
                input=_search_query(
                    subject,
                    challenge_topics=challenge_topics,
                    terminology=terminology,
                    attempt=attempt,
                ),
                timeout=timeout_seconds,
            )
        except Exception:
            provider_failed = True
            continue

        saw_response = True
        candidates = _web_sources_from_response(response)
        if not candidates:
            continue
        saw_candidates = True
        return WebSourceSearchResult(
            attempts=attempt,
            issue_codes=[],
            researched_at=researched_at,
            candidates=candidates,
            duration_ms=_duration_ms(started_at),
        )

    issue_codes: list[ResearchIssueCode] = []
    if provider_failed:
        issue_codes.append("provider-call-failed")
    if saw_response and not saw_candidates:
        issue_codes.append("no-citations")
    if not issue_codes:
        issue_codes.append("no-citations")
    return WebSourceSearchResult(
        attempts=MAX_WEB_RESEARCH_ATTEMPTS,
        issue_codes=issue_codes,
        researched_at=researched_at,
        candidates=[],
        duration_ms=_duration_ms(started_at),
    )


def _search_query(
    subject: str,
    *,
    challenge_topics: list[str],
    terminology: list[str],
    attempt: int,
) -> str:
    bounded_topics = _unique_strings(challenge_topics, limit=3, max_length=120)
    bounded_terms = _unique_strings(terminology, limit=5, max_length=120)
    parts = [
        "Find primary official websites that directly explain the exact presentation subject.",
        f'Exact subject: "{subject}"',
        "Prefer the responsible government body, school, company, standards body, or program owner.",
        "Cite each factual claim with a public URL. Do not use social posts, forums, or aggregators.",
    ]
    if bounded_topics:
        parts.append(f"Challenge topics: {', '.join(bounded_topics)}")
    if bounded_terms:
        parts.append(f"Approved terminology: {', '.join(bounded_terms)}")
    if attempt > 1:
        parts.append(
            "Retry: search the exact subject again and prioritize a first-party official page "
            "that directly supports concrete details."
        )
    return "\n".join(parts)


def _web_sources_from_response(response: Any) -> list[WebSourceCandidate]:
    output_text = str(_object_field(response, "output_text", ""))
    annotations: list[Any] = []
    for item in _object_field(response, "output", []) or []:
        if _object_field(item, "type") != "message":
            continue
        for content in _object_field(item, "content", []) or []:
            if _object_field(content, "type") != "output_text":
                continue
            content_text = str(_object_field(content, "text", ""))
            if content_text:
                output_text = content_text
            annotations.extend(_object_field(content, "annotations", []) or [])

    candidates: OrderedDict[str, WebSourceCandidate] = OrderedDict()
    for annotation in annotations:
        if _object_field(annotation, "type") != "url_citation":
            continue
        url = _canonicalize_web_url(str(_object_field(annotation, "url", "")).strip())
        if not _is_http_url(url):
            continue
        start = int(_object_field(annotation, "start_index", 0) or 0)
        end = int(_object_field(annotation, "end_index", 0) or 0)
        content = _citation_claim_excerpt(output_text, start, end)
        _add_candidate(
            candidates,
            url=url,
            title=str(_object_field(annotation, "title", "")).strip(),
            content=content,
        )

    for match in re.finditer(r"\[([^\]]+)\]\((https?://[^\s)]+)\)", output_text):
        url = _canonicalize_web_url(match.group(2).strip())
        if not _is_http_url(url):
            continue
        _add_candidate(
            candidates,
            url=url,
            title=match.group(1).strip(),
            content=_citation_claim_excerpt(output_text, match.start(), match.end()),
        )
    return list(candidates.values())[:10]


def _add_candidate(
    candidates: OrderedDict[str, WebSourceCandidate],
    *,
    url: str,
    title: str,
    content: str,
) -> None:
    if not content:
        return
    existing = candidates.get(url)
    if existing is not None:
        if content not in existing.content:
            existing.content = "\n".join([existing.content, content])[:4_000]
        return
    candidates[url] = WebSourceCandidate(
        source_id=_web_source_id(url),
        url=url,
        title=(title or urlparse(url).hostname or url)[:500],
        content=content[:4_000],
    )


def _citation_claim_excerpt(text: str, start: int, end: int) -> str:
    safe_start = min(max(0, start), len(text))
    safe_end = min(max(safe_start, end), len(text))
    line_start = max(text.rfind("\n", 0, safe_start) + 1, safe_start - 700)
    next_line = text.find("\n", safe_end)
    line_end = min(next_line if next_line >= 0 else len(text), safe_end + 300)
    claim = " ".join(
        f"{text[line_start:safe_start]} {text[safe_end:line_end]}".split()
    ).strip(" -*\t")
    if len(claim) >= 20:
        return claim
    return " ".join(text[safe_start:safe_end].split()).strip()


def _canonicalize_web_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        return value
    query = urlencode(
        sorted(
            (key, item)
            for key, item in parse_qsl(parsed.query, keep_blank_values=True)
            if not key.casefold().startswith("utm_")
            and key.casefold() not in {"fbclid", "gclid", "mc_cid", "mc_eid"}
        ),
        doseq=True,
    )
    return urlunparse(
        (
            parsed.scheme.casefold(),
            parsed.netloc.casefold(),
            parsed.path.rstrip("/") or "/",
            "",
            query,
            "",
        )
    )


def _web_source_id(url: str) -> str:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:16]
    return f"web:{digest}"


def _is_http_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)


def _object_field(value: Any, name: str, default: Any = None) -> Any:
    if isinstance(value, dict):
        return value.get(name, default)
    return getattr(value, name, default)


def _unique_strings(values: list[str], *, limit: int, max_length: int) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        normalized = " ".join(value.split()).strip()[:max_length]
        key = normalized.casefold()
        if not normalized or key in seen:
            continue
        seen.add(key)
        result.append(normalized)
        if len(result) >= limit:
            break
    return result


def _iso_datetime(value: datetime) -> str:
    normalized = value if value.tzinfo else value.replace(tzinfo=UTC)
    return normalized.astimezone(UTC).isoformat().replace("+00:00", "Z")


def _duration_ms(started_at: float) -> int:
    return max(0, round((time.perf_counter() - started_at) * 1_000))
