# 발표자 웹·실습 공유 1차 MVP QA

**검증일:** 2026-07-16

**환경:** macOS 26.5.1, Google Chrome 150.0.7871.115

**대상 계획:** `docs/plans/presenter-audience-screen-share-mvp.md`

## 결과 요약

| 범위 | 결과 | 증거 |
| --- | --- | --- |
| 단위/통합 테스트 | 통과 | presenter state, channel, capture port, stream bridge, renderer, controls, main/remote integration |
| `slide-window` E2E | 통과 | slide → video → 최신 slide, black, track ended, popup close/reopen, privacy |
| `surface swap` E2E | 통과 | remote → opener video, output command, 최신 slide, black, remote close |
| Playwright Chromium | 통과 | `presenter-screen.spec.ts` 3/3 |
| 시스템 Chrome | 통과 | `PLAYWRIGHT_USE_SYSTEM_CHROME=1`, 3/3 |
| actual Chrome direct bridge | 통과 | 두 WindowProxy 방향에서 canvas `MediaStream` video track 1개 attach |
| actual Chrome native 탭 캡처 | 통과 | native `getDisplayMedia()`, `displaySurface=browser`, audio 0, video 1 |
| native 앱 창/전체 모니터 | 환경 차단 | macOS capture source 시작 단계에서 `NotReadableError`; 아래 수동 확인 필요 |

## 자동 검증 시나리오

### 일반 `slide-window`

- 연결 전 공유 버튼은 disabled이고 picker를 호출하지 않는다.
- 기본 공유 요청은 `audio: false`, `monitorTypeSurfaces: exclude`, `selfBrowserSurface: exclude`, `systemAudio: exclude`다.
- capture와 identity bridge attach가 성공한 뒤에만 `screen-share`로 전환한다.
- 청중 `<video>`는 muted이며 audio track 0개, video track 1개다.
- 공유 중 다음 슬라이드로 진행한 뒤 복귀하면 최신 슬라이드가 보인다.
- track `ended`는 최신 슬라이드로 복귀한다.
- black은 video와 슬라이드를 제거하고 검은 surface와 ORBIT 로고만 표시한다.
- popup close는 track을 종료하고, 재연결한 popup은 최신 슬라이드에서 시작한다.

### 자동 배치 `surface swap`

- `PresenterRemoteWindow`의 `window.opener`와 audience bridge가 같은 identity로 연결된다.
- remote의 직접 클릭에서 capture를 시작하고 owner가 output mode command를 반영한다.
- owner의 이전 snapshot이 방금 보낸 output command를 덮지 않도록 acknowledgment 전 짧은 보류를 적용한다.
- remote close/unmount는 capture를 정리하고 audience를 최신 슬라이드로 복귀시킨다.
- 기존 next/prev/timer/notes UI는 유지된다.

### 개인정보 경계

- audience deck snapshot은 `speakerNotes`와 keywords를 제거한다.
- audience DOM에 발표자 대본과 비공개 키워드 marker가 없다.
- audience channel payload에 `MediaStream`, track, frame, capture target title을 넣지 않는다.
- 화면 공유 영상/구간을 API, storage, Job, WebSocket, 로그에 보내지 않는다.
- 캡처 오디오는 항상 비활성화하고 audience video도 muted다.

## actual Chrome 검증 기록

Vite 개발 서버 응답은 `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Embedder-Policy: require-corp`, `Cross-Origin-Resource-Policy: same-origin`이며 `crossOriginIsolated=true`였다.

1. presenter opener → `/present` popup
   - identity bridge attach 성공
   - audience video에 실제 canvas `MediaStream` video track 1개 확인
2. `PresenterRemoteWindow` 역할 → `window.opener` audience surface
   - opener 유지와 bridge attach 성공
   - audience video에 video track 1개 확인
3. 실제 React 컨트롤
   - 고급 옵션에서 전체 화면 경고 표시
   - 위험 확인 전 `전체 화면 선택` disabled
   - 확인 후 enabled
   - monitor → slide → 기본 공유 → slide → black UI 전환 확인
4. 시스템 Chrome native 탭
   - Chrome의 테스트용 source 자동 선택 플래그로 native picker 선택만 자동화
   - `getDisplayMedia()` 결과 `displaySurface=browser`, audio track 0개, video track 1개

direct bridge가 두 방향 모두 성공했으므로 local loopback WebRTC fallback은 구현하지 않았다.

## macOS 수동 확인이 필요한 항목

자동 실행한 앱 창과 전체 모니터 native capture는 Chrome이 source를 선택한 뒤 `NotReadableError: Could not start video source`를 반환했다. macOS `개인정보 보호 및 보안 > 화면 및 시스템 오디오 녹음` 권한과 실제 확장 디스플레이가 필요한 환경 항목이다.

권한을 허용한 일반 Chrome 세션에서 다음을 확인한다.

1. `slide-window`에서 다른 Chrome 탭 선택 → video 표시 → Chrome `공유 중지` → 1초 이내 최신 slide.
2. `slide-window`에서 별도 앱 창 선택 → video 표시 → Orbit `슬라이드로 돌아가기`.
3. 고급 옵션 경고 확인 후 전체 모니터 선택 → video 표시, audio 없음.
4. 공유 중 popup 닫기 → Chrome capture indicator 종료, track 잔존 없음.
5. 실제 확장 모니터 `surface swap`에서 remote로 탭/앱/모니터 공유 후 remote 닫기 → 최신 slide.
6. 알림·발표자 노트·다른 앱이 보이는 전체 모니터를 선택할 때 경고가 picker보다 먼저 표시되는지 확인.

## 알려진 제약

- 1차는 같은 기기·같은 origin의 Chrome 데스크톱만 지원한다.
- `current-window` 단독 발표, 원격 기기, 오디오, Picture-in-Picture 리모컨은 제외한다.
- Chrome 보안 정책상 source는 사용자가 매번 picker에서 선택해야 한다.
- macOS 화면 녹화 권한이 없거나 OS가 source를 제공하지 않으면 앱 창/모니터 capture는 `NotReadableError`가 될 수 있다.
