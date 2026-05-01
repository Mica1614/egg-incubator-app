// @ts-nocheck
"use client";

import { useEffect, useMemo, useState } from "react";
import Sidebar from "@/components/Sidebar";
import TopBar from "@/components/TopBar";
import { auth, firestore } from "@/lib/firebase";
import { onAuthStateChanged } from "firebase/auth";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";

const formatToday = () => {
  const now = new Date();
  return now.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

export default function ProfilePage() {
  const today = useMemo(() => formatToday(), []);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const [authUser, setAuthUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveError, setSaveError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState("");
  const [isEditing, setIsEditing] = useState(false);

  const [cellphoneNumber, setCellphoneNumber] = useState("");
  const [gender, setGender] = useState("");
  const [age, setAge] = useState("");
  const [birthday, setBirthday] = useState("");
  const [address, setAddress] = useState("");
  const [poultryFarmName, setPoultryFarmName] = useState("");

  useEffect(() => {
    setError("");
    setIsLoading(true);

    const unsubscribe = onAuthStateChanged(
      auth,
      async (user) => {
        setAuthUser(user || null);

        if (!user?.uid) {
          setProfile(null);
          setIsLoading(false);
          return;
        }

        try {
          const snap = await getDoc(doc(firestore, "users", user.uid));
          const data = snap.exists() ? snap.data() : null;
          setProfile(data);
          setCellphoneNumber(String(data?.cellphoneNumber || ""));
          setGender(String(data?.gender || ""));
          setAge(data?.age === 0 ? "0" : data?.age ? String(data.age) : "");
          setBirthday(String(data?.birthday || ""));
          setAddress(String(data?.address || ""));
          setPoultryFarmName(String(data?.poultryFarmName || ""));
        } catch (e) {
          const message = e?.message || "Failed to load profile.";
          const code = e?.code ? ` (${e.code})` : "";
          setError(`${message}${code}`);
          setProfile(null);
        } finally {
          setIsLoading(false);
        }
      },
      (e) => {
        const message = e?.message || "Failed to read authentication state.";
        const code = e?.code ? ` (${e.code})` : "";
        setError(`${message}${code}`);
        setAuthUser(null);
        setProfile(null);
        setIsEditing(false);
        setIsLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const fullName = profile?.fullName || authUser?.displayName || "";
  const username = profile?.username || "";
  const email = profile?.email || authUser?.email || "";

  const initial = String(fullName || username || email || "U")
    .trim()
    .slice(0, 1)
    .toUpperCase();

  const computeChangedFields = () => {
    const changes = [];
    const details = [];

    const prev = profile || {};

    const nextCellphoneNumber = String(cellphoneNumber || "").trim();
    const nextGender = String(gender || "").trim();
    const nextAge = age === "" ? null : Number(age);
    const nextBirthday = String(birthday || "").trim();
    const nextAddress = String(address || "").trim();
    const nextPoultryFarmName = String(poultryFarmName || "").trim();

    const prevCellphoneNumber = String(prev?.cellphoneNumber || "").trim();
    const prevGender = String(prev?.gender || "").trim();
    const prevAge = prev?.age === undefined ? null : prev?.age;
    const prevBirthday = String(prev?.birthday || "").trim();
    const prevAddress = String(prev?.address || "").trim();
    const prevPoultryFarmName = String(prev?.poultryFarmName || "").trim();

    const fmt = (v) => {
      if (v === null || v === undefined) return "(empty)";
      const s = String(v).trim();
      return s ? s : "(empty)";
    };

    if (prevCellphoneNumber !== nextCellphoneNumber) {
      changes.push("Cellphone Number");
      details.push(`Cellphone Number: ${fmt(prevCellphoneNumber)} → ${fmt(nextCellphoneNumber)}`);
    }
    if (prevGender !== nextGender) {
      changes.push("Gender");
      details.push(`Gender: ${fmt(prevGender)} → ${fmt(nextGender)}`);
    }
    if ((prevAge ?? null) !== (nextAge ?? null)) {
      changes.push("Age");
      details.push(`Age: ${fmt(prevAge ?? null)} → ${fmt(nextAge ?? null)}`);
    }
    if (prevBirthday !== nextBirthday) {
      changes.push("Birthday");
      details.push(`Birthday: ${fmt(prevBirthday)} → ${fmt(nextBirthday)}`);
    }
    if (prevAddress !== nextAddress) {
      changes.push("Address");
      details.push(`Address: ${fmt(prevAddress)} → ${fmt(nextAddress)}`);
    }
    if (prevPoultryFarmName !== nextPoultryFarmName) {
      changes.push("Poultry Farm Name");
      details.push(`Poultry Farm Name: ${fmt(prevPoultryFarmName)} → ${fmt(nextPoultryFarmName)}`);
    }

    return { changes, details };
  };

  const handleSave = async () => {
    if (!authUser?.uid) return;

    setSaveError("");
    setSaveSuccess("");

    const { changes: changedFields, details: changeDetails } = computeChangedFields();

    const nextAge = age === "" ? null : Number(age);
    if (nextAge !== null && (!Number.isFinite(nextAge) || nextAge < 0)) {
      setSaveError("Age must be a valid number.");
      return;
    }

    setIsSaving(true);
    try {
      await setDoc(
        doc(firestore, "users", authUser.uid),
        {
          cellphoneNumber: String(cellphoneNumber || "").trim(),
          gender: String(gender || "").trim(),
          age: nextAge,
          birthday: String(birthday || "").trim(),
          address: String(address || "").trim(),
          poultryFarmName: String(poultryFarmName || "").trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      if (changedFields.length > 0) {
        const summary = changedFields.join(", ");
        const message = changeDetails.length > 0 ? changeDetails.join("\n") : `Updated fields: ${summary}`;
        await addDoc(collection(firestore, "users", authUser.uid, "notifications"), {
          title: "Profile updated",
          message,
          changedFields,
          changeDetails,
          tone: "info",
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      setSaveSuccess("Profile updated.");
      setIsEditing(false);
    } catch (e) {
      const message = e?.message || "Failed to save profile.";
      const code = e?.code ? ` (${e.code})` : "";
      setSaveError(`${message}${code}`);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-6xl items-start gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <Sidebar mobileOpen={isSidebarOpen} onMobileClose={() => setIsSidebarOpen(false)} />

        <main className="flex flex-1 flex-col gap-6">
          <div className="flex flex-col gap-4">
            <TopBar
              title="Profile"
              notificationCount={3}
              onOpenSidebar={() => setIsSidebarOpen(true)}
            />
            <p className="text-[11px] font-medium text-slate-400">{today}</p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
              {error}
            </div>
          ) : null}

          {saveError ? (
            <div className="rounded-2xl border border-rose-100/80 bg-rose-50/80 px-4 py-3 text-xs font-medium text-rose-700">
              {saveError}
            </div>
          ) : null}

          {saveSuccess ? (
            <div className="rounded-2xl border border-emerald-100/80 bg-emerald-50/80 px-4 py-3 text-xs font-medium text-emerald-700">
              {saveSuccess}
            </div>
          ) : null}

          {!isLoading && !authUser ? (
            <section className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-5 py-6 text-center">
                <p className="text-xs font-semibold text-slate-700">
                  You are not signed in.
                </p>
                <p className="mt-1 text-[11px] text-slate-400">
                  Please sign in to view your profile.
                </p>
              </div>
            </section>
          ) : (
            <section className="grid gap-4">
              <article className="rounded-3xl bg-white px-6 py-6 shadow-sm ring-1 ring-slate-100">
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-xl font-semibold text-sky-600 ring-1 ring-sky-100">
                    {isLoading ? "…" : initial}
                  </div>
                  <div className="flex flex-1 flex-col">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                      Account Holder
                    </p>
                    <p className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
                      {isLoading ? "Loading..." : fullName || username || "User"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {isLoading ? "" : email}
                    </p>
                  </div>
                </div>

                <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="inline-flex items-center rounded-full bg-slate-900/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700 ring-1 ring-slate-200/60">
                    Profile Details
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setSaveError("");
                        setSaveSuccess("");
                        setIsEditing((v) => !v);
                      }}
                      disabled={isLoading || !authUser || isSaving}
                      className="inline-flex items-center justify-center rounded-xl border border-slate-200/80 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isEditing ? "Cancel" : "Edit"}
                    </button>

                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isLoading || !authUser || !isEditing || isSaving}
                      className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-sky-600 to-indigo-600 px-4 py-2.5 text-xs font-semibold text-white shadow-sm transition hover:from-sky-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </button>
                  </div>
                </div>

                <div className="mt-6 grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Username
                    </p>
                    <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                      {isLoading ? "Loading..." : username || "-"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Public handle</p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Full Name
                    </p>
                    <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                      {isLoading ? "Loading..." : fullName || "-"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Registered name</p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100 sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Email
                    </p>
                    <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                      {isLoading ? "Loading..." : email || "-"}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">Login identifier</p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Cellphone Number
                    </p>
                    {isEditing ? (
                      <input
                        value={cellphoneNumber}
                        onChange={(e) => setCellphoneNumber(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15"
                        placeholder="e.g. 09xxxxxxxxx"
                      />
                    ) : (
                      <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                        {isLoading ? "Loading..." : cellphoneNumber || "-"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Contact</p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Gender
                    </p>
                    {isEditing ? (
                      <select
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="mt-2 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15"
                      >
                        <option value="">Select</option>
                        <option value="Male">Male</option>
                        <option value="Female">Female</option>
                        <option value="Prefer not to say">Prefer not to say</option>
                      </select>
                    ) : (
                      <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                        {isLoading ? "Loading..." : gender || "-"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Personal</p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Age
                    </p>
                    {isEditing ? (
                      <input
                        type="number"
                        min={0}
                        value={age}
                        onChange={(e) => setAge(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15"
                        placeholder="e.g. 21"
                      />
                    ) : (
                      <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                        {isLoading ? "Loading..." : age !== "" ? age : "-"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Years</p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Birthday
                    </p>
                    {isEditing ? (
                      <input
                        type="date"
                        value={birthday}
                        onChange={(e) => setBirthday(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15"
                      />
                    ) : (
                      <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                        {isLoading ? "Loading..." : birthday || "-"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Date of birth</p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100 sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Address
                    </p>
                    {isEditing ? (
                      <input
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15"
                        placeholder="e.g. City, Province"
                      />
                    ) : (
                      <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                        {isLoading ? "Loading..." : address || "-"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Location</p>
                  </div>

                  <div className="rounded-2xl bg-slate-50 px-5 py-4 ring-1 ring-slate-100 sm:col-span-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                      Poultry Farm Name
                    </p>
                    {isEditing ? (
                      <input
                        value={poultryFarmName}
                        onChange={(e) => setPoultryFarmName(e.target.value)}
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 outline-none transition focus:border-sky-300/90 focus:ring-4 focus:ring-sky-500/15"
                        placeholder="e.g. Sunrise Poultry Farm"
                      />
                    ) : (
                      <p className="mt-2 text-sm font-semibold tracking-tight text-slate-900">
                        {isLoading ? "Loading..." : poultryFarmName || "-"}
                      </p>
                    )}
                    <p className="mt-1 text-xs text-slate-500">Business</p>
                  </div>
                </div>
              </article>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
