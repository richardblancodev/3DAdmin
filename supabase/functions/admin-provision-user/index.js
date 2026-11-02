import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function respond(status, body, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Access-Control-Allow-Origin": origin,
      Vary: "Origin",
    },
  });
}

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

Deno.serve(async (request) => {
  const allowedOrigin = normalizeOrigin(Deno.env.get("APP_ORIGIN"));
  const requestOrigin = request.headers.get("Origin");
  const localDevOrigins = new Set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
  ]);
  const normalizedRequestOrigin = normalizeOrigin(requestOrigin);
  const originIsAllowed =
    normalizedRequestOrigin &&
    (normalizedRequestOrigin === allowedOrigin ||
      localDevOrigins.has(normalizedRequestOrigin));
  const corsOrigin = originIsAllowed
    ? normalizedRequestOrigin
    : allowedOrigin ?? "http://localhost:5173";

  if (request.method === "OPTIONS") {
    if (requestOrigin && !originIsAllowed) {
      return respond(403, { error: "Origen no autorizado." }, corsOrigin);
    }
    return new Response("ok", {
      headers: {
        ...corsHeaders,
        "Access-Control-Allow-Origin": corsOrigin,
        Vary: "Origin",
      },
    });
  }
  if (request.method !== "POST") {
    return respond(405, { error: "Método no permitido." }, corsOrigin);
  }
  if (requestOrigin && !originIsAllowed) {
    return respond(403, { error: "Origen no autorizado." }, corsOrigin);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return respond(500, { error: "Falta configurar el servicio de administración." }, corsOrigin);
  }

  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return respond(401, { error: "Se requiere iniciar sesión." }, corsOrigin);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) {
    return respond(401, { error: "La sesión no es válida." }, corsOrigin);
  }

  const { data: adminRecord, error: adminError } = await adminClient
    .from("platform_admins")
    .select("user_id")
    .eq("user_id", authData.user.id)
    .maybeSingle();
  if (adminError) {
    return respond(500, { error: "No se pudo verificar el permiso de administrador." }, corsOrigin);
  }
  if (!adminRecord) {
    return respond(403, { error: "Solo un administrador global puede crear usuarios." }, corsOrigin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return respond(400, { error: "La solicitud debe contener JSON válido." }, corsOrigin);
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return respond(400, { error: "La solicitud debe contener un objeto JSON." }, corsOrigin);
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const companyId = typeof body.company_id === "string" ? body.company_id : "";
  const companyName =
    typeof body.company_name === "string" ? body.company_name.trim() : "";
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    Boolean(companyId) === Boolean(companyName) ||
    (companyId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(companyId)) ||
    companyName.length > 160 ||
    (companyName && companyName.length < 2)
  ) {
    return respond(400, {
      error: "Indica un correo válido y selecciona una empresa existente o escribe el nombre de una nueva.",
    }, corsOrigin);
  }

  let createdCompanyId = null;
  let invitedUserId = null;
  try {
    let targetCompanyId = companyId;
    if (companyName) {
      const { data: company, error: companyError } = await adminClient
        .from("companies")
        .insert({ name: companyName, created_by: authData.user.id })
        .select("id")
        .single();
      if (companyError) throw companyError;
      targetCompanyId = company.id;
      createdCompanyId = company.id;
    } else {
      const { data: company, error: companyError } = await adminClient
        .from("companies")
        .select("id")
        .eq("id", companyId)
        .maybeSingle();
      if (companyError) throw companyError;
      if (!company) throw new Error("No se encontró la empresa seleccionada.");
    }

    const inviteOptions = {};
    const redirectTo = Deno.env.get("AUTH_REDIRECT_URL");
    if (redirectTo) inviteOptions.redirectTo = redirectTo;
    const { data: inviteData, error: inviteError } =
      await adminClient.auth.admin.inviteUserByEmail(email, inviteOptions);
    if (inviteError) throw inviteError;
    if (!inviteData.user) throw new Error("Supabase no devolvió el usuario invitado.");
    invitedUserId = inviteData.user.id;

    const { error: membershipError } = await adminClient
      .from("company_memberships")
      .insert({
        company_id: targetCompanyId,
        user_id: invitedUserId,
        role: "member",
      });
    if (membershipError) throw membershipError;

    const { error: profileError } = await adminClient
      .from("user_profiles")
      .upsert(
        { user_id: invitedUserId, active_company_id: targetCompanyId },
        { onConflict: "user_id" },
      );
    if (profileError) throw profileError;

    return respond(200, {
      message: `Se envió una invitación a ${email}.`,
      company_id: targetCompanyId,
    }, corsOrigin);
  } catch (error) {
    const cleanupErrors = [];
    if (invitedUserId) {
      const { error: deleteUserError } =
        await adminClient.auth.admin.deleteUser(invitedUserId);
      if (deleteUserError) cleanupErrors.push(deleteUserError.message);
    }
    if (createdCompanyId) {
      const { error: deleteCompanyError } = await adminClient
        .from("companies")
        .delete()
        .eq("id", createdCompanyId);
      if (deleteCompanyError) cleanupErrors.push(deleteCompanyError.message);
    }
    const detail =
      error instanceof Error ? error.message : "Error desconocido al crear usuario.";
    return respond(400, {
      error: cleanupErrors.length
        ? `${detail} Además, falló la limpieza: ${cleanupErrors.join("; ")}`
        : detail,
    }, corsOrigin);
  }
});
