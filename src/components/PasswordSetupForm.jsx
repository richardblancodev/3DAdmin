import { useState } from "react";
import { supabase } from "../lib/supabase";

export default function PasswordSetupForm({ onComplete }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();
    if (!supabase) {
      setErrorMessage("Supabase no está configurado.");
      return;
    }
    if (password !== confirmation) {
      setErrorMessage("Las contraseñas no coinciden.");
      return;
    }
    setBusy(true);
    setErrorMessage("");
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${window.location.search}`,
      );
      await onComplete();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo establecer la contraseña.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="brand-mark">3D</div>
        <p className="eyebrow">ACTIVACIÓN DE CUENTA</p>
        <h1>Establece tu contraseña</h1>
        <p className="muted">
          Al continuar, tu cuenta quedará asociada a la empresa indicada en la
          invitación.
        </p>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            Nueva contraseña
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              required
              type="password"
              value={password}
            />
          </label>
          <label>
            Confirmar contraseña
            <input
              autoComplete="new-password"
              minLength={8}
              onChange={(event) => setConfirmation(event.target.value)}
              required
              type="password"
              value={confirmation}
            />
          </label>
          {errorMessage && (
            <p className="message error" role="alert">
              {errorMessage}
            </p>
          )}
          <button
            className="button primary full-width"
            disabled={busy}
            type="submit"
          >
            {busy ? "Guardando…" : "Activar cuenta"}
          </button>
        </form>
      </section>
    </main>
  );
}
