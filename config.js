// config.js - Configuração com Persistência Robusta e Acesso Administrativo

const SUPABASE_URL = "https://ngzcnxbnyhmgatvdenxc.supabase.co"; 
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nemNueGJueWhtZ2F0dmRlbnhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTgzMjUsImV4cCI6MjA5MTA5NDMyNX0.yMM7GCq_nRFLNcb9R7jXI2-yDyIp_bx1Ns-jSGhu1Tk"; 

// Chave de serviço para permitir alteração de senhas de terceiros pelo Admin
// Pegue esta chave no painel do Supabase em: Settings -> API -> service_role (secret)
const SUPABASE_SERVICE_ROLE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5nemNueGJueWhtZ2F0dmRlbnhjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTUxODMyNSwiZXhwIjoyMDkxMDk0MzI1fQ.i8Qxwk2KzR0pI1CbWs_BYEfqoJvjkafNbGytS-i81rQ";

// Cliente Padrão (Usado no App do Motorista e consultas comuns)
const clienteSupabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
        storage: window.localStorage, 
        autoRefreshToken: true,
        persistSession: true, 
        detectSessionInUrl: false
    }
});

/**
 * Função auxiliar para obter um cliente administrativo sob demanda.
 * Usamos uma função para não manter uma sessão persistente com a service_role ativa sem necessidade.
 */
function obterSupabaseAdmin() {
    return supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}