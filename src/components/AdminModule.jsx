import { useCallback, useEffect, useState } from "react";
import { Building2, UserPlus } from "lucide-react";
import { supabase } from "../lib/supabase";

function requireSupabase() {
  if (!supabase) throw new Error("Supabase no está configurado.");
  return supabase;
}

export default function AdminModule({
  activeCompanyId,
  onCompanyChanged,
}) {
  const [companies, setCompanies] = useState([]);
  const [email, setEmail] = useState("");
  const [selectedCompanyId, setSelectedCompanyId] = useState("");
  const [newCompanyName, setNewCompanyName] = useState("");
  const [createCompany, setCreateCompany] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");

  const loadCompanies = useCallback(async () => {
    setLoading(true);
    setErrorMessage("");
    try {
      const client = requireSupabase();
      const { data, error } = await client
        .from("companies")
        .select("id, name, created_at")
        .order("name");
      if (error) throw error;
      setCompanies(data ?? []);
      if (
        !selectedCompanyId ||
        !(data ?? []).some((company) => company.id === selectedCompanyId)
      ) {
        setSelectedCompanyId(activeCompanyId || "");
      }
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudieron cargar las empresas.",
      );
    } finally {
      setLoading(false);
    }
  }, [activeCompanyId, selectedCompanyId]);

  useEffect(() => {
    void loadCompanies();
  }, [loadCompanies]);

  async function handleCompanyChange(event) {
    const companyId = event.target.value;
    setSelectedCompanyId(companyId);
    setErrorMessage("");
    setNotice("");
    try {
      const client = requireSupabase();
      const { error } = await client.rpc("set_active_company", {
        p_company_id: companyId,
      });
      if (error) throw error;
      await onCompanyChanged();
      setNotice("Empresa activa actualizada.");
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar la empresa activa.",
      );
    }
  }

  async function handleInvite(event) {
    event.preventDefault();
    setBusy(true);
    setErrorMessage("");
    setNotice("");
    try {
      const client = requireSupabase();
      const { data, error } = await client.functions.invoke(
        "admin-provision-user",
        {
          body: createCompany
            ? { email, company_name: newCompanyName }
            : { email, company_id: selectedCompanyId },
        },
      );
      if (error) {
        let detail = data?.error ?? error.message;
        if (error.context instanceof Response) {
          const responseBody = await error.context
            .json()
            .catch(() => null);
          detail = responseBody?.error ?? detail;
        }
        throw new Error(detail || "No se pudo enviar la invitación.");
      }
      if (data?.error) throw new Error(data.error);
      setNotice(data?.message ?? "Invitación enviada.");
      setEmail("");
      setNewCompanyName("");
      setCreateCompany(false);
      await loadCompanies();
      if (data?.company_id && !activeCompanyId) {
        const { error: selectionError } = await requireSupabase().rpc(
          "set_active_company",
          {
            p_company_id: data.company_id,
          },
        );
        if (selectionError) throw selectionError;
        const context = await onCompanyChanged();
        setSelectedCompanyId(context?.active_company_id ?? data.company_id);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "No se pudo crear el usuario.";
      setErrorMessage(
        message.includes("Requested function was not found")
          ? "Supabase no encuentra la función admin-provision-user (HTTP 404). Debes desplegarla con Supabase CLI desde la carpeta del proyecto antes de invitar usuarios."
          : message.includes("Failed to send a request to the Edge Function")
            ? `El navegador no pudo conectar con la función de Supabase desde ${window.location.origin}. En Supabase configura APP_ORIGIN con ese origen (dominio y protocolo, sin ruta), confirma que la función admin-provision-user esté desplegada y vuelve a intentar. Para desarrollo local se permiten localhost:5173 y 127.0.0.1:5173.`
          : message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="module-page">
      <div className="page-heading">
        <div>
          <p className="eyebrow">ADMINISTRACIÓN GLOBAL</p>
          <h1>Empresas y usuarios</h1>
          <p className="muted">
            Invita usuarios a una empresa y cambia el espacio de trabajo. El
            acceso a los datos se aplica también en Supabase mediante RLS.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={loading}
          onClick={() => void loadCompanies()}
          type="button"
        >
          Actualizar
        </button>
      </div>

      {errorMessage && (
        <p className="message error" role="alert">
          {errorMessage}
        </p>
      )}
      {notice && (
        <p className="message success" role="status">
          {notice}
        </p>
      )}

      <section className="inventory-panel">
        <div className="panel-heading">
          <div>
            <h2>
              <Building2 size={18} /> Espacio de trabajo activo
            </h2>
            <p className="muted">
              Como administrador global puedes revisar una empresa a la vez.
              Las demás cuentas solo pueden seleccionar empresas a las que
              pertenecen.
            </p>
          </div>
        </div>
        {loading ? (
          <p className="muted">Cargando empresas…</p>
        ) : companies.length ? (
          <label>
            Empresa
            <select
              onChange={(event) => void handleCompanyChange(event)}
              value={selectedCompanyId}
            >
              <option disabled value="">
                Selecciona una empresa para activar
              </option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="message info">
            Aún no hay empresas. Puedes crear la primera al invitar a su primer
            usuario.
          </p>
        )}
        {!!companies.length && (
          <ul className="admin-company-list">
            {companies.map((company) => (
              <li key={company.id}>
                <span>{company.name}</span>
                {company.id === activeCompanyId && (
                  <strong>Activa</strong>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="inventory-panel">
        <div className="panel-heading">
          <div>
            <h2>
              <UserPlus size={18} /> Invitar usuario
            </h2>
            <p className="muted">
              Se enviará un correo para que el usuario establezca su contraseña.
              La invitación le dará acceso únicamente a la empresa seleccionada.
            </p>
          </div>
        </div>
        <form className="form-stack" onSubmit={handleInvite}>
          <label>
            Correo electrónico del usuario
            <input
              autoComplete="email"
              maxLength={254}
              onChange={(event) => setEmail(event.target.value)}
              required
              type="email"
              value={email}
            />
          </label>
          <label className="checkbox-field">
            <input
              checked={createCompany}
              onChange={(event) => setCreateCompany(event.target.checked)}
              type="checkbox"
            />
            Crear una empresa nueva para este usuario
          </label>
          {createCompany ? (
            <label>
              Nombre de la empresa
              <input
                maxLength={160}
                minLength={2}
                onChange={(event) => setNewCompanyName(event.target.value)}
                required
                value={newCompanyName}
              />
            </label>
          ) : (
            <label>
              Empresa a la que pertenecerá
              <select
                onChange={(event) => setSelectedCompanyId(event.target.value)}
                required
                value={selectedCompanyId}
              >
                <option disabled value="">
                  Selecciona una empresa
                </option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="button primary"
            disabled={busy || loading || (!createCompany && !companies.length)}
            type="submit"
          >
            {busy ? "Enviando invitación…" : "Crear usuario y enviar invitación"}
          </button>
        </form>
      </section>
      <p className="message info">
        La primera cuenta administradora global se habilita una sola vez desde
        Supabase SQL Editor. No existe un registro público ni una opción para
        que los usuarios se asignen permisos a sí mismos.
      </p>
    </section>
  );
}
