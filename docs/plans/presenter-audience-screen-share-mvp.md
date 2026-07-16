# 발표자 웹·실습 공유 1차 MVP 실행 계획

**문서 유형:** Goal 실행용 Implementation Plan
**상태:** Implemented — 물리 확장 디스플레이 surface swap 수동 QA 대기
**작성일:** 2026-07-16
**대상:** Chrome 데스크톱, 같은 노트북의 확장 디스플레이
**관련 문서:** `docs/specs/presenter-screen.md`, `docs/specs/slide-window-auto-fullscreen.md`, `docs/plans/google-slides-presentation-display-implementation.md`, `docs/contracts.md`

**실행 결과:** Tasks 1~8 구현과 unit/integration/E2E, Chromium 및 시스템 Chrome 검증을 완료했다. actual Chrome direct bridge 양방향, native 탭·앱 창·전체 모니터 캡처, Chrome 공유 중지와 black cleanup을 통과했다. 물리 확장 디스플레이가 없어 실제 `surface swap` 배치만 `docs/qa/presenter-screen-share-mvp.md`의 수동 체크리스트로 남겼다.

## 0. Goal 모드 실행 계약

### Goal objective

> 발표자가 Chrome 탭·앱 창·고급 옵션의 전체 화면을 선택해 청중 출력에 보여주고, 공유 종료 또는 오류 시 최신 현재 슬라이드로 안전하게 복귀하며, 청중 화면 가리기까지 사용할 수 있는 로컬 우선 1차 MVP를 완성한다. 기존 `slide-window`와 외부 화면 자동 배치 `surface swap` 경로를 모두 지원하고 발표자 전용 정보는 청중 경계로 보내지 않는다.

### 완료 정의

아래 조건을 모두 만족해야 Goal을 완료로 판단한다.

- `slide-window` 경로에서 탭/창 공유, 전체 화면 공유 경고, 공유 종료, 검은 화면, 슬라이드 복귀가 동작한다.
- 자동 배치 `surface swap` 경로의 `PresenterRemoteWindow`에서도 같은 기능이 동작한다.
- 사용자가 Chrome의 공유 중지를 누르거나 공유 대상이 종료되면 1초 이내 청중 출력이 최신 슬라이드로 복귀한다.
- 청중 창을 다시 열거나 새로고침했을 때 활성 공유를 다시 연결하거나, 연결이 불가능하면 캡처를 정리하고 슬라이드로 복귀한다.
- 청중 DOM, `BroadcastChannel` 메시지, 로그에 `speakerNotes`, transcript, raw audio, presenter script가 노출되지 않는다.
- 오디오는 캡처하거나 청중 `<video>`에서 재생하지 않는다.
- 단위/통합 테스트, 기존 presenter E2E, 실제 Chrome 수동 검증을 통과한다.
- `current-window` 단독 발표, 원격 기기 전송, Document Picture-in-Picture는 1차 완료 조건에 포함하지 않는다.

### 실행 가드레일

- 기존 dirty worktree의 `.gitignore`, `docker-compose.yml`, `docs/runbooks/local-development.md`, `infra/scripts/docker-compose-worktree.sh` 변경을 수정하거나 되돌리지 않는다.
- API, DB, Worker, Python worker, `packages/shared` 계약을 변경하지 않는다. 이번 상태와 스트림은 브라우저 세션 안에서만 존재한다.
- `MediaStream`, 캡처 프레임, 캡처 대상 제목을 서버, storage, Job, WebSocket, 로그로 보내지 않는다.
- 새 구현은 `apps/web/src/features/rehearsal/presenter`와 필요한 `RehearsalWorkspace` 접점 안에 한정한다.
- 각 Task 완료 후 지정 검증을 실행하며, Checkpoint A의 실제 Chrome 브리지 검증이 실패하면 아래의 명시된 fallback으로 전환한다.

## 1. 사용자 문제와 제품 결과

발표자는 노트북에서 대본·코칭·타이머를 보는 동안 외부 모니터에는 슬라이드를 보여준다. 웹사이트 시연이나 실습이 시작되면 발표자는 해당 웹/앱을 직접 조작해야 하지만, 기존 청중 출력은 계속 슬라이드만 보여준다.

1차 MVP의 제품 결과는 “발표자 화면 전체 복제”가 아니라 **청중 출력 소스 전환**이다.

```text
슬라이드 발표
발표자: 대본·코칭·타이머       청중: 현재 슬라이드

웹·실습 공유
발표자: 선택한 탭/앱 조작      청중: 캡처 영상

공유 종료
발표자: Orbit 발표자 화면      청중: 최신 현재 슬라이드
```

사용자에게 노출할 기본 명칭은 `화면 공유`보다 목적이 분명한 **`웹·실습 보여주기`**로 한다. 고급 메뉴에만 `전체 화면 보여주기`를 둔다.

## 2. 현재 저장소 기준선

이미 구현되어 있어 재사용할 기반은 다음과 같다.

| 기반 | 현재 위치 | 재사용 방식 |
| --- | --- | --- |
| 발표자/청중 창 분리 | `RehearsalWorkspace.tsx`, `PresentWindow.tsx` | 기존 `/present/:deckId?sessionId=...` 수신 창 유지 |
| 세션별 상태 동기화 | `presentationChannel.ts`, `usePresentationChannelPublisher.ts` | 출력 모드와 종료 lifecycle만 확장 |
| 발표자 전용 정보 제거 | `createSlideWindowDeckSnapshot`, `createAudiencePresenterState` | 기존 privacy boundary 유지 및 회귀 테스트 확장 |
| 외부 화면 배치 | `displayManager.ts`, `DisplayControls.tsx` | 기존 `slide-window`와 `surface swap` 선택 결과 재사용 |
| 자동 배치 발표자 팝업 | `PresenterRemoteWindow.tsx` | 두 번째 캡처 소유 UI로 확장 |
| 슬라이드 수신 렌더링 | `PresentWindowReceiver`, `PresentWindowContent` | output mode에 따라 slide/video/black 렌더러 전환 |
| 연결 감지/복구 | ready/heartbeat 메시지와 stale 판정 | 공유 재부착 및 비정상 종료 정리에 연결 |
| 실제 브라우저 E2E | `tests/e2e/presenter-screen.spec.ts` | 두 창 동기화·privacy 테스트에 공유 시나리오 추가 |

이번 기능은 Deck, File, Job, 서버 WebSocket 계약을 바꾸지 않는다. `presentationChannel.ts`는 같은 origin 창 사이의 내부 `BroadcastChannel` 계약이며, `docs/contracts.md`의 서버 WebSocket envelope과 분리된 상태로 유지한다.

## 3. 확정 아키텍처 결정

| ID | 결정 | 이유 |
| --- | --- | --- |
| D1 | 1차 지원 출력은 `slide-window`와 자동 배치 `surface swap`이다. | 사용자가 확정한 범위다. |
| D2 | `current-window` 단독 발표는 1차에서 제외한다. | 청중 surface 자체에 공유 시작 UI를 두면 발표자 정보 경계와 UX가 흐려진다. |
| D3 | 출력 모드는 `slide`, `screen-share`, `black` 세 가지다. | 복귀와 가리기를 별도 상태로 명확히 표현한다. |
| D4 | 기본 `웹·실습 보여주기`는 Chrome 탭/앱 창을 우선하고 전체 모니터는 제외한다. | 발표자 메모, 알림, 다른 앱 노출 위험을 기본 경로에서 줄인다. |
| D5 | `전체 화면 보여주기`는 고급 동작이며 공유 picker 전에 경고와 명시적 확인을 요구한다. | 전체 화면은 의도한 시연 외 정보까지 포함할 수 있다. |
| D6 | 캡처는 `getDisplayMedia()`를 직접 클릭 handler에서 호출하고 매번 권한을 받는다. | API가 transient user activation과 매회 사용자 선택을 요구한다. |
| D7 | 오디오는 1차에서 항상 `false`다. | 원본 앱의 시스템 재생과 청중 `<video>` 재생이 겹치는 문제를 피한다. |
| D8 | `BroadcastChannel`에는 출력 모드와 lifecycle만 보내고 `MediaStream`은 넣지 않는다. | 상태 직렬화 경계를 유지하고 브라우저별 structured clone 의존을 피한다. |
| D9 | 스트림은 session identity를 검증하는 same-origin `WindowProxy` 브리지로 청중 surface에 연결한다. | 같은 기기·같은 origin에 한정된 가장 작은 구현이다. |
| D10 | `slide-window`에서는 현재 `RehearsalWorkspace`가, `surface swap`에서는 `PresenterRemoteWindow`가 캡처를 소유한다. | `getDisplayMedia()`는 사용자가 클릭한 활성 창에서 호출해야 한다. |
| D11 | direct bridge가 현재 COOP/COEP 환경의 실제 Chrome에서 실패하면, 같은 기기 안의 두 `RTCPeerConnection`과 기존 채널 signaling으로 교체한다. | 서버나 원격 signaling을 도입하지 않는 bounded fallback이다. |
| D12 | 공유 중에도 타이머, STT, 내부 슬라이드 상태는 계속 진행한다. 복귀 시 공유 시작 시점이 아니라 **최신 현재 슬라이드/step**을 보여준다. | 출력 전환이 발표 진행 상태를 별도로 롤백하지 않게 한다. |
| D13 | 공유 시작 후 캡처된 탭/창으로 포커스를 옮기되 Conditional Focus 미지원 시 브라우저 기본 동작을 사용한다. | 시연 대상을 바로 조작하려는 사용자 목적에 맞춘다. |
| D14 | 플로팅 리모컨과 전역 단축키는 2차다. 1차는 Orbit의 `슬라이드로 돌아가기`와 Chrome 기본 공유 중지 UI를 사용한다. | Document Picture-in-Picture를 핵심 경로에 추가하지 않고 MVP를 줄인다. |
| D15 | black 전환은 활성 캡처를 즉시 중지하고 작은 Orbit 로고 외에는 아무 콘텐츠도 표시하지 않는다. | 캡처 indicator와 개인정보 노출을 함께 종료한다. |
| D16 | 화면 공유 구간은 녹화·리포트·서버 이벤트에 저장하지 않는다. | 로컬 출력 전환만 구현하고 데이터 보존 범위를 늘리지 않는다. |

브라우저 근거:

- [`getDisplayMedia()` 보안 및 권한 요구](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getDisplayMedia)
- [Chrome screen sharing controls](https://developer.chrome.com/docs/web-platform/screen-sharing-controls)
- [Chrome Conditional Focus](https://developer.chrome.com/docs/web-platform/conditional-focus)
- [same-origin 창 접근과 `window.open`](https://developer.mozilla.org/en-US/docs/Web/API/Window/open)
- [Cross-Origin-Opener-Policy가 opener 관계에 미치는 영향](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Opener-Policy)

## 4. 상세 UX

### 4.1 공통 사전 조건

- `웹·실습 보여주기`와 `청중 화면 가리기`는 청중 surface가 연결된 뒤 활성화한다.
- `current-window` 단독 모드에서는 “1차 버전은 발표자 보기에서 지원합니다” 안내만 제공하고 캡처를 시작하지 않는다.
- 연결되지 않은 상태에서 버튼을 눌러도 Chrome 공유 picker를 열지 않는다.

### 4.2 `slide-window` 흐름

```text
[슬라이드 창 열기]
  → /present popup 연결
  → [웹·실습 보여주기] 활성
  → 발표자가 버튼 클릭
  → Chrome picker에서 탭 또는 앱 창 선택
  → popup의 청중 출력이 video로 전환
  → 선택한 탭/창으로 포커스
  → Chrome 공유 중지 또는 Orbit의 [슬라이드로 돌아가기]
  → 모든 track stop + popup의 최신 슬라이드 복원
```

### 4.3 자동 배치 `surface swap` 흐름

```text
[발표 모니터 자동 배치] + [발표자 보기]
  → 현재 창이 외부 화면의 slide-surface
  → PresenterRemoteWindow가 노트북 화면에 열림
  → remote의 [웹·실습 보여주기] 클릭
  → remote가 getDisplayMedia()로 캡처
  → window.opener의 session bridge에 stream 연결
  → remote가 audienceOutputMode=screen-share command 전송
  → 외부 화면이 video로 전환
  → 종료 시 command로 slide 복귀
```

### 4.4 컨트롤 상태

| 출력 상태 | 발표자 컨트롤 | 청중 출력 |
| --- | --- | --- |
| 연결 전 | 공유/가리기 disabled, `청중 화면을 먼저 열어주세요` | 없음 |
| `slide` | `웹·실습 보여주기`, `청중 화면 가리기` | 최신 슬라이드 |
| 캡처 선택 중 | 시작 버튼 disabled, `공유 대상을 선택하는 중` | 기존 슬라이드 유지 |
| `screen-share` | 빨간 상태점, `공유 중`, `슬라이드로 돌아가기` | muted `<video>` |
| `black` | `청중 화면 가림`, `슬라이드로 돌아가기` | 검은 배경 + 작은 Orbit 로고 |
| 오류 | 원인별 복구 문구, 다시 시도 | 슬라이드 유지 또는 복귀 |

### 4.5 전체 화면 경고

`전체 화면 보여주기`를 선택하면 Chrome picker 전에 다음 내용을 표시한다.

> 전체 화면에는 발표자 노트, 알림, 다른 앱과 개인 정보가 포함될 수 있습니다. 청중에게 공개해도 되는 화면인지 확인하세요. Orbit 발표자/청중 화면 자체를 선택하면 화면이 반복되어 보일 수 있습니다.

`위 위험을 확인했습니다`를 체크해야 계속할 수 있다. picker 결과가 `displaySurface === "monitor"`인데 기본 탭/창 경로에서 들어온 경우 track을 즉시 중지하고 고급 경고를 거쳐 다시 시작하게 한다.

## 5. 내부 설계

### 5.1 상태 모델

```ts
type AudienceOutputMode = "slide" | "screen-share" | "black";

type ScreenShareSourceIntent = "tab-or-window" | "monitor";

type ScreenShareStatus =
  | "idle"
  | "selecting"
  | "sharing"
  | "failed";

type PresenterSlideshowState = {
  // 기존 필드 유지
  audienceOutputMode: AudienceOutputMode;
};
```

`audienceOutputMode`를 `PresenterSlideshowState`에 넣어 기존 snapshot/state 복구 경로를 그대로 사용한다. `MediaStream`, track label, 캡처 대상 제목은 이 상태에 넣지 않는다.

상태 전이는 다음처럼 제한한다.

| 현재 | 이벤트 | 다음 | 필수 side effect |
| --- | --- | --- | --- |
| `slide` | capture 성공 + bridge attach 성공 | `screen-share` | ended listener 등록 |
| `slide` | black | `black` | 없음 |
| `screen-share` | stop/track ended/receiver timeout | `slide` | 모든 track stop, bridge detach |
| `screen-share` | black | `black` | 모든 track stop, bridge detach |
| `black` | return | `slide` | 최신 slide/step 즉시 렌더 |
| 임의 | 새 display 열기/역할 전환 | `slide` | 기존 capture 정리 후 창 전환 |

### 5.2 창 역할별 데이터 흐름

```text
일반 slide-window

RehearsalWorkspace (capture owner)
  ├─ getDisplayMedia()
  ├─ BroadcastChannel: audienceOutputMode
  └─ WindowProxy bridge: MediaStream
                         │
                         ▼
                  /present popup
                  slide | video | black


자동 배치 surface swap

PresenterRemoteWindow (capture owner)
  ├─ getDisplayMedia()
  ├─ owner channel: set-audience-output command
  └─ window.opener bridge: MediaStream
                         │
                         ▼
RehearsalWorkspace + PresentWindowReceiver (state owner/audience surface)
                  slide | video | black
```

### 5.3 채널 계약 확장

기존 내부 channel message를 다음처럼 확장한다.

```ts
type PresenterRemoteCommand =
  | ExistingPresenterRemoteCommand
  | {
      action: "set-audience-output";
      mode: AudienceOutputMode;
    };

type ScreenShareEndedMessage = {
  type: "screen-share-ended";
  deckId: string;
  sessionId: string;
  sentAt: number;
  reason: "track-ended" | "stream-missing" | "receiver-reset";
};
```

- presenter snapshot/state와 presenter remote snapshot/state가 `audienceOutputMode`를 포함한다.
- `isPresentationChannelMessage()`는 enum과 lifecycle reason을 런타임 검증한다.
- `screen-share-ended`는 수신 창의 lifecycle 신호일 뿐 상태 변경 권한을 갖지 않는다. owner가 검증 후 `slide`로 전환한다.
- 메시지에 `MediaStream`, `MediaStreamTrack`, track label, 캡처 frame을 포함하지 않는다.

### 5.4 same-origin stream bridge

청중 surface가 mount될 때 해당 window에 버전이 붙은 최소 bridge를 설치한다.

```ts
type AudienceStreamBridge = {
  attach(input: {
    identity: PresentationChannelIdentity;
    stream: MediaStream;
  }): { ok: true } | { ok: false; code: string };
  detach(input: { identity: PresentationChannelIdentity }): void;
};
```

필수 규칙:

- bridge key는 예: `__orbitAudienceStreamBridgeV1`처럼 충돌을 피한다.
- `deckId`와 `sessionId`가 현재 receiver identity와 모두 같을 때만 attach한다.
- 닫힘, 다른 origin/BCG, bridge 미준비, identity 불일치는 실패로 반환한다.
- bridge 접근 실패 시 capture track을 즉시 중지하고 `slide`를 유지한다.
- receiver unmount 시 자신이 설치한 bridge만 제거하고 video의 `srcObject`를 비운다.
- popup이 `slide-window-ready`를 다시 보냈을 때 capture owner는 살아 있는 stream을 한 번 재부착한다.
- 재부착이 실패하거나 5초 안에 stream이 도착하지 않으면 receiver가 `screen-share-ended`를 보내고 owner가 슬라이드로 복귀한다.

현재 `vite.config.ts`의 `Cross-Origin-Opener-Policy: same-origin`과 같은 origin popup 조합에서 direct bridge를 우선한다. Checkpoint A의 실제 Chrome 검증이 실패하면 bridge 구현만 local loopback WebRTC로 교체하고 상위 상태/UI 계약은 유지한다.

### 5.5 캡처 포트

브라우저 API를 직접 UI에 섞지 않고 테스트 가능한 port로 격리한다.

```ts
interface ScreenShareCapturePort {
  isSupported(): boolean;
  start(intent: ScreenShareSourceIntent): Promise<ScreenShareCapture>;
}

interface ScreenShareCapture {
  displaySurface?: "browser" | "window" | "monitor";
  focusCapturedSurface(): void;
  stream: MediaStream;
  stop(): void;
  subscribeEnded(listener: () => void): () => void;
}
```

기본 요청 정책:

```ts
{
  video: {
    displaySurface: intent === "monitor" ? "monitor" : "browser",
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 30, max: 30 }
  },
  audio: false,
  selfBrowserSurface: "exclude",
  surfaceSwitching: intent === "tab-or-window" ? "include" : "exclude",
  systemAudio: "exclude",
  monitorTypeSurfaces: intent === "tab-or-window" ? "exclude" : "include"
}
```

Chrome 확장 옵션의 TypeScript DOM 타입이 없는 경우 이 파일 안의 좁은 타입만 추가한다. 전역 `any`나 전역 DOM declaration 확대는 하지 않는다.

오류 매핑:

| 브라우저 결과 | 사용자 상태 | 출력 처리 |
| --- | --- | --- |
| API 없음 | `이 브라우저는 웹·실습 공유를 지원하지 않습니다` | slide 유지 |
| `NotAllowedError` | `공유가 취소되었거나 권한이 거부되었습니다` | slide 유지 |
| `InvalidStateError` | `버튼을 다시 눌러 공유를 시작해주세요` | slide 유지 |
| `NotReadableError` | `선택한 화면을 캡처할 수 없습니다` | slide 유지 |
| bridge 미준비/identity 불일치 | `청중 화면 연결을 확인한 뒤 다시 시도해주세요` | track stop + slide |
| track `ended` | 별도 오류 없이 종료 상태 | slide 복귀 |

### 5.6 청중 렌더러

`PresentWindowContent`는 `audienceOutputMode`에 따라 하나만 렌더한다.

```text
slide         -> 기존 SlideshowRenderer
screen-share  -> muted, autoPlay, playsInline video
black         -> black surface + small Orbit logo
```

`screen-share`인데 stream이 아직 없으면 슬라이드를 잠깐 다시 보여주지 않고 검은 배경의 `공유 화면을 연결하는 중입니다` 상태를 보여준다. 이는 재연결 중 출력이 흔들리는 것을 막는다.

`<video>` 규칙:

- `width/height: 100vw/100vh`
- `object-fit: contain`
- 배경 검정
- `muted`, `autoPlay`, `playsInline`
- `srcObject`는 effect에서 설정하고 cleanup에서 `null`로 되돌린다.
- `play()` 실패는 민감 정보 없이 UI 오류 상태로만 처리한다.

### 5.7 수명주기와 정리

다음 진입점은 모두 같은 idempotent `stopSharing({ returnToSlide })`를 호출한다.

- `슬라이드로 돌아가기`
- `청중 화면 가리기`
- Chrome 공유 중지로 인한 video track `ended`
- 청중 popup 닫힘/stale
- presenter remote 닫힘/unmount
- receiver stream timeout
- 새 슬라이드 창 열기 또는 display role 전환
- RehearsalWorkspace unmount/route 이탈

정리 순서는 `ended listener 해제 → 모든 track.stop() → bridge.detach → capture ref null → output mode 전환`으로 고정한다. 이미 ended된 track과 중복 호출을 허용해야 한다.

## 6. Task breakdown

### Task 1. 청중 출력 상태와 내부 채널 계약 확장

**설명:** `AudienceOutputMode`를 presenter state에 추가하고 snapshot/state/remote command/lifecycle 검증까지 먼저 고정한다. 이 단계에서는 실제 캡처를 시작하지 않는다.

**Acceptance criteria:**

- [x] 새 presenter state의 기본값은 `audienceOutputMode: "slide"`다.
- [x] 모든 audience/remote snapshot과 state update가 유효한 mode를 전달하고 잘못된 enum은 거부한다.
- [x] `set-audience-output` command와 `screen-share-ended` lifecycle message가 identity/runtime 검증을 통과한다.
- [x] 직렬화된 메시지에 stream, track, speaker notes, transcript, raw audio가 없다.

**Verification:**

- [x] `pnpm --filter @orbit/web test -- presenterStateStore presentationChannel`
- [x] `pnpm --filter @orbit/web typecheck`

**Dependencies:** 없음
**Files likely touched:**

- `apps/web/src/features/rehearsal/presenter/presenterStateStore.ts`
- `apps/web/src/features/rehearsal/presenter/presenterStateStore.test.ts`
- `apps/web/src/features/rehearsal/presenter/presentationChannel.ts`
- `apps/web/src/features/rehearsal/presenter/presentationChannel.test.ts`

**Estimated scope:** M

### Task 2. 테스트 가능한 screen capture port 구현

**설명:** `getDisplayMedia`, Chrome 힌트, Conditional Focus, 오류 매핑, idempotent cleanup을 한 모듈에 격리한다.

**Acceptance criteria:**

- [x] 탭/창 intent는 audio와 monitor를 제외하고 tab switching을 허용한다.
- [x] monitor intent는 고급 경로에서만 생성할 수 있다.
- [x] 기본 경로에서 실제 `displaySurface`가 `monitor`면 즉시 stop하고 안전 오류를 반환한다.
- [x] `stop()` 중복 호출과 track `ended` 중복 이벤트가 한 번의 종료 callback만 만든다.
- [x] API 미지원과 주요 DOMException이 정의된 사용자 오류로 변환된다.

**Verification:**

- [x] `pnpm --filter @orbit/web test -- screenShareCapture`
- [x] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 1
**Files likely touched:**

- `apps/web/src/features/rehearsal/presenter/screenShareCapture.ts`
- `apps/web/src/features/rehearsal/presenter/screenShareCapture.test.ts`

**Estimated scope:** S

### Task 3. session-scoped stream bridge 구현

**설명:** same-origin window 사이에서만 스트림을 전달하는 작은 bridge와 receiver 등록 수명주기를 구현한다.

**Acceptance criteria:**

- [x] 일치하는 `{deckId, sessionId}`만 stream attach/detach가 가능하다.
- [x] 닫힌 창, bridge 미준비, 다른 identity, 접근 예외가 typed failure로 반환된다.
- [x] receiver unmount와 identity 변경 시 오래된 bridge를 제거한다.
- [x] 기존 `BroadcastChannel` payload에는 `MediaStream`을 넣지 않는다.

**Verification:**

- [x] `pnpm --filter @orbit/web test -- audienceStreamBridge PresentWindow`
- [x] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 1
**Files likely touched:**

- `apps/web/src/features/rehearsal/presenter/audienceStreamBridge.ts`
- `apps/web/src/features/rehearsal/presenter/audienceStreamBridge.test.ts`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.tsx`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.test.tsx`

**Estimated scope:** M

### Task 4. 청중 slide/video/black 렌더러 완성

**설명:** receiver가 output mode를 적용하고 stream 부재/재생 실패/ended를 안전한 상태로 처리하도록 한다.

**Acceptance criteria:**

- [x] `slide`에서 기존 `SlideshowRenderer` 동작과 애니메이션 복원이 회귀하지 않는다.
- [x] `screen-share`에서 muted video만 렌더하고 `speakerNotes`나 presenter UI는 나타나지 않는다.
- [x] `black`에서 검정 surface와 작은 Orbit 로고만 나타난다.
- [x] stream이 없으면 5초 동안 연결 상태를 표시한 뒤 `screen-share-ended`를 보내고 slide 복귀를 요청한다.
- [x] video cleanup이 `srcObject = null`을 보장한다.

**Verification:**

- [x] `pnpm --filter @orbit/web test -- PresentWindow AudienceOutputRenderer SlideshowRenderer`
- [x] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Tasks 1, 3
**Files likely touched:**

- `apps/web/src/features/rehearsal/presenter/AudienceOutputRenderer.tsx`
- `apps/web/src/features/rehearsal/presenter/AudienceOutputRenderer.test.tsx`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.tsx`
- `apps/web/src/features/rehearsal/presenter/PresentWindow.test.tsx`
- `apps/web/src/features/presentation/orbit-live-presentation.css`

**Estimated scope:** M

## Checkpoint A. 브라우저 전송 경로 fail-fast

- [x] Tasks 1~4의 단위 테스트와 typecheck가 통과한다.
- [x] 현재 Vite COOP/COEP headers로 실행한 실제 Chrome에서 opener → `/present` popup stream attach가 동작한다.
- [x] 실제 Chrome에서 `PresenterRemoteWindow` → `window.opener` stream attach가 동작한다.
- [x] 두 방향 모두 direct bridge가 성공해 local loopback `RTCPeerConnection` 교체가 필요하지 않음을 확인했다.
- [x] direct bridge 성공 결과와 실제 Chrome 환경을 QA 문서에 기록했다.

### Task 5. 재사용 가능한 발표자 컨트롤과 공유 hook 구현

**설명:** 두 발표자 창이 같은 start/stop/black/warning 로직을 사용하도록 `AudienceOutputControls`와 `useAudienceScreenShare`를 만든다.

**Acceptance criteria:**

- [x] 연결 전에는 picker를 열지 않고 정확한 안내를 표시한다.
- [x] 기본 버튼은 탭/창 공유를 시작하고, 고급 전체 화면은 경고 확인 후에만 시작한다.
- [x] bridge attach 성공 후에만 mode를 `screen-share`로 바꾼다.
- [x] `슬라이드로 돌아가기`, black, ended, unmount가 같은 idempotent cleanup을 사용한다.
- [x] 공유 중 상태와 오류가 `aria-live`로 전달되고 키보드로 모든 제어가 가능하다.

**Verification:**

- [x] `pnpm --filter @orbit/web test -- AudienceOutputControls useAudienceScreenShare`
- [x] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Tasks 2~4, Checkpoint A
**Files likely touched:**

- `apps/web/src/features/rehearsal/presenter/AudienceOutputControls.tsx`
- `apps/web/src/features/rehearsal/presenter/AudienceOutputControls.test.tsx`
- `apps/web/src/features/rehearsal/presenter/useAudienceScreenShare.ts`
- `apps/web/src/features/rehearsal/presenter/useAudienceScreenShare.test.ts`
- `apps/web/src/features/rehearsal/rehearsal-workspace-orbit.css`

**Estimated scope:** M

### Task 6. `slide-window` 경로 수직 통합

**설명:** 기존 발표자 toolbar, `slideWindowRef`, publisher lifecycle에 공유 hook을 연결해 일반 팝업 경로를 완성한다.

**Acceptance criteria:**

- [x] `/present` popup이 connected일 때 main presenter toolbar에서 공유와 black을 제어할 수 있다.
- [x] popup 재열기/새로고침의 `slide-window-ready`에서 살아 있는 stream을 재부착한다.
- [x] popup stale/closed, 새 display 열기, role 전환, workspace unmount 시 capture를 중지하고 mode를 slide로 돌린다.
- [x] 공유 중 바뀐 내부 slide/step은 유지되고 복귀 시 최신 상태가 보인다.
- [x] 기존 슬라이드 창 열기, fullscreen, auto placement fallback이 회귀하지 않는다.

**Verification:**

- [x] `pnpm --filter @orbit/web test -- RehearsalWorkspace usePresentationChannelPublisher DisplayControls`
- [x] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Task 5
**Files likely touched:**

- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`
- `apps/web/src/features/rehearsal/presenter/usePresentationChannelPublisher.ts`
- `apps/web/src/features/rehearsal/presenter/usePresentationChannelPublisher.test.ts`

**Estimated scope:** M

### Task 7. 자동 배치 `PresenterRemoteWindow` 경로 수직 통합

**설명:** remote presenter가 캡처를 소유하고 `window.opener` receiver에 attach한 뒤 owner channel command로 output mode를 바꾸도록 한다.

**Acceptance criteria:**

- [x] surface swap 성공 후 remote command dock에서 공유/black/slide 복귀를 제어할 수 있다.
- [x] remote는 `window.opener` bridge identity를 확인한 뒤에만 `screen-share` command를 전송한다.
- [x] owner가 보내는 output mode update를 remote가 반영하고 외부에서 slide/black으로 바뀌면 local capture를 정리한다.
- [x] remote close/unmount, owner 응답 단절, track ended가 capture를 남기지 않는다.
- [x] 기존 next/prev/timer/notes/privacy 동작이 회귀하지 않는다.

**Verification:**

- [x] `pnpm --filter @orbit/web test -- PresenterRemoteWindow presentationChannel RehearsalWorkspace`
- [x] `pnpm --filter @orbit/web typecheck`

**Dependencies:** Tasks 5, 6
**Files likely touched:**

- `apps/web/src/features/rehearsal/presenter/PresenterRemoteWindow.tsx`
- `apps/web/src/features/rehearsal/presenter/PresenterRemoteWindow.test.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`
- `apps/web/src/features/rehearsal/RehearsalWorkspace.test.tsx`

**Estimated scope:** M

## Checkpoint B. 두 출력 경로 기능 완료

- [x] `slide-window` 탭/창 공유와 종료가 동작한다.
- [ ] 자동 배치 `surface swap` 탭/창 공유와 종료가 동작한다.
- [x] 두 경로 모두 black과 최신 슬라이드 복귀가 동작한다.
- [x] track, popup, remote, receiver lifecycle 정리 테스트가 통과한다.
- [x] 기존 presenter 관련 unit test 전체가 통과한다.

### Task 8. E2E, privacy 회귀, 실제 Chrome 검증 기록

**설명:** 자동화 가능한 계약은 Playwright에 고정하고 native picker/외부 모니터 동작은 재현 가능한 수동 QA 기록으로 남긴다.

**Acceptance criteria:**

- [x] Playwright mock stream으로 `slide-window`의 slide → screen-share → slide와 black 전환을 검증한다.
- [x] Playwright로 surface swap remote → opener stream attach와 output command를 검증한다.
- [x] audience HTML과 channel fixture에 private marker가 없음을 재검증한다.
- [ ] 실제 시스템 Chrome에서 탭, 앱 창, 고급 전체 화면, Chrome 공유 중지, popup/remote 종료를 검증한다.
- [x] 결과 문서에 Chrome/OS, 출력 경로, 성공/실패, 남은 제약을 기록한다.

**Verification:**

- [x] `pnpm --filter @orbit/web test -- presenter presentationChannel screenShare`
- [x] `pnpm --filter @orbit/web typecheck`
- [x] `pnpm --filter @orbit/web build`
- [x] `pnpm test:smoke -- tests/e2e/presenter-screen.spec.ts`
- [x] `PLAYWRIGHT_USE_SYSTEM_CHROME=1 pnpm test:smoke -- tests/e2e/presenter-screen.spec.ts`
- [x] `node infra/scripts/check-env.mjs`
- [x] 변경 범위 최종 gate: `pnpm lint && pnpm test && pnpm build`

**Dependencies:** Tasks 1~7, Checkpoint B
**Files likely touched:**

- `tests/e2e/presenter-screen.spec.ts`
- `docs/qa/presenter-screen-share-mvp.md`
- `docs/testing/test-matrix.md`

**Estimated scope:** M

## Checkpoint C. Goal 완료 gate

- [ ] Goal 완료 정의의 모든 항목을 증거와 함께 확인했다.
- [x] Chrome picker를 자동화하지 못한 항목은 `docs/qa/presenter-screen-share-mvp.md`의 실제 수동 결과가 있다.
- [x] 기존 slide-window privacy assertion과 animation sync E2E가 통과한다.
- [x] 전체 화면 경고를 우회하는 UI 경로가 없다.
- [x] console/server log와 channel payload에 민감 데이터 또는 capture metadata가 없다.
- [x] `git diff --check`가 통과한다.
- [x] 계획 밖 API/DB/shared schema/대규모 CSS 리팩터링이 없다.

## 7. 검증 시나리오 행렬

| ID | 경로 | 시나리오 | 기대 결과 | 자동화 |
| --- | --- | --- | --- | --- |
| S1 | slide-window | Chrome 탭 공유 | popup video 표시, audio 없음 | mock E2E + native manual |
| S2 | slide-window | 앱 창 공유 | popup video 표시 | native manual |
| S3 | slide-window | Chrome 공유 중지 | 1초 이내 최신 slide | unit + native manual |
| S4 | slide-window | popup 새로고침 | stream 재부착 또는 안전한 slide 복귀 | E2E |
| S5 | slide-window | popup 닫기 | track stop, 연결 끊김 안내 | E2E |
| S6 | surface swap | remote에서 탭 공유 | opener audience surface video 표시 | mock E2E + native manual |
| S7 | surface swap | remote 닫기 | track 종료, audience slide 복귀 | E2E + native manual |
| S8 | 공통 | black 전환 | capture stop, 검정+logo | unit + E2E |
| S9 | 공통 | 최신 slide 복귀 | 공유 중 진행된 최신 slide/step 렌더 | unit + E2E |
| S10 | 공통 | 전체 모니터 기본 버튼 선택 시도 | stop 후 고급 경고 요구 | unit + native manual |
| S11 | 공통 | 고급 전체 화면 확인 | picker 열림, monitor 공유 가능 | native manual |
| S12 | 공통 | picker 취소/권한 거부 | 기존 slide 유지, 재시도 가능 | unit + native manual |
| S13 | 공통 | privacy marker 주입 | audience DOM/channel에 marker 없음 | unit + E2E |
| S14 | current-window | 단독 발표에서 공유 시도 | 지원 범위 안내, picker 미호출 | unit |

## 8. 위험과 완화

| 위험 | 영향 | 완화 |
| --- | --- | --- |
| COOP/BCG가 opener/WindowProxy bridge를 끊음 | surface swap 또는 popup stream attach 실패 | Checkpoint A에서 실제 Chrome fail-fast, local loopback WebRTC fallback |
| `getDisplayMedia` 옵션의 Chrome/DOM 타입 차이 | build 실패 또는 힌트 무시 | capture 모듈 안의 좁은 타입, `displaySurface` 결과 사후 검증 |
| popup reload 때 mode만 `screen-share`이고 stream 없음 | 청중 화면 정지 | ready callback 재부착, 5초 timeout 후 slide 복귀 |
| remote가 닫혀 capture owner가 사라짐 | audience가 검은 video에 머묾 | receiver ended/timeout lifecycle로 owner에게 slide 복귀 요청 |
| 전체 화면에서 발표자 노트/알림 노출 | 심각한 개인정보 노출 | 기본 monitor 제외, 고급 경고+확인, audio 제외 |
| Orbit의 다른 탭을 선택해 hall-of-mirrors 발생 | 청중 출력 반복 | `selfBrowserSurface: exclude`, picker 전 Orbit 화면 선택 금지 안내 |
| 공유 중 자동 slide advance | 복귀 시 예상과 다른 slide | 명시적으로 최신 state 복귀 정책 적용, QA 시나리오 S9 |
| `<video>.play()` autoplay 실패 | 청중 화면 검정 | muted/autoplay/playsInline, 실패 상태와 slide 복귀 경로 |
| capture cleanup 중복 | 브라우저 indicator 잔존 또는 오류 | 단일 idempotent stop 함수와 ref 기반 소유권 테스트 |

## 9. 1차 제외 범위와 후속 순서

1차에서 제외한다.

- 다른 노트북/태블릿/원격 브라우저로 화면 전송
- 서버 signaling, TURN/STUN, SFU
- 캡처 오디오와 시스템 오디오
- Document Picture-in-Picture 플로팅 리모컨
- 화면 공유 구간 녹화와 발표 리포트 timeline 저장
- 포인터, 레이저, 주석 overlay
- `current-window` 단독 발표에서 공유 시작
- Firefox/Safari의 동일 기능 보장

2차 우선순위는 다음과 같다.

1. Document Picture-in-Picture의 `슬라이드로 돌아가기` 플로팅 리모컨
2. 탭 오디오를 단일 출력 경로로 제어
3. `current-window` 단독 발표 지원
4. 원격 기기용 WebRTC signaling과 shared schema 승격
5. 화면 공유 구간의 로컬 timeline event 기록

## 10. 계획 검토 결과

- 범위 선택 질문에 따라 `slide-window + 자동 배치 surface swap`을 1차로 확정했다.
- 공통 서버 계약 변경은 없다.
- 각 Task는 2~5개 파일의 S/M 단위로 제한했다.
- 가장 큰 기술 위험인 cross-window stream 전달을 Checkpoint A에서 먼저 검증한다.
- 모든 Task에 acceptance criteria, 검증 명령, dependency를 지정했다.
- 구현 중 새 제품 결정이 필요하지 않도록 privacy, 오류, lifecycle, fallback을 이 문서에서 확정했다.
