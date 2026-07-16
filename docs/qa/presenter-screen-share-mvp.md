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
| 전체 workspace gate | 통과 | `pnpm lint` 17/17, `pnpm test` 17/17, `pnpm build` 10/10 tasks |
| actual Chrome direct bridge | 통과 | 두 WindowProxy 방향에서 canvas `MediaStream` video track 1개 attach |
| actual Chrome native 탭 캡처 | 통과 | native `getDisplayMedia()`, `displaySurface=browser`, audio 0, video 1 |
| native 앱 창 캡처 | 통과 | 실제 앱 창 영상 표시, Chrome 공유 중지 후 최신 slide 복귀 |
| native 전체 모니터 | 통과 | 개인정보 경고·명시적 확인 후 영상 표시, black 전환 시 capture indicator 종료 |
| 물리 확장 디스플레이 `surface swap` | 환경 차단 | `getScreenDetails()`가 내장 Retina 1개만 반환; 실물 모니터 필요 |

## 자동 검증 시나리오

계획 문서에 적힌 `pnpm test:smoke -- tests/e2e/presenter-screen.spec.ts`가 파일 필터를 버리지 않도록 `test:smoke`의 인자 전달 래퍼를 추가했다. 동일한 명령으로 Chromium 3/3, `PLAYWRIGHT_USE_SYSTEM_CHROME=1`을 추가한 시스템 Chrome 3/3을 통과했다.

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
5. 시스템 Chrome native 앱 창
   - 실제 앱 창을 선택해 청중 video에 표시
   - 초기 검증에서 프레임은 재생되지만 `play()` promise 거부를 즉시 오류로 표시하는 오탐을 발견해 수정
   - 1초 유예와 `canplay`/`playing` 복구 후 오류 문구 없이 영상만 표시됨을 재검증
   - Chrome 기본 `공유 중지` 후 1초 이내 최신 slide 복귀
6. 시스템 Chrome native 전체 모니터
   - 고급 패널이 본문 아래에 가려지는 stacking 결함을 발견해 전면 overlay로 수정
   - 발표자 노트·알림·개인정보 경고와 확인 전 `전체 화면 선택` disabled 확인
   - 명시적 확인 후 전체 모니터 영상 표시
   - `청중 화면 가리기` 후 검은 ORBIT surface와 Chrome capture indicator 종료 확인
7. 실제 디스플레이 검색
   - Window Management 권한 허용 후 내장 Retina 디스플레이 1개만 반환
   - UI가 `추가 디스플레이를 찾지 못했습니다. 열린 창을 직접 옮겨주세요.` fallback을 표시

direct bridge가 두 방향 모두 성공했으므로 local loopback WebRTC fallback은 구현하지 않았다.

## 남은 수동 확인 항목

native 앱 창과 전체 모니터는 권한을 허용한 일반 Chrome 세션에서 통과했다. 현재 장비에는 물리 외부 모니터가 없어 실제 `surface swap` 배치만 남았다.

물리 모니터를 macOS 확장 모드로 연결한 일반 Chrome 세션에서 다음을 확인한다.

1. `화면 권한 요청` 후 외부 모니터가 목록에 나타나는지 확인한다.
2. 외부 모니터를 청중 화면으로 선택하고 `슬라이드쇼 시작` 후 `PresenterRemoteWindow`가 내장 화면에 열리는지 확인한다.
3. remote에서 탭·앱 창·전체 모니터 공유 후 청중 화면의 video 표시를 확인한다.
4. remote를 닫으면 capture indicator가 종료되고 청중 화면이 최신 slide로 복귀하는지 확인한다.

## 알려진 제약

- 1차는 같은 기기·같은 origin의 Chrome 데스크톱만 지원한다.
- `current-window` 단독 발표, 원격 기기, 오디오, Picture-in-Picture 리모컨은 제외한다.
- Chrome 보안 정책상 source는 사용자가 매번 picker에서 선택해야 한다.
- macOS 화면 녹화 권한이 없거나 OS가 source를 제공하지 않으면 앱 창/모니터 capture는 `NotReadableError`가 될 수 있다.
