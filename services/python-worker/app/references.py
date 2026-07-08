from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Protocol

DEFAULT_TARGET_CHARS = 1200
DEFAULT_MAX_CHARS = 1500
DEFAULT_OVERLAP_CHARS = 150
DEFAULT_EMBEDDING_MODEL = "text-embedding-3-small"
EMBEDDING_DIMENSION = 1536


@dataclass(frozen=True)
class ReferenceChunk:
    chunk_index: int
    content: str
    content_hash: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class EmbeddingResult:
    embeddings: list[list[float]] = field(default_factory=list)
    status: str = "skipped"
    message: str = ""
    model: str = DEFAULT_EMBEDDING_MODEL


@dataclass(frozen=True)
class ReferenceChunkInput:
    project_id: str
    file_id: str
    chunk_index: int
    content: str
    content_hash: str
    metadata: dict[str, Any]
    embedding: list[float]


@dataclass(frozen=True)
class ReferenceSearchResult:
    chunk_id: str
    project_id: str
    file_id: str
    chunk_index: int
    content: str
    metadata: dict[str, Any]
    score: float


@dataclass(frozen=True)
class ReferenceIndexResult:
    status: str
    chunk_count: int = 0
    message: str = ""


class ReferenceRepository(Protocol):
    def replace_chunks(
        self,
        project_id: str,
        file_id: str,
        chunks: list[ReferenceChunkInput],
    ) -> None:
        ...

    def search_chunks(
        self,
        project_id: str,
        query_embedding: list[float],
        *,
        limit: int = 6,
        file_ids: list[str] | None = None,
    ) -> list[ReferenceSearchResult]:
        ...


class PostgresReferenceRepository:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    def replace_chunks(
        self,
        project_id: str,
        file_id: str,
        chunks: list[ReferenceChunkInput],
    ) -> None:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM reference_chunks
                    WHERE project_id = %s AND file_id = %s
                    """,
                    (project_id, file_id),
                )
                for chunk in chunks:
                    cursor.execute(
                        """
                        INSERT INTO reference_chunks (
                            project_id, file_id, chunk_index, content,
                            content_hash, metadata_json, embedding
                        )
                        VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s::vector)
                        """,
                        (
                            chunk.project_id,
                            chunk.file_id,
                            chunk.chunk_index,
                            chunk.content,
                            chunk.content_hash,
                            _json_dumps(chunk.metadata),
                            _vector_literal(chunk.embedding),
                        ),
                    )
            connection.commit()

    def search_chunks(
        self,
        project_id: str,
        query_embedding: list[float],
        *,
        limit: int = 6,
        file_ids: list[str] | None = None,
    ) -> list[ReferenceSearchResult]:
        with self._connect() as connection:
            with connection.cursor() as cursor:
                if file_ids:
                    cursor.execute(
                        """
                        SELECT id, project_id, file_id, chunk_index, content,
                               metadata_json, 1 - (embedding <=> %s::vector) AS score
                        FROM reference_chunks
                        WHERE project_id = %s
                          AND file_id = ANY(%s)
                        ORDER BY embedding <=> %s::vector
                        LIMIT %s
                        """,
                        (
                            _vector_literal(query_embedding),
                            project_id,
                            file_ids,
                            _vector_literal(query_embedding),
                            max(1, min(limit, 20)),
                        ),
                    )
                else:
                    cursor.execute(
                        """
                        SELECT id, project_id, file_id, chunk_index, content,
                               metadata_json, 1 - (embedding <=> %s::vector) AS score
                        FROM reference_chunks
                        WHERE project_id = %s
                        ORDER BY embedding <=> %s::vector
                        LIMIT %s
                        """,
                        (
                            _vector_literal(query_embedding),
                            project_id,
                            _vector_literal(query_embedding),
                            max(1, min(limit, 20)),
                        ),
                    )
                rows = cursor.fetchall()

        return [
            ReferenceSearchResult(
                chunk_id=str(row[0]),
                project_id=str(row[1]),
                file_id=str(row[2]),
                chunk_index=int(row[3]),
                content=str(row[4]),
                metadata=dict(row[5] or {}),
                score=float(row[6]),
            )
            for row in rows
        ]

    def _connect(self) -> Any:
        import psycopg

        return psycopg.connect(self.database_url)


class EmbeddingsResource(Protocol):
    def create(self, *, model: str, input: list[str]) -> Any:
        ...


class EmbeddingClient(Protocol):
    embeddings: EmbeddingsResource


def split_reference_text(
    text: str,
    *,
    metadata: dict[str, Any] | None = None,
    target_chars: int = DEFAULT_TARGET_CHARS,
    max_chars: int = DEFAULT_MAX_CHARS,
    overlap_chars: int = DEFAULT_OVERLAP_CHARS,
) -> list[ReferenceChunk]:
    clean_text = _normalize_text(text)
    if not clean_text:
        return []

    if not 0 <= overlap_chars < max_chars:
        raise ValueError("overlap_chars must be between 0 and max_chars.")
    if target_chars <= 0 or max_chars <= 0:
        raise ValueError("target_chars and max_chars must be positive.")
    if target_chars > max_chars:
        raise ValueError("target_chars must be less than or equal to max_chars.")

    base_metadata = dict(metadata or {})
    paragraphs = [
        paragraph.strip()
        for paragraph in re.split(r"\n{2,}", clean_text)
        if paragraph.strip()
    ]
    raw_chunks: list[str] = []
    current_parts: list[str] = []

    def current_text() -> str:
        return "\n\n".join(current_parts).strip()

    def emit_current() -> None:
        content = current_text()
        if content:
            raw_chunks.append(content)
        current_parts.clear()
        if overlap_chars > 0 and content:
            overlap = content[-overlap_chars:].strip()
            if overlap:
                current_parts.append(overlap)

    for paragraph in paragraphs:
        if len(paragraph) > max_chars:
            if current_text():
                emit_current()
            raw_chunks.extend(
                _slice_long_text(
                    paragraph,
                    max_chars=max_chars,
                    overlap_chars=overlap_chars,
                )
            )
            current_parts.clear()
            if overlap_chars > 0 and raw_chunks:
                overlap = raw_chunks[-1][-overlap_chars:].strip()
                if overlap:
                    current_parts.append(overlap)
            continue

        candidate = "\n\n".join([*current_parts, paragraph]).strip()
        if current_parts and len(candidate) > target_chars:
            emit_current()
            candidate = "\n\n".join([*current_parts, paragraph]).strip()

        if len(candidate) > max_chars and current_parts:
            emit_current()

        current_parts.append(paragraph)

    if current_text():
        raw_chunks.append(current_text())

    return [
        ReferenceChunk(
            chunk_index=index,
            content=content,
            content_hash=hashlib.sha256(content.encode("utf-8")).hexdigest(),
            metadata={**base_metadata, "chunkIndex": index},
        )
        for index, content in enumerate(raw_chunks)
        if content
    ]


def create_embeddings(
    texts: list[str],
    *,
    client: EmbeddingClient | None = None,
    model: str = DEFAULT_EMBEDDING_MODEL,
    api_key: str | None = None,
) -> EmbeddingResult:
    inputs = [text.strip() for text in texts if text.strip()]
    if not inputs:
        return EmbeddingResult(status="skipped", message="No text to embed.", model=model)

    client_object: Any = client
    if client_object is None:
        if not api_key:
            return EmbeddingResult(
                status="unavailable",
                message="OPENAI_API_KEY is not configured.",
                model=model,
            )

        from openai import OpenAI

        client_object = OpenAI(api_key=api_key)

    try:
        response = client_object.embeddings.create(model=model, input=inputs)
    except Exception as error:
        return EmbeddingResult(status="failed", message=str(error), model=model)

    embeddings = [_coerce_embedding(item) for item in getattr(response, "data", [])]
    if len(embeddings) != len(inputs):
        return EmbeddingResult(
            status="failed",
            message="OpenAI returned an unexpected embedding count.",
            model=model,
        )

    for embedding in embeddings:
        if len(embedding) != EMBEDDING_DIMENSION:
            return EmbeddingResult(
                status="failed",
                message=f"OpenAI returned a {len(embedding)} dimension embedding.",
                model=model,
            )

    return EmbeddingResult(embeddings=embeddings, status="succeeded", model=model)


def index_reference_text(
    *,
    repository: ReferenceRepository | None,
    project_id: str,
    file_id: str,
    text: str,
    metadata: dict[str, Any] | None = None,
    embedding_client: EmbeddingClient | None = None,
    model: str = DEFAULT_EMBEDDING_MODEL,
    api_key: str | None = None,
) -> ReferenceIndexResult:
    if repository is None:
        return ReferenceIndexResult(
            status="unavailable",
            message="DATABASE_URL is not configured.",
        )

    chunks = split_reference_text(text, metadata={"fileId": file_id, **(metadata or {})})
    if not chunks:
        repository.replace_chunks(project_id, file_id, [])
        return ReferenceIndexResult(status="skipped", message="No text to index.")

    embedding_result = create_embeddings(
        [chunk.content for chunk in chunks],
        client=embedding_client,
        model=model,
        api_key=api_key,
    )
    if embedding_result.status != "succeeded":
        return ReferenceIndexResult(
            status=embedding_result.status,
            message=embedding_result.message,
        )

    repository.replace_chunks(
        project_id,
        file_id,
        [
            ReferenceChunkInput(
                project_id=project_id,
                file_id=file_id,
                chunk_index=chunk.chunk_index,
                content=chunk.content,
                content_hash=chunk.content_hash,
                metadata=chunk.metadata,
                embedding=embedding,
            )
            for chunk, embedding in zip(chunks, embedding_result.embeddings, strict=True)
        ],
    )
    return ReferenceIndexResult(status="indexed", chunk_count=len(chunks))


def search_reference_chunks(
    *,
    repository: ReferenceRepository | None,
    project_id: str,
    query: str,
    limit: int = 6,
    file_ids: list[str] | None = None,
    embedding_client: EmbeddingClient | None = None,
    model: str = DEFAULT_EMBEDDING_MODEL,
    api_key: str | None = None,
) -> tuple[list[ReferenceSearchResult], EmbeddingResult]:
    if repository is None:
        return [], EmbeddingResult(
            status="unavailable",
            message="DATABASE_URL is not configured.",
            model=model,
        )

    embedding_result = create_embeddings(
        [query],
        client=embedding_client,
        model=model,
        api_key=api_key,
    )
    if embedding_result.status != "succeeded":
        return [], embedding_result

    return (
        repository.search_chunks(
            project_id,
            embedding_result.embeddings[0],
            limit=limit,
            file_ids=file_ids,
        ),
        embedding_result,
    )


def _normalize_text(text: str) -> str:
    return "\n".join(line.rstrip() for line in text.replace("\r\n", "\n").split("\n")).strip()


def _slice_long_text(text: str, *, max_chars: int, overlap_chars: int) -> list[str]:
    chunks: list[str] = []
    step = max_chars - overlap_chars
    start = 0

    while start < len(text):
        chunk = text[start : start + max_chars].strip()
        if chunk:
            chunks.append(chunk)
        start += step

    return chunks


def _coerce_embedding(item: Any) -> list[float]:
    embedding = getattr(item, "embedding", [])
    return [float(value) for value in embedding]


def _json_dumps(value: dict[str, Any]) -> str:
    import json

    return json.dumps(value, ensure_ascii=True)


def _vector_literal(embedding: list[float]) -> str:
    return "[" + ",".join(str(value) for value in embedding) + "]"
