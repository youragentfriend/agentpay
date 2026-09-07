import assert from "node:assert/strict";
import test from "node:test";
import { directChildEnvironment } from "../lib/server/direct-network";

test("removes run-bound proxy variables from ordinary provider subprocesses", () => {
  const environment = directChildEnvironment({
    NODE_ENV: "test",
    PATH: "/usr/bin",
    HTTP_PROXY: "http://proxy.invalid",
    HTTPS_PROXY: "http://proxy.invalid",
    NODE_USE_ENV_PROXY: "1",
    GEMINI_API_KEY: "protected-sentinel",
  });
  assert.equal(environment.PATH, "/usr/bin");
  assert.equal(environment.GEMINI_API_KEY, "protected-sentinel");
  assert.equal(environment.HTTP_PROXY, undefined);
  assert.equal(environment.HTTPS_PROXY, undefined);
  assert.equal(environment.NODE_USE_ENV_PROXY, undefined);
});
