"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export function LoginForm() {
  const [state, formAction, pending] = useActionState<LoginState, FormData>(login, {});
  const { error } = state;

  return (
    <form action={formAction} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-xs font-medium text-slate-400">
          Mot de passe administrateur
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoFocus
          autoComplete="current-password"
          // Une erreur de configuration ne dit rien du mot de passe saisi : le champ reste valide.
          aria-invalid={error?.cause === "password" ? true : undefined}
          aria-describedby={error ? "login-error" : undefined}
          className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-3.5 py-2.5 text-sm text-white outline-none transition focus:border-cyan-400/60 focus:ring-2 focus:ring-cyan-400/20"
        />
      </div>
      {error?.cause === "password" && (
        <p id="login-error" role="alert" className="text-sm text-rose-400">
          {error.messages.join(" ")}
        </p>
      )}
      {error?.cause === "config" && (
        <div
          id="login-error"
          role="alert"
          className="space-y-2 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3.5 text-sm text-amber-100"
        >
          <p className="font-semibold text-amber-300">Configuration du serveur incomplète</p>
          <ul className="list-disc space-y-1 pl-4">
            {error.messages.map((message) => (
              <li key={message}>{message}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-100/70">
            Le mot de passe saisi n’a pas été vérifié. Sur Vercel, redéployer après l’ajout d’une variable.
          </p>
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-cyan-400 px-4 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Vérification…" : "Entrer dans le Hub"}
      </button>
    </form>
  );
}
