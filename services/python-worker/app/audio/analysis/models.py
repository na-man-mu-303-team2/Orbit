from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Literal

import numpy as np
from numpy.typing import NDArray
from pydantic import BaseModel, ConfigDict, Field, model_validator

VolumeAnalysisReasonCode = Literal[
    "AUDIO_DECODE_FAILED",
    "NO_AUDIO_STREAM",
    "EMPTY_AUDIO",
    "INSUFFICIENT_ACTIVE_AUDIO",
    "ANALYSIS_FAILED",
    "LEGACY_REPORT",
]


class AudioAnalysisError(RuntimeError):
    def __init__(self, reason_code: VolumeAnalysisReasonCode) -> None:
        super().__init__(reason_code)
        self.reason_code = reason_code


@dataclass(frozen=True)
class DecodedAudio:
    samples: NDArray[np.float32]
    sample_rate_hz: int
    duration_seconds: float


class VolumeIssueSegment(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    kind: Literal["quiet", "loud"]
    start_seconds: float = Field(alias="startSeconds", ge=0)
    end_seconds: float = Field(alias="endSeconds", ge=0)
    duration_seconds: float = Field(alias="durationSeconds", gt=0)
    mean_deviation_db: float = Field(alias="meanDeviationDb")

    @model_validator(mode="after")
    def validate_time_range(self) -> VolumeIssueSegment:
        expected_duration = self.end_seconds - self.start_seconds
        if expected_duration <= 0 or not math.isclose(
            self.duration_seconds,
            expected_duration,
            abs_tol=0.002,
        ):
            raise ValueError("volume issue duration must match its time range")
        return self


class RehearsalVolumeAnalysis(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    metric_definition_version: Literal[1] = Field(alias="metricDefinitionVersion")
    measurement_state: Literal["measured", "unmeasured"] = Field(
        alias="measurementState"
    )
    reason_code: VolumeAnalysisReasonCode | None = Field(alias="reasonCode")
    average_dbfs: float | None = Field(alias="averageDbfs")
    baseline_dbfs: float | None = Field(alias="baselineDbfs")
    variation_db: float | None = Field(alias="variationDb", ge=0)
    active_ratio: float | None = Field(alias="activeRatio", ge=0, le=1)
    issue_segments: list[VolumeIssueSegment] = Field(alias="issueSegments")

    @model_validator(mode="after")
    def validate_measurement_state(self) -> RehearsalVolumeAnalysis:
        metric_values = (
            self.average_dbfs,
            self.baseline_dbfs,
            self.variation_db,
            self.active_ratio,
        )
        if self.measurement_state == "measured":
            if self.reason_code is not None or any(
                value is None for value in metric_values
            ):
                raise ValueError("measured volume analysis requires all metric values")
        elif self.reason_code is None or any(
            value is not None for value in metric_values
        ):
            raise ValueError("unmeasured volume analysis requires a reason only")
        elif self.issue_segments:
            raise ValueError("unmeasured volume analysis cannot include issue segments")

        return self


def unmeasured_volume_analysis(
    reason_code: VolumeAnalysisReasonCode,
) -> RehearsalVolumeAnalysis:
    return RehearsalVolumeAnalysis(
        metricDefinitionVersion=1,
        measurementState="unmeasured",
        reasonCode=reason_code,
        averageDbfs=None,
        baselineDbfs=None,
        variationDb=None,
        activeRatio=None,
        issueSegments=[],
    )
