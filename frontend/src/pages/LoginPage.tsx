/**
 * 로그인 페이지 — Figma 로그인_화면 80% 기준 ver3.
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
    <div className="min-h-screen bg-coolgray-20 flex items-stretch">
      <div className="relative flex-1 min-w-0 overflow-hidden">
        <img
          src="/login-hero.png"
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-left"
        />
      </div>

      <div className="relative w-full max-w-[845px] shrink-0 bg-white rounded-tl-[50px] rounded-bl-[50px] flex items-center justify-center px-10 py-12">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-[575px]"
          aria-label="로그인"
        >
          <h1 className="text-[32px] font-bold leading-[1.1] text-black mb-10">로그인</h1>

          <label className="block mb-8">
            <span className="sr-only">Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-0 border-b border-coolgray-30 bg-transparent pb-2 text-base text-coolgray-90 placeholder:text-[#9d9d9d] outline-none focus:border-primary-60"
              required
            />
          </label>

          <label className="block mb-10">
            <span className="sr-only">Password</span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-0 border-b border-coolgray-30 bg-transparent pb-2 text-base text-coolgray-90 placeholder:text-[#9d9d9d] outline-none focus:border-primary-60"
              required
            />
          </label>

          {error && (
            <p className="mb-4 text-sm text-alert" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-[60px] rounded-lg bg-primary-60 text-white text-xl font-medium tracking-wide hover:bg-primary-90 disabled:opacity-50 transition-colors"
          >
            {submitting ? "로그인 중..." : "로그인"}
          </button>
        </form>
      </div>
    </div>
  );
}
