import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OrbitMockupFlow } from "./OrbitMockupFlow";

describe("Orbit mockup flow", () => {
  it("renders the public conversion screen", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="public" />);
    expect(html).toContain("생각을 발표로 바꾸는 가장 빠른 캔버스");
    expect(html).toContain("무료로 발표 만들기");
    expect(html).toContain("생성");
    expect(html).toContain("편집");
    expect(html).toContain("리허설");
  });

  it("renders a next-action home for the connected journey", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="home" />);
    expect(html).toContain("지금 할 일부터 이어가세요");
    expect(html).toContain("이 발표 준비 시작");
    expect(html).toContain("첫 업무 성과 보고");
    expect(html).toContain("발표가 먼저 막막해요");
    expect(html).toContain("전체 여정 1 / 6");
  });

  it("renders the full presentation journey map", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="journey" />);
    expect(html).toContain("발표 준비부터 실전까지");
    expect(html).toContain("홈에서 여정 시작");
    expect(html).toContain("발표자료 만들기");
    expect(html).toContain("다음 행동 선택");
  });

  it("renders the low-pressure practice setup", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="safe-start" />);
    expect(html).toContain("오늘은 도입부만 연습해요");
    expect(html).toContain("음성 분석 없이");
    expect(html).toContain("60초 도입부 연습 시작");
    expect(html).toContain("연습 결과는 나만 보기");
  });

  it("renders the low-pressure practice room", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="safe-practice" />);
    expect(html).toContain("첫 문장은 결론부터");
    expect(html).toContain("음성 분석 없음");
    expect(html).toContain("연습 마치고 확인하기");
  });

  it("renders feedback without scores or ranking", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="safe-feedback" />);
    expect(html).toContain("첫 연습을 마쳤어요");
    expect(html).toContain("다음 행동 한 가지");
    expect(html).toContain("나만 보관");
    expect(html).toContain("오늘 연습 마치기");
    expect(html).toContain("점수 대신");
    expect(html).not.toContain("100점");
    expect(html).not.toContain("순위");
  });

  it("renders the focused creation form", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="create" />);
    expect(html).toContain("어떤 발표를 만들까요?");
    expect(html).toContain("핵심 메시지");
    expect(html).toContain("구성 확인");
    expect(html).toContain("PPTX를 첨부하면 기존 디자인을 참고할 수 있어요.");
  });

  it("renders the story review step before practice", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="editor" />);
    expect(html).toContain("구조와 핵심 메시지만");
    expect(html).toContain("발표 흐름");
    expect(html).toContain("연습에 필요한 내용은 준비됐어요");
    expect(html).toContain("60초 연습 준비");
  });

  it("renders a full rehearsal without new scoring", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="rehearsal" />);
    expect(html).toContain("처음부터 끝까지");
    expect(html).toContain("시간과 핵심 메시지만 점검");
    expect(html).toContain("전체 리허설 시작");
    expect(html).toContain("리허설 마치고 다음 행동 보기");
  });

  it("renders the microphone permission check before rehearsal", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="microphone-check" />);
    expect(html).toContain("내 목소리가 잘 들리는지 확인해요.");
    expect(html).toContain("마이크 권한 허용하기");
    expect(html).toContain("준비 체크");
  });

  it("renders the project access request and pending flow", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="project-request" />);
    expect(html).toContain("이 프로젝트에 참여하려면");
    expect(html).toContain("접근 권한 요청");
    expect(html).toContain("보기 전용");
  });

  it("renders the presenter mode controls", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="presenter" />);
    expect(html).toContain("발표자 모드");
    expect(html).toContain("현재 슬라이드");
    expect(html).toContain("다음 슬라이드");
    expect(html).toContain("발표 메모");
    expect(html).toContain("발표 종료");
  });

  it("renders the rehearsal-to-report transition", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="rehearsal-complete" />);
    expect(html).toContain("리허설을 잘 마쳤어요.");
    expect(html).toContain("AI 리포트 준비 완료");
    expect(html).toContain("리포트 확인하기");
  });

  it("renders the rehearsal report list", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="reports" />);
    expect(html).toContain("리허설 리포트");
    expect(html).toContain(">홈</button>");
    expect(html).toContain("프로젝트 종합 리포트");
    expect(html).toContain("종합 리포트 보기");
    expect(html).toContain("결론 CTA 명확히 말하기");
  });

  it("renders the action-led full rehearsal result", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="report" />);
    expect(html).toContain("전체 흐름을 확인했어요");
    expect(html).toContain("발표 전 바꿀 행동 한 가지");
    expect(html).toContain("발표 준비로 이동");
    expect(html).not.toContain("100점");
  });

  it("renders the project-level rehearsal report", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="report-project" />);
    expect(html).toContain("프로젝트 종합 리포트");
    expect(html).toContain("회차별 변화");
    expect(html).toContain("다음 연습 목표");
  });

  it("renders the live audience presentation screen", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="live" />);
    expect(html).toContain("청중 화면 연결됨");
    expect(html).toContain("청중 12명 참여 중");
    expect(html).toContain("발표자 모드");
  });

  it("renders the final presentation readiness screen", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="live-presenter" />);
    expect(html).toContain("평가 없이 발표에만");
    expect(html).toContain("실전 화면 점검");
    expect(html).toContain("청중 입장 링크");
    expect(html).toContain("발표 시작");
  });

  it("renders the private post-presentation reflection", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="journey-complete" />);
    expect(html).toContain("발표를 마쳤어요");
    expect(html).toContain("오늘 해낸 것");
    expect(html).toContain("오늘 발표는 어땠나요");
    expect(html).toContain("홈으로 돌아가기");
  });

  it("renders the login mockup", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="login" />);
    expect(html).toContain("다시 만나서 반가워요.");
    expect(html).toContain("Google로 계속하기");
    expect(html).toContain("로그인 상태 유지");
  });

  it("renders the signup mockup", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="signup" />);
    expect(html).toContain("첫 발표를 시작해 볼까요?");
    expect(html).toContain("Google로 가입하기");
    expect(html).toContain("무료로 시작하기");
  });

  it("renders the missing-surface catalog", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="catalog" />);
    expect(html).toContain("화면 밖에 있던 기능");
    expect(html).toContain("발표 브리프 · 평가 관점");
    expect(html).not.toContain("AI PPT 상세 위저드");
  });

  it("renders the purpose and source setup step", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="brief" />);
    expect(html).toContain("누구에게 무엇을 남길지");
    expect(html).toContain("발표 목적");
    expect(html).toContain("시작 자료");
    expect(html).toContain("발표 구조 확인하기");
  });

  it("renders the adaptive practice plan mockup", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="practice-plan" />);
    expect(html).toContain("다음 연습은 이 세 가지에 집중하세요.");
    expect(html).toContain("선택한 구간 연습");
  });

  it("renders the focused practice mockup", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="focused-practice" />);
    expect(html).toContain("한 구간만 짧게 반복하세요.");
    expect(html).toContain("반복 기록");
  });

  it("renders the challenge Q&A mockup", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="challenge-qna" />);
    expect(html).toContain("질문 하나에 집중해 답해 보세요.");
    expect(html).toContain("음성 답변 시작");
  });

  it("renders the audience entrance mockup", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="audience" />);
    expect(html).toContain("청중 입장");
    expect(html).toContain("4자리 비밀번호");
  });

  it("renders the editor version history mockup", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="version-history" />);
    expect(html).toContain("이전 작업을 확인하고 안전하게 복원하세요.");
    expect(html).toContain("이 버전 복원");
  });
});
