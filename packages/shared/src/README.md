# Shared src 파일 맵

`packages/shared/src`는 ORBIT의 공통 런타임 계약을 담는다. 프론트엔드, API, worker, editor-core, realtime 패키지는 여기서 export된 Zod schema와 TypeScript type을 재사용한다.

## 원칙

- `index.ts`는 public export만 담당한다.
- schema 구현은 기능 영역별 폴더에 둔다.
- 파일 이름은 `<domain>.schema.ts` 형식을 우선한다.
- 계약이 바뀌면 `docs/contracts.md`도 같이 갱신한다.
- 특정 앱 내부에서만 쓰는 타입은 여기에 두지 않는다.

## 파일별 역할

| 파일 | 역할 |
| --- | --- |
| `index.ts` | `@orbit/shared`의 public barrel export. 구현 로직을 두지 않는다. |
| `common/demo-ids.ts` | 1차 스프린트 데모용 고정 사용자, 워크스페이스, 프로젝트, 덱, 세션 ID. |
| `common/time.schema.ts` | ISO datetime schema와 현재 시각 생성 유틸리티. |
| `deck/deck.schema.ts` | deck metadata, canvas preset, slide, keyword schema와 `Deck`, `DeckCanvas`, `DeckMetadata`, `Slide`, `Keyword` 타입. |
| `deck/slide-object.schema.ts` | slide element schema, element type, 좌표/크기/회전/투명도/z-index/잠금/표시 상태를 관리한다. |
| `deck/animation.schema.ts` | animation schema와 MVP animation type. 객체/슬라이드 애니메이션 계약을 관리한다. |
| `deck/chart.schema.ts` | chart type, chart datum, chart schema. chart object props 검증에 사용한다. |
| `deck/theme.schema.ts` | deck theme schema. 색상과 기본 폰트 계약을 관리한다. |
| `files/file.schema.ts` | 파일 업로드 결과와 file purpose schema. |
| `jobs/job.schema.ts` | 비동기 Job 상태, type, 진행률, 결과/에러 schema. |
| `realtime/websocket.schema.ts` | WebSocket event envelope과 주요 payload schema. |
| `presentation/presentation.schema.ts` | 발표 세션, 리허설 지표, 최종 보고서 schema. |

## ORBIT-14 작업 메모

ORBIT-14의 핵심 작업은 deck 계약을 더 엄격하게 만드는 것이다.

- `deck/deck.schema.ts`: `1920x1080` 16:9, `1024x768` 4:3, `metadata.language = "ko"`, `metadata.locale = "ko-KR"` 강제 대상.
- `deck/slide-object.schema.ts`: `text`, `rect`, `ellipse`, `line`, `arrow`, `polygon`, `star`, `ring`, `image`, `group`, `customShape`, `chart` object type을 허용한다. `shape`, `video`는 허용하지 않는다.
- `deck/slide-object.schema.ts`: `x`, `y`는 `0` 이상, `width`, `height`는 `0` 초과로 검증한다. 객체가 오른쪽/아래쪽으로 캔버스 밖에 일부 노출되는 경우는 MVP에서 막지 않고, PPTX import/export 구현 중 다시 결정한다. `rotation`, `opacity`, `zIndex`, `locked`, `visible`은 객체 공통 상태로 관리한다.
- `deck/chart.schema.ts`: unsupported chart type 거부 대상. `chart` object의 `props`는 이 schema로 검증한다.
- `deck/animation.schema.ts`: `appear`, `disappear`, `fade-in`, `fade-out`, `zoom-in`, `zoom-out`, `rotate`만 MVP animation type으로 허용한다.
