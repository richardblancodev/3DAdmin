import { useCallback, useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Building2,
  Calculator,
  ChartNoAxesCombined,
  CircleHelp,
  ClipboardList,
  CreditCard,
  FileText,
  House,
  Layers3,
  LogOut,
  Printer,
  RotateCcw,
  Settings2,
  Shield,
  UserRound,
} from "lucide-react";
import AdminModule from "./components/AdminModule";
import AuthForm from "./components/AuthForm";
import CatalogModule from "./components/CatalogModule";
import CostCalculator from "./components/CostCalculator";
import CustomersModule from "./components/CustomersModule";
import Dashboard from "./components/Dashboard";
import FiscalModule from "./components/FiscalModule";
import InventoryModule from "./components/InventoryModule";
import OrdersModule from "./components/OrdersModule";
import PaymentsModule from "./components/PaymentsModule";
import PasswordSetupForm from "./components/PasswordSetupForm";
import ProductReturnsModule from "./components/ProductReturnsModule";
import RefundsModule from "./components/RefundsModule";
import PrintersModule from "./components/PrintersModule";
import ReportsModule from "./components/ReportsModule";
import SettingsModule from "./components/SettingsModule";
import SuppliersModule from "./components/SuppliersModule";
import appLogo from "./image/3D Admin Logo.svg";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { getFilamentRolls } from "./services/inventory";

function isPasswordSetupLink() {
  const parameters = new URLSearchParams(
    `${window.location.search.slice(1)}&${window.location.hash.slice(1)}`,
  );
  return ["invite", "recovery"].includes(parameters.get("type"));
}

export default function App() {
  const [session, setSession] = useState(null);
  const [authLoading, setAuthLoading] = useState(isSupabaseConfigured);
  const [passwordSetupRequired, setPasswordSetupRequired] = useState(
    isPasswordSetupLink,
  );
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessContext, setAccessContext] = useState(null);
  const [rolls, setRolls] = useState([]);
  const [loadingRolls, setLoadingRolls] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeModule, setActiveModule] = useState("dashboard");
  const companyRequestId = useRef(0);

  const refreshAccessContext = useCallback(async () => {
    if (!supabase) throw new Error("Supabase no está configurado.");
    const { data, error } = await supabase.rpc("get_current_access_context");
    if (error) {
      throw new Error(`No se pudo verificar el acceso: ${error.message}`);
    }
    setAccessContext(data);
    setActiveModule(
      data?.is_platform_admin && !data?.active_company_id
        ? "admin"
        : "dashboard",
    );
    companyRequestId.current += 1;
    setRolls([]);
    return data;
  }, []);
  useEffect(() => {
    if (!supabase) return;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (error)
          setLoadError(`No se pudo verificar la sesión: ${error.message}`);
        setSession(data.session);
        setAuthLoading(false);
      })
      .catch((error) => {
        setLoadError(
          error instanceof Error
            ? `No se pudo verificar la sesión: ${error.message}`
            : "No se pudo verificar la sesión.",
        );
        setAuthLoading(false);
      });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      companyRequestId.current += 1;
      setRolls([]);
      if (event === "PASSWORD_RECOVERY" || isPasswordSetupLink()) {
        setPasswordSetupRequired(true);
      }
      setSession(nextSession);
    });
    return () => subscription.unsubscribe();
  }, []);
  useEffect(() => {
    if (!session) {
      setAccessContext(null);
      setAccessLoading(false);
      return;
    }
    let active = true;
    setAccessLoading(true);
    supabase
      .rpc("get_current_access_context")
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setLoadError(`No se pudo verificar el acceso: ${error.message}`);
          setAccessContext(null);
          return;
        }
        setLoadError("");
        setAccessContext(data);
        if (data?.is_platform_admin && !data?.active_company_id) {
          setActiveModule("admin");
        } else {
          setActiveModule("dashboard");
        }
      })
      .catch((error) => {
        if (!active) return;
        setLoadError(
          error instanceof Error
            ? error.message
            : "No se pudo verificar el acceso.",
        );
        setAccessContext(null);
      })
      .finally(() => {
        if (active) setAccessLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session?.user.id]);

  const loadRolls = useCallback(async () => {
    if (!session || !accessContext?.active_company_id) return;
    const requestId = ++companyRequestId.current;
    setLoadingRolls(true);
    setLoadError("");
    try {
      const nextRolls = await getFilamentRolls();
      if (requestId === companyRequestId.current) setRolls(nextRolls);
    } catch (error) {
      if (requestId === companyRequestId.current) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "No se pudo cargar el inventario.",
        );
      }
    } finally {
      if (requestId === companyRequestId.current) setLoadingRolls(false);
    }
  }, [session, accessContext?.active_company_id]);
  async function handleSignOut() {
    if (!supabase) return;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setLoadError(`No se pudo cerrar la sesión: ${error.message}`);
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? `No se pudo cerrar la sesión: ${error.message}`
          : "No se pudo cerrar la sesión.",
      );
    }
  }
  useEffect(() => {
    void loadRolls();
  }, [loadRolls]);
  if (!isSupabaseConfigured) {
    return (
      <main className="setup-page">
        <section className="setup-card">
          <div className="brand-mark">3D</div>
          <p className="eyebrow">CONFIGURACIÓN INICIAL</p>
          <h1>Conecta tu proyecto de Supabase</h1>
          <p className="muted">
            La interfaz ya está lista. Para conectar autenticación e inventario,
            copia <code>.env.example</code> como <code>.env</code> y agrega la
            URL y la clave pública (anon/publishable) de tu proyecto.
          </p>
          <div className="setup-steps">
            <span>1</span>
            <p>
              Ejecuta el esquema SQL descrito en{" "}
              <strong>docs/SUPABASE.md</strong>.
            </p>
            <span>2</span>
            <p>
              Completa <code>VITE_SUPABASE_URL</code> y{" "}
              <code>VITE_SUPABASE_ANON_KEY</code> en <code>.env</code>.
            </p>
            <span>3</span>
            <p>
              Reinicia el servidor con <code>npm run dev</code>.
            </p>
          </div>
          <p className="security-note">
            No uses la clave <code>service_role</code> en el navegador.
          </p>
        </section>
      </main>
    );
  }
  if (authLoading)
    return (
      <main className="loading-page">
        <span className="spinner" />
        Verificando sesión…
      </main>
    );
  if (!session) return <AuthForm />;
  if (passwordSetupRequired) {
    return (
      <PasswordSetupForm
        onComplete={async () => {
          await refreshAccessContext();
          setPasswordSetupRequired(false);
        }}
      />
    );
  }
  if (accessLoading)
    return (
      <main className="loading-page">
        <span className="spinner" />
        Verificando empresa y permisos…
      </main>
    );
  if (!accessContext) {
    return (
      <main className="setup-page">
        <section className="setup-card">
          <p className="eyebrow">ACCESO NO DISPONIBLE</p>
          <h1>No se pudo validar tu empresa</h1>
          <p className="muted" role="alert">
            {loadError || "Contacta al administrador de la plataforma."}
          </p>
          <button
            className="button secondary"
            onClick={() => void handleSignOut()}
            type="button"
          >
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  }
  if (!accessContext.active_company_id && !accessContext.is_platform_admin) {
    return (
      <main className="setup-page">
        <section className="setup-card">
          <p className="eyebrow">EMPRESA PENDIENTE</p>
          <h1>Tu cuenta aún no tiene una empresa asignada</h1>
          <p className="muted">
            Solicita al administrador de la plataforma que te invite a la
            empresa correspondiente.
          </p>
          <button
            className="button secondary"
            onClick={() => void handleSignOut()}
            type="button"
          >
            Cerrar sesión
          </button>
        </section>
      </main>
    );
  }
  const moduleTitles = {
    dashboard: "Panel general",
    inventory: "Inventario",
    costs: "Costos de impresión",
    orders: "Pedidos",
    payments: "Pagos",
    refunds: "Devoluciones",
    productReturns: "Devoluciones de producto",
    fiscal: "Cotizaciones y cuentas de cobro",
    printers: "Impresoras",
    catalog: "Catálogo",
    customers: "Clientes",
    suppliers: "Proveedores",
    reports: "Reportes",
    settings: "Configuración",
    admin: "Empresas y usuarios",
  };
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="sidebar-brand" href="#">
          <img alt="3D Admin" className="sidebar-brand-logo" src={appLogo} />
        </a>
        <p className="nav-label">GESTIÓN</p>
        <nav aria-label="Navegación principal">
          {accessContext.is_platform_admin && (
            <button
              className={`nav-link ${activeModule === "admin" ? "active" : ""}`}
              onClick={() => setActiveModule("admin")}
              type="button"
            >
              <Shield size={18} />
              Administración global
            </button>
          )}
          {accessContext.active_company_id && (
            <>
          <button
            className={`nav-link ${activeModule === "dashboard" ? "active" : ""}`}
            onClick={() => setActiveModule("dashboard")}
            type="button"
          >
            <House size={18} />
            Panel general
          </button>
          <button
            className={`nav-link ${activeModule === "inventory" ? "active" : ""}`}
            onClick={() => setActiveModule("inventory")}
            type="button"
          >
            <Layers3 size={18} />
            Inventario
          </button>
          <button
            className={`nav-link ${activeModule === "costs" ? "active" : ""}`}
            onClick={() => setActiveModule("costs")}
            type="button"
          >
            <Calculator size={18} />
            Costos
          </button>
          <button
            className={`nav-link ${activeModule === "orders" ? "active" : ""}`}
            onClick={() => setActiveModule("orders")}
            type="button"
          >
            <ClipboardList size={18} />
            Pedidos
          </button>
          <button
            className={`nav-link ${activeModule === "payments" ? "active" : ""}`}
            onClick={() => setActiveModule("payments")}
            type="button"
          >
            <CreditCard size={18} />
            Pagos
          </button>
          <button
            className={`nav-link ${activeModule === "refunds" ? "active" : ""}`}
            onClick={() => setActiveModule("refunds")}
            type="button"
          >
            <RotateCcw size={18} />
            Devoluciones
          </button>
          <button
            className={`nav-link ${activeModule === "productReturns" ? "active" : ""}`}
            onClick={() => setActiveModule("productReturns")}
            type="button"
          >
            <RotateCcw size={18} />
            Devolución de producto
          </button>
          <button
            className={`nav-link ${activeModule === "printers" ? "active" : ""}`}
            onClick={() => setActiveModule("printers")}
            type="button"
          >
            <Printer size={18} />
            Impresoras
          </button>
          <button
            className={`nav-link ${activeModule === "catalog" ? "active" : ""}`}
            onClick={() => setActiveModule("catalog")}
            type="button"
          >
            <BookOpen size={18} />
            Catálogo
          </button>
          <button
            className={`nav-link ${activeModule === "customers" ? "active" : ""}`}
            onClick={() => setActiveModule("customers")}
            type="button"
          >
            <UserRound size={18} />
            Clientes
          </button>
          <button
            className={`nav-link ${activeModule === "suppliers" ? "active" : ""}`}
            onClick={() => setActiveModule("suppliers")}
            type="button"
          >
            <Building2 size={18} />
            Proveedores
          </button>
          <button
            className={`nav-link ${activeModule === "reports" ? "active" : ""}`}
            onClick={() => setActiveModule("reports")}
            type="button"
          >
            <ChartNoAxesCombined size={18} />
            Reportes
          </button>
          <button
            className={`nav-link ${activeModule === "fiscal" ? "active" : ""}`}
            onClick={() => setActiveModule("fiscal")}
            type="button"
          >
            <FileText size={18} />
            Cotizaciones
          </button>
            </>
          )}
        </nav>
        <div className="sidebar-bottom">
          <span className="nav-link disabled">
            <CircleHelp size={18} />
            Ayuda
          </span>
          {accessContext.active_company_id && (
            <button
              className={`nav-link ${activeModule === "settings" ? "active" : ""}`}
              onClick={() => setActiveModule("settings")}
              type="button"
            >
              <Settings2 size={18} />
              Configuración
            </button>
          )}
          <div className="account-row">
            <span className="avatar">
              {session.user.email?.slice(0, 1).toUpperCase() ?? "U"}
            </span>
            <span className="account-email">{session.user.email}</span>
            <button
              aria-label="Cerrar sesión"
              className="icon-button"
              onClick={() => {
                void handleSignOut();
              }}
            >
              <LogOut size={17} />
            </button>
          </div>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <div>
            <span className="breadcrumb">Taller</span>
            <span className="breadcrumb-separator">/</span>
            <strong>{moduleTitles[activeModule]}</strong>
          </div>
          <div className="topbar-status">
            {accessContext.active_company_name && (
              <span className="active-company">
                <Building2 size={15} />
                {accessContext.active_company_name}
              </span>
            )}
            <span className="status-indicator">
              <span />
              Conectado
            </span>
          </div>
        </header>
        <section className="page-content">
          {activeModule === "admin" && accessContext.is_platform_admin && (
            <AdminModule
              activeCompanyId={accessContext.active_company_id}
              onCompanyChanged={refreshAccessContext}
            />
          )}
          {activeModule === "dashboard" && (
            <Dashboard onNavigate={setActiveModule} rolls={rolls} />
          )}
          {loadError && activeModule === "inventory" && (
            <p className="message error" role="alert">
              {loadError}
            </p>
          )}
          {activeModule === "inventory" && (
            <InventoryModule
              loadingRolls={loadingRolls}
              onRollsChanged={loadRolls}
              rolls={rolls}
            />
          )}
          {activeModule === "costs" && <CostCalculator rolls={rolls} />}
          {activeModule === "orders" && (
            <OrdersModule onInventoryUpdated={loadRolls} rolls={rolls} />
          )}
          {activeModule === "payments" && <PaymentsModule />}
          {activeModule === "refunds" && <RefundsModule />}
          {activeModule === "productReturns" && <ProductReturnsModule />}
          {activeModule === "printers" && <PrintersModule />}
          {activeModule === "catalog" && <CatalogModule />}
          {activeModule === "customers" && <CustomersModule />}
          {activeModule === "suppliers" && <SuppliersModule />}
          {activeModule === "reports" && <ReportsModule />}
          {activeModule === "fiscal" && <FiscalModule />}
          {activeModule === "settings" && <SettingsModule />}
        </section>
      </main>
    </div>
  );
}
