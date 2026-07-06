# Google Slides Presentation Display Analysis

**Status:** Working notes
**Date:** 2026-07-06
**Purpose:** Google Slides의 슬라이드쇼/발표자 보기 동작을 관찰하고, ORBIT 발표 화면에 적용할 기술 원리를 정리한다.
**Related ORBIT docs:** `docs/specs/presenter-screen.md`, `docs/plans/presenter-screen-implementation-breakdown.md`, `docs/plans/google-slides-presentation-display-implementation.md`

## Reference Docs Checked

- [W3C Window Management Editor's Draft](https://w3c.github.io/window-management/)
- [WHATWG Fullscreen Standard](https://fullscreen.spec.whatwg.org/)
- [WHATWG HTML Standard: BroadcastChannel](https://html.spec.whatwg.org/multipage/web-messaging.html#broadcasting-to-other-browsing-contexts)
- [WHATWG HTML Standard: `window.open`](https://html.spec.whatwg.org/multipage/nav-history-apis.html#dom-open)
- [MDN Window Management API](https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API)
- [MDN `Window.getScreenDetails()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/getScreenDetails)
- [MDN `Element.requestFullscreen()`](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)
- [MDN Broadcast Channel API](https://developer.mozilla.org/en-US/docs/Web/API/Broadcast_Channel_API)
- [MDN `Window.open()`](https://developer.mozilla.org/en-US/docs/Web/API/Window/open)

## 요약

Google Slides의 발표 모델은 "발표자 제어면"과 "청중용 슬라이드면"을 분리한다. 일반 슬라이드쇼는 기존 편집 탭을 청중용 전체 슬라이드 화면으로 전환하고, 발표자 보기를 켜면 별도 popup/window에 발표자 도구를 띄운다. 중요한 점은 popup이 단순 미리보기 창이 아니라 타이머, 발표자 노트, 청중 Q&A, 다음/이전 제어, 디스플레이 전환을 소유하는 제어면이라는 것이다.

ORBIT에 바로 적용할 수 있는 핵심은 다음이다.

- 현재 창을 청중용 슬라이드면으로 전환하고, 새 popup을 발표자 창으로 여는 방식은 Google Slides와 같은 방향이다.
- 두 창 사이의 상태 동기화는 직접 `window.opener` 의존보다 session/token 기반 채널이 안전하다. Google Slides presenter popup은 `window.opener`가 없었다.
- 청중용 창에는 발표자 노트, transcript, raw audio, checklist 등 presenter-only 데이터를 보내지 않아야 한다.
- 전체화면과 모니터 선택은 별도 권한/브라우저 제약을 가진 기능으로 취급해야 한다. 실패 가능한 best-effort API로 설계하고, 항상 수동 배치 fallback을 제공해야 한다.

## 관찰 환경

- Browser: Chrome
- App: Google Slides
- Deck: `PintOS Weekly Sharing Presentation 303-07-wk10`
- Observed displays in Google Slides modal:
  - `DELL U2720Q`
  - `DELL U2723QE`
  - `내장 Retina 디스플레이(현재)`
- 테스트는 실제 Google Slides UI에서 실행했으며, Q&A 세션 생성처럼 외부 상태를 만드는 버튼은 누르지 않았다.

## Google Slides UI Surface

상단 `슬라이드쇼` 버튼은 두 부분으로 나뉜다.

- 기본 버튼: 현재 슬라이드에서 슬라이드쇼 시작
- 드롭다운 버튼:
  - `발표자 보기`
  - `처음부터 시작`
  - `Chromecast를 사용하여 발표하기`(현재 비활성)
  - `프레젠테이션 디스플레이 옵션`

`프레젠테이션 디스플레이 옵션` 모달에는 다음 설정이 있다.

- `발표자 보기`
- `첫 슬라이드부터 표시`
- `전체화면`
- `슬라이드쇼 표시` 대상 디스플레이 라디오 목록

관찰상 `전체화면`을 끄면 외부 디스플레이 라디오가 비활성화되고, "이 디스플레이에서 발표하려면 전체 화면이 필요합니다." 안내가 표시된다. 즉 Google Slides에서 디스플레이 선택은 전체화면 모드에 종속된다.

## 실행 모드별 동작

### 1. 기본 슬라이드쇼

기본 `슬라이드쇼` 시작은 새 탭을 만들지 않았다. 기존 Google Slides 편집 탭이 청중용 슬라이드 화면으로 전환됐다.

관찰된 특성:

- Chrome 탭 URL은 `/edit?slide=...#slide=...` 형태를 유지했다.
- 화면은 편집 UI 없이 슬라이드만 꽉 채우는 발표 화면으로 바뀌었다.
- `Esc`를 누르면 편집 화면으로 돌아왔다.
- `document.fullscreenElement`는 관찰 시점에 `false`였다.

해석:

Google Slides의 "탭 내부 슬라이드쇼"는 항상 표준 DOM Fullscreen API 상태로만 표현되지는 않는다. 발표 렌더 surface가 탭 viewport를 점유할 수 있고, 브라우저/OS 전체화면 여부는 별도 계층에서 처리된다. ORBIT도 "렌더 surface 전체화면"과 "브라우저 Fullscreen API 성공"을 분리해서 상태 모델링해야 한다.

### 2. 처음부터 시작

드롭다운의 `처음부터 시작`은 모달을 거치지 않고 첫 슬라이드부터 발표를 시작했다.

관찰된 특성:

- 새 Google Slides 탭은 생기지 않았다.
- 기존 편집 탭 URL의 `slide=` 값이 첫 슬라이드 id로 변경됐다.
- 화면은 청중용 슬라이드 화면으로 전환됐다.

ORBIT 적용:

`startFromBeginning`은 상태 명령으로 충분하다. 별도 route를 만들기보다 `slideIndex=0`, `stepIndex=0` 초기화 후 동일한 display opening flow를 타게 하는 편이 단순하다.

### 3. 전체화면 끈 상태

`프레젠테이션 디스플레이 옵션`에서 `전체화면`을 끄고 시작했다.

관찰된 특성:

- 슬라이드 화면은 여전히 탭 viewport를 꽉 채웠다.
- `document.fullscreenElement`는 `false`였다.
- 외부 디스플레이 선택 라디오는 비활성화됐다.

ORBIT 적용:

이 모드는 "자동 모니터 배치 없이 현재 창/탭 안에서 발표"하는 fallback과 같다. Window Management API가 없거나 권한이 거부된 브라우저에서 기본 fallback으로 삼을 수 있다.

### 4. 발표자 보기

`발표자 보기` 실행 시 별도 popup/window가 열렸고, 기존 편집 탭은 청중용 슬라이드 화면으로 전환됐다.

관찰된 특성:

- 새 popup 제목: `발표자 보기 - ... - Google Slides`
- Chrome 탭 목록의 URL: `about:blank`
- popup 내부 실제 `location.href`: `/presentation/d/<deckId>/present?token=<redacted>&includes_info_params=1&cros_files=false&nded=false&eisi=<redacted>&slide=<slideId>`
- popup의 `window.opener`: `false`
- popup의 `document.referrer`: 원래 `/edit?...#slide=...` URL
- popup viewport: 약 `730x523`, outer size 약 `730x646`
- 기존 탭은 `/edit?...#slide=...` URL을 유지하면서 청중용 슬라이드 화면이 됐다.

발표자 popup에 노출된 도구:

- 타이머
- `일시중지`
- `재설정`
- 슬라이드 선택 listbox
- 현재 슬라이드 preview
- 이전/다음 preview와 제어
- `청중 도구` 탭
- `발표자 노트` 탭
- `디스플레이 전환 (D)`
- 확대/축소

`다음` 버튼을 누르면 청중용 슬라이드 화면도 실제로 다음 슬라이드로 이동했다. 따라서 presenter popup은 viewer가 아니라 state mutator이다.

## 기술 원리 추정

### Window Role Model

Google Slides는 최소 두 role을 둔다.

- Audience surface: 청중에게 보이는 슬라이드 전용 화면
- Presenter surface: 발표자가 보는 제어 화면

이 둘은 URL이나 창 종류보다 role이 중요하다. 기존 편집 탭도 발표 시작 후에는 audience surface 역할을 수행한다. ORBIT도 `window.open`의 결과를 단순히 "새 창"으로 보지 말고, 각 browsing context에 role을 부여해야 한다.

ORBIT 권장 role:

- `presenter`: 노트, transcript, STT 상태, timer, controls, Q&A/session controls를 가진 제어면
- `slide-receiver`: sanitized deck snapshot과 slideshow state만 받아 렌더링하는 청중면
- `single-screen`: 보조 디스플레이가 없을 때 presenter 창 내부에서 슬라이드와 최소 timer overlay를 함께 쓰는 fallback

### State Ownership

Google Slides presenter popup에서 `다음`을 누르면 audience surface가 전환된다. 이는 presenter surface가 발표 state owner이거나, 적어도 state mutation command를 발행하는 주체임을 의미한다.

ORBIT에서는 presenter window를 단일 state owner로 두는 것이 맞다.

- `presenter`가 `slideId`, `slideIndex`, `stepIndex`, `highlights`, timer를 소유한다.
- `slide-receiver`는 상태를 변경하지 않는다.
- `slide-receiver`의 입력은 "ready", "heartbeat", "fullscreen requested" 같은 창 상태 이벤트로 제한한다.

현재 계획 문서의 "slide window is receive-only" 결정은 이 관찰과 잘 맞는다.

### Communication Channel

Google Slides presenter popup은 `window.opener`가 없었다. 같은 Google Slides origin의 `/present` URL이지만 opener reference를 보존하지 않는다. 이는 보안과 안정성 측면에서 중요하다.

가능한 해석:

- Google Slides가 popup을 `noopener` 성격으로 열었거나 opener relation을 끊는다.
- popup과 audience surface의 동기화는 direct JS object reference가 아니라 token/session 기반 내부 채널로 처리된다.
- URL의 `token`, `eisi`, `slide` query가 presenter session bootstrap에 쓰인다.

ORBIT 적용 원칙:

- `windowRef`는 열기/닫힘 감지, focus, move/resize, fullscreen best effort에만 사용한다.
- 상태 동기화는 `window.opener`나 popup DOM 직접 접근에 의존하지 않는다.
- 현재 계획처럼 `BroadcastChannel` + `{deckId, sessionId}` scoped channel을 기본으로 둔다.
- popup이 reload되거나 opener가 끊겨도 `sessionId`만 있으면 다시 최신 snapshot을 받을 수 있어야 한다.

### Session Bootstrap

Google Slides presenter URL은 deck id와 ephemeral token, slide id를 포함한다. 직접 접근 가능한 안정 permalink라기보다 session bootstrap URL이다.

ORBIT에서는 다음 구조가 적합하다.

```text
/present/:deckId?sessionId=<sessionId>
```

단, 이 route가 직접 deck 데이터를 가져와 발표자 전용 정보를 렌더링하면 안 된다. `sessionId`는 channel namespace이고, 첫 렌더는 `presenter-snapshot` 수신 전까지 대기해야 한다.

### Snapshot and Delta

새 slide-receiver가 늦게 열리거나 reload될 수 있으므로 delta만 보내면 복구가 어렵다. Google Slides도 presenter popup URL에 현재 `slide`를 넣어 bootstrap 위치를 명시한다.

ORBIT 권장:

- slide window ready 시 presenter가 full `presenter-snapshot`을 보낸다.
- 이후 navigation은 `presenter-state` delta를 보낸다.
- heartbeat로 창 생존 여부를 추적한다.
- stale/closed 상태에서도 presenter state store는 reset하지 않는다.

현재 `presentationChannel.ts`의 `presenter-snapshot`, `presenter-state`, `presenter-heartbeat`, `slide-window-ready`, `slide-window-heartbeat` 설계는 이 원리와 부합한다.

### Data Boundary

Google Slides audience surface에는 발표자 노트가 보이지 않고, presenter popup에만 발표자 노트가 표시된다. ORBIT에서는 이 경계가 더 중요하다. 발표자 script, raw audio, transcript는 청중 API나 슬라이드 창으로 넘어가면 안 된다.

현재 `createSlideWindowDeckSnapshot`이 다음을 제거하는 방향은 적절하다.

- `speakerNotes: ""`
- `keywords: []`
- `actions: []`

추가 권장:

- slide receiver snapshot 직렬화 테스트에서 다음 문자열이 없는지 계속 검증한다.
  - speaker notes
  - transcript
  - raw audio references
  - run meta
  - checklist/presenter-only marker

### Fullscreen and Display Placement

Google Slides의 display option은 전체화면을 켜야 외부 디스플레이 선택이 가능했다. 전체화면을 끄면 외부 디스플레이 선택 UI가 disabled된다.

기술적으로 브라우저에서는 다음 제약이 있다.

- `window.open`은 user activation 안에서 호출해야 popup 차단 가능성이 낮다.
- Window Management API는 2026-07-06 기준 일부 브라우저에서 제한적/실험적으로 취급된다. 따라서 `getScreenDetails()`는 progressive enhancement로만 써야 한다.
- `getScreenDetails()`는 secure context와 사용자의 window-management 권한이 필요하며, 권한 정책 또는 사용자 거부 시 `NotAllowedError`로 실패할 수 있다.
- `moveTo`/`resizeTo`는 popup window에서만 실효성이 있고 브라우저/OS 정책에 막힐 수 있다.
- `requestFullscreen()`은 transient user activation이 필요하며, Permissions Policy나 document 활성 상태에 따라 Promise가 reject될 수 있다.
- Window Management draft에는 `requestFullscreen({ screen })`와 screen 좌표 기반 `window.open` 조합이 제안돼 있지만, production에서는 지원 여부와 권한 실패를 정상 경로로 다뤄야 한다.

ORBIT 구현 원칙:

- display flow는 success path가 아니라 attempt-plus-fallback flow로 설계한다.
- 오류 코드는 분리한다.
  - `popup-blocked`
  - `window-management-unsupported`
  - `permission-denied`
  - `placement-failed`
  - `fullscreen-blocked`
- 자동 전체화면 실패 시 slide window 안에 CTA 버튼을 보여 user gesture로 `requestFullscreen()`을 재시도한다.
- 외부 화면 자동 배치가 안 되면 "창을 발표 모니터로 이동한 뒤 전체화면 버튼을 누르세요" fallback을 제공한다.

현재 `displayManager.ts`의 오류 코드와 injected browser port 구조는 맞는 방향이다.

## ORBIT 현재 설계와의 차이/주의점

### 현재 구현 방향

현재 `RehearsalWorkspace.openSlideDisplay`는 Google Slides 관찰 결과를 다음 두 실행 모드로 나눠 반영한다.

```text
발표자 보기 on:
  current window -> presenter
  new popup      -> slide-receiver

발표자 보기 off / 현재 창:
  current window -> slide-receiver
  popup 없음
```

`발표자 보기 on` 모드는 현재 ORBIT 리허설 화면에 있는 노트, STT, 타이머, 녹음 제어를 그대로 유지해야 하므로 현재 창을 presenter로 남기고 sanitized `/present/:deckId?sessionId=...` popup을 slide receiver로 연다. `발표자 보기 off / 현재 창` 모드는 Google Slides 기본 `슬라이드쇼`처럼 현재 문서 자체를 slide receiver로 전환하고 같은 user activation 안에서 `document.documentElement.requestFullscreen()`을 요청한다.

주의할 점:

- "현재 창" 모드는 브라우저 정책상 fullscreen 성공률이 가장 높지만, 발표자 도구가 사라진다.
- "별도 슬라이드 창" 모드는 발표자 도구를 유지하지만, 새 popup을 자동 fullscreen으로 전환하는 것은 reliable path가 아니다.
- Google Slides는 display option에서 발표 대상 디스플레이를 명시적으로 고르게 한다. ORBIT도 자동 배치가 가능할 때는 대상 화면 선택 UI가 필요하다.

### `windowRef.document.requestFullscreen()`의 한계

현재 `displayManager.requestSlideWindowFullscreen(windowRef)`는 `windowRef.document.documentElement.requestFullscreen()`을 호출한다. Same-origin popup이면 가능할 수 있지만, 브라우저가 user activation을 어떻게 전파하는지는 불안정하다.

더 견고한 구조:

- opener side: `window.open`, `moveTo`, `resizeTo`, `focus`까지만 best effort
- slide window side: 자기 document에서 user CTA로 `requestFullscreen()`
- presenter side: fullscreen 실패를 정상 상태로 보고 fallback message 표시

### `BroadcastChannel` 선택은 적절함

Google Slides는 opener를 끊은 상태에서도 presenter와 audience를 동기화했다. ORBIT도 direct window reference 대신 `BroadcastChannel`을 쓰는 현재 방향이 적절하다.

보완할 점:

- `BroadcastChannel` 미지원 브라우저 fallback을 명시할지 결정해야 한다. 1차 지원 브라우저가 Chrome이면 미지원 fallback은 수동 단일 화면으로도 충분하다.
- `sessionId`는 URL에 들어가므로 secret으로 취급하면 안 된다. 권한 토큰이 아니라 channel namespace로만 사용해야 한다.
- 민감 데이터는 channel에 실리지 않아야 한다. channel payload는 devtools에서 관찰 가능하다고 가정한다.

## 권장 아키텍처

```text
Presenter Window
  - owns PresenterStateStore
  - owns STT/recorder/timer/notes/checklist
  - opens or monitors Slide Receiver
  - publishes sanitized snapshot/state

BroadcastChannel: orbit:presenter-screen:<deckId>:<sessionId>
  - presenter-snapshot
  - presenter-state
  - presenter-heartbeat
  - slide-window-ready
  - slide-window-heartbeat

Slide Receiver Window
  - route: /present/:deckId?sessionId=<sessionId>
  - no direct deck fetch with presenter-only data
  - waits for presenter-snapshot
  - renders SlideshowRenderer from sanitized snapshot
  - sends ready/heartbeat only
  - provides fullscreen CTA if automatic fullscreen fails
```

## Display Flow Proposal

1. User clicks "슬라이드 창 열기" in presenter surface.
2. Create or reuse `sessionId`.
3. Open target window with `window.open`.
4. Publish `presenter-snapshot` when slide window sends `slide-window-ready`.
5. If Window Management API exists:
   - call `getScreenDetails()` from the same user action chain where possible
   - show screen picker when multiple external screens exist
   - call `moveTo` and `resizeTo` on selected popup
6. Try fullscreen as best effort.
7. If fullscreen fails:
   - show presenter-side warning
   - show slide-window CTA button
8. Continue publishing `presenter-state` on every slide/step/highlight change.
9. Heartbeat marks stale/closed but does not reset presentation state.

## Test Matrix

### Unit Tests

- `presentationChannel`
  - channel name scopes by deck id and session id
  - wrong deck/session messages ignored
  - snapshot removes speaker notes, keywords, transcript-like fields
  - state message contains only render state
- `displayManager`
  - popup blocked
  - unsupported Window Management API
  - permission denied
  - placement failed
  - fullscreen blocked
  - URL construction for `/present/:deckId?sessionId=...`
- `PresentWindow`
  - direct open without `sessionId` does not show deck
  - waits for snapshot
  - renders received slide state
  - fullscreen CTA calls `requestFullscreen()` only by user action

### Browser Smoke Tests

- Chrome single monitor:
  - open slide window
  - snapshot received
  - manual next step syncs
  - fullscreen CTA works
- Chrome multiple monitors:
  - screen picker shows external display
  - placement attempt does not crash on permission denial
  - selected display fallback text is actionable
- Popup blocked:
  - status becomes `popup-blocked`
  - presenter state is preserved
- Reload slide window:
  - sends ready again
  - presenter sends latest snapshot
  - current slide/step restored
- Close slide window:
  - heartbeat becomes stale/closed
  - reopen gets current snapshot

## Experiment Log

### 2026-07-06 1차 관찰

- `프레젠테이션 디스플레이 옵션` 모달 확인.
- 기본 상태: `전체화면` checked, `발표자 보기` unchecked, `첫 슬라이드부터 표시` unchecked.
- display list에 외부 Dell 모니터 2개와 내장 Retina display가 표시됨.
- 기본 슬라이드쇼는 새 탭 없이 기존 edit 탭을 청중용 화면으로 전환.
- `Esc`로 편집 화면 복귀.

### 2026-07-06 2차 관찰

- `처음부터 시작` 실행.
- 새 탭 없음.
- 기존 edit URL의 `slide`가 첫 슬라이드로 바뀜.
- 청중용 슬라이드 화면으로 전환.

### 2026-07-06 3차 관찰

- `전체화면` unchecked 상태로 시작.
- 외부 디스플레이 라디오 disabled.
- "이 디스플레이에서 발표하려면 전체 화면이 필요합니다." 안내 표시.
- 발표 화면은 viewport를 채우지만 `document.fullscreenElement`는 `false`.

### 2026-07-06 4차 관찰

- `발표자 보기` 실행.
- presenter popup 생성.
- 기존 edit 탭은 청중용 슬라이드 화면으로 전환.
- presenter popup은 Chrome 탭 목록에서 `about:blank`로 보였지만, 실제 page `location.href`는 `/present?...token=<redacted>&slide=<slideId>`.
- presenter popup의 `window.opener`는 `false`.
- presenter popup의 `다음` 버튼이 청중용 슬라이드를 실제로 다음 슬라이드로 이동시킴.

### 2026-07-06 5차 문서/표준 확인

- Window Management API는 multi-screen slideshow use case를 직접 동기로 삼지만, 제한적/실험 API이므로 fallback 필수.
- `window.open` popup feature는 브라우저가 최소 popup UI를 요청받는 방식이며, popup blocker 실패 시 `null`을 반환할 수 있다.
- `noopener`나 Cross-Origin-Opener-Policy는 opener reference를 끊을 수 있다. Google Slides presenter popup의 `window.opener=false` 관찰과 맞다.
- BroadcastChannel은 같은 origin/storage partition의 browsing context 간 통신 모델이다. ORBIT의 session-scoped channel 설계와 맞다.
- Fullscreen은 user activation과 권한/정책에 좌우된다. opener에서 다른 창 document를 자동 fullscreen 처리하는 경로는 reliable path로 두면 안 된다.

### 2026-07-06 6차 재검증 및 ORBIT 반영

Google Slides edit 탭에서 `슬라이드쇼` 기본 버튼을 다시 계측했다.

- `window.open` 호출은 관찰되지 않았다.
- `Element.requestFullscreen()`이 현재 문서 내부 `DIV`에서 호출되고 Promise가 resolve됐다.
- automation context에서는 이후 `document.fullscreenElement`가 `false`로 읽히는 경우가 있었지만, 실제 UI는 발표 surface로 전환됐다.

ORBIT에 반영한 결론:

- 한 번의 클릭에서 `window.open()`과 새 popup의 `requestFullscreen()`을 모두 안정적으로 성공시키는 설계를 기본값으로 두지 않는다.
- `DisplayControls`는 Google Slides처럼 split button + `프레젠테이션 디스플레이 옵션` 팝오버를 제공한다.
- 옵션 항목은 `발표자 보기`, `첫 슬라이드부터 표시`, `전체화면`, `슬라이드쇼 표시`(`별도 슬라이드 창`/`현재 창`)로 구성한다.
- `발표자 보기`가 켜지면 현재 창은 presenter로 유지하고 `/present/:deckId?sessionId=...` slide receiver popup을 연다. popup은 screen bounds로 `moveTo`/`resizeTo`를 best effort로 시도하고, fullscreen은 popup 안의 `전체화면` CTA로 처리한다.
- `현재 창`이 선택되면 Google Slides 기본 실행처럼 현재 rehearsal document에서 `requestFullscreen(document.documentElement)`를 먼저 요청한 뒤 `displayRole="slide-receiver"`로 바꾼다.
- `첫 슬라이드부터 표시`는 `slideIndex=0`, `stepIndex=0` 상태 초기화로 처리하고, popup snapshot은 다음 render 이후 발행될 수 있게 지연한다.

Chrome localhost 검증 결과:

- `http://localhost:5173/rehearsal/project_f7f54b9e-73f8-4e27-b210-82df7d08277e`에서 옵션 팝오버가 표시됨.
- 기본 옵션(`발표자 보기=true`, `전체화면=true`, `별도 슬라이드 창`)으로 시작 시 `/present/...` popup이 열리고 기존 rehearsal 탭에는 presenter controls가 유지됨.
- `/present/...` popup에는 slide stage와 `전체화면` CTA가 표시됨.
- popup의 `전체화면` CTA 클릭 후 viewport가 화면 크기로 확장되고 CTA가 사라짐. automation read context에서는 `document.fullscreenElement=false`로 읽혔지만 앱 내부 fullscreen state는 전환됨.
- `현재 창` radio 선택 후 시작 시 기존 rehearsal URL은 유지되고, presenter controls 없이 slide receiver stage만 표시됨. `발표자 화면으로 돌아가기`로 정상 복귀함.

### 2026-07-06 7차 Window Management 자동 배치 반영

Google Slides의 `프레젠테이션 디스플레이 옵션`에는 추가 디스플레이 연결 권한을 허용하는 흐름이 있다. ORBIT도 같은 방향으로 `발표 모니터 자동 배치` 옵션을 추가했다.

구현 원리:

- `DisplayControls` 옵션 팝오버에서 `화면 권한 요청` 버튼을 누르면 presenter tab에서 `window.getScreenDetails()`를 호출한다.
- 브라우저가 Window Management API를 지원하면 권한 prompt가 뜨고, 허용 후 `currentScreen`이 아닌 screen 목록을 받는다.
- 선택한 screen descriptor는 `{left, top, width, height, label}` 형태로 launch option에 저장한다.
- 슬라이드 창 시작 시 `window.open` feature에 `left`, `top`, `width`, `height`를 넣고, 열린 뒤에도 `moveTo(left, top)`와 `resizeTo(width, height)`를 best effort로 재시도한다.
- 권한이 거부되거나 API가 없거나 이동이 막히면 slide window는 그대로 열고, presenter UI에는 수동 이동 안내를 표시한다.

중요 제약:

- `getScreenDetails()`는 secure context와 사용자 gesture가 필요하다. `localhost`는 secure context로 취급되지만, Safari/Firefox 또는 정책이 막힌 환경에서는 미지원일 수 있다.
- `window.open`, `moveTo`, `resizeTo`는 브라우저/OS 정책에 따라 제한될 수 있다.
- 따라서 자동 배치는 "성공하면 좋은 progressive enhancement"이고, 기본 보장 경로는 여전히 열린 창을 사용자가 직접 이동한 뒤 fullscreen CTA를 누르는 fallback이다.

## Open Questions

- Google Slides의 `디스플레이 전환 (D)`는 정확히 어떤 OS/window primitive를 호출하는가? Chrome automation으로는 실제 물리 모니터 전환을 완전히 검증하지 못했다.
- Google Slides가 `document.fullscreenElement=false` 상태에서도 어떤 경로로 전체화면 표시를 구현하는지 추가 확인이 필요하다. 브라우저 Fullscreen API 외 OS-level presentation path일 가능성이 있다.
- ORBIT에서 실제 HDMI/무선 디스플레이 데모 환경의 기본값을 `발표자 보기 on + 별도 슬라이드 창`으로 둘지, `현재 창 fullscreen`으로 둘지는 물리 장비 테스트로 확정해야 한다.

## Decision Candidates

- Keep: `BroadcastChannel` + `sessionId` scoped synchronization.
- Keep: slide receiver sanitized snapshot only.
- Keep: `DisplayManager` as injected browser port with normalized recoverable errors.
- Adjust: fullscreen should be attempted inside the slide window by user CTA as the reliable path; opener-side fullscreen should remain best effort only.
- Add: explicit role model in code and UI copy: `presenter`, `slide-receiver`, `single-screen`.
- Add: manual display placement fallback as first-class UI, not error-only copy.
