# ORBIT Design System — Local Copy

현재 ORBIT 코드베이스에서 사용하는 디자인 시스템만 분리한 로컬 사본이다.
목업 페이지와 제품 기능 코드는 포함하지 않는다.

## 구성

- `src/tokens.ts`: 색상, 간격, radius, control 크기 토큰
- `src/components.tsx`: 공통 UI 컴포넌트
- `src/orbit-design-system.css`: 컴포넌트와 프리뷰 스타일
- `src/OrbitDesignSystemPage.tsx`: 디자인 시스템 프리뷰
- `src/*.test.ts(x)`: 토큰·컴포넌트 테스트
- `assets/`: 밝은 화면과 어두운 화면용 공식 ORBIT 로고
- `docs/orbit-design-system.md`: 디자인 원칙과 화면별 적용 기준

## 원본 위치

- 구현: `apps/web/src/design-system/`
- 문서: `docs/orbit-design-system.md`
- 브랜드 자산: `apps/web/src/assets/orbit-logo.png`, `apps/web/src/assets/orbit-logo-white.png`

이 폴더는 복사 시점의 독립 사본이다. 원본과 자동으로 동기화되지 않는다.
