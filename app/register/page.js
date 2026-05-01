// @ts-nocheck
"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth, db, firestore } from "@/lib/firebase";
import { createUserWithEmailAndPassword } from "firebase/auth";
import { ref, set } from "firebase/database";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export default function RegisterPage() {
  const router = useRouter();

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!username || !fullName || !email || !password || !confirmPassword) {
      setError("Please fill in all fields.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setIsSubmitting(true);

    try {
      // Create user with email and password
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;
      
      // Get the ID token to ensure auth is ready
      await user.getIdToken();

      // Write to Realtime Database
      await set(ref(db, `users/${user.uid}`), {
        username,
        fullName,
        email,
        cellphoneNumber: "",
        gender: "",
        age: null,
        birthday: "",
        address: "",
        poultryFarmName: "",
        createdAt: new Date().toISOString(),
      });

      // Write to Firestore
      await setDoc(doc(firestore, "users", user.uid), {
        username,
        fullName,
        email,
        cellphoneNumber: "",
        gender: "",
        age: null,
        birthday: "",
        address: "",
        poultryFarmName: "",
        createdAt: serverTimestamp(),
      });

      setSuccess("Account created successfully!");
      setUsername("");
      setFullName("");
      setEmail("");
      setPassword("");
      setConfirmPassword("");

      setTimeout(() => {
        router.push("/dashboard");
      }, 1200);
    } catch (err) {
      console.error("Registration error:", err);
      const message =
        err?.code === "auth/email-already-in-use"
          ? "This email is already registered."
          : err?.code === "database/permission_denied" || err?.message?.includes("PERMISSION_DENIED")
          ? "Database permission error. Please check Firebase database rules in the Firebase Console."
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
            Create your account
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Join the incubator and start building your next big idea.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-800">
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-indigo-400/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/40 placeholder:text-slate-400"
              placeholder="e.g. buildwizard"
            />
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-slate-800">
              Full name
            </label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-indigo-400/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/40 placeholder:text-slate-400"
              placeholder="e.g. Alex Reyes"
            />
          </div>

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

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-800">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-indigo-400/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/40 placeholder:text-slate-400"
                placeholder="At least 6 characters"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-slate-800">
                Confirm password
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none ring-0 transition focus:border-indigo-400/80 focus:bg-white focus:ring-2 focus:ring-indigo-500/40 placeholder:text-slate-400"
                placeholder="Re-type your password"
              />
            </div>
          </div>

          {error && (
            <p className="text-sm font-medium text-rose-400/90">
              {error}
            </p>
          )}

          {success && (
            <p className="text-sm font-medium text-emerald-400/90">
              {success}
            </p>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-2 inline-flex w-full items-center justify-center rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-medium text-white shadow-[0_12px_35px_rgba(79,70,229,0.55)] transition hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 disabled:cursor-not-allowed disabled:bg-indigo-500/60 disabled:shadow-none"
          >
            {isSubmitting ? "Creating account..." : "Sign up"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          Already have an account?{" "}
          <button
            type="button"
            className="font-medium text-indigo-300 hover:text-indigo-200"
            onClick={() => router.push("/login")}
          >
            Go back home
          </button>
        </p>
      </div>
    </div>
  );
}
