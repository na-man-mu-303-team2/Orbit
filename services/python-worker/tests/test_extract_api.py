from pathlib import Path

from fastapi.testclient import TestClient

import app.main as api_module
from app.config import load_config
from app.extraction import (
    ExtractedSection,
    ExtractionResult,
    FileKind,
    KeywordExtractionResult,
    PresentationKeyword,
    ResultStatus,
)
from tests.test_config import VALID_ENV


def test_documents_parse_returns_extraction_payload(monkeypatch) -> None:
    def fake_extract_file(source_path: Path, config: object) -> ExtractionResult:
        return ExtractionResult(
            source_path=source_path,
            kind=FileKind.IMAGE,
            status=ResultStatus.SUCCEEDED,
            sections=[
                ExtractedSection(title="Image OCR", text="first block", status="ocr"),
                ExtractedSection(title="Details", text="second block", status="ocr"),
            ],
            message="Image OCR completed.",
        )

    def fake_clean_reference_text(
        raw_text: str,
        *,
        model: str | None = None,
        api_key: str | None = None,
    ) -> object:
        return type(
            "Cleanup",
            (),
            {
                "text": f"cleaned: {raw_text}",
                "status": "succeeded",
                "message": "",
            },
        )()

    def fake_extract_presentation_keywords(
        cleaned_text: str,
        *,
        model: str | None = None,
        api_key: str | None = None,
    ) -> KeywordExtractionResult:
        return KeywordExtractionResult(
            keywords=[
                PresentationKeyword(
                    keyword="실시간 발표 피드백",
                    reason="발표 흐름 개선의 핵심 기능",
                    priority="high",
                )
            ],
            status="succeeded",
        )

    monkeypatch.setattr(api_module, "extract_file", fake_extract_file)
    monkeypatch.setattr(api_module, "clean_reference_text", fake_clean_reference_text)
    monkeypatch.setattr(
        api_module,
        "extract_presentation_keywords",
        fake_extract_presentation_keywords,
    )
    api_module.app.state.config = load_config(VALID_ENV)

    client = TestClient(api_module.app)
    response = client.post(
        "/documents/parse",
        data={"project_id": "project-a", "file_ids": "file-1"},
        files=[("files", ("sample.png", b"fake image bytes", "image/png"))],
    )

    assert response.status_code == 200
    assert response.json()["files"][0] == {
        "projectId": "project-a",
        "referenceDocumentId": "file-1",
        "fileName": "sample.png",
        "kind": "image",
        "status": "succeeded",
        "message": "Image OCR completed.",
        "rawText": "first block\n\nsecond block",
        "cleanedText": "cleaned: first block\n\nsecond block",
        "cleanupStatus": "succeeded",
        "cleanupMessage": "",
        "keywords": [
            {
                "keyword": "실시간 발표 피드백",
                "reason": "발표 흐름 개선의 핵심 기능",
                "priority": "high",
            }
        ],
        "keywordStatus": "succeeded",
        "keywordMessage": "",
        "indexingStatus": "skipped",
        "indexingMessage": "Reference indexing is handled by the RAG search branch.",
        "chunkCount": 0,
        "sections": [
            {
                "title": "Image OCR",
                "status": "ocr",
                "index": None,
                "text": "first block",
                "notes": [],
                "metadata": {},
            },
            {
                "title": "Details",
                "status": "ocr",
                "index": None,
                "text": "second block",
                "notes": [],
                "metadata": {},
            },
        ],
    }
