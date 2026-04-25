import { QueryClient, QueryFunction } from "@tanstack/react-query";

// getApiBase() is called lazily per-request so window.__API_BASE__ is always
// read after the inline script in index.html has executed.
// deploy_website rewrites __PORT_5000__ → absolute backend proxy URL at deploy time.
// In local dev the inline script falls through to "", so relative URLs are used.
declare const __PORT_5000__: string;
function getApiBase(): string {
  const base = (typeof window !== "undefined") ? (window as any).__API_BASE__ : "";
  return (base && base !== "__PORT_5000__") ? base : "";
}

// Module-level auth token (not localStorage — blocked in sandboxed iframe)
let authToken: string | null = null;

export function setAuthToken(token: string | null) { authToken = token; }
export function getAuthToken(): string | null { return authToken; }

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${getApiBase()}${url}`, {
    method,
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
    },
    body: data ? JSON.stringify(data) : undefined,
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const path = queryKey.join("/").replace(/\/\/+/g, "/");
    const res = await fetch(`${getApiBase()}${path}`, {
      headers: {
        ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
      },
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
