/**
 * Credential manager — no-op for local mode.
 * Yahoo Finance requires no API keys, so this module is kept as a
 * compatible stub so existing imports don't break.
 */

export function captureCredentials() {
  // No-op: Yahoo Finance needs no credentials
}

export function getExecEnv(): Record<string, string | undefined> {
  return { ...process.env };
}

export function getCredentialStatus(): { hasKey: boolean; keyPrefix: string } {
  return { hasKey: true, keyPrefix: "yahoo-finance" };
}
