// admin/js/acoes_checklist.js

// =============================================================================
// VARIÁVEIS GLOBAIS DE ESTADO
// =============================================================================
let listaInspecoesCache = [];
let inspecaoAtual = null;        


// Configuração de SLA (em horas)
const SLA_CONFIG = {
    ATENDIMENTO_MAX: 4, 
   RESOLUCAO_MAX: 24   
};

// =============================================================================
// 1. INICIALIZAÇÃO E LISTAGEM
// =============================================================================

function inicializarAcoesChecklist(unidadeInicial = null) {
    console.log("Inicializando Ações Checklist...");
    const titulo = document.getElementById('titulo-pagina');
    if(titulo) titulo.innerText = 'Central de Checklists';
    
    // 1. Configura filtro de unidade
    const elRodape = document.getElementById('sel-unidade');
    if (elRodape) {
        if (!unidadeInicial) unidadeInicial = elRodape.value;
        elRodape.onchange = function() {
            listarInspecoes(this.value);
        };
    }

    if (typeof limparNotificacoesMenu === 'function') {
        limparNotificacoesMenu();
    }

    // 2. Carrega dados iniciais e Aplica Filtro Padrão (Hoje)
    listarInspecoes(unidadeInicial).then(() => {
        const container = document.getElementById('container-filtros-checklist');
        if(container && container.children.length === 0) {
            // [CORREÇÃO] Define o filtro padrão para o dia atual
            const hoje = new Date().toLocaleDateString('en-CA'); // Formato YYYY-MM-DD
            adicionarFiltroChecklist('data', hoje);
        }
    });

    // 3. Relógio SLA
    setInterval(() => {
        if (listaInspecoesCache && listaInspecoesCache.length > 0) {
            if (typeof aplicarFiltrosChecklist === 'function') {
                aplicarFiltrosChecklist();
            }
        }
    }, 60000);

    // 4. REALTIME
    const canais = clienteSupabase.getChannels();
    const canalExistente = canais.find(c => c.topic === 'realtime:public:inspecoes');
    if (canalExistente) clienteSupabase.removeChannel(canalExistente);
    
    document.addEventListener('keydown', (e) => {
        if(e.key === 'Escape') {
            const modal = document.getElementById('modal-confirmacao-v2');
            if(modal && modal.classList.contains('active')) fecharConfirmacaoV2();
        }
    });
}

async function listarInspecoes(unidadeFiltro = null) {
    const tbody = document.getElementById('tbody-inspecoes');
    const lblContagem = document.getElementById('lbl-contagem-checklist');
    
    // Se for o primeiro carregamento e não tiver dados, mostra loading
    if(listaInspecoesCache.length === 0 && tbody) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center p-5"><i class="fas fa-spinner fa-spin"></i> Atualizando dados...</td></tr>';
    }

    if (!unidadeFiltro) {
        const elRodape = document.getElementById('sel-unidade');
        if (elRodape) unidadeFiltro = elRodape.value;
    }

    try {
        let query = clienteSupabase
            .from('inspecoes')
            .select(`
                id, numero_controle, data_abertura, status, data_atendimento, data_resolucao,
                veiculos!inner (placa, modelo, unidade_id, unidades (nome)),
                perfis!motorista_id (nome_completo), 
                responsavel:perfis!responsavel_atual_id (nome_completo),
                modelos_checklist (titulo)
            `)
            .order('data_abertura', { ascending: false });

        if (unidadeFiltro && unidadeFiltro !== 'TODAS' && unidadeFiltro !== '') {
            query = query.eq('veiculos.unidade_id', unidadeFiltro);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        // 1. Atualiza o Cache Global
        listaInspecoesCache = data || [];
        
        // 2. Aplica os filtros.
        // Se não houver filtros na tela, a função aplicarFiltrosChecklist exibirá tudo automaticamente.
        if (typeof aplicarFiltrosChecklist === 'function') {
            aplicarFiltrosChecklist();
        } else {
            // Fallback caso a função de filtro ainda não tenha carregado
            renderizarTabelaChecklist(listaInspecoesCache);
        }

    } catch (err) {
        console.error("Erro ao listar inspeções:", err);
        if(tbody) tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro de conexão. Tente recarregar.</td></tr>';
    }
}

// Função para tocar som de notificação (Beep agradável)
function tocarSomNotificacao() {
    // Caminho relativo ao admin/index.html
    const audio = new Audio("sounds/alert.mp3");
    audio.volume = 1.0;
    
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.warn("Áudio bloqueado (interaja com a página para liberar):", error);
        });
    }
}

// =============================================================================
// 2. SISTEMA DE FILTROS DINÂMICOS
// =============================================================================

window.adicionarFiltroChecklist = function(tipoPre = null, valorPre = null) {
    const container = document.getElementById('container-filtros-checklist');
    const id = Date.now(); 
    const div = document.createElement('div');
    div.className = 'filter-row'; 
    div.id = `row-check-${id}`;
    
    div.innerHTML = `
        <select id="sel-tipo-${id}" onchange="configurarInputFiltro(this, ${id})" style="width: 140px;">
            <option value="" disabled selected>Filtrar por...</option>
            <option value="placa">Placa</option>
            <option value="motorista">Motorista</option>
            <option value="responsavel">Responsável</option>
            <option value="status">Status</option>
            <option value="data">Data</option> 
            <option value="atrasado">SLA Atrasado</option>
        </select>
        
        <div id="wrapper-val-${id}" class="filter-value-wrapper" style="width: 250px; display:flex;">
            <input type="text" disabled placeholder="Selecione um filtro..." style="color:#aaa; width:100%;">
        </div>
        
        <button onclick="removerFiltroChecklist(${id})" style="border:none; background:none; color:#dc3545; cursor:pointer; padding:0 10px;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);

    if (tipoPre) {
        const sel = document.getElementById(`sel-tipo-${id}`);
        sel.value = tipoPre;
        // [CORREÇÃO] Passa o valor pré-definido para a configuração
        configurarInputFiltro(sel, id, valorPre);
    }
}

window.removerFiltroChecklist = function(id) {
    const row = document.getElementById(`row-check-${id}`);
    if (row) {
        row.remove();
        aplicarFiltrosChecklist();
    }
}

window.adicionarFiltroChecklist = function(tipoPre = null, valorPre = null) {
    const container = document.getElementById('container-filtros-checklist');
    const id = Date.now(); 
    const div = document.createElement('div');
    div.className = 'filter-row'; 
    div.id = `row-check-${id}`;
    
    div.innerHTML = `
        <select id="sel-tipo-${id}" onchange="configurarInputFiltro(this, ${id})" style="width: 140px;">
            <option value="" disabled selected>Filtrar por...</option>
            <option value="placa">Placa</option>
            <option value="motorista">Motorista</option>
            <option value="responsavel">Responsável</option>
            <option value="status">Status</option>
            <option value="data">Data</option> 
            <option value="atrasado">SLA Atrasado</option>
        </select>
        
        <div id="wrapper-val-${id}" class="filter-value-wrapper" style="width: 250px; display:flex;">
            <input type="text" disabled placeholder="Selecione um filtro..." style="color:#aaa; width:100%;">
        </div>
        
        <button onclick="removerFiltroChecklist(${id})" style="border:none; background:none; color:#dc3545; cursor:pointer; padding:0 10px;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);

    if (tipoPre) {
        const sel = document.getElementById(`sel-tipo-${id}`);
        sel.value = tipoPre;
        // [CORREÇÃO] Passa o valor pré-definido para a configuração
        configurarInputFiltro(sel, id, valorPre);
    }
}

function aplicarFiltrosChecklist() {
    let dadosFiltrados = [...listaInspecoesCache];
    let legendas = []; // Array para armazenar as descrições dos filtros ativos

    const container = document.getElementById('container-filtros-checklist');
    
    if(container) {
        const linhas = container.querySelectorAll('.filter-row');
        linhas.forEach(linha => {
            // 1. Captura o Tipo
            const selectTipo = linha.querySelector('select');
            const tipo = selectTipo.value;
            const tipoTexto = selectTipo.options[selectTipo.selectedIndex].text; // Ex: "Placa", "Status"

            // 2. Captura o Valor
            const wrapper = linha.querySelector(`div[id^="wrapper-val-"]`);
            const elValor = wrapper.querySelector('input, select');
            const valor = elValor ? elValor.value : '';

            if (tipo && valor) {
                // Monta o texto visual da legenda
                let valorTexto = valor;
                
                // Formatações específicas para a legenda
                if (elValor.tagName === 'SELECT' && elValor.selectedIndex >= 0) {
                    valorTexto = elValor.options[elValor.selectedIndex].text;
                } 
                else if (tipo === 'data') {
                    const p = valor.split('-');
                    valorTexto = `${p[2]}/${p[1]}/${p[0]}`; // PT-BR
                }
                else if (tipo === 'status') {
                    if (valor === 'pendente_grupo') valorTexto = 'Pendente (Geral)';
                    else if (valor === 'concluido') valorTexto = 'Concluído';
                    else valorTexto = valor.charAt(0).toUpperCase() + valor.slice(1).replace('_', ' ');
                }
                else if (tipo === 'atrasado') {
                    valorTexto = 'Sim';
                }

                // Adiciona à lista de legendas
                legendas.push(`<b>${tipoTexto}:</b> ${valorTexto}`);

                // 3. Aplica o Filtro nos Dados
                dadosFiltrados = dadosFiltrados.filter(i => {
                    if (tipo === 'placa') return i.veiculos?.placa === valor;
                    if (tipo === 'motorista') return i.perfis?.nome_completo === valor;
                    if (tipo === 'responsavel') return i.responsavel?.nome_completo === valor;
                    
                    if (tipo === 'data') {
                        if (!i.data_abertura) return false;
                        const dataBanco = new Date(i.data_abertura).toLocaleDateString('en-CA'); 
                        return dataBanco === valor;
                    }
                    
                    if (tipo === 'status') {
                        const st = (i.status || '').toLowerCase();
                        if (valor === 'pendente_grupo') return ['pendente', 'nok', 'bloqueado', 'divergente'].includes(st);
                        if (valor === 'concluido') return st === 'concluido';
                        return st === valor;
                    }
                    
                    if (tipo === 'atrasado') {
                         const sla = calcularSlaStatus(i);
                         return (sla.atendimento.includes('sla-late') || sla.resolucao.includes('sla-late'));
                    }
                    return true;
                });
            }
        });
    }

    // [NOVO] Atualiza a Barra de Legenda Visual
    // Tenta encontrar o elemento de filtros na barra de stats. 
    // Se não existir (dependendo do seu HTML), tente adicionar um <div id="lbl-filtros-checklist"></div> ao lado do contador.
    const lblFiltros = document.getElementById('lbl-filtros-checklist') || document.getElementById('lbl-filtros-checklist-ativos');
    
    if (lblFiltros) {
        if (legendas.length > 0) {
            lblFiltros.innerHTML = `<i class="fas fa-filter"></i> ${legendas.join(' <span style="margin:0 5px; color:#ccc;">|</span> ')}`;
            lblFiltros.style.color = '#003399';
            lblFiltros.style.display = 'block';
        } else {
            lblFiltros.innerHTML = `<i class="fas fa-filter"></i> Mostrando tudo`;
            lblFiltros.style.color = '#666';
        }
    }

    renderizarTabelaChecklist(dadosFiltrados);
}

// =============================================================================
// 3. RENDERIZAÇÃO DA TABELA
// =============================================================================

function renderizarTabelaChecklist(lista) {
    const tbody = document.getElementById('tbody-inspecoes');
    const lblContagem = document.getElementById('lbl-contagem-checklist');
    
    tbody.innerHTML = '';
    if(lblContagem) lblContagem.innerHTML = `Exibindo <strong>${lista.length}</strong> registro(s)`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center p-4 text-muted">Nenhum registro encontrado.</td></tr>';
        return;
    }

    lista.forEach(i => {
        const idVisual = i.numero_controle || i.id;
        const slaInfo = calcularSlaStatus(i);
        const slaTexto = slaInfo.atendimento.includes('sla-late') ? slaInfo.atendimento : (slaInfo.resolucao.includes('sla-late') ? slaInfo.resolucao : slaInfo.resolucao);
        // ... (standard variables: nomeUnidade, placa, motorista, etc.) ...
        const nomeUnidade = i.veiculos?.unidades?.nome || '-';
        const placa = i.veiculos ? i.veiculos.placa : '---';
        const motorista = i.perfis ? i.perfis.nome_completo.split(' ')[0] : 'Desc.';
        const dtAbertura = new Date(i.data_abertura).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour:'2-digit', minute:'2-digit' });
        const responsavel = i.responsavel ? i.responsavel.nome_completo.split(' ')[0] : '-';
        const tipoChecklist = i.modelos_checklist?.titulo || 'Geral';

        // --- Status Logic ---
        let statusBadge = '';
        let corID = '#6c757d';
        const st = (i.status || '').toLowerCase();

        // Check if status implies "Action Required by Maintenance"
        // Actionable: pendente, nok, divergente, bloqueado, em_analise (maybe)
        // Non-Actionable: concluido, corrigido, aguardando_motorista
        const isActionable = ['pendente', 'nok', 'divergente', 'bloqueado', 'em_analise'].includes(st);

        if (st === 'concluido') {
            if (i.data_atendimento) { statusBadge = '<span class="badge" style="background-color: #17a2b8; color: white;">CORRIGIDO</span>'; corID = '#17a2b8'; } 
            else { statusBadge = '<span class="badge badge-concluido">CONCLUÍDO</span>'; corID = '#28a745'; }
        }
        else if(['pendente','nok','divergente'].includes(st)) { statusBadge = '<span class="badge badge-pendente">PENDENTE</span>'; corID = '#dc3545'; }
        else if(st === 'em_analise') { statusBadge = '<span class="badge badge-analise">EM ANÁLISE</span>'; corID = '#007bff'; }
        else if(st === 'aguardando_motorista') { statusBadge = '<span class="badge badge-aguardando">AGUARDANDO MOTORISTA</span>'; corID = '#fd7e14'; }
        else if(st === 'bloqueado') { statusBadge = '<span class="badge badge-bloqueado">BLOQUEADO</span>'; corID = '#dc3545'; }
        else { statusBadge = `<span class="badge" style="background:#e9ecef; color:#333;">${st}</span>`; }

        // --- Notification Logic ---
        // Only show notification if:
        // 1. ID is in the "New Updates" list
        // 2. AND the status is actually actionable (maintenance needs to do something)
        let temNovidade = false;
        
        if (typeof idsComNovidade !== 'undefined' && idsComNovidade.has(i.id)) {
            if (isActionable) {
                temNovidade = true;
            } else {
                // If it's in the list but not actionable (e.g., just moved to 'aguardando_motorista'), remove it silently
                idsComNovidade.delete(i.id);
            }
        }

        const tr = document.createElement('tr');
        tr.id = `tr-${i.id}`;
        
        // Only apply highlighting if it's a relevant novelty
        if (temNovidade) {
            tr.className = 'nova-movimentacao'; 
            tr.style.backgroundColor = '#fffbf2';
        }

        let iconeSino = temNovidade ? `<i class="fas fa-bell" style="color:#fd7e14; margin-right:5px; animation:bounce 1s infinite;"></i>` : '';

        tr.innerHTML = `
            <td>
                <div style="display:flex; flex-direction:column; padding-left: 8px; border-left: 4px solid ${corID};">
                    <strong style="color:${corID}; font-size: 1rem;">${iconeSino} #${idVisual}</strong>
                    <span style="font-size:0.65rem; color:#666; text-transform:uppercase; font-weight:600; opacity:0.8;">${tipoChecklist}</span>
                </div>
            </td>
            <td><small>${dtAbertura}</small></td>
            <td>${nomeUnidade}</td>
            <td><b>${placa}</b></td>
            <td>${motorista}</td>
            <td class="text-center">${statusBadge}</td>
            <td><small>${responsavel}</small></td>
            <td>${slaTexto}</td>
            <td class="text-center" style="white-space:nowrap;">
                <button class="action-btn" onclick="marcarComoVisto('${i.id}'); abrirTratativa('${i.id}', 'view')" title="Visualizar Detalhes"><i class="fas fa-eye"></i></button>
                <button class="action-btn" onclick="marcarComoVisto('${i.id}'); verLinhaTempo('${i.id}')" title="Histórico Completo"><i class="fas fa-history"></i></button>
                <button class="action-btn" onclick="marcarComoVisto('${i.id}'); abrirTratativa('${i.id}', 'edit')" title="Gerenciar Chamado" style="color: var(--cor-primaria);"><i class="fas fa-tools"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.marcarComoVisto = function(id) {
    if (typeof idsComNovidade !== 'undefined') {
        idsComNovidade.delete(id); // Remove do Set global
        idsComNovidade.delete(parseInt(id)); // Garante remoção se for numérico
    }
    // Remove o destaque visual imediatamente (sem precisar recarregar a lista toda)
    const row = document.getElementById(`tr-${id}`);
    if(row) {
        row.classList.remove('nova-movimentacao');
        const icon = row.querySelector('.fa-bell');
        if(icon) icon.remove();
        
        // Remove background amarelado se houver
        row.style.backgroundColor = '';
    }
}

function calcularSlaStatus(inspecao) {
    const agora = new Date();
    const abertura = new Date(inspecao.data_abertura);
    const atendimento = inspecao.data_atendimento ? new Date(inspecao.data_atendimento) : null;
    const resolucao = inspecao.data_resolucao ? new Date(inspecao.data_resolucao) : null;

    // Helper Inteligente: Formata tempo
    const fmtTempo = (ms) => {
        const totalMin = Math.floor(ms / 60000);
        if (totalMin < 60) return `${totalMin}m`;
        const dias = Math.floor(totalMin / 1440);
        const horas = Math.floor((totalMin % 1440) / 60);
        const min = totalMin % 60;
        if (dias > 0) return `${dias}d ${horas}h`;
        return `${horas}h ${min}m`;
    };

    let slaAtendHtml = '<span class="text-muted">-</span>';
    
    // 1. SLA DE ATENDIMENTO (Mantido igual)
    if (['pendente','bloqueado','nok','divergente'].includes(inspecao.status)) {
        const diffMs = agora - abertura;
        const diffHoras = diffMs / 36e5;
        if (diffHoras > SLA_CONFIG.ATENDIMENTO_MAX) {
            slaAtendHtml = `<span class="sla-badge sla-late" title="Fila Estourada"><i class="fas fa-fire"></i> +${fmtTempo(diffMs)} (Fila)</span>`;
        } else {
            slaAtendHtml = `<span class="sla-badge sla-warn"><i class="fas fa-clock"></i> ${fmtTempo(diffMs)}</span>`;
        }
    } else if (atendimento) {
        const levouMs = atendimento - abertura;
        const levouHoras = levouMs / 36e5;
        const classe = levouHoras > SLA_CONFIG.ATENDIMENTO_MAX ? 'sla-late' : 'sla-ok';
        slaAtendHtml = `<span class="sla-badge ${classe}"><i class="fas fa-check"></i> ${fmtTempo(levouMs)}</span>`;
    }

    // 2. SLA DE RESOLUÇÃO (CORRIGIDO)
    let slaResHtml = '<span class="text-muted">-</span>';
    
    // Lista de status onde o SLA deve parar de contar (Tempo Estático)
    // [CORREÇÃO]: Adicionado 'corrigido' e 'aguardando_motorista'
    const statusFinalizados = ['concluido', 'ok', 'corrigido', 'aguardando_motorista'];
    const stAtual = (inspecao.status || '').toLowerCase();

    // Se o status NÃO estiver na lista de finalizados, o relógio corre (usa 'agora')
    if (!statusFinalizados.includes(stAtual)) {
        const diffMs = agora - abertura;
        const diffHoras = diffMs / 36e5;
        
        if (diffHoras > SLA_CONFIG.RESOLUCAO_MAX) {
            slaResHtml = `<span class="sla-badge sla-late"><i class="fas fa-exclamation-triangle"></i> ${fmtTempo(diffMs)}</span>`;
        } else {
            slaResHtml = `<span class="sla-badge sla-warn" style="color:#004085; background:#cce5ff; border-color:#b8daff;">
                <i class="fas fa-stopwatch"></i> ${fmtTempo(diffMs)}
            </span>`;
        }
    } 
    // Se estiver finalizado E tiver data de resolução, mostra o tempo fixo
    else if (resolucao) {
        const totalMs = resolucao - abertura;
        // Ícone de bandeira para indicar chegada/fim
        slaResHtml = `<span class="sla-badge sla-ok" title="Tempo Final"><i class="fas fa-flag-checkered"></i> ${fmtTempo(totalMs)}</span>`;
    }

    return { atendimento: slaAtendHtml, resolucao: slaResHtml };
}

// =============================================================================
// 4. TRATATIVA E RESOLUÇÃO
// =============================================================================

window.abrirTratativa = async function(id, modo = 'view', filtroInicial = 'todos') {
    const modal = document.getElementById('modal-tratativa');
    const container = document.getElementById('lista-respostas-container');
    const alertaContainer = document.getElementById('alerta-recusa-container');
    const footerBtns = document.getElementById('modal-footer-btns');
    
    // [CORREÇÃO] Usa o filtro passado por parâmetro (preserva estado) ou 'todos' se for nova abertura
    const radioFiltro = document.querySelector(`input[name="filtro-itens"][value="${filtroInicial}"]`);
    if (radioFiltro) radioFiltro.checked = true;

    container.innerHTML = '<div class="text-center p-5"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
    alertaContainer.innerHTML = ''; 
    if (footerBtns) footerBtns.innerHTML = '';

    modal.classList.add('active');

    inspecaoAtual = listaInspecoesCache.find(i => i.id == id);
    if(!inspecaoAtual) {
        const { data } = await clienteSupabase
            .from('inspecoes')
            .select('*, veiculos(placa, modelo), perfis!motorista_id(nome_completo), modelos_checklist(titulo)')
            .eq('id', id)
            .single();
        if(data) inspecaoAtual = data;
        else return;
    }

    const displayId = inspecaoAtual.numero_controle || inspecaoAtual.id;
    const tipo = inspecaoAtual.modelos_checklist?.titulo || 'Checklist';
    const placa = inspecaoAtual.veiculos?.placa || '---';
    const nomeMotorista = inspecaoAtual.perfis?.nome_completo || 'Motorista N/D';

    document.getElementById('titulo-tratativa').innerHTML = `
        <div style="line-height: 1.2;">
            <span style="font-size: 1rem; color: #003366;">#${displayId}</span>
            <span style="margin: 0 8px; color:#ccc;">|</span>
            <span style="font-size: 1rem; font-weight: 800;">${placa}</span>
            <span style="margin: 0 8px; color:#ccc;">•</span>
            <span style="font-size: 0.95rem; color: #444; font-weight: 600;"><i class="fas fa-user-circle"></i> ${nomeMotorista}</span>
            <div style="font-size: 0.85rem; color: #666; font-weight: normal; margin-top: 4px;">
                ${tipo}
            </div>
        </div>
    `;

    const elBadge = document.getElementById('badge-status-modal');
    elBadge.innerText = (inspecaoAtual.status || '').toUpperCase().replace('_', ' ');
    elBadge.className = `badge badge-${inspecaoAtual.status === 'em_analise' ? 'analise' : (inspecaoAtual.status === 'concluido' ? 'concluido' : 'pendente')}`;

    let textoRecusa = null;
    if (inspecaoAtual.parecer_tecnico && inspecaoAtual.parecer_tecnico.includes('[RECUSA MOTORISTA')) {
        const linhas = inspecaoAtual.parecer_tecnico.split('\n');
        for (let i = linhas.length - 1; i >= 0; i--) {
            if (linhas[i].includes('[RECUSA MOTORISTA')) {
                textoRecusa = (linhas[i].split(']:')[1] || linhas[i]).trim();
                alertaContainer.innerHTML = `<div class="alert-mini-recusa"><i class="fas fa-exclamation-circle"></i> Checklist Devolvido pelo Motorista</div>`;
                break;
            }
        }
    }

    try {
        const { data: respostas, error } = await clienteSupabase
            .from('respostas_inspecao')
            .select(`*, itens_checklist (pergunta, opcao_nok)`)
            .eq('inspecao_id', id);

        if(error) throw error;

        const podeEditar = (modo === 'edit' && inspecaoAtual.status === 'em_analise');
        
        renderizarItensTratativa(respostas, podeEditar, textoRecusa);

        if (footerBtns) {
            if (modo === 'view') footerBtns.innerHTML = ''; 
            else configurarBotoesAcao(inspecaoAtual, modo);
        }

        // [CORREÇÃO] Aplica o filtro preservado
        if (typeof filtrarItensTratativa === 'function') {
            filtrarItensTratativa(filtroInicial);
        }

    } catch (e) {
        console.error("Erro tratativa:", e);
        if(typeof mostrarToast === 'function') mostrarToast("Erro ao carregar itens.", "error");
    }
}

function renderizarItensTratativa(respostas, podeEditar, textoRecusa = null) {
    const container = document.getElementById('lista-respostas-container');
    container.innerHTML = '';
    
    respostas.forEach(r => {
        const valResposta = (r.resposta_valor || '').trim();
        const valorNokConfigurado = r.itens_checklist?.opcao_nok;
        const isNokPadrao = ['NOK', 'Não Conforme', 'Ruim', 'Defeito'].includes(valResposta);
        const isNok = (r.is_conforme === false || isNokPadrao || (valorNokConfigurado && valResposta === valorNokConfigurado));

        const temSolucao = (r.obs_resolucao && r.obs_resolucao.length > 0);
        let itemRecusado = false, itemResolvido = temSolucao;

        if (textoRecusa && temSolucao) { itemResolvido = false; itemRecusado = true; }

        let classesFiltro = !isNok ? 'tipo-ok' : (itemResolvido ? 'tipo-resolvido' : 'tipo-pendente');
        let cssClass = `tratativa-box ${isNok ? (itemResolvido ? 'ok' : 'nok') : 'ok'}`;
        
        const card = document.createElement('div');
        card.className = `${cssClass} ${classesFiltro}`; 
        card.style.marginBottom = "15px";

        if (itemResolvido) {
            card.style.borderLeft = '5px solid #198754'; 
            card.style.backgroundColor = '#f8fff9'; 
        }
        
        // --- CABEÇALHO DO ITEM ---
        let html = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div>
                    <div style="font-weight:700; color:#2c3e50; font-size:1.05rem;">${r.itens_checklist?.pergunta || 'Item'}</div>
                    <div style="margin-top:6px; display:flex; gap:5px;">
                        <span class="badge" style="background:${isNok ? '#dc3545' : '#28a745'}; padding: 5px 10px;">${r.resposta_valor}</span>
                        ${itemResolvido ? '<span class="badge" style="background:#198754;">CORRIGIDO</span>' : ''}
                        ${itemRecusado ? '<span class="badge" style="background:#dc3545;">RECUSADO</span>' : ''}
                    </div>
                </div>
            </div>`;
        
        // --- 1. HISTÓRICO ---
        if (r.observacao_motorista || r.foto_url) {
            let textoCompleto = r.observacao_motorista || '';
            let partes = textoCompleto.split('_______________________');
            let defeitoOriginal = partes[0].trim();
            let historico = partes.slice(1);

            html += `<div class="history-container">`;
            html += `
                <div class="history-bubble bubble-driver">
                    <div class="bubble-title-driver"><i class="fas fa-user-tag"></i> Motorista (Relato Original):</div>
                    <div style="color:#444; font-weight:500;">${defeitoOriginal || 'Sem relato.'}</div>
                    ${r.foto_url ? `
                        <div class="action-row-right">
                            <button onclick="verImagemGrande('${r.foto_url}')" class="btn-photo-pill defeito">
                                <i class="fas fa-image"></i> Ver Foto Defeito
                            </button>
                        </div>` : ''}
                </div>
            `;

            if (historico.length > 0) {
                historico.forEach(bloco => {
                    let botaoFotoAntiga = '';
                    bloco = bloco.replace(/\[FOTO_RES::(.*?)\]/g, function(match, url) {
                        botaoFotoAntiga = `
                            <div class="action-row-right" style="margin-top:-5px; margin-bottom:10px;">
                                <button onclick="verImagemGrande('${url}')" class="btn-photo-pill correcao">
                                    <i class="fas fa-history"></i> Ver Foto Anterior
                                </button>
                            </div>`;
                        return ''; 
                    });

                    let htmlBloco = bloco
                        .replace(/\n/g, '<br>')
                        .replace(/\[🔧 MANUTENÇÃO/g, '<div class="history-header-maint"><i class="fas fa-wrench"></i> MANUTENÇÃO')
                        .replace(/\[❌ RECUSA/g, '</div>' + botaoFotoAntiga + '<div class="history-header-recusa"><i class="fas fa-times-circle"></i> MOTIVO DA RECUSA')
                        .replace(/\]:/g, ']:</div><div style="padding-left:10px; color:#555;">');

                    html += `<div class="history-entry">${htmlBloco}</div></div>`;
                });
            }
            html += `</div>`; 
        }
        
        // --- 2. ÁREA DE AÇÃO (ESTILIZADA) ---
        if (isNok) {
            html += `<div style="border-top:1px solid #eee; padding-top:15px; margin-top:15px;">`;
            
            if (podeEditar) {
                const val = itemRecusado ? '' : (r.obs_resolucao || '');
                const temFotoResolucao = r.foto_resolucao && r.foto_resolucao.length > 10;
                
                html += `
                    <label style="font-size:0.85rem; font-weight:700; color:#004085; display:block; margin-bottom:8px;">
                        <i class="fas fa-pen"></i> ${itemRecusado ? 'Nova Ação Técnica:' : 'Descrever Solução:'}
                    </label>
                    <textarea class="form-control" id="obs-res-${r.id}" rows="2" style="width:100%; border-radius:8px; border:1px solid #ced4da; box-shadow:inset 0 1px 2px rgba(0,0,0,0.05);" placeholder="Descreva o que foi feito...">${val}</textarea>
                    
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-top:15px;">
                        <div style="display:flex; gap:10px;">
                            <button onclick="document.getElementById('file-res-${r.id}').click()" id="btn-up-${r.id}" 
                                style="border: 1px solid #ced4da; background: #fff; color: #555; padding: 6px 15px; border-radius: 50px; font-weight: 500; font-size: 0.85rem; transition: all 0.2s; display: flex; align-items: center; gap: 6px; cursor: pointer;"
                                onmouseover="this.style.background='#f8f9fa'; this.style.borderColor='#adb5bd';"
                                onmouseout="this.style.background='#fff'; this.style.borderColor='#ced4da';">
                                <i class="fas fa-camera" style="color: #666;"></i> ${temFotoResolucao ? 'Trocar Foto' : 'Adicionar Foto'}
                            </button>
                            <input type="file" id="file-res-${r.id}" class="d-none" onchange="marcarUpload('${r.id}')" style="display:none;">

                            ${temFotoResolucao ? `
                                <button onclick="verImagemGrande('${r.foto_resolucao}')" class="btn-photo-pill correcao">
                                    <i class="fas fa-eye"></i> Ver Atual
                                </button>
                            ` : ''}
                        </div>
                        
                        <button onclick="salvarItemIndividual('${r.id}')" class="btn-save-item" 
                            style="background: #198754; color: #fff; border: none; padding: 6px 25px; border-radius: 50px; font-weight: 600; font-size: 0.85rem; box-shadow: 0 2px 5px rgba(25,135,84,0.2); transition: all 0.2s; cursor: pointer; display: flex; align-items: center; gap: 6px;"
                            onmouseover="this.style.background='#157347'; this.style.transform='translateY(-1px)';"
                            onmouseout="this.style.background='#198754'; this.style.transform='translateY(0)';">
                            <i class="fas fa-save"></i> Salvar
                        </button>
                    </div>`;
            } else {
                if (r.obs_resolucao) {
                    html += `
                        <div style="background:#e3f2fd; padding:12px; border-radius:8px; border:1px solid #bbdefb;">
                            <label style="font-size:0.75rem; font-weight:700; color:#0d47a1; text-transform:uppercase;">Última Solução Aplicada:</label>
                            <div style="color:#004085; font-weight:500; margin-top:4px;">${r.obs_resolucao}</div>
                            
                            ${r.foto_resolucao ? `
                                <div class="action-row-right">
                                    <button onclick="verImagemGrande('${r.foto_resolucao}')" class="btn-photo-pill correcao">
                                        <i class="fas fa-check-circle"></i> Ver Foto Final
                                    </button>
                                </div>
                            ` : ''}
                        </div>
                    `;
                } else {
                    html += `<div style="color:#dc3545; font-style:italic; font-weight:500;"><i class="far fa-clock"></i> Aguardando manutenção...</div>`;
                }
            }
            html += `</div>`;
        }
        
        card.innerHTML = html;
        container.appendChild(card);
    });
}

window.salvarItemIndividual = async function(idResposta) {
    const obsInput = document.getElementById(`obs-res-${idResposta}`);
    const fileInput = document.getElementById(`file-res-${idResposta}`);
    const obs = obsInput.value.trim();

    if(!obs && (!fileInput.files || fileInput.files.length === 0)) {
        mostrarToast("Descreva a solução ou anexe uma foto.", "warning");
        return;
    }

    window.origemLocal = true;
    const btnSalvar = document.querySelector(`#obs-res-${idResposta}`).parentNode.querySelector('.btn-save-item');
    if(btnSalvar) {
        btnSalvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btnSalvar.disabled = true;
    }

    // Captura o filtro visual atual ANTES de recarregar
    const filtroAtual = document.querySelector('input[name="filtro-itens"]:checked')?.value || 'todos';

    try {
        const { data: { user } } = await clienteSupabase.auth.getUser();
        
        // --- LÓGICA DE ASSUNÇÃO DE RESPONSABILIDADE ---
        // Se o usuário logado for diferente do responsável atual, ele assume o chamado.
        // Isso garante que o "último a mexer" se torna o dono.
        if (inspecaoAtual.responsavel_atual_id !== user.id) {
            await clienteSupabase.from('inspecoes').update({
                status: 'em_analise',
                responsavel_atual_id: user.id,
                data_atendimento: new Date().toISOString()
            }).eq('id', inspecaoAtual.id);
            
            // Atualiza o objeto local imediatamente para refletir a mudança na tela
            inspecaoAtual.responsavel_atual_id = user.id;
            inspecaoAtual.status = 'em_analise';
            
            // Log de auditoria para registrar a troca de bastão
            await registrarLog(inspecaoAtual.id, 'MANUTENCAO', `Responsabilidade assumida automaticamente por ${user.email} ao iniciar tratativa.`);
        }
        // ----------------------------------------------

        // 2. Upload de Foto
        let urlFoto = null;
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            const fileExt = file.name.split('.').pop();
            const nomeArquivo = `${Date.now()}_${idResposta}.${fileExt}`;
            const path = `resolucoes/${inspecaoAtual.id}/${nomeArquivo}`;

            const { error: errUp } = await clienteSupabase.storage
                .from('comprovantes')
                .upload(path, file, { upsert: true });
            
            if(errUp) throw errUp;
            
            const { data } = clienteSupabase.storage
                .from('comprovantes')
                .getPublicUrl(path);
            urlFoto = data.publicUrl;
        }

        // 3. Atualiza Item (Resposta)
        const payload = { 
            obs_resolucao: obs, 
            resolvido_por: user.id, 
            data_resolucao_item: new Date().toISOString() 
        };
        if (urlFoto) payload.foto_resolucao = urlFoto;

        const { error: errItem } = await clienteSupabase
            .from('respostas_inspecao')
            .update(payload)
            .eq('id', idResposta);

        if(errItem) throw errItem;

        mostrarToast("Item salvo e responsabilidade atualizada!", "success");
        
        // Recarrega o modal passando o filtro para ele se manter
        abrirTratativa(inspecaoAtual.id, 'edit', filtroAtual); 

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao salvar: " + err.message, "error");
        if(btnSalvar) {
            btnSalvar.innerHTML = '<i class="fas fa-save"></i> Salvar';
            btnSalvar.disabled = false;
        }
    } finally {
        setTimeout(() => { window.origemLocal = false; }, 2000);
    }
}

// =============================================================================
// 5. CONFIRMAÇÃO E FINALIZAÇÃO DE TRATATIVAS 
// =============================================================================

// 1. Abertura do Modal (Chamado pelo botão "Finalizar Tratativa" do modal grande)
window.abrirModalFinalizar = async function() { // Mantive o nome da chamada original para não quebrar o botão anterior
    const btn = document.querySelector('#modal-footer-btns button');
    
    // Validação de segurança: Verifica se tem pendências antes de abrir
    try {
        if (!inspecaoAtual) return;
        
        // Verifica itens NOK sem solução
        const { data: pendentes } = await clienteSupabase
            .from('respostas_inspecao')
            .select('id')
            .eq('inspecao_id', inspecaoAtual.id)
            .in('resposta_valor', ['NOK', 'Não Conforme', 'Ruim'])
            .is('obs_resolucao', null);

        if (pendentes && pendentes.length > 0) {
            mostrarToast(`Ainda existem ${pendentes.length} pendências não resolvidas!`, "warning");
            return;
        }

        // Se passou na validação, abre o novo modal V2
        const modal = document.getElementById('modal-confirmacao-v2');
        if (modal) {
            modal.classList.add('active');
        } else {
            console.error("Erro CRÍTICO: Novo modal 'modal-confirmacao-v2' não encontrado no HTML.");
        }

    } catch (e) {
        console.error(e);
        mostrarToast("Erro ao validar checklist.", "error");
    }
}

// 2. Fechamento do Modal (Botão "Não, Voltar")
window.fecharConfirmacaoV2 = function() {
    const modal = document.getElementById('modal-confirmacao-v2');
    if (modal) modal.classList.remove('active');
}

// 3. Execução (Botão "Sim, Finalizar")
window.executarFinalizacaoV2 = async function() {
    const modal = document.getElementById('modal-confirmacao-v2');
    const btn = modal.querySelector('.btn-primary');
    const txtOriginal = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ...';
    btn.disabled = true;

    window.origemLocal = true;

    try {
        if (!inspecaoAtual) throw new Error("Checklist perdido. Feche e abra novamente.");

        // Atualiza Status
        const { error } = await clienteSupabase
            .from('inspecoes')
            .update({ 
                status: 'aguardando_motorista', 
                data_resolucao: new Date().toISOString() 
            })
            .eq('id', inspecaoAtual.id);

        if (error) throw error;

        // Log
        await registrarLog(inspecaoAtual.id, 'STATUS', 'Tratativa finalizada pela manutenção. Enviado para validação do motorista.');

        // [CORREÇÃO] Toast removido daqui. O Realtime vai avisar.
        // mostrarToast("Finalizado com Sucesso!", "success"); <--- REMOVIDO

        fecharConfirmacaoV2();
        fecharModalTratativa();
        listarInspecoes();

    } catch (err) {
        console.error(err);
        alert("Erro ao finalizar: " + err.message);
    } finally {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
    }
}


// Função para fechar o Modal Grande (Tratativa)
window.fecharModalTratativa = function() {
    const modal = document.getElementById('modal-tratativa');
    if (modal) {
        modal.classList.remove('active');
    }
    // Opcional: Recarregar a lista para garantir que o status atualizou na tela de fundo
    if (typeof listarInspecoes === 'function') {
        listarInspecoes();
    }
    inspecaoAtual = null; // Limpa a memória
}




// =============================================================================
// 6. UTILS
// =============================================================================

function configurarBotoesAcao(inspecao, modo) {
    const area = document.getElementById('modal-footer-btns');
    if(!area || modo !== 'edit') return;
    area.innerHTML = ''; 

    const st = (inspecao.status || '').toLowerCase();
    if (['pendente','bloqueado','nok','divergente'].includes(st)) {
        const btn = document.createElement('button');
        btn.className = 'btn-primary'; 
        btn.style.backgroundColor = '#0d6efd'; 
        btn.innerHTML = 'ASSUMIR CHAMADO';
        btn.onclick = () => alterarStatusInspecao('em_analise');
        area.appendChild(btn);
    } 
    else if (st === 'em_analise') {
        const btn = document.createElement('button');
        btn.className = 'btn-primary';
        btn.style.backgroundColor = '#198754';
        btn.innerHTML = 'FINALIZAR TRATATIVA';
        btn.onclick = abrirModalFinalizar; 
        area.appendChild(btn);
    }
}

async function alterarStatusInspecao(novoStatus) {
    if(!inspecaoAtual) return;
    
    const { data: { user } } = await clienteSupabase.auth.getUser();
    
    const payload = { status: novoStatus, responsavel_atual_id: user.id };
    
    if (novoStatus === 'em_analise') {
        payload.data_atendimento = new Date().toISOString();
    }

    const { error } = await clienteSupabase.from('inspecoes').update(payload).eq('id', inspecaoAtual.id);
    
    if (!error) {
        let msgLog = `Status alterado para ${novoStatus.toUpperCase()}.`;
        if (novoStatus === 'em_analise') {
            msgLog = "Responsável técnico assumiu o chamado para análise.";
        }
        
        await registrarLog(inspecaoAtual.id, 'STATUS', msgLog);

        fecharModalTratativa();
        listarInspecoes();
        
        // [CORREÇÃO] Toast removido daqui. O Realtime vai avisar.
        // mostrarToast("Status atualizado!", "success"); <--- REMOVIDO
        
    } else {
        mostrarToast("Erro ao atualizar status.", "error");
        console.error(error);
    }
}

window.configurarInputFiltro = function(selectTipo, id, valorPre = null) {
    const wrapper = document.getElementById(`wrapper-val-${id}`);
    wrapper.innerHTML = ''; 
    const tipo = selectTipo.value;
    
    const getUnique = (fn) => [...new Set(listaInspecoesCache.map(fn))].filter(Boolean).sort();

    let el = document.createElement('select');
    el.className = 'form-control';
    el.style.width = '100%';
    el.onchange = aplicarFiltrosChecklist;

    if (tipo === 'placa') {
        el.innerHTML = '<option value="">Todas as Placas</option>';
        getUnique(i => i.veiculos?.placa).forEach(p => el.innerHTML += `<option value="${p}">${p}</option>`);
    }
    else if (tipo === 'motorista') {
        el.innerHTML = '<option value="">Todos os Motoristas</option>';
        getUnique(i => i.perfis?.nome_completo).forEach(m => el.innerHTML += `<option value="${m}">${m}</option>`);
    }
    else if (tipo === 'responsavel') {
        el.innerHTML = '<option value="">Todos os Responsáveis</option>';
        getUnique(i => i.responsavel?.nome_completo).forEach(r => el.innerHTML += `<option value="${r}">${r}</option>`);
    }
    else if (tipo === 'status') {
        el.innerHTML = `
            <option value="">Todos os Status</option>
            <option value="pendente_grupo">Pendente (Geral)</option>
            <option value="em_analise">Em Análise</option>
            <option value="aguardando_motorista">Aguardando Validação</option>
            <option value="corrigido">Corrigido</option>
            <option value="concluido">Concluído (Ok)</option>
        `;
    }
    else if (tipo === 'data') {
        el = document.createElement('input');
        el.type = 'date';
        el.className = 'form-control';
        el.style.width = '100%';
        el.onchange = aplicarFiltrosChecklist;
    }
    else if (tipo === 'atrasado') {
        el = document.createElement('input');
        el.type = 'text';
        el.value = 'Itens fora do SLA';
        el.disabled = true;
        el.style.backgroundColor = '#fff3cd';
        setTimeout(aplicarFiltrosChecklist, 50);
    }

    wrapper.appendChild(el);
    
    // [CORREÇÃO] Se houver valor pré-definido (ex: Hoje), aplica e filtra
    if (valorPre) {
        el.value = valorPre;
        setTimeout(aplicarFiltrosChecklist, 50);
    } else if(!el.disabled) {
        el.focus();
    }
}

window.marcarUpload = function(id) {
    const btn = document.getElementById(`btn-up-${id}`);
    btn.className = 'btn-secondary btn-sm text-warning';
    btn.innerText = 'Foto Selecionada';
}

window.filtrarItensTratativa = function(filtro) {
    const cards = document.querySelectorAll('.tratativa-box');
    let contadorVisiveis = 0; // [NOVO] Contador
    
    cards.forEach(card => {
        let mostrar = false;

        if (filtro === 'todos') {
            mostrar = true;
        } 
        else if (filtro === 'nok') {
            if (card.classList.contains('tipo-pendente')) mostrar = true;
        } 
        else if (filtro === 'corrigido') {
            if (card.classList.contains('tipo-resolvido')) mostrar = true;
        }
        else if (filtro === 'ok') {
            if (card.classList.contains('tipo-ok')) mostrar = true;
        }

        card.style.display = mostrar ? 'block' : 'none';
        
        if (mostrar) contadorVisiveis++; // [NOVO] Incrementa se visível
    });

    // [NOVO] Atualiza o texto do contador no HTML
    const elContador = document.getElementById('contador-itens-filtro');
    if (elContador) {
        elContador.innerText = `${contadorVisiveis} item(ns)`;
    }
}

function mostrarToast(msg, tipo = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) { container = document.createElement('div'); container.id = 'toast-container'; document.body.appendChild(container); }
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `<i class="fas fa-info-circle"></i> <span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 500); }, 4000);
}

window.verImagemGrande = function(url) {
    if(!url) return;
    const modal = document.getElementById('modal-imagem-overlay');
    const img = document.getElementById('img-preview-full');
    const btnDown = document.getElementById('btn-download-img');

    // Configura a imagem
    img.src = url;
    if(btnDown) btnDown.href = url;

    // 1. Torna visível no layout (mas ainda transparente)
    modal.style.display = 'flex'; 

    // 2. Pequeno delay para permitir que o navegador renderize o 'display:flex'
    // antes de aplicar a classe que muda a opacidade (trigger da animação)
    setTimeout(() => {
        modal.classList.add('active');
    }, 10);
}

// Adicione também a função de fechar com animação reversa (opcional, mas recomendado)
// Você pode adicionar onclick="fecharImagemGrande()" no botão de fechar do modal HTML
window.fecharImagemGrande = function() {
    const modal = document.getElementById('modal-imagem-overlay');
    
    // 1. Remove a classe ativa (inicia o fade out)
    modal.classList.remove('active');

    // 2. Espera a animação do CSS (0.3s) terminar antes de dar display:none
    setTimeout(() => {
        modal.style.display = 'none';
        document.getElementById('img-preview-full').src = ""; // Limpa memória
    }, 300);
}

window.verLinhaTempo = async function(id) {
    const modal = document.getElementById('modal-timeline');
    const content = document.getElementById('timeline-content');
    modal.classList.add('active');
    
    content.innerHTML = `<div style="padding:20px; text-align:center; color:#666;"><i class="fas fa-circle-notch fa-spin fa-2x"></i><br>Buscando histórico...</div>`;

    try {
        const { data: logs, error } = await clienteSupabase
            .from('logs_auditoria')
            .select(`data_hora, acao, dados_novos, perfis (nome_completo, funcao)`)
            .eq('tabela_afetada', 'inspecoes')
            .eq('id_registro_afetado', String(id))
            .order('data_hora', { ascending: true });

        if (error) throw error;

        if (!logs || logs.length === 0) {
            content.innerHTML = `<div class="text-center text-muted p-3">Nenhum histórico.</div>`;
            return;
        }

        let html = `<div class="timeline-container" style="position:relative; padding-left:20px; border-left:2px solid #e9ecef;">`;

        const estilos = {
            'CRIADO': { cor: '#007bff', icone: 'fa-plus', titulo: 'Abertura' },
            'STATUS': { cor: '#fd7e14', icone: 'fa-exchange-alt', titulo: 'Status' },
            'MANUTENCAO': { cor: '#198754', icone: 'fa-wrench', titulo: 'Ação Técnica' },
            'RECUSA_PARCIAL': { cor: '#dc3545', icone: 'fa-exclamation-triangle', titulo: 'Devolução' },
            'APROVADO': { cor: '#6c757d', icone: 'fa-flag-checkered', titulo: 'Encerrado' }
        };

        logs.forEach(log => {
            const estilo = estilos[log.acao] || { cor: '#999', icone: 'fa-info', titulo: 'Evento' };
            const dataF = new Date(log.data_hora).toLocaleString('pt-BR');
            const resp = log.perfis ? log.perfis.nome_completo.split(' ')[0] : 'Sistema';
            
            let msg = log.dados_novos?.descricao || '';

            // [FORMATAÇÃO VISUAL RIGOROSA]
            
            // 1. Converte quebras de linha do banco para HTML
            msg = msg.replace(/\n/g, '<br>');

            // 2. Formata Títulos de Seção (Maiúsculas)
            msg = msg.replace(/ITENS COM APONTAMENTO:/g, '<br><strong style="color:#dc3545; display:block; margin-top:8px; border-bottom:1px solid #eee; padding-bottom:2px;">ITENS COM APONTAMENTO:</strong>');
            msg = msg.replace(/DETALHES DA RECUSA:/g, '<br><strong style="color:#dc3545; display:block; margin-top:8px; border-bottom:1px solid #eee; padding-bottom:2px;">DETALHES DA RECUSA:</strong>');

            // 3. Formata Linhas de Item (Padrão "Item: ... | ...")
            // Cria um bullet point e negrita os labels
            msg = msg.replace(/Item:/g, '<div style="margin-left:10px; margin-top:4px;">• <strong>Item:</strong>');
            msg = msg.replace(/Status:/g, '<strong style="color:#dc3545;">Status:</strong>');
            msg = msg.replace(/Motivo:/g, '<strong style="color:#dc3545;">Motivo:</strong>');
            
            // Fecha a div do item (ajuste simples para fechar na quebra visual)
            msg = msg.replace(/\|/g, '<span style="color:#ccc; margin:0 5px;">|</span>');

            // 4. Formata Ação Técnica (Manutenção)
            msg = msg.replace(/Correção aplicada em item./g, '<strong>Item Corrigido.</strong>');
            msg = msg.replace(/Nota:/g, '<br><strong style="color:#198754;">Nota Técnica:</strong>');

            html += `
                <div class="timeline-item" style="margin-bottom:25px; position:relative;">
                    <div style="position:absolute; left:-29px; top:0; width:16px; height:16px; background:${estilo.cor}; border-radius:50%; border:3px solid white; box-shadow:0 0 0 1px #dee2e6;">
                        <i class="fas ${estilo.icone}" style="font-size:8px; color:white; position:absolute; top:1px; left:3px;"></i>
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; margin-bottom:4px;">
                        <span style="font-weight:bold; color:${estilo.cor}; text-transform:uppercase; font-size:0.75rem;">${estilo.titulo}</span>
                        <small style="color:#999; font-size:0.75rem;">${dataF}</small>
                    </div>
                    
                    <div style="background:#fff; padding:12px; border-radius:8px; border:1px solid #e0e0e0; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                        <div style="color:#333; font-size:0.9rem; line-height:1.5;">${msg}</div>
                        <div style="font-size:0.75rem; color:#888; margin-top:8px; text-align:right; border-top:1px solid #f0f0f0; padding-top:5px;">
                            <i class="fas fa-user-circle"></i> ${resp}
                        </div>
                    </div>
                </div>
            `;
        });

        html += `</div>`;
        content.innerHTML = html;

    } catch (e) {
        content.innerHTML = `<p class="text-danger text-center">Erro: ${e.message}</p>`;
    }
}

// Função auxiliar para gravar histórico na tabela logs_auditorias
async function registrarLog(inspecaoId, acao, mensagem) {
    try {
        const { data: { user } } = await clienteSupabase.auth.getUser();
        const uid = user ? user.id : (window.usuarioLogadoGlobal ? window.usuarioLogadoGlobal.id : null);

        if (!uid) {
            console.warn("Tentativa de log sem usuário identificado.");
            return;
        }

        // [CORREÇÃO] Nome da tabela ajustado para 'logs_auditoria' (singular)
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'inspecoes',
            id_registro_afetado: String(inspecaoId),
            acao: acao,
            usuario_id: uid,
            data_hora: new Date().toISOString(),
            dados_novos: { "descricao": mensagem }
        });
    } catch (err) {
        console.error("Erro interno ao gravar log:", err);
    }
}