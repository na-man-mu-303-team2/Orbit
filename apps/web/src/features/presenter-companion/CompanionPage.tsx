import { useEffect, useRef, useState } from "react";
import type { PresentationCompanionBootstrap } from "@orbit/shared";
import {
  exchangePresenterCompanionPairing,
  fetchPresenterCompanionBootstrap,
} from "./presenterCompanionApi";
import {
  getPurposeLabel,
} from "./PresenterCompanionSetup";
import { CompanionAudienceRenderer } from "./CompanionAudienceRenderer";
import { useCompanionSocket } from "./useCompanionSocket";
import { CompanionAnnotationCanvas } from "./CompanionAnnotationCanvas";
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
  return <ConnectedCompanionShell bootstrap={props.bootstrap} />;
}

function ConnectedCompanionShell(props: {
  bootstrap: PresentationCompanionBootstrap;
}) {
  const companion = useCompanionSocket(props.bootstrap.sessionId);

  return (
    <main className="presenter-companion-page">
      <header>
        <span>{getPurposeLabel(props.bootstrap.sessionPurpose)}</span>
        <strong>iPad 발표 도우미</strong>
        <span role="status">
          {companion.annotationRecovering
            ? "다시 동기화 중"
            : companion.status === "connected"
              ? "연결됨"
              : "연결 확인 중"}
        </span>
      </header>
      {companion.error ? (
        <section role="alert">
          <h1>iPad 연결을 확인해주세요</h1>
          <p>{companion.error}</p>
        </section>
      ) : (
        <div className="presenter-companion-stage">
          <CompanionAudienceRenderer
            deck={props.bootstrap.deck}
            output={companion.output}
          />
          {companion.output ? (
            <CompanionAnnotationCanvas
              annotation={companion.annotation}
              canWrite={props.bootstrap.scopes.includes(
                "write-annotation",
              )}
              connected={
                companion.status === "connected" &&
                Boolean(companion.authorityEpochId) &&
                !companion.annotationRecovering
              }
              lastAcknowledgement={companion.lastAnnotationAck}
              output={companion.output}
              sendCommand={companion.sendAnnotationCommand}
              sendLaser={companion.sendLaser}
            />
          ) : null}
        </div>
      )}
    </main>
  );
}
