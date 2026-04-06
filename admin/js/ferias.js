// js/ferias.js - COMPLETO (Visualizar, Editar, Histórico, Validar)

let listaFeriasCache = [];
let perfisCacheFerias = [];

let dadosOriginaisFerias = null;
let formFeriasSujo = false;

let callbackDecisaoAtual = null;

// =============================================================================
// 1. INICIALIZAÇÃO
// =============================================================================

function inicializarFerias() {
    console.log("Inicializando tela de Férias");

    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Solicitação de Férias';

    // Garante filtros iniciais
    const container = document.getElementById('container-filtros-ferias');
    if (container && container.children.length === 0) {
        adicionarFiltroFerias('status', 'pendente');
    }

    // [CORREÇÃO] Listener Global (Delegado) para o Rodapé
    // Isso resolve o problema de não detectar a mudança se o rodapé for renderizado dinamicamente
    document.addEventListener('change', function(e) {
        if (e.target && e.target.id === 'sel-unidade') {
            console.log("Filtro de unidade alterado (Listener Global)");
            aoMudarUnidadeFerias();
        }
    });

    // Carrega dados e lista
    carregarDadosAuxiliaresFerias().then(() => {
        listarSolicitacoesFerias();
    });
}

// Gatilho de mudança de unidade
async function aoMudarUnidadeFerias() {
    // 1. Atualiza a tabela principal
    listarSolicitacoesFerias();
    
    // 2. Busca componentes de filtro "Colaborador" na tela
    const container = document.getElementById('container-filtros-ferias');
    if (!container) return;

    const rows = container.querySelectorAll('.filter-row');
    
    // Itera sobre as linhas de filtro para encontrar as de Colaborador
    for (const row of rows) {
        const tipoSelect = row.querySelector('.filter-select');
        
        // Verifica se é filtro de colaborador
        if (tipoSelect && tipoSelect.value === 'colaborador') {
            // Encontra o wrapper onde fica o select de nomes
            // Procura por qualquer div que contenha um select, ignorando o select de tipo
            const selectsNaLinha = row.querySelectorAll('select');
            
            // O segundo select é sempre o de valor (se existir)
            if (selectsNaLinha.length >= 2) {
                const selectValor = selectsNaLinha[1];
                const valorAnterior = selectValor.value;
                
                // Recarrega as opções aplicando a nova unidade
                await carregarColaboradoresFerias(selectValor, valorAnterior);
            }
        }
    }
}

async function carregarDadosAuxiliaresFerias() {
    try {
        const { data, error } = await clienteSupabase
            .from('perfis')
            .select('id, nome_completo, unidade_id')
            .eq('ativo', true);

        if (error) throw error;

        // DEDUPLICAÇÃO POR NOME (Ignora logins diferentes para a mesma pessoa)
        const mapPorNome = new Map();
        
        (data || []).forEach(p => {
            if (p.nome_completo) {
                // Normaliza o nome para evitar duplicatas por espaços ou casing
                const chaveNome = p.nome_completo.trim().toUpperCase();
                
                // Só adiciona se esse nome ainda não existe na lista
                if (!mapPorNome.has(chaveNome)) {
                    mapPorNome.set(chaveNome, p);
                }
            }
        });

        // Converte de volta para array e ordena alfabeticamente
        perfisCacheFerias = Array.from(mapPorNome.values());
        perfisCacheFerias.sort((a, b) => 
            a.nome_completo.localeCompare(b.nome_completo, 'pt-BR', { sensitivity: 'base' })
        );

    } catch (e) {
        console.error("Erro ao carregar dados auxiliares:", e);
    }
}

// =============================================================================
// 2. LISTAGEM
// =============================================================================

async function listarSolicitacoesFerias() {
    const tbody = document.getElementById('tbody-ferias');
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Buscando dados...</td></tr>';
    }

    const unidadeSelecionada = document.getElementById('sel-unidade')?.value;

    try {
        let query = clienteSupabase
            .from('solicitacoes_ferias')
            .select(`
                *,
                colaborador:colaborador_id (
                    id,
                    nome_completo,
                    funcao,
                    unidade_id
                ),
                solicitante:solicitante_id (
                    id,
                    nome_completo
                ),
                aprovador:aprovador_id (
                    id,
                    nome_completo
                ),
                unidades (
                    id,
                    nome
                )
            `)
            .order('created_at', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        let dados = data || [];

        if (unidadeSelecionada && unidadeSelecionada !== 'TODAS') {
            dados = dados.filter(item =>
                String(item.unidade_id) === String(unidadeSelecionada)
            );
        }

        listaFeriasCache = dados;
        aplicarFiltrosFerias();

    } catch (e) {
        console.error("Erro ao listar férias:", e);
        mostrarToast("Erro ao carregar dados.", "error");
    }
}

function renderizarTabelaFerias(lista) {
    const tbody = document.getElementById('tbody-ferias');
    const lblCont = document.getElementById('lbl-contagem-ferias');
    
    if (!tbody) return;
    tbody.innerHTML = '';

    if (lblCont) lblCont.innerHTML = `Exibindo <strong>${lista.length}</strong> registro(s)`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">Nenhuma solicitação encontrada.</td></tr>';
        return;
    }

    // --- LÓGICA DE PERMISSÕES ---
    const user = window.usuarioLogadoGlobal || {};
    const funcaoUser = (user.funcao || '').toLowerCase();
    
    // Gestores Gerais (Aprovam)
    const isGestor = ['coordenador', 'especialista', 'admin', 'gerente', 'master', 'diretor'].some(c => funcaoUser.includes(c));
    
    // Permissão de Exclusão (Mais restrita)
    const podeExcluir = ['coordenador', 'especialista', 'admin', 'master'].some(c => funcaoUser.includes(c));

    // [NOVA REGRA] Permissão de Edição Avançada (Ajustes de Férias Aprovadas)
    // Especialistas de Logística e Coordenadores podem editar mesmo se aprovado (mas não processado)
    const isEditorAvancado = ['coordenador', 'especialista'].some(c => funcaoUser.includes(c));

    lista.forEach(f => {
        // Formatação de Datas
        const dtIni = f.data_inicio ? new Date(f.data_inicio + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
        const dtFim = f.data_fim ? new Date(f.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : '-';
        const nomeColab = f.colaborador?.nome_completo || 'Desconhecido';
        const nomeUnidade = f.unidades?.nome || '-';

        // Estilização do Status
        let badgeStyle = 'background:#eee; color:#666;';
        let stLabel = (f.status || 'pendente').toUpperCase();

        if (f.status === 'pendente') badgeStyle = 'background:#fff3cd; color:#856404; border:1px solid #ffeeba;';
        else if (f.status === 'aprovado') badgeStyle = 'background:#d4edda; color:#155724; border:1px solid #c3e6cb;';
        else if (f.status === 'rejeitado') badgeStyle = 'background:#f8d7da; color:#721c24; border:1px solid #f5c6cb;';
        else if (f.status === 'processado') badgeStyle = 'background:#cce5ff; color:#004085; border:1px solid #b8daff;';

        // --- LÓGICA DE ESTADO DOS BOTÕES ---
        const styleDisabled = 'opacity: 0.3; cursor: not-allowed; pointer-events: none;';
        const styleEnabled = 'cursor: pointer;';

        // 1. VISUALIZAR (Sempre Ativo)
        const btnVisualizar = `
            <button class="action-btn" onclick="abrirModalFerias(${f.id}, 'visualizar')" title="Visualizar Detalhes" style="${styleEnabled}">
                <i class="fas fa-eye" style="color: #003399;"></i>
            </button>`;

        // 2. HISTÓRICO (Sempre Ativo)
        const btnHistorico = `
            <button class="action-btn" onclick="abrirModalHistoricoFerias(${f.id})" title="Histórico de Logs" style="${styleEnabled}">
                <i class="fas fa-history" style="color: #666;"></i>
            </button>`;

        // 3. EDITAR (Lógica Ajustada)
        // Regra base: Pendente ou Rejeitado
        let podeEditar = (f.status === 'pendente' || f.status === 'rejeitado');
        
        // Exceção: Se for Coordenador/Especialista, pode editar Aprovado também
        if (isEditorAvancado && f.status === 'aprovado') {
            podeEditar = true;
        }
        
        // Bloqueio Final: Se estiver PROCESSADO, ninguém edita (Trava de segurança)
        if (f.status === 'processado') {
            podeEditar = false;
        }

        const btnEditar = `
            <button class="action-btn" 
                onclick="${podeEditar ? `abrirModalFerias(${f.id}, 'editar')` : ''}" 
                title="${podeEditar ? 'Editar Solicitação' : 'Não editável'}" 
                style="${podeEditar ? styleEnabled : styleDisabled}" 
                ${!podeEditar ? 'disabled' : ''}>
                <i class="fas fa-edit" style="color: var(--cor-primaria);"></i>
            </button>`;

        // 4. ANALISAR (Ativo se Pendente E Gestor)
        const podeAnalisar = (f.status === 'pendente' && isGestor);
        const btnAnalisar = `
            <button class="action-btn" 
                onclick="${podeAnalisar ? `abrirModalFerias(${f.id}, 'analisar')` : ''}" 
                title="${podeAnalisar ? 'Analisar (Aprovar/Reprovar)' : 'Análise indisponível'}" 
                style="${podeAnalisar ? styleEnabled : styleDisabled}"
                ${!podeAnalisar ? 'disabled' : ''}>
                <i class="fas fa-gavel" style="color: #fd7e14;"></i>
            </button>`;

        // 5. EXCLUIR (Ativo se Rejeitado E Permissão Especial)
        const podeExcluirReg = (f.status === 'rejeitado' && podeExcluir);
        const btnExcluir = `
            <button class="action-btn" 
                onclick="${podeExcluirReg ? `excluirSolicitacaoFerias(${f.id})` : ''}" 
                title="${podeExcluirReg ? 'Excluir Definitivamente' : 'Exclusão não permitida'}" 
                style="${podeExcluirReg ? styleEnabled : styleDisabled}"
                ${!podeExcluirReg ? 'disabled' : ''}>
                <i class="fas fa-trash-alt" style="color: #dc3545;"></i>
            </button>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600; color:#333;">${nomeColab}</td>
            <td>${dtIni}</td>
            <td>${f.dias_qtd}</td>
            <td>${dtFim}</td>
            <td>${nomeUnidade}</td>
            <td><span class="badge" style="${badgeStyle} padding:4px 8px; border-radius:4px; font-size:0.75rem;">${stLabel}</span></td>
            <td style="text-align: right; white-space: nowrap;">
                ${btnVisualizar}
                ${btnHistorico}
                ${btnEditar}
                ${btnAnalisar}
                ${btnExcluir}
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =============================================================================
// 3. FILTROS DINÂMICOS
// =============================================================================

function adicionarFiltroFerias(tipoPre = null, valorPre = null) {
    const container = document.getElementById('container-filtros-ferias');
    if (!container) return;

    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `row-fer-${id}`;
    div.style.cssText = "display: flex; gap: 8px; align-items: center; width: 100%; max-width: 600px;";

    div.innerHTML = `
        <select class="filter-select form-control" style="width: 140px;" onchange="configurarInputFiltroFerias(this, '${id}')">
            <option value="" disabled selected>Filtrar por...</option>
            <option value="status">Status</option>
            <option value="colaborador">Colaborador</option>
            <option value="mes">Mês Início</option>
        </select>
        <div id="wrapper-val-fer-${id}" style="flex: 1; display:flex;">
            <input type="text" class="form-control" disabled placeholder="Selecione o tipo..." style="width: 100%;">
        </div>
        <button class="btn-remove-filter" onclick="removerFiltroFerias('${id}')" style="border:none; background:none; color:#dc3545; cursor:pointer;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);

    if (tipoPre) {
        const sel = div.querySelector('.filter-select');
        if (sel) {
            sel.value = tipoPre;
            configurarInputFiltroFerias(sel, id, valorPre);
        }
    }
}

function removerFiltroFerias(id) {
    const el = document.getElementById(`row-fer-${id}`);
    if (el) el.remove();
    aplicarFiltrosFerias();
}

async function configurarInputFiltroFerias(sel, id, valorInicial = null) {
    const wrapper = document.getElementById(`wrapper-val-fer-${id}`);
    if (!wrapper) return;
    
    const tipo = sel.value;
    const elAnterior = wrapper.querySelector('select, input');
    const valorAnterior = valorInicial ? valorInicial : (elAnterior ? elAnterior.value : '');

    wrapper.innerHTML = '';
    const inputClass = "form-control form-control-sm border-secondary";
    const styleStr = "min-width: 150px; width: 100%;";
    const triggerChange = () => aplicarFiltrosFerias();

    if (tipo === 'status') {
        const s = document.createElement('select');
        s.className = inputClass; s.style.cssText = styleStr;
        s.onchange = triggerChange;
        s.innerHTML = `
            <option value="">Todos</option>
            <option value="pendente">Pendente</option>
            <option value="aprovado">Aprovado</option>
            <option value="rejeitado">Rejeitado</option>
            <option value="processado">Processado</option>
        `;
        if (valorAnterior) s.value = valorAnterior;
        wrapper.appendChild(s);
    } 
    else if (tipo === 'colaborador') {
        const s = document.createElement('select');
        s.className = inputClass; s.style.cssText = styleStr;
        s.onchange = triggerChange;
        s.innerHTML = '<option value="">Carregando...</option>';
        wrapper.appendChild(s);
        await carregarColaboradoresFerias(s, valorAnterior);
    }
    else if (tipo === 'mes') {
        const i = document.createElement('input');
        i.type = 'month'; i.className = inputClass; i.style.cssText = styleStr;
        i.onchange = triggerChange;
        if (valorAnterior) i.value = valorAnterior;
        wrapper.appendChild(i);
    }
    else {
        const i = document.createElement('input');
        i.type = 'text'; i.className = inputClass; i.style.cssText = styleStr;
        i.placeholder = 'Digite...';
        i.onkeyup = triggerChange;
        if (valorAnterior) i.value = valorAnterior;
        wrapper.appendChild(i);
    }

    if (valorInicial) aplicarFiltrosFerias();
}

function aplicarFiltrosFerias() {
    let filtrados = [...listaFeriasCache];
    let legendas = [];

    const container = document.getElementById('container-filtros-ferias');
    if (container) {
        const rows = container.querySelectorAll('.filter-row');
        rows.forEach(row => {
            const selectTipo = row.querySelector('select.filter-select');
            const tipo = selectTipo ? selectTipo.value : '';
            const labelTipo = selectTipo ? selectTipo.options[selectTipo.selectedIndex].text : '';
            const wrapper = row.querySelector('div[id^="wrapper-val-fer-"]');
            const campoValor = wrapper ? wrapper.querySelector('input, select') : null;

            if (!campoValor || !campoValor.value) return;

            const val = campoValor.value.toLowerCase();
            let valTexto = campoValor.value;

            if (campoValor.tagName === 'SELECT' && campoValor.selectedIndex >= 0) {
                valTexto = campoValor.options[campoValor.selectedIndex].text;
            }

            legendas.push(`<b>${labelTipo}:</b> ${valTexto}`);

            filtrados = filtrados.filter(item => {
                if (tipo === 'status') return (item.status || '').toLowerCase() === val;
                if (tipo === 'colaborador') {
                    if(campoValor.tagName === 'SELECT') return String(item.colaborador_id) === String(campoValor.value);
                    return item.perfis?.nome_completo.toLowerCase().includes(val);
                }
                if (tipo === 'mes') return item.data_inicio && item.data_inicio.startsWith(campoValor.value);
                return true;
            });
        });
    }

    const lblFiltros = document.getElementById('lbl-filtros-ativos-ferias');
    if (lblFiltros) {
        if (legendas.length > 0) lblFiltros.innerHTML = `<span style="color:#003399"><i class="fas fa-filter"></i></span> ${legendas.join(' | ')}`;
        else lblFiltros.innerHTML = '<span style="color:#999; font-style:italic;">Mostrando tudo</span>';
    }

    // --- GARANTIA DE ORDENAÇÃO LOCAL (MAIS PRÓXIMOS DE HOJE) ---
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    filtrados.sort((a, b) => {
        if (!a.data_inicio) return 1;
        if (!b.data_inicio) return -1;
        
        // Converte a string YYYY-MM-DD para o fuso seguro do meio-dia
        const dataA = new Date(a.data_inicio + 'T12:00:00');
        const dataB = new Date(b.data_inicio + 'T12:00:00');
        
        // Calcula a distância absoluta em milissegundos entre a data do registro e hoje
        const distanciaA = Math.abs(dataA - hoje);
        const distanciaB = Math.abs(dataB - hoje);
        
        // Ordena pela menor distância (os mais próximos ficam no topo)
        return distanciaA - distanciaB;
    });

    renderizarTabelaFerias(filtrados);
}

// =============================================================================
// 4. AUXILIARES
// =============================================================================

async function carregarColaboradoresFerias(selectElement, valorSelecionado = null) {
    if (!selectElement) return;
    
    const unidadeSelecionada = document.getElementById('sel-unidade')?.value || 'TODAS';
    
    // Filtra o cache global pela unidade selecionada
    let listaFiltrada = perfisCacheFerias;
    if (unidadeSelecionada !== 'TODAS') {
        listaFiltrada = perfisCacheFerias.filter(p => String(p.unidade_id) === String(unidadeSelecionada));
    }

    // Define placeholder baseado no contexto (Filtro vs Modal)
    const isFiltro = selectElement.classList.contains('form-control-sm'); // Assumindo classe do filtro
    const placeholder = isFiltro ? 'Todos' : 'Selecione...';

    let html = `<option value="">${placeholder}</option>`;
    
    if (listaFiltrada.length > 0) {
        listaFiltrada.forEach(p => {
            const selected = String(p.id) === String(valorSelecionado) ? 'selected' : '';
            html += `<option value="${p.id}" data-unidade="${p.unidade_id}" ${selected}>${p.nome_completo}</option>`;
        });
    } else {
        html += `<option value="" disabled>Nenhum colaborador nesta unidade</option>`;
    }

    selectElement.innerHTML = html;
}

window.eGestor = function() {
    const usuario = window.usuarioLogadoGlobal;
    if (!usuario) return false;
    const funcao = (usuario.funcao || '').toLowerCase();
    const cargos = ['coordenador', 'especialista', 'admin', 'gerente', 'administrador', 'master'];
    return cargos.some(c => funcao.includes(c));
};

// =============================================================================
// 5. MODAL PRINCIPAL (NOVO / EDITAR / VALIDAR / VISUALIZAR)
// =============================================================================

async function abrirModalFerias(id = null, modo = 'novo') {
    const modal = document.getElementById('modal-ferias');
    const form = document.getElementById('form-ferias');
    const selColab = document.getElementById('ferias-colaborador');
    const areaAnalise = document.getElementById('area-analise-gestor');
    const footer = document.getElementById('modal-footer-ferias');
    const titulo = document.getElementById('titulo-modal-ferias');
    const alertSimples = document.getElementById('alert-conflito-simples');
    
    // Reset Form
    form.reset();
    document.getElementById('ferias-id').value = '';
    
    // Reseta flags e alertas
    formFeriasSujo = false;
    dadosOriginaisFerias = null;
    
    if(alertSimples) alertSimples.style.display = 'none';
    if(areaAnalise) {
        areaAnalise.style.display = 'none';
        areaAnalise.innerHTML = '';
    }
    
    // Habilita inputs por padrão
    const inputs = form.querySelectorAll('input, select, textarea');
    inputs.forEach(el => el.disabled = false);
    document.getElementById('ferias-fim').disabled = true;

    // Popula select
    await carregarColaboradoresFerias(selColab);

    if (id) {
        // --- CARREGAR REGISTRO ---
        const item = listaFeriasCache.find(x => x.id == id);
        if (!item) return;

        document.getElementById('ferias-id').value = item.id;
        
        // Garante colaborador no select
        if (!selColab.querySelector(`option[value="${item.colaborador_id}"]`)) {
            const nome = item.perfis ? item.perfis.nome_completo : 'Colaborador Externo';
            const opt = document.createElement('option');
            opt.value = item.colaborador_id;
            opt.text = nome;
            selColab.appendChild(opt);
        }
        selColab.value = item.colaborador_id;
        document.getElementById('ferias-inicio').value = item.data_inicio;
        document.getElementById('ferias-dias').value = item.dias_qtd;
        document.getElementById('ferias-obs').value = item.observacao || '';
        
        // Validação Visual
        verificarConflitoFeriasVisual();

        // Dados originais para controle de alteração
        dadosOriginaisFerias = {
            colaborador_id: String(item.colaborador_id),
            data_inicio: item.data_inicio,
            dias_qtd: String(item.dias_qtd),
            observacao: item.observacao || ''
        };

        // --- MODO: VISUALIZAR ---
        if (modo === 'visualizar') {
            titulo.innerText = 'Visualizar Solicitação';
            inputs.forEach(el => el.disabled = true);
            footer.innerHTML = `<button type="button" class="btn-cancel" style="background:#e9ecef; color:#333; border:1px solid #ccc;" onclick="fecharModalFerias()">Fechar</button>`;
        }
        // --- MODO: EDITAR ---
        else if (modo === 'editar') {
            titulo.innerText = 'Editar Solicitação';
            selColab.disabled = true; 
            footer.innerHTML = `
                <button type="button" class="btn-cancel" onclick="fecharModalFerias()">Cancelar</button>
                <button type="button" class="btn-primary" onclick="salvarFerias()">Salvar Alterações</button>
            `;
        }
        // --- MODO: ANALISAR (GESTOR) ---
        else if (modo === 'analisar') {
            titulo.innerText = 'Análise de Férias';
            inputs.forEach(el => el.disabled = true); 
            document.getElementById('ferias-obs').disabled = false; // Permite obs

            // Esconde alerta simples para usar o painel rico
            if(alertSimples) alertSimples.style.display = 'none';

            // Renderiza Painel Rico
            await montarPainelAnalise(item);
            if(areaAnalise) areaAnalise.style.display = 'block';

            // Botões com prevenção de propagação para não acionar o "fechar" acidentalmente
            footer.innerHTML = `
                <button type="button" class="btn-cancel" style="background:#f0f0f0; color:#333; border:1px solid #ccc; font-weight:500; padding: 8px 16px; border-radius:4px;" onclick="fecharModalFerias()">
                    Cancelar
                </button>
                
                <button type="button" style="background:#dc3545; color:white; border:none; font-weight:500; padding: 8px 16px; border-radius:4px; display:flex; align-items:center; gap:5px; cursor:pointer;" onclick="event.stopPropagation(); decidirFerias('rejeitado')">
                    <i class="fas fa-times"></i> Reprovar
                </button>
                
                <button type="button" style="background:#28a745; color:white; border:none; font-weight:500; padding: 8px 16px; border-radius:4px; display:flex; align-items:center; gap:5px; cursor:pointer;" onclick="event.stopPropagation(); decidirFerias('aprovado')">
                    <i class="fas fa-check"></i> Aprovar
                </button>
            `;
        }

    } else {
        // --- MODO: NOVO ---
        titulo.innerText = 'Solicitar Férias';
        footer.innerHTML = `
            <button type="button" class="btn-cancel" onclick="fecharModalFerias()">Cancelar</button>
            <button type="button" class="btn-primary" onclick="salvarFerias()">Solicitar</button>
        `;
    }

    // Listener para marcar como sujo
    form.oninput = () => { formFeriasSujo = true; };
    
    modal.classList.add('active');
    modal.style.display = 'flex';
}

function fecharModalFerias() {
    // Só pergunta se houver alterações pendentes (formFeriasSujo = true)
    if (formFeriasSujo) {
        if (typeof solicitarConfirmacao === 'function') {
            solicitarConfirmacao(() => {
                executarFechamento();
            }, "Existem alterações não salvas. Deseja descartar?");
        } else {
            if (confirm("Existem alterações não salvas. Deseja descartar?")) {
                executarFechamento();
            }
        }
        return; // Interrompe o fechamento direto
    }
    
    // Se não estiver sujo (ou foi salvo/aprovado), fecha direto
    executarFechamento();
}

function executarFechamento() {
    const modal = document.getElementById('modal-ferias');
    modal.classList.remove('active');
    
    // Limpa estados globais
    formFeriasSujo = false;
    dadosOriginaisFerias = null;
    
    setTimeout(() => modal.style.display = 'none', 200);
}

// =============================================================================
// 6. LÓGICA DE CONFLITOS E PERSISTÊNCIA
// =============================================================================

async function verificarConflitoFerias() {
    const colabId = document.getElementById('ferias-colaborador').value;
    const inicio = document.getElementById('ferias-inicio').value;
    const dias = parseInt(document.getElementById('ferias-dias').value) || 0;
    const idAtual = document.getElementById('ferias-id').value;

    const inputFim = document.getElementById('ferias-fim');
    const alertBox = document.getElementById('alert-conflito');
    const msgBox = document.getElementById('msg-conflito');

    if (!colabId || !inicio || dias < 1) {
        if(inputFim) inputFim.value = '';
        if(alertBox) alertBox.style.display = 'none';
        return;
    }

    // --- CORREÇÃO MATEMÁTICA E DE FUSO HORÁRIO ---
    // Dividimos a string da data para evitar que o JS aplique fuso horário local
    const [ano, mes, dia] = inicio.split('-').map(Number);
    const dtInicio = new Date(ano, mes - 1, dia, 12, 0, 0); // Meio-dia local
    
    const dtFim = new Date(dtInicio);
    // Regra de Férias: O período inclui o dia de início. 
    // Ex: Início dia 10 com 30 dias -> Termina dia 11 do mês seguinte (totalizando 30 dias de afastamento)
    dtFim.setDate(dtInicio.getDate() + dias); 
    
    if(inputFim) inputFim.value = dtFim.toLocaleDateString('pt-BR');
    // ----------------------------------------------

    const sel = document.getElementById('ferias-colaborador');
    const opt = sel.options[sel.selectedIndex];
    const unidadeId = opt ? opt.getAttribute('data-unidade') : null;

    if (!unidadeId) return;

    const { data: conflitos } = await clienteSupabase
        .from('solicitacoes_ferias')
        .select(`data_inicio, data_fim, colaborador:colaborador_id ( nome_completo )`)
        .eq('unidade_id', unidadeId)
        .in('status', ['aprovado', 'processado'])
        .neq('colaborador_id', colabId)
        .neq('id', idAtual || 0)
        .lte('data_inicio', dtFim.toISOString().split('T')[0])
        .gte('data_fim', inicio);

    if (conflitos && conflitos.length > 0) {
        const nomes = conflitos.map(c => {
            const i = new Date(c.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR').substring(0,5);
            return `${c.colaborador.nome_completo.split(' ')[0]} (${i})`;
        }).join(', ');
        
        if(msgBox) msgBox.innerHTML = `Conflito de período na unidade com: <b>${nomes}</b>`;
        if(alertBox) alertBox.style.display = 'block';
    } else {
        if(alertBox) alertBox.style.display = 'none';
    }
}

async function salvarFerias() {
    const colabId = document.getElementById('ferias-colaborador').value;
    const inicio = document.getElementById('ferias-inicio').value;
    const dias = document.getElementById('ferias-dias').value;
    const obs = document.getElementById('ferias-obs').value;
    const id = document.getElementById('ferias-id').value;

    if (!colabId || !inicio || !dias) {
        mostrarToast("Preencha campos obrigatórios.", "warning");
        return;
    }

    if (id && dadosOriginaisFerias) {
        const mudou = (
            dadosOriginaisFerias.data_inicio !== inicio ||
            dadosOriginaisFerias.dias_qtd !== String(dias) ||
            dadosOriginaisFerias.observacao !== obs
        );
        
        if (!mudou) {
            mostrarToast("Nenhuma alteração detectada para salvar.", "info");
            return;
        }
    }

    // --- CORREÇÃO DO CÁLCULO PARA O BANCO ---
    const dtInicio = new Date(inicio + 'T12:00:00');
    const dtFim = new Date(dtInicio);
    dtFim.setDate(dtInicio.getDate() + (parseInt(dias) - 1));
    // ----------------------------------------

    const sel = document.getElementById('ferias-colaborador');
    const unidadeId = sel.options[sel.selectedIndex].getAttribute('data-unidade');
    const userLogado = window.usuarioLogadoGlobal;

    const payload = {
        colaborador_id: colabId,
        unidade_id: unidadeId,
        data_inicio: inicio,
        dias_qtd: dias,
        data_fim: dtFim.toISOString().split('T')[0], // Envia YYYY-MM-DD correto
        observacao: obs,
        solicitante_id: userLogado.id,
        status: 'pendente'
    };

    try {
        let acaoLog = '';
        let dadosAntigosLog = null;

        if (id) {
            await clienteSupabase.from('solicitacoes_ferias').update(payload).eq('id', id);
            acaoLog = 'UPDATE';
            dadosAntigosLog = dadosOriginaisFerias;
        } else {
            const {data} = await clienteSupabase.from('solicitacoes_ferias').insert([payload]).select();
            if(data) payload.id = data[0].id;
            acaoLog = 'INSERT';
        }
        
        await registrarLogFerias(id || payload.id, acaoLog, dadosAntigosLog, payload);

        mostrarToast("Salvo com sucesso!", "success");
        formFeriasSujo = false; 
        fecharModalFerias(); 
        listarSolicitacoesFerias();
    } catch (e) {
        mostrarToast("Erro ao salvar: " + e.message, "error");
    }
}

async function decidirFerias(decisao) {
    const id = document.getElementById('ferias-id').value;
    const obs = document.getElementById('ferias-obs').value;
    
    if (!id) return;

    // Callback de execução (Grava no banco)
    const executarDecisao = async () => {
        const userLogado = window.usuarioLogadoGlobal;
        
        try {
            // Executa o Update (Sem travas de bloqueio)
            const { error } = await clienteSupabase
                .from('solicitacoes_ferias')
                .update({ 
                    status: decisao, 
                    aprovador_id: userLogado.id,
                    observacao: obs 
                })
                .eq('id', id);

            if (error) throw error;

            await registrarLogFerias(id, 'DECISAO', `Solicitação ${decisao.toUpperCase()} por ${userLogado.nome_completo || 'Gestor'}.`);

            mostrarToast(`Solicitação ${decisao.toUpperCase()} com sucesso!`, "success");
            
            formFeriasSujo = false; 
            fecharModalFerias();
            listarSolicitacoesFerias();

        } catch (e) {
            mostrarToast("Erro ao processar: " + e.message, "error");
        }
    };

    // --- VERIFICAÇÃO DE SEGURANÇA (CONFIRMAÇÃO) ---
    // Se for aprovar, checa se tem conflito apenas para exibir o alerta "Tem certeza?"
    if (decisao === 'aprovado') {
        const { data: atual } = await clienteSupabase.from('solicitacoes_ferias').select('unidade_id, data_inicio, data_fim, colaborador_id').eq('id', id).single();
        
        if (atual) {
            // Busca conflitos FIRMADOS (Aprovado/Processado)
            const { count } = await clienteSupabase
                .from('solicitacoes_ferias')
                .select('id', { count: 'exact', head: true }) // Apenas contagem
                .eq('unidade_id', atual.unidade_id)
                .in('status', ['aprovado', 'processado'])
                .neq('id', id)
                .neq('colaborador_id', atual.colaborador_id)
                .lte('data_inicio', atual.data_fim)
                .gte('data_fim', atual.data_inicio);

            if (count > 0) {
                // Se houver conflito, usa o modal de confirmação com mensagem de alerta
                abrirModalDecisao('aprovado_com_conflito', executarDecisao);
                return;
            }
        }
    }

    // Fluxo normal (Sem conflito ou Reprovação)
    abrirModalDecisao(decisao, executarDecisao);
}

// =============================================================================
// 7. HISTÓRICO E LOGS
// =============================================================================

async function abrirModalHistoricoFerias(id) {
    const modal = document.getElementById('modal-logs');
    const container = document.getElementById('timeline-logs');
    const titulo = document.getElementById('titulo-modal-logs');
    
    if(!modal || !container) {
        alert("Componente de histórico não encontrado na página.");
        return;
    }

    if(titulo) titulo.innerText = 'Histórico da Solicitação';
    container.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
    modal.classList.add('active');

    try {
        const { data: logs } = await clienteSupabase
            .from('logs_auditoria')
            .select('*, perfis(nome_completo)')
            .eq('tabela_afetada', 'solicitacoes_ferias')
            .eq('id_registro_afetado', id)
            .order('data_hora', { ascending: false });

        container.innerHTML = '';
        if(!logs || logs.length === 0) {
            container.innerHTML = '<p class="text-muted text-center">Sem histórico registrado.</p>';
            return;
        }

        logs.forEach(log => {
            const dataFmt = new Date(log.data_hora).toLocaleString('pt-BR');
            const user = log.perfis ? log.perfis.nome_completo : 'Sistema';
            let conteudoHtml = '';

            // --- TRATAMENTO VISUAL (INSERT, UPDATE, DECISAO) ---
            
            if (log.acao === 'INSERT') {
                conteudoHtml = `<div style="color:#28a745;"><i class="fas fa-plus-circle"></i> Solicitação criada.</div>`;
            } 
            else if (log.acao === 'DECISAO') {
                // Tenta pegar descrição legada ou objeto novo
                let desc = 'Decisão registrada.';
                if (log.dados_novos && log.dados_novos.descricao) desc = log.dados_novos.descricao;
                
                const cor = desc.toUpperCase().includes('REJEITADO') || desc.toUpperCase().includes('REPROVADO') ? '#dc3545' : '#28a745';
                conteudoHtml = `<div style="color:${cor}; font-weight:bold;">${desc}</div>`;
            }
            else if (log.acao === 'UPDATE') {
                // LÓGICA DE COMPARAÇÃO DE -> PARA
                const antigos = log.dados_antigos || {};
                const novos = log.dados_novos || {};
                let mudancas = [];

                // 1. Data Início
                if (antigos.data_inicio && novos.data_inicio && antigos.data_inicio !== novos.data_inicio) {
                    mudancas.push(`
                        <div>
                            <span style="font-weight:600; color:#555;">Início:</span> 
                            <span style="color:#dc3545; text-decoration:line-through; margin-right:5px;">${formatarDataBr(antigos.data_inicio)}</span> 
                            <i class="fas fa-arrow-right" style="font-size:0.8rem; color:#666;"></i> 
                            <span style="color:#28a745; font-weight:bold; margin-left:5px;">${formatarDataBr(novos.data_inicio)}</span>
                        </div>
                    `);
                }

                // 2. Dias
                // Normaliza para string para comparar
                if (antigos.dias_qtd && novos.dias_qtd && String(antigos.dias_qtd) !== String(novos.dias_qtd)) {
                    mudancas.push(`
                        <div>
                            <span style="font-weight:600; color:#555;">Dias:</span> 
                            <span style="color:#dc3545; text-decoration:line-through; margin-right:5px;">${antigos.dias_qtd}</span> 
                            <i class="fas fa-arrow-right" style="font-size:0.8rem; color:#666;"></i> 
                            <span style="color:#28a745; font-weight:bold; margin-left:5px;">${novos.dias_qtd}</span>
                        </div>
                    `);
                }

                // 3. Observação
                if (antigos.observacao !== undefined && novos.observacao !== undefined && antigos.observacao !== novos.observacao) {
                    const obsAntiga = antigos.observacao || '(vazio)';
                    const obsNova = novos.observacao || '(vazio)';
                    mudancas.push(`
                        <div style="margin-top:4px;">
                            <span style="font-weight:600; color:#555;">Obs:</span><br>
                            <span style="color:#dc3545; text-decoration:line-through; font-size:0.9rem;">${obsAntiga}</span><br>
                            <i class="fas fa-arrow-down" style="font-size:0.8rem; color:#666; margin: 2px 0;"></i><br>
                            <span style="color:#28a745; font-weight:bold; font-size:0.9rem;">${obsNova}</span>
                        </div>
                    `);
                }

                if (mudancas.length > 0) {
                    conteudoHtml = mudancas.join('<div style="margin: 5px 0; border-bottom:1px dashed #eee;"></div>');
                } else {
                    // Fallback para logs antigos que só tinham descrição texto
                    conteudoHtml = novos.descricao || 'Edição realizada (detalhes não disponíveis)';
                }
            }
            else {
                // Delete ou outros
                conteudoHtml = log.dados_novos?.descricao || log.acao;
            }

            container.innerHTML += `
                <div class="log-item" style="border-left: 3px solid #ccc; padding-left: 15px; margin-bottom: 20px; position:relative;">
                    <div style="font-size: 0.75rem; color: #999; margin-bottom:4px;">
                        ${dataFmt} &bull; <b>${user}</b>
                    </div>
                    <div style="background:#f8f9fa; padding:10px; border-radius:6px; border:1px solid #eee;">
                        ${conteudoHtml}
                    </div>
                </div>
            `;
        });

    } catch(e) {
        console.error(e);
        container.innerHTML = '<p class="text-danger">Erro ao carregar logs.</p>';
    }
}

async function registrarLogFerias(id, acao, dadosAntigos, dadosNovos) {
    const user = window.usuarioLogadoGlobal;
    
    // Prepara payload do Log
    const logPayload = {
        tabela_afetada: 'solicitacoes_ferias',
        id_registro_afetado: id,
        acao: acao,
        usuario_id: user ? user.id : null,
        data_hora: new Date().toISOString()
    };

    // Se for objeto, salva direto no JSONB. Se for string (legado), encapsula.
    if (dadosAntigos) {
        logPayload.dados_antigos = (typeof dadosAntigos === 'object') ? dadosAntigos : { descricao: dadosAntigos };
    }
    
    if (dadosNovos) {
        logPayload.dados_novos = (typeof dadosNovos === 'object') ? dadosNovos : { descricao: dadosNovos };
    }

    await clienteSupabase.from('logs_auditoria').insert([logPayload]);
}

async function verificarConflitoFeriasVisual() {
    const inicio = document.getElementById('ferias-inicio').value;
    const dias = parseInt(document.getElementById('ferias-dias').value) || 0;
    const inputFim = document.getElementById('ferias-fim');
    const msgBox = document.getElementById('msg-conflito-simples');
    const alertBox = document.getElementById('alert-conflito-simples');
    const idAtual = document.getElementById('ferias-id').value;
    
    if(alertBox) alertBox.style.display = 'none';
    if(inputFim) inputFim.value = '';

    if (!inicio || dias <= 0) return;

    // --- CÁLCULO PRECISO ---
    const [ano, mes, dia] = inicio.split('-').map(Number);
    const dtInicio = new Date(ano, mes - 1, dia, 12, 0, 0);
    const dtFim = new Date(dtInicio);
    dtFim.setDate(dtInicio.getDate() + dias);
    
    const dataFimFormatada = dtFim.toISOString().split('T')[0];
    if(inputFim) inputFim.value = dtFim.toLocaleDateString('pt-BR');
    // -----------------------

    const selColab = document.getElementById('ferias-colaborador');
    if (!selColab || selColab.selectedIndex < 0) return;
    const unidadeId = selColab.options[selColab.selectedIndex].getAttribute('data-unidade');
    const colabId = selColab.value;

    if (!unidadeId || !colabId) return;

    try {
        const { data: conflitos } = await clienteSupabase
            .from('solicitacoes_ferias')
            .select(`id, data_inicio, data_fim, status, colaborador:colaborador_id ( nome_completo )`)
            .eq('unidade_id', unidadeId)
            .in('status', ['aprovado', 'processado', 'pendente']) 
            .neq('colaborador_id', colabId)
            .neq('id', idAtual || 0)
            .lte('data_inicio', dataFimFormatada)
            .gte('data_fim', inicio);

        if (conflitos && conflitos.length > 0) {
            const conflitosFirmados = conflitos.filter(c => c.status !== 'pendente');
            const conflitosPendentes = conflitos.filter(c => c.status === 'pendente');
            let htmlMsg = '';
            
            const gerarLista = (lista, corTexto) => {
                return `<ul style="margin: 5px 0 10px 20px; padding: 0; list-style-type: circle; color: ${corTexto};">` +
                    lista.map(c => {
                        const dI = new Date(c.data_inicio + 'T12:00:00').toLocaleDateString('pt-BR').substring(0,5);
                        const dF = new Date(c.data_fim + 'T12:00:00').toLocaleDateString('pt-BR').substring(0,5);
                        const nome = c.colaborador.nome_completo.split(' ')[0];
                        return `<li><b>${nome}</b> (${dI} a ${dF}) - ${c.status.toUpperCase()}</li>`;
                    }).join('') + `</ul>`;
            };

            if (conflitosFirmados.length > 0) {
                htmlMsg += `<div style="color:#b04a00; font-weight:bold;"><i class="fas fa-exclamation-circle"></i> Choque com férias agendadas:</div>`;
                htmlMsg += gerarLista(conflitosFirmados, '#b04a00');
            }
            if (conflitosPendentes.length > 0) {
                htmlMsg += `<div style="color:#856404; font-weight:bold;"><i class="fas fa-clock"></i> Solicitações pendentes no período:</div>`;
                htmlMsg += gerarLista(conflitosPendentes, '#856404');
            }
            if (msgBox) msgBox.innerHTML = htmlMsg;
            if (alertBox) alertBox.style.display = 'block';
        }
    } catch (e) { console.error(e); }
}

async function montarPainelAnalise(item) {
    try {
        // 1. Preenche campos visuais do modal
        const colab = document.getElementById('ferias-colaborador');
        const inicio = document.getElementById('ferias-inicio');
        const dias = document.getElementById('ferias-dias');
        const fim = document.getElementById('ferias-fim');
        const obs = document.getElementById('ferias-obs');

        if (colab) colab.value = item.colaborador_id || '';
        if (inicio) inicio.value = item.data_inicio || '';
        if (dias) dias.value = item.dias_qtd || '';
        if (fim && item.data_fim) {
            fim.value = formatarDataBr(item.data_fim);
        }
        if (obs) obs.value = item.observacao || '';

        // 2. Prepara Container
        const container = document.getElementById('area-analise-gestor');
        if (!container) return;
        container.innerHTML = '<div class="text-center p-2" style="font-size:0.9rem; color:#666;"><i class="fas fa-spinner fa-spin"></i> Carregando histórico...</div>';

        // 3. BUSCA HISTÓRICO (Últimas Férias)
        // CORREÇÃO: Agora busca também por 'aprovado', não apenas 'processado'
        const { data: historico } = await clienteSupabase
            .from('solicitacoes_ferias')
            .select('data_inicio, data_fim, dias_qtd, status')
            .eq('colaborador_id', item.colaborador_id)
            .in('status', ['aprovado', 'processado']) // <--- ALTERADO AQUI
            .neq('id', item.id)
            .order('data_inicio', { ascending: false })
            .limit(1);

        // --- 4. RENDERIZAÇÃO HTML ---
        let html = '';

        // O alerta de conflito fica no topo (amarelo), aqui renderizamos apenas o histórico
        html += `<div style="font-size:0.9rem; color:#555; padding-top:5px;">`;
        
        if (historico && historico.length > 0) {
            const ult = historico[0];
            const dIniHist = ult.data_inicio ? ult.data_inicio.split('-').reverse().join('/') : '?';
            
            // Adicionei o status visualmente para saber se foi gozada ou se está agendada
            const statusLabel = ult.status === 'processado' ? '(Realizada)' : '(Agendada)';
            
            html += `<i class="fas fa-history"></i> <b>Últimas Férias:</b> ${dIniHist} (${ult.dias_qtd} dias) <span style="font-size:0.8em; color:#666;">${statusLabel}</span>`;
        } else {
            html += `<i class="fas fa-history"></i> <b>Últimas Férias:</b> Sem registro anterior no sistema.`;
        }
        html += `</div>`;

        container.innerHTML = html;

    } catch (e) {
        console.error('Erro na análise:', e);
        const container = document.getElementById('area-analise-gestor');
        if(container) container.innerHTML = ''; 
    }
}

async function excluirSolicitacaoFerias(id) {
    // Define a lógica de exclusão para ser chamada após a confirmação
    const executarExclusao = async () => {
        try {
            // 1. Remove o registro da tabela 'solicitacoes_ferias'
            const { error } = await clienteSupabase
                .from('solicitacoes_ferias')
                .delete()
                .eq('id', id);

            if (error) throw error;

            // 2. Registra o Log de Auditoria (Segurança e Rastreabilidade)
            const user = window.usuarioLogadoGlobal;
            await clienteSupabase.from('logs_auditoria').insert([{
                tabela_afetada: 'solicitacoes_ferias',
                id_registro_afetado: id,
                acao: 'DELETE',
                usuario_id: user ? user.id : null,
                dados_novos: { descricao: 'Solicitação rejeitada excluída definitivamente.' }, 
                data_hora: new Date().toISOString()
            }]);

            // 3. Feedback visual e atualização da lista
            mostrarToast("Registro excluído com sucesso!", "success");
            
            // Fecha o modal de detalhes se ele estiver aberto no momento da exclusão
            fecharModalFerias(); 
            
            // Recarrega a tabela para sumir com o registro excluído
            listarSolicitacoesFerias();

        } catch (e) {
            console.error("Erro ao excluir solicitação:", e);
            mostrarToast("Erro ao excluir: " + e.message, "error");
        }
    };

    // Verifica se existe a função global de modal personalizado (padrão do seu sistema)
    if (typeof solicitarConfirmacao === 'function') {
        solicitarConfirmacao(
            executarExclusao, 
            "Tem certeza que deseja excluir esta solicitação? Esta ação é irreversível."
        );
    } else {
        // Fallback caso o modal personalizado não carregue
        if (confirm("Tem certeza que deseja excluir esta solicitação? Esta ação é irreversível.")) {
            executarExclusao();
        }
    }
}

// Helper para formatar YYYY-MM-DD para DD/MM/AAAA (Visualização)
function formatarDataBr(dataIso) {
    if (!dataIso) return '';
    return dataIso.split('-').reverse().join('/');
}

// --- CONTROLE DO MODAL DE DECISÃO ---

function abrirModalDecisao(acao, callback) {
    const modal = document.getElementById('modal-confirmacao-decisao');
    const titulo = document.getElementById('titulo-decisao');
    const msg = document.getElementById('msg-decisao');
    const icone = document.getElementById('icone-decisao');
    const btnConfirmar = document.getElementById('btn-confirmar-decisao');

    if (!modal) {
        if(confirm(`Deseja realmente prosseguir com a ação?`)) callback();
        return;
    }

    callbackDecisaoAtual = callback;

    if (acao === 'aprovado') {
        titulo.innerText = 'Aprovar Solicitação';
        msg.innerHTML = 'Tem certeza que deseja <b>APROVAR</b> as férias deste colaborador?';
        icone.innerHTML = '<i class="fas fa-check-circle" style="color: #28a745;"></i>';
        btnConfirmar.style.backgroundColor = '#28a745';
        btnConfirmar.innerText = 'Sim, Aprovar';
    } 
    // --- NOVO CASO: APROVAÇÃO COM ALERTA ---
    else if (acao === 'aprovado_com_conflito') {
        titulo.innerText = 'Aprovar com Conflito?';
        msg.innerHTML = '<span style="color:#b04a00;">⚠️ Existem outras férias agendadas neste período.</span><br><br>Deseja aprovar mesmo assim?';
        icone.innerHTML = '<i class="fas fa-exclamation-triangle" style="color: #fd7e14;"></i>';
        btnConfirmar.style.backgroundColor = '#fd7e14'; // Laranja
        btnConfirmar.innerText = 'Sim, Aprovar Mesmo Assim';
    }
    else {
        titulo.innerText = 'Reprovar Solicitação';
        msg.innerHTML = 'Tem certeza que deseja <b>REPROVAR</b> esta solicitação?';
        icone.innerHTML = '<i class="fas fa-times-circle" style="color: #dc3545;"></i>';
        btnConfirmar.style.backgroundColor = '#dc3545';
        btnConfirmar.innerText = 'Sim, Reprovar';
    }

    btnConfirmar.onclick = () => {
        if (callbackDecisaoAtual) callbackDecisaoAtual();
        fecharModalDecisao();
    };

    modal.classList.add('active');
    modal.style.display = 'flex';
}

function fecharModalDecisao() {
    const modal = document.getElementById('modal-confirmacao-decisao');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 200);
    }
    callbackDecisaoAtual = null;
}