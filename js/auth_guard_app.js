async function verificarAcessoApp() {
    const { data: { session } } = await clienteSupabase.auth.getSession();

    if (!session) {
        window.location.href = '../index.html'; 
        return;
    }

    try {
        const { data: perfil } = await clienteSupabase
            .from('perfis')
            .select('funcao')
            .eq('id', session.user.id)
            .single();

        if (!perfil) return;

        const usuarioEmail = session.user.email || "";
        const funcaoUser = perfil.funcao.toLowerCase();

        // Se manutentor tentar usar conta de e-mail no App, redireciona para o Admin
        if ((funcaoUser === 'manutencao' || funcaoUser === 'manutentor') && !usuarioEmail.includes('@frota.com')) {
            window.location.href = '../admin/index.html';
        }
    } catch (e) {
        console.error("Erro no guard app:", e);
    }
}
verificarAcessoApp();