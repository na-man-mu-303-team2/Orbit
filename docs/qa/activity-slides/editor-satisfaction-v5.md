# Activity Slides V5 editor browser evidence

검증일: 2026-07-17

## 검증 결과

| viewport | 대상 | 실제 크기 | 비율 | 내부 overflow | 문서 overflow |
| --- | --- | --- | --- | --- | --- |
| 1487x1058 | editor system layer | 911x512.44 | 1.7778 | 없음 (911x512) | 없음 (1487x1058) |
| 1487x1058 | inspector preview | 271x152.44 | 1.7778 | 없음 (271x152) | 없음 (1487x1058) |
| 1024x768 | editor system layer | 500x281.25 | 1.7778 | 없음 (500x281) | 없음 (1024x768) |
| 1024x768 | inspector preview | 247x138.94 | 1.7778 | 없음 (247x139) | 없음 (1024x768) |
| 390x844 | editor system layer | 307.2x172.8 | 1.7778 | 없음 (307x173) | 없음 (390x844) |

두 미리보기는 `aspect-ratio: 16 / 9`를 유지하며 system layer는 `잠긴 시스템 레이어`로 노출된다. 내부 overflow는 각 요소의 `scrollWidth/scrollHeight`와 `clientWidth/clientHeight`가 같은지 확인했다. 1024px에서는 접힌 오른쪽 패널을 펼친 뒤 inspector preview를 측정했다.

## 스크린샷

- `editor-desktop-1487x1058.png`
- `editor-tablet-1024x768.png`
- `editor-mobile-390x844.png`
