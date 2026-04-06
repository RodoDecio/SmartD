// admin/js/units.js

let listaUnidadesTela = []; 
let formUnidadeSujo = false;

// =============================================================================
// 1. INICIALIZAÇÃO
// =============================================================================

function inicializarUnidades() {
    document.getElementById('titulo-pagina').innerText = 'Gestão de Unidades';
    
    // Configura o formulário
    configurarFormularioUnidade();
    
    // Busca os dados
    listarUnidades();
}

// =============================================================================
// 2. INTEGRAÇÃO COM SUPABASE
// =============================================================================

async function listarUnidades() {
    try {
        const { data: unidades, error } = await clienteSupabase
            .from('unidades')
            .select('*')
            .order('nome');

        if (error) throw error;

        listaUnidadesTela = unidades || [];
        atualizarTabelaUnidades(listaUnidadesTela);

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao carregar unidades.", "error");
    }
}

async function salvarUnidade(e) {
    e.preventDefault();
    const btn = e.submitter;
    
    // Se o botão estiver oculto (modo visualização), não faz nada
    if (btn.style.display === 'none') return;

    // 1. Coleta dados dos inputs (usando trim para evitar espaços em branco)
    const id = document.getElementById('unit-id').value;
    const nome = document.getElementById('unit-nome').value.trim();
    const email = document.getElementById('unit-email').value.trim();
    const cidade = document.getElementById('unit-cidade').value.trim();
    const estado = document.getElementById('unit-estado').value;

    // 2. Validação de Alteração (Apenas se for Edição)
    if (id) {
        const original = listaUnidadesTela.find(u => u.id == id);
        if (original) {
            // Normaliza valores nulos do banco para string vazia para comparar com o input
            const origEmail = original.email || '';
            const origCidade = original.cidade || '';
            const origEstado = original.estado || '';

            const houveAlteracao = (nome !== original.nome) ||
                                   (email !== origEmail) ||
                                   (cidade !== origCidade) ||
                                   (estado !== origEstado);

            if (!houveAlteracao) {
                mostrarToast("Nenhuma alteração detectada.", "warning");
                return; // Interrompe o processo aqui
            }
        }
    }

    const txtOriginal = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    try {
        let acaoLog = '';
        let idRegistro = id;
        let dadosAntigos = null;

        // --- UPDATE ---
        if (id) {
            acaoLog = 'UPDATE';
            dadosAntigos = listaUnidadesTela.find(u => u.id == id);
            
            const { error } = await clienteSupabase
                .from('unidades')
                .update({ 
                    nome: nome, 
                    email: email, 
                    cidade: cidade, 
                    estado: estado 
                })
                .eq('id', id);
            
            if (error) throw error;

        // --- INSERT ---
        } else {
            acaoLog = 'INSERT';
            const { data, error } = await clienteSupabase
                .from('unidades')
                .insert([{ 
                    nome: nome, 
                    email: email, 
                    cidade: cidade, 
                    estado: estado,
                    ativo: true 
                }])
                .select();
            
            if (error) throw error;
            idRegistro = data[0].id;
        }

        // --- LOG DE AUDITORIA ---
        const usuarioLogado = (await clienteSupabase.auth.getUser()).data.user;
        
        try {
            await clienteSupabase.from('logs_auditoria').insert([{
                tabela_afetada: 'unidades',
                acao: acaoLog,
                id_registro_afetado: idRegistro,
                usuario_id: usuarioLogado ? usuarioLogado.id : null,
                dados_antigos: dadosAntigos ? JSON.stringify(dadosAntigos) : null,
                dados_novos: JSON.stringify({ nome, email, cidade, estado }),
                data_hora: new Date().toISOString()
            }]);
        } catch (logErr) {
            console.warn("Erro ao salvar log:", logErr);
        }

        mostrarToast("Unidade salva com sucesso!", "success");
        fecharModalUnidade(true);
        
        await listarUnidades(); 
        
        if(typeof carregarUnidadesRodape === 'function') {
            carregarUnidadesRodape(usuarioLogadoGlobal?.unidade_id); 
        }

    } catch (err) {
        console.error("Erro no catch:", err);
        mostrarToast("Erro ao salvar: " + err.message, "error");
    } finally {
        btn.innerText = txtOriginal;
        btn.disabled = false;
    }
}

async function alternarStatusUnidade(id, statusAtual) {
    try {
        const { error } = await clienteSupabase
            .from('unidades')
            .update({ ativo: !statusAtual })
            .eq('id', id);

        if (error) throw error;

        // Log da alteração de status
        const usuarioLogado = (await clienteSupabase.auth.getUser()).data.user;
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'unidades',
            acao: 'UPDATE_STATUS',
            id_registro_afetado: id,
            usuario_id: usuarioLogado?.id,
            dados_novos: JSON.stringify({ ativo: !statusAtual }),
            data_hora: new Date().toISOString()
        }]);

        mostrarToast("Status atualizado!", "success");
        listarUnidades();

    } catch (err) {
        mostrarToast("Erro: " + err.message, "error");
    }
}

// =============================================================================
// 3. TABELA E FILTROS
// =============================================================================

function atualizarTabelaUnidades(lista) {
    const tbody = document.getElementById('tbody-unidades');
    if(!tbody) return;
    tbody.innerHTML = '';

    document.getElementById('lbl-contagem-units').innerHTML = `Total: <strong>${lista.length}</strong>`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-3">Nenhuma unidade encontrada.</td></tr>';
        return;
    }

    lista.forEach(u => {
        const isAtivo = u.ativo === true;
        const classeBadge = isAtivo ? 'badge-ativo' : 'badge-inativo';
        const corIcone = isAtivo ? 'var(--cor-sucesso)' : '#ccc';

        const displayEmail = u.email ? u.email : '-';
        const displayLocal = (u.cidade && u.estado) ? `${u.cidade} / ${u.estado}` : '- / -';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${u.nome}</b></td>
            <td>${displayEmail}</td>
            <td>${displayLocal}</td>
            <td><span class="badge ${classeBadge}">${isAtivo ? 'ATIVO' : 'INATIVO'}</span></td>
            <td style="white-space: nowrap;">
                 <button class="action-btn" onclick="visualizarUnidade('${u.id}')" title="Visualizar Detalhes">
                    <i class="fas fa-eye" style="color: #003399;"></i>
                 </button>
                 <button class="action-btn" onclick="abrirModalLogsUnidade('${u.id}')" title="Histórico">
                    <i class="fas fa-history"></i>
                 </button>
                 <button class="action-btn" onclick="abrirModalUnidade('${u.id}')" title="Editar">
                    <i class="fas fa-edit"></i>
                 </button>
                 <button class="action-btn" onclick="alternarStatusUnidade('${u.id}', ${isAtivo})" style="color:${corIcone}">
                    <i class="fas ${isAtivo ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                 </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarUnidades(texto) {
    const termo = texto.toLowerCase();
    const filtrados = listaUnidadesTela.filter(u => 
        u.nome.toLowerCase().includes(termo) || 
        (u.cidade && u.cidade.toLowerCase().includes(termo))
    );
    atualizarTabelaUnidades(filtrados);
}

// =============================================================================
// 4. MODAL E FORMULÁRIO (CRIAR, EDITAR, VISUALIZAR)
// =============================================================================

function visualizarUnidade(id) {
    abrirModalUnidade(id);
    document.getElementById('titulo-modal-unidade').innerText = 'Detalhes da Unidade';
    
    // Desabilita campos
    const form = document.getElementById('form-unidade');
    form.querySelectorAll('input, select').forEach(el => el.disabled = true);
    
    // Esconde botão salvar
    const btnSalvar = form.querySelector('button[type="submit"]');
    if(btnSalvar) btnSalvar.style.display = 'none';

    // Altera botão cancelar para "Fechar"
    const btnCancel = form.querySelector('.btn-cancel');
    btnCancel.innerText = 'Fechar';
    btnCancel.onclick = function() { fecharModalUnidade(true); };
}

function abrirModalUnidade(id = null) {
    formUnidadeSujo = false;
    const modal = document.getElementById('modal-unidade');
    const form = document.getElementById('form-unidade');
    
    // Reseta estado (reativa campos)
    form.reset();
    form.querySelectorAll('input, select').forEach(el => el.disabled = false);
    
    // Restaura botão salvar
    const btnSalvar = form.querySelector('button[type="submit"]');
    if(btnSalvar) btnSalvar.style.display = 'block';

    // Restaura botão cancelar
    const btnCancel = form.querySelector('.btn-cancel');
    btnCancel.innerText = 'Cancelar';
    btnCancel.onclick = function() { fecharModalUnidade(); };

    document.getElementById('unit-id').value = '';

    if (id) {
        document.getElementById('titulo-modal-unidade').innerText = 'Editar Unidade';
        const u = listaUnidadesTela.find(x => x.id == id);
        if (u) {
            document.getElementById('unit-id').value = u.id;
            document.getElementById('unit-nome').value = u.nome;
            document.getElementById('unit-email').value = u.email || '';
            document.getElementById('unit-cidade').value = u.cidade || '';
            document.getElementById('unit-estado').value = u.estado || 'GO';
        }
    } else {
        document.getElementById('titulo-modal-unidade').innerText = 'Nova Unidade';
    }

    modal.classList.add('active');
}

function fecharModalUnidade(force = false) {
    if(!force && formUnidadeSujo) {
        solicitarConfirmacao(() => fecharModalUnidade(true));
        return;
    }
    
    // CORREÇÃO: ID correto do modal de unidades
    const modal = document.getElementById('modal-unidade');
    if (modal) modal.classList.remove('active');
    
    // Reseta a variável correta
    formUnidadeSujo = false;
}

function configurarFormularioUnidade() {
    const form = document.getElementById('form-unidade');
    if(!form) return;

    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    
    newForm.addEventListener('submit', salvarUnidade);
    newForm.querySelectorAll('input, select').forEach(el => {
        el.addEventListener('change', () => formUnidadeSujo = true);
    });
}

// =============================================================================
// 5. HISTÓRICO (LOGS) DETALHADO
// =============================================================================

async function abrirModalLogsUnidade(idRegistro) {
    const modal = document.getElementById('modal-logs'); 
    const containerLogs = document.getElementById('timeline-logs');
    document.getElementById('titulo-modal-logs').innerText = 'Histórico Completo da Unidade'; 
    
    containerLogs.innerHTML = '<div style="text-align:center; padding:20px"><i class="fas fa-spinner fa-spin"></i> Buscando histórico detalhado...</div>';
    modal.classList.add('active');

    try {
        // Busca os logs e faz o JOIN com a tabela de perfis para pegar o nome
        const { data: logs, error } = await clienteSupabase
            .from('logs_auditoria')
            .select('*, perfis ( nome_completo )') // Traz o nome do responsável
            .eq('tabela_afetada', 'unidades')
            .eq('id_registro_afetado', idRegistro)
            .order('data_hora', { ascending: false });

        if (error) throw error;

        if (!logs || logs.length === 0) {
            containerLogs.innerHTML = '<p style="text-align:center; color:#777;">Sem histórico disponível.</p>';
            return;
        }

        containerLogs.innerHTML = '';
        
        logs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'log-item';
            
            const dataFormatada = new Date(log.data_hora).toLocaleString('pt-BR');
            // Pega o nome do usuário ou define como "Sistema/Desconhecido"
            const responsavel = log.perfis ? log.perfis.nome_completo : 'Usuário Desconhecido';
            
            let htmlAlteracoes = '';

            // --- LÓGICA DE COMPARAÇÃO (DIFF) ---
            if (log.acao === 'INSERT') {
                htmlAlteracoes = `<div class="log-diff" style="color: green;">Criou o registro.</div>`;
            } 
            else if (log.acao === 'UPDATE') {
                const mudancas = compararDados(log.dados_antigos, log.dados_novos);
                if (mudancas.length > 0) {
                    htmlAlteracoes = `<div class="log-diff">${mudancas.join('<br>')}</div>`;
                } else {
                    htmlAlteracoes = `<div class="log-diff text-muted">Atualização sem alteração visual.</div>`;
                }
            }
            else if (log.acao === 'UPDATE_STATUS') {
                 // Tratamento especial para o botão de toggle
                 const novoStatus = JSON.parse(log.dados_novos || '{}').ativo;
                 const textoStatus = novoStatus ? '<b style="color:green">ATIVO</b>' : '<b style="color:red">INATIVO</b>';
                 htmlAlteracoes = `<div class="log-diff">Alterou status para: ${textoStatus}</div>`;
            }

            item.innerHTML = `
                <div class="log-header">
                    <strong>${dataFormatada}</strong> por <span style="color:#003399">${responsavel}</span>
                </div>
                <div class="log-action">
                    ${traduzirAcao(log.acao)}
                </div>
                ${htmlAlteracoes}
            `;
            containerLogs.appendChild(item);
        });

    } catch (err) {
        console.error(err);
        containerLogs.innerHTML = '<p style="color:red">Erro ao carregar histórico.</p>';
    }
}

// --- FUNÇÕES AUXILIARES DE LOG ---

function traduzirAcao(acao) {
    const mapa = {
        'INSERT': 'Criação',
        'UPDATE': 'Edição',
        'UPDATE_STATUS': 'Alteração de Status',
        'DELETE': 'Exclusão'
    };
    return mapa[acao] || acao;
}

function compararDados(antigo, novo) {
    if (!antigo || !novo) return [];
    
    // Converte strings JSON para objetos se necessário
    const objAntigo = (typeof antigo === 'string') ? JSON.parse(antigo) : antigo;
    const objNovo = (typeof novo === 'string') ? JSON.parse(novo) : novo;

    const diferencas = [];
    
    // Mapeamento de nomes técnicos para nomes amigáveis
    const labels = {
        'nome': 'Nome da Unidade',
        'email': 'E-mail',
        'cidade': 'Cidade',
        'estado': 'UF',
        'ativo': 'Status'
    };

    // Campos para ignorar
    const ignorar = ['id', 'ativo']; // 'ativo' tratamos separado no UPDATE_STATUS

    // Itera sobre as chaves do novo objeto
    for (const chave in objNovo) {
        if (ignorar.includes(chave)) continue;

        let valAntigo = objAntigo[chave] || '(vazio)';
        let valNovo = objNovo[chave] || '(vazio)';

        // Se houver diferença, adiciona à lista
        if (valAntigo !== valNovo) {
            const labelCampo = labels[chave] || chave;
            diferencas.push(`
                <b>${labelCampo}:</b> 
                <span style="text-decoration: line-through; color: #999;">${valAntigo}</span> 
                <i class="fas fa-arrow-right" style="font-size:10px; margin:0 5px;"></i> 
                <span style="color: #003399; font-weight:bold;">${valNovo}</span>
            `);
        }
    }
    return diferencas;
}
