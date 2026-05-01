// @ts-nocheck
"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { sendPasswordResetEmail } from "firebase/auth";

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const nextEmail = String(email || "").trim();

    if (!nextEmail) {
      setError("Please enter your email.");
      return;
    }

    setIsSubmitting(true);

    try {
      await sendPasswordResetEmail(auth, nextEmail);

      setSuccess("We sent a password reset link to your email.");
      setEmail("");
    } catch (err) {
      const code = String(err?.code || "");
      const message =
        code === "auth/user-not-found"
          ? "No account found for this email."
          : code === "auth/invalid-email"
            ? "Please enter a valid email address."
            : err?.message || "Failed to send reset email. Please try again.";

      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-xl px-8 py-10">
        <div className="mb-8 text-center">
          <div className="mb-5 flex justify-center">
            <Image
              src="/eggcubator3.png"
              alt="Eggcubator logo"
              width={225}
              height={225}
              className="object-contain"
              priority
            />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Forgot password
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Enter your email and we’ll send you a reset link.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-800">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-indigo-400/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/40 placeholder:text-slate-400"
              placeholder="you@example.com"
            />
          </div>

          {error && (
            <p className="text-sm font-medium text-rose-400/90">{error}</p>
          )}
          {success && (
            <p className="text-sm font-medium text-emerald-500/90">{success}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_35px_rgba(79,70,229,0.55)] transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:bg-indigo-500/60 disabled:shadow-none"
          >
            {isSubmitting ? "Sending..." : "Send reset link"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Remembered your password?{" "}
          <button
            type="button"
            className="font-medium text-indigo-300 hover:text-indigo-200"
            onClick={() => router.push("/login")}
          >
            Sign in
          </button>
        </p>
      </div>
    </div>
  );
}
