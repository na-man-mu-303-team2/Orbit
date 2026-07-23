from __future__ import annotations

from typing import Literal

MotionPlannerErrorCode = Literal[
    "MOTION_AI_PROVIDER_UNAVAILABLE",
    "MOTION_AI_EMPTY_RESPONSE",
    "MOTION_AI_INVALID_PLAN",
    "MOTION_AI_COMPILE_UNSAFE",
]

MOTION_PLANNER_ERROR_MESSAGES: dict[MotionPlannerErrorCode, str] = {
    "MOTION_AI_PROVIDER_UNAVAILABLE": "AI 모션 분석 서비스에 연결할 수 없습니다.",
    "MOTION_AI_EMPTY_RESPONSE": "AI 모션 분석 결과가 비어 있습니다.",
    "MOTION_AI_INVALID_PLAN": "AI 모션 분석 결과가 올바르지 않습니다.",
    "MOTION_AI_COMPILE_UNSAFE": "AI 모션 분석 결과를 안전하게 적용할 수 없습니다.",
}


class MotionPlannerError(RuntimeError):
    def __init__(
        self,
        code: MotionPlannerErrorCode,
        *,
        retryable: bool = True,
    ) -> None:
        super().__init__(MOTION_PLANNER_ERROR_MESSAGES[code])
        self.code = code
        self.retryable = retryable

    @property
    def status_code(self) -> int:
        return 422 if self.code == "MOTION_AI_COMPILE_UNSAFE" else 503
