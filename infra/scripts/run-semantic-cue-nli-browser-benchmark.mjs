import { chromium } from "@playwright/test";

const args = process.argv.slice(2).filter((value) => value !== "--");
const baseUrl = args[0] ?? "http://127.0.0.1:5173";
const loadTimeoutArgument = args.find((value) =>
  value.startsWith("--load-timeout-ms="),
);
const loadTimeoutMs = Number(loadTimeoutArgument?.split("=")[1] ?? 45_000);
const devices = args
  .slice(1)
  .filter((value) => ["webgpu", "wasm"].includes(value));
const matrix = devices.length > 0 ? devices : ["webgpu", "wasm"];
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-webgpu", "--enable-features=Vulkan"],
});
const results = [];

try {
  for (const device of matrix) {
    const page = await browser.newPage();
    const consoleIssues = [];
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type())) {
        consoleIssues.push({ type: message.type(), text: message.text() });
      }
    });
    await page.goto(
      `${baseUrl}/semantic-cue-nli-benchmark.html?device=${device}&loadTimeoutMs=${loadTimeoutMs}&inferenceTimeoutMs=5000`,
      { waitUntil: "domcontentloaded" },
    );
    await page.waitForFunction(
      () => document.querySelector("#status")?.dataset.state !== "running",
      null,
      { timeout: loadTimeoutMs + 20_000 },
    );
    const status = await page.locator("#status").getAttribute("data-state");
    const rawResult = await page.locator("#result").textContent();
    results.push({
      device,
      status,
      result: rawResult ? JSON.parse(rawResult) : null,
      consoleIssues,
    });
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(JSON.stringify(results, null, 2));
