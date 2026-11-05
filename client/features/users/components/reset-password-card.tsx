"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputCls } from "@/components/forms/FormField";
import { useAuth } from "@/features/auth/hooks/use-auth";
import { useResetUserPassword } from "../hooks/use-reset-user-password";
import type { UserWithRole } from "../types/user.types";

const ADMIN_ROLES = ["superadmin", "admin"];

/**
 * Mirrors the server rule (assertCanResetPassword): a super admin resets every other user's password; an
 * Admin resets their own branch's staff, but not another Admin's or a super admin's; nobody resets their own
 * here (Profile → Change password). The server enforces it; this only decides whether to show the card.
 */
export function canResetPassword(
  actor: { id?: string; branchId?: string | null } | null,
  actorFlags: { isSuperAdmin: boolean; isAdmin: boolean },
  target: UserWithRole,
): boolean {
  if (!actor || actor.id === target.id) return false;
  if (actorFlags.isSuperAdmin) return true;
  if (!actorFlags.isAdmin) return false;
  if (ADMIN_ROLES.includes(target.role?.name?.toLowerCase() ?? "")) return false;
  return !!actor.branchId && actor.branchId === target.branchId;
}

/** A password that is easy to read out: no 0/O or 1/l/I. */
function generatePassword(length = 10): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const values = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(values, (v) => chars[v % chars.length]).join("");
}

export function ResetPasswordCard({ user }: { user: UserWithRole }) {
  const { user: actor, isSuperAdmin, isAdmin } = useAuth();
  const reset = useResetUserPassword(user.id);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (!canResetPassword(actor, { isSuperAdmin, isAdmin }, user)) return null;

  const tooShort = password.length > 0 && password.length < 6;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= 6 && password === confirm && !reset.isPending;

  function onGenerate() {
    const generated = generatePassword();
    setPassword(generated);
    setConfirm(generated);
    setShow(true);
    setDone(null);
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;
    const name = `${user.firstName} ${user.lastName}`;
    if (!window.confirm(`Set a new password for ${name}? They will be signed out everywhere.`)) return;
    reset.mutate(password, {
      onSuccess: () => {
        setDone(password);
        setPassword("");
        setConfirm("");
      },
    });
  }

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-primary" />
        <p className="font-semibold text-slate-800">Reset password</p>
      </div>
      <p className="mt-0.5 text-sm text-slate-500">
        Set a new password when the user cannot sign in. They are signed out of all sessions. Give
        them the password privately and ask them to change it from their profile.
      </p>

      {done && (
        <div role="status" className="mt-4 rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          New password for {user.firstName}: <span className="font-mono font-semibold">{done}</span>
          <button type="button" className="ml-3 text-green-700 underline" onClick={() => setDone(null)}>
            Hide
          </button>
        </div>
      )}

      <form className="mt-4 grid gap-4" onSubmit={onSubmit}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="New password" error={tooShort ? "At least 6 characters" : undefined}>
            <input
              type={show ? "text" : "password"}
              className={inputCls}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Field label="Confirm new password" error={mismatch ? "Passwords do not match" : undefined}>
            <input
              type={show ? "text" : "password"}
              className={inputCls}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" disabled={!canSubmit}>
            {reset.isPending ? "Resetting…" : "Reset password"}
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onGenerate}>
            Generate password
          </Button>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} />
            Show password
          </label>
        </div>
      </form>
    </div>
  );
}
