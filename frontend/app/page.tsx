"use client";

import { FormEvent, useState } from "react";

import { confirmForgotPasswordOtp, login, requestForgotPasswordOtp, resetForgotPassword } from "@/lib/api";
import { isStrongPassword } from "@/lib/validation";

type ForgotPasswordStep = "request" | "otp" | "reset";

function resolveHome(role?: string | null, mustChangePassword?: boolean | null): string {
  if (mustChangePassword) {
    return "/profile?forcePasswordChange=1";
  }
  if (role === "admin") {
    return "/admin";
  }
  if (role === "teacher") {
    return "/teacher";
  }
  return "/dashboard";
}

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotStep, setForgotStep] = useState<ForgotPasswordStep>("request");
  const [forgotIdentity, setForgotIdentity] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [resetToken, setResetToken] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [forgotSubmitting, setForgotSubmitting] = useState(false);
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const response = await login(username.trim(), password);
      window.localStorage.setItem("auth_token", response.token);
      window.localStorage.setItem("auth_username", response.user.username);
      window.location.href = resolveHome(
        response.user.role,
        response.user.must_change_password,
      );
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Login failed.");
    } finally {
      setSubmitting(false);
    }
  }

  async function onForgotSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setForgotSubmitting(true);
    setForgotError(null);
    setForgotMessage(null);
    try {
      if (forgotStep === "request") {
        const response = await requestForgotPasswordOtp(forgotIdentity.trim());
        setForgotMessage(response.message);
        setForgotStep("otp");
      } else if (forgotStep === "otp") {
        const response = await confirmForgotPasswordOtp(forgotIdentity.trim(), otpCode.trim());
        setResetToken(response.reset_token);
        setForgotMessage(response.message);
        setForgotStep("reset");
      } else {
        if (!isStrongPassword(newPassword)) {
          throw new Error("Use at least 8 characters with 1 uppercase letter, 1 number, and 1 symbol.");
        }
        if (newPassword !== confirmPassword) {
          throw new Error("New password and confirm password do not match.");
        }
        const response = await resetForgotPassword(resetToken, newPassword);
        window.localStorage.setItem("auth_token", response.token);
        window.localStorage.setItem("auth_username", response.user.username);
        window.location.href = resolveHome(
          response.user.role,
          response.user.must_change_password,
        );
      }
    } catch (forgotPasswordError) {
      setForgotError(
        forgotPasswordError instanceof Error
          ? forgotPasswordError.message
          : "Unable to continue the password reset flow."
      );
    } finally {
      setForgotSubmitting(false);
    }
  }

  return (
    <section className="space-y-4">
      <div className="panel panel-lively">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-brandBlue">UGNAY LMS</p>
        <h2 className="mt-3 text-3xl font-bold title-gradient">Log In</h2>
        <p className="mt-2 text-sm text-slate-700">
          Use the account given by your school or LMS admin. Registration and QR onboarding are no
          longer part of the system.
        </p>
      </div>

      <form className="panel panel-lively space-y-4" onSubmit={onSubmit}>
        <label className="block text-sm font-semibold text-slate-800">
          Username or Email
          <input
            className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
            onChange={(event) => setUsername(event.target.value)}
            required
            type="text"
            value={username}
          />
        </label>

        <label className="block text-sm font-semibold text-slate-800">
          Password
          <div className="mt-1 flex items-center gap-2">
            <input
              className="min-w-0 flex-1 rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              onChange={(event) => setPassword(event.target.value)}
              required
              type={showPassword ? "text" : "password"}
              value={password}
            />
            <button
              className="rounded-lg border border-brandBorder bg-brandMutedSurface px-3 py-2 text-xs font-semibold text-brandBlue transition hover:bg-brandBlueLight"
              onClick={() => setShowPassword((value) => !value)}
              type="button"
            >
              {showPassword ? "Hide" : "Show"}
            </button>
          </div>
        </label>

        <div className="flex flex-wrap items-center gap-2">
          <button
            className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Signing In..." : "Log In"}
          </button>

          <button
            className="rounded-lg border border-brandBorder bg-white px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
            onClick={() => {
              setForgotOpen((value) => !value);
              setForgotMessage(null);
              setForgotError(null);
            }}
            type="button"
          >
            {forgotOpen ? "Close Forgot Password" : "Forgot Password?"}
          </button>
        </div>

        {error ? <p className="rounded-lg border border-brandRed/35 bg-brandRedLight px-3 py-2 text-sm text-brandRed">{error}</p> : null}
      </form>

      {forgotOpen ? (
        <form className="panel panel-lively space-y-4" onSubmit={onForgotSubmit}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accentWarm">Password Help</p>
            <h3 className="mt-2 text-xl font-semibold text-slate-900">Reset Password</h3>
            <p className="mt-2 text-sm text-slate-700">
              {forgotStep === "request"
                ? "Enter your username or school email to receive a 6-digit OTP."
                : forgotStep === "otp"
                  ? "Enter the OTP sent to your email."
                  : "Create your new password."}
            </p>
          </div>

          <label className="block text-sm font-semibold text-slate-800">
            Username or Email
            <input
              className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
              disabled={forgotStep !== "request"}
              onChange={(event) => setForgotIdentity(event.target.value)}
              required
              type="text"
              value={forgotIdentity}
            />
          </label>

          {forgotStep === "otp" ? (
            <label className="block text-sm font-semibold text-slate-800">
              OTP Code
              <input
                className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                inputMode="numeric"
                maxLength={6}
                onChange={(event) => setOtpCode(event.target.value)}
                required
                type="text"
                value={otpCode}
              />
            </label>
          ) : null}

          {forgotStep === "reset" ? (
            <>
              <label className="block text-sm font-semibold text-slate-800">
                New Password
                <input
                  className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                  type="password"
                  value={newPassword}
                />
              </label>
              <label className="block text-sm font-semibold text-slate-800">
                Confirm New Password
                <input
                  className="mt-1 w-full rounded-lg border border-brandBorder bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-brandBlue"
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  type="password"
                  value={confirmPassword}
                />
              </label>
            </>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <button
              className="rounded-lg bg-brandBlue px-4 py-2 text-sm font-semibold text-white transition hover:bg-brandBlue/90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={forgotSubmitting}
              type="submit"
            >
              {forgotSubmitting
                ? "Processing..."
                : forgotStep === "request"
                  ? "Send OTP"
                  : forgotStep === "otp"
                    ? "Verify OTP"
                    : "Reset Password"}
            </button>
            {forgotStep !== "request" ? (
              <button
                className="rounded-lg border border-brandBorder bg-brandMutedSurface px-4 py-2 text-sm font-semibold text-brandBlue transition hover:bg-brandBlueLight"
                disabled={forgotSubmitting}
                onClick={() => {
                  setForgotStep(forgotStep === "reset" ? "otp" : "request");
                  setForgotError(null);
                  setForgotMessage(null);
                }}
                type="button"
              >
                Back
              </button>
            ) : null}
          </div>

          {forgotMessage ? <p className="rounded-lg border border-brandGreen/35 bg-brandGreenLight px-3 py-2 text-sm text-slate-800">{forgotMessage}</p> : null}
          {forgotError ? <p className="rounded-lg border border-brandRed/35 bg-brandRedLight px-3 py-2 text-sm text-brandRed">{forgotError}</p> : null}
        </form>
      ) : null}
    </section>
  );
}
