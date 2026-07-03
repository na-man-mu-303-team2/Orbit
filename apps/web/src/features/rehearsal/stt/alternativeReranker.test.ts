import { describe, expect, it } from "vitest";

import { rerankAlternatives } from "./alternativeReranker";

describe("alternativeReranker", () => {
  it("대안이 없으면 null을 반환한다", () => {
    expect(rerankAlternatives([], [{ text: "오르빗", weight: 1 }])).toBeNull();
  });

  it("대안이 하나뿐이면 원본을 유지한다", () => {
    expect(
      rerankAlternatives(
        [{ text: "오르빗", confidence: 0.4 }],
        [{ text: "오르빗", weight: 1 }]
      )
    ).toEqual({
      selected: { text: "오르빗", confidence: 0.4 },
      selectedIndex: 0,
      originalScore: 1,
      selectedScore: 1,
      changed: false
    });
  });

  it("bias 점수가 충분히 개선될 때 대안을 선택한다", () => {
    expect(
      rerankAlternatives(
        [
          { text: "이번 결재 승인 결과", confidence: 0.9 },
          { text: "이번 결제 승인 결과", confidence: 0.6 }
        ],
        [{ text: "결제 승인", weight: 1 }]
      )
    ).toMatchObject({
      selected: { text: "이번 결제 승인 결과", confidence: 0.6 },
      selectedIndex: 1,
      changed: true
    });
  });

  it("bias 점수 동점이면 confidence, 그다음 원본 순서를 사용한다", () => {
    expect(
      rerankAlternatives(
        [
          { text: "오르빗 데모", confidence: 0.4 },
          { text: "오르빗 데모", confidence: 0.8 }
        ],
        [{ text: "오르빗", weight: 1 }]
      )
    ).toMatchObject({
      selected: { text: "오르빗 데모", confidence: 0.4 },
      selectedIndex: 0,
      changed: false
    });

    expect(
      rerankAlternatives(
        [
          { text: "결재 승인", confidence: 0.4 },
          { text: "결제 승인", confidence: 0.4 },
          { text: "결제 승인", confidence: 0.9 }
        ],
        [{ text: "결제 승인", weight: 1 }]
      )
    ).toMatchObject({
      selected: { text: "결제 승인", confidence: 0.9 },
      selectedIndex: 2,
      changed: true
    });
  });

  it("점수가 threshold 미만이면 confidence가 높아도 원본을 유지한다", () => {
    expect(
      rerankAlternatives(
        [
          { text: "오르빗 발표", confidence: 0.1 },
          { text: "전혀 다른 문장", confidence: 0.99 }
        ],
        [{ text: "결제 승인", weight: 1 }]
      )
    ).toMatchObject({
      selected: { text: "오르빗 발표", confidence: 0.1 },
      selectedIndex: 0,
      selectedScore: 0,
      changed: false
    });
  });
});
