# iPad 발표 도우미 hardware/network spike

## 상태

- 구현 상태: staging 실험 하네스 구현 완료
- 로컬 정적 검증: `git diff --check` 통과
- 자동 테스트/타입 검사: 미실행
- 물리 기기 검증: 대기
- Checkpoint 0: **판정 보류**

자동 테스트와 타입 검사는 현재 worktree에 workspace 의존성이 설치되어 있지
않아 실행하지 못했다. `corepack pnpm install --frozen-lockfile`은 외부
registry 접근과 workspace 변경 승인이 없어 중단했으며 우회 설치는 하지
않았다. staging 배포 역시 별도 승인이 필요한 외부 상태 변경이므로 수행하지
않았다.

이 문서의 수치 표는 실제 HTTPS staging과 물리 iPad에서 측정한 값만
기록한다. 비어 있는 칸은 실패나 0이 아니라 `미측정`을 뜻한다.

## 목적

production companion 계약을 구현하기 전에 다음 전제가 실제 iPad와 같은
Wi-Fi에서 성립하는지 확인한다.

- current/previous stable iPadOS Safari의 Pointer Events와 touch drawing
- `getCoalescedEvents()`, Apple Pencil pressure, hover 지원 차이
- Socket.IO 왕복과 iPad 입력에서 desktop audience 적용까지의 ink 지연
- TURN 없는 같은 네트워크 WebRTC video receive
- iPad reload/sleep과 desktop host reload 뒤 복구
- 실전 발표형 host와 리허설형 host의 공용 iPad renderer/input 경로
- `slide-window`와 `surface swap` 두 멀티 윈도우 capture 경로

## 실험 하네스 범위

### Host 진입점

로그인하고 쓰기 권한이 있는 프로젝트에서 아래 query flag를 붙인다.

- 실전 발표: `/presentation/:projectId?companionSpike=1`
- 리허설:
  `/rehearsal/:projectId?preflight=without-voice&companionSpike=1`

두 화면은 같은 `CompanionSpikeHostPanel`과 같은 iPad URL을 사용한다. flag가
없으면 기존 발표/리허설 화면에는 spike UI가 나타나지 않는다.

Host panel은 다음 기능을 제공한다.

- 30분짜리 고엔트로피 `spikeId`와 QR URL 생성
- iPad 연결과 Pointer/pressure/hover capability 표시
- Socket.IO RTT 및 desktop audience 적용 ack 기반 ink p50/p95 표시
- `slide-window 캡처`, `surface swap 캡처`, `청중 spike 창` 실행
- 수신 필기와 공유 stream 미리보기

### iPad와 보조 창

| 경로 | 역할 |
| --- | --- |
| `/companion-spike/:spikeId` | WebRTC video 수신, Pointer/Pencil 입력, 지연 측정 |
| `/companion-spike/:spikeId/audience` | desktop audience video와 ink overlay 적용 |
| `/companion-spike/:spikeId/capture` | surface swap popup의 화면 capture와 opener 전달 |

iPad의 한 입력 batch는 한 Pointer event와 그 coalesced sample을 사용하며 최대
64 points로 제한한다. 좌표와 pressure는 `0..1`, stroke 상대 시간은 최대
120초로 정규화한다.

### 두 media 경로

`slide-window`:

1. Host panel에서 `slide-window 캡처`를 누른다.
2. 열린 청중 spike 창 또는 실제 청중 화면을 capture 대상으로 선택한다.
3. 같은 `MediaStream`을 desktop audience bridge와 iPad WebRTC peer에
   연결한다.

`surface swap`:

1. Host panel에서 `surface swap 캡처`를 누른다.
2. 열린 capture popup에서 `화면 선택 및 공유`를 누른다.
3. popup이 얻은 `MediaStream`을 same-origin opener bridge로 전달한다.
4. Host가 동일 stream의 video track을 iPad WebRTC peer에 연결한다.

두 경로 모두 `RTCPeerConnection({ iceServers: [] })`로 측정한다. 따라서 결과는
TURN이 없는 동일 네트워크 조건의 go/no-go 근거다.

## 안전 경계

- API는 `APP_ENV=production`에서 spike session 생성과 재개를 차단한다.
- session 생성과 재개에는 signed presenter cookie와 project write 권한이
  필요하다.
- iPad URL은 30분 TTL의 122-bit 이상 UUID entropy를 가진 임시 bearer다.
- 활성 iPad는 한 대이며 새 iPad가 join하면 이전 socket의 입력은 거부한다.
- server는 ink 좌표, pressure, batch 크기, signal 크기, metric 범위를
  검증한다.
- Deck, 발표자 script, notes, transcript, raw audio는 spike server payload에
  포함하지 않는다.
- host disconnect 중에는 iPad 입력과 signaling을 peer unavailable로
  거부한다. 인증된 host가 `sessionStorage`의 `spikeId`로 복귀하면 같은
  session을 재개한다.
- 서버 로그에 bearer나 입력 원문을 추가하지 않는다.

## 준비물과 환경 기록

| 항목 | 값 |
| --- | --- |
| staging origin | 미측정 |
| staging build/commit | 미측정 |
| desktop OS | 미측정 |
| Chrome Stable version | 미측정 |
| Wi-Fi/AP | 미측정 |
| NAT/firewall 특이사항 | 미측정 |
| 측정자 | 미측정 |
| 측정 일시 | 미측정 |

필수 기기:

- hover 지원 Apple Pencil/iPad
- hover 미지원 Pencil 또는 touch-only iPad
- release 시점 current stable iPadOS Safari
- release 시점 previous stable iPadOS Safari

한 기기가 OS 버전과 hover 조합을 모두 충족하지 않으면 기기를 나눠 기록한다.
원격 device farm 결과는 Pointer/Pencil 및 same-network WebRTC 합격 판정을
대신하지 않는다.

## 실행 순서

각 기기와 host 종류 조합에서 다음 순서를 반복한다.

1. HTTPS staging의 host 진입점에 접속하고 QR을 iPad Safari로 연다.
2. iPad 연결 상태와 Pointer/pressure/hover capability를 기록한다.
3. 손가락으로 직선, 곡선, 빠른 필기를 각각 수행한다.
4. Pencil 기기에서는 약한/강한 pressure와 hover를 각각 확인한다.
5. `slide-window` video 연결 시간을 기록하고 10분 동안 필기한다.
6. iPad reload, 1분 sleep/wake, Wi-Fi off/on 뒤 복구 시간을 각각 기록한다.
7. host tab을 reload하고 같은 `spikeId` 재개와 iPad 재연결 시간을 기록한다.
8. 새 session에서 `surface swap`을 같은 순서로 측정한다.
9. 실전 발표 host와 리허설 host에서 1~8을 반복한다.
10. Safari와 Chrome console error를 저장하고 아래 표에 첨부 경로를 적는다.

연결 시간은 capture 선택 완료부터 iPad의 WebRTC 상태가 `connected`가 되고
첫 video frame이 보일 때까지 측정한다. Ink latency는 iPad send 시점부터
desktop audience canvas 적용 ack를 다시 iPad가 받을 때까지다. 10분 측정 중
처음 30초 warm-up을 별도 표시하고, 최종 판정에는 warm-up 제외값을 사용한다.

## Pointer/Pencil 결과

| 기기 | iPadOS / Safari | 입력 | Pointer | coalesced | pressure | hover | fallback 품질 | console |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 미측정 | 미측정 | touch | 미측정 | 미측정 | 미측정 | 해당 없음 | 미측정 | 미측정 |
| 미측정 | 미측정 | Pencil, hover 미지원 | 미측정 | 미측정 | 미측정 | no 예상 | 미측정 | 미측정 |
| 미측정 | 미측정 | Pencil, hover 지원 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |

pressure 미지원/미관측 입력은 `buttons > 0`일 때 0.5를 사용한다. 이 fallback의
선 두께가 손가락과 구형 Pencil에서 읽기 쉬운지 별도로 기록한다.

## Media와 latency 결과

아래 표의 각 행은 10분 연속 측정이다.

| host | mode | 기기/OS | video 연결 ms | ink count | p50 ms | p95 ms | max ms | frame/끊김 메모 |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 실전 발표 | slide-window | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |
| 실전 발표 | surface swap | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |
| 리허설 | slide-window | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |
| 리허설 | surface swap | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |

## 복구 결과

| host | mode | 기기/OS | iPad reload | sleep/wake | Wi-Fi off/on | host reload | 결과 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 실전 발표 | slide-window | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |
| 실전 발표 | surface swap | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |
| 리허설 | slide-window | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |
| 리허설 | surface swap | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 | 미측정 |

복구 시간과 함께 자동 복구인지 QR 재스캔/버튼 재선택이 필요한지 기록한다.
화면 capture는 브라우저 보안 정책 때문에 사용자 gesture 재선택이 필요할 수
있으며, 이를 연결 실패와 구분한다.

## 구현 상수 확정표

| 상수 | spike 후보값 | 실제 확정값 | 근거 |
| --- | --- | --- | --- |
| media profile | browser `getDisplayMedia` 원본 video, audio 없음 | 미확정 | 물리 측정 대기 |
| ICE/TURN | 동일 Wi-Fi, `iceServers: []` | 미확정 | 두 mode 연결 결과 대기 |
| input batch | Pointer event당 coalesced points 최대 64 | 미확정 | 10분 p95/메모리 측정 대기 |
| send cadence | browser Pointer event cadence | 미확정 | p95 측정 후 rAF batch 필요성 판단 |
| spike session TTL | 30분 | 제품 TTL 미확정 | reload/sleep 측정 대기 |
| ink 합격 기준 | p95 300ms 이하 | 미확정 | 네 조합 측정 대기 |

## Checkpoint 0 판정

현재 판정은 **보류**다. 다음 항목이 모두 실제 값으로 채워지기 전에는 Task 1로
진행하지 않는다.

- current/previous stable Safari 모두 touch drawing과 WebRTC receive 성공
- hover 지원/미지원 기기의 pressure fallback 결과 기록
- 두 멀티 윈도우 mode 모두 같은 네트워크 no-TURN 연결 성공
- 네 host/mode 조합의 10분 ink p50/p95 기록
- reload/sleep 복구 방식과 시간 기록
- media profile, batch cadence, TTL 최종값 확정
- 브라우저 console error 검토

다음 중 하나라도 확인되면 `NO-GO`로 표시하고
`docs/ideas/ipad-presenter-companion.md`의 전송/렌더링 전략을 다시 검토한다.

- 두 창 mode 중 하나가 같은 네트워크에서도 구조적으로 WebRTC 연결 불가
- 지원 Safari 중 하나에서 touch drawing 또는 WebRTC receive 불가
- batching 조정 뒤에도 ink p95가 300ms를 크게 초과

## 검증 명령

의존성이 준비된 checkout에서 실행한다.

```bash
pnpm --filter @orbit/api test
pnpm --filter @orbit/api typecheck
pnpm --filter @orbit/web test
pnpm --filter @orbit/web typecheck
```

현재 실행 기록:

| 검증 | 결과 |
| --- | --- |
| `git diff --check` | 통과 |
| API spike 단위 테스트 | 미실행 — workspace 의존성 없음 |
| Web helper/route 단위 테스트 | 미실행 — workspace 의존성 없음 |
| API/Web typecheck | 미실행 — workspace 의존성 없음 |
| HTTPS staging | 미실행 — 배포 승인 없음 |
| 물리 iPad QA | 미실행 — staging/기기 필요 |

## 종료와 제거

이 harness는 Task 0 전용이다. 물리 측정과 Checkpoint 0 판정이 끝나면 다음
순서로 정리한다.

1. 이 문서에 raw 측정값, console 첨부 경로, 최종 상수, go/no-go를 커밋한다.
2. staging spike 배포를 종료한다.
3. production 기능 PR에는 spike gateway, public spike route, query flag host
   panel을 포함하지 않는다.
4. PR 0에는 이 결과 문서와 필요한 아이디어/구현 계획 보정만 남긴다.
