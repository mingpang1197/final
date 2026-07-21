const AUTH_KEY = "erai_auth";

export interface AuthSession {
  email: string;
  loggedInAt: number;
}

export const DEMO_EMAIL = "solar123@gmail.com";
export const DEMO_PASSWORD = "solar123";

export function isAuthenticated(): boolean {
  try {
    return Boolean(sessionStorage.getItem(AUTH_KEY));
  } catch {
    return false;
  }
}

export function getAuthSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(AUTH_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthSession;
  } catch {
    return null;
  }
}

export function login(email: string, password: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (normalized !== DEMO_EMAIL || password !== DEMO_PASSWORD) {
    return false;
  }
  const session: AuthSession = { email: normalized, loggedInAt: Date.now() };
  sessionStorage.setItem(AUTH_KEY, JSON.stringify(session));
  return true;
}

export function logout(): void {
  sessionStorage.removeItem(AUTH_KEY);
}

export function validateCredentials(email: string, password: string): boolean {
  return email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD;
}
