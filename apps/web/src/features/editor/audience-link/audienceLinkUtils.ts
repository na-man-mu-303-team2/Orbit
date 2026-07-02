import QRCode from "qrcode";

export function resolveAbsoluteAudienceUrl(audienceUrl: string) {
  if (typeof window === "undefined") {
    return audienceUrl;
  }

  return new URL(audienceUrl, window.location.origin).toString();
}

export async function createQrDataUrl(value: string) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel: "M",
    margin: 1,
    width: 220
  });
}

export function formatAudienceExpiresAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour12: false
  }).format(date);
}

export function formatAudienceTimeRemaining(value: string, nowMs = Date.now()) {
  const expiresAt = new Date(value).getTime();
  if (!Number.isFinite(expiresAt)) {
    return "만료 시간 확인 필요";
  }

  const remainingMs = expiresAt - nowMs;
  if (remainingMs <= 0) {
    return "만료됨";
  }

  const totalMinutes = Math.ceil(remainingMs / (1000 * 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours <= 0) {
    return `${minutes}분 남음`;
  }

  if (minutes === 0) {
    return `${hours}시간 남음`;
  }

  return `${hours}시간 ${minutes}분 남음`;
}

export function toAudienceLinkErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return "청중 링크 처리 중 오류가 발생했습니다.";
}
