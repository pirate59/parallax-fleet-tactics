import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the Parallax main menu", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Parallax — 3D Fleet Tactics<\/title>/i);
  assert.match(html, /PARALLAX/);
  assert.match(html, /Fleet tactics command/);
  assert.match(html, /SELECT/);
  assert.match(html, /OPERATION/);
  assert.match(html, /Story Mode/);
  assert.match(html, /data-game-mode="story"/);
  assert.match(html, /data-story-gates="10"/);
  assert.match(html, /Escape campaign/i);
  assert.match(html, /10 warp gates/i);
  assert.match(html, /Campaign ready/i);
  assert.match(html, /Skirmish Mode/);
  assert.match(html, /Endless Mode/);
  assert.match(html, /Hardcore Mode/);
  assert.match(html, /Fishtank Mode/);
  assert.match(html, /data-game-mode="fishtank"/);
  assert.match(html, /Automated simulation ready/i);
  assert.match(html, /Sound effects/);
  assert.match(html, /Music/);
  assert.match(html, /INITIALIZE\s*(?:<!-- -->)?SKIRMISH MODE/);
  assert.doesNotMatch(html, /All four entries currently launch/i);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/i);
});
