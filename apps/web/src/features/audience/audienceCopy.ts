export const audienceCopy = {
  "join.code.label": "입장 코드",
  "join.code.placeholder": "6자리 숫자",
  "join.nickname.label": "닉네임",
  "join.submit": "입장하기",
  "join.error.notFound": "입장 코드를 확인해 주세요.",
  "join.error.duplicateNickname": "이미 사용 중인 닉네임입니다.",
  "join.error.closed": "현재 새 입장이 닫혀 있습니다.",
  "join.error.rateLimited": "입장 시도가 많습니다. 잠시 후 다시 시도해 주세요.",
  "waiting.title": "발표가 곧 시작됩니다.",
  "waiting.body": "발표자가 세션을 시작하면 자동으로 화면이 전환됩니다.",
  "connection.reconnecting": "연결을 다시 시도하고 있습니다.",
  "qna.input.placeholder": "궁금한 점을 입력해 주세요.",
  "qna.submit": "질문 보내기",
  "qna.error.rateLimited": "질문은 1분에 3개까지 보낼 수 있습니다.",
  "ai.answer.pending": "AI가 답변을 찾고 있습니다.",
  "ai.answer.escalated": "발표자에게 질문을 전달했습니다.",
  "ai.answer.unresolvedCta": "발표자에게 답변 요청",
  "reaction.rateLimited": "반응을 잠시 후 다시 보내 주세요.",
  "survey.submit": "설문 제출",
  "survey.submitted": "설문이 제출되었습니다.",
  "survey.windowExpired": "설문 응답 시간이 종료되었습니다.",
  "survey.contact.sensitiveWarning":
    "민감정보 또는 고유식별정보는 입력하지 마세요.",
} as const;

export type AudienceCopyKey = keyof typeof audienceCopy;
