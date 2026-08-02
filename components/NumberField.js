// @ts-nocheck
"use client";

/**
 * components/NumberField.js — A number input that is actually typeable.
 *
 * A controlled <input type="number"> that coerces with Number() on every
 * keystroke fights the user: clearing the field yields Number("") === 0, so it
 * snaps back to "0" and you can never backspace to retype a value. Partial
 * input like "1." or a leading "-" is likewise destroyed mid-typing.
 *
 * This keeps a raw draft string while the field has focus and only reports
 * parsed values upward, so typing behaves normally. When focus leaves, the
 * field falls back to showing the committed value — an empty or unparseable
 * draft simply reverts rather than writing a junk number.
 *
 * No min/max/step constraints: the user types whatever they like. Validation
 * of what is actually usable lives in the pure modules (resolveRatings and
 * estimatePower ignore negative or non-numeric values), where it is tested.
 */

import { useState } from "react";

export default function NumberField({
  value,
  onChange,
  className = "",
  suffix = null,
  ...rest
}) {
  const [draft, setDraft] = useState("");
  const [focused, setFocused] = useState(false);

  // Derived rather than synced through an effect, so there is no cascading
  // render and no chance of the draft going stale against the committed value.
  const shown = focused ? draft : (value ?? "");

  const handleChange = (event) => {
    const next = event.target.value;
    setDraft(next);

    // An empty or half-typed value is a valid intermediate state — leave the
    // committed value alone until there is a real number to report.
    if (next.trim() === "") return;
    const parsed = Number(next);
    if (Number.isFinite(parsed)) onChange(parsed);
  };

  const input = (
    <input
      {...rest}
      type="number"
      inputMode="decimal"
      step="any"
      value={shown}
      onFocus={() => {
        setDraft(String(value ?? ""));
        setFocused(true);
      }}
      onChange={handleChange}
      onBlur={() => setFocused(false)}
      className={className}
    />
  );

  if (!suffix) return input;

  return (
    <div className="flex items-center gap-1.5">
      {input}
      <span className="text-[10px] text-slate-400">{suffix}</span>
    </div>
  );
}
