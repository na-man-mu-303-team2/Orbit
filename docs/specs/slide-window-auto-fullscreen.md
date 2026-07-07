# 슬라이드 창 자동 전체화면 (Multi-Screen Auto Fullscreen)

**Status:** Proposed
**Date:** 2026-07-06
**Purpose:** 리허설 화면에서 "슬라이드 창 열기" 시 선택한 모니터로 창이 이동만 되고 전체화면이 자동으로 시작되지 않는 문제의 근본 원인을 분석하고, Google Slides 수준의 "클릭 한 번 → 발표 모니터 전체화면" 경험을 구현하기 위한 설계를 정리한다.
**Related ORBIT docs:** `docs/spikes/google-slides-presentation-display-analysis.md`, `docs/specs/presenter-screen.md`
**Related code:** `apps/web/src/features/rehearsal/presenter/displayManager.ts`, `apps/web/src/features/rehearsal/presenter/DisplayControls.tsx`, `apps/web/src/features/rehearsal/RehearsalWorkspace.tsx`, `apps/web/src/features/rehearsal/presenter/PresentWindow.tsx`

## 1. 요약 (TL;DR)

현재 구조(발표자 탭이 popup을 열고, popup을 전체화면으로 만드는 방식)로는 **어떤 API 조합으로도 클릭 한 번에 popup을 자동 전체화면으로 만들 수 없다.** 이는 버그가 아니라 브라우저의 transient user activation 보안 모델의 의도된 동작이다.

Google Slides가 잘 동작하는 이유는 popup을 전체화면으로 만들지 않기 때문이다. Google Slides는 방향을 반대로 뒤집었다:

- **현재 탭**(user activation이 살아있는 창)을 `requestFullscreen({ screen: 대상모니터 })`로 선택한 모니터에서 전체화면으로 전환하고,
- **발표자 도구를 popup**으로 연다. Chrome의 *Fullscreen Companion Window* 기능(Chrome 104+)이 "전체화면 요청 승인 + popup 1개 열기"를 한 번의 클릭으로 허용한다.

ORBIT 권장안도 동일하다: 자동 배치 + 전체화면 경로에서는 **리허설 탭이 슬라이드 surface가 되어 대상 모니터로 전체화면 전환**하고, **발표자 제어 popup**을 원래 화면에 연다. 상태 소유권(STT, 녹음, 타이머)은 리허설 탭에 그대로 유지하고, popup은 command를 보내는 제어면으로만 동작시킨다.

단기적으로는 현재 구조를 유지한 채 *Fullscreen Capability Delegation*(Chrome 104+)으로 "발표자 창에서 클릭 한 번 → 슬라이드 popup 전체화면"을 만드는 개선도 가능하다(마우스를 발표 모니터로 옮길 필요 제거).

## 2. 문제 정의

### 2.1 현상

`/rehearsal/:projectId`에서 "슬라이드 창 열기" 클릭 → 화면 권한 허용 → 발표 모니터 선택 후 시작하면:

1. `/present/...` popup이 선택한 모니터 위치에 열린다 (배치는 성공).
2. 그러나 전체화면으로 전환되지 않고 일반 popup 창으로 남는다.
3. 사용자는 마우스 커서를 발표 모니터로 옮겨 popup 안의 "전체화면" 버튼을 눌러야 한다.

발표 직전 상황에서 커서를 다른 모니터로 옮겨 버튼을 찾아 누르는 동작은 크리티컬한 UX 결함이다. Google Slides는 같은 시나리오에서 클릭 한 번으로 발표 모니터가 즉시 전체화면 슬라이드로 채워진다.

### 2.2 현재 코드 동작 (2026-07-06 기준)

실행 경로: `DisplayControls.openSlideWindow()` → `RehearsalWorkspace.openSlideDisplay()` → `openSlideWindowForDisplay()` → `displayManager.openSlideWindow()` + `placeOnScreen()`.

```text
[클릭] "슬라이드 창 열기"
  └─ openSlideWindowForDisplay(options)
       ├─ resolveAutoPlacementScreen()        # 사전에 저장한 screen descriptor 조회
       ├─ displayManager.openSlideWindow()    # window.open(url, target,
       │                                      #   "popup=yes,width,height,left,top")
       ├─ displayManager.placeOnScreen()      # moveTo/resizeTo (features와 중복)
       └─ return { fullscreenStarted: false } # ← 전체화면 시도 자체가 없음 (하드코딩)
```

확인된 사실:

- `RehearsalWorkspace.openSlideWindowForDisplay()`는 `fullscreenStarted: false`를 **하드코딩**으로 반환한다. slide-window 모드에서 `전체화면` 옵션 체크 여부와 무관하게 전체화면 시도가 전혀 일어나지 않고, UI는 항상 "전체화면 버튼을 눌러주세요" 수동 안내로 빠진다.
- `displayManager.requestSlideWindowFullscreen()`은 존재하지만 **어디에서도 호출되지 않는다.** opener에서 `windowRef.document.documentElement.requestFullscreen()`을 호출하는 구현인데, 호출했더라도 아래 3장의 이유로 반드시 실패한다.
- `placeOnScreen()`의 `moveTo`/`resizeTo`는 `window.open` features의 `left/top/width/height`와 중복이다. window-management 권한이 있으면 features만으로 초기 배치가 되므로, 열린 직후 다시 이동시키는 현재 코드는 창이 두 번 움직이는 깜빡임을 만들 수 있다.
- `openSlideWindow()`의 target이 `orbit-slide-<sessionId>` 고정 이름이므로, 같은 세션에서 재실행하면 기존 named window가 재사용되어 **features(위치/크기)가 무시**된다. 다른 모니터를 다시 선택해도 창이 이동하지 않는 케이스가 여기서 나온다.
- `DisplayControls.tsx`의 주석 "Popup opening must start before React state updates consume the click activation"은 부정확하다. React state 업데이트는 activation을 소모하지 않는다. activation은 (a) 소모형 API 호출(window.open, requestFullscreen 등)과 (b) 시간 만료(Chrome 기준 약 5초)로만 사라진다.

## 3. 근본 원인: 브라우저의 User Activation 모델

전체화면 실패의 원인은 구현 버그가 아니라 웹 플랫폼의 보안 모델이다. 세 가지 규칙이 겹친다.

### 3.1 Transient user activation은 창(window)마다 독립적이다

`Element.requestFullscreen()`은 **해당 document가 속한 창의** transient user activation을 요구한다. 사용자가 클릭한 곳은 리허설 탭이므로 activation은 리허설 탭에만 존재한다. `window.open()`으로 새로 만든 popup은 **activation 없이 태어난다.** opener가 popup의 document를 참조해 `requestFullscreen()`을 호출해도, 판정은 popup 컨텍스트 기준으로 이루어지므로 `NotAllowedError`로 reject된다.

### 3.2 소모형 API는 activation 하나당 한 번이다

`window.open()`과 `requestFullscreen()`은 둘 다 activation-consuming API다. 클릭 한 번의 activation으로는 원칙적으로 둘 중 하나만 성공한다. popup을 연 시점에 이미 activation이 소모되므로, 같은 클릭 안에서 추가 소모형 API 호출은 실패한다. (이 원칙의 예외가 4.3의 Fullscreen Companion Window다.)

### 3.3 popup document는 open 직후 아직 로드되지 않았다

`window.open()`은 navigation 완료를 기다리지 않고 즉시 WindowProxy를 반환한다. 그 시점의 `windowRef.document`는 `about:blank`이며, `/present/...` 앱이 로드된 후의 document와 다르다. 현재 `requestSlideWindowFullscreen()`이 호출된다 해도 잘못된 document를 대상으로 실행된다.

**결론:** "popup을 열고 그 popup을 코드로 전체화면 전환"은 (1) activation 부재, (2) activation 소모, (3) 문서 로딩 타이밍의 3중 벽에 막힌다. popup 안에서 사용자가 직접 클릭하는 것 외에는 이 구조를 유지한 채 뚫을 정규 경로가 없다. 이것이 spike 문서(`google-slides-presentation-display-analysis.md` §7차)의 "한 번의 클릭에서 window.open과 popup requestFullscreen을 모두 성공시키는 설계를 기본값으로 두지 않는다"는 관찰의 정확한 이유다.

## 4. 기술 조사

### 4.1 Window Management API (Chrome 100+, 이미 사용 중)

- `window.getScreenDetails()` → `ScreenDetails` (권한 프롬프트 발생 가능). 권한 이름은 `window-management` (구 `window-placement`는 폐기됨).
- `ScreenDetails.screens[]`의 각 `ScreenDetailed`는 `left/top/width/height/availLeft/availTop/availWidth/availHeight/isPrimary/isInternal/label/devicePixelRatio`를 제공한다.
- 권한이 있으면 `window.open` features의 `left/top`으로 다른 모니터에 창을 배치할 수 있고, `moveTo/resizeTo`도 화면 경계를 넘을 수 있다. 권한이 없으면 좌표는 현재 화면으로 clamp된다.
- 이벤트: `screenschange`(모니터 연결/해제), `currentscreenchange`, `Screen.change`.
- ORBIT은 이 API를 이미 목록 조회와 배치에 사용 중이다. **누락된 것은 아래 두 기능이다.**

### 4.2 `requestFullscreen({ screen })` — 특정 모니터를 지정한 전체화면 (Chrome 100+)

Window Management API는 `FullscreenOptions`에 `screen` 속성을 추가했다:

```js
const details = await window.getScreenDetails();
const target = details.screens.find((s) => !s.isPrimary); // 또는 사용자가 고른 화면
await slideStageElement.requestFullscreen({ screen: target });
```

- **현재 창을** 지정한 모니터에서 전체화면으로 전환한다. 브라우저 창이 해당 모니터로 이동하며, 전체화면 해제 시 원래 위치로 복귀한다.
- 이미 전체화면인 상태에서 다른 `screen`으로 다시 호출하면 전체화면이 모니터 간 스왑된다.
- `screen`에는 **살아있는 `ScreenDetailed` 인스턴스**를 넘겨야 한다. 현재 ORBIT의 `DisplayScreenDescriptor`처럼 직렬화한 plain object는 사용할 수 없다 → displayManager가 `ScreenDetails`를 캐시하고 인덱스로 원본 객체를 돌려주는 API가 필요하다.
- 호출 주체는 activation이 있는 창이어야 한다. 즉 클릭이 일어난 리허설 탭에서 호출하면 성공한다.

### 4.3 Fullscreen Companion Window (Chrome 104+, 기본 활성)

3.2의 "activation 하나 = 소모형 API 하나" 규칙의 공식 예외. `window-management` 권한이 허용된 사이트는 **한 번의 user activation으로 (1) 전체화면 요청 승인 + (2) popup 1개 열기**를 모두 수행할 수 있다 (ChromeStatus 5173162437246976, Chrome 104 기본 활성).

```js
// 한 번의 클릭 핸들러 안에서:
await stage.requestFullscreen({ screen: presentationScreen }); // 발표 모니터 전체화면
window.open(presenterUrl, "_blank", popupFeatures);            // 발표자 popup — 허용됨
```

순서가 중요하다: **전체화면 요청이 먼저 승인되어야 popup이 허용**된다(popup을 먼저 열면 activation이 소모되어 전체화면이 실패한다). 이 조합이 Google Slides "발표자 보기"의 실행 모델이다.

### 4.4 Fullscreen Capability Delegation (Chrome 104+)

`postMessage`의 `delegate` 옵션으로 다른 창에 requestFullscreen 자격을 위임할 수 있다:

```js
// 발표자 창 (클릭 핸들러 안, transient activation 필요·소모됨)
slideWindowRef.postMessage({ type: "enter-fullscreen" }, {
  targetOrigin: window.location.origin,
  delegate: "fullscreen"
});

// 슬라이드 popup (message 핸들러)
window.addEventListener("message", async (event) => {
  if (event.data?.type === "enter-fullscreen") {
    await document.documentElement.requestFullscreen(); // gesture 없이 성공
  }
});
```

- 발신 측은 postMessage 시점에 transient activation이 있어야 하며 위임으로 소모된다. 따라서 **popup을 연 클릭과 같은 activation으로는 위임할 수 없고**, 이후의 새 클릭(예: 발표자 창의 "전체화면 시작" 버튼)에서 사용해야 한다.
- 수신 측은 로드 완료 상태여야 하므로 `slide-window-ready` 수신 후에만 위임을 시도해야 한다.
- BroadcastChannel로는 위임이 불가능하다. `window.open()`이 반환한 WindowProxy에 대한 `postMessage`여야 한다.
- 활용처: "발표자 창에서 마우스를 옮기지 않고 슬라이드 창을 전체화면으로 전환/복구"하는 1클릭 경로. Google Slides의 `디스플레이 전환 (D)` 같은 창 간 전체화면 스왑도 이 메커니즘으로 구현 가능하다.

### 4.5 `window.open(..., "fullscreen")` — popup을 처음부터 전체화면으로 (사용 불가)

popup을 전체화면으로 직접 여는 `fullscreen` windowFeature는 Chrome 119~122에서 origin trial로 실험되었으나 **기본 기능으로는 채택되지 않았다** (ChromeStatus 6002307972464640: "No longer pursuing"). 후속인 *Automatic Fullscreen Content Setting*(Chrome 127+)에 통합되었는데, 이 설정은 **기본 차단이고 사이트가 프롬프트를 띄울 수 없다.** 사용자가 `chrome://settings/content/automaticFullScreen`에서 직접 허용하거나, 기업 정책(`AutomaticFullscreenAllowedForUrls`) 또는 Isolated Web App에서만 열린다. 일반 사용자 대상 웹앱인 ORBIT의 기본 경로로는 부적합하다. (키오스크/기업 배포 환경 문서에 안내용으로만 언급할 가치가 있다.)

### 4.6 Presentation API (검토 후 제외)

`PresentationRequest`는 Chromecast류 원격 디스플레이 송출용 controller/receiver 모델이다. 같은 PC에 물린 두 번째 모니터를 대상으로 하는 UX가 아니고 receiver 페이지 수명주기도 별도라서 ORBIT 시나리오에 맞지 않는다.

### 4.7 Google Slides는 실제로 무엇을 하는가

spike 문서의 관찰과 위 API를 합치면 Google Slides 멀티모니터 발표(2024-09 출시)의 동작이 설명된다:

1. "프레젠테이션 디스플레이 옵션"에서 디스플레이 목록을 보여주기 위해 `getScreenDetails()`로 `window-management` 권한을 확보한다. (spike 관찰: DELL 모니터 라벨 노출 = `ScreenDetailed.label`)
2. 발표 시작 클릭 시 **기존 편집 탭 안의 슬라이드 DIV를 `requestFullscreen({ screen: 선택모니터 })`** 로 전환한다. (spike 6차 관찰: "window.open 호출은 관찰되지 않았다. Element.requestFullscreen()이 현재 문서 내부 DIV에서 호출되고 resolve됐다" — 이것이 결정적 증거다.)
3. 발표자 보기가 켜져 있으면 **같은 클릭 안에서 발표자 popup**을 연다 — Fullscreen Companion Window 허용 규칙 덕분에 가능하다.
4. 디스플레이 전환(D)은 이미 전체화면인 요소에 다른 `screen`으로 `requestFullscreen`을 재호출(또는 창 간 capability delegation)하는 것으로 설명된다.
5. "전체화면 OFF 시 디스플레이 선택 비활성화"(spike 3차 관찰)도 자연스럽다: 모니터 지정은 `requestFullscreen({screen})`의 옵션이므로 전체화면 없이는 대상 모니터 지정 수단 자체가 없다.

즉 Google Slides는 "popup을 전체화면으로 만드는" 문제를 푼 것이 아니라, **전체화면은 activation이 있는 현재 탭에서 수행하고 popup에는 전체화면이 필요 없게 역할을 배치**했다.

### 4.8 브라우저 지원 매트릭스

| 기능 | Chrome/Edge (desktop) | Firefox | Safari |
| --- | --- | --- | --- |
| Window Management API (`getScreenDetails`) | 100+ | 미지원 | 미지원 |
| `requestFullscreen({ screen })` | 100+ | 미지원 | 미지원 |
| Fullscreen Companion Window (1 gesture = fullscreen + popup) | 104+ | 미지원 | 미지원 |
| Fullscreen Capability Delegation (`delegate: "fullscreen"`) | 104+ | 미지원 | 미지원 |
| `window.open` fullscreen feature | 콘텐츠 설정/정책 필요 (기본 차단) | 미지원 | 미지원 |

Firefox/Safari는 자동 배치·자동 전체화면 모두 불가능하므로 "창 수동 이동 + 창 내부 전체화면 CTA"가 유일한 경로다. 현재의 fallback 메시지 체계를 유지한다. localhost는 secure context로 취급되므로 개발 환경에서 API 사용에 문제가 없다.

## 5. 구현 옵션 비교

| | A. Surface swap (Google Slides 방식) | B. Capability delegation | C. In-popup CTA 개선 (현행 유지) |
| --- | --- | --- | --- |
| 클릭 수 | 시작 클릭 1번에 발표 모니터 전체화면 완료 | 시작 클릭 + 발표자 창에서 1클릭 | 시작 클릭 + 발표 모니터에서 1클릭 |
| 마우스 이동 | 불필요 | 불필요 (발표자 화면에서 클릭) | **발표 모니터로 커서 이동 필요** |
| 모니터 지정 | `requestFullscreen({screen})`으로 정확히 지정 | popup 배치 좌표로 지정 | popup 배치 좌표로 지정 |
| 구조 변경 | 큼 (창 역할 재배치) | 작음 (메시지 1종 + 버튼) | 최소 |
| 요구 버전 | Chrome/Edge 104+ | Chrome/Edge 104+ | 전 브라우저 |
| Google Slides 동등성 | 동등 | 근접 | 미달 |

권장: **B를 1단계로 먼저 출시**(작은 diff로 "커서 이동" 문제 즉시 해소)하고, **A를 2단계 목표**로 구현해 Google Slides와 동등한 1클릭 경험을 만든다. C는 A·B가 불가능한 환경(권한 거부, Firefox/Safari)의 fallback으로 유지한다.

## 6. 1단계 — Capability Delegation으로 현행 구조 개선

현재 아키텍처(리허설 탭 = presenter, popup = slide-receiver)를 유지한 채, 발표자 창에서 슬라이드 창의 전체화면을 원격으로 시작한다.

### 6.1 흐름

```text
[클릭1] 슬라이드 창 열기
  ├─ window.open(/present/..., features(left,top,width,height))  # 대상 모니터에 배치
  ├─ (placeOnScreen 제거 — features로 충분, 이중 이동 방지)
  └─ presenter UI: "전체화면 시작" 버튼 활성화 대기

[slide-window-ready 수신]  # BroadcastChannel, 기존 프로토콜
  └─ presenter UI: "전체화면 시작" 버튼 활성 + 안내 문구

[클릭2] 발표자 창의 "전체화면 시작"
  ├─ windowRef.postMessage({type:"orbit:enter-fullscreen"},
  │     { targetOrigin: origin, delegate: "fullscreen" })
  └─ popup: message 핸들러에서 rootRef.requestFullscreen()
```

클릭2를 자동화할 수는 없다(위임은 새 activation 필요). 하지만 사용자의 손은 발표자 화면에만 머물고, 안내 문구도 "열린 창에서 버튼을 찾아 누르세요"에서 "여기서 전체화면 시작을 누르세요"로 바뀐다.

### 6.2 코드 변경점

`displayManager.ts`:

```ts
delegateSlideWindowFullscreen: (windowRef: SlideWindowRef): DisplayManagerResult<void> => {
  try {
    // WindowProxy.postMessage — BroadcastChannel로는 delegate 불가
    windowRef.postMessage?.(
      { type: "orbit:enter-fullscreen" },
      { targetOrigin: window.location.origin, delegate: "fullscreen" }
    );
    return { ok: true, value: undefined };
  } catch {
    return createDisplayError("fullscreen-blocked", "전체화면 위임에 실패했습니다.");
  }
}
```

- `SlideWindowRef` 타입에 `postMessage` 추가. `windowRef`는 상태 동기화에는 계속 쓰지 않고(스파이크 원칙 유지) open/close/focus/위임에만 쓴다.
- `delegate` 옵션 미지원 브라우저는 동기적으로 throw하지 않고 일반 postMessage로 동작할 수 있으므로, popup 쪽 `requestFullscreen()` 실패를 `slide-window-fullscreen-failed` 채널 메시지로 회신받아 fallback 문구를 띄운다.

`PresentWindow.tsx`:

```ts
useEffect(() => {
  const onMessage = (event: MessageEvent) => {
    if (event.origin !== window.location.origin) return;
    if (event.data?.type !== "orbit:enter-fullscreen") return;
    void requestPresentWindowFullscreen(rootRef.current); // 위임 덕분에 gesture 없이 성공
  };
  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}, []);
```

`DisplayControls.tsx` / `RehearsalWorkspace.tsx`:

- `channelStatus === "connected"` && Chrome 104+ 감지 시 "전체화면 시작" 버튼 노출.
- 성공/실패는 기존 `fullscreenchange` 기반 heartbeat payload(또는 신규 `slide-window-fullscreen` 메시지)로 확인해 상태 라벨 갱신.
- 기존 `requestSlideWindowFullscreen()`(호출부 없는 사문)은 삭제.

### 6.3 추가 수정 (버그 픽스 성격, A/B 공통)

1. `openSlideWindow()` target에 매 실행마다 고유 suffix를 붙이거나, 기존 창이 살아있으면 `close()` 후 재오픈한다. named window 재사용 시 features가 무시되어 모니터 재선택이 동작하지 않는 문제 해결.
2. `placeOnScreen()`은 features 배치 실패의 보정용으로만 남기고 기본 경로에서 제거(이중 이동 깜빡임 제거).
3. `DisplayControls.tsx`의 activation 관련 주석을 정확한 내용(소모형 API/5초 만료)으로 교체.

## 7. 2단계 — Surface Swap (Google Slides 동등 경험)

### 7.1 창 역할 재배치

핵심 원칙: **상태 소유권은 옮기지 않고, 렌더 surface만 바꾼다.** STT/녹음/타이머/PresenterStateStore는 지금처럼 리허설 탭에 남는다. 마이크 스트림을 popup으로 옮기는 리스크(권한 재요청, 스트림 단절)를 피한다.

```text
현행 (발표자 보기 on):
  리허설 탭  = presenter (상태 소유 + 발표자 UI)
  popup      = slide-receiver (전체화면 불가 문제 발생 지점)

2단계 (자동 배치 + 전체화면 on):
  리허설 탭  = 상태 소유 + slide surface 렌더 → requestFullscreen({screen})로 발표 모니터 전체화면
  popup      = presenter remote (노트/타이머 표시 + next/prev command 발행, 원래 화면에 배치)
```

리허설 탭은 이미 `displayRole="slide-receiver"` 전환(현재 창 모드)과 `SingleScreenPresenter`를 갖고 있어 slide surface 렌더 능력이 있다. 새로 필요한 것은 popup용 presenter remote 뷰와 command 채널이다.

### 7.2 실행 시퀀스 (클릭 핸들러 안, 순서 엄수)

```ts
// 사전 조건: 옵션 팝오버의 "화면 권한 요청" 단계에서 이미
// screenDetails가 캐시되어 있음 (클릭 핸들러 안에서 await getScreenDetails() 금지 —
// 프롬프트가 뜨면 activation이 만료될 수 있다)

async function launchOnScreen(screenIndex: number) {
  const target = displayManager.getLiveScreen(screenIndex);       // ScreenDetailed 원본
  const homeScreen = displayManager.getCurrentScreen();           // 발표자 popup을 놓을 화면 (전체화면 이동 전에 캡처)

  // 1. 현재 탭의 slide stage를 발표 모니터에서 전체화면으로 — activation 소모 전이므로 성공
  await slideStageRef.current.requestFullscreen({ screen: target });

  // 2. 같은 activation으로 presenter remote popup — Companion Window 규칙으로 허용
  const popup = window.open(
    buildPresenterRemoteUrl(identity),
    `orbit-presenter-${sessionId}-${Date.now()}`,
    `popup=yes,left=${homeScreen.availLeft},top=${homeScreen.availTop},` +
    `width=${Math.min(homeScreen.availWidth, 1280)},height=${Math.min(homeScreen.availHeight, 800)}`
  );

  // 3. 역할 전환: 리허설 탭은 slide surface 렌더로 전환 (상태/STT/녹음은 유지)
  setDisplayRole("slide-surface");
}
```

주의 사항:

- 1번 이전에 어떤 소모형 API도 호출하지 않는다. `getScreenDetails()`는 권한이 이미 granted면 activation을 소모하지 않지만, 프롬프트 대기 시간이 5초를 넘기면 만료되므로 사전 캐시가 안전하다.
- 순서 역전 금지: popup을 먼저 열면 companion 규칙이 적용되지 않아 `requestFullscreen`이 NotAllowedError로 실패한다.
- `requestFullscreen`이 reject되면(권한 미보유, 정책 차단) popup을 열지 말고 1단계(B) 경로로 폴백한다.

### 7.3 displayManager 확장

```ts
type DisplayBrowserPort = {
  getScreenDetails?: () => Promise<ScreenDetails>;
  open: (...) => SlideWindowRef | null;
  requestFullscreen?: (el: Element, options?: FullscreenOptions) => Promise<void>;
};

// 내부에 ScreenDetails를 캐시하고 live 객체를 유지
let cachedDetails: ScreenDetails | null = null;

listExternalScreens();                 // 기존 — descriptor 반환 (UI용 직렬화 사본)
getLiveScreen(screenIndex): ScreenDetailed | null;   // 신규 — requestFullscreen({screen})용 원본
getCurrentScreen(): ScreenDetailed | null;           // 신규 — popup 홈 화면 계산용
requestFullscreenOnScreen(el, screenIndex): Promise<DisplayManagerResult<void>>; // 신규
```

- `DisplayScreenDescriptor`(직렬화 사본)는 UI 표시·테스트용으로 유지하되, 실행 시점에는 `screenIndex`로 live 객체를 다시 조회한다. `screenschange` 이벤트를 구독해 캐시 무효화 및 UI 목록 갱신을 한다.

### 7.4 채널 프로토콜 확장

기존 `presentationChannel` 메시지에 command 계열을 추가한다. 상태 소유권 원칙(스파이크 §State Ownership)은 유지된다 — popup은 상태를 직접 바꾸지 않고 command만 발행하며, 리허설 탭이 이를 적용해 snapshot/delta를 재발행한다.

```text
presenter-remote-ready      popup → 탭   (기존 slide-window-ready와 대칭)
presenter-command           popup → 탭   { action: "next" | "prev" | "goto", slideId?, ... }
presenter-remote-heartbeat  popup → 탭
presenter-snapshot / state  탭 → popup  (기존 메시지 재사용 — 발표자 전용 필드 포함 버전)
```

주의: 발표자 remote popup에는 speaker notes 등 presenter-only 데이터가 **포함되어야** 하므로, slide-receiver용 sanitized snapshot(`createSlideWindowDeckSnapshot`)과 구분되는 presenter snapshot 채널/타입을 써야 한다. 이 경계 구분을 직렬화 테스트로 강제한다.

### 7.5 전체화면 수명주기 처리

- `fullscreenchange`에서 `document.fullscreenElement`가 사라지면(ESC, 시스템 인터럽트) 리허설 탭 역할을 presenter로 복원하고, "발표 모니터 전체화면 다시 시작" CTA를 띄운다. 재시작 클릭은 새 activation이므로 `requestFullscreen({screen})` 재호출로 충분하다.
- `screenschange`에서 대상 모니터가 사라지면 전체화면이 자동 해제될 수 있다 → 같은 CTA 경로로 수렴시킨다.
- popup(presenter remote)이 닫히면: 발표는 계속 유지하고, 리허설 탭 전체화면 위 overlay로 최소 제어(다음/이전/종료)를 제공한다.
- 디스플레이 전환 기능(Google Slides의 D 키 대응): 전체화면 상태에서 다른 screenIndex로 `requestFullscreen({screen})` 재호출.

### 7.6 UI 변경

- 옵션 팝오버는 유지. `발표 모니터 자동 배치 + 전체화면 + 발표자 보기` 조합일 때 2단계 경로를 태운다.
- 시작 버튼 라벨을 상태에 따라 구체화: "OO 모니터에서 발표 시작". 권한 미보유 시 시작 전에 화면 권한 요청 단계를 거치도록 유도(프롬프트와 시작 클릭 분리).
- 전체화면 옵션 off이면 Google Slides처럼 모니터 선택을 비활성화하고 사유를 표시한다 (§4.7-5).

## 8. 엣지 케이스 정리

| 상황 | 기대 동작 |
| --- | --- |
| 권한 프롬프트에서 거부 | `permission-denied` — 수동 배치 안내, C 경로 |
| Firefox/Safari | `window-management-unsupported` — popup 열기 + 창 내 CTA (C 경로) |
| 단일 모니터 | 자동 배치 옵션 숨김/비활성, 현재 창 모드 권장 문구 |
| popup 차단 | `popup-blocked` — 기존 메시지 유지. 2단계에서는 전체화면은 이미 성공한 상태이므로 전체화면 위 overlay로 안내 |
| `requestFullscreen({screen})` reject | popup 열지 않고 1단계(B) 경로 폴백 + `fullscreen-blocked` |
| 발표 중 모니터 분리 | `screenschange` → 전체화면 해제 감지 → 재시작 CTA |
| 같은 세션 재실행 | 고유 window name으로 재배치 보장 (§6.3-1) |
| 5초 내 미완료 (프롬프트 지연 등) | activation 만료 → 시작 단계 분리 설계로 예방, 실패 시 재클릭 안내 |

## 9. 테스트 계획

Unit (`displayManager.test.ts` 확장, injected port 활용):

- `requestFullscreenOnScreen`: 성공 / reject 시 `fullscreen-blocked` / 미지원 port
- `getLiveScreen`: 캐시 없음 → null, `screenschange` 후 재조회
- 실행 순서 검증: fullscreen 성공 후에만 `open` 호출, 실패 시 미호출
- delegation: `postMessage`가 `delegate: "fullscreen"` 옵션과 origin으로 호출되는지
- presenter snapshot vs sanitized snapshot 직렬화 경계 (notes 포함/제외)

수동 QA 매트릭스 (멀티모니터는 자동화 불가 — Playwright/CDP는 가상 단일 화면만 제공):

- Chrome 최신 / 외장 모니터 1·2개 / macOS·Windows: 1클릭 시작 → 대상 모니터 전체화면 + popup 홈 화면 배치
- ESC 해제 → 복원 CTA → 재시작
- 모니터 케이블 분리 중 발표
- 권한 거부 → 폴백 문구
- Firefox/Safari → C 경로 동작

## 10. 참고 자료

- [Chrome for Developers — Manage several displays with the Window Management API](https://developer.chrome.com/docs/capabilities/web-apis/window-management)
- [MDN — Using the Window Management API](https://developer.mozilla.org/en-US/docs/Web/API/Window_Management_API/Using)
- [MDN — Element.requestFullscreen()](https://developer.mozilla.org/en-US/docs/Web/API/Element/requestFullscreen)
- [ChromeStatus — Window Management: Fullscreen Companion Window (Chrome 104)](https://chromestatus.com/feature/5173162437246976)
- [ChromeStatus — Fullscreen Capability Delegation (Chrome 104)](https://chromestatus.com/feature/6441688242323456)
- [ChromeStatus — Open popups as fullscreen windows (중단됨)](https://chromestatus.com/feature/6002307972464640)
- [ChromeStatus — Automatic Fullscreen Content Setting (Chrome 127, 기본 차단)](https://chromestatus.com/feature/6218822004768768)
- [Chrome Blog — New origin trial for fullscreen popup windows](https://developer.chrome.com/blog/fullscreen-popups-origin-trial)
- [W3C Window Management spec](https://www.w3.org/TR/window-management/) / [Explainer: Initiating Multi-Screen Experiences](https://github.com/w3c/window-management/blob/main/EXPLAINER_initiating_multi_screen_experiences.md)
- [WICG Capability Delegation spec](https://wicg.github.io/capability-delegation/spec.html)
- [Google Workspace Updates — Adding multi-monitor support to Google Slides (2024-09)](https://workspaceupdates.googleblog.com/2024/09/adding-multi-monitor-support-to-google-slides.html)
- 데모: [michaelwasserman.github.io/window-placement-demo](https://michaelwasserman.github.io/window-placement-demo/)
