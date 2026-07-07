# 청중 모바일 입장 및 발표 참여 기획서

## 목적

발표자가 프로젝트 에디터에서 청중용 링크와 QR 코드를 열고, 청중은 모바일에서 해당 링크로 진입해 비밀번호를 입력한 뒤 원하는 참여 공간을 선택한다.

초기 목표는 발표 중 청중 참여의 입장 흐름을 먼저 고정하는 것이다. 질문방과 스트리밍 방의 상세 기능은 분리해서 확장하되, 이번 기획에서는 두 방으로 진입 가능한 모바일 허브까지를 MVP 기준으로 삼는다.

## 사용자 역할

### 발표자

- 프로젝트 에디터의 `프레젠테이션 > 청중 링크/QR`에서 청중 입장 모달을 연다.
- 발표 세션용 비밀번호를 설정하거나 갱신한다.
- 청중에게 공유할 모바일 링크와 QR 코드를 확인한다.
- 필요하면 입장 허용 상태를 켜고 끈다.

### 청중

- 모바일에서 QR 코드 또는 공유 링크로 청중 페이지에 진입한다.
- 비밀번호를 입력해 발표 세션에 입장한다.
- 입장 후 `질문방` 또는 `스트리밍 방` 중 하나를 선택한다.

## MVP 범위

### 포함

- 발표자 모달
  - 청중 링크 표시
  - QR 코드 표시
  - 비밀번호 설정/변경
  - 비밀번호 보호 상태 표시
- 모바일 청중 입장 페이지
  - 발표 제목 또는 프로젝트 제목 표시
  - 비밀번호 입력
  - 입장 실패 메시지
  - 입장 성공 후 방 선택 화면 표시
- 방 선택
  - 질문방 진입 버튼
  - 스트리밍 방 진입 버튼
  - 각 방의 placeholder 화면
- 기본 보안
  - 비밀번호 원문 저장 금지
  - 입장 시도 rate limit
  - 발표 세션 만료 또는 비활성 상태 처리

### 제외

- 질문 작성/관리의 완성 기능
- 실시간 스트리밍 플레이어 완성 기능
- 청중 계정 로그인
- 청중별 이름/프로필 관리
- 발표 종료 리포트와 청중 참여 데이터 분석

## 핵심 사용자 흐름

### 발표자 흐름

1. 발표자가 프로젝트 에디터에 진입한다.
2. 헤더에서 `프레젠테이션 > 청중 링크/QR`을 클릭한다.
3. 모달에서 비밀번호를 설정한다.
4. 시스템은 발표 세션의 청중 입장 링크를 생성한다.
5. 모달에 링크와 QR 코드를 표시한다.
6. 발표자는 QR을 화면에 띄우거나 링크를 복사해 공유한다.

### 청중 흐름

1. 청중이 모바일로 QR 코드를 스캔한다.
2. `/audience/:sessionId` 형태의 모바일 청중 페이지가 열린다.
3. 청중이 비밀번호를 입력한다.
4. 비밀번호가 맞으면 임시 청중 세션이 발급된다.
5. 청중은 `질문방` 또는 `스트리밍 방`을 선택한다.
6. 선택한 방 화면으로 이동한다.

## 화면 기획

### 발표자 모달

위치: `project` 에디터의 `프레젠테이션 > 청중 링크/QR`

필수 요소:

- 제목: `청중 링크/QR`
- 상태: `비밀번호 필요`, `입장 허용 중`, `입장 비활성`
- 비밀번호 입력/변경 영역
- 청중 링크
- 링크 복사 버튼
- QR 코드 영역
- 닫기 버튼

권장 상태:

- 비밀번호 미설정: 링크/QR은 비활성 또는 생성 전 상태
- 비밀번호 설정 완료: 링크/QR 표시
- 저장 중: 버튼 비활성화와 진행 표시
- 오류: API 오류 메시지 표시

### 모바일 청중 페이지

경로 후보:

- `/audience/:sessionId`

필수 요소:

- 발표 또는 프로젝트 제목
- 비밀번호 입력 필드
- 입장 버튼
- 오류 메시지
- 모바일 우선 레이아웃

입장 성공 후:

- `질문방` 카드
- `스트리밍 방` 카드
- 현재 발표 세션 상태 표시

### 질문방 placeholder

경로 후보:

- `/audience/:sessionId/questions`

초기 화면:

- 제목: `질문방`
- 안내 문구: 질문을 남길 수 있는 공간이라는 설명
- 실제 질문 등록 기능은 후속 범위

### 스트리밍 방 placeholder

경로 후보:

- `/audience/:sessionId/stream`

초기 화면:

- 제목: `스트리밍 방`
- 안내 문구: 발표 화면 또는 발표 상태를 볼 수 있는 공간이라는 설명
- 실제 스트리밍 연동은 후속 범위

## 데이터 모델 초안

### PresentationSession

```ts
type PresentationSession = {
  sessionId: string;
  projectId: string;
  deckId: string;
  status: "draft" | "open" | "closed";
  audiencePasscodeHash: string | null;
  audienceLinkEnabled: boolean;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
};
```

### AudienceSession

```ts
type AudienceSession = {
  audienceSessionId: string;
  presentationSessionId: string;
  createdAt: string;
  expiresAt: string;
};
```

## API 초안

### 발표자 API

- `POST /api/v1/projects/:projectId/presentation-sessions`
  - 발표 세션 생성 또는 현재 세션 반환
- `GET /api/v1/projects/:projectId/presentation-sessions/current`
  - 현재 발표 세션과 청중 링크 상태 조회
- `PUT /api/v1/presentation-sessions/:sessionId/audience-access`
  - 비밀번호 설정/변경, 입장 허용 상태 변경

요청 예시:

```json
{
  "passcode": "123456",
  "audienceLinkEnabled": true
}
```

응답 예시:

```json
{
  "session": {
    "sessionId": "session_demo_1",
    "projectId": "project_demo_1",
    "deckId": "deck_demo_1",
    "status": "open",
    "audienceLinkEnabled": true,
    "createdAt": "2026-07-02T12:00:00+09:00",
    "updatedAt": "2026-07-02T12:00:00+09:00",
    "expiresAt": null
  },
  "audienceUrl": "https://example.com/audience/session_demo_1"
}
```

### 청중 API

- `GET /api/v1/audience/sessions/:sessionId`
  - 모바일 입장 페이지에 필요한 공개 세션 정보 조회
- `POST /api/v1/audience/sessions/:sessionId/join`
  - 비밀번호 검증 후 청중 세션 발급

요청 예시:

```json
{
  "passcode": "123456"
}
```

응답 예시:

```json
{
  "audienceSession": {
    "audienceSessionId": "audience_session_1",
    "presentationSessionId": "session_demo_1",
    "createdAt": "2026-07-02T12:01:00+09:00",
    "expiresAt": "2026-07-02T14:01:00+09:00"
  }
}
```

## 보안과 운영 규칙

- 비밀번호 원문은 저장하지 않는다.
- 서버에는 passcode hash만 저장한다.
- 청중 입장 API는 IP 또는 session 단위 rate limit을 적용한다.
- 청중 세션은 발표자 계정 세션과 분리한다.
- 청중 API는 발표자 전용 데이터, speaker notes, raw script, raw audio를 노출하지 않는다.
- 비밀번호 오류 메시지는 `비밀번호가 올바르지 않습니다.`처럼 일반화한다.
- 발표 세션이 `closed`이면 청중 입장을 막는다.

## WebSocket 초안

후속 스트리밍/질문 기능을 고려해 room은 분리한다.

- 발표자 room: `presentation:{sessionId}:presenter`
- 청중 전체 room: `presentation:{sessionId}:audience`
- 질문방 room: `presentation:{sessionId}:questions`
- 스트리밍 room: `presentation:{sessionId}:stream`

초기 MVP에서는 방 선택 후 placeholder만 표시하고, 실제 이벤트는 후속 구현에서 추가한다.

## 구현 단계 제안

### 1단계: 발표자 모달 확장

- 현재 placeholder 모달을 실제 상태 기반 UI로 확장
- 비밀번호 입력/저장
- 링크 복사
- QR 코드 렌더링

### 2단계: shared 계약 추가

- `PresentationSession` schema
- `AudienceSession` schema
- audience access request/response schema

### 3단계: API와 DB

- presentation session migration
- passcode hash 저장
- current session 조회
- audience join API

### 4단계: 모바일 청중 페이지

- `/audience/:sessionId`
- 비밀번호 입력
- 방 선택
- 질문방/스트리밍 방 placeholder

### 5단계: 검증

- 발표자 비밀번호 설정 테스트
- 잘못된 비밀번호 입장 실패 테스트
- 올바른 비밀번호 입장 성공 테스트
- 모바일 viewport Playwright 테스트
- session closed 상태 입장 차단 테스트

## 확인이 필요한 결정

- 비밀번호는 숫자 PIN만 허용할지, 일반 문자열을 허용할지
- 발표 세션은 프로젝트당 하나만 유지할지, 발표 시작마다 여러 개를 만들지
- QR 링크는 외부 배포 URL 기준인지, 현재 origin 기준인지
- 청중 세션은 cookie 기반인지, URL/sessionStorage 기반 token인지
- 질문방과 스트리밍 방을 동시에 열어둘지, 청중이 하나만 선택하게 할지
