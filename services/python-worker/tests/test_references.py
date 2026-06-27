from __future__ import annotations

from app.references import (
    EMBEDDING_DIMENSION,
    ReferenceChunkInput,
    ReferenceSearchResult,
    create_embeddings,
    index_reference_text,
    search_reference_chunks,
    split_reference_text,
)


class FakeRepository:
    def __init__(self) -> None:
        self.chunks: list[ReferenceChunkInput] = []
        self.search_project_id = ""
        self.search_embedding: list[float] = []
        self.project_id = ""
        self.file_id = ""

    def replace_chunks(
        self,
        project_id: str,
        file_id: str,
        chunks: list[ReferenceChunkInput],
    ) -> None:
        self.chunks = list(chunks)
        self.project_id = project_id
        self.file_id = file_id

    def search_chunks(
        self,
        project_id: str,
        query_embedding: list[float],
        *,
        limit: int = 6,
    ) -> list[ReferenceSearchResult]:
        self.search_project_id = project_id
        self.search_embedding = query_embedding
        return [
            ReferenceSearchResult(
                chunk_id="chunk-1",
                project_id=project_id,
                file_id="file-1",
                chunk_index=0,
                content="grounded evidence",
                metadata={"fileName": "source.pdf"},
                score=0.91,
            )
        ][:limit]


class FakeEmbeddingClient:
    class Embeddings:
        def __init__(self, parent: "FakeEmbeddingClient") -> None:
            self.parent = parent

        def create(self, *, model: str, input: list[str]) -> object:
            self.parent.requests.append((model, input))
            data = [
                type("Embedding", (), {"embedding": [0.01] * EMBEDDING_DIMENSION})()
                for _ in input
            ]
            return type("EmbeddingResponse", (), {"data": data})()

    def __init__(self) -> None:
        self.requests: list[tuple[str, list[str]]] = []
        self.embeddings = self.Embeddings(self)


class FailingEmbeddingClient:
    class Embeddings:
        def create(self, *, model: str, input: list[str]) -> object:
            raise RuntimeError("embedding failed")

    embeddings = Embeddings()


def test_split_reference_text_uses_metadata_and_hashes() -> None:
    text = "\n\n".join(f"paragraph {index} " + ("x" * 120) for index in range(20))

    chunks = split_reference_text(text, metadata={"fileId": "file-1"})

    assert len(chunks) > 1
    assert all(len(chunk.content) <= 1500 for chunk in chunks)
    assert chunks[0].metadata["fileId"] == "file-1"
    assert chunks[0].metadata["chunkIndex"] == 0
    assert chunks[0].content_hash


def test_index_reference_text_replaces_project_file_chunks() -> None:
    repository = FakeRepository()

    result = index_reference_text(
        repository=repository,
        project_id="project-a",
        file_id="file-1",
        text="cleaned text\n\n" * 80,
        embedding_client=FakeEmbeddingClient(),
    )

    assert result.status == "indexed"
    assert repository.project_id == "project-a"
    assert repository.file_id == "file-1"
    assert repository.chunks
    assert repository.chunks[0].project_id == "project-a"
    assert repository.chunks[0].file_id == "file-1"


def test_index_reference_text_marks_embedding_failure() -> None:
    repository = FakeRepository()

    result = index_reference_text(
        repository=repository,
        project_id="project-a",
        file_id="file-1",
        text="cleaned text",
        embedding_client=FailingEmbeddingClient(),
    )

    assert result.status == "failed"
    assert repository.chunks == []
    assert "embedding failed" in result.message


def test_search_reference_chunks_applies_project_boundary() -> None:
    repository = FakeRepository()

    results, embedding_result = search_reference_chunks(
        repository=repository,
        project_id="project-a",
        query="deck topic",
        embedding_client=FakeEmbeddingClient(),
    )

    assert embedding_result.status == "succeeded"
    assert repository.search_project_id == "project-a"
    assert repository.search_embedding == [0.01] * EMBEDDING_DIMENSION
    assert results[0].project_id == "project-a"
    assert results[0].content == "grounded evidence"


def test_create_embeddings_reports_missing_api_key() -> None:
    result = create_embeddings(["hello"], api_key=None)

    assert result.status == "unavailable"
    assert result.embeddings == []
