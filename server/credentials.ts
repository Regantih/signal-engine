/**
 * Shared credential manager for external-tool CLI calls.
 * The site proxy refreshes ASI_EXTERNAL_TOOLS_KEY on each incoming request.
 * This module captures the latest credentials so background tasks can use them.
 */

let cachedEnv: Record<string, string> = {};

// Call this from Express middleware on every incoming request
export function captureCredentials() {
  const key = process.env.ASI_EXTERNAL_TOOLS_KEY;
  const endpoint = process.env.ASI_EXTERNAL_TOOLS_ENDPOINT;
  if (key) cachedEnv.ASI_EXTERNAL_TOOLS_KEY = key;
  if (endpoint) cachedEnv.ASI_EXTERNAL_TOOLS_ENDPOINT = endpoint;
}

// Get the env object to pass to execSync
export function getExecEnv(): Record<string, string | undefined> {
  return { ...process.env, ...cachedEnv };
}

// Get just the latest key for logging
export function getCredentialStatus(): { hasKey: boolean; keyPrefix: string } {
  const key = cachedEnv.ASI_EXTERNAL_TOOLS_KEY || process.env.ASI_EXTERNAL_TOOLS_KEY || "";
  return { hasKey: key.length > 0, keyPrefix: key.slice(0, 15) };
}
