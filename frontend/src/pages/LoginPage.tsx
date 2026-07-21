/**
 * 로그인 페이지 — Figma 로그인_화면 80% 기준 ver3 (node 3213:34650).
 *
 * 전체 배경 일러스트 + 왼쪽 흰 패널(845px)에 로그인 폼.
 */
import { useState, type FormEvent } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { isAuthenticated, login } from "../utils/auth";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated()) {
    return <Navigate to="/" replace />;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    const ok = login(email, password);
    setSubmitting(false);
    if (!ok) {
      setError("이메일 또는 비밀번호가 올바르지 않습니다.");
      return;
    }
    navigate("/", { replace: true });
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-coolgray-20">
      <img
        src="/login-bg.png"
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-right"
      />

      <div className="relative z-10 flex min-h-screen">
        <div className="flex min-h-screen w-full max-w-[845px] flex-col bg-white rounded-tr-[50px] rounded-br-[50px]">
          <form
            onSubmit={handleSubmit}
            className="flex flex-1 flex-col justify-center px-[140px] py-16 max-lg:px-10"
            aria-label="로그인"
          >
            <h1 className="mb-[72px] text-[32px] font-bold leading-[1.1] text-black">로그인</h1>

            <div className="w-full max-w-[575px]">
              <label className="block">
                <span className="mb-[9px] block text-base leading-[1.4] text-[#9d9d9d]">Email</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full border-0 border-b border-coolgray-30 bg-transparent pb-[11px] text-base text-coolgray-90 outline-none focus:border-primary-60"
                  required
                />
              </label>

              <label className="mt-[38px] block">
                <span className="mb-[9px] block text-base leading-[1.4] text-[#9d9d9d]">Password</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full border-0 border-b border-coolgray-30 bg-transparent pb-[11px] text-base text-coolgray-90 outline-none focus:border-primary-60"
                  required
                />
              </label>

              {error && (
                <p className="mt-4 text-sm text-alert" role="alert">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="mt-[44px] h-[60px] w-full rounded-lg bg-primary-60 text-xl font-medium tracking-[0.5px] text-white hover:bg-primary-90 disabled:opacity-50 transition-colors"
              >
                {submitting ? "로그인 중..." : "로그인"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
