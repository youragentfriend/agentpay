const PROXY_ENVIRONMENT_KEYS = [
  "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY",
  "http_proxy", "https_proxy", "all_proxy", "no_proxy",
  "NODE_USE_ENV_PROXY", "npm_config_proxy", "npm_config_https_proxy", "npm_config_noproxy",
] as const;

/** Prevent non-Gemini provider subprocesses from inheriting OpenClaw's run-bound secret proxy. */
export function directChildEnvironment(source: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  const environment = { ...source };
  for (const key of PROXY_ENVIRONMENT_KEYS) delete environment[key];
  return environment;
}
