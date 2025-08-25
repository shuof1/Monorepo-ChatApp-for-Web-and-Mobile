// app/(app)/users/[uid]/details/page.tsx  ← or place wherever you like
"use client";

import React, { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, setDoc } from "firebase/firestore";
import { getDb } from '../../../lib/firebase'; // adjust the import path to your project

type PageProps = {
  params?: { uid?: string };
  searchParams?: { uid?: string };
};

export default function Page(props: PageProps) {
  const router = useRouter();
  const sp = useSearchParams();

  // 1) Resolve uid from dynamic route or querystring
  const uid = useMemo(() => {
    return props?.params?.uid || sp.get("uid") || "";
  }, [props?.params?.uid, sp]);

  // 2) Local state
  const [name, setName] = useState("");
  const [dob, setDob] = useState<string>(() => {
    // default to today in yyyy-mm-dd
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  });
  const [gender, setGender] = useState<"Male" | "Female" | "Other">("Male");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 3) Save to Firestore
  const onSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!uid) {
      setError("Missing user id.");
      return;
    }
    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) {
      setError("Invalid date format.");
      return;
    }

    try {
      setSaving(true);
      const db = getDb();
      await setDoc(
        doc(db, "users", uid),
        {
          name: name.trim(),
          dob, // already yyyy-mm-dd
          gender,
          displayName: name.trim(),
        },
        { merge: true }
      );
      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      setError("Error saving details. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-black">
      {/* Top dark section */}
      <div className="h-[25vh] bg-black" />
      {/* Light panel */}
      <div className="relative -mt-[10vh] rounded-t-[100px] bg-[#ADD8E6] px-6 pb-12 pt-24 max-w-xl mx-auto">
        <h1 className="text-center text-3xl font-bold mb-10">Enter Your Details</h1>

        {!uid && (
          <div className="mb-6 rounded-lg bg-yellow-100 text-yellow-900 px-4 py-3">
            No <code className="font-mono">uid</code> found. Pass it in the route
            (<code className="font-mono">/users/&lt;uid&gt;/details</code>) or as{" "}
            <code className="font-mono">?uid=&lt;uid&gt;</code>.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg bg-red-100 text-red-900 px-4 py-3">
            {error}
          </div>
        )}

        <form onSubmit={onSave} className="space-y-6">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">Name</label>
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full h-12 rounded-lg border border-black/60 bg-white px-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* DOB */}
          <div>
            <label className="block text-sm font-medium mb-2">Date of Birth</label>
            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              className="w-full h-12 rounded-lg border border-black/60 bg-white px-3 outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Gender */}
          <div>
            <label className="block text-sm font-medium mb-2">Gender</label>
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as any)}
              className="w-full h-12 rounded-lg border border-black/60 bg-white px-3 outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          {/* Actions */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving || !uid}
              className="w-full h-12 rounded-lg bg-blue-600 text-white font-semibold disabled:opacity-60"
            >
              {saving ? "Saving..." : "Save Details"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
