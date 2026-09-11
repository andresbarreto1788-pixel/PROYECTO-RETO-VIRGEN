export const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
const ADMIN_TOKEN_KEY = "rvp:admin-token";
export const ADMIN_UNAUTHORIZED_EVENT = "rvp:admin-unauthorized";

export class ApiError extends Error {}

async function parseResponse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 401) {
      clearAdminToken();
      window.dispatchEvent(new Event(ADMIN_UNAUTHORIZED_EVENT));
    }
    const message = data && typeof data === "object" && "error" in data ? String(data.error) : `HTTP ${res.status}`;
    throw new ApiError(message);
  }
  return data as T;
}

export async function apiPost<T>(path: string, body: FormData | Record<string, unknown>): Promise<T> {
  const isFormData = body instanceof FormData;
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: isFormData ? undefined : { "Content-Type": "application/json" },
    body: isFormData ? body : JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

function authHeaders(): HeadersInit {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function adminGet<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  return parseResponse<T>(res);
}

export async function adminPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export async function adminPatch<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  });
  return parseResponse<T>(res);
}

export async function adminDownloadExport(): Promise<void> {
  const res = await fetch(`${API_BASE}/api/admin/export`, { headers: authHeaders() });
  if (!res.ok) throw new ApiError(`No se pudo exportar el CSV (HTTP ${res.status}).`);

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "corredores-reto-virgen-de-la-paz.csv";
  link.click();
  URL.revokeObjectURL(url);
}
