import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getLoginErrorMessage, useAuth } from "@/contexts/AuthContext";
import logoAcsa from "../../images/Logo_ACSA_02.png";

const USERNAME_MAX = 64;

export function LoginPage() {
  const { isAuthenticated, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from =
    (location.state as { from?: { pathname?: string } } | null)?.from
      ?.pathname || "/upload";

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(getLoginErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const usernameOk =
    username.trim().length >= 1 && username.trim().length <= USERNAME_MAX;

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <img src={logoAcsa} alt="ACSA" className="login-brand-logo" />
          <h1>Fitxers històrics</h1>
          <p>Inicieu sessió per continuar</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit} noValidate>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}

          <div className="field">
            <label htmlFor="login-username">Usuari</label>
            <input
              id="login-username"
              type="text"
              name="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={1}
              maxLength={USERNAME_MAX}
              disabled={submitting}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">Contrasenya</label>
            <input
              id="login-password"
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={submitting}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary login-submit"
            disabled={submitting || !usernameOk || !password}
          >
            {submitting ? "Entrant…" : "Entrar"}
          </button>
        </form>
      </div>
    </div>
  );
}
