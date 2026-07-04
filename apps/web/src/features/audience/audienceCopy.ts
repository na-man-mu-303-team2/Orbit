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
} as const;

export type AudienceCopyKey = keyof typeof audienceCopy;
