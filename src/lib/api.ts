import { dispatchFirebaseApi } from './firebaseBackend';

const TOKEN_STORAGE_KEY = 'aurvan_session_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null): void {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage quota errors
  }
}

export class ApiError extends Error {
  status: number;
  details?: any;
  constructor(message: string, status: number, details?: any) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export async function apiFetch<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  if (path.startsWith('/api/')) {
    try {
      return await dispatchFirebaseApi<T>(path, options);
    } catch (err: any) {
      let message = err?.message || 'Cloud service request failed.';
      try {
        const parsed = JSON.parse(message);
        if (parsed && typeof parsed.error === 'string') {
          message = parsed.error;
        }
      } catch {
        // Plain error message
      }
      throw new ApiError(message, err?.status || 400, err);
    }
  }

  const token = getStoredToken();
  const headers = new Headers(options.headers || {});

  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  if (!isFormData && options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(path, {
    ...options,
    headers,
    credentials: 'include',
  });

  const contentType = response.headers.get('content-type') || '';
  const isJson = contentType.includes('application/json');
  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      (typeof data === 'object' && data && (data.error || data.message)) ||
      `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}
