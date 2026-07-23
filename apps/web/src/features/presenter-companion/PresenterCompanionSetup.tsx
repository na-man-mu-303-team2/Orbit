import QRCode from "qrcode";
import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import type {
  PresentationCompanionPairingResponse,
  PresentationSessionPurpose,
} from "@orbit/shared";
import { createPresenterCompanionPairing } from "./presenterCompanionApi";
import "./presenter-companion.css";

export function PresenterCompanionSetup(props: {
  projectId: string;
  sessionId: string;
  sessionPurpose: PresentationSessionPurpose;
  title?: string;
}) {
  const [pairing, setPairing] =
    useState<PresentationCompanionPairingResponse | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [phase, setPhase] = useState<"idle" | "creating" | "ready" | "failed">(
    "idle",
  );
  const [error, setError] = useState("");

  useEffect(() => {
    if (!pairing) {
      setQrDataUrl(null);
      return;
    }
    let active = true;
    void QRCode.toDataURL(pairing.pairingUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 220,
    }).then(
      (value) => {
        if (active) setQrDataUrl(value);
      },
      () => {
        if (active) setQrDataUrl(null);
      },
    );
    return () => {
      active = false;
    };
  }, [pairing]);

  async function createPairing() {
    setPhase("creating");
    setError("");
    try {
      const next = await createPresenterCompanionPairing(props);
      setPairing(next);
      setPhase("ready");
    } catch (cause) {
      setPairing(null);
      setPhase("failed");
      setError(
        cause instanceof Error
          ? cause.message
          : "iPad 연결을 준비하지 못했습니다.",
      );
    }
  }

  return (
    <section
      aria-label="iPad 발표 도우미 연결"
      className="presenter-companion-setup"
    >
      <div className="presenter-companion-heading">
        <div>
          <strong>{props.title ?? "iPad 발표 도우미"}</strong>
          <span>{getPurposeLabel(props.sessionPurpose)}</span>
        </div>
        <button
          disabled={phase === "creating"}
          type="button"
          onClick={() => void createPairing()}
        >
          {pairing ? "새 연결 코드 만들기" : "iPad 연결"}
        </button>
      </div>

      {pairing ? (
        <div className="presenter-companion-pairing">
          {qrDataUrl ? (
            <img alt="iPad 연결 QR 코드" src={qrDataUrl} />
          ) : (
            <div role="status">QR 코드를 만드는 중입니다.</div>
          )}
          <div>
            <p>iPad 카메라로 QR 코드를 스캔하세요.</p>
            <small>
              연결 코드는 {formatPairingExpiry(pairing.expiresAt)}까지 한 번만
              사용할 수 있습니다.
            </small>
          </div>
        </div>
      ) : null}

      <PrivateDeviceCheckPad />
      {error ? <p role="alert">{error}</p> : null}
    </section>
  );
}

export function PrivateDeviceCheckPad() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const activePointerRef = useRef<number | null>(null);

  function draw(event: ReactPointerEvent<HTMLCanvasElement>) {
    if (activePointerRef.current !== event.pointerId) return;
    const canvas = event.currentTarget;
    const context = canvas.getContext("2d");
    if (!context) return;
    const bounds = canvas.getBoundingClientRect();
    context.fillStyle = "#5b4ae8";
    context.beginPath();
    context.arc(
      ((event.clientX - bounds.left) / Math.max(bounds.width, 1)) *
        canvas.width,
      ((event.clientY - bounds.top) / Math.max(bounds.height, 1)) *
        canvas.height,
      Math.max(2, event.pressure * 6),
      0,
      Math.PI * 2,
    );
    context.fill();
  }

  return (
    <div className="presenter-companion-device-check">
      <span>비공개 입력 테스트</span>
      <canvas
        aria-label="iPad 입력 테스트 패드"
        height={72}
        ref={canvasRef}
        width={320}
        onPointerDown={(event) => {
          activePointerRef.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          draw(event);
        }}
        onPointerMove={draw}
        onPointerUp={(event) => {
          if (activePointerRef.current === event.pointerId) {
            activePointerRef.current = null;
          }
        }}
      />
      <small>이 테스트 선은 발표 화면이나 청중 화면으로 전송되지 않습니다.</small>
    </div>
  );
}

export function getPurposeLabel(purpose: PresentationSessionPurpose) {
  return purpose === "presentation" ? "실전 발표" : "리허설";
}

function formatPairingExpiry(expiresAt: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(expiresAt));
}
