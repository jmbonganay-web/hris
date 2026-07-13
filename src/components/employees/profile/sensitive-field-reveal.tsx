"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { RevealSensitiveValueResult } from "@/features/employees/sensitive/types";

export function SensitiveFieldReveal({
  label,
  masked,
  hasValue,
  revealAction,
}: {
  label: string;
  masked: string;
  hasValue: boolean;
  revealAction: () => Promise<RevealSensitiveValueResult>;
}) {
  const [plaintext, setPlaintext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  function clearTimer() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  }

  function hide() {
    clearTimer();
    setPlaintext(null);
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, []);

  function reveal() {
    setError(null);
    startTransition(async () => {
      const result = await revealAction();
      if (!mountedRef.current) return;

      if ("error" in result) {
        hide();
        setError(result.error);
        return;
      }

      hide();
      setPlaintext(result.value);
      timerRef.current = setTimeout(() => {
        if (mountedRef.current) setPlaintext(null);
        timerRef.current = null;
      }, 30_000);
    });
  }

  return (
    <div className="sensitive-row">
      <div>
        <dt>{label}</dt>
        <dd aria-live="polite">{plaintext ?? masked}</dd>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </div>
      {hasValue && (
        plaintext ? (
          <button type="button" className="btn" onClick={hide}>
            Hide now
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={reveal}
            disabled={isPending}
          >
            {isPending ? "Revealing…" : "Reveal"}
          </button>
        )
      )}
    </div>
  );
}
