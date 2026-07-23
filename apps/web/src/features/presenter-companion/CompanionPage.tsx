import { useEffect, useRef, useState } from "react";
import type { PresentationCompanionBootstrap } from "@orbit/shared";
import {
  exchangePresenterCompanionPairing,
  fetchPresenterCompanionBootstrap,
} from "./presenterCompanionApi";
import {
  getPurposeLabel,
  PrivateDeviceCheckPad,
} from "./PresenterCompanionSetup";
import "./presenter-companion.css";

export function CompanionPairingPage(props: { code: string }) {
  const [bootstrap, setBootstrap] =
    useState<PresentationCompanionBootstrap | null>(null);
  const [error, setError] = useState("");
  const exchangeRequestRef =
    useRef<Promise<PresentationCompanionBootstrap> | null>(null);

  useEffect(() => {
    if (!exchangeRequestRef.current) {
      const code = props.code;
      window.history.replaceState(null, "", "/companion/connecting");
      exchangeRequestRef.current = exchangePresenterCompanionPairing(code).then(
        (exchange) => {
          window.history.replaceState(
            null,
            "",
            `/companion/${encodeURIComponent(exchange.sessionId)}`,
          );
          return fetchPresenterCompanionBootstrap(exchange.sessionId);
        },
      );
    }
    let active = true;
    void exchangeRequestRef.current
      .then((value) => {
        if (active) setBootstrap(value);
      })
      .catch(() => {
        if (active) {
          setError("연결 코드가 만료되었거나 이미 사용되었습니다.");
        }
      });
    return () => {
      active = false;
    };
  }, [props.code]);

  return <CompanionShell bootstrap={bootstrap} error={error} />;
}

export function CompanionPage(props: { sessionId: string }) {
  const [bootstrap, setBootstrap] =
    useState<PresentationCompanionBootstrap | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetchPresenterCompanionBootstrap(props.sessionId)
      .then((value) => {
        if (active) setBootstrap(value);
      })
      .catch(() => {
        if (active) setError("iPad 발표 도우미 연결을 확인할 수 없습니다.");
      });
    return () => {
      active = false;
    };
  }, [props.sessionId]);

  return <CompanionShell bootstrap={bootstrap} error={error} />;
}

export function CompanionShell(props: {
  bootstrap: PresentationCompanionBootstrap | null;
  error?: string;
}) {
  if (props.error) {
    return (
      <main className="presenter-companion-page">
        <section role="alert">
          <h1>iPad 연결을 확인해주세요</h1>
          <p>{props.error}</p>
        </section>
      </main>
    );
  }
  if (!props.bootstrap) {
    return (
      <main className="presenter-companion-page">
        <section role="status">
          <h1>iPad 발표 도우미 연결 중</h1>
          <p>안전한 발표 화면을 준비하고 있습니다.</p>
        </section>
      </main>
    );
  }
  return (
    <main className="presenter-companion-page">
      <header>
        <span>{getPurposeLabel(props.bootstrap.sessionPurpose)}</span>
        <strong>iPad 발표 도우미</strong>
      </header>
      <section aria-label="iPad 발표 도우미">
        <h1>발표 자료</h1>
        <p>발표자 화면 연결을 기다리고 있습니다.</p>
        <small>슬라이드 {props.bootstrap.deck.slides.length}장</small>
        <PrivateDeviceCheckPad />
      </section>
    </main>
  );
}
