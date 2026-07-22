from __future__ import annotations

import importlib.util
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest


def load_score_module() -> ModuleType:
    path = (
        Path(__file__).resolve().parents[3]
        / "tools"
        / "pptx-accuracy"
        / "score_pptx_konva_accuracy.py"
    )
    spec = importlib.util.spec_from_file_location("score_pptx_konva_accuracy", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("score module could not be loaded")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def score(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    *,
    similarity: float,
    preference: str | None,
    mode: str | None,
) -> dict[str, Any]:
    module = load_score_module()
    monkeypatch.setattr(module, "ROOT", tmp_path)
    monkeypatch.setattr(module, "image_ssim", lambda _golden, _candidate: similarity)
    (tmp_path / "golden.png").write_bytes(b"golden")
    (tmp_path / "candidate.png").write_bytes(b"candidate")
    return module.score_row(
        {
            "name": "bounded-sample",
            "goldenPath": "golden.png",
            "candidatePath": "candidate.png",
            "fallbackObjects": 1 if mode == "hybrid" else 0,
            "fullSlideFallbackUsed": mode == "snapshot",
            "unresolvedAssets": [],
            "warnings": [],
            "modeReasons": [],
            "elementCounts": {"text": 1},
            "importPreference": preference,
            "expectedRenderMode": mode,
        },
        0.95,
        0.80,
    )


def test_editability_pixel_failure_requires_an_explicit_snapshot_recommendation(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = score(
        tmp_path,
        monkeypatch,
        similarity=0.89,
        preference="editability-first",
        mode="editable",
    )

    assert result["pixelPassed"] is False
    assert result["gatePassed"] is True
    assert result["status"] == "fallback_required"
    assert result["selectedRenderMode"] == "editable"
    assert result["recommendedRenderMode"] == "snapshot"
    assert "PPTX_ACCURACY_SNAPSHOT_RECOMMENDED_PIXEL_BELOW_THRESHOLD" in result[
        "reasons"
    ]


def test_hybrid_pixel_failure_remains_explicit_without_hiding_the_measurement(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = score(
        tmp_path,
        monkeypatch,
        similarity=0.85,
        preference="editability-first",
        mode="hybrid",
    )

    assert result["pixelPassed"] is False
    assert result["gatePassed"] is True
    assert result["status"] == "fallback_required"
    assert result["recommendedRenderMode"] == "hybrid"
    assert "PPTX_ACCURACY_HYBRID_REQUIRED_PIXEL_BELOW_THRESHOLD" in result[
        "reasons"
    ]


def test_fallback_floor_still_fails_a_large_editability_regression(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = score(
        tmp_path,
        monkeypatch,
        similarity=0.79,
        preference="editability-first",
        mode="editable",
    )

    assert result["pixelPassed"] is False
    assert result["gatePassed"] is False
    assert result["status"] == "vectorization_failed"
    assert result["recommendedRenderMode"] == "snapshot"
    assert "SSIM 0.7900 is below fallback floor 0.80" in result["reasons"]


def test_appearance_snapshot_keeps_the_strict_source_identity_gate(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = score(
        tmp_path,
        monkeypatch,
        similarity=0.98,
        preference="appearance-first",
        mode="snapshot",
    )

    assert result["pixelPassed"] is False
    assert result["gatePassed"] is False
    assert result["requiredSsim"] == 0.99


def test_non_preference_samples_do_not_receive_a_fallback_exception(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    result = score(
        tmp_path,
        monkeypatch,
        similarity=0.94,
        preference=None,
        mode=None,
    )

    assert result["gatePassed"] is False
    assert result["status"] == "vectorization_failed"
