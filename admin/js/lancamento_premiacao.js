// js/lancamento_premiacao.js - VERSÃO FINAL COM MODAL E PERMISSÕES

let motoristasCachePremiacao = [];
let politicaAtualModal = null; 
let itensConfigModal = [];     
let apuracaoEmEdicaoId = null;
let idFinalizacaoPendente = null; // Controle para o modal de finalizar

let estadoOriginalPremiacao = null; 

// =============================================================================
// 1. INICIALIZAÇÃO
// =============================================================================


window.inicializarLancamentoPremiacao = async function() {
    const titulo = document.getElementById('titulo-pagina');
    if(titulo) titulo.innerText = 'Apuração de Premiação';

    const btnNova = document.getElementById('btn-nova-apuracao');
    if (btnNova) {
        const novoBtn = btnNova.cloneNode(true);
        btnNova.parentNode.replaceChild(novoBtn, btnNova);
        novoBtn.addEventListener('click', () => abrirModalApuracao());
    }

    try {
        await carregarDadosAuxiliaresPremiacao();
        
        const selectRodape = document.getElementById('sel-unidade');
        if (selectRodape) {
            selectRodape.removeEventListener('change', listarApuracoes);
            selectRodape.addEventListener('change', listarApuracoes);
        }
        
        const selMot = document.getElementById('input-modal-motorista');
        if(selMot) selMot.addEventListener('change', carregarPoliticaMotorista);
        
        const inputComp = document.getElementById('input-modal-competencia');
        if(inputComp) inputComp.addEventListener('change', verificarExistenciaApuracao);

        // --- LÓGICA DE FILTRO PADRÃO (Igual Diárias) ---
        const container = document.getElementById('container-filtros-premiacao');
        if (container && container.children.length === 0) {
            // Cálculo da Competência Atual (Regra: Dia >= 16 vira o próximo mês)
            const hoje = new Date();
            let mes = hoje.getMonth(); // 0 a 11
            let ano = hoje.getFullYear();

            if (hoje.getDate() >= 16) {
                mes++;
                if (mes > 11) { mes = 0; ano++; }
            }

            const competenciaPadrao = `${ano}-${String(mes + 1).padStart(2, '0')}`;
            
            // Cria o filtro já preenchido
            adicionarFiltroPremiacao('competencia', competenciaPadrao);
        }

        listarApuracoes();
    } catch (e) {
        console.error("Erro init:", e);
    }
};

async function carregarDadosAuxiliaresPremiacao() {
    try {
        const { data: perfis, error } = await clienteSupabase
            .from('perfis')
            .select('id, nome_completo, unidade_id, funcao')
            .eq('ativo', true)
            .order('nome_completo');
        
        if (error) throw error;

        motoristasCachePremiacao = (perfis || []).filter(p => 
            p.funcao && String(p.funcao).toLowerCase().includes('motorista')
        );

        // CORREÇÃO: Após carregar o cache, força a atualização de qualquer select de motorista que já esteja na tela
        atualizarDropdownsFiltro();
        
    } catch (e) { 
        console.error("Erro ao carregar motoristas:", e); 
    }
}
// =============================================================================
// 2. LISTAGEM
// =============================================================================

window.listarApuracoes = async function() {
    atualizarDropdownsFiltro();

    const tbody = document.getElementById('tbody-premiacoes');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="7" class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Buscando...</td></tr>';

    try {
        const unidadeRodape = document.getElementById('sel-unidade')?.value || 'TODAS';

        // 1. Busca no Banco
        let query = clienteSupabase
            .from('premiacoes_apuracoes')
            .select(`
                id, competencia, status, valor_calculado, motorista_id, unidade_id,
                perfis:motorista_id (nome_completo),
                unidades:unidade_id (nome)
            `)
            .order('competencia', { ascending: false });

        if (unidadeRodape !== 'TODAS') {
            query = query.eq('unidade_id', unidadeRodape);
        }

        const { data, error } = await query;
        if(error) throw error;

        let listaFiltrada = data || [];
        let legendasFiltro = []; // Array para armazenar as descrições

        // 2. Aplicação dos Filtros de Tela + Geração de Legenda
        const filtros = document.getElementById('container-filtros-premiacao');
        if(filtros) {
            filtros.querySelectorAll('.filter-row').forEach(row => {
                const selTipo = row.querySelector('.filter-select');
                const valEl = row.querySelector('.form-control');
                
                if (selTipo && valEl && selTipo.value && valEl.value) {
                    const tipo = selTipo.value;
                    const val = valEl.value;

                    // --- Gera Texto Visual ---
                    let txtValor = val;
                    const labelTipo = selTipo.options[selTipo.selectedIndex].text;

                    if (valEl.tagName === 'SELECT' && valEl.selectedIndex >= 0) {
                        txtValor = valEl.options[valEl.selectedIndex].text;
                    } 
                    else if (tipo === 'competencia') {
                        const [ano, mes] = val.split('-');
                        txtValor = `${mes}/${ano}`;
                    }

                    legendasFiltro.push(`<b>${labelTipo}:</b> ${txtValor}`);
                    // -------------------------

                    listaFiltrada = listaFiltrada.filter(item => {
                        if(tipo === 'status') return item.status === val;
                        if(tipo === 'competencia') return item.competencia.startsWith(val);
                        if(tipo === 'motorista') return String(item.motorista_id) === String(val);
                        return true;
                    });
                }
            });
        }

        // --- ATUALIZA A BARRA SUPERIOR ---
        const lblFiltros = document.getElementById('lbl-filtros-ativos-premiacao');
        if (lblFiltros) {
            if (legendasFiltro.length > 0) {
                lblFiltros.innerHTML = `<i class="fas fa-filter"></i> ${legendasFiltro.join(' <span style="margin:0 5px; color:#ccc;">|</span> ')}`;
                lblFiltros.style.display = 'block';
            } else {
                lblFiltros.innerHTML = '';
                lblFiltros.style.display = 'none';
            }
        }

        // 3. ORDENAÇÃO FINAL
        listaFiltrada.sort((a, b) => {
            if (a.competencia !== b.competencia) {
                return a.competencia < b.competencia ? 1 : -1;
            }
            const nomeA = (a.perfis?.nome_completo || "").toLowerCase();
            const nomeB = (b.perfis?.nome_completo || "").toLowerCase();
            return nomeA.localeCompare(nomeB);
        });

        renderizarTabela(listaFiltrada);

    } catch (e) {
        console.error(e);
        tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro: ${e.message}</td></tr>`;
    }
};

function renderizarTabela(lista) {
    const tbody = document.getElementById('tbody-premiacoes');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    
    const lblCont = document.getElementById('lbl-contagem-premiacao');
    if (lblCont) lblCont.innerText = `Exibindo ${lista.length} registro(s)`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">Nenhuma apuração encontrada.</td></tr>';
        return;
    }

    // Identifica perfis com permissão especial de edição
    const perfisMaster = ['coordenador', 'especialista de logística', 'admin'];
    const funcaoUsuario = (typeof usuarioLogadoGlobal !== 'undefined' && usuarioLogadoGlobal.funcao) 
        ? usuarioLogadoGlobal.funcao.toLowerCase() 
        : '';
    const temAcessoMaster = perfisMaster.includes(funcaoUsuario);

    lista.forEach(item => {
        const [ano, mes, dia] = item.competencia.split('-');
        const dataReferencia = new Date(parseInt(ano), parseInt(mes) - 1, 1);
        
        const inicioCiclo = new Date(dataReferencia);
        inicioCiclo.setMonth(inicioCiclo.getMonth() - 1);
        inicioCiclo.setDate(16);
        
        const fimCiclo = new Date(dataReferencia);
        fimCiclo.setDate(15);

        const compTxt = `${mes}/${ano}`; 
        const cicloTxt = `${inicioCiclo.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})} a ${fimCiclo.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'})}`;

        // --- ALTERAÇÃO: Formatação Apenas Numérica ---
        const valorNumerico = parseFloat(item.valor_calculado || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const isFechado = item.status === 'Fechado';
        let badgeClass = isFechado ? 'badge-sucesso' : 'badge-pendente';

        const btnVis = `<button class="action-btn" onclick="visualizarApuracao(${item.id})" title="Visualizar"><i class="fas fa-eye" style="color: var(--cor-primaria);"></i></button>`;
        const btnHist = `<button class="action-btn" onclick="verHistoricoPremiacao(${item.id})" title="Histórico"><i class="fas fa-history"></i></button>`;
        
        // REGRAS DE PERMISSÃO:
        const podeEditar = !isFechado || temAcessoMaster;
        const btnEdit = podeEditar
            ? `<button class="action-btn" onclick="editarApuracao(${item.id})" title="Editar / Corrigir"><i class="fas fa-edit"></i></button>`
            : '';

        const podeExcluir = !isFechado; 
        const btnDel = podeExcluir
            ? `<button class="action-btn" onclick="excluirApuracao(${item.id})" title="Excluir Registro"><i class="fas fa-trash-alt" style="color: #dc3545;"></i></button>`
            : ''; 

        let btnFinalizar = !isFechado 
            ? `<button class="action-btn" onclick="abrirModalFinalizarPremiacao(${item.id})" title="Finalizar Competência"><i class="fas fa-check-circle" style="color:var(--cor-sucesso)"></i></button>`
            : `<button class="action-btn" disabled title="Já finalizado"><i class="fas fa-lock" style="color:#ccc"></i></button>`;

        tbody.innerHTML += `
            <tr>
                <td><b>${compTxt}</b></td>
                <td><small class="text-muted">${cicloTxt}</small></td>
                <td>${item.perfis?.nome_completo || 'Desconhecido'}</td>
                <td>${item.unidades?.nome || '-'}</td>
                
                <td>
                    <div style="display: flex; justify-content: space-between; align-items: center; min-width: 100px; font-weight: 700; color: var(--cor-primaria);">
                        <span style="margin-right: 5px;">R$</span>
                        <span>${valorNumerico}</span>
                    </div>
                </td>

                <td><span class="badge ${badgeClass}">${item.status || 'Pendente'}</span></td>
                <td class="text-end" style="white-space:nowrap;">
                    ${btnVis} ${btnHist} ${btnEdit} ${btnDel} ${btnFinalizar}
                </td>
            </tr>`;
    });
}

function atualizarDropdownsFiltro() {
    const container = document.getElementById('container-filtros-premiacao');
    if (!container) return;
    const rows = container.querySelectorAll('.filter-row');
    rows.forEach(row => {
        const sel = row.querySelector('.filter-select');
        if (sel && sel.value === 'motorista') {
            const idTimestamp = row.id.replace('row-prem-', '');
            configurarInputFiltroPremiacao(sel, idTimestamp);
        }
    });
}

// =============================================================================
// 3. HISTÓRICO
// =============================================================================

window.verHistoricoPremiacao = async function(id) {
    const modal = document.getElementById('modal-logs');
    const container = document.getElementById('timeline-logs');
    const titulo = document.getElementById('titulo-modal-logs');
    
    if(titulo) titulo.innerText = "Histórico da Apuração";
    container.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';
    
    modal.classList.add('active');

    try {
        const { data: logs, error } = await clienteSupabase
            .from('logs_auditoria')
            .select('*, perfis(nome_completo)')
            .eq('tabela_afetada', 'premiacoes_apuracoes')
            .eq('id_registro_afetado', id)
            .order('data_hora', { ascending: false });

        if(error) throw error;

        container.innerHTML = '';
        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="text-center p-4 text-muted">Sem histórico disponível.</div>';
            return;
        }

        logs.forEach(log => {
            const dataF = new Date(log.data_hora).toLocaleString('pt-BR');
            const resp = log.perfis ? log.perfis.nome_completo : 'Sistema';
            
            // Reutiliza a função gerarDiffPremiacao que já lida com os detalhes
            const diffHtml = gerarDiffPremiacao(log.dados_antigos, log.dados_novos, log.acao);

            const div = document.createElement('div');
            div.className = 'log-item';
            div.innerHTML = `
                <div class="log-header"><strong>${dataF}</strong> por <span style="color:#003399">${resp}</span></div>
                <div class="log-action"><b>Ação:</b> ${log.acao}</div>
                ${diffHtml}
            `;
            container.appendChild(div);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="text-danger p-3">Erro ao carregar histórico.</div>';
    }
};

function gerarDiffPremiacao(antigo, novo, acao) {
    const dadosNovos = typeof novo === 'string' ? JSON.parse(novo) : (novo || {});

    if (acao === 'INSERT') {
        let html = `<div class="log-desc text-success"><i class="fas fa-plus-circle"></i> Apuração iniciada.</div>`;
        
        if (dadosNovos.mudancas && dadosNovos.mudancas.length > 0) {
            html += `<div style="margin-top: 8px; padding-left: 10px; border-left: 2px solid #28a745; background: #f9fff9; padding: 8px; border-radius: 4px;">`;
            dadosNovos.mudancas.forEach(m => {
                html += `<div style="font-size: 0.85rem; margin-bottom: 5px; color: #2e7d32;">
                            <strong>${m.item}</strong>: Qtd ${m.qtd} 
                            ${m.obs && m.obs !== '(sem observação)' ? `<br><i style="color:#666;">Obs: "${m.obs}"</i>` : ''}
                         </div>`;
            });
            html += `</div>`;
        } else {
            html += `<div class="text-muted" style="font-size:0.8rem; margin-top:5px;">Nenhuma ocorrência registrada no lançamento inicial.</div>`;
        }
        return html;
    }

    if (acao === 'UPDATE' && dadosNovos.mudancas && dadosNovos.mudancas.length > 0) {
        let htmlUpdate = '<div style="margin-top: 8px; padding-left: 10px; border-left: 2px solid #003399;">';
        
        dadosNovos.mudancas.forEach(m => {
            htmlUpdate += `
                <div style="font-size: 0.85rem; color: #444; margin-bottom: 8px; background: #f4f6f9; padding: 6px; border-radius: 4px; border: 1px solid #e0e0e0;">
                    <div style="font-weight: bold; color: #003399; border-bottom: 1px solid #ddd; margin-bottom: 4px; padding-bottom: 2px;">${m.item}</div>
                    ${m.mudou_qtd ? `
                        <div>Qtd: <span style="text-decoration: line-through; color: #888;">${m.qtd_antiga}</span> <i class="fas fa-arrow-right"></i> <b>${m.qtd_nova}</b></div>
                    ` : ''}
                    ${m.mudou_obs ? `
                        <div style="margin-top:2px;">Obs: <i style="color: #888;">"${m.obs_antiga}"</i> <i class="fas fa-arrow-right"></i> <b style="color: #198754;">"${m.obs_nova}"</b></div>
                    ` : ''}
                </div>`;
        });

        if (dadosNovos.valor_final) {
            htmlUpdate += `<div style="font-size: 0.85rem; font-weight: bold; color: #198754; margin-top: 5px;">Novo Resultado: ${dadosNovos.valor_final}</div>`;
        }

        htmlUpdate += '</div>';
        return htmlUpdate;
    }

    return `<div class="log-desc text-muted"><i>Alteração de status ou técnica sem mudanças nos itens.</i></div>`;
}

// =============================================================================
// 4. MODAL E LÓGICA DE APURAÇÃO
// =============================================================================

window.abrirModalApuracao = function() {
    const modal = document.getElementById('modal-apuracao');
    const form = document.getElementById('form-apuracao-premiacao'); 
    if(form) form.reset();

    // Reset de variáveis de controle
    politicaAtualModal = null;
    apuracaoEmEdicaoId = null;
    estadoOriginalPremiacao = null; 

    // Limpeza visual imediata
    document.getElementById('container-topicos').innerHTML = '';
    document.getElementById('container-topicos').style.display = 'none';
    document.getElementById('msg-inicial-modal').style.display = 'block';
    document.getElementById('msg-erro-politica').style.display = 'none';
    document.getElementById('lbl-total-possivel').innerText = 'R$ 0,00';
    document.getElementById('lbl-total-conquistado').innerText = 'R$ 0,00';
    
    // Habilitar campos que podem ter sido travados na visualização
    document.getElementById('input-modal-motorista').disabled = false;
    document.getElementById('input-modal-competencia').disabled = false;
    
    const btnSalvar = document.getElementById('btn-salvar-apuracao');
    if(btnSalvar) {
        btnSalvar.style.display = 'block';
        btnSalvar.disabled = true;
    }

    // Configuração de data padrão
    const hoje = new Date();
    const inputComp = document.getElementById('input-modal-competencia');
    if(inputComp) {
        inputComp.value = `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}`;
    }

    // --- CORREÇÃO DO ERRO ---
    // Busca a unidade selecionada no rodapé para filtrar a lista inicial
    const unidadeAtual = document.getElementById('sel-unidade')?.value || 'TODAS';
    
    // Chama a função CORRETA deste módulo (Premiacao) e não a de Diárias
    popularSelectMotoristasModalPremiacao(unidadeAtual);

    // Fluidez na abertura
    modal.style.display = 'flex';
    setTimeout(() => modal.classList.add('active'), 10);
};

function popularSelectMotoristasModalPremiacao(unidadeId = 'TODAS', motoristaIdPreSelecionado = null) {
    const sel = document.getElementById('input-modal-motorista');
    if (!sel) return;

    // Limpa e adiciona a opção padrão
    sel.innerHTML = '<option value="">Selecione...</option>';
    
    // Filtra os motoristas do cache específico de premiação
    let lista = motoristasCachePremiacao || [];
    
    if (unidadeId && unidadeId !== 'TODAS' && unidadeId !== 'ALL') {
        lista = lista.filter(m => String(m.unidade_id) === String(unidadeId));
    }

    // Ordenação alfabética
    lista.sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));

    // Se o motorista estiver selecionado mas não estiver na lista (por causa do filtro de unidade), 
    // nós o adicionamos manualmente para evitar o erro de campo vazio.
    if (motoristaIdPreSelecionado) {
        const existe = lista.find(m => String(m.id) === String(motoristaIdPreSelecionado));
        if (!existe) {
            // Busca o motorista no cache global (sem filtro de unidade) para garantir a exibição
            const motOriginal = motoristasCachePremiacao.find(m => String(m.id) === String(motoristaIdPreSelecionado));
            if (motOriginal) lista.push(motOriginal);
        }
    }

    lista.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.innerText = m.nome_completo;
        sel.appendChild(opt);
    });
}

window.fecharModalApuracao = function() {
    const estadoAtual = JSON.stringify(capturarEstadoAtualInputs());
    const houveAlteracao = (estadoOriginalPremiacao && estadoOriginalPremiacao !== "{}" && estadoOriginalPremiacao !== estadoAtual);
    
    if (houveAlteracao) {
        window.solicitarConfirmacao(() => {
            realizarFechamentoModal();
        });
    } else {
        realizarFechamentoModal();
    }
};

function realizarFechamentoModal() {
    const modal = document.getElementById('modal-apuracao');
    modal.classList.remove('active');
    modal.style.display = 'none';
    estadoOriginalPremiacao = null;
    politicaAtualModal = null;
    apuracaoEmEdicaoId = null;
}

window.carregarPoliticaMotorista = async function() {
    const motoristaId = document.getElementById('input-modal-motorista').value;
    const container = document.getElementById('container-topicos');
    const msg = document.getElementById('msg-inicial-modal');
    const msgErro = document.getElementById('msg-erro-politica');
    
    if (!motoristaId) {
        container.style.display = 'none';
        msg.style.display = 'block';
        return;
    }

    try {
        // Busca unidade do motorista
        const { data: perfil, error: errP } = await clienteSupabase
            .from('perfis')
            .select('unidade_id')
            .eq('id', motoristaId)
            .single();

        if (errP || !perfil?.unidade_id) throw new Error("Motorista sem unidade vinculada.");

        // Busca política ativa
        const { data: politica, error: errPol } = await clienteSupabase
            .from('premiacoes')
            .select('*')
            .eq('unidade_id', perfil.unidade_id)
            .eq('ativo', true)
            .maybeSingle();

        if (errPol) throw errPol;
        if (!politica) {
            msg.style.display = 'none';
            msgErro.style.display = 'block';
            container.style.display = 'none';
            return;
        }

        politicaAtualModal = politica;
        politicaAtualModal.unidade_id = perfil.unidade_id; 

        document.getElementById('lbl-total-possivel').innerText = parseFloat(politica.valor_maximo).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

        // Busca itens da política
        const { data: itens, error: errItens } = await clienteSupabase
            .from('premiacoes_itens')
            .select('*')
            .eq('premiacao_id', politica.id)
            .order('ordem');

        if (errItens) throw errItens;
        itensConfigModal = itens || [];
        
        // Renderiza o Grid (Garante a criação dos elementos com os IDs 'qtd-item-X')
        renderizarGridAvaliacao();
        
        // Mostra o container
        msg.style.display = 'none';
        msgErro.style.display = 'none';
        container.style.display = 'flex';

    } catch (e) {
        console.error(e);
        msgErro.innerText = "Erro: " + e.message;
        msgErro.style.display = 'block';
    }

    
};

function resetarInputsZero() {
    document.querySelectorAll('.input-ocorrencia').forEach(i => i.value = 0);
    document.querySelectorAll('.input-obs').forEach(i => i.value = '');
}

window.verificarExistenciaApuracao = async function() {
    // Se já está editando, não valida duplicidade
    if (apuracaoEmEdicaoId) return;

    const motoristaId = document.getElementById('input-modal-motorista').value;
    const competenciaInput = document.getElementById('input-modal-competencia').value;

    if (!motoristaId || !competenciaInput) return;

    const competencia = competenciaInput + '-01';

    const { data, error } = await clienteSupabase
        .from('premiacoes_apuracoes')
        .select('id')
        .eq('motorista_id', motoristaId)
        .eq('competencia', competencia)
        .maybeSingle();

    if (error) {
        console.error(error);
        return;
    }

    if (data?.id) {
        mostrarToast(
            'Já existe uma apuração para este motorista nesta competência. Abrindo para edição.',
            'warning'
        );

        editarApuracao(data.id);
    }
};


window.editarApuracao = async function(id, forceReadOnly = false) {
    apuracaoEmEdicaoId = id;
    
    const modal = document.getElementById('modal-apuracao');
    if (!modal) return;

    // 1. Identificação de Permissões master
    const perfisMaster = ['coordenador', 'especialista de logística', 'admin'];
    const funcaoUsuario = (window.usuarioLogadoGlobal?.funcao || '').toLowerCase();
    const temAcessoMaster = perfisMaster.includes(funcaoUsuario);

    modal.classList.add('active');
    modal.style.display = 'flex';

    try {
        // 2. Busca os dados da apuração no Supabase
        const { data: apuracao, error } = await clienteSupabase
            .from('premiacoes_apuracoes')
            .select('*, premiacoes_apuracoes_itens(*)')
            .eq('id', id)
            .single();

        if (error || !apuracao) throw new Error("Apuração não encontrada.");

        // 3. Define o Modo de Operação (Leitura ou Escrita)
        const isFechado = apuracao.status === 'Fechado';
        const modoLeitura = forceReadOnly || (isFechado && !temAcessoMaster);

        // Ajuste visual do cabeçalho do modal
        document.getElementById('titulo-modal-apuracao').innerText = modoLeitura ? "Visualizar Apuração" : "Editar Apuração";
        document.getElementById('btn-salvar-apuracao').style.display = modoLeitura ? 'none' : 'block';

        // 4. Preenchimento do Cabeçalho (Competência e Motorista)
        const inputComp = document.getElementById('input-modal-competencia');
        const selMot = document.getElementById('input-modal-motorista');
        
        inputComp.value = apuracao.competencia.substring(0, 7);
        inputComp.disabled = true; // Sempre desabilitado em edição para evitar troca de competência

        // Garante que o motorista esteja carregado no select
        if (selMot.options.length <= 1) {
            selMot.innerHTML = `<option value="${apuracao.motorista_id}" selected>Carregando...</option>`;
        }
        selMot.value = apuracao.motorista_id;
        selMot.disabled = true; // Sempre desabilitado em edição para manter a integridade

        // 5. Renderização dos Critérios da Política
        // Chamamos carregarPoliticaMotorista para desenhar o grid baseado na unidade do motorista
        await carregarPoliticaMotorista(); 
        
        // 6. Injeção de Valores nos Critérios (Só após o grid ser renderizado)
        if (apuracao.premiacoes_apuracoes_itens) {
            apuracao.premiacoes_apuracoes_itens.forEach(item => {
                const inputQtd = document.getElementById(`qtd-item-${item.item_config_id}`);
                const inputObs = document.getElementById(`obs-item-${item.item_config_id}`);
                
                if (inputQtd) {
                    inputQtd.value = item.qtd_realizada;
                    if (modoLeitura) inputQtd.disabled = true;
                }
                if (inputObs) {
                    inputObs.value = item.observacao || '';
                    if (modoLeitura) inputObs.disabled = true;
                }
            });
            
            // Recalcula os totais conquistados e os ícones (Verde/Vermelho)
            calcularValores();
            
            // Registra o estado original para detecção de alterações ao fechar
            estadoOriginalPremiacao = JSON.stringify(capturarEstadoAtualInputs());
        }

    } catch(e) {
        console.error("Erro técnico na edição:", e);
        if (typeof mostrarToast === 'function') mostrarToast("Erro ao carregar dados da apuração", "error");
        realizarFechamentoModal();
    }
};

window.editarApuracao = async function(id, forceReadOnly = false) {
    apuracaoEmEdicaoId = id;
    
    const modal = document.getElementById('modal-apuracao');
    if (!modal) return;

    // 1. Identificação de Permissões master
    const perfisMaster = ['coordenador', 'especialista de logística', 'admin'];
    const funcaoUsuario = (window.usuarioLogadoGlobal?.funcao || '').toLowerCase();
    const temAcessoMaster = perfisMaster.includes(funcaoUsuario);

    // Exibe o modal visualmente
    modal.classList.add('active');
    modal.style.display = 'flex';

    try {
        // 2. Busca os dados da apuração no Supabase
        const { data: apuracao, error } = await clienteSupabase
            .from('premiacoes_apuracoes')
            .select('*, premiacoes_apuracoes_itens(*)')
            .eq('id', id)
            .single();

        if (error || !apuracao) throw new Error("Apuração não encontrada.");

        // 3. Define o Modo de Operação (Leitura ou Escrita)
        const isFechado = apuracao.status === 'Fechado';
        const modoLeitura = forceReadOnly || (isFechado && !temAcessoMaster);

        // Ajuste visual do cabeçalho
        document.getElementById('titulo-modal-apuracao').innerText = modoLeitura ? "Visualizar Apuração" : "Editar Apuração";
        document.getElementById('btn-salvar-apuracao').style.display = modoLeitura ? 'none' : 'block';

        // 4. Preenchimento do Cabeçalho (Competência e Motorista)
        const inputComp = document.getElementById('input-modal-competencia');
        const selMot = document.getElementById('input-modal-motorista');
        
        inputComp.value = apuracao.competencia.substring(0, 7);
        inputComp.disabled = true; // Travado na edição

        // CORREÇÃO DEFINITIVA: Popula a lista antes de tentar atribuir o valor do motorista
        popularSelectMotoristasModalPremiacao(apuracao.unidade_id, apuracao.motorista_id);

        // Agora o selMot.value encontrará o <option> correspondente e exibirá o nome correto
        selMot.value = apuracao.motorista_id;
        selMot.disabled = true; // Travado na edição

        // 5. Renderização dos Critérios da Política
        // carregarPoliticaMotorista agora usará a unidade_id já carregada em apuracao
        await carregarPoliticaMotorista(); 
        
        // 6. Injeção de Valores nos Critérios (Só após o grid ser renderizado)
        if (apuracao.premiacoes_apuracoes_itens) {
            apuracao.premiacoes_apuracoes_itens.forEach(item => {
                const inputQtd = document.getElementById(`qtd-item-${item.item_config_id}`);
                const inputObs = document.getElementById(`obs-item-${item.item_config_id}`);
                
                if (inputQtd) {
                    inputQtd.value = item.qtd_realizada;
                    if (modoLeitura) inputQtd.disabled = true;
                }
                if (inputObs) {
                    inputObs.value = item.observacao || '';
                    if (modoLeitura) inputObs.disabled = true;
                }
            });
            
            // Recalcula os totais e ícones visuais
            calcularValores();
            
            // Registra o estado original para detecção de alterações
            estadoOriginalPremiacao = JSON.stringify(capturarEstadoAtualInputs());
        }

    } catch(e) {
        console.error("Erro técnico na edição:", e);
        if (typeof mostrarToast === 'function') mostrarToast("Erro ao carregar dados da apuração", "error");
        realizarFechamentoModal();
    }
};

function renderizarGridAvaliacao() {
    const container = document.getElementById('container-topicos');
    container.innerHTML = '';
    
    if (itensConfigModal.length === 0) {
        container.innerHTML = '<div class="text-center p-3">Política sem critérios.</div>';
    } else {
        itensConfigModal.forEach(item => {
            const div = document.createElement('div');
            div.className = 'topico-row';
            div.style.flexWrap = "wrap"; 
            
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
                    <div class="topico-info">
                        <h5>${item.topico}</h5>
                        <div class="topico-meta">Tolerância: <b>${item.tolerancia}</b> | Peso: ${item.peso}</div>
                    </div>
                    <div class="topico-input-area">
                        <input type="number" min="0" class="input-ocorrencia" 
                               id="qtd-item-${item.id}" data-id="${item.id}" data-topico="${item.topico}"
                               data-tolerancia="${item.tolerancia}" data-peso="${item.peso}" value="0">
                        <div class="status-icon" id="icon-item-${item.id}"><i class="fas fa-check-circle" style="color:#28a745"></i></div>
                    </div>
                </div>
                <div id="container-obs-${item.id}" style="width: 100%; display: none; margin-top: 10px; animation: fadeIn 0.3s;">
                    <input type="text" id="obs-item-${item.id}" class="form-control input-obs" 
                           placeholder="Descreva o motivo da ocorrência..." 
                           style="font-size: 0.85rem; border: 1px dashed #ccc; background: #fffcf5; color: #666;">
                </div>
            `;
            container.appendChild(div);
        });
        
        const inputs = document.querySelectorAll('.input-ocorrencia');
        inputs.forEach(i => i.addEventListener('input', calcularValores));
    }
    
    container.style.display = 'flex';

    // --- CORREÇÃO PARA NOVO LANÇAMENTO ---
    const btnSalvar = document.getElementById('btn-salvar-apuracao');
    if (btnSalvar) {
        btnSalvar.disabled = false; // Destrava o botão assim que o grid aparece
        btnSalvar.style.opacity = "1";
        btnSalvar.style.pointerEvents = "auto";
    }
}

function calcularValores() {
    if (!politicaAtualModal) return;
    const inputs = document.querySelectorAll('.input-ocorrencia');
    const valorMaximo = parseFloat(politicaAtualModal.valor_maximo || 0);
    let somaPesos = itensConfigModal.reduce((acc, i) => acc + (i.peso || 1), 0);
    let pontos = 0;

    inputs.forEach(inp => {
        const id = inp.dataset.id;
        const qtd = parseInt(inp.value) || 0;
        const tol = parseInt(inp.dataset.tolerancia) || 0;
        const peso = parseFloat(inp.dataset.peso) || 1;
        const icon = document.getElementById(`icon-item-${id}`);
        const containerObs = document.getElementById(`container-obs-${id}`);
        const inputObs = document.getElementById(`obs-item-${id}`);

        if (qtd <= tol) {
            pontos += peso;
            if(icon) icon.innerHTML = '<i class="fas fa-check-circle" style="color:#28a745"></i>';
            inp.style.borderColor = '#28a745';
        } else {
            if(icon) icon.innerHTML = '<i class="fas fa-times-circle" style="color:#dc3545"></i>';
            inp.style.borderColor = '#dc3545';
        }

        if (qtd > 0) {
            containerObs.style.display = 'block';
        } else {
            containerObs.style.display = 'none';
            inputObs.value = ''; 
        }
    });

    let valorFinal = (somaPesos > 0) ? (pontos / somaPesos) * valorMaximo : 0;
    document.getElementById('lbl-total-conquistado').innerText = valorFinal.toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

    verificarAlteracoesPremiacao();
}

function capturarEstadoAtualInputs() {
    const valores = {};
    document.querySelectorAll('.input-ocorrencia').forEach(inp => {
        valores[`qtd_${inp.id}`] = String(inp.value || "0"); 
    });
    document.querySelectorAll('.input-obs').forEach(inp => {
        valores[`obs_${inp.id}`] = String(inp.value || "").trim();
    });
    return valores;
}

function verificarAlteracoesPremiacao() {
    const btn = document.getElementById('btn-salvar-apuracao');
    if (!btn) return;

    // Botão SEMPRE habilitado
    btn.disabled = false;
}



window.salvarApuracao = async function() {
    const btn = document.getElementById('btn-salvar-apuracao');
    if (!btn || btn.disabled) return;

    if (!politicaAtualModal || !politicaAtualModal.id) {
        mostrarToast("Erro interno: Dados da política não encontrados.", "error");
        return;
    }

    const valoresAtuais = capturarEstadoAtualInputs();
    const estadoAtualStr = JSON.stringify(valoresAtuais);

    if (apuracaoEmEdicaoId && estadoOriginalPremiacao && estadoAtualStr === estadoOriginalPremiacao) {
        mostrarToast("Nenhuma alteração detectada para salvar.", "warning");
        return;
    }

    const htmlPadrao = '<i class="fas fa-save"></i> Salvar Apuração';
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gravando...';
    btn.disabled = true;

    try {
        const { data: { user } } = await clienteSupabase.auth.getUser();
        const motoristaId = document.getElementById('input-modal-motorista').value;
        const compInput = document.getElementById('input-modal-competencia').value;
        const competenciaStr = compInput + '-01';

        const inputs = document.querySelectorAll('.input-ocorrencia');
        const valorMaximo = parseFloat(politicaAtualModal.valor_maximo || 0);
        let somaPesos = (itensConfigModal || []).reduce((acc, i) => acc + (parseFloat(i.peso) || 1), 0);
        let pontos = 0;
        
        const itensSalvar = [];
        const logMudancas = []; 
        const originalObj = estadoOriginalPremiacao ? JSON.parse(estadoOriginalPremiacao) : {};
        const acaoLog = apuracaoEmEdicaoId ? 'UPDATE' : 'INSERT';

        inputs.forEach(inp => {
            const id = inp.dataset.id;
            const topico = inp.dataset.topico || "Item";
            const qtd = parseInt(inp.value) || 0;
            const obs = document.getElementById(`obs-item-${id}`)?.value.trim() || '';
            const tol = parseInt(inp.dataset.tolerancia) || 0;
            const peso = parseFloat(inp.dataset.peso) || 1;
            
            const atingiu = qtd <= tol;
            if (atingiu) pontos += peso;
            
            itensSalvar.push({ item_config_id: id, qtd_realizada: qtd, atingiu_meta: atingiu, observacao: obs });
            
            const oldQtd = parseInt(originalObj[`qtd_qtd-item-${id}`] || 0);
            const oldObs = (originalObj[`obs_obs-item-${id}`] || "").trim();

            // --- FILTRO DE LOG (SÓ SALVA O QUE INTERESSA) ---
            if (acaoLog === 'INSERT') {
                // No INSERT, só registra se houver ocorrência (qtd > 0) ou observação
                if (qtd > 0 || obs !== "") {
                    logMudancas.push({ 
                        item: topico, 
                        qtd: qtd, 
                        obs: obs || '(sem observação)' 
                    });
                }
            } else {
                // No UPDATE, registra apenas se houve mudança real em relação ao estado anterior
                if (qtd !== oldQtd || obs !== oldObs) {
                    logMudancas.push({ 
                        item: topico, 
                        mudou_qtd: qtd !== oldQtd,
                        mudou_obs: obs !== oldObs,
                        qtd_antiga: oldQtd, 
                        qtd_nova: qtd, 
                        obs_antiga: oldObs || '(vazia)', 
                        obs_nova: obs || '(vazia)' 
                    });
                }
            }
        });

        const valorFinal = (somaPesos > 0) ? (pontos / somaPesos) * valorMaximo : 0;
        const payload = {
            premiacao_id: politicaAtualModal.id,
            motorista_id: motoristaId,
            unidade_id: politicaAtualModal.unidade_id,
            competencia: competenciaStr,
            valor_calculado: valorFinal,
            status: 'Aberto',
            analista_id: user.id
        };

        let idFinal = apuracaoEmEdicaoId;
        if (idFinal) {
            const { error } = await clienteSupabase.from('premiacoes_apuracoes').update(payload).eq('id', idFinal);
            if (error) throw error;
        } else {
            const { data, error } = await clienteSupabase.from('premiacoes_apuracoes').insert(payload).select().single();
            if (error) throw error;
            idFinal = data.id;
            apuracaoEmEdicaoId = idFinal;
        }

        await clienteSupabase.from('premiacoes_apuracoes_itens').delete().eq('apuracao_id', idFinal);
        await clienteSupabase.from('premiacoes_apuracoes_itens').insert(itensSalvar.map(i => ({...i, apuracao_id: idFinal})));

        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'premiacoes_apuracoes',
            acao: acaoLog,
            id_registro_afetado: String(idFinal),
            usuario_id: user.id,
            data_hora: new Date().toISOString(),
            dados_novos: { 
                mudancas: logMudancas,
                valor_final: valorFinal.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})
            }
        }]);

        estadoOriginalPremiacao = estadoAtualStr; 
        formSujo = false; 
        
        mostrarToast("Apuração salva com sucesso!", "success");
        realizarFechamentoModal(); 
        if (typeof listarApuracoes === 'function') listarApuracoes();

    } catch (e) {
        console.error(e);
        mostrarToast("Falha ao salvar: " + e.message, "error");
        btn.disabled = false;
    } finally {
        btn.innerHTML = htmlPadrao;
    }
};

// =============================================================================
// 5. FINALIZAÇÃO COM MODAL PERSONALIZADO
// =============================================================================

// Abre o modal de finalização
window.abrirModalFinalizarPremiacao = function(id) {
    idFinalizacaoPendente = id;
    const modal = document.getElementById('modal-finalizar-premiacao');
    if (modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    } else {
        alert("Modal de finalização não encontrado no HTML!");
    }
};

// Fecha o modal de finalização
window.fecharModalFinalizarPremiacao = function() {
    const modal = document.getElementById('modal-finalizar-premiacao');
    if (modal) {
        modal.classList.remove('active');
        setTimeout(() => modal.style.display = 'none', 200);
    }
    idFinalizacaoPendente = null;
};

// Executa a finalização
window.executarFinalizacaoPremiacao = async function() {
    if (!idFinalizacaoPendente) return;
    
    // Fecha o modal visualmente
    const modal = document.getElementById('modal-finalizar-premiacao');
    modal.classList.remove('active');
    
    const id = idFinalizacaoPendente;

    try {
        await clienteSupabase.from('premiacoes_apuracoes').update({ status: 'Fechado' }).eq('id', id);
        
        const usuario = await clienteSupabase.auth.getUser();
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'premiacoes_apuracoes',
            acao: 'UPDATE_STATUS',
            id_registro_afetado: id,
            usuario_id: usuario.data.user?.id,
            dados_novos: { status: 'Fechado', acao: 'Finalização Manual' }
        }]);

        mostrarToast("Finalizado com sucesso!", "success");
        listarApuracoes();
    } catch(e) { 
        mostrarToast("Erro: " + e.message, "error"); 
    } finally {
        fecharModalFinalizarPremiacao();
    }
};

window.adicionarFiltroPremiacao = function(tipoPre = null, valorPre = null) {
    const container = document.getElementById('container-filtros-premiacao');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row'; 
    div.id = `row-prem-${id}`;
    div.innerHTML = `
        <select class="filter-select" id="sel-tipo-prem-${id}" onchange="configurarInputFiltroPremiacao(this, '${id}')">
            <option value="" disabled selected>Filtrar por...</option>
            <option value="status">Status</option>
            <option value="motorista">Motorista</option>
            <option value="competencia">Competência</option>
        </select>
        <div id="wrapper-val-prem-${id}" style="display:flex;">
            <input type="text" class="form-control" disabled placeholder="..." style="width: 150px;">
        </div>
        <button class="btn-remove-filter" onclick="this.parentElement.remove(); listarApuracoes();"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);

    // Se vier parâmetros, configura automaticamente
    if (tipoPre) {
        const select = document.getElementById(`sel-tipo-prem-${id}`);
        select.value = tipoPre;
        configurarInputFiltroPremiacao(select, id, valorPre);
    }
};

window.configurarInputFiltroPremiacao = function(sel, id, valorInicial = null) {
    const wrapper = document.getElementById(`wrapper-val-prem-${id}`);
    const tipo = sel.value;

    // Tenta preservar valor anterior ou usa o inicial passado
    const elAnterior = wrapper.querySelector('select, input');
    const valorAnterior = valorInicial ? valorInicial : (elAnterior ? elAnterior.value : '');

    wrapper.innerHTML = '';
    const inputClass = "form-control form-control-sm border-secondary";
    const styleStr = "min-width: 150px;";
    const triggerChange = () => listarApuracoes();

    if(tipo === 'status') {
        const s = document.createElement('select');
        s.className = inputClass; s.style.cssText = styleStr;
        s.onchange = triggerChange;
        s.innerHTML = '<option value="">Todos</option><option value="Aberto">Aberto</option><option value="Fechado">Fechado</option>';
        if(valorAnterior) s.value = valorAnterior;
        wrapper.appendChild(s);
    } 
    else if (tipo === 'competencia') {
        const i = document.createElement('input');
        i.type = 'month'; i.className = inputClass; i.style.cssText = styleStr;
        i.onchange = triggerChange;
        if(valorAnterior) i.value = valorAnterior;
        wrapper.appendChild(i);
    } 
    else if (tipo === 'motorista') {
        const s = document.createElement('select');
        s.className = inputClass; s.style.cssText = styleStr;
        s.onchange = triggerChange;
        
        const unidadeRodape = document.getElementById('sel-unidade')?.value;
        let lista = motoristasCachePremiacao;
        
        if (unidadeRodape && unidadeRodape !== 'TODAS' && unidadeRodape !== 'ALL') {
            lista = lista.filter(m => String(m.unidade_id) === String(unidadeRodape));
        }
        
        lista.sort((a,b) => a.nome_completo.localeCompare(b.nome_completo));

        s.innerHTML = '<option value="">Todos da Unidade</option>';
        lista.forEach(m => {
            const isSelected = String(m.id) === String(valorAnterior) ? 'selected' : '';
            s.innerHTML += `<option value="${m.id}" ${isSelected}>${m.nome_completo}</option>`;
        });
        
        wrapper.appendChild(s);
    }
};

window.visualizarApuracao = function(id) {
    editarApuracao(id, true);
};

/**
 * Exclui permanentemente um registro de apuração e seus itens vinculados.
 * @param {number} id - ID da apuração na tabela premiacoes_apuracoes.
 */
window.excluirApuracao = async function(id) {
    if (!id) return;
    
    // 1. Solicita confirmação antes de proceder
    window.solicitarConfirmacao(async () => {
        try {
            // 2. Busca dados da apuração antes de deletar para o Log de Auditoria
            const { data: bkp } = await clienteSupabase
                .from('premiacoes_apuracoes')
                .select('*')
                .eq('id', id)
                .single();

            // 3. Deleta os itens vinculados (chave estrangeira)
            const { error: errItens } = await clienteSupabase
                .from('premiacoes_apuracoes_itens')
                .delete()
                .eq('apuracao_id', id);

            if (errItens) throw errItens;

            // 4. Deleta o registro principal
            const { error: errPrincipal } = await clienteSupabase
                .from('premiacoes_apuracoes')
                .delete()
                .eq('id', id);

            if (errPrincipal) throw errPrincipal;

            // 5. Registra a exclusão no Log de Auditoria
            const { data: { user } } = await clienteSupabase.auth.getUser();
            await clienteSupabase.from('logs_auditoria').insert([{
                tabela_afetada: 'premiacoes_apuracoes',
                acao: 'DELETE',
                id_registro_afetado: String(id),
                usuario_id: user.id,
                data_hora: new Date().toISOString(),
                dados_antigos: bkp // Salva o que foi apagado para possível conferência
            }]);

            // 6. Feedback e atualização da tela
            mostrarToast("Apuração excluída com sucesso!", "success");
            listarApuracoes(); 

        } catch (e) {
            console.error("Erro ao excluir:", e);
            mostrarToast("Erro ao excluir apuração: " + e.message, "error");
        }
    }, "Tem certeza que deseja excluir esta apuração? Todos os dados vinculados serão perdidos.");
};