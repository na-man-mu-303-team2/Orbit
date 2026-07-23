import { expect, test, type Page, type Route } from "@playwright/test";
import {
  createDemoDeck,
  sanitizeCommunityTemplate,
} from "../../packages/editor-core/src";

const privateTerms = [
  "PRIVATE_TEMPLATE_MARKER_9f31",
  "speakerNotes",
  "transcript",
  "rawAudio",
  "deckSnapshot",
  "ownerUserId",
];
const snapshot = sanitizeCommunityTemplate(createDemoDeck());
const initialCard = createCard(
  "community_template_existing",
  "기존 교육 템플릿",
  "education",
);
const publishedCard = createCard(
  "community_template_published",
  "팀 회고 템플릿",
  "business",
);
const ownerSource = {
  projectId: "project_publish_source",
  title:
    "매우 긴 원본 프로젝트 제목이 publish dialog 폭을 넘어도 안전하게 처리됩니다",
  createdAt: "2026-07-20T00:00:00.000Z",
};

test.describe("community template gallery publish", () => {
  test("validates, retries, publishes, refreshes, and preserves the privacy boundary", async ({
    page,
  }) => {
    const browserErrors: string[] = [];
    const pageErrors: string[] = [];
    const publishBodies: unknown[] = [];
    const publishReleases: Array<() => void> = [];
    const listRequests: string[] = [];
    let publishAttempts = 0;
    let projectRequests = 0;
    let published = false;

    page.on("console", (message) => {
      if (message.type() === "error" || message.type() === "warning") {
        browserErrors.push(message.text());
      }
    });
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.setViewportSize({ width: 1024, height: 768 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.route("**/api/v1/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());

      if (url.pathname === "/api/v1/auth/me") {
        return json(route, {
          userId: "user_demo_1",
          email: "qa@orbit.test",
          displayName: "QA 사용자",
        });
      }
      if (url.pathname.endsWith("/projects") && request.method() === "GET") {
        projectRequests += 1;
        return json(route, []);
      }
      if (url.pathname === "/api/v1/community-templates/recent") {
        return json(route, { items: [] });
      }
      if (url.pathname === "/api/v1/community-templates") {
        listRequests.push(url.search);
        return json(route, {
          items: published ? [publishedCard, initialCard] : [initialCard],
          page: Number(url.searchParams.get("page") ?? 1),
          hasMore: false,
        });
      }
      if (
        request.method() === "POST" &&
        /^\/api\/v1\/workspaces\/[^/]+\/community-templates$/.test(url.pathname)
      ) {
        const attempt = ++publishAttempts;
        publishBodies.push(request.postDataJSON());
        await new Promise<void>((resolve) => publishReleases.push(resolve));
        if (attempt === 1) {
          return json(route, { malformed: true });
        }
        published = true;
        return json(route, { template: publishedCard }, 201);
      }
      if (url.pathname.endsWith("/community-templates/sources")) {
        return json(route, { items: [ownerSource] });
      }
      return route.fulfill({ status: 204, body: "" });
    });

    await page.goto("/");
    await page.getByRole("button", { name: "전체보기" }).click();
    const gallery = page.getByRole("dialog", { name: "커뮤니티 템플릿" });
    await expect(gallery).toBeVisible();
    const publishCta = gallery.getByRole("button", {
      name: "내 슬라이드 올리기",
      exact: true,
    });
    await publishCta.click();

    const dialog = page.getByRole("dialog", { name: "내 슬라이드 올리기" });
    await expect(dialog).toBeVisible();
    const titleInput = dialog.getByRole("textbox", { name: "템플릿 이름" });
    await expect(titleInput).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(
      await dialog.evaluate((element) =>
        element.contains(document.activeElement),
      ),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(publishCta).toBeFocused();

    await publishCta.click();
    await expect(titleInput).toBeFocused();
    await page
      .locator(".redesign-dialog-backdrop")
      .last()
      .click({
        position: { x: 4, y: 4 },
      });
    await expect(dialog).toBeHidden();
    await expect(publishCta).toBeFocused();

    await publishCta.click();
    await expect(titleInput).toBeFocused();
    await expect(
      dialog.getByRole("radio", { name: new RegExp(ownerSource.title) }),
    ).toHaveCount(1);
    await expect(
      dialog.locator(".community-template-source-option strong"),
    ).toHaveCSS("text-overflow", "ellipsis");
    const rights = dialog.getByRole("checkbox", {
      name: "공개 가능한 디자인이며 공유할 권리를 보유하고 있습니다.",
    });
    await expect(rights).not.toBeChecked();

    await dialog.getByRole("button", { name: "커뮤니티에 등록" }).click();
    await expect(
      dialog.locator("#community-template-publish-source"),
    ).toBeFocused();
    expect(publishBodies).toHaveLength(0);

    const sourceRadio = dialog.getByRole("radio", {
      name: new RegExp(ownerSource.title),
    });
    await sourceRadio.focus();
    await page.keyboard.press("Space");
    await titleInput.focus();
    await page.keyboard.type("팀 회고 템플릿");
    const category = dialog.getByRole("combobox", { name: "카테고리" });
    await category.selectOption("business");

    await dialog.getByRole("button", { name: "커뮤니티에 등록" }).click();
    await expect(dialog.getByText("공개 권리를 확인해 주세요.")).toBeVisible();
    expect(publishBodies).toHaveLength(0);

    await rights.focus();
    await page.keyboard.press("Space");
    const projectRequestsBeforePublish = projectRequests;
    const submitButton = dialog.getByRole("button", {
      name: "커뮤니티에 등록",
    });
    await submitButton.focus();
    await page.keyboard.press("Enter");
    await expect.poll(() => publishAttempts).toBe(1);
    const loadingButton = dialog.locator('button[aria-busy="true"]');
    await expect(loadingButton).toHaveAttribute("aria-busy", "true");
    await expect(loadingButton).toContainText("등록 중");
    await expect(loadingButton.locator(".redesign-button-spinner")).toHaveCSS(
      "animation-duration",
      "0s",
    );
    await expect(dialog.getByRole("button", { name: "닫기" })).toBeDisabled();
    await expect(sourceRadio).toBeDisabled();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeVisible();
    await page
      .locator(".redesign-dialog-backdrop")
      .last()
      .click({
        position: { x: 4, y: 4 },
      });
    await expect(dialog).toBeVisible();
    publishReleases.shift()?.();

    await expect(
      dialog.getByText(
        "커뮤니티 템플릿을 등록하지 못했습니다. 다시 시도해 주세요.",
      ),
    ).toBeVisible();
    await expect(titleInput).toHaveValue("팀 회고 템플릿");
    await expect(sourceRadio).toBeChecked();
    await expect(category).toHaveValue("business");
    await expect(rights).toBeChecked();

    await dialog.getByRole("button", { name: "커뮤니티에 등록" }).dblclick();
    await expect(dialog.getByRole("button", { name: "등록 중" })).toBeVisible();
    await expect.poll(() => publishAttempts).toBe(2);
    await page.waitForTimeout(200);
    expect(publishAttempts).toBe(2);
    publishReleases.shift()?.();
    await expect(dialog).toBeHidden();
    await expect(gallery).toBeVisible();
    await expect(
      page.getByRole("status").filter({ hasText: "팀 회고 템플릿" }),
    ).toContainText("커뮤니티에 등록했어요.");
    await expect(
      gallery.getByRole("button", {
        name: "팀 회고 템플릿 템플릿으로 바로 시작",
      }),
    ).toBeVisible();
    await expect(
      gallery.getByRole("button", {
        name: "내 슬라이드 올리기",
        exact: true,
      }),
    ).toBeFocused();

    expect(publishAttempts).toBe(2);
    expect(publishBodies).toEqual([
      {
        sourceProjectId: ownerSource.projectId,
        title: "팀 회고 템플릿",
        category: "business",
        rightsConfirmed: true,
      },
      {
        sourceProjectId: ownerSource.projectId,
        title: "팀 회고 템플릿",
        category: "business",
        rightsConfirmed: true,
      },
    ]);
    expect(projectRequests).toBe(projectRequestsBeforePublish);
    expect(listRequests.length).toBeGreaterThanOrEqual(3);
    expect(JSON.stringify(publishBodies)).not.toMatch(
      /snapshot|preview|deck|owner|speaker|transcript|audio/i,
    );
    const dom = await page.locator("body").innerText();
    for (const term of privateTerms) {
      expect(dom).not.toContain(term);
      expect(browserErrors.join("\n")).not.toContain(term);
    }
    expect(browserErrors).toEqual([]);
    expect(pageErrors).toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth > window.innerWidth,
      ),
    ).toBe(false);
  });

  for (const viewport of [
    { width: 1440, height: 1024 },
    { width: 1024, height: 768 },
  ]) {
    test(`keeps the publish dialog inside ${viewport.width}x${viewport.height}`, async ({
      page,
    }, testInfo) => {
      await page.setViewportSize(viewport);
      await installReadOnlyRoutes(page);
      await page.goto("/");
      await page.getByRole("button", { name: "전체보기" }).click();
      await page
        .getByRole("dialog", { name: "커뮤니티 템플릿" })
        .getByRole("button", { name: "내 슬라이드 올리기", exact: true })
        .click();
      const dialog = page.getByRole("dialog", { name: "내 슬라이드 올리기" });
      const box = await dialog.boundingBox();

      expect(box).not.toBeNull();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.y).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width);
      expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
      ).toBe(false);
      await page.screenshot({
        fullPage: true,
        path: testInfo.outputPath(
          `publish-dialog-${viewport.width}x${viewport.height}.png`,
        ),
      });
    });
  }
});

async function installReadOnlyRoutes(page: Page) {
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/v1/auth/me") {
      return json(route, { userId: "user_demo_1", email: "qa@orbit.test" });
    }
    if (url.pathname.endsWith("/projects")) return json(route, []);
    if (url.pathname === "/api/v1/community-templates/recent") {
      return json(route, { items: [] });
    }
    if (url.pathname === "/api/v1/community-templates") {
      return json(route, { items: [initialCard], page: 1, hasMore: false });
    }
    if (url.pathname.endsWith("/community-templates/sources")) {
      return json(route, { items: [ownerSource] });
    }
    return route.fulfill({ status: 204, body: "" });
  });
}

function createCard(
  templateId: string,
  title: string,
  category: "business" | "education" | "portfolio" | "event",
) {
  return {
    templateId,
    title,
    category,
    preview: {
      canvas: snapshot.canvas,
      theme: snapshot.theme,
      slide: snapshot.slides[0],
    },
    createdAt: "2026-07-21T00:00:00.000Z",
  };
}

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}
