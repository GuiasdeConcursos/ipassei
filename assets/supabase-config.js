// =====================================================================
// Configuração de conexão com o Supabase
// A "anon key" é pública por natureza — quem protege os dados é o RLS
// configurado no banco (Fase 1 do roteiro).
// =====================================================================

const SUPABASE_URL = "https://rgfgdbdlghsbgspepudc.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_MpNsE9ZCq_XAyeCwwzLcKg_gFIJ4aHr";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Redireciona para o login se não houver sessão ativa.
// Use em páginas que exigem usuário logado (dashboard, perfil).
async function exigirLogin() {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session) {
        window.location.href = "login.html";
        return null;
    }
    return session;
}

async function fazerLogout() {
    await supabaseClient.auth.signOut();
    window.location.href = "index.html";
}
