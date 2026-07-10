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

  it("renders the authenticated project hub without the generation form", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="home" />);
    expect(html).toContain("김지윤님, 다음 발표를 이어가세요.");
    expect(html).toContain("AI 발표자료 만들기");
    expect(html).toContain("2026 하반기 제품 전략");
    expect(html).not.toContain("핵심 메시지");
  });

  it("renders the focused creation form", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="create" />);
    expect(html).toContain("어떤 발표를 만들까요?");
    expect(html).toContain("핵심 메시지");
    expect(html).toContain("구성 확인");
    expect(html).toContain("PPTX를 첨부하면 기존 디자인을 참고할 수 있어요.");
  });

  it("renders the editor mockup with the primary editing flow", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="editor" />);
    expect(html).toContain("2026 하반기 제품 전략");
    expect(html).toContain("슬라이드 추가");
    expect(html).toContain("AI 코치");
    expect(html).toContain("공유");
    expect(html).toContain("발표하기");
    expect(html).toContain("제안 적용");
  });

  it("renders the rehearsal workspace with live coaching", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="rehearsal" />);
    expect(html).toContain("AI 리허설 코치");
    expect(html).toContain("발표 스크립트");
    expect(html).toContain("리허설 시작");
    expect(html).toContain("화면 설정");
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

  it("renders the rehearsal report detail", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="report" />);
    expect(html).toContain("4회차 리허설 리포트");
    expect(html).toContain("AI 총평");
    expect(html).toContain("다음에 개선할 점");
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

  it("renders the live presenter controls", () => {
    const html = renderToStaticMarkup(<OrbitMockupFlow onNavigate={vi.fn()} screen="live-presenter" />);
    expect(html).toContain("현재 슬라이드");
    expect(html).toContain("발표 메모");
    expect(html).toContain("청중 연결");
    expect(html).toContain("발표 종료");
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
});
