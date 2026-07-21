export type PresentationFailureOperation = "finish" | "load" | "start";

export type PresentationFailureCopy = {
  description: string;
  recommendedAction: string;
  title: string;
};

function includesAny(message: string, fragments: string[]) {
  return fragments.some((fragment) => message.includes(fragment));
}

export function getPresentationFailureCopy(
  operation: PresentationFailureOperation,
  rawMessage?: string,
): PresentationFailureCopy {
  const normalizedMessage = (rawMessage ?? "").toLowerCase();

  if (operation === "load") {
    return {
      description: "슬라이드와 발표 메모를 가져오지 못했습니다.",
      recommendedAction:
        "인터넷 연결을 확인한 뒤 다시 불러오세요. 계속 실패하면 프로젝트로 돌아가 최신 저장 상태를 확인하세요.",
      title: "발표 화면을 열지 못했습니다.",
    };
  }

  if (operation === "finish") {
    return {
      description: "발표 결과를 저장하는 중 문제가 발생했습니다.",
      recommendedAction:
        "발표 화면을 닫지 말고 인터넷 연결을 확인한 뒤 다시 시도하세요. 이미 수집된 청중 응답은 유지됩니다.",
      title: "실전 발표를 마치지 못했습니다.",
    };
  }

  if (
    includesAny(normalizedMessage, [
      "notallowederror",
      "permission denied",
      "마이크 권한",
    ])
  ) {
    return {
      description: "브라우저에서 마이크 사용이 허용되지 않았습니다.",
      recommendedAction:
        "주소창의 마이크 권한을 허용한 뒤 다시 시작하세요. 녹음이 필요하지 않다면 마이크 없이 시작할 수 있습니다.",
      title: "마이크를 연결하지 못했습니다.",
    };
  }

  if (
    includesAny(normalizedMessage, [
      "invalid request body",
      "validation failed",
      "invalid_type",
    ])
  ) {
    return {
      description:
        "발표 준비 정보가 최신 저장 상태와 맞지 않아 시작 요청을 완료하지 못했습니다.",
      recommendedAction:
        "프로젝트로 돌아가 슬라이드가 저장되었는지 확인한 뒤 다시 시작하세요. 급한 경우 마이크 없이 시작할 수 있습니다.",
      title: "실전 발표를 시작하지 못했습니다.",
    };
  }

  if (
    includesAny(normalizedMessage, [
      "failed to fetch",
      "load failed",
      "network",
      "서버에 연결",
    ])
  ) {
    return {
      description: "발표 서버에 연결하지 못했습니다.",
      recommendedAction:
        "인터넷 연결을 확인한 뒤 다시 시도하세요. 연결이 불안정하면 잠시 후 다시 시작하세요.",
      title: "실전 발표를 시작하지 못했습니다.",
    };
  }

  return {
    description: "실전 발표를 준비하는 중 문제가 발생했습니다.",
    recommendedAction:
      "잠시 후 다시 시도하세요. 계속 실패하면 프로젝트로 돌아가 슬라이드의 저장 상태를 확인하세요.",
    title: "실전 발표를 시작하지 못했습니다.",
  };
}
