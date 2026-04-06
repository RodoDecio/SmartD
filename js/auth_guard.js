async function verificarPermissaoAdmin() {
    try {
        const { data: { session }, error: sessionError } = await clienteSupabase.auth.getSession();

        if (sessionError || !session) {
            window.location.href = '../index.html';
            return;
        }

        const { data: perfil, error: profileError } = await clienteSupabase
            .from('perfis')
            .select('funcao')
            .eq('id', session.user.id)
            .single();

        if (profileError || !perfil) {
            await clienteSupabase.auth.signOut();
            window.location.href = '../index.html?error=perfil_invalido';
            return;
        }

        const usuarioEmail = session.user.email || "";
        const funcaoUser = perfil.funcao.toLowerCase();

        // Bloqueio de Motoristas no Admin
        if (funcaoUser === 'motorista') {
            alert("Acesso Negado: Esta área é restrita para a gestão.");
            window.location.href = '../app/index.html'; 
            return;
        }

        // Bloqueio de Manutentores usando conta de CPF no Admin
        if ((funcaoUser === 'manutencao' || funcaoUser === 'manutentor') && usuarioEmail.includes('@frota.com')) {
            alert("Acesso Negado: Para o administrativo, utilize seu login de e-mail.");
            window.location.href = '../app/manutencao.html';
            return;
        }

        console.log("Acesso autorizado para:", perfil.funcao);

    } catch (err) {
        window.location.href = '../index.html?error=system_failure';
    }
}
verificarPermissaoAdmin();