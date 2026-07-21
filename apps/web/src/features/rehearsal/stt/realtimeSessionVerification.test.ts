import { describe, expect, it } from "vitest";
import {
  mergeRealtimeTranscriptionConfiguration,
  readRealtimeTranscriptionConfiguration,
  verifyRealtimeTranscriptionConfiguration
} from "./realtimeSessionVerification";

describe("realtimeSessionVerification", () => {
  it("event가 model/delay를 보고하면 발급 설정과 함께 검증한다", () => {
    expect(
      verifyRealtimeTranscriptionConfiguration({
        issuedModel: "gpt-realtime-whisper",
        issuedDelay: "xhigh",
        reported: { model: "gpt-realtime-whisper", delay: "xhigh" },
        expectedModel: "gpt-realtime-whisper",
        expectedDelay: "xhigh"
      })
    ).toEqual({ ok: true, delaySource: "event" });
  });

  it("session.updated가 delay를 생략하면 발급 응답을 권위값으로 사용한다", () => {
    expect(
      verifyRealtimeTranscriptionConfiguration({
        issuedModel: "gpt-realtime-whisper",
        issuedDelay: "xhigh",
        reported: { model: "gpt-realtime-whisper", delay: null },
        expectedModel: "gpt-realtime-whisper",
        expectedDelay: "xhigh"
      })
    ).toEqual({ ok: true, delaySource: "issued" });
  });

  it("발급 또는 event 설정 mismatch를 거부한다", () => {
    expect(
      verifyRealtimeTranscriptionConfiguration({
        issuedModel: "gpt-realtime-whisper",
        issuedDelay: "high",
        reported: { model: "gpt-realtime-whisper", delay: null },
        expectedModel: "gpt-realtime-whisper",
        expectedDelay: "xhigh"
      })
    ).toEqual({ ok: false, reason: "issued-delay-mismatch" });
    expect(
      verifyRealtimeTranscriptionConfiguration({
        issuedModel: "gpt-realtime-whisper",
        issuedDelay: "xhigh",
        reported: { model: "other", delay: "xhigh" },
        expectedModel: "gpt-realtime-whisper",
        expectedDelay: "xhigh"
      })
    ).toEqual({ ok: false, reason: "reported-model-mismatch" });
  });

  it("session.created 값을 유지하고 중첩 transcription 설정을 읽는다", () => {
    const reported = readRealtimeTranscriptionConfiguration({
      session: {
        audio: {
          input: {
            transcription: { model: "gpt-realtime-whisper" }
          }
        }
      }
    });
    expect(
      mergeRealtimeTranscriptionConfiguration(
        { model: null, delay: "xhigh" },
        reported
      )
    ).toEqual({ model: "gpt-realtime-whisper", delay: "xhigh" });
  });
});
