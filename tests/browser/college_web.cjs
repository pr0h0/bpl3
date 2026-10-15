// Run in the pinned Playwright container documented in the college app README.
// Local synthetic accounts only. Tokens/cookies are never written to the report.
const { chromium, firefox } = require("playwright");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const origin = process.env.BPL_BROWSER_ORIGIN || "http://127.0.0.1:31947";
if (!/^https?:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin))
  throw new Error("Browser regression requires an explicit loopback origin");
const results = [];
(async () => {
  for (const [name, engine] of [
    ["chromium", chromium],
    ["firefox", firefox],
  ]) {
    const browser = await engine.launch({ headless: true });
    try {
      const context = await browser.newContext({
        ignoreHTTPSErrors: process.env.BPL_BROWSER_SELF_SIGNED === "1",
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      const navigation = await page.goto(origin);
      assert.equal(navigation.headers()["x-frame-options"], "DENY");
      assert.match(
        navigation.headers()["content-security-policy"],
        /frame-ancestors 'none'/,
      );
      await page.locator("#auth").waitFor({ state: "visible" });
      const username = `browser_${name}_${Date.now().toString(36)}`;
      await page.getByLabel("Username", { exact: true }).fill(username);
      await page
        .getByLabel("Password", { exact: true })
        .fill("correct-browser-test-password");
      await page
        .getByRole("button", { name: "Create account", exact: true })
        .click();
      await page.locator("#board").waitFor({ state: "visible" });
      await page
        .getByRole("button", { name: "Add task", exact: true })
        .waitFor({ state: "visible" });
      const marker = '<img src=x onerror="window.__bplMarker=1">';
      await page.getByLabel("New task", { exact: true }).fill(marker);
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      await page.getByText(marker, { exact: true }).waitFor();
      assert.equal(await page.locator("#tasks img").count(), 0);
      assert.equal(await page.evaluate(() => window.__bplMarker), undefined);
      assert.equal(
        await page.evaluate(() => document.cookie.includes("bpl_session")),
        false,
      );
      const cookies = await context.cookies();
      assert.equal(
        cookies.find((cookie) => cookie.name === "bpl_session").httpOnly,
        true,
      );
      assert.equal(
        cookies.find((cookie) => cookie.name === "bpl_session").sameSite,
        "Strict",
      );
      if (origin.startsWith("https://"))
        assert.equal(
          cookies.find((cookie) => cookie.name === "bpl_session").secure,
          true,
        );
      await page.reload();
      await page.getByText(marker, { exact: true }).waitFor();
      await page.getByRole("button", { name: "Complete", exact: true }).click();
      await page.getByRole("button", { name: "Reopen", exact: true }).waitFor();
      await page.getByLabel("New task", { exact: true }).fill("λ".repeat(61));
      await page.getByRole("button", { name: "Add task", exact: true }).click();
      await page.waitForFunction(() =>
        document.querySelector("#status").textContent.includes("length"),
      );
      await page.setViewportSize({ width: 390, height: 844 });
      assert.equal(
        await page.evaluate(
          () => document.documentElement.scrollWidth > window.innerWidth,
        ),
        false,
      );
      if (process.env.BPL_BROWSER_EVIDENCE)
        await page.screenshot({
          path: `${process.env.BPL_BROWSER_EVIDENCE}/${name}-board.png`,
          fullPage: true,
        });
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      await page.getByText("No tasks on this page.", { exact: true }).waitFor();
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await page.locator("#auth").waitFor({ state: "visible" });
      await page.getByLabel("Username", { exact: true }).fill(username);
      await page
        .getByLabel("Password", { exact: true })
        .fill("incorrect-browser-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.waitForFunction(() =>
        document
          .querySelector("#status")
          .textContent.includes("invalid username or password"),
      );
      await page
        .getByLabel("Password", { exact: true })
        .fill("correct-browser-test-password");
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await page.locator("#board").waitFor({ state: "visible" });
      assert.deepEqual(errors, []);
      results.push({
        browser: name,
        version: browser.version(),
        passed: true,
        checks: [
          "HTML security headers",
          "registration",
          "literal markup",
          "HttpOnly cookie",
          "reload session",
          "task completion",
          "UTF-8 byte validation",
          "mobile width",
          "delete",
          "logout",
          "wrong password",
          "login",
        ],
        pageErrors: errors,
      });
      await context.close();
    } finally {
      await browser.close();
    }
  }
  if (process.env.BPL_BROWSER_EVIDENCE)
    fs.writeFileSync(
      `${process.env.BPL_BROWSER_EVIDENCE}/results.json`,
      JSON.stringify(results, null, 2),
    );
  process.stdout.write(JSON.stringify(results, null, 2) + "\n");
})().catch((error) => {
  process.stderr.write(error.stack + "\n");
  process.exitCode = 1;
});
