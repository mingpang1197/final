export const USERS_STORAGE_KEY = "easyread-users";
const AUTH_FLAG_KEY = "easyread-auth";
const AUTH_USER_KEY = "easyread-auth-user";

function authStorage(): Storage {
  return sessionStorage;
}

/** 이전 localStorage 세션 키 정리 (탭 종료 시 로그아웃 정책 전환) */
function clearLegacyAuthStorage(): void {
  try {
    localStorage.removeItem(AUTH_FLAG_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
  } catch {
    /* ignore */
  }
}

clearLegacyAuthStorage();

export type UserRole = "admin" | "user";

export interface StoredUser {
  name: string;
  email: string;
  password: string;
  createdAt: string;
  role?: UserRole;
}

/** 배포 시 항상 사용 가능한 내장 관리자 (브라우저 localStorage에 병합) */
const BUILTIN_USERS: StoredUser[] = [
  {
    name: "관리자",
    email: "solar123",
    password: "solar123",
    role: "admin",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
];

function ensureBuiltinUsers(users: StoredUser[]): StoredUser[] {
  let changed = false;
  const next = [...users];
  for (const builtin of BUILTIN_USERS) {
    const key = builtin.email.toLowerCase();
    const idx = next.findIndex((u) => u.email.toLowerCase() === key);
    if (idx < 0) {
      next.push(builtin);
      changed = true;
      continue;
    }
    const merged: StoredUser = {
      ...next[idx],
      name: builtin.name,
      password: builtin.password,
      role: "admin",
    };
    if (
      next[idx].name !== merged.name ||
      next[idx].password !== merged.password ||
      next[idx].role !== merged.role
    ) {
      next[idx] = merged;
      changed = true;
    }
  }
  if (changed) {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export interface AuthSession {
  email: string;
  name: string;
  loggedInAt: number;
}

export function readUsers(): StoredUser[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) return ensureBuiltinUsers([]);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const users = parsed.filter((item): item is StoredUser => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<StoredUser>;
      return (
        typeof candidate.name === "string" &&
        typeof candidate.email === "string" &&
        typeof candidate.password === "string" &&
        typeof candidate.createdAt === "string"
      );
    });
    return ensureBuiltinUsers(users);
  } catch {
    return ensureBuiltinUsers([]);
  }
}

export function writeUsers(users: StoredUser[]): void {
  localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
}

export function isAuthenticated(): boolean {
  try {
    return authStorage().getItem(AUTH_FLAG_KEY) === "signed-in";
  } catch {
    return false;
  }
}

export function getAuthUserId(): string | null {
  try {
    const userId = authStorage().getItem(AUTH_USER_KEY);
    return userId?.trim() || null;
  } catch {
    return null;
  }
}

export function getAuthSession(): AuthSession | null {
  if (!isAuthenticated()) return null;
  const email = getAuthUserId();
  if (!email) return null;
  const user = readUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
  return {
    email,
    name: user?.name ?? email,
    loggedInAt: Date.now(),
  };
}

export function isAdminUser(email?: string | null): boolean {
  const id = (email ?? getAuthUserId())?.trim().toLowerCase();
  if (!id) return false;
  const user = readUsers().find((u) => u.email.toLowerCase() === id);
  return user?.role === "admin";
}

export function login(userId: string, password: string): boolean {
  const normalized = userId.trim().toLowerCase();
  const matched = readUsers().find(
    (user) => user.email.toLowerCase() === normalized && user.password === password,
  );
  if (!matched) return false;

  clearLegacyAuthStorage();
  authStorage().setItem(AUTH_FLAG_KEY, "signed-in");
  authStorage().setItem(AUTH_USER_KEY, matched.email);
  return true;
}

export function logout(): void {
  clearLegacyAuthStorage();
  authStorage().removeItem(AUTH_FLAG_KEY);
  authStorage().removeItem(AUTH_USER_KEY);
}

export function registerUser(input: {
  name: string;
  email: string;
  password: string;
}): { ok: true } | { ok: false; error: string } {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  const password = input.password;

  if (!name) return { ok: false, error: "이름을 입력해 주세요." };
  if (!email) return { ok: false, error: "아이디를 입력해 주세요." };
  if (!password) return { ok: false, error: "비밀번호를 입력해 주세요." };

  const users = readUsers();
  if (users.some((user) => user.email.toLowerCase() === email)) {
    return { ok: false, error: "이미 가입된 아이디입니다." };
  }

  if (BUILTIN_USERS.some((u) => u.email.toLowerCase() === email)) {
    return { ok: false, error: "사용할 수 없는 아이디입니다." };
  }

  users.push({
    name,
    email,
    password,
    role: "user",
    createdAt: new Date().toISOString(),
  });
  writeUsers(users);
  return { ok: true };
}
