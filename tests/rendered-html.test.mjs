import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the RandomCam welcome screen", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>RandomCam — Random Video Chat<\/title>/i);
  assert.match(html, /RANDOM VIDEO CHAT/);
  assert.match(html, /Meet someone new,/);
  assert.match(html, /Adults only · 18\+/);
  assert.match(html, /Start chatting/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("keeps the entry flow and safety copy in the shipped source", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /navigator\.mediaDevices\.getUserMedia/);
  assert.match(page, /confirmedAdult/);
  assert.match(page, /screen === "waiting"/);
  assert.match(page, /Nudity, harassment and solicitation are prohibited/);
  assert.match(layout, /RandomCam — Random Video Chat/);
  assert.match(packageJson, /"build":/);
  assert.match(packageJson, /"deploy":/);
  assert.doesNotMatch(page, /codex-preview|SkeletonPreview|react-loading-skeleton/i);
});
