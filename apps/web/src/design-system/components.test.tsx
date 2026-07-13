import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  OrbitButton,
  OrbitColorBlock,
  OrbitDialog,
  OrbitEmptyState,
  OrbitField,
  OrbitIconButton,
  OrbitInput,
  OrbitStatus,
  OrbitTabs
} from "./components";

describe("ORBIT design-system primitives", () => {
  it("renders the requested button hierarchy", () => {
    const html = renderToStaticMarkup(
      <>
        <OrbitButton>Primary</OrbitButton>
        <OrbitButton variant="secondary">Secondary</OrbitButton>
        <OrbitButton variant="quiet">Quiet</OrbitButton>
      </>
    );

    expect(html).toContain("orbit-ds-button-primary");
    expect(html).toContain("orbit-ds-button-secondary");
    expect(html).toContain("orbit-ds-button-quiet");
  });

  it("renders semantic status and large color-block tones", () => {
    const html = renderToStaticMarkup(
      <>
        <OrbitStatus tone="lilac">편집 중</OrbitStatus>
        <OrbitColorBlock icon={<span>icon</span>} tone="lime">
          템플릿에서 시작
        </OrbitColorBlock>
      </>
    );

    expect(html).toContain("orbit-ds-status-lilac");
    expect(html).toContain("orbit-ds-color-block-lime");
  });

  it("connects field labels, descriptions, and errors", () => {
    const html = renderToStaticMarkup(
      <OrbitField error="이메일 형식을 확인하세요." id="email" label="이메일">
        <OrbitInput type="email" />
      </OrbitField>
    );

    expect(html).toContain('for="email"');
    expect(html).toContain('id="email"');
    expect(html).toContain('aria-describedby="email-helper"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
  });

  it("renders labeled icon actions and a controlled tab panel", () => {
    const html = renderToStaticMarkup(
      <>
        <OrbitIconButton aria-label="검색">icon</OrbitIconButton>
        <OrbitTabs
          activeTab="members"
          ariaLabel="공유 정보"
          onChange={() => undefined}
          tabs={[
            { id: "members", label: "함께 작업 중" },
            { id: "requests", label: "승인 요청" }
          ]}
        >
          참여자 목록
        </OrbitTabs>
      </>
    );

    expect(html).toContain('aria-label="검색"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("참여자 목록");
  });

  it("renders dialog and empty-state semantics", () => {
    const html = renderToStaticMarkup(
      <>
        <OrbitDialog description="프로젝트 권한을 관리합니다." onClose={() => undefined} open title="공유">
          공유 설정
        </OrbitDialog>
        <OrbitEmptyState description="새 프로젝트를 만들어 시작하세요." title="프로젝트가 없습니다." />
      </>
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain("프로젝트 권한을 관리합니다.");
    expect(html).toContain('role="status"');
  });
});
