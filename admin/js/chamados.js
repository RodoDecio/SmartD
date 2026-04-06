let listaChamadosGlobal = [];
let formChamadoSujo = false;
let dadosOriginaisChamado = null;

// =============================================================================
// 1. INICIALIZAÇÃO
// =============================================================================

window.inicializarChamados = async function() {
    const titulo = document.getElementById('titulo-pagina');
    if(titulo) titulo.innerText = 'Controle de Chamados';

    // 1. Configura Formulário
    const form = document.getElementById('form-chamado');
    if(form) {
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        newForm.addEventListener('submit', salvarChamado);
        newForm.addEventListener('input', () => { formChamadoSujo = true; });
    }

    // 2. Ajuste Fino do Container de Filtros (Margens)
    const container = document.getElementById('container-filtros-chamados');
    if (container) {
        
        container.innerHTML = ''; 
        adicionarFiltroChamado(); 
    }

    // 3. Carrega a lista
    await listarChamados();
};

// =============================================================================
// 2. LISTAGEM (QUERY DO BANCO COM SEGURANÇA)
// =============================================================================

window.listarChamados = async function() {
    const loading = document.getElementById('loading-chamados');
    const tbody = document.getElementById('tbody-chamados');

    if (loading) loading.style.display = 'flex';
    if (tbody) tbody.innerHTML = '';

    try {
        const unidadeFiltroRodape = document.getElementById('sel-unidade')?.value || "TODAS";
        const usuario = window.usuarioLogadoGlobal;

        let query = clienteSupabase
            .from('chamados_externos')
            .select(`
                *,
                unidades (nome),
                perfis!usuario_id (nome_completo)
            `)
            .order('data_abertura', { ascending: false });

        // 1. Filtro de Unidade (Rodapé da Aplicação)
        if (unidadeFiltroRodape !== 'TODAS') {
            query = query.eq('unidade_id', unidadeFiltroRodape);
        }

        // 2. Filtro de Permissões (Quem pode ver o que)
        // Lista de cargos que podem ver TUDO (Gestores)
        const cargosGestao = [
            'administrador geral', 
            'administrador', 
            'coordenador', 
            'especialista', // <-- ADICIONADO AQUI
            'especialista de logística', 
            'admin', 
            'master'
        ];
        
        const cargoUsuario = (usuario.funcao || '').toLowerCase();
        
        // Se NÃO for gestor, força filtro pelo ID do usuário
        if (usuario && !cargosGestao.includes(cargoUsuario)) {
            query = query.eq('usuario_id', usuario.id);
        }

        const { data, error } = await query;
        if (error) throw error;

        listaChamadosGlobal = data || [];

        // Aplica filtros locais (se houver) e renderiza
        aplicarFiltrosChamados();

    } catch (err) {
        console.error("Erro listar:", err);
        mostrarToast("Erro ao carregar dados.", "error");
    } finally {
        if (loading) loading.style.display = 'none';
    }
};

// =============================================================================
// 3. RENDERIZAÇÃO (TABELA COM SLA INTELIGENTE)
// =============================================================================

function renderizarTabelaChamados(lista) {
    const tbody = document.getElementById('tbody-chamados');
    if(!tbody) return;
    tbody.innerHTML = '';

    const lblCount = document.getElementById('lbl-contagem-chamados');
    if (lblCount) lblCount.innerText = `Exibindo ${lista.length} registro(s)`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 20px;">Nenhum chamado encontrado.</td></tr>';
        return;
    }

    const hoje = new Date();
    
    // --- VERIFICAÇÃO DE GESTOR MASTER PARA LIBERAR EDIÇÃO ---
    const usuarioLogado = window.usuarioLogadoGlobal || {};
    const funcaoUser = (usuarioLogado.funcao || '').toLowerCase();
    const isGestorMaster = ['coordenador', 'especialista', 'administrador geral', 'admin', 'master'].includes(funcaoUser);

    lista.forEach(c => {
        let dataFormatada = '-';
        let dataAberturaParaCalculo = null;
        
        if (c.data_abertura) {
            const dataIso = c.data_abertura.split('T')[0];
            const partes = dataIso.split('-'); 
            dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
            dataAberturaParaCalculo = new Date(c.data_abertura); 
        }

        let slaHtml = '<span style="background:#eee; color:#999; padding: 4px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: bold;">-</span>';
        
        const badgeBaseStyle = "display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: 4px 8px; border-radius: 4px; font-weight: bold; min-width: 75px; white-space: nowrap; font-size: 0.7rem; line-height: 1; text-transform: uppercase; box-shadow: 0 1px 2px rgba(0,0,0,0.1);"; 

        if (c.status === 'Aberto' && dataAberturaParaCalculo) {
            const diffMs = hoje - dataAberturaParaCalculo;
            const diasFloat = diffMs / (1000 * 60 * 60 * 24);
            const totalHoras = Math.floor(diffMs / (1000 * 60 * 60));
            const diasInteiros = Math.floor(totalHoras / 24);
            const horasRestantes = totalHoras % 24;

            let textoSla = "HOJE";
            if (diasFloat > 0.9) { 
                textoSla = diasInteiros === 0 ? `${horasRestantes}H` : `${diasInteiros}D ${horasRestantes}H`;
            }

            let corBg = '#28a745'; 
            if (diasFloat > 1.5 && diasFloat <= 4.5) corBg = '#ffc107'; 
            else if (diasFloat > 4.5) corBg = '#dc3545'; 
            
            slaHtml = `<span style="background:${corBg}; color:#fff; ${badgeBaseStyle}" title="Aberto há ${textoSla}">
                        <i class="fas fa-clock"></i> ${textoSla}
                       </span>`;
        } 
        else if (c.status === 'Finalizado' && dataAberturaParaCalculo) {
            if (c.data_fechamento) {
                const dataFechamentoObj = new Date(c.data_fechamento);
                const diffMs = dataFechamentoObj - dataAberturaParaCalculo;
                const totalHoras = Math.floor(diffMs / (1000 * 60 * 60));
                const diasInteiros = Math.floor(totalHoras / 24);
                const horasRestantes = totalHoras % 24;
                
                let textoSla = diasInteiros === 0 ? `${horasRestantes}H` : `${diasInteiros}D ${horasRestantes}H`;
                
                slaHtml = `<span style="background:#6c757d; color:white; ${badgeBaseStyle}" title="Fechado em ${new Date(c.data_fechamento).toLocaleString('pt-BR')}">
                            <i class="fas fa-flag-checkered"></i> ${textoSla}
                           </span>`;
            } else {
                slaHtml = `<span style="background:#6c757d; color:white; ${badgeBaseStyle}">
                            <i class="fas fa-check"></i> OK
                           </span>`;
            }
        }

        const usuarioNome = (c.perfis?.nome_completo || 'Sistema').split(' ')[0];
        const unidadeNome = (c.unidades?.nome || '-');
        
        const badgeStatus = c.status === 'Aberto' 
            ? '<span class="badge" style="background:#e3f2fd; color:#0d47a1; border:1px solid #badbcc; font-size: 0.75rem; padding: 4px 8px;">Aberto</span>' 
            : '<span class="badge" style="background:#d1e7dd; color:#0f5132; border:1px solid #badbcc; font-size: 0.75rem; padding: 4px 8px;">Finalizado</span>';

        const isFinalizado = c.status === 'Finalizado';
        
        // --- LIBERAÇÃO DO BOTÃO SE FOR GESTOR MASTER ---
        const podeEditar = !isFinalizado || isGestorMaster;

        const btnEditar = podeEditar 
            ? `<button class="action-btn" onclick="abrirModalChamado('${c.id}')" title="${isFinalizado ? 'Editar (Acesso Gestor)' : 'Editar'}"><i class="fas fa-edit"></i></button>`
            : `<button class="action-btn" disabled style="opacity:0.3; cursor:not-allowed;" title="Finalizado"><i class="fas fa-lock"></i></button>`;

        const btnFinalizar = isFinalizado
            ? `<button class="action-btn" disabled style="opacity:0.3; cursor:not-allowed;" title="Já finalizado"><i class="fas fa-check-circle"></i></button>`
            : `<button class="action-btn" onclick="abrirModalFinalizarChamado('${c.id}')" title="Finalizar Chamado"><i class="fas fa-check-circle" style="color: #28a745;"></i></button>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:bold; color:var(--cor-primaria); white-space: nowrap; font-size: 0.85rem;">
                #${c.numero_chamado || '?'}
            </td>
            
            <td style="white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px;" title="${c.tipo_chamado}">
                ${c.tipo_chamado || '-'}
            </td>
            
            <td style="font-size: 0.85rem;">${dataFormatada}</td>
            <td style="font-size: 0.85rem;">${unidadeNome}</td>
            <td style="font-size: 0.85rem; color:#555;">${usuarioNome}</td>
            <td style="text-align: center;">${badgeStatus}</td>
            <td style="text-align: center;">${slaHtml}</td>
            
            <td style="white-space: nowrap; text-align: center;">
                <button class="action-btn" onclick="abrirModalChamado('${c.id}', true)" title="Visualizar" style="margin-right:2px;">
                    <i class="fas fa-eye" style="color: var(--cor-primaria);"></i>
                </button>
                <button class="action-btn" onclick="abrirModalLogsChamado('${c.id}')" title="Histórico" style="margin-right:2px;">
                    <i class="fas fa-history"></i>
                </button>
                ${btnEditar}
                ${btnFinalizar}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =============================================================================
// 4. FILTROS DINÂMICOS (VISUAL AJUSTADO E LÓGICA BLINDADA)
// =============================================================================

window.adicionarFiltroChamado = function(tipoPre = null) {
    const container = document.getElementById('container-filtros-chamados');
    if (!container) return;

    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row-chamado';
    div.id = `f-ch-${id}`;
    
    div.style.cssText = 'display: flex; gap: 8px; align-items: center; margin-bottom: 5px; margin-top: 0px;';

    const styleSelect = "width: 140px; font-size: 0.9rem; height: 35px; padding: 0 8px; border: 1px solid #ced4da; border-radius: 4px;";
    const styleWrapper = "width: 200px; display:flex; height: 35px;";
    const styleInputPlaceholder = "width:100%; font-size: 0.9rem; height: 100%; background-color: #e9ecef; border: 1px solid #ced4da; border-radius: 4px; padding: 0 10px;";

    div.innerHTML = `
        <select class="form-control" style="${styleSelect}"
        onchange="configurarInputFiltroChamado(this, ${id})">
            <option value="" selected>Filtrar por...</option>
            <option value="numero">Nº Chamado</option>
            <option value="usuario">Usuário</option> <option value="tipo">Tipo</option>
            <option value="status">Status</option>
            <option value="data">Data Abertura</option>
        </select>
        
        <div id="wrapper-val-${id}" class="filter-value-wrapper" style="${styleWrapper}">
            <input type="text" class="form-control" disabled placeholder="Selecione..." style="${styleInputPlaceholder}">
        </div>
        
        <button onclick="removerFiltroChamado(${id})" style="border:none; background:none; color:#dc3545; cursor:pointer; font-size: 1rem; margin-left: 5px;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);

    if (tipoPre) {
        const sel = div.querySelector('select');
        sel.value = tipoPre;
        configurarInputFiltroChamado(sel, id);
    }
};

window.removerFiltroChamado = function(id) {
    const row = document.getElementById(`f-ch-${id}`);
    if (row) {
        row.remove();
        aplicarFiltrosChamados();
    }
};

window.configurarInputFiltroChamado = function(selectTipo, id) {
    const wrapper = document.getElementById(`wrapper-val-${id}`);
    wrapper.innerHTML = ''; 
    const tipo = selectTipo.value;
    let el;

    const estilo = "width: 100%; font-size: 0.9rem; height: 32px; padding: 0 8px; border-radius: 4px; border: 1px solid #ced4da;";

    if (tipo === 'tipo') {
        el = document.createElement('select');
        el.innerHTML = '<option value="">Todos</option>';
        // Lista atualizada
        ['Adiantamento p/ Fornecedor', 'Cadastro de Fornecedor', 'Entrada de Nota','Informar Atestado', 'Lançamento de Despesa', 'Outros',  'Prestação de Contas',  'Solicitar Férias'].forEach(t => {
            el.innerHTML += `<option value="${t}">${t}</option>`;
        });
    } else if (tipo === 'status') {
        el = document.createElement('select');
        el.innerHTML = `<option value="">Todos</option><option value="Aberto">Aberto</option><option value="Finalizado">Finalizado</option>`;
    } else if (tipo === 'data') {
        el = document.createElement('input');
        el.type = 'date';
    } 
    // [NOVO BLOCO] Configuração para Usuário
    else if (tipo === 'usuario') {
        el = document.createElement('select');
        el.innerHTML = '<option value="">Todos</option>';
        
        // Extrai nomes únicos da lista global carregada
        const nomesUnicos = [...new Set(listaChamadosGlobal.map(c => c.perfis?.nome_completo).filter(Boolean))].sort();
        
        nomesUnicos.forEach(nome => {
            el.innerHTML += `<option value="${nome}">${nome}</option>`;
        });
    } 
    else {
        el = document.createElement('input');
        el.type = 'text';
        el.placeholder = "Digite...";
    }

    el.className = 'form-control input-filtro-chamado'; 
    el.style.cssText = estilo;
    
    el.onchange = aplicarFiltrosChamados; 
    el.onkeyup = aplicarFiltrosChamados; 
    el.oninput = aplicarFiltrosChamados;

    wrapper.appendChild(el);
    if(!el.disabled) el.focus();

    aplicarFiltrosChamados();
};

window.aplicarFiltrosChamados = function () {
    const container = document.getElementById('container-filtros-chamados');
    let dados = [...listaChamadosGlobal];
    let descricoesFiltros = [];

    if (container) {
        const linhas = container.querySelectorAll('.filter-row-chamado');
        
        linhas.forEach(linha => {
            const selectTipo = linha.querySelector('select');
            if (!selectTipo) return;
            const tipo = selectTipo.value;
            const tipoTexto = selectTipo.options[selectTipo.selectedIndex].text;

            const inputValor = linha.querySelector('.input-filtro-chamado');
            if (!inputValor || !inputValor.value) return;

            const valor = inputValor.value.trim().toLowerCase();
            
            let valorTexto = inputValor.tagName === 'SELECT' && inputValor.selectedIndex >= 0 
                ? inputValor.options[inputValor.selectedIndex].text 
                : inputValor.value;

            if (valor === 'todos' || valor === '') return;

            if (tipo === 'data') {
                const partes = valorTexto.split('-');
                if(partes.length === 3) valorTexto = `${partes[2]}/${partes[1]}/${partes[0]}`;
            }
            descricoesFiltros.push(`<b>${tipoTexto}:</b> ${valorTexto}`);

            dados = dados.filter(item => {
                if (tipo === 'numero') {
                    return String(item.numero_chamado || '').toLowerCase().includes(valor);
                }
                if (tipo === 'tipo') {
                    return (item.tipo_chamado || '').toLowerCase().includes(valor);
                }
                if (tipo === 'status') {
                    return (item.status || '').toLowerCase() === valor;
                }
                // [NOVO BLOCO] Filtro Lógico de Usuário
                if (tipo === 'usuario') {
                    return (item.perfis?.nome_completo || '').toLowerCase() === valor;
                }
                if (tipo === 'data') {
                    const dataBancoFull = item.data_abertura || '';
                    const dataBanco = dataBancoFull.split('T')[0];
                    return dataBanco === valor;
                }
                return true;
            });
        });
    }

    const lblFilters = document.getElementById('lbl-filtros-ativos');
    if(lblFilters) {
        if (descricoesFiltros.length > 0) {
            lblFilters.innerHTML = `<i class="fas fa-filter" style="margin-right:5px;"></i> ${descricoesFiltros.join(' <span style="margin:0 5px; color:#ccc;">|</span> ')}`;
        } else {
            lblFilters.innerHTML = '<i>Mostrando todos os registros</i>';
        }
    }

    renderizarTabelaChamados(dados);
};

// =============================================================================
// 5. FORMULÁRIO / MODAL (LÓGICA DE UNIDADE AJUSTADA)
// =============================================================================

window.alternarAbaChamado = function(aba) {
    const btnGeral = document.getElementById('tab-chamado-geral');
    const btnObs = document.getElementById('tab-chamado-obs');
    const divGeral = document.getElementById('content-chamado-geral');
    const divObs = document.getElementById('content-chamado-obs');

    if (aba === 'geral') {
        btnGeral.style.borderBottom = '3px solid var(--cor-primaria)';
        btnGeral.style.color = 'var(--cor-primaria)';
        btnGeral.style.fontWeight = 'bold';
        btnObs.style.borderBottom = '3px solid transparent';
        btnObs.style.color = '#666';
        btnObs.style.fontWeight = 'normal';
        divGeral.style.display = 'block';
        divObs.style.display = 'none';
    } else {
        btnGeral.style.borderBottom = '3px solid transparent';
        btnGeral.style.color = '#666';
        btnGeral.style.fontWeight = 'normal';
        btnObs.style.borderBottom = '3px solid var(--cor-primaria)';
        btnObs.style.color = 'var(--cor-primaria)';
        btnObs.style.fontWeight = 'bold';
        divGeral.style.display = 'none';
        divObs.style.display = 'block';
    }
};

window.abrirModalChamado = async function(id = null, readonly = false) {
    const form = document.getElementById('form-chamado');
    form.reset();
    formChamadoSujo = false;
    dadosOriginaisChamado = null;

    document.getElementById('ch-id').value = '';
    document.getElementById('ch-obs').value = ''; 
    const titulo = document.getElementById('titulo-modal-chamado');
    
    // Reset Visual Férias
    const areaFerias = document.getElementById('area-selecao-ferias');
    const containerFerias = document.getElementById('container-cards-ferias');
    const feedbackFerias = document.getElementById('feedback-ferias-selecionada');
    const btnResetFerias = document.getElementById('btn-reset-ferias');
    const inputIdVinculado = document.getElementById('ch-id-ferias-vinculada');
    
    if(areaFerias) areaFerias.style.display = 'none';
    if(containerFerias) {
        containerFerias.style.display = 'flex';
        containerFerias.innerHTML = '';
    }
    if(feedbackFerias) feedbackFerias.style.display = 'none';
    if(btnResetFerias) btnResetFerias.style.display = 'none';
    if(inputIdVinculado) inputIdVinculado.value = '';
    document.getElementById('ch-colaborador-ferias-vinculada').value = '';

    alternarAbaChamado('geral');

    let isFinalizadoLocked = false;

    // --- CARGA DE PERMISSÃO ---
    const usuarioLogado = window.usuarioLogadoGlobal || {};
    const funcaoUser = (usuarioLogado.funcao || '').toLowerCase();
    const isGestorMaster = ['coordenador', 'especialista', 'administrador geral', 'admin', 'master'].includes(funcaoUser);

    // --- CARREGAMENTO DE DADOS ---
    if (id) {
        const item = listaChamadosGlobal.find(x => x.id == id);
        if (item) {
            
            // EXCEÇÃO: Só bloqueia (readonly) se for Finalizado E NÃO FOR GESTOR
            if (item.status === 'Finalizado' && !isGestorMaster) {
                readonly = true;
                isFinalizadoLocked = true;
            }

            document.getElementById('ch-id').value = item.id;
            document.getElementById('ch-numero').value = item.numero_chamado;
            document.getElementById('ch-data').value = item.data_abertura;
            document.getElementById('ch-tipo').value = item.tipo_chamado;
            document.getElementById('ch-status').value = item.status;
            document.getElementById('ch-obs').value = item.observacao || ''; 

            if (item.tipo_chamado === 'Solicitar Férias' && item.observacao) {
                areaFerias.style.display = 'block';
                const matchId = item.observacao.match(/ID Solicitação: #(\d+)/);
                if (matchId && matchId[1]) {
                    inputIdVinculado.value = matchId[1];
                    await recuperarVinculoFerias(matchId[1]);
                } else {
                    if(!isFinalizadoLocked) listarFeriasDisponiveis();
                }
            }

            if (!readonly) {
                dadosOriginaisChamado = {
                    numero_chamado: item.numero_chamado,
                    data_abertura: item.data_abertura,
                    tipo_chamado: item.tipo_chamado,
                    unidade_id: String(item.unidade_id),
                    status: item.status,
                    observacao: item.observacao || ''
                };
            }
            
            await popularSelectUnidadeNoModal(item.unidade_id);
        }
    } else {
        await popularSelectUnidadeNoModal(null);
    }

    async function popularSelectUnidadeNoModal(unidadeSelecionadaId) {
        const selUnidade = document.getElementById('ch-unidade');
        selUnidade.innerHTML = '';
        
        // --- ADICIONADO 'especialista' AQUI TAMBÉM ---
        const cargosGestao = ['administrador geral', 'coordenador', 'especialista', 'especialista de logística', 'admin', 'master', 'analista', 'analista de logística'];
        const isGestorModal = cargosGestao.some(cargo => funcaoUser.includes(cargo));
        let unidadesDisponiveis = listaUnidadesGlobal;
        
        if (!isGestorModal) {
            if (usuarioLogado.listaUnidades && usuarioLogado.listaUnidades.length > 0) {
                unidadesDisponiveis = listaUnidadesGlobal.filter(u => usuarioLogado.listaUnidades.includes(u.id));
            } else {
                unidadesDisponiveis = listaUnidadesGlobal.filter(u => u.id == usuarioLogado.unidade_id);
            }
        }

        if (unidadesDisponiveis.length > 1 || isGestorModal) {
            selUnidade.innerHTML = '<option value="">Selecione...</option>';
        }
        
        unidadesDisponiveis.forEach(u => {
            selUnidade.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
        });

        if (unidadeSelecionadaId) {
            selUnidade.value = unidadeSelecionadaId;
        } else {
            const filtroRodape = document.getElementById('sel-unidade')?.value;
            if (filtroRodape && filtroRodape !== 'TODAS') {
                selUnidade.value = filtroRodape;
            } else if (!isGestorModal && usuarioLogado.unidade_id) {
                selUnidade.value = usuarioLogado.unidade_id;
            }
        }
    }

    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(el => el.disabled = readonly);
    
    // PROTEÇÃO EXTRA: Impede que o Gestor mude o status e reabra o chamado acidentalmente
    if (id && isGestorMaster && document.getElementById('ch-status').value === 'Finalizado') {
        document.getElementById('ch-status').disabled = true;
    }

    const btnSalvar = form.querySelector('button[type="submit"]');
    if(btnSalvar) {
        btnSalvar.style.display = readonly ? 'none' : 'block';
    }

    titulo.innerText = id 
        ? (isFinalizadoLocked ? 'Chamado Finalizado (Visualização)' : (readonly ? 'Visualizar Chamado' : 'Editar Chamado')) 
        : 'Novo Chamado';

    document.getElementById('modal-chamado').classList.add('active');
};

window.fecharModalChamado = function(forcar = false) {
    if (!forcar && formChamadoSujo) {
        window.solicitarConfirmacao(() => {
            document.getElementById('modal-chamado').classList.remove('active');
            formChamadoSujo = false;
        }, "Existem alterações não salvas. Deseja sair?");
        return;
    }
    document.getElementById('modal-chamado').classList.remove('active');
    formChamadoSujo = false;
};

window.salvarChamado = async function(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const id = document.getElementById('ch-id').value;
    
    // Recupera dados vinculados
    const idFeriasVinculada = document.getElementById('ch-id-ferias-vinculada')?.value;

    const payload = {
        numero_chamado: document.getElementById('ch-numero').value,
        data_abertura: document.getElementById('ch-data').value,
        tipo_chamado: document.getElementById('ch-tipo').value,
        unidade_id: document.getElementById('ch-unidade').value,
        status: document.getElementById('ch-status').value,
        observacao: document.getElementById('ch-obs').value
    };

    // Lógica de Data de Fechamento (SLA)
    if (payload.status === 'Finalizado') {
        if (!dadosOriginaisChamado || dadosOriginaisChamado.status !== 'Finalizado') {
            payload.data_fechamento = new Date().toISOString();
        }
    } else {
        payload.data_fechamento = null;
    }

    // Validação de alteração
    if (id && dadosOriginaisChamado) {
        const mudou = (
            payload.numero_chamado !== dadosOriginaisChamado.numero_chamado ||
            payload.data_abertura !== dadosOriginaisChamado.data_abertura ||
            payload.tipo_chamado !== dadosOriginaisChamado.tipo_chamado ||
            String(payload.unidade_id) !== String(dadosOriginaisChamado.unidade_id) ||
            payload.status !== dadosOriginaisChamado.status ||
            payload.observacao !== dadosOriginaisChamado.observacao
        );
        if (!mudou) {
            mostrarToast("Nenhuma alteração detectada.", "warning");
            return;
        }
    }

    const txtOriginal = btn.innerText;
    btn.innerHTML = 'Salvando...';
    btn.disabled = true;

    try {
        let registroId = id;
        let acaoLog = 'UPDATE';

        // 1. Salva o Chamado
        if (!id) {
            payload.usuario_id = window.usuarioLogadoGlobal.id; 
            const { data, error } = await clienteSupabase.from('chamados_externos').insert([payload]).select();
            if (error) throw error;
            registroId = data[0].id;
            acaoLog = 'INSERT';
        } else {
            const { error } = await clienteSupabase.from('chamados_externos').update(payload).eq('id', id);
            if (error) throw error;
        }

        // 2. INTEGRAÇÃO DE FÉRIAS (CORREÇÃO DO ERRO 22P02)
        if (payload.status === 'Finalizado' && payload.tipo_chamado === 'Solicitar Férias') {
            if (idFeriasVinculada) {
                console.log("Integrando férias ID:", idFeriasVinculada);
                // [CORREÇÃO] Passamos APENAS o ID numérico das férias.
                // A função processarIntegracaoFerias vai buscar o colaborador e unidade sozinha no banco.
                await processarIntegracaoFerias(idFeriasVinculada);
            } else {
                console.warn("Chamado finalizado sem vínculo de férias. Integração pulada.");
            }
        }

        // 3. LOG
        const userLog = window.usuarioLogadoGlobal?.id;
        if (userLog) {
            await clienteSupabase.from('logs_auditoria').insert([{
                tabela_afetada: 'chamados_externos',
                acao: acaoLog,
                id_registro_afetado: String(registroId),
                usuario_id: userLog,
                dados_antigos: acaoLog === 'UPDATE' ? JSON.stringify(dadosOriginaisChamado) : null,
                dados_novos: JSON.stringify(payload),
                data_hora: new Date().toISOString()
            }]);
        }

        mostrarToast("Chamado salvo com sucesso!");
        fecharModalChamado(true);
        listarChamados();

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao salvar: " + err.message, "error");
    } finally {
        btn.innerText = txtOriginal;
        btn.disabled = false;
    }
};

// Função que insere os dias na tabela de diárias e atualiza o status das férias (SOMENTE PARA MOTORISTAS)
async function processarIntegracaoFerias(idFeriasEspecifica) {
    try {
        if (!idFeriasEspecifica) throw new Error("ID da solicitação de férias não fornecido.");

        // 1. Busca os dados ORIGINAIS da solicitação no banco E a função do colaborador
        const { data: feriasData, error: errBusca } = await clienteSupabase
            .from('solicitacoes_ferias')
            .select('*, perfis:colaborador_id(nome_completo, funcao)') // Traz a função para validação
            .eq('id', idFeriasEspecifica)
            .single();

        if (errBusca) throw errBusca;
        if (!feriasData) throw new Error("Solicitação de férias não encontrada no banco.");

        // Validação: Verifica se o colaborador é motorista
        const funcaoColab = (feriasData.perfis?.funcao || '').toLowerCase();
        const isMotorista = funcaoColab.includes('motorista');

        // Só processa as diárias se for motorista
        if (isMotorista) {
            // Dados oficiais para o lançamento
            const idColaborador = feriasData.colaborador_id;
            const idUnidade = feriasData.unidade_id;
            
            // Tratamento seguro de data (Y-m-d T00:00:00) para evitar timezone
            const dtIni = new Date(feriasData.data_inicio + 'T12:00:00'); 
            const dtFim = new Date(feriasData.data_fim + 'T12:00:00');
            
            const inserts = [];
            let loop = new Date(dtIni);

            // 2. Loop para gerar os dias
            while (loop <= dtFim) {
                const isoData = loop.toISOString().split('T')[0];
                
                inserts.push({
                    perfil_id: idColaborador, 
                    unidade_id: idUnidade, 
                    data_referencia: isoData,
                    tipo_consumo: 'ferias', 
                    valor_dia: 0, // Férias valor zero na diária
                    gera_financeiro_excecao: false,
                    status: 'Aberto'
                });
                
                loop.setDate(loop.getDate() + 1);
            }

            // 3. Limpa lançamentos existentes nesse período (para sobrescrever corretamente)
            const { error: errDel } = await clienteSupabase
                .from('diarias_lancamentos')
                .delete()
                .eq('perfil_id', idColaborador)
                .gte('data_referencia', feriasData.data_inicio)
                .lte('data_referencia', feriasData.data_fim);

            if (errDel) throw errDel;

            // 4. Insere os novos dias como 'ferias'
            if (inserts.length > 0) {
                const { error: errIns } = await clienteSupabase
                    .from('diarias_lancamentos')
                    .insert(inserts);
                
                if (errIns) throw errIns;
            }
            console.log("Integração de diárias concluída com sucesso para o motorista.");
        } else {
            console.log("Lançamento de diárias ignorado: Colaborador não possui a função de motorista.");
        }

        // 5. Atualiza o status da solicitação de férias para 'processado' (Para TODOS)
        const { error: errUpd } = await clienteSupabase
            .from('solicitacoes_ferias')
            .update({ status: 'processado' })
            .eq('id', idFeriasEspecifica);

        if (errUpd) throw errUpd;

        // Feedback condicional
        if (isMotorista) {
            mostrarToast("Grade de diárias atualizada e férias processadas!", "info");
        } else {
            mostrarToast("Férias processadas com sucesso (sem lançamento de diárias).", "info");
        }

    } catch (e) {
        console.error("Erro CRÍTICO na integração de férias:", JSON.stringify(e, null, 2));
        mostrarToast("Erro ao processar as férias. Verifique o console.", "error");
    }
}

window.abrirModalLogsChamado = function(id) {
    const mapaTraducao = {
        'unidade_id': listaUnidadesGlobal 
    };
    abrirModalLogsGlobal('chamados_externos', id, 'Histórico do Chamado', mapaTraducao);
};

// =============================================================================
// LÓGICA DE FÉRIAS E INTEGRAÇÃO
// =============================================================================

window.verificarTipoChamado = function(select) {
    const areaFerias = document.getElementById('area-selecao-ferias');
    
    if (select.value === 'Solicitar Férias') {
        areaFerias.style.display = 'block';
        resetarSelecaoFerias(); // Garante estado limpo ao selecionar o tipo
    } else {
        areaFerias.style.display = 'none';
        // Limpa vínculos se mudar de tipo
        document.getElementById('ch-id-ferias-vinculada').value = '';
        document.getElementById('ch-colaborador-ferias-vinculada').value = '';
    }
};

window.selecionarFeriasParaChamado = function(ferias) {
    // Esconde a lista de cards
    document.getElementById('container-cards-ferias').style.display = 'none';
    
    // Mostra o Feedback do selecionado
    const feedback = document.getElementById('feedback-ferias-selecionada');
    const txtFeedback = document.getElementById('txt-ferias-selecionada');
    const btnReset = document.getElementById('btn-reset-ferias');
    
    const dIni = ferias.data_inicio.split('-').reverse().join('/');
    const dFim = ferias.data_fim.split('-').reverse().join('/');
    const nomeColab = ferias.perfis?.nome_completo || 'Colaborador';
    
    feedback.style.display = 'block';
    btnReset.style.display = 'block';
    
    // Nome no Feedback visual
    txtFeedback.innerHTML = `${nomeColab} (${dIni} a ${dFim})`;

    // Preenche Inputs Ocultos
    document.getElementById('ch-id-ferias-vinculada').value = ferias.id;
    document.getElementById('ch-colaborador-ferias-vinculada').value = ferias.colaborador_id;

    // Preenche Observação (Com Nome)
    const obs = document.getElementById('ch-obs');
    const textoPadrao = `REGISTRO DE FÉRIAS\n\nCOLABORADOR: ${nomeColab}\nPeríodo: ${dIni} a ${dFim} (${ferias.dias_qtd} dias)\nUnidade: ${ferias.unidades?.nome || '-'}\nID Solicitação: #${ferias.id}`;
    
    // Só sobrescreve se estiver vazio ou for o texto padrão anterior
    if (!obs.value || obs.value.includes('REGISTRO DE FÉRIAS')) {
        obs.value = textoPadrao;
    }
    
    // Força a unidade do chamado ser a unidade das férias (para consistência)
    const selUnidade = document.getElementById('ch-unidade');
    if(selUnidade && ferias.unidade_id) selUnidade.value = ferias.unidade_id;
    
    mostrarToast("Férias vinculadas com sucesso!", "success");
};

window.atualizarCardsFeriasPorUnidade = function() {
    const tipo = document.getElementById('ch-tipo').value;
    if (tipo === 'Solicitar Férias') {
        // Se já houver uma seleção feita, pergunta se quer resetar? 
        // Por simplicidade, recarrega a lista se nenhuma estiver vinculada ainda.
        const idVinculado = document.getElementById('ch-id-ferias-vinculada').value;
        if (!idVinculado) {
            listarFeriasDisponiveis();
        }
    }
};

window.listarFeriasDisponiveis = async function() {
    const container = document.getElementById('container-cards-ferias');
    const unidadeSelecionada = document.getElementById('ch-unidade').value;
    
    container.style.display = 'flex';
    container.innerHTML = '<div style="padding:10px; text-align:center; color:#666;"><i class="fas fa-spinner fa-spin"></i> Buscando férias...</div>';

    try {
        const usuario = window.usuarioLogadoGlobal;
        const funcaoUser = (usuario.funcao || '').toLowerCase();
        
        // 1. Busca IDs de férias JÁ VINCULADAS a algum chamado
        // (Isso evita que se abram dois chamados para a mesma solicitação de férias)
        const { data: chamadosExistentes } = await clienteSupabase
            .from('chamados_externos')
            .select('observacao')
            .ilike('observacao', '%ID Solicitação: #%');

        const idsJaVinculados = new Set();
        (chamadosExistentes || []).forEach(ch => {
            const match = ch.observacao && ch.observacao.match(/ID Solicitação: #(\d+)/);
            if (match && match[1]) {
                idsJaVinculados.add(parseInt(match[1]));
            }
        });

        // 2. Busca Férias Aprovadas
        const cargosVisaoTotal = ['administrador', 'coordenador', 'especialista', 'admin', 'master', 'gerente', 'diretor'];
        const cargosVisaoUnidade = ['analista']; 
        const temVisaoTotal = cargosVisaoTotal.some(c => funcaoUser.includes(c));
        const temVisaoUnidade = cargosVisaoUnidade.some(c => funcaoUser.includes(c));

        let query = clienteSupabase
            .from('solicitacoes_ferias')
            .select(`*, perfis:colaborador_id(nome_completo), unidades(nome)`)
            .eq('status', 'aprovado') 
            .order('data_inicio', { ascending: true });

        // Filtro de Unidade/Permissão
        if (unidadeSelecionada) {
            query = query.eq('unidade_id', unidadeSelecionada);
        } else {
            if (temVisaoTotal) { /* Vê tudo */ }
            else if (temVisaoUnidade) {
                if (usuario.listaUnidades && usuario.listaUnidades.length > 0) query = query.in('unidade_id', usuario.listaUnidades);
                else query = query.eq('unidade_id', usuario.unidade_id);
            } else {
                query = query.eq('colaborador_id', usuario.id);
            }
        }

        const { data: listaFerias, error } = await query;
        if (error) throw error;

        // 3. Filtragem Final (Remove os já vinculados)
        const listaFiltrada = (listaFerias || []).filter(f => !idsJaVinculados.has(f.id));

        container.innerHTML = '';

        if (listaFiltrada.length === 0) {
            container.innerHTML = `
                <div style="background:#fff3cd; color:#856404; padding:10px; border-radius:4px; text-align:center; font-size:0.85rem;">
                    <i class="fas fa-info-circle"></i> Nenhuma férias aprovada disponível para vínculo ${unidadeSelecionada ? 'nesta unidade' : ''}.
                </div>`;
            return;
        }

        listaFiltrada.forEach(f => {
            const dIni = f.data_inicio.split('-').reverse().join('/');
            const dFim = f.data_fim.split('-').reverse().join('/');
            const nomeColab = f.perfis?.nome_completo || 'Colaborador';
            const nomeUnidade = f.unidades?.nome || 'Sem unidade';
            
            const card = document.createElement('div');
            card.className = 'card-ferias-item'; 
            
            card.innerHTML = `
                <div style="flex:1;">
                    <div style="font-weight:bold; font-size:0.9rem; color:#333;">
                        ${nomeColab}
                    </div>
                    <div style="font-size:0.85rem; color:#555; margin-top:2px;">
                        ${f.dias_qtd} dias: <b>${dIni}</b> a <b>${dFim}</b>
                    </div>
                    <div style="font-size:0.75rem; color:#999; margin-top:2px;">
                        <i class="fas fa-map-marker-alt"></i> ${nomeUnidade}
                    </div>
                </div>
                <div style="margin-left:10px;">
                    <button type="button" class="btn-add-round" title="Adicionar estas férias">
                        <i class="fas fa-plus"></i>
                    </button>
                </div>
            `;
            
            card.querySelector('button').onclick = (e) => { e.stopPropagation(); selecionarFeriasParaChamado(f); };
            card.onclick = () => selecionarFeriasParaChamado(f);
            
            container.appendChild(card);
        });

    } catch (e) {
        console.error(e);
        container.innerHTML = '<div style="color:red; font-size:0.85rem;">Erro ao buscar dados.</div>';
    }
};

window.resetarSelecaoFerias = function() {
    document.getElementById('feedback-ferias-selecionada').style.display = 'none';
    document.getElementById('btn-reset-ferias').style.display = 'none';
    document.getElementById('ch-id-ferias-vinculada').value = '';
    document.getElementById('ch-colaborador-ferias-vinculada').value = '';
    
    document.getElementById('ch-obs').value = ''; // Limpa obs
    
    // Recarrega lista
    listarFeriasDisponiveis();
};

async function recuperarVinculoFerias(idFerias) {
    const feedback = document.getElementById('feedback-ferias-selecionada');
    const txtFeedback = document.getElementById('txt-ferias-selecionada');
    const container = document.getElementById('container-cards-ferias');
    const btnReset = document.getElementById('btn-reset-ferias');

    // Estado visual de carregamento
    container.style.display = 'none';
    feedback.style.display = 'block';
    txtFeedback.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Carregando dados do vínculo...';

    try {
        const { data: ferias, error } = await clienteSupabase
            .from('solicitacoes_ferias')
            .select(`*, perfis:colaborador_id(nome_completo), unidades(nome)`)
            .eq('id', idFerias)
            .single();

        if (error || !ferias) throw new Error("Férias não encontradas");

        // Preenche o input oculto de colaborador também (importante para o processamento)
        document.getElementById('ch-colaborador-ferias-vinculada').value = ferias.colaborador_id;

        // Monta visual
        const dIni = ferias.data_inicio.split('-').reverse().join('/');
        const dFim = ferias.data_fim.split('-').reverse().join('/');
        const nomeColab = ferias.perfis?.nome_completo || 'Colaborador';

        txtFeedback.innerHTML = `<b>${nomeColab}</b> (${dIni} a ${dFim})`;
        
        // Se o chamado ainda estiver aberto, permite trocar. Se fechado, esconde opção.
        const statusChamado = document.getElementById('ch-status').value;
        if (statusChamado === 'Aberto') {
            btnReset.style.display = 'block';
        } else {
            btnReset.style.display = 'none';
        }

    } catch (e) {
        console.warn("Não foi possível carregar detalhes das férias vinculadas:", e);
        txtFeedback.innerHTML = `<span style="color:red">Vínculo ID #${idFerias} (Detalhes indisponíveis)</span>`;
        btnReset.style.display = 'block';
    }
}

// =============================================================================
// LÓGICA DE FINALIZAÇÃO DIRETA (MECÂNICA NOVA)
// =============================================================================

window.abrirModalFinalizarChamado = function(id) {
    document.getElementById('finalizar-ch-id').value = id;
    
    // Seta data e hora atual (Local)
    const agora = new Date();
    const dataLocal = new Date(agora.getTime() - (agora.getTimezoneOffset() * 60000)).toISOString();
    
    document.getElementById('finalizar-ch-data').value = dataLocal.split('T')[0];
    
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    document.getElementById('finalizar-ch-hora').value = `${horas}:${minutos}`;

    document.getElementById('modal-finalizar-chamado').classList.add('active');
};

window.fecharModalFinalizarChamado = function() {
    document.getElementById('modal-finalizar-chamado').classList.remove('active');
};

window.confirmarFinalizacaoChamado = async function(e) {
    if (e) e.preventDefault();

    const id = document.getElementById('finalizar-ch-id').value;
    const dataInput = document.getElementById('finalizar-ch-data').value;
    const horaInput = document.getElementById('finalizar-ch-hora').value;
    
    if(!dataInput || !horaInput) {
        mostrarToast("Informe a data e a hora da conclusão.", "warning");
        return;
    }

    const dataFechamentoIso = `${dataInput}T${horaInput}:00`;
    
    const btn = document.getElementById('btn-confirmar-finalizacao');
    const txtOriginal = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    try {
        // 1. Busca os dados atuais do chamado para validação e auditoria
        const { data: chamadoAtual, error: errBusca } = await clienteSupabase
            .from('chamados_externos')
            .select('*')
            .eq('id', id)
            .single();

        if (errBusca) throw errBusca;

        // 2. Prepara atualização
        const payloadUpdate = {
            status: 'Finalizado',
            data_fechamento: dataFechamentoIso
        };

        const { error: errUpd } = await clienteSupabase
            .from('chamados_externos')
            .update(payloadUpdate)
            .eq('id', id);

        if (errUpd) throw errUpd;

        // 3. INTEGRAÇÃO DE FÉRIAS (Se aplicável)
        // Extrai o ID da observação, igual a função de abrir modal faz
        if (chamadoAtual.tipo_chamado === 'Solicitar Férias' && chamadoAtual.observacao) {
            const matchId = chamadoAtual.observacao.match(/ID Solicitação: #(\d+)/);
            if (matchId && matchId[1]) {
                console.log("Integrando férias fechadas via finalização rápida ID:", matchId[1]);
                await processarIntegracaoFerias(matchId[1]);
            }
        }

        // 4. LOG DE AUDITORIA
        const userLog = window.usuarioLogadoGlobal?.id;
        if (userLog) {
            await clienteSupabase.from('logs_auditoria').insert([{
                tabela_afetada: 'chamados_externos',
                acao: 'UPDATE_STATUS', // Tratado como alteração de status/finalização
                id_registro_afetado: String(id),
                usuario_id: userLog,
                dados_antigos: JSON.stringify(chamadoAtual),
                dados_novos: JSON.stringify({ ...chamadoAtual, ...payloadUpdate }),
                data_hora: new Date().toISOString()
            }]);
        }

        mostrarToast("Chamado finalizado com sucesso!", "success");
        fecharModalFinalizarChamado();
        listarChamados();

    } catch (error) {
        console.error(error);
        mostrarToast("Erro ao finalizar chamado: " + error.message, "error");
    } finally {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
    }
};