import { useState } from "react";
import appLogo from "../image/3D Admin Logo.svg";
import { supabase } from "../lib/supabase";
export default function AuthForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function handleSubmit(event) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setErrorMessage("");
    try {
      const result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) {
        setErrorMessage(result.error.message);
        return;
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo conectar con Supabase.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-card">
        <img alt="3D Admin" className="auth-logo" src={appLogo} />
        <h1>Bienvenido</h1>
        <p className="muted">
          Accede al espacio de trabajo de tu empresa de impresión 3D.
        </p>
        <form className="form-stack" onSubmit={handleSubmit}>
          <label>
            Correo electrónico
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
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
            {busy
              ? "Procesando…"
              : "Iniciar sesión"}
          </button>
        </form>
        <p className="muted auth-invite-note">
          El acceso es por invitación del administrador de la plataforma.
        </p>
      </section>
    </main>
  );
}
