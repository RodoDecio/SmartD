let motoristasCache = [];
let valoresDiariasCache = {}; 
let lancamentosMesCache = []; 
let unidadeMotoristaAtual = null;
let unidadesCache = {};
let usuariosCache = {};

// Controle de Estado
let estadoOriginalJSON = ""; 
let motoristaSelecionadoAnterior = ""; 
let isModalOpen = false;

let tempPerfilIdFinalizar = null;
let tempMesRefFinalizar = null;
let callbackAlertaVazios = null;

const LABELS_TIPO = {
    'diaria': 'Diária',
    'refeicao': 'Refeição',
    'refeicao_janta': 'Alm+Jan',
    'folga': 'Folga',
    'atestado': 'Atestado',
    'ferias': 'Férias',
    'afastamento': 'Afast.',
    'dsr': 'DSR',
    'falta': 'Falta'
};

// =============================================================================
// 1. INICIALIZAÇÃO E LISTAGEM
// =============================================================================

async function inicializarLancamentosDiarias() {
    const titulo = document.getElementById('titulo-pagina');
    if(titulo) titulo.innerText = 'Lançamento de Diárias';

    await carregarDadosAuxiliares();

    // LÓGICA DO RODAPÉ
    const selectRodape = document.getElementById('sel-unidade');
    if (selectRodape) {
        selectRodape.removeEventListener('change', listarCompetenciasDiarias);
        selectRodape.addEventListener('change', listarCompetenciasDiarias);
    }

    const container = document.getElementById('container-filtros-diarias');
    
    // [CORREÇÃO] Se não houver filtros, cria o filtro padrão de COMPETÊNCIA ATUAL
    if (container && container.children.length === 0) {
        
        // Cálculo da Competência Atual (Regra: Dia >= 16 vira o próximo mês)
        const hoje = new Date();
        let mes = hoje.getMonth(); // 0 a 11
        let ano = hoje.getFullYear();

        if (hoje.getDate() >= 16) {
            mes++; // Avança competência
            if (mes > 11) {
                mes = 0;
                ano++;
            }
        }

        // Formato para input type="month" (YYYY-MM)
        const competenciaPadrao = `${ano}-${String(mes + 1).padStart(2, '0')}`;
        
        // Chama a função passando o tipo e o valor
        adicionarFiltroDiarias('competencia', competenciaPadrao);
    }
    
    // A listagem vai ler o filtro que acabamos de criar no DOM
    listarCompetenciasDiarias();
}

async function carregarDadosAuxiliares() {
    try {
        // [CORREÇÃO] Adicionamos 'matricula' explicitamente na busca
        const { data: perfis } = await clienteSupabase
            .from('perfis')
            .select('id, nome_completo, unidade_id, funcao, matricula') 
            .eq('ativo', true)
            .order('nome_completo');
        
        usuariosCache = {};
        if(perfis) {
            perfis.forEach(p => {
                usuariosCache[p.id] = p.nome_completo;
            });
        }
        
        // Filtra motoristas e garante que a matrícula esteja acessível
        motoristasCache = (perfis || []).filter(p => p.funcao && p.funcao.toLowerCase() === 'motorista');

        // Valores e Unidades
        const { data: valores } = await clienteSupabase.from('valores_diarias').select('*').eq('ativo', true);
        valoresDiariasCache = {};
        if (valores) {
            valores.forEach(v => {
                if (!valoresDiariasCache[v.unidade_id] || new Date(v.created_at) > new Date(valoresDiariasCache[v.unidade_id].created_at)) {
                    valoresDiariasCache[v.unidade_id] = v;
                }
            });
        }

        const { data: units } = await clienteSupabase.from('unidades').select('id, nome, cidade, estado'); 
        unidadesCache = {};
        if (units) {
            units.forEach(u => {
                unidadesCache[u.id] = { 
                    nome: u.nome, 
                    cidade: u.cidade || '', 
                    uf: u.estado || '' 
                }; 
            });
        }

    } catch (e) {
        console.error("Erro dados aux:", e);
        exibirToastLancamento("Erro ao carregar dados básicos.", "error");
    }
}

async function listarCompetenciasDiarias() {
    atualizarDropdownsFiltroDiarias();

    const tbody = document.getElementById('tbody-competencias-diarias');
    if(tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Buscando lançamentos...</td></tr>';

    try {
        const unidadeRodape = document.getElementById('sel-unidade')?.value || 'TODAS';

        let query = clienteSupabase
            .from('diarias_lancamentos')
            .select(`
                perfil_id, data_referencia, status, valor_dia, unidade_id, 
                perfis!diarias_lancamentos_perfil_id_fkey (nome_completo, unidade_id)
            `)
            .order('data_referencia', { ascending: false });

        if (unidadeRodape !== 'TODAS') {
            query = query.eq('unidade_id', unidadeRodape);
        }

        const { data, error } = await query;

        if(error) throw error;

        let listaAgrupada = agruparLancamentos(data || []);

        // --- FILTROS LOCAIS E LEGENDA VISUAL ---
        let legendasFiltro = [];
        const filtrosContainer = document.getElementById('container-filtros-diarias');
        
        if(filtrosContainer) {
            const rows = filtrosContainer.querySelectorAll('.filter-row');
            
            rows.forEach(row => {
                const selTipo = row.querySelector('.filter-select'); 
                const valEl = row.querySelector('.form-control');

                if (selTipo && valEl) {
                    const tipo = selTipo.value;
                    const val = valEl.value; 

                    if (tipo && val && val !== "") {
                        // 1. Gera o texto para a barra de status (Visual)
                        let txtValor = val;
                        // Pega o nome amigável do tipo (ex: "Competência" em vez de "competencia")
                        const labelTipo = selTipo.options[selTipo.selectedIndex].text;

                        // Se for Select, pega o texto da opção selecionada (ex: Nome do Motorista)
                        if (valEl.tagName === 'SELECT' && valEl.selectedIndex >= 0) {
                            txtValor = valEl.options[valEl.selectedIndex].text;
                        } 
                        // Se for Mês, formata para MM/AAAA
                        else if (tipo === 'competencia') {
                            const [ano, mes] = val.split('-');
                            txtValor = `${mes}/${ano}`;
                        }

                        legendasFiltro.push(`<b>${labelTipo}:</b> ${txtValor}`);

                        // 2. Aplica o filtro nos dados (Lógica)
                        listaAgrupada = listaAgrupada.filter(item => {
                            if(tipo === 'status') {
                                return (item.status || '').toLowerCase() === val.toLowerCase();
                            }
                            if(tipo === 'competencia') {
                                return item.mesRef === val; 
                            }
                            if(tipo === 'motorista') {
                                return String(item.perfil_id) === String(val); 
                            }
                            return true;
                        });
                    }
                }
            });
        }

        // --- ATUALIZA A BARRA SUPERIOR ---
        const lblFiltros = document.getElementById('lbl-filtros-ativos-diarias');
        if (lblFiltros) {
            if (legendasFiltro.length > 0) {
                lblFiltros.innerHTML = `<i class="fas fa-filter"></i> ${legendasFiltro.join(' <span style="margin:0 5px; color:#ccc;">|</span> ')}`;
                lblFiltros.style.display = 'block';
            } else {
                lblFiltros.innerHTML = '';
                lblFiltros.style.display = 'none';
            }
        }

        // --- ORDENAÇÃO FINAL ---
        listaAgrupada.sort((a, b) => {
            if (a.mesRef !== b.mesRef) {
                return a.mesRef < b.mesRef ? 1 : -1; 
            }
            const nomeA = (a.motorista || "").toLowerCase();
            const nomeB = (b.motorista || "").toLowerCase();
            return nomeA.localeCompare(nomeB);
        });

        renderizarTabelaResumo(listaAgrupada);

    } catch (err) {
        console.error(err);
        if(tbody) tbody.innerHTML = `<tr><td colspan="7" class="text-center text-danger">Erro: ${err.message}</td></tr>`;
    }
}

function atualizarDropdownsFiltroDiarias() {
    const container = document.getElementById('container-filtros-diarias');
    if (!container) return;

    // Busca todas as linhas de filtro
    const rows = container.querySelectorAll('.filter-row');
    
    rows.forEach(row => {
        const sel = row.querySelector('.filter-select');
        
        // Se o filtro for do tipo 'motorista', precisamos recarregar as opções
        if (sel && sel.value === 'motorista') {
            // Extrai o ID timestamp da linha (ex: "row-dia-1735...")
            const idTimestamp = row.id.replace('row-dia-', '');
            
            // Chama a configuração novamente. 
            // Ela vai ler o document.getElementById('sel-unidade').value atualizado
            configurarInputFiltroDiaria(sel, idTimestamp);
        }
    });
}

// Função para recuperar as unidades permitidas (ex: do localStorage ou sessão)
function obterUnidadesPermitidas() {
    // Ajuste 'usuario_unidades_ids' para a chave exata que você usa no seu sistema
    const unidadesStorage = localStorage.getItem('usuario_unidades_ids'); 
    
    // Retorna array de IDs ou null se não tiver restrição
    return unidadesStorage ? JSON.parse(unidadesStorage) : []; 
}

function agruparLancamentos(dados) {
    const mapa = {};
    
    dados.forEach(d => {
        // [CORREÇÃO] Tratamento seguro de data para evitar erro de fuso horário (-3h)
        // Cria a data assumindo que a string 'YYYY-MM-DD' é UTC (meia-noite)
        // Isso impede que dia 16 vire dia 15 às 21h do dia anterior
        const partesData = d.data_referencia.split('-');
        const anoOriginal = parseInt(partesData[0]);
        const mesOriginal = parseInt(partesData[1]) - 1; // JS conta meses 0-11
        const diaOriginal = parseInt(partesData[2]);

        // Lógica de Competência (Ciclo 16 a 15)
        let anoComp = anoOriginal;
        let mesComp = mesOriginal;

        // Se for dia 16 ou maior, pertence à competência do mês seguinte
        if (diaOriginal >= 16) {
            mesComp++;
            if (mesComp > 11) {
                mesComp = 0;
                anoComp++;
            }
        }

        // Chave única para agrupar: ID_MOTORISTA + COMPETENCIA (ANO-MES)
        const chave = `${d.perfil_id}-${anoComp}-${mesComp}`;

        if (!mapa[chave]) {
            mapa[chave] = {
                perfil_id: d.perfil_id,
                motorista: d.perfis?.nome_completo || 'Desconhecido',
                unidade_id: d.perfis?.unidade_id || d.unidade_id,
                ano: anoComp,
                mes: mesComp,
                // Formata 'YYYY-MM' para ordenação e exibição
                mesRef: `${anoComp}-${String(mesComp+1).padStart(2,'0')}`,
                total: 0,
                // Define status: Se qualquer dia do grupo estiver 'Fechado', o grupo é Fechado
                status: 'Aberto' 
            };
        }

        // Soma valores (converte para float para garantir matemática correta)
        mapa[chave].total += parseFloat(d.valor_dia || 0);

        // Se encontrar um registro fechado, marca a competência como fechada
        if (d.status === 'Fechado') {
            mapa[chave].status = 'Fechado';
        }
    });

    return Object.values(mapa);
}

function renderizarTabelaResumo(lista) {
    const tbody = document.getElementById('tbody-competencias-diarias');
    if(!tbody) return;
    tbody.innerHTML = '';
    document.getElementById('lbl-contagem-diarias').innerText = `Exibindo ${lista.length} registro(s)`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">Nenhum lançamento encontrado.</td></tr>';
        return;
    }

    // Identifica perfis com permissão especial de edição (Especialista e Coordenador)
    const isGestorMaster = (typeof usuarioLogadoGlobal !== 'undefined' && 
                           ['coordenador', 'especialista'].includes(usuarioLogadoGlobal.funcao.toLowerCase()));

    lista.forEach(item => {
        const mesStr = String(item.mes + 1).padStart(2, '0');
        const dtIni = new Date(item.ano, item.mes - 1, 16);
        const dtFim = new Date(item.ano, item.mes, 15);
        const periodoTxt = `${dtIni.getDate()}/${dtIni.getMonth()+1} a ${dtFim.getDate()}/${dtFim.getMonth()+1}`;
        
        // --- ALTERAÇÃO: Formatação Apenas Numérica (sem o R$) ---
        const valorNumerico = item.total.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        
        let badgeClass = item.status === 'Fechado' ? 'badge-sucesso' : 'badge-pendente';
        const nomeUnidade = unidadesCache[item.unidade_id]?.nome || `Unid. ${item.unidade_id || '-'}`;

        const btnHist = `<button class="action-btn" onclick="verHistoricoLancamento('${item.perfil_id}', '${item.mesRef}')" title="Histórico"><i class="fas fa-history"></i></button>`;
        const btnVis = `<button class="action-btn" onclick="visualizarLancamento('${item.perfil_id}', '${item.mesRef}', true)" title="Visualizar"><i class="fas fa-eye" style="color: var(--cor-primaria);"></i></button>`;
        
        // REGRA DE EDIÇÃO: Pode editar se estiver Aberto OU se for Coordenador/Especialista (mesmo fechado)
        const podeEditar = item.status === 'Aberto' || isGestorMaster;

        const btnEdit = podeEditar
            ? `<button class="action-btn" onclick="visualizarLancamento('${item.perfil_id}', '${item.mesRef}', false)" title="Editar/Corrigir"><i class="fas fa-edit"></i></button>`
            : '';

        // REGRA DE FINALIZAÇÃO: Qualquer usuário com acesso pode finalizar se o status for 'Aberto'
        const btnFinalizar = (item.status === 'Aberto') 
            ? `<button class="action-btn" onclick="finalizarCompetencia('${item.perfil_id}', '${item.mesRef}')" title="Finalizar"><i class="fas fa-check-circle" style="color: var(--cor-sucesso);"></i></button>` 
            : `<button class="action-btn" disabled title="Já Finalizado"><i class="fas fa-check-circle" style="color: #aaa;"></i></button>`;

        tbody.innerHTML += `
            <tr>
                <td><b>${mesStr}/${item.ano}</b></td>
                <td style="color:#666; font-size:0.85rem;">${periodoTxt}</td>
                <td>${item.motorista}</td>
                <td>${nomeUnidade}</td>
                
                <td>
                    <div style="display: flex; justify-content: space-between; align-items: center; min-width: 110px; font-weight: 700; color: var(--cor-primaria);">
                        <span style="margin-right: 5px;">R$</span>
                        <span>${valorNumerico}</span>
                    </div>
                </td>

                <td><span class="badge ${badgeClass}">${item.status}</span></td>
                <td class="text-end" style="white-space:nowrap;">
                    ${btnVis} ${btnHist} ${btnEdit} ${btnFinalizar}
                </td>
            </tr>`;
    });
}

// =============================================================================
// 3. MODAL DE LANÇAMENTO
// =============================================================================

function visualizarLancamento(pId, mesRef, forceReadOnly = false) {
    abrirModalCalendarioOperacional(pId, mesRef, forceReadOnly);
}

function abrirModalCalendarioOperacional(perfilId = '', mesAnoIso = '', forceReadOnly = false) {
    popularSelectMotoristasModal(); 
    
    if (!mesAnoIso) {
        const hoje = new Date();
        let mes = hoje.getMonth() + (hoje.getDate() > 15 ? 1 : 0);
        let ano = hoje.getFullYear();
        if(mes > 11) { mes = 0; ano++; }
        mesAnoIso = `${ano}-${String(mes+1).padStart(2,'0')}`;
    }
    document.getElementById('input-calendario-mes').value = mesAnoIso;

    const selMot = document.getElementById('input-calendario-motorista');
    if (perfilId) {
        selMot.value = perfilId;
        motoristaSelecionadoAnterior = perfilId;
    } else {
        selMot.value = "";
        motoristaSelecionadoAnterior = "";
    }

    const modal = document.getElementById('modal-lancamento-calendario');
    modal.dataset.readonly = forceReadOnly;
    modal.classList.add('active'); 
    isModalOpen = true;

    if (perfilId) carregarGradeCalendario();
    else resetarGradeVisual();
}

function resetarGradeVisual() {
    document.getElementById('calendar-grid-body').innerHTML = `
        <div style="grid-column: 1/-1; padding: 50px; text-align: center; color: #999;">
            <i class="fas fa-user-clock" style="font-size:2rem; margin-bottom:10px;"></i><br>
            Selecione o Motorista para iniciar.
        </div>`;
    document.getElementById('container-totais-dinamicos').innerHTML = '';
    document.getElementById('lbl-info-unidade').innerText = '';

    // Esconde o label de alimentação quando a grade é limpa
    const lblAlimentacao = document.getElementById('lbl-valor-alimentacao');
    if (lblAlimentacao) lblAlimentacao.style.display = 'none';

    document.getElementById('btn-salvar-lancamento').disabled = true; 
    
    lancamentosMesCache = [];
    estadoOriginalJSON = "[]"; 
}

function popularSelectMotoristasModal() {
    const sel = document.getElementById('input-calendario-motorista');
    const unidadeFiltro = document.getElementById('sel-unidade')?.value || 'TODAS';
    
    sel.innerHTML = '<option value="">Selecione...</option>';
    let lista = motoristasCache;
    
    if (unidadeFiltro !== 'TODAS' && unidadeFiltro !== 'ALL') {
        lista = lista.filter(m => String(m.unidade_id) === String(unidadeFiltro));
    }
    
    lista.forEach(m => {
        sel.innerHTML += `<option value="${m.id}" data-unidade="${m.unidade_id}">${m.nome_completo}</option>`;
    });

    const newSel = sel.cloneNode(true);
    sel.parentNode.replaceChild(newSel, sel);
    newSel.addEventListener('focus', function() { motoristaSelecionadoAnterior = this.value; });
    newSel.addEventListener('change', function() { verificarTrocaMotorista(this); });
}

function verificarTrocaMotorista(selectElement) {
    if (verificarSeHouveAlteracao()) {
        abrirModalConfirmacao(() => {
            motoristaSelecionadoAnterior = selectElement.value;
            carregarGradeCalendario(); 
        }, () => {
            selectElement.value = motoristaSelecionadoAnterior; 
        });
    } else {
        motoristaSelecionadoAnterior = selectElement.value;
        carregarGradeCalendario();
    }
}

function verificarTrocaCompetencia(inputDate) {
    if(verificarSeHouveAlteracao()) {
        abrirModalConfirmacao(() => carregarGradeCalendario(), () => {});
    } else {
        carregarGradeCalendario();
    }
}

async function carregarGradeCalendario() {
    const motoristaId = document.getElementById('input-calendario-motorista').value;
    const mesAno = document.getElementById('input-calendario-mes').value;
    const grid = document.getElementById('calendar-grid-body');
    const tituloModal = document.getElementById('titulo-modal-calendario');
    const btnSalvar = document.getElementById('btn-salvar-lancamento');
    const chkFinanceiro = document.getElementById('chk-pagar-folga-atestado'); // Agora é um toggle slider

    // 1. Validação Básica
    if (!motoristaId || !mesAno) {
        resetarGradeVisual();
        return;
    }

    // 2. Preparação UI
    btnSalvar.disabled = true;
    btnSalvar.style.display = 'none';
    tituloModal.innerText = "Carregando...";

    const selMot = document.getElementById('input-calendario-motorista');
    const opt = selMot.options[selMot.selectedIndex];
    unidadeMotoristaAtual = opt ? opt.getAttribute('data-unidade') : null;

    // --- NOVA LÓGICA: Exibe o valor da Alimentação (se existir) ---
    const lblAlimentacao = document.getElementById('lbl-valor-alimentacao');
    if (lblAlimentacao) {
        const tabela = valoresDiariasCache[unidadeMotoristaAtual];
        const valAli = tabela ? parseFloat(tabela.valor_alimentacao || 0) : 0;
        
        if (valAli > 0) {
            const valFmt = valAli.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            lblAlimentacao.innerHTML = `<i class="fas fa-utensils" style="margin-right: 5px;"></i> Alimentação: <strong>${valFmt}</strong>`;
            lblAlimentacao.style.display = 'block';
        } else {
            lblAlimentacao.style.display = 'none';
        }
    }
    // -------------------------------------------------------------

    grid.innerHTML = '<div style="grid-column:1/-1; text-align:center; padding:40px;"><i class="fas fa-spinner fa-spin"></i> Carregando dados...</div>';

    // 3. Cálculo de Datas (Ciclo 16 a 15)
    const [anoStr, mesStr] = mesAno.split('-');
    const ano = parseInt(anoStr);
    const mes = parseInt(mesStr) - 1; 
    const dtIni = new Date(ano, mes - 1, 16);
    const dtFim = new Date(ano, mes, 15);
    const isoIni = dtIni.toISOString().split('T')[0];
    const isoFim = dtFim.toISOString().split('T')[0];

    try {
        // 4. Busca Dados no Banco
        const { data: existentes, error } = await clienteSupabase
            .from('diarias_lancamentos')
            .select('*')
            .eq('perfil_id', motoristaId)
            .gte('data_referencia', isoIni)
            .lte('data_referencia', isoFim);
        
        if (error) throw error;

        // 5. Atualiza Cache e Estado
        lancamentosMesCache = existentes ? JSON.parse(JSON.stringify(existentes)) : []; 
        estadoOriginalJSON = JSON.stringify(lancamentosMesCache);

        // Atualiza Toggle (Regra Financeira)
        if (chkFinanceiro) {
            if (lancamentosMesCache.length > 0) {
                // Se já tem lançamentos, pega a regra do primeiro registro
                chkFinanceiro.checked = lancamentosMesCache[0].gera_financeiro_excecao || false;
            } else {
                chkFinanceiro.checked = false; // Padrão desligado para novos
            }
        }

        // 6. Lógica de Permissões e Modo Leitura
        const isGestorMaster = (typeof usuarioLogadoGlobal !== 'undefined' && 
                               ['coordenador', 'especialista'].includes(usuarioLogadoGlobal.funcao.toLowerCase()));
        
        const isFechado = lancamentosMesCache.some(l => l.status === 'Fechado');
        const forcedReadOnly = (document.getElementById('modal-lancamento-calendario').dataset.readonly === 'true');

        // MODO LEITURA: Se estiver fechado (e não for gestor) OU se foi aberto apenas para visualização
        const modoLeitura = (isFechado && !isGestorMaster) || forcedReadOnly;

        // 7. Atualiza Botões de Documento (Passando modoLeitura)
        const registroComUrl = lancamentosMesCache.find(l => l.jornada_url);
        const urlExistente = registroComUrl ? registroComUrl.jornada_url : null;
        
        if (typeof atualizarBotoesJornada === 'function') {
            atualizarBotoesJornada(urlExistente, modoLeitura);
        }

        // 8. Atualiza Interface (Título e Botão Salvar)
        if (modoLeitura) {
            tituloModal.innerHTML = `Visualizar Lançamento ${isFechado ? "<span class='badge' style='background:#28a745; color:white; font-size:10px; margin-left:10px;'>FECHADO</span>" : ""}`;
            btnSalvar.style.display = 'none';
            if (chkFinanceiro) chkFinanceiro.disabled = true; // Trava o toggle
        } else {
            tituloModal.innerHTML = isFechado 
                ? "Editar Registro <span style='color:#ffc107; font-size:12px;'>(STATUS: FECHADO - ACESSO GESTOR)</span>" 
                : (lancamentosMesCache.length > 0 ? "Editar Lançamento" : "Novo Lançamento");
            
            btnSalvar.style.display = 'block';
            btnSalvar.disabled = false;
            if (chkFinanceiro) chkFinanceiro.disabled = false; // Destrava o toggle
        }

        // 9. Renderização da Grade (Dias)
        grid.innerHTML = '';
        const diaSemanaIni = dtIni.getDay(); 
        
        // Dias vazios antes do dia 16
        for(let i=0; i<diaSemanaIni; i++) {
            grid.innerHTML += `<div class="calendar-day empty border-0 bg-light"></div>`;
        }

        let loop = new Date(dtIni);
        while (loop <= dtFim) {
            const iso = loop.toISOString().split('T')[0];
            const diaNum = loop.getDate();
            const diaSem = loop.getDay(); 
            
            // Busca dados do dia específico
            const reg = lancamentosMesCache.find(l => l.data_referencia === iso);
            const val = reg ? reg.tipo_consumo : '';
            const classVal = val ? `val-${val}` : '';
            const disabledAttr = modoLeitura ? 'disabled' : '';

            // Renderiza célula do dia
            grid.innerHTML += `
                <div class="calendar-day ${diaSem === 0 ? 'weekend-sun' : (diaSem === 6 ? 'weekend-sat' : '')}">
                    <div class="day-number">${diaNum} <span class="day-meta">${traduzirDiaSemana(diaSem)}</span></div>
                    <select class="select-dia ${classVal}" data-iso="${iso}" onchange="atualizarCacheLocal('${iso}', this)" ${disabledAttr}>
                        <option value="">--</option>
                        <option value="diaria" ${val==='diaria'?'selected':''}>Diária</option>
                        <option value="refeicao" ${val==='refeicao'?'selected':''}>Refeição</option>
                        <option value="refeicao_janta" ${val==='refeicao_janta'?'selected':''}>Alm + Jan</option>
                        <option value="folga" ${val==='folga'?'selected':''}>Folga</option>
                        <option value="atestado" ${val==='atestado'?'selected':''}>Atestado</option>
                        <option value="ferias" ${val==='ferias'?'selected':''}>Férias</option>
                        <option value="afastamento" ${val==='afastamento'?'selected':''}>Afastamento</option>
                        <option value="dsr" ${val==='dsr'?'selected':''}>DSR</option>
                        <option value="falta" ${val==='falta'?'selected':''}>Falta</option>
                    </select>
                </div>`;
            
            loop.setDate(loop.getDate() + 1);
        }

        // 10. Recalcula Totais na Tela
        calcularTotaisCache();

    } catch (e) {
        console.error(e);
        grid.innerHTML = '<div style="grid-column:1/-1; color:red; text-align:center;">Erro ao processar grade. Tente novamente.</div>';
    }
}

function atualizarCacheLocal(dataIso, selectElement) {
    const tipo = selectElement.value;
    const motoristaId = document.getElementById('input-calendario-motorista').value;
    
    // Captura o estado real do checkbox (verde = true, cinza = false)
    const chkFinanceiro = document.getElementById('chk-pagar-folga-atestado');
    const pagarEspeciais = chkFinanceiro ? chkFinanceiro.checked : false;

    selectElement.className = `select-dia ${tipo ? 'val-'+tipo : ''}`;

    let valorCalculado = 0;
    const tabela = valoresDiariasCache[unidadeMotoristaAtual];

    if (tipo && tabela) {
        const vRef = parseFloat(tabela.valor_refeicao || 0);
        const vJan = parseFloat(tabela.valor_jantar || 0);
        const vDia = parseFloat(tabela.valor_diaria || 0);

        // Regras de cálculo baseadas no tipo selecionado
        if (tipo === 'diaria') {
            valorCalculado = vDia;
        } else if (tipo === 'refeicao') {
            valorCalculado = vRef;
        } else if (tipo === 'refeicao_janta') {
            valorCalculado = vRef + vJan;
        } 
        // REGRA SOLICITADA: Folga e Atestado usam valor de REFEIÇÃO se o botão estiver ligado
        else if ((tipo === 'folga' || tipo === 'atestado') && pagarEspeciais) {
            valorCalculado = vRef; 
        } else {
            // Se for folga/atestado e o botão estiver desligado, ou outros tipos (ferias, etc)
            valorCalculado = 0;
        }
    }

    const idx = lancamentosMesCache.findIndex(l => l.data_referencia === dataIso);
    if (idx > -1) {
        if (tipo) {
            lancamentosMesCache[idx].tipo_consumo = tipo;
            lancamentosMesCache[idx].valor_dia = valorCalculado;
            // Persiste a escolha para salvar no banco
            lancamentosMesCache[idx].gera_financeiro_excecao = pagarEspeciais;
        } else {
            lancamentosMesCache.splice(idx, 1);
        }
    } else if (tipo) {
        lancamentosMesCache.push({
            data_referencia: dataIso,
            tipo_consumo: tipo,
            valor_dia: valorCalculado,
            perfil_id: motoristaId,
            unidade_id: unidadeMotoristaAtual,
            gera_financeiro_excecao: pagarEspeciais,
            status: 'Aberto'
        });
    }

    calcularTotaisCache();
}

function verificarSeHouveAlteracao() {
    // Se o estado original estiver vazio (erro de carga), retorna false para evitar salvar lixo
    if (!estadoOriginalJSON) return false;

    const estadoAtual = JSON.stringify(lancamentosMesCache);
    return estadoAtual !== estadoOriginalJSON;
}
// =============================================================================
// 4. SALVAMENTO E AUDITORIA (CORRIGIDO)
// =============================================================================

async function salvarAlteracoesNoBanco() {
    if (typeof verificarSeHouveAlteracao === 'function' && !verificarSeHouveAlteracao()) {
        exibirToastLancamento("Nenhuma alteração detectada.", "warning");
        return; 
    }

    const btn = document.getElementById('btn-salvar-lancamento');
    const motoristaId = document.getElementById('input-calendario-motorista').value;
    const mesAno = document.getElementById('input-calendario-mes').value;
    
    const chkFinanceiro = document.getElementById('chk-pagar-folga-atestado');
    const estadoSwitch = chkFinanceiro ? chkFinanceiro.checked : false;

    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    }

    try {
        const [anoStr, mesStr] = mesAno.split('-');
        let anoFim = parseInt(anoStr);
        let mesFim = parseInt(mesStr);
        let anoIni = anoFim;
        let mesIni = mesFim - 1;
        if (mesIni === 0) { mesIni = 12; anoIni--; }

        const isoIni = `${anoIni}-${String(mesIni).padStart(2,'0')}-16`;
        const isoFim = `${anoFim}-${String(mesFim).padStart(2,'0')}-15`;

        const { data: bkp } = await clienteSupabase
            .from('diarias_lancamentos')
            .select('*')
            .eq('perfil_id', motoristaId)
            .gte('data_referencia', isoIni)
            .lte('data_referencia', isoFim);

        const isFechadoNoBanco = bkp && bkp.length > 0 && bkp[0].status === 'Fechado';

        // Apaga os velhos
        await clienteSupabase.from('diarias_lancamentos').delete()
            .eq('perfil_id', motoristaId)
            .gte('data_referencia', isoIni)
            .lte('data_referencia', isoFim);

        // Prepara os novos
        const payload = lancamentosMesCache.map(l => ({
            perfil_id: motoristaId,
            unidade_id: unidadeMotoristaAtual,
            data_referencia: l.data_referencia,
            tipo_consumo: l.tipo_consumo,
            valor_dia: l.valor_dia,
            gera_financeiro_excecao: estadoSwitch,
            status: 'Aberto',
            jornada_url: l.jornada_url || null
        }));

        // Insere os novos
        if (payload.length > 0) {
            const { error: errIns } = await clienteSupabase.from('diarias_lancamentos').insert(payload);
            if (errIns) throw errIns;
        }

        // Grava o Log com Antes (bkp) vs Depois (payload)
        const { data: { user } } = await clienteSupabase.auth.getUser();
        if(user) {
            await clienteSupabase.from('logs_auditoria').insert([{
                tabela_afetada: 'diarias_lancamentos',
                id_registro_afetado: `${motoristaId}_${mesAno}`,
                acao: isFechadoNoBanco ? 'REABERTURA' : 'UPDATE_GRID',
                usuario_id: user.id,
                dados_antigos: bkp, // <--- INJEÇÃO DOS DADOS ANTIGOS AQUI
                dados_novos: payload,
                data_hora: new Date().toISOString()
            }]);
        }

        exibirToastLancamento("Salvo com sucesso!", "success");
        
        estadoOriginalJSON = JSON.stringify(payload);
        formColetaSujo = false; 
        
        const modal = document.getElementById('modal-lancamento-calendario');
        if (modal) {
            modal.classList.remove('active');
            isModalOpen = false;
        }

        if(typeof listarCompetenciasDiarias === 'function') listarCompetenciasDiarias();

    } catch(e) {
        console.error("Erro salvar:", e);
        exibirToastLancamento("Erro ao salvar: " + e.message, "error");
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-save"></i> Salvar Lançamento';
        }
    }
}

function exibirToastLancamento(msg, tipo = 'success') {
    // Cria um container exclusivo para garantir que fique acima da Modal (Z-Index 99999)
    let box = document.getElementById('toast-container-lancamentos');
    
    if (!box) {
        box = document.createElement('div');
        box.id = 'toast-container-lancamentos';
        // CSS inline apenas para posicionamento e camada (Z-Index), o resto herda do style.css
        box.style.cssText = `
            position: fixed; 
            top: 20px; 
            right: 20px; 
            z-index: 99999; 
            display: flex; 
            flex-direction: column; 
            gap: 10px;
        `;
        document.body.appendChild(box);
    }

    // Cria o elemento usando EXATAMENTE as classes do seu style.css
    const div = document.createElement('div');
    div.className = `toast ${tipo}`; // Ex: "toast warning" (fundo amarelo, borda esquerda amarela)
    
    // Mapeamento de ícones igual ao do app.js
    let icone = 'fa-check-circle';
    if (tipo === 'error') icone = 'fa-times-circle';
    if (tipo === 'warning') icone = 'fa-exclamation-triangle'; 

    div.innerHTML = `<i class="fas ${icone}"></i> <span>${msg}</span>`;
    
    box.appendChild(div);

    // Remove após 4 segundos (efeito fade out manual para garantir)
    setTimeout(() => { 
        div.style.transition = 'opacity 0.3s';
        div.style.opacity = '0';
        setTimeout(() => div.remove(), 300);
    }, 4000);
}

// =============================================================================
// 5. HISTÓRICO DETALHADO (ESTILO TIMELINE)
// =============================================================================

async function verHistoricoLancamento(perfilId, mesRef) {
    const modal = document.getElementById('modal-historico-lancamento');
    const conteudo = document.getElementById('conteudo-historico');
    modal.classList.add('active');
    conteudo.innerHTML = '<div class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Carregando...</div>';

    try {
        // Aumentado o limit para garantir que não corte os dados antes de filtrar
        const { data: logs, error } = await clienteSupabase
            .from('logs_auditoria')
            .select('*')
            .eq('tabela_afetada', 'diarias_lancamentos')
            .order('data_hora', { ascending: false })
            .limit(1000); 

        if(error) throw error;

        const logsFiltrados = logs.filter(log => {
            // Tenta validar pela chave primária composta (novo padrão que implementamos abaixo)
            if (log.id_registro_afetado === `${perfilId}_${mesRef}`) return true;

            // Fallback para logs antigos (antes desta correção)
            const dados = log.dados_novos || log.dados_antigos;
            
            if (Array.isArray(dados) && dados.length > 0) {
                const item = dados[0];
                if (item.perfil_id !== perfilId) return false; // Filtra motorista
                
                // Filtra também a competência (mês/ano) para não misturar os históricos
                if (item.competencia) {
                    return item.competencia === mesRef;
                } else if (item.data_referencia) {
                    const partes = item.data_referencia.split('-');
                    let ano = parseInt(partes[0]);
                    let mes = parseInt(partes[1]) - 1;
                    if (parseInt(partes[2]) >= 16) {
                        mes++;
                        if(mes > 11) { mes = 0; ano++; }
                    }
                    const calcMesRef = `${ano}-${String(mes+1).padStart(2,'0')}`;
                    return calcMesRef === mesRef;
                }
                return true; 
            }
            return false;
        });

        if (logsFiltrados.length === 0) {
            conteudo.innerHTML = '<div class="text-center p-3 text-muted">Sem histórico disponível.</div>';
            return;
        }

        let html = '<div class="timeline">';
        logsFiltrados.forEach(log => {
            const dataFmt = new Date(log.data_hora).toLocaleString('pt-BR');
            const diffHtml = gerarDiffHtml(log.dados_antigos, log.dados_novos);
            const acaoTxt = log.acao === 'UPDATE_GRID' ? 'ATUALIZADO' : (log.acao === 'INSERT' ? 'CRIADO' : log.acao);
            
            const nomeUsuario = usuariosCache[log.usuario_id] || 'Sistema/Admin';

            html += `
                <div class="timeline-item">
                    <div class="timeline-marker"></div>
                    <div class="timeline-header">
                        ${dataFmt} por <strong>${nomeUsuario}</strong>
                    </div>
                    <div class="timeline-action">Ação: ${acaoTxt}</div>
                    <div class="timeline-diff-box">
                        ${diffHtml}
                    </div>
                </div>
            `;
        });
        html += '</div>';
        conteudo.innerHTML = html;

    } catch (e) {
        conteudo.innerHTML = `<div class="text-danger p-3">Erro: ${e.message}</div>`;
    }
}

function gerarDiffHtml(antigos, novos) {
    // Normalização para Array, caso venha nulo ou objeto solto
    if (!antigos) antigos = [];
    if (!Array.isArray(antigos)) antigos = [antigos];
    
    if (!novos) novos = [];
    if (!Array.isArray(novos)) novos = [novos];

    let html = '';
    
    // 1. Tenta detectar Status Antigo e Novo
    let statusAntigo = 'N/A';
    let statusNovo = 'N/A';

    // Se tem registros, pega o status do primeiro
    if (antigos.length > 0 && antigos[0].status) statusAntigo = antigos[0].status;
    if (novos.length > 0 && novos[0].status) statusNovo = novos[0].status;

    // Se é uma reabertura (Fechado -> Aberto)
    // O 'antigos' vem do banco (Fechado) e 'novos' vem da memória corrigida (Aberto)
    const mudouStatus = (statusAntigo !== 'N/A' && statusNovo !== 'N/A' && statusAntigo !== statusNovo);
    
    // Se é apenas uma finalização (sem dados antigos claros ou log específico)
    const ehFinalizacao = (statusNovo === 'Fechado' && statusAntigo !== 'Fechado');

    if (mudouStatus || ehFinalizacao) {
        let corSeta = statusNovo === 'Aberto' ? '#dc3545' : '#28a745'; 
        let lblAnt = statusAntigo;
        
        // Se for finalização pura, o antigo pode ser 'Aberto' implícito
        if (ehFinalizacao && statusAntigo === 'N/A') lblAnt = 'Aberto';

        html += `<div style="padding: 6px 0; border-bottom: 1px dashed #eee; margin-bottom: 8px; font-weight:bold; font-size: 0.9rem;">
                    <i class="fas fa-info-circle" style="color:#666"></i> Status: 
                    <span class="badge" style="color:#666; border:1px solid #ccc">${lblAnt}</span> 
                    <i class="fas fa-arrow-right" style="color:${corSeta}; margin:0 5px;"></i> 
                    <span class="badge ${statusNovo === 'Aberto' ? 'bg-warning text-dark' : 'bg-success'}">${statusNovo}</span>
                 </div>`;
    }

    // 2. Detalhes dos dias (Grade)
    const diasMap = {};
    // Só processa dias se tiver data_referencia (evita erro com o log resumido de finalização)
    [...antigos, ...novos].forEach(i => {
        if(i.data_referencia) diasMap[i.data_referencia] = true;
    });
    
    let diasAlterados = 0;
    Object.keys(diasMap).sort().forEach(dataIso => {
        const diaNum = dataIso.split('-')[2];
        const ant = antigos.find(a => a.data_referencia === dataIso)?.tipo_consumo || 'Vazio';
        const nov = novos.find(n => n.data_referencia === dataIso)?.tipo_consumo || 'Vazio';
        
        if (ant !== nov) {
            diasAlterados++;
            html += `<span class="diff-line">
                        Dia ${diaNum}: <span class="val-old">${LABELS_TIPO[ant]||ant}</span> 
                        <i class="fas fa-arrow-right diff-arrow"></i> 
                        <span class="val-new">${LABELS_TIPO[nov]||nov}</span>
                     </span>`;
        }
    });

    if (diasAlterados === 0 && !html.includes('Status:')) {
        return '<i>Apenas confirmação ou recálculo (sem alterações visíveis).</i>';
    }

    return html;
}

// =============================================================================
// 6. FUNÇÕES UI GERAIS
// =============================================================================

function tentarFecharModal() {
    if (verificarSeHouveAlteracao()) {
        abrirModalConfirmacao(() => {
            isModalOpen = false;
            document.getElementById('modal-lancamento-calendario').classList.remove('active');
        }, () => {});
    } else {
        isModalOpen = false;
        document.getElementById('modal-lancamento-calendario').classList.remove('active');
    }
}

function abrirModalConfirmacao(onConfirm, onCancel) {
    const modal = document.getElementById('modal-confirmacao-custom');
    modal.classList.add('active'); modal.style.display = 'flex'; 
    window.confirmacaoCallbackSim = () => { modal.style.display = 'none'; modal.classList.remove('active'); if(onConfirm) onConfirm(); };
    window.confirmacaoCallbackNao = () => { modal.style.display = 'none'; modal.classList.remove('active'); if(onCancel) onCancel(); };
}

function fecharConfirmacao(confirmou) {
    if(confirmou && window.confirmacaoCallbackSim) window.confirmacaoCallbackSim();
    else if(!confirmou && window.confirmacaoCallbackNao) window.confirmacaoCallbackNao();
}




function adicionarFiltroDiarias(tipoPreSelecionado = null, valorPreSelecionado = null) {
    const container = document.getElementById('container-filtros-diarias');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row'; 
    div.id = `row-dia-${id}`;
    
    div.innerHTML = `
        <select class="filter-select" id="sel-tipo-${id}" onchange="configurarInputFiltroDiaria(this, '${id}')">
            <option value="" disabled selected>Filtrar por...</option>
            <option value="status">Status</option>
            <option value="motorista">Motorista</option>
            <option value="competencia">Competência</option>
        </select>
        <div id="wrapper-val-dia-${id}" style="display:flex;">
            <input type="text" class="form-control" disabled placeholder="..." style="width: 150px;">
        </div>
        <button class="btn-remove-filter" onclick="this.parentElement.remove(); listarCompetenciasDiarias();"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);

    // [CORREÇÃO] Se vier parâmetros, configura automaticamente
    if (tipoPreSelecionado) {
        const select = document.getElementById(`sel-tipo-${id}`);
        select.value = tipoPreSelecionado;
        // Chama a configuração passando o valor para ser preenchido no input dinâmico
        configurarInputFiltroDiaria(select, id, valorPreSelecionado);
    }
}

function configurarInputFiltroDiaria(sel, id, valorInicial = null) {
    const wrapper = document.getElementById(`wrapper-val-dia-${id}`);
    const tipo = sel.value;
    
    // Tenta preservar valor anterior se o usuário estiver trocando manualmente e não passou valorInicial
    const elAnterior = wrapper.querySelector('select, input');
    const valorAnterior = valorInicial ? valorInicial : (elAnterior ? elAnterior.value : '');

    wrapper.innerHTML = '';
    const inputClass = "form-control form-control-sm border-secondary";
    const styleStr = "min-width: 150px;";

    const triggerChange = () => listarCompetenciasDiarias();

    if(tipo === 'status') {
        const s = document.createElement('select');
        s.className = inputClass; 
        s.style.cssText = styleStr;
        s.onchange = triggerChange;
        s.innerHTML = `
            <option value="">Todos</option>
            <option value="Aberto">Aberto</option>
            <option value="Fechado">Fechado</option>
        `;
        if(valorAnterior) s.value = valorAnterior;
        wrapper.appendChild(s);
    } 
    else if (tipo === 'competencia') {
        const i = document.createElement('input');
        i.type = 'month'; 
        i.className = inputClass; 
        i.style.cssText = styleStr;
        i.onchange = triggerChange;
        
        // [CORREÇÃO] Aplica o valor padrão calculado
        if(valorAnterior) i.value = valorAnterior;
        
        wrapper.appendChild(i);
    } 
    else if (tipo === 'motorista') {
        const s = document.createElement('select');
        s.className = inputClass; 
        s.style.cssText = styleStr;
        s.onchange = triggerChange;

        const unidadeRodape = document.getElementById('sel-unidade')?.value;
        let lista = motoristasCache;

        if (unidadeRodape && unidadeRodape !== 'TODAS' && unidadeRodape !== 'ALL') {
            lista = lista.filter(m => String(m.unidade_id) === String(unidadeRodape));
        }

        lista.sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));

        s.innerHTML = '<option value="">Todos da Unidade</option>';
        lista.forEach(m => {
            const isSelected = String(m.id) === String(valorAnterior) ? 'selected' : '';
            s.innerHTML += `<option value="${m.id}" ${isSelected}>${m.nome_completo}</option>`;
        });
        
        wrapper.appendChild(s);
    }
}

function calcularTotaisCache() {
    const stats = {};
    const tipos = Object.keys(LABELS_TIPO);
    tipos.forEach(t => stats[t] = { qtd: 0, valor: 0 });
    let totalGeral = 0;
    lancamentosMesCache.forEach(l => {
        const t = l.tipo_consumo;
        if (stats[t]) { stats[t].qtd++; stats[t].valor += parseFloat(l.valor_dia || 0); }
        totalGeral += parseFloat(l.valor_dia || 0);
    });
    const container = document.getElementById('container-totais-dinamicos');
    container.innerHTML = `
        <div class="stat-box financeiro">
            <span class="stat-lbl">TOTAL PAGAR</span>
            <span class="stat-val" style="color:#155724;">${totalGeral.toLocaleString('pt-BR', {style:'currency', currency:'BRL'})}</span>
        </div>
    `;
    tipos.forEach(t => {
        if (stats[t].qtd > 0) {
            const valStr = stats[t].valor > 0 ? stats[t].valor.toLocaleString('pt-BR', {style:'currency', currency:'BRL'}) : '';
            container.innerHTML += `
                <div class="stat-box has-value">
                    <span class="stat-lbl">${LABELS_TIPO[t]}</span>
                    <span class="stat-val">${stats[t].qtd}</span>
                    ${valStr ? `<span class="stat-money">${valStr}</span>` : ''}
                </div>
            `;
        }
    });
}

function fecharModalCalendario() { tentarFecharModal(); }
function traduzirDiaSemana(diaIdx) { return ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'][diaIdx]; }

// =============================================================================
// FUNÇÃO DE FINALIZAÇÃO
// =============================================================================


// 1. Função chamada pelo botão da tabela (Entry Point)
function finalizarCompetencia(perfilId, mesRef) {
    tempPerfilIdFinalizar = perfilId;
    tempMesRefFinalizar = mesRef;

    const modal = document.getElementById('modal-confirmacao-finalizar');
    if(modal) {
        modal.classList.add('active');
        modal.style.display = 'flex';
    }
}

// 2. Função para fechar o modal
function fecharModalFinalizar() {
    const modal = document.getElementById('modal-confirmacao-finalizar');
    if(modal) {
        modal.classList.remove('active');
        setTimeout(() => { modal.style.display = 'none'; }, 200); // Aguarda fade se houver CSS transition
    }
    // Limpa variáveis por segurança
    tempPerfilIdFinalizar = null;
    tempMesRefFinalizar = null;
}

// 3. Função que EXECUTA a ação (Chamada pelo botão "Confirmar" do modal)
async function executarFinalizacao() {
    if (!tempPerfilIdFinalizar || !tempMesRefFinalizar) {
        fecharModalFinalizar();
        return;
    }

    try {
        const perfilId = tempPerfilIdFinalizar;
        const mesRef = tempMesRefFinalizar;

        const [anoStr, mesStr] = mesRef.split('-');
        const ano = parseInt(anoStr);
        const mes = parseInt(mesStr) - 1; 
        const dtIni = new Date(ano, mes - 1, 16);
        const dtFim = new Date(ano, mes, 15);
        const isoIni = dtIni.toISOString().split('T')[0];
        const isoFim = dtFim.toISOString().split('T')[0];

        // 1. Busca lançamentos para validar preenchimento
        const { data: lancamentos, error: errBusca } = await clienteSupabase
            .from('diarias_lancamentos')
            .select('data_referencia')
            .eq('perfil_id', perfilId)
            .gte('data_referencia', isoIni)
            .lte('data_referencia', isoFim);

        if (errBusca) throw errBusca;

        // 2. Verifica dias faltantes
        let diasFaltantes = [];
        let loop = new Date(dtIni);
        while (loop <= dtFim) {
            const isoLoop = loop.toISOString().split('T')[0];
            const achou = lancamentos.some(l => l.data_referencia === isoLoop);
            if (!achou) {
                diasFaltantes.push(loop.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}));
            }
            loop.setDate(loop.getDate() + 1);
        }

        // 3. Alerta de dias vazios personalizado (SUBSTITUI O CONFIRM NATIVO)
        if (diasFaltantes.length > 0) {
            fecharModalFinalizar(); // Fecha o modal de confirmação anterior
            
            const msg = `Identificamos que os dias <b>[${diasFaltantes.join(', ')}]</b> estão sem preenchimento.`;
            document.getElementById('msg-corpo-alerta-vazios').innerHTML = msg;
            
            const modalAlerta = document.getElementById('modal-alerta-vazios');
            modalAlerta.classList.add('active');
            modalAlerta.style.display = 'flex';

            // Define o que fazer após a escolha do usuário no modal
            callbackAlertaVazios = async (prosseguir) => {
                if (prosseguir) {
                    await finalizarRegistroNoBanco(perfilId, isoIni, isoFim, mesRef);
                }
            };
            return; // Interrompe para aguardar a interação do usuário no novo modal
        }

        // 4. Se não houver dias faltantes, finaliza direto
        await finalizarRegistroNoBanco(perfilId, isoIni, isoFim, mesRef);

    } catch (e) {
        console.error(e);
        exibirToastLancamento("Erro ao processar finalização.", "error");
        fecharModalFinalizar();
    }
}

// Função auxiliar para fechar o modal de alerta e executar o callback
window.fecharAlertaVazios = function(confirmou) {
    const modal = document.getElementById('modal-alerta-vazios');
    modal.classList.remove('active');
    setTimeout(() => { modal.style.display = 'none'; }, 200);
    
    if (callbackAlertaVazios) {
        callbackAlertaVazios(confirmou);
        callbackAlertaVazios = null;
    }
};

// Função isolada para gravar o fechamento no banco (para não repetir código)
async function finalizarRegistroNoBanco(perfilId, isoIni, isoFim, mesRef) {
    try {
        // Tira uma foto dos dados ANTES de atualizar para o status "Fechado"
        const { data: oldData } = await clienteSupabase
            .from('diarias_lancamentos')
            .select('*')
            .eq('perfil_id', perfilId)
            .gte('data_referencia', isoIni)
            .lte('data_referencia', isoFim);

        const { error: errUpd } = await clienteSupabase
            .from('diarias_lancamentos')
            .update({ status: 'Fechado' })
            .eq('perfil_id', perfilId)
            .gte('data_referencia', isoIni)
            .lte('data_referencia', isoFim);

        if (errUpd) throw errUpd;

        const { data: { user } } = await clienteSupabase.auth.getUser();
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'diarias_lancamentos',
            id_registro_afetado: `${perfilId}_${mesRef}`,
            acao: 'UPDATE_STATUS',
            usuario_id: user?.id,
            dados_antigos: oldData, // <--- INJEÇÃO DOS DADOS ANTIGOS
            dados_novos: [{ status: 'Fechado', perfil_id: perfilId, competencia: mesRef }],
            data_hora: new Date().toISOString()
        }]);

        fecharModalFinalizar();

        exibirToastLancamento("Competência finalizada com sucesso!", "success");
        listarCompetenciasDiarias();
    } catch (e) {
        console.error(e);
        exibirToastLancamento("Erro ao gravar fechamento.", "error");
    }
}

window.recalcularTudoPorSwitch = function() {
    const motoristaId = document.getElementById('input-calendario-motorista').value;
    if (!motoristaId) return;

    const chk = document.getElementById('chk-pagar-folga-atestado');
    const pagarEspeciais = chk.checked;

    // Atualiza a flag de exceção em todos os itens do cache local imediatamente
    lancamentosMesCache.forEach(l => {
        l.gera_financeiro_excecao = pagarEspeciais;
    });

    const selects = document.querySelectorAll('.select-dia');
    selects.forEach(sel => {
        const tipo = sel.value;
        // [CORREÇÃO 2] Verifica os tipos e usa o dataset.iso em vez de regex
        if (tipo === 'folga' || tipo === 'atestado') {
            const dataIso = sel.dataset.iso; // Lê o atributo seguro que adicionamos
            if (dataIso) {
                atualizarCacheLocal(dataIso, sel);
            }
        }
    });

    const msg = pagarEspeciais 
        ? "Regra aplicada: Folga/Atestado agora geram valor de Refeição." 
        : "Regra removida: Folga/Atestado não geram mais valor.";
    exibirToastLancamento(msg, "warning");
};

// =============================================================================
// GERAÇÃO DE PAPELETA E ARQUIVAMENTO
// =============================================================================

function gerarPapeletaJornada() {
    // 1. DADOS
    const motoristaId = document.getElementById('input-calendario-motorista').value;
    const mesAno = document.getElementById('input-calendario-mes').value;

    if (!motoristaId || !mesAno) {
        exibirToastLancamento("Selecione Motorista e Competência.", "warning");
        return;
    }

    const motorista = motoristasCache.find(m => m.id == motoristaId);
    const nomeMot = motorista ? motorista.nome_completo : 'Desconhecido';
    
    let matricula = (motorista && motorista.matricula) ? motorista.matricula : '________________';

    const unidData = unidadesCache[motorista.unidade_id] || { nome: '-', cidade: 'Cidade', uf: 'UF' };
    const cidadeUf = (unidData.cidade && unidData.uf) ? `${unidData.cidade}/${unidData.uf}` : 'Unidade Base';

    const [anoStr, mesStr] = mesAno.split('-');
    const ano = parseInt(anoStr);
    const mes = parseInt(mesStr) - 1;
    const dtIni = new Date(ano, mes - 1, 16);
    const dtFim = new Date(ano, mes, 15);
    
    const periodoTxt = `${dtIni.getDate().toString().padStart(2,'0')}/${(dtIni.getMonth()+1).toString().padStart(2,'0')}/${dtIni.getFullYear()} a ${dtFim.getDate().toString().padStart(2,'0')}/${(dtFim.getMonth()+1).toString().padStart(2,'0')}/${dtFim.getFullYear()}`;
    const competenciaTxt = `${mesStr}/${anoStr}`;

    // Logo
    const imgLogoElement = document.querySelector('.sidebar-header img') || document.querySelector('.logo img') || document.querySelector('img');
    const logoUrl = imgLogoElement ? imgLogoElement.src : '';
    const imgTag = logoUrl ? `<img src="${logoUrl}" alt="Logo" style="height: 38px; object-fit: contain;">` : ``;

    // 2. GERAR LINHAS
    let linhasHtml = '';
    let linhasRefeicaoHtml = '';
    let loop = new Date(dtIni);
    const diasSemana = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SÁB'];

    const mask = `<span style="color:#e0e0e0; font-size:9px;">__:__</span>`;

    while (loop <= dtFim) {
        const dia = loop.getDate().toString().padStart(2,'0');
        const mesLoop = (loop.getMonth()+1).toString().padStart(2,'0');
        const sem = diasSemana[loop.getDay()];
        
        const isFim = loop.getDay() === 0 || loop.getDay() === 6;
        const bg = isFim ? 'background-color: #e8e8e8;' : '';
        
        // Data Monospace para alinhamento vertical perfeito
        const dataFormatada = `<span style="font-family: 'Courier New', monospace; font-weight: bold; font-size: 10px;">${dia}/${mesLoop}</span> <span style="font-size:8px;">${sem}</span>`;

        linhasHtml += `
            <tr style="${bg}">
                <td style="padding-left: 5px; white-space: nowrap;">${dataFormatada}</td>
                <td></td>
                <td style="text-align:center;">${mask}</td>
                <td></td>
                <td style="text-align:center;">${mask}</td> <td style="text-align:center;">${mask}</td>
                <td style="text-align:center;">${mask}</td> <td style="text-align:center;">${mask}</td>
                <td style="text-align:center;">${mask}</td> <td style="text-align:center;">${mask}</td>
                <td style="text-align:center;">${mask}</td>
                <td></td>
            </tr>`;

        linhasRefeicaoHtml += `
            <tr style="${bg}">
                <td style="padding-left: 5px;">${dataFormatada}</td>
                <td></td>
                <td style="text-align:center;"><div class="box-check"></div></td>
                <td style="text-align:center;"><div class="box-check"></div></td>
                <td></td>
            </tr>`;

        loop.setDate(loop.getDate() + 1);
    }

    // 3. MONTAR PDF
    const win = window.open('', '', 'width=1200,height=900');
    
    win.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
        <title>Papeleta_${nomeMot}</title>
        <style>
            @page { size: A4 landscape; margin: 5mm; }
            
            body { 
                margin: 0; padding: 0; 
                font-family: 'Segoe UI', Arial, sans-serif; font-size: 10px; color: #333; 
                -webkit-print-color-adjust: exact; 
            }
            
            .page-container {
                width: 100%; height: 198mm;
                display: flex; flex-direction: column;
                page-break-after: always; position: relative; overflow: hidden;
            }
            .page-container:last-child { page-break-after: auto; }

            /* CABEÇALHO */
            .header-bar { 
                background-color: #003366; 
                color: white; 
                height: 42px; 
                display: flex; 
                align-items: center; 
                border: 1px solid #000;
                padding-right: 10px;
                overflow: hidden;
            }

            .logo-container {
                background-color: white;
                height: 100%;
                width: 160px;
                display: flex;
                align-items: center;
                justify-content: center;
                margin-right: 0;
                border-right: 1px solid #000;
            }

            .header-title {
                flex: 1;
                text-align: center;
                font-size: 22px;
                font-weight: 900;
                text-transform: uppercase;
                letter-spacing: 2px;
                padding-top: 2px;
            }
            
            .header-right {
                text-align: right;
                font-size: 9px;
                line-height: 1.2;
                font-weight: normal;
                min-width: 150px;
            }

            /* INFO BAR */
            .info-bar {
                display: flex;
                border: 1px solid #666;
                border-top: none;
                background-color: #f0f0f0;
                height: 32px;
                margin-bottom: 2px;
            }
            .info-col {
                border-right: 1px solid #666;
                padding: 2px 8px;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }
            .info-col:last-child { border-right: none; }
            .lbl { font-size: 7px; text-transform: uppercase; color: #555; font-weight: bold; line-height: 1; margin-bottom: 2px; }
            .val { font-size: 11px; font-weight: bold; color: #000; line-height: 1; white-space: nowrap; overflow: hidden; }

            /* TABELA */
            .table-wrapper {
                flex: 1;
                border: 1px solid #666;
                display: flex;
                flex-direction: column;
            }
            table { width: 100%; height: 100%; border-collapse: collapse; table-layout: fixed; }
            
            thead th {
                background-color: #ccc; color: #000;
                border: 1px solid #666; font-size: 9px; font-weight: bold;
                text-align: center; height: 24px; padding: 0;
            }
            tbody td { border: 1px solid #999; padding: 0; vertical-align: middle; }

            /* PROPORÇÕES */
            .col-dia   { width: 6%; text-align: left; }
            .col-placa { width: 8%; } 
            .col-km    { width: 6%; }
            .col-time  { width: 9.2%; text-align: center; font-weight: bold; }

            /* RODAPÉ */
            .footer {
                height: 45px; margin-top: 5px;
                display: flex; justify-content: flex-end; align-items: flex-end;
            }
            .sig-area { width: 350px; text-align: center; }
            .sig-line { border-top: 1px solid #000; padding-top: 5px; font-size: 12px; font-weight: bold; text-transform: uppercase; }
            
            /* ESPAÇAMENTO DATA AUMENTADO */
            .date-area { margin-right: 150px; font-style: italic; font-size: 11px; padding-bottom: 5px; }
            
            .box-check { width: 10px; height: 10px; border: 1px solid #000; margin: 0 auto; }

            @media print { .no-print { display: none; } }
        </style>
    </head>
    <body>

        <div class="page-container">
            <div class="header-bar">
                <div class="logo-container">${imgTag}</div>
                <div class="header-title">CONTROLE DE JORNADA</div>
                <div class="header-right">
                    Pág. 1/2
                </div>
            </div>

            <div class="info-bar">
                <div class="info-col" style="flex:2"><span class="lbl">Motorista</span><span class="val">${nomeMot}</span></div>
                <div class="info-col" style="width: 100px;"><span class="lbl">Matrícula</span><span class="val">${matricula}</span></div>
                <div class="info-col" style="flex:1"><span class="lbl">Base / Unidade</span><span class="val">${cidadeUf}</span></div>
                <div class="info-col" style="flex:1.5; background-color: #e6e6e6;">
                    <span class="lbl">Competência (Ciclo)</span>
                    <span class="val">${competenciaTxt} (${periodoTxt})</span>
                </div>
            </div>

            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th class="col-dia" rowspan="2" style="padding-left:5px;">DIA</th>
                            <th class="col-placa" rowspan="2">PLACA</th>
                            <th class="col-time" rowspan="2">INÍCIO</th>
                            <th class="col-km" rowspan="2">KM INICIAL</th>
                            <th colspan="2">DESCANSO</th>
                            <th colspan="2">REFEIÇÃO</th>
                            <th colspan="2">DESCANSO</th>
                            <th class="col-time" rowspan="2">FIM</th>
                            <th class="col-km" rowspan="2">KM FINAL</th>
                        </tr>
                        <tr>
                            <th class="col-time">INÍCIO</th><th class="col-time">FIM</th>
                            <th class="col-time">INÍCIO</th><th class="col-time">FIM</th>
                            <th class="col-time">INÍCIO</th><th class="col-time">FIM</th>
                        </tr>
                    </thead>
                    <tbody>${linhasHtml}</tbody>
                </table>
            </div>
            <div style="height: 5px;"></div>
        </div>

        <div class="page-container">
            <div class="header-bar">
                <div class="logo-container">${imgTag}</div>
                <div class="header-title">DIÁRIAS E REFEIÇÕES</div>
                <div class="header-right">
                    Pág. 2/2
                </div>
            </div>

            <div class="info-bar">
                <div class="info-col" style="flex:2"><span class="lbl">Motorista</span><span class="val">${nomeMot}</span></div>
                <div class="info-col" style="width: 100px;"><span class="lbl">Matrícula</span><span class="val">${matricula}</span></div>
                <div class="info-col" style="flex:1"><span class="lbl">Base / Unidade</span><span class="val">${cidadeUf}</span></div>
                <div class="info-col" style="flex:1.5; background-color: #e6e6e6;">
                    <span class="lbl">Competência (Ciclo)</span>
                    <span class="val">${competenciaTxt} (${periodoTxt})</span>
                </div>
            </div>

            <div class="table-wrapper">
                <table>
                    <thead>
                        <tr>
                            <th style="width: 10%; text-align: left; padding-left: 5px;">DATA</th>
                            <th style="width: 12%;">PLACA</th>
                            <th style="width: 8%;">REFEIÇÃO</th>
                            <th style="width: 8%;">DIÁRIA</th>
                            <th>OBSERVAÇÕES / JUSTIFICATIVAS / OCORRÊNCIAS</th>
                        </tr>
                    </thead>
                    <tbody>${linhasRefeicaoHtml}</tbody>
                </table>
            </div>

            <div class="footer">
                <div class="date-area">Data: _____ / _____ / __________</div>
                <div class="sig-area">
                    <div class="sig-line">${nomeMot}</div>
                </div>
            </div>
        </div>

    </body>
    </html>`);
    
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 500);
}

// Lógica de Upload (Cópia adaptada para bucket 'jornada')
async function processarUploadJornada(input) {
    if (!input.files || !input.files[0]) return;

    const motoristaId = document.getElementById('input-calendario-motorista').value;
    const mesAno = document.getElementById('input-calendario-mes').value;

    // 1. Validação
    if (!motoristaId || !mesAno) {
        exibirToastLancamento("Erro: Motorista ou Competência não selecionados.", "error");
        input.value = '';
        return;
    }

    if (!lancamentosMesCache || lancamentosMesCache.length === 0) {
        exibirToastLancamento("Você precisa salvar os dias da grade antes de anexar o documento.", "warning");
        input.value = '';
        return;
    }

    const btn = document.getElementById('btn-upload-jornada');
    const conteudoOriginalBtn = btn.innerHTML;
    let file = input.files[0];

    // Trava botão para evitar duplo clique
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    btn.disabled = true;

    try {
        // 2. Upload para o Storage
        const fileExt = file.name.split('.').pop();
        // Nome único para evitar cache do navegador: ID_ANO-MES_TIMESTAMP
        const nomeArq = `jornada_${motoristaId}_${mesAno}_${Date.now()}.${fileExt}`;
        
        const { error: uploadError } = await clienteSupabase
            .storage
            .from('jornada')
            .upload(nomeArq, file, { upsert: true });

        if (uploadError) throw uploadError;

        // 3. Obter Link Público
        const { data: { publicUrl } } = clienteSupabase
            .storage
            .from('jornada')
            .getPublicUrl(nomeArq);

        // 4. Salvar Link no Banco IMEDIATAMENTE (Update Localizado)
        // Calculamos as datas para afetar somente este mês
        const [anoStr, mesStr] = mesAno.split('-');
        let anoFim = parseInt(anoStr);
        let mesFim = parseInt(mesStr);
        let anoIni = anoFim;
        let mesIni = mesFim - 1;
        if (mesIni === 0) { mesIni = 12; anoIni--; }

        const isoIni = `${anoIni}-${String(mesIni).padStart(2,'0')}-16`;
        const isoFim = `${anoFim}-${String(mesFim).padStart(2,'0')}-15`;

        const { error: dbError } = await clienteSupabase
            .from('diarias_lancamentos')
            .update({ jornada_url: publicUrl }) // Grava o link
            .eq('perfil_id', motoristaId)
            .gte('data_referencia', isoIni)
            .lte('data_referencia', isoFim);

        if (dbError) throw dbError;

        // 5. Atualizar Memória Local (CRUCIAL)
        // Isso garante que se você clicar em "Salvar Lançamento" depois, ele NÃO vai apagar o link
        lancamentosMesCache.forEach(l => l.jornada_url = publicUrl);
        // Atualiza o "Estado Original" para o sistema não achar que tem alterações pendentes só por causa do anexo
        estadoOriginalJSON = JSON.stringify(lancamentosMesCache);

        // 6. Atualizar Botões na Tela
        exibirToastLancamento("Arquivo anexado e salvo com sucesso!", "success");
        if (typeof atualizarBotoesJornada === 'function') {
            atualizarBotoesJornada(publicUrl, false);
        }

    } catch (e) {
        console.error("Erro upload:", e);
        exibirToastLancamento("Erro ao enviar: " + e.message, "error");
        btn.innerHTML = conteudoOriginalBtn;
    } finally {
        btn.disabled = false;
        input.value = '';
    }
}
// Caso a função comprimirImagem não esteja no escopo global, adicione-a aqui também:
async function comprimirImagem(file) {
    if (!file.type.match(/image.*/)) return file;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const maxWidth = 1200; 
                const maxHeight = 1200;
                let width = img.width;
                let height = img.height;
                if (width > height) {
                    if (width > maxWidth) { height *= maxWidth / width; width = maxWidth; }
                } else {
                    if (height > maxHeight) { width *= maxHeight / height; height = maxHeight; }
                }
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", { type: 'image/jpeg', lastModified: Date.now() });
                    resolve(newFile);
                }, 'image/jpeg', 0.7);
            };
        };
        reader.onerror = (err) => reject(err);
    });
}

function atualizarBotoesJornada(url, readonly = false) {
    const btnUpload = document.getElementById('btn-upload-jornada');
    const btnVer = document.getElementById('btn-ver-jornada');
    
    // 1. Controle de Bloqueio (Readonly)
    if (btnUpload) {
        btnUpload.disabled = readonly;
        // Se estiver bloqueado, muda o cursor para indicar
        btnUpload.style.cursor = readonly ? 'not-allowed' : 'pointer';
        btnUpload.style.opacity = readonly ? '0.6' : '1';
    }

    if (url) {
        // Modo: Arquivo Existe
        if (btnUpload) {
            btnUpload.innerHTML = '<i class="fas fa-sync-alt"></i> <span>Alterar Arq.</span>';
            btnUpload.title = readonly ? "Edição bloqueada" : "Substituir arquivo existente";
        }
        if (btnVer) {
            btnVer.style.display = 'inline-flex';
            btnVer.dataset.url = url; 
        }
    } else {
        // Modo: Sem Arquivo
        if (btnUpload) {
            btnUpload.innerHTML = '<i class="fas fa-paperclip"></i> <span>Anexar Jornada</span>';
            btnUpload.title = readonly ? "Edição bloqueada" : "Anexar documento assinado";
        }
        if (btnVer) {
            btnVer.style.display = 'none';
            btnVer.dataset.url = '';
        }
    }
}

function visualizarJornadaAnexada() {
    const btn = document.getElementById('btn-ver-jornada');
    const url = btn.dataset.url;
    if (url) window.open(url, '_blank');
}