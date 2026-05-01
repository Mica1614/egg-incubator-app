// @ts-nocheck
"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebase";
import { signInWithEmailAndPassword } from "firebase/auth";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);

    if (!email || !password) {
      setError("Please fill in all fields.");
      return;
    }

    setIsSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email, password);
      router.push("/dashboard");
    } catch (err) {
      const message =
        err?.code === "auth/invalid-credential"
          ? "Invalid email or password."
          : err?.code === "auth/user-not-found"
            ? "No account found for this email."
            : err?.code === "auth/wrong-password"
              ? "Invalid email or password."
              : err?.message || "Something went wrong. Please try again.";

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
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Use your email and password to continue.
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

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-800">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-indigo-400/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/40 placeholder:text-slate-400"
              placeholder="Your password"
            />
          </div>

          <div className="flex items-center justify-end">
            <button
              type="button"
              className="text-xs font-medium text-indigo-300 hover:text-indigo-200"
              onClick={() => router.push("/forgot-password")}
            >
              Forgot password?
            </button>
          </div>

          {error && (
            <p className="text-sm font-medium text-rose-400/90">{error}</p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_35px_rgba(79,70,229,0.55)] transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:bg-indigo-500/60 disabled:shadow-none"
          >
            {isSubmitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Don&apos;t have an account?{" "}
          <button
            type="button"
            className="font-medium text-indigo-300 hover:text-indigo-200"
            onClick={() => router.push("/register")}
          >
            Create one
          </button>
        </p>
      </div>
    </div>
  );
}
