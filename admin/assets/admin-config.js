// =====================================================================
// Configuração da área ADMINISTRATIVA — separada da configuração do site
// do usuário comum. Mesmo projeto Supabase, mas guarda de acesso própria.
// =====================================================================

const SUPABASE_URL = "https://rgfgdbdlghsbgspepudc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MpNsE9ZCq_XAyeCwwzLcKg_gFIJ4aHr";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Exige sessão ativa E role de admin/moderador. Qualquer outro caso
// desloga na hora e manda de volta pro login administrativo.
async function exigirAdmin() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = "login.html";
        return null;
    }

    const { data: perfil } = await supabaseClient
        .from("usuarios_perfil")
        .select("role, nome")
        .eq("id", session.user.id)
        .single();

    if (!perfil || !["admin", "moderador"].includes(perfil.role)) {
        await supabaseClient.auth.signOut();
        window.location.href = "login.html?erro=acesso_negado";
        return null;
    }

    return { session, role: perfil.role, nome: perfil.nome };
}

async function fazerLogoutAdmin() {
    await supabaseClient.auth.signOut();
    window.location.href = "login.html";
}
