import { QueryClient, QueryFunction } from "@tanstack/react-query";

// window.__API_BASE__ is set in index.html as "__PORT_5000__".
// deploy_website rewrites __PORT_5000__ to the backend proxy path at deploy time.
// In local dev the script sets it to the literal "__PORT_5000__" string which
// we treat as empty (relative URLs work fine locally).
declare const __PORT_5000__: string;
const API_BASE = (typeof window !== "undefined" && (window as any).__API_BASE__ && (window as any).__API_BASE__ !== "__PORT_5000__")
  ? (window as any).__API_BASE__
  : "";

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
  const res = await fetch(`${API_BASE}${url}`, {
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
    const res = await fetch(`${API_BASE}${path}`, {
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
