// admin/js/users.js - CORRIGIDO (GRAVAÇÃO DE UNIDADE PRINCIPAL)

let listaUsuariosCache = [];
let listaUnidadesCache = [];
let formSujo = false;
let dadosOriginaisEdicao = null;


// =============================================================================
// 1. INICIALIZAÇÃO
// =============================================================================

function inicializarUsuarios(unidadeId) {
    document.getElementById('titulo-pagina').innerText = 'Gestão de Usuários';
    
    configurarFormularioUsuario(); 

    // Busca o botão "+ Adicionar Filtro" e troca a função que ele chama
    const btnAdd = document.querySelector('button[onclick*="adicionarLinhaFiltro"]');
    if (btnAdd) {
        // Clona o botão para limpar event listeners antigos
        const novoBtn = btnAdd.cloneNode(true);
        
        // --- CORREÇÃO: Remove o atributo onclick do HTML para evitar disparo duplo ---
        novoBtn.removeAttribute('onclick'); 
        
        novoBtn.addEventListener('click', (e) => {
            e.preventDefault();
            adicionarLinhaFiltroUsuariosExclusivo();
        });
        
        btnAdd.parentNode.replaceChild(novoBtn, btnAdd);
    }

    // Limpa e inicializa o primeiro filtro corretamente
    const containerFiltros = document.getElementById('container-filtros');
    if (containerFiltros) {
        containerFiltros.innerHTML = "";
        adicionarLinhaFiltroUsuariosExclusivo(); 
    }
    
    buscarDadosUsuarios(unidadeId);
}

function configurarFormularioUsuario() {
    const form = document.getElementById('form-usuario');
    if(!form) return;
    
    // Clona para limpar eventos antigos e evitar duplicidade
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    
    // Reatribui o evento de submit
    newForm.addEventListener('submit', salvarUsuario);

    // Máscara de Login
    const inputLogin = document.getElementById('usr-login');
    if (inputLogin) inputLogin.addEventListener('input', aplicarMascaraLogin);
    
    // Usamos 'change' para selects/checkboxes e 'input' para digitação
    newForm.querySelectorAll('input, select, textarea').forEach(el => {
        el.addEventListener('input', () => { formSujo = true; });
        el.addEventListener('change', () => { formSujo = true; });
    });
}

// =============================================================================
// 2. INTEGRAÇÃO COM SUPABASE
// =============================================================================

async function buscarDadosUsuarios(unidadeId = null) {
    const tbody = document.getElementById('tbody-usuarios');
    if(tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Atualizando lista...</td></tr>';

    try {
        if (!unidadeId) unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";

        // --- CARREGAMENTO DE UNIDADES ---
        const user = await clienteSupabase.auth.getUser();
        const meuId = user.data.user?.id;
        
        const minhaFuncao = usuarioLogadoGlobal?.funcao || '';
        const temAcessoGlobal = ['admin', 'coordenador', 'especialista'].includes(minhaFuncao);

        if (temAcessoGlobal) {
            // PERFIL GLOBAL: Busca todas as unidades ativas
            const { data } = await clienteSupabase
                .from('unidades')
                .select('*')
                .eq('ativo', true)
                .order('nome')
                .limit(1000); 
            listaUnidadesCache = data || [];
        } else {
            // PERFIL RESTRITO: Busca apenas unidades vinculadas ao usuário logado
            const { data: meusLinks } = await clienteSupabase
                .from('perfis_unidades')
                .select('unidade_id')
                .eq('perfil_id', meuId);
            
            const idsPermitidos = (meusLinks || []).map(l => l.unidade_id);
            
            if (idsPermitidos.length > 0) {
                const { data } = await clienteSupabase
                    .from('unidades')
                    .select('*')
                    .in('id', idsPermitidos)
                    .eq('ativo', true) 
                    .order('nome')
                    .limit(1000);
                listaUnidadesCache = data || [];
            } else {
                listaUnidadesCache = [];
            }
        }

        // --- CARREGAMENTO DE USUÁRIOS ---
        // Retirei o '!inner' para garantir que traga usuários mesmo que ainda não tenham acessos múltiplos marcados
        let query = clienteSupabase
            .from('perfis')
            .select(`*, perfis_unidades (unidades ( id, nome ))`)
            .order('nome_completo');

        if (unidadeId !== "TODAS") {
            // [CORREÇÃO ALVO]: Agora a consulta ao banco filtra estritamente pela unidade de lotação (unidade_id)
            query = query.eq('unidade_id', unidadeId);
        }

        const { data: perfis, error } = await query;
        if (error) throw error;
        
        // =================================================================
        // FILTRO DE DESDUPLICAÇÃO (Prioriza E-mail Real sobre CPF)
        // =================================================================
        const perfisUnicos = Object.values((perfis || []).reduce((acc, u) => {
            const chaveNome = (u.nome_completo || "sem-nome").trim().toLowerCase();
            
            if (!acc[chaveNome]) {
                acc[chaveNome] = u; // Se não existe no acumulador, adiciona
            } else {
                const isCpfAntigo = acc[chaveNome].email && acc[chaveNome].email.includes('@frota.com');
                const isCpfNovo = u.email && u.email.includes('@frota.com');

                if (isCpfAntigo && !isCpfNovo) {
                    acc[chaveNome] = u;
                }
            }
            return acc;
        }, {}));

        // Salva a lista limpa e sem duplicatas no cache
        listaUsuariosCache = perfisUnicos;
        
        atualizarTabela();
    } catch (erro) {
        console.error(erro);
        mostrarToast("Erro ao carregar usuários.", "error");
    }
}

window.salvarUsuario = async function(e) {
    if(e) e.preventDefault(); 
    
    // [OTIMIZAÇÃO] Se for edição (tem ID) e o formulário não foi alterado, aborta.
    const id = document.getElementById('usr-id').value;
    if (id && typeof formSujo !== 'undefined' && !formSujo) {
        mostrarToast("Nenhuma alteração realizada.", "info");
        return;
    }

    const btn = e ? e.submitter : document.querySelector('#modal-usuario .btn-primary'); 
    if(!btn || btn.innerText.includes("Fechar")) return; 

    // --- 1. CAPTURA DE DADOS ---
    const nome = document.getElementById('usr-nome').value.trim();
    const loginRaw = document.getElementById('usr-login').value.trim();
    const senha = document.getElementById('usr-senha').value;
    const perfil = document.getElementById('usr-perfil').value;
    const lotacaoId = document.getElementById('usr-unidade-lotacao').value;
    
    // [NOVO] Captura dos novos campos
    const matricula = document.getElementById('usr-matricula').value.trim();
    const observacao = document.getElementById('usr-observacao').value.trim();

    if (!lotacaoId) {
        mostrarToast("Selecione a Unidade de Lotação.", "error");
        return;
    }

    // Tratamento de login (CPF ou Email)
    const apenasNumeros = loginRaw.replace(/\D/g, '');
    let emailFinal = loginRaw;
    // Se for 11 dígitos e não tiver @, assume que é CPF e adiciona sufixo
    if (apenasNumeros.length === 11 && !loginRaw.includes('@')) {
        emailFinal = `${apenasNumeros}@frota.com`;
    }

    // Feedback visual de carregamento
    const txtOriginal = btn.innerText;
    btn.innerText = "Gravando...";
    btn.disabled = true;

    try {
        const supabaseAdmin = obterSupabaseAdmin();
        let perfilIdFinal = id;
        let acaoLog = id ? 'UPDATE' : 'INSERT';
        const mudouSenha = senha && senha.length > 0;

        if (!id) {
            // =================================================================
            // CASO: NOVO USUÁRIO (INSERT)
            // =================================================================
            if (!senha) throw new Error("Senha é obrigatória para novos usuários.");

            // 1. Cria no Supabase Auth
            const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
                email: emailFinal,
                password: senha,
                email_confirm: true,
                user_metadata: { full_name: nome }
            });

            if (authError) throw authError;
            perfilIdFinal = authData.user.id;

            // 2. Insere no banco público (Tabela perfis)
            const { error: errPerfil } = await clienteSupabase.from('perfis').insert([{ 
                id: perfilIdFinal, 
                nome_completo: nome, 
                email: emailFinal, 
                funcao: perfil, 
                unidade_id: lotacaoId,
                matricula: matricula || null, // Campo Novo
                observacao: observacao || null, // Campo Novo
                ativo: true 
            }]);
            
            if (errPerfil) throw errPerfil;

        } else {
            // =================================================================
            // CASO: ATUALIZAÇÃO (UPDATE)
            // =================================================================
            const mudouEmail = emailFinal !== dadosOriginaisEdicao.email;

            // 1. Atualiza Auth se necessário (Email ou Senha)
            if (mudouEmail || mudouSenha) {
                const updateAuthData = {};
                if (mudouEmail) updateAuthData.email = emailFinal;
                if (mudouSenha) updateAuthData.password = senha;

                const { error: authUpdateError } = await supabaseAdmin.auth.admin.updateUserById(id, updateAuthData);
                if (authUpdateError) throw authUpdateError;
            }

            // 2. Atualiza Perfil Público
            const { error: errorUpdate } = await clienteSupabase.from('perfis').update({ 
                nome_completo: nome, 
                funcao: perfil, 
                unidade_id: lotacaoId,
                email: emailFinal,
                matricula: matricula || null, // Campo Novo
                observacao: observacao || null  // Campo Novo
            }).eq('id', id);
            
            if (errorUpdate) throw errorUpdate;
        }

        // =================================================================
        // 3. VÍNCULOS DE ACESSO (Unidades)
        // =================================================================
        const checkboxes = document.querySelectorAll('.chk-unidade-item:checked');
        let idsUnidadesAtuais = Array.from(checkboxes).map(cb => parseInt(cb.value));

        // Regra de Negócio: A unidade de lotação deve sempre estar nos acessos
        if (!idsUnidadesAtuais.includes(parseInt(lotacaoId))) {
            idsUnidadesAtuais.push(parseInt(lotacaoId));
        }

        // Limpa vínculos antigos e recria (Estratégia mais segura para N:N)
        await clienteSupabase.from('perfis_unidades').delete().eq('perfil_id', perfilIdFinal);
        
        if (idsUnidadesAtuais.length > 0) {
            const insertsAcesso = idsUnidadesAtuais.map(uid => ({ 
                perfil_id: perfilIdFinal, 
                unidade_id: uid 
            }));
            const { error: errorAcesso } = await clienteSupabase.from('perfis_unidades').insert(insertsAcesso);
            if (errorAcesso) throw errorAcesso;
        }

        // =================================================================
        // 4. LOG DE AUDITORIA ROBUSTO
        // =================================================================
        const { data: { user: userLogado } } = await clienteSupabase.auth.getUser();
        
        // Helper para pegar nome da unidade pelo ID
        const getNomeUnidade = (uid) => listaUnidadesCache?.find(u => u.id == uid)?.nome || `ID ${uid}`;
        
        // Gera lista de nomes de unidades ordenada para o log
        const nomesUnidadesLog = idsUnidadesAtuais.map(uid => getNomeUnidade(uid)).sort().join(', ');

        // Objeto representando o estado ATUAL salvo
        const dadosLogNovos = {
            nome_completo: nome,
            email: emailFinal,
            funcao: perfil,
            matricula: matricula, // Loga a matrícula
            observacao: observacao, // Loga a observação
            unidade_principal: getNomeUnidade(lotacaoId),
            unidades_acesso: nomesUnidadesLog
        };

        // Injeta informação de senha mascarada se houve alteração
        if (mudouSenha && acaoLog === 'UPDATE') {
            dadosLogNovos.senha = "(Alterada)";
            // Adiciona flag no objeto antigo para comparação visual no log
            if (dadosOriginaisEdicao) {
                dadosOriginaisEdicao.senha = "(Mantida)";
            }
        }

        const logPayload = {
            tabela_afetada: 'perfis', 
            acao: acaoLog, 
            id_registro_afetado: perfilIdFinal, 
            usuario_id: userLogado?.id, 
            dados_novos: JSON.stringify(dadosLogNovos),
            data_hora: new Date().toISOString()
        };

        // Se for edição, inclui o snapshot dos dados antes da alteração
        if (acaoLog === 'UPDATE' && dadosOriginaisEdicao) {
            logPayload.dados_antigos = JSON.stringify(dadosOriginaisEdicao);
        }

        await clienteSupabase.from('logs_auditoria').insert([logPayload]);

        // =================================================================
        // FINALIZAÇÃO
        // =================================================================
        mostrarToast("Usuário salvo com sucesso!", "success");
        fecharModalCheck(true); // Fecha forçando (pois já salvamos, então formSujo não importa)
        buscarDadosUsuarios();  // Recarrega a tabela

    } catch (err) {
        console.error("Erro ao salvar usuário:", err);
        mostrarToast("Erro: " + err.message, "error");
    } finally {
        // Restaura botão
        btn.innerText = txtOriginal; 
        btn.disabled = false;
    }
};

// =============================================================================
// 3. TABELA E FILTROS
// =============================================================================

function adicionarLinhaFiltroUsuariosExclusivo() {
    const container = document.getElementById('container-filtros');
    if(!container) return; 
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `f-${id}`;
    
    div.innerHTML = `
        <select class="filter-select" onchange="atualizarOpcoesFiltroUsuariosExclusivo(this)">
            <option value="" disabled selected>Filtrar por...</option>
            <option value="nome">Nome</option>
            <option value="perfil">Função</option>
            <option value="status">Status</option>
        </select>
        <select class="filter-select" disabled onchange="atualizarTabela()"></select>
        <input type="text" class="filter-select" style="display:none;" placeholder="Digite o nome..." onkeyup="atualizarTabela()">
        <button class="btn-remove-filter" onclick="document.getElementById('f-${id}').remove(); atualizarTabela()"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

function atualizarOpcoesFiltroUsuariosExclusivo(selectTipo) {
    const tipo = selectTipo.value;
    const selectValor = selectTipo.nextElementSibling;
    const inputTexto = selectValor.nextElementSibling;

    inputTexto.style.display = (tipo === 'nome') ? 'block' : 'none';
    selectValor.style.display = (tipo === 'nome') ? 'none' : 'block';
    selectValor.innerHTML = '<option value="">Todos</option>';
    selectValor.disabled = false;

    if (tipo === 'perfil') {
        ['motorista', 'manutentor', 'analista', 'coordenador', 'especialista', 'admin'].forEach(p => {
            selectValor.innerHTML += `<option value="${p}">${p.toUpperCase()}</option>`;
        });
    } 
    else if (tipo === 'status') {
        selectValor.innerHTML += `<option value="true">Ativo</option><option value="false">Inativo</option>`;
    }
}

function atualizarTabela() {
    const tbody = document.getElementById('tbody-usuarios');
    if(!tbody) return;
    tbody.innerHTML = '';
    let dados = [...listaUsuariosCache];

    // Aplicação dos Filtros Dinâmicos
    document.querySelectorAll('.filter-row').forEach(linha => {
        const tipo = linha.querySelector('select:first-child').value;
        const valorSelect = linha.querySelector('select:last-of-type');
        const inputTexto = linha.querySelector('input[type="text"]');
        const valor = (inputTexto && inputTexto.style.display !== 'none') ? inputTexto.value : valorSelect.value;
        
        if (tipo && valor) {
            dados = dados.filter(u => {
                if (tipo === 'perfil') return u.funcao === valor;
                if (tipo === 'status') return String(u.ativo) === valor;
                if (tipo === 'nome') return u.nome_completo.toLowerCase().includes(valor.toLowerCase());
                if (tipo === 'unidade') {
                    // Filtra pela unidade de lotação
                    return String(u.unidade_id) === String(valor);
                }
                return true;
            });
        }
    });

    // Atualiza contador
    document.getElementById('lbl-contagem').innerHTML = `Exibindo <strong>${dados.length}</strong> de <strong>${listaUsuariosCache.length}</strong>`;

    // Renderiza Linhas
    dados.forEach(u => {
        const isAtivo = u.ativo === true; 
        const tr = document.createElement('tr');
        
        // Tratamento visual do Login (CPF mascarado se for o caso)
        let loginDisplay = u.email;
        if (loginDisplay && loginDisplay.includes('@frota.com')) {
            loginDisplay = loginDisplay.split('@')[0].replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
        }
        
        // [CORREÇÃO ALVO]: Busca o nome da Unidade de Lotação usando o cache
        const nomeUnidadePrincipal = listaUnidadesCache.find(un => String(un.id) === String(u.unidade_id))?.nome || '-';
        
        // Colunas: Nome | Login | Função | Unidade de Lotação | Status | Ações
        tr.innerHTML = `
            <td><b>${u.nome_completo || 'Sem Nome'}</b></td>
            <td>${loginDisplay || '-'}</td>
            <td><span class="badge badge-coord">${u.funcao ? u.funcao.toUpperCase() : '-'}</span></td>
            <td><b>${nomeUnidadePrincipal}</b></td>
            <td><span class="badge ${isAtivo ? 'badge-ativo' : 'badge-inativo'}">${isAtivo ? 'ATIVO' : 'INATIVO'}</span></td>
            <td style="white-space: nowrap;">
                 <button class="action-btn" onclick="visualizarUsuario('${u.id}')" title="Visualizar"><i class="fas fa-eye" style="color: #003399;"></i></button>
                 <button class="action-btn" onclick="abrirModalLogsUsuario('${u.id}')" title="Logs"><i class="fas fa-history"></i></button>
                 <button class="action-btn" onclick="abrirModalUsuario('${u.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                 <button class="action-btn" onclick="alternarStatusUsuario('${u.id}', ${isAtivo})" style="color:${isAtivo ? 'var(--cor-sucesso)' : '#ccc'}" title="Ativar/Inativar">
                    <i class="fas ${isAtivo ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                 </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =============================================================================
// 4. STATUS E LOGS
// =============================================================================

async function alternarStatusUsuario(id, statusAtual) {
    try {
        const { error } = await clienteSupabase.from('perfis').update({ ativo: !statusAtual }).eq('id', id);
        if (error) throw error;
        
        const userLogado = (await clienteSupabase.auth.getUser()).data.user;
        
        // LOG DE AUDITORIA: Registra o estado anterior e o novo
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'perfis', 
            acao: 'UPDATE_STATUS', 
            id_registro_afetado: id, 
            usuario_id: userLogado?.id, 
            dados_antigos: JSON.stringify({ ativo: statusAtual }),
            dados_novos: JSON.stringify({ ativo: !statusAtual }),
            data_hora: new Date().toISOString()
        }]);

        await buscarDadosUsuarios(document.getElementById('sel-unidade')?.value || "TODAS"); 
    } catch (err) { 
        console.error(err); 
        mostrarToast("Erro ao alterar status: " + err.message, "error");
    }
}

async function abrirModalLogsUsuario(idRegistro) {
    // Não precisamos mais do mapaTraducao complexo pois já salvamos os nomes no JSON
    if(typeof abrirModalLogsGlobal === 'function') {
        abrirModalLogsGlobal('perfis', idRegistro, 'Histórico do Usuário');
    }
}

// =============================================================================
// 5. MODAIS E AUXILIARES
// =============================================================================

async function abrirModalUsuario(id = null) {
    // 1. Reseta estado inicial
    formSujo = false; 
    dadosOriginaisEdicao = null;
    const modal = document.getElementById('modal-usuario');
    const form = document.getElementById('form-usuario');
    const btnSalvar = form.querySelector('button[type="submit"]');

    form.reset();
    document.getElementById('usr-id').value = '';
    
    // [NOVO] Reseta a visualização para a primeira aba sempre que abrir
    if (typeof alternarAbaUsuario === 'function') {
        alternarAbaUsuario('geral');
    }

    // Reset inicial de estado: Habilita todos os campos e mostra o botão salvar
    form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = false);
    btnSalvar.style.display = 'block';
    btnSalvar.disabled = false;

    // Popula o select de Unidade de Lotação com dados do cache
    const selLotacao = document.getElementById('usr-unidade-lotacao');
    selLotacao.innerHTML = '<option value="">Selecione a Lotação...</option>';
    if (typeof listaUnidadesCache !== 'undefined' && listaUnidadesCache.length > 0) {
        listaUnidadesCache.forEach(u => {
            selLotacao.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
        });
    }

    if (id) {
        // =================================================================
        // MODO EDIÇÃO
        // =================================================================
        document.getElementById('modal-titulo').innerText = 'Editar Usuário';
        
        // Busca o usuário no cache local para evitar nova requisição desnecessária
        const u = listaUsuariosCache.find(x => x.id === id);
        
        if(u) {
            // --- REGRAS DE PERMISSÃO ---
            if (typeof usuarioLogadoGlobal !== 'undefined') {
                const meuId = usuarioLogadoGlobal.id;
                const minhaFuncao = (usuarioLogadoGlobal.funcao || '').toLowerCase();
                const funcaoAlvo = (u.funcao || '').toLowerCase();
                
                let bloquear = false;
                let motivo = '';

                // REGRA 1: Usuário (exceto Coordenador/Admin) não pode editar a si mesmo
                if (meuId === u.id && minhaFuncao !== 'coordenador' && minhaFuncao !== 'admin') {
                    bloquear = true;
                    motivo = "Você não tem permissão para alterar seu próprio cadastro.";
                }

                // REGRA 2: Analista não pode editar Especialista ou Coordenador
                if (minhaFuncao === 'analista' && ['especialista', 'coordenador', 'admin'].includes(funcaoAlvo)) {
                    bloquear = true;
                    motivo = "Analistas não podem alterar dados de Especialistas ou Coordenadores.";
                }

                // SE BLOQUEADO: Transforma o modal em "Modo Leitura"
                if (bloquear) {
                    if(typeof mostrarToast === 'function') mostrarToast(motivo, "warning");
                    document.getElementById('modal-titulo').innerText = 'Detalhes (Leitura)';
                    form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
                    btnSalvar.style.display = 'none';
                }
            }
            // ---------------------------

            // Preenchimento dos Campos Principais
            document.getElementById('usr-id').value = u.id;
            document.getElementById('usr-nome').value = u.nome_completo;
            document.getElementById('usr-perfil').value = u.funcao; 
            
            // [NOVO] Preenchendo campos novos
            document.getElementById('usr-matricula').value = u.matricula || '';
            document.getElementById('usr-observacao').value = u.observacao || '';

            // Tratamento visual do Login (CPF ou E-mail)
            const emailValue = u.email || "";
            document.getElementById('usr-login').value = emailValue.includes('@frota.com') 
                ? emailValue.split('@')[0].replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") 
                : emailValue;
            
            // Define unidade de lotação
            selLotacao.value = u.unidade_id || ""; 

            // Identifica e marca os checkboxes de acesso
            const idsAtuais = u.perfis_unidades ? u.perfis_unidades.map(item => item.unidades?.id).filter(Boolean) : [];
            renderizarCheckboxesUnidades(idsAtuais);
            
            // --- CRIAÇÃO DO SNAPSHOT ORIGINAL (PARA LOG DE AUDITORIA) ---
            const getNome = (uid) => listaUnidadesCache.find(x => x.id == uid)?.nome || uid;
            
            // Gera lista de nomes de unidades ordenada para comparação precisa
            const listaNomesUnidades = idsAtuais.map(uid => getNome(uid)).sort().join(', ');

            dadosOriginaisEdicao = { 
                nome_completo: u.nome_completo, 
                email: u.email, 
                funcao: u.funcao, 
                matricula: u.matricula, // Incluído no snapshot
                observacao: u.observacao, // Incluído no snapshot
                unidade_principal: getNome(u.unidade_id), 
                unidades_acesso: listaNomesUnidades
                // A senha não entra aqui; se for alterada, o log registra explicitamente a mudança.
            };
        }
    } else {
        // =================================================================
        // MODO NOVO USUÁRIO
        // =================================================================
        document.getElementById('modal-titulo').innerText = 'Novo Usuário';
        renderizarCheckboxesUnidades([]); // Renderiza checkboxes vazios
    }
    
    // Exibe o modal
    modal.classList.add('active');

    setTimeout(() => { formSujo = false; }, 100);
}

function renderizarCheckboxesUnidades(idsSelecionados = []) {
    const container = document.getElementById('container-checkbox-unidades');
    const alvo = container || document.getElementById('lista-unidades-check');
    
    if(!alvo) return;
    alvo.innerHTML = '';

    if (!listaUnidadesCache || listaUnidadesCache.length === 0) {
        alvo.innerHTML = '<p style="text-align:center; color:#999;">Nenhuma unidade disponível.</p>';
        return;
    }

    const todasMarcadas = listaUnidadesCache.length > 0 && 
                          listaUnidadesCache.every(u => idsSelecionados.includes(u.id));

    // --- CHECKBOX MESTRE "MARCAR TODAS" ---
    const divHeader = document.createElement('div');
    divHeader.style.cssText = 'padding-bottom:8px; margin-bottom:8px; border-bottom:1px solid #eee;';
    
    const labelTodas = document.createElement('label');
    labelTodas.style.cssText = 'cursor:pointer; font-weight:bold; color:#003366; display:flex; align-items:center;';
    
    const chkTodas = document.createElement('input');
    chkTodas.type = 'checkbox';
    chkTodas.id = 'chk-todas-unidades';
    chkTodas.checked = todasMarcadas;
    chkTodas.style.cssText = 'margin-right: 8px; transform: scale(1.1);';
    
    // Evento do Mestre
    chkTodas.addEventListener('change', function() {
        alternarSelecaoTodasUnidades(this);
        formSujo = true; // [CORREÇÃO] Marca como alterado ao clicar em "Todas"
    });

    labelTodas.appendChild(chkTodas);
    labelTodas.appendChild(document.createTextNode(' Marcar Todas'));
    divHeader.appendChild(labelTodas);
    alvo.appendChild(divHeader);

    // --- LISTA DE UNIDADES (ITENS INDIVIDUAIS) ---
    listaUnidadesCache.forEach(u => {
        const isChecked = idsSelecionados.includes(u.id);
        
        const div = document.createElement('div');
        div.className = 'unit-check-item';
        div.style.cssText = 'display:flex; align-items:center; margin-bottom:5px; cursor:pointer;';

        const chk = document.createElement('input');
        chk.type = 'checkbox';
        chk.className = 'chk-unidade-item';
        chk.id = `chk-u-${u.id}`;
        chk.value = u.id;
        chk.checked = isChecked;
        chk.style.marginRight = '8px';

        // [CORREÇÃO] Evento direto no elemento para capturar a mudança
        chk.addEventListener('change', () => { formSujo = true; });

        const lbl = document.createElement('label');
        lbl.htmlFor = `chk-u-${u.id}`;
        lbl.style.cssText = 'cursor:pointer; margin:0; font-weight:normal; width:100%';
        lbl.innerText = u.nome;

        // Permite clicar na linha inteira para marcar
        div.onclick = (e) => {
            if (e.target !== chk && e.target !== lbl) {
                chk.checked = !chk.checked;
                formSujo = true; // [CORREÇÃO] Marca como alterado ao clicar na div
            }
        };

        div.appendChild(chk);
        div.appendChild(lbl);
        alvo.appendChild(div);
    });
}

// Função auxiliar para o clique no checkbox "Marcar Todas"
window.alternarSelecaoTodasUnidades = function(masterChk) {
    const checkboxes = document.querySelectorAll('.chk-unidade-item');
    checkboxes.forEach(c => c.checked = masterChk.checked);
}


window.alternarSelecaoTodasUnidades = function() {
    const checkboxes = document.querySelectorAll('.chk-unidade-item');
    if(checkboxes.length === 0) return;

    // Lógica: Se houver pelo menos uma desmarcada, marca todas. Se todas estiverem marcadas, limpa tudo.
    let algumaDesmarcada = false;
    checkboxes.forEach(c => { if(!c.checked) algumaDesmarcada = true; });

    checkboxes.forEach(c => c.checked = algumaDesmarcada);
}

function aplicarMascaraLogin(e) {
    let v = e.target.value;
    if (/^\d/.test(v)) {
        v = v.replace(/\D/g, '').slice(0, 11);
        if (v.length > 9) v = v.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
        e.target.value = v;
    }
}

function fecharModalCheck(force = false) {
    if(!force && formSujo) { solicitarConfirmacao(() => fecharModalCheck(true)); return; }
    document.getElementById('modal-usuario').classList.remove('active');
    formSujo = false;
}

function visualizarUsuario(id) {
    abrirModalUsuario(id);
    document.getElementById('modal-titulo').innerText = 'Detalhes do Usuário';
    document.getElementById('form-usuario').querySelectorAll('input, select').forEach(el => el.disabled = true);
    document.querySelector('#form-usuario button[type="submit"]').style.display = 'none';
}

function toggleSenhaModal() {
    const input = document.getElementById('usr-senha');
    const icon = document.getElementById('icon-ver-senha');
    if (input.disabled) return;
    input.type = (input.type === 'password') ? 'text' : 'password';
    icon.classList.toggle('fa-eye'); icon.classList.toggle('fa-eye-slash');
}

// Função auxiliar para obter o cliente administrativo (Admin Auth)
function obterSupabaseAdmin() {
    return supabase.createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    });
}

// Função para controle de abas do modal de usuário
window.alternarAbaUsuario = function(abaAlvo) {
    // Esconde todos os conteúdos
    document.querySelectorAll('#modal-usuario .tab-content').forEach(el => {
        el.style.display = 'none';
        el.classList.remove('active');
    });

    // Remove classe active de todos os botões
    document.querySelectorAll('#modal-usuario .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Ativa o alvo
    const content = document.getElementById(`tab-${abaAlvo}`);
    if (content) {
        content.style.display = 'block';
        content.classList.add('active');
    }

    // Ativa o botão clicado (lógica baseada no onclick)
    const btns = document.querySelectorAll('#modal-usuario .tab-btn');
    if (abaAlvo === 'geral') btns[0].classList.add('active');
    if (abaAlvo === 'obs') btns[1].classList.add('active');
};