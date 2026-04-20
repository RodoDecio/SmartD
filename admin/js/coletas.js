/* =========================================================
   GESTÃO DE COLETAS DE COMBUSTÍVEL
========================================================= */

let listaColetasGlobal = [];
let formColetaSujo = false;
let dadosOriginaisColeta = null;
let carretasAtuais = []; 
let itensCargaGlobal = [];
let indiceEdicaoCarga = null;

// =============================================================================
// 1. INICIALIZAÇÃO
// =============================================================================

window.inicializarColetas = async function() {
    // 1. Título Global
    const tituloGlobal = document.getElementById('titulo-pagina') || document.querySelector('.page-title');
    if(tituloGlobal) {
        tituloGlobal.innerText = 'Coletas de Combustível';
    }

    // 2. Configuração do Formulário
    const form = document.getElementById('form-coleta');
    if(form) {
        const newForm = form.cloneNode(true);
        form.parentNode.replaceChild(newForm, form);
        
        // Listener de Submit (Salvar)
        newForm.addEventListener('submit', function(e) {
            e.preventDefault(); 
            e.stopPropagation();
            salvarColeta(e);
        });

        // Listener de "Dirty Check"
        newForm.addEventListener('input', () => { formColetaSujo = true; });
        newForm.addEventListener('change', () => { formColetaSujo = true; });

        // --- CORREÇÃO DO ERRO DE ABA OCULTA ---
        // Escuta o evento 'invalid' na fase de captura (true)
        // Isso dispara quando o navegador detecta um campo required vazio
        newForm.addEventListener('invalid', function(e) {
            e.preventDefault(); // Impede o navegador de tentar focar num elemento invisível (evita o erro do console)
            
            const campoInvalido = e.target;
            
            // Descobre em qual aba o campo está (procura o pai com id content-col-...)
            const abaPai = campoInvalido.closest('div[id^="content-col-"]');
            
            if (abaPai) {
                // Extrai o nome da aba (ex: 'geral', 'tanque', 'obs')
                const idAba = abaPai.id.replace('content-col-', '');
                
                // Abre a aba correta
                alternarAbaColeta(idAba);
                
                // Dá um pequeno delay para a aba renderizar e foca no campo erro
                setTimeout(() => {
                    campoInvalido.focus();
                    // Efeito visual de "tremida" ou destaque (opcional)
                    campoInvalido.classList.add('input-error-flash');
                    setTimeout(() => campoInvalido.classList.remove('input-error-flash'), 500);
                }, 100);

                // Feedback visual para o usuário
                let nomeAbaAmigavel = 'Dados Gerais';
                if (idAba === 'tanque') nomeAbaAmigavel = 'Tanque';
                if (idAba === 'obs') nomeAbaAmigavel = 'Observações';

                mostrarToast(`Atenção: Preencha os campos obrigatórios na aba ${nomeAbaAmigavel}`, "warning");
            }
        }, true);
    }

    // 3. Inicializa Filtro
    const container = document.getElementById('container-filtros-coletas');
    if (container) {
        container.innerHTML = '';
        adicionarFiltroColeta(); 
    }

    await listarColetas();
};

// =============================================================================
// 2. LISTAGEM E FILTROS
// =============================================================================

window.listarColetas = async function() {
    const loading = document.getElementById('loading-coletas');
    const tbody = document.getElementById('tbody-coletas');
    
    if (loading) loading.style.display = 'flex';
    if (tbody) tbody.innerHTML = '';

    try {
        const unidadeRodape = document.getElementById('sel-unidade')?.value || "TODAS";

        // GARANTIA: Ordenando pelo novo campo de Timestamp
        let query = clienteSupabase
            .from('coletas_combustivel')
            .select(`
                *,
                perfis:motorista_id (nome_completo),
                unidades:unidade_id (nome)
            `)
            .order('data_hora_inicio', { ascending: false }); // Falses: Mais novos/futuros primeiro

        if (unidadeRodape !== 'TODAS') {
            query = query.eq('unidade_id', unidadeRodape);
        }

        const { data, error } = await query;
        if (error) throw error;

        listaColetasGlobal = data || [];
        
        // Dispara o filtro que agora também garante a ordem no navegador
        aplicarFiltrosColeta();
        repopularFiltrosColeta();

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao carregar coletas.", "error");
    } finally {
        if (loading) loading.style.display = 'none';
    }
};

window.aplicarFiltrosColeta = function() {
    const container = document.getElementById('container-filtros-coletas');
    let dados = [...listaColetasGlobal];
    let descricoesFiltros = []; // Array para armazenar as legendas dos filtros

    if (container) {
        const linhas = container.querySelectorAll('.filter-row-coleta');
        linhas.forEach(linha => {
            const selectTipo = linha.querySelector('select');
            if (!selectTipo) return;
            
            const tipo = selectTipo.value;
            const labelTipo = selectTipo.options[selectTipo.selectedIndex].text;

            const input = linha.querySelector('.input-filtro-coleta');
            if (!input || !input.value) return;

            const valor = input.value;
            const valorMin = valor.toLowerCase();
            
            // --- CAPTURA O TEXTO PARA A LEGENDA DA BARRA ---
            let valorDisplay = valor;
            if (input.tagName === 'SELECT' && input.selectedIndex >= 0) {
                valorDisplay = input.options[input.selectedIndex].text;
            } else if (input.type === 'date') {
                const parts = valor.split('-');
                if (parts.length === 3) valorDisplay = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }

            if (valorMin === 'todos' || valor === '') return;

            // Adiciona à lista de descrições visuais
            descricoesFiltros.push(`<b>${labelTipo}:</b> ${valorDisplay}`);

            // --- LÓGICA DE FILTRAGEM ---
            if (tipo === 'data') {
                dados = dados.filter(d => {
                    const dataReg = d.data_hora_inicio || d.data_coleta;
                    return dataReg ? dataReg.split('T')[0] === valor : false;
                });
            } 
            else if (tipo === 'status') {
                dados = dados.filter(d => (d.status || '').toLowerCase() === valorMin);
            } 
            else if (tipo === 'motorista') {
                dados = dados.filter(d => (d.perfis?.nome_completo || '').toLowerCase().includes(valorMin));
            } 
            else if (tipo === 'placa') {
                dados = dados.filter(d => (d.placa_cavalo || '').toLowerCase().includes(valorMin));
            } 
            else if (tipo === 'combustivel') {
                dados = dados.filter(d => 
                    d.itens_carga?.some(item => (item.combustivel || '').toLowerCase() === valorMin)
                );
            }
        });
    }

    // --- ATUALIZAÇÃO DA BARRA DE STATUS (LADO DIREITO) ---
    const lblContagem = document.getElementById('lbl-contagem-coletas');
    if (lblContagem) lblContagem.innerText = `Exibindo ${dados.length} registro(s)`;

    const lblFiltros = document.getElementById('lbl-filtros-ativos-coleta');
    if (lblFiltros) {
        if (descricoesFiltros.length > 0) {
            // Aplica a cor azul padrão para destacar os filtros ativos
            lblFiltros.innerHTML = `<i class="fas fa-filter" style="color: #003399; margin-right:5px;"></i> ${descricoesFiltros.join(' <span style="margin:0 5px; color:#ccc;">|</span> ')}`;
        } else {
            lblFiltros.innerHTML = '<i>Mostrando todos os registros</i>';
        }
    }

    // Ordenação Cronológica e Renderização
    dados.sort((a, b) => {
        const dataA = new Date(a.data_hora_inicio || a.data_coleta || 0);
        const dataB = new Date(b.data_hora_inicio || b.data_coleta || 0);
        return dataB - dataA;
    });

    renderizarTabelaColetas(dados);
};

window.renderizarTabelaColetas = function(lista) {
    const tbody = document.getElementById('tbody-coletas');
    tbody.innerHTML = '';

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted p-3">Nenhuma coleta encontrada.</td></tr>';
        return;
    }

    lista.forEach(item => {
        // 1. FORMATAÇÃO VISUAL (Data/Hora)
        let dtExibicao = '-';
        const dataReferencia = item.data_hora_inicio || item.data_coleta;

        if (dataReferencia) {
            try {
                // Quebra a string manualmente para garantir exibição correta
                const [dataParte, horaParteFull] = dataReferencia.split('T');
                const [ano, mes, dia] = dataParte.split('-');
                const horaParte = horaParteFull ? horaParteFull.slice(0, 5) : '00:00';
                
                dtExibicao = `
                    <div style="line-height: 1.2;">
                        <span style="font-weight: 500;">${dia}/${mes}/${ano}</span><br>
                        <small style="font-size: 0.75rem; color: #888; font-weight: normal;">${horaParte}</small>
                    </div>
                `;
            } catch (e) {
                dtExibicao = dataReferencia; 
            }
        }
        
        // =========================================================================
        // 2. LÓGICA VISUAL DE STATUS (CORRIGIDA)
        // =========================================================================
        let statusHtml = '';
        const isEntregue = item.status === 'Entregue';
        
        if (isEntregue) {
            let infoEntrega = '';
            if (item.data_entrega) {
                const [dE, hEFull] = item.data_entrega.split('T');
                const [aE, mE, dE2] = dE.split('-');
                const hE = hEFull ? hEFull.slice(0, 5) : '';
                infoEntrega = `${dE2}/${mE}/${aE} ${hE}`;
            }
            statusHtml = `
                <div style="line-height:1;">
                    <span class="badge" style="background:#28a745; color:white; display:inline-block;">ENTREGUE</span><br>
                    <small style="font-size: 0.65rem; color: #888;">${infoEntrega}</small>
                </div>`;

        } else if (item.status === 'Agendado') {
            // --- CORREÇÃO DO FUSO HORÁRIO AQUI ---
            let isEmTransito = false;
            
            if (item.data_hora_inicio) {
                const agora = new Date();
                
                // Parse manual para criar a data no Horário Local do Usuário
                // Isso garante que 14:00 seja 14:00 no relógio do computador, e não UTC
                try {
                    const [dPart, tPart] = item.data_hora_inicio.split('T');
                    const [y, m, d] = dPart.split('-').map(Number);
                    const [h, min] = tPart.split(':').map(Number);
                    
                    // new Date(ano, mês-1, dia, hora, min) cria data local
                    const dataAgendadaLocal = new Date(y, m - 1, d, h, min, 0);

                    if (agora > dataAgendadaLocal) {
                        isEmTransito = true;
                    }
                } catch(e) {
                    console.error("Erro ao processar data para status", e);
                }
            }

            if (isEmTransito) {
                statusHtml = `<span class="badge" style="background:#ffc107; color:#333; white-space:nowrap;">EM TRÂNSITO</span>`;
            } else {
                statusHtml = `<span class="badge" style="background:#17a2b8; color:white; white-space:nowrap;">AGENDADO</span>`;
            }

        } else {
            // Status já é 'Em Trânsito' salvo no banco ou outro status
            statusHtml = `<span class="badge" style="background:#ffc107; color:#333; white-space:nowrap;">EM TRÂNSITO</span>`;
        }
        // =========================================================================

        // 3. Barra de Progresso
        const pct = item.percentual_carregamento || 0;
        const pctFormatado = parseFloat(pct).toFixed(2).replace('.', ',');
        const barColor = pct > 95 ? '#dc3545' : (pct > 80 ? '#28a745' : '#17a2b8');
        
        const progressHtml = `
            <div style="display:flex; align-items:center; gap:5px; justify-content: center;">
                <div style="width:50px; height:6px; background:#eee; border-radius:3px; overflow:hidden;">
                    <div style="width:${pct}%; height:100%; background:${barColor};"></div>
                </div>
                <span style="font-size:0.75rem; font-weight:bold;">${pctFormatado}%</span>
            </div>
        `;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dtExibicao}</td>
            <td>${item.perfis?.nome_completo || '-'}</td>
            <td><strong style="color:var(--cor-primaria);">${item.placa_cavalo || '-'}</strong></td>
            <td>${progressHtml}</td>
            <td>${item.unidades?.nome || '-'}</td>
            <td>${statusHtml}</td>
            <td style="text-align:center; white-space:nowrap;">
                <button class="action-btn" onclick="abrirModalColeta('${item.id}', true)" title="Visualizar">
                    <i class="fas fa-eye" style="color:var(--cor-primaria)"></i>
                </button>
                <button class="action-btn" onclick="abrirModalLogsColeta('${item.id}')" title="Histórico">
                    <i class="fas fa-history"></i>
                </button>
                ${!isEntregue ? 
                    `<button class="action-btn" onclick="abrirModalColeta('${item.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                     <button class="action-btn" onclick="excluirColeta('${item.id}')" title="Excluir"><i class="fas fa-trash" style="color:#dc3545;"></i></button>
                     <button class="action-btn" onclick="abrirModalEntrega('${item.id}')" title="Confirmar Entrega"><i class="fas fa-check-circle" style="color:#28a745;"></i></button>` 
                    : 
                    `<button class="action-btn" disabled style="opacity:0.3;"><i class="fas fa-edit"></i></button>
                     <button class="action-btn" disabled style="opacity:0.3;"><i class="fas fa-trash"></i></button>
                     <button class="action-btn" disabled style="opacity:0.3;"><i class="fas fa-check-circle"></i></button>`
                }
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// =============================================================================
// 3. FILTROS DINÂMICOS (Padrão Simplificado)
// =============================================================================

window.adicionarFiltroColeta = function() {
    const container = document.getElementById('container-filtros-coletas');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row-coleta';
    div.id = `filter-${id}`;
    div.style.cssText = 'display: flex; gap: 10px; align-items: center; margin-bottom: 8px;';

    div.innerHTML = `
        <select class="form-control" style="width: 160px; height: 35px; padding-right: 25px;" onchange="configurarInputFiltroColeta(this, ${id})">
            <option value="">Filtrar por...</option>
            <option value="data">Data Coleta</option>
            <option value="status">Status</option>
            <option value="motorista">Motorista</option>
            <option value="placa">Placa</option>
            <option value="combustivel">Combustível</option>
        </select>
        <div id="wrapper-${id}" style="width: 220px;">
            <input type="text" class="form-control input-filtro-coleta" disabled placeholder="Selecione..." style="height:35px;">
        </div>
        <button onclick="this.parentElement.remove(); aplicarFiltrosColeta()" style="border:none; background:none; color:#dc3545; cursor:pointer; padding: 0 5px;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
};

window.configurarInputFiltroColeta = async function(sel, id) {
    const wrapper = document.getElementById(`wrapper-${id}`);
    if (!wrapper) return;
    
    // Tenta preservar valor selecionado se já existir (para não resetar ao atualizar a lista)
    const inputAtual = wrapper.querySelector('input, select');
    const valorAnterior = inputAtual ? inputAtual.value : '';

    wrapper.innerHTML = '';
    const tipo = sel.value;
    let el;

    if (tipo === 'data') {
        el = document.createElement('input');
        el.type = 'date';
        el.className = 'form-control input-filtro-coleta';
        if (valorAnterior) el.value = valorAnterior;
    }
    else if (tipo === 'status') {
        el = document.createElement('select');
        el.className = 'form-control input-filtro-coleta';
        el.innerHTML = `
            <option value="">Todos os Status</option>
            <option value="Agendado">Agendado</option>
            <option value="Em Trânsito">Em Trânsito</option>
            <option value="Entregue">Entregue</option>
        `;
        if (valorAnterior) el.value = valorAnterior;
    }
    else if (tipo === 'combustivel') {
        el = document.createElement('select');
        el.className = 'form-control input-filtro-coleta';
        el.innerHTML = `
            <option value="">Todos</option>
            <option value="Etanol">Etanol</option>
            <option value="Gasolina">Gasolina</option>
            <option value="Diesel S-500">Diesel S-500</option>
            <option value="Diesel S-10">Diesel S-10</option>
        `;
        if (valorAnterior) el.value = valorAnterior;
    } 
    else if (tipo === 'motorista') {
        el = document.createElement('select');
        el.className = 'form-control input-filtro-coleta';
        
        const nomes = [...new Set(listaColetasGlobal.map(i => i.perfis ? i.perfis.nome_completo.trim() : null).filter(Boolean))].sort();
        el.innerHTML = '<option value="">Todos os Motoristas</option>';
        nomes.forEach(nome => { 
            const isSelected = (nome === valorAnterior) ? 'selected' : '';
            el.innerHTML += `<option value="${nome}" ${isSelected}>${nome}</option>`; 
        });
    } 
    else if (tipo === 'placa') {
        el = document.createElement('select');
        el.className = 'form-control input-filtro-coleta';
        
        const placas = [...new Set(listaColetasGlobal.map(i => i.placa_cavalo ? i.placa_cavalo.trim() : null).filter(Boolean))].sort();
        el.innerHTML = '<option value="">Todas as Placas</option>';
        placas.forEach(placa => { 
            const isSelected = (placa === valorAnterior) ? 'selected' : '';
            el.innerHTML += `<option value="${placa}" ${isSelected}>${placa}</option>`; 
        });
    } 
    else {
        el = document.createElement('input');
        el.type = 'text';
        el.className = 'form-control input-filtro-coleta';
        el.placeholder = 'Digite para buscar...';
        if (valorAnterior) el.value = valorAnterior;
    }
    
    // --- AJUSTE DE ALTURA E ESPAÇAMENTO ---
    el.style.width = '100%';
    el.style.minHeight = '38px'; 
    el.style.height = 'auto';     
    el.style.padding = '6px 12px'; 
    el.style.lineHeight = '1.5';   
    el.style.fontSize = '0.9rem';
    el.style.boxSizing = 'border-box';
    
    if (el.tagName === 'SELECT') {
        el.style.paddingRight = '30px'; 
    }

    el.onchange = () => { aplicarFiltrosColeta(); };
    if (el.tagName === 'INPUT') {
        el.onkeyup = () => { aplicarFiltrosColeta(); };
    }
    
    wrapper.appendChild(el);
};

// =============================================================================
// 4. MODAL E LÓGICA DE FORMULÁRIO
// =============================================================================

window.alternarAbaColeta = function(aba) {
    // Esconde todos
    document.getElementById('content-col-geral').style.display = 'none';
    document.getElementById('content-col-tanque').style.display = 'none';
    document.getElementById('content-col-obs').style.display = 'none';
    
    // Reseta estilo abas
    ['geral','tanque','obs'].forEach(t => {
        const btn = document.getElementById(`tab-col-${t}`);
        btn.style.borderBottom = '3px solid transparent';
        btn.style.color = '#666';
        btn.style.fontWeight = 'normal';
    });

    // Ativa selecionada
    document.getElementById(`content-col-${aba}`).style.display = 'block';
    const btnAtivo = document.getElementById(`tab-col-${aba}`);
    btnAtivo.style.borderBottom = '3px solid var(--cor-primaria)';
    btnAtivo.style.color = 'var(--cor-primaria)';
    btnAtivo.style.fontWeight = 'bold';
    
    // Se abrir aba tanque, força recalculo visual
    if(aba === 'tanque') atualizarTanqueVisual();
};

window.abrirModalColeta = async function(id = null, readonly = false) {
    const modal = document.getElementById('modal-coleta');
    const form = document.getElementById('form-coleta');
    const mask = document.getElementById('loading-overlay-modal'); 
    
    // 1. Exibe o modal e ativa o efeito de desfoque
    modal.classList.add('active');
    if(mask) mask.classList.add('active');

    // 2. Reset de estado e campos
    form.reset();
    formColetaSujo = false;
    dadosOriginaisColeta = null;
    itensCargaGlobal = []; 
    carretasAtuais = [];
    document.getElementById('col-id').value = '';
    
    // Limpezas visuais
    document.getElementById('lista-itens-carga').innerHTML = '<div style="text-align: center; color: #ccc; margin-top: 20px; font-size: 0.9rem;">Nenhum combustível adicionado.</div>';
    document.getElementById('lbl-total-carregado').innerText = '0 L';
    document.getElementById('area-visual-tanques').innerHTML = '<span style="color: #ccc;">Selecione um cavalo...</span>';
    
    const inputCarretasGeral = document.getElementById('col-carretas-texto');
    if(inputCarretasGeral) inputCarretasGeral.value = '';
    
    const titulo = document.getElementById('titulo-modal-coleta');
    titulo.innerText = id ? (readonly ? 'Visualizar Coleta' : 'Editar Coleta') : 'Nova Coleta';

    alternarAbaColeta('geral');

    // Habilita inputs para edição
    const inputs = form.querySelectorAll('input, select, textarea, button');
    inputs.forEach(el => el.disabled = false);

    const btnSalvar = document.getElementById('btn-salvar-coleta');
    const btnAddCarga = document.querySelector('button[onclick="abrirModalItemCarga()"]');
    if(btnSalvar) btnSalvar.style.display = 'block';
    if(btnAddCarga) btnAddCarga.disabled = false;

    try {
        // 3. Carrega dados auxiliares (Unidades/Veículos)
        await popularSelectsColeta();

        // 4. Preenchimento de dados
        if (id) {
            // Lógica de Edição: Busca o item na lista global
            const item = listaColetasGlobal.find(x => x.id == id);
            if (item) {
                document.getElementById('col-id').value = item.id;
                
                if (item.data_hora_inicio) {
                    document.getElementById('col-data-inicio').value = item.data_hora_inicio.slice(0, 16);
                }
                if (item.data_hora_previsao_entrega) {
                    document.getElementById('col-data-previsao').value = item.data_hora_previsao_entrega.slice(0, 16);
                }
                
                document.getElementById('col-unidade').value = item.unidade_id;
                if (item.unidade_id) {
                    await carregarMotoristasPorUnidade(item.unidade_id);
                    document.getElementById('col-motorista').value = item.motorista_id;
                }

                document.getElementById('col-placa').value = item.placa_cavalo;
                await aoSelecionarPlacaCavalo(); 

                document.getElementById('col-base').value = item.base_carregamento || '';
                document.getElementById('col-cidade').value = item.cidade_carregamento || '';
                document.getElementById('col-solicitante').value = item.solicitante || '';
                document.getElementById('col-obs').value = item.observacao || '';

                if (item.itens_carga && Array.isArray(item.itens_carga)) {
                    itensCargaGlobal = JSON.parse(JSON.stringify(item.itens_carga));
                    renderizarListaItensCarga();
                    atualizarTanqueVisual();
                }

                if (!readonly) {
                    setTimeout(() => { dadosOriginaisColeta = JSON.stringify(getPayloadColeta()); }, 100);
                }
            }
        } else {
            // --- NOVA COLETA: REGRAS DE HORÁRIO PADRÃO ---
            const agora = new Date();
            
            // 1. Data de Hoje às 06:00
            const dataInicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 6, 0, 0);
            const isoInicio = new Date(dataInicio.getTime() - (dataInicio.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            document.getElementById('col-data-inicio').value = isoInicio;

            // 2. Previsão de Entrega: Início + 4 horas (10:00)
            const dataEntrega = new Date(dataInicio.getTime() + (4 * 60 * 60 * 1000));
            const isoEntrega = new Date(dataEntrega.getTime() - (dataEntrega.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            document.getElementById('col-data-previsao').value = isoEntrega;
        }

        // 5. Aplica restrições de Visualização (Readonly)
        if (readonly) {
            form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
            const btnCancel = form.querySelector('.btn-cancel');
            if(btnCancel) btnCancel.disabled = false;
            
            if(btnSalvar) btnSalvar.style.display = 'none';
            if(btnAddCarga) btnAddCarga.disabled = true;
            document.querySelectorAll('#lista-itens-carga button').forEach(btn => btn.remove());
        }

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao carregar dados do formulário.", "error");
    } finally {
        if(mask) {
            setTimeout(() => { mask.classList.remove('active'); }, 300);
        }
    }
};

window.fecharModalColeta = function(forcar = false) {
    // Se não for forçado e houver alterações não salvas
    if (!forcar && formColetaSujo) {
        // Usa a função global do app.js que abre o modal bonito
        window.solicitarConfirmacao(() => {
            executarFechamentoColeta();
        });
        return; 
    }
    
    executarFechamentoColeta();
};

window.carregarMotoristasPorUnidade = async function(unidadeId) {
    const selMot = document.getElementById('col-motorista');
    
    if (!unidadeId) {
        selMot.innerHTML = '<option value="">Selecione a unidade...</option>';
        selMot.disabled = true;
        return;
    }

    selMot.innerHTML = '<option value="">Carregando...</option>';
    selMot.disabled = false;

    try {
        
        const { data: motoristas, error } = await clienteSupabase
            .from('perfis')
            .select('id, nome_completo, unidade_id, ativo, perfis_unidades(unidade_id)') 
            .eq('funcao', 'motorista')
            .order('nome_completo');

        if (error) throw error;

        selMot.innerHTML = '<option value="">Selecione...</option>';
        
        if (motoristas && motoristas.length > 0) {
            const filtrados = motoristas.filter(m => {
                if (String(m.unidade_id) === String(unidadeId)) return true;
                if (m.perfis_unidades && m.perfis_unidades.some(link => String(link.unidade_id) === String(unidadeId))) return true;
                return false;
            });

            if (filtrados.length > 0) {
                filtrados.sort((a, b) => a.nome_completo.localeCompare(b.nome_completo));

                // Deduplicação
                const nomesVistos = new Set();

                filtrados.forEach(m => {
                    const nomeLimpo = m.nome_completo.trim();
                    if (!nomesVistos.has(nomeLimpo)) {
                        nomesVistos.add(nomeLimpo);
                        
                        const statusAttr = m.ativo ? '' : 'disabled';
                        const tagInativo = m.ativo ? '' : ' (Inativo)';
                        
                        selMot.innerHTML += `<option value="${m.id}" ${statusAttr}>${nomeLimpo}${tagInativo}</option>`;
                    }
                });
            } else {
                selMot.innerHTML = '<option value="">Nenhum motorista nesta unidade</option>';
            }
        } else {
            selMot.innerHTML = '<option value="">Nenhum motorista encontrado</option>';
        }

    } catch (err) {
        console.error("Erro ao carregar motoristas:", err);
        selMot.innerHTML = '<option value="">Erro ao carregar</option>';
    }
};

// =============================================================================
// 5. LÓGICA DE NEGÓCIO (TANQUE E CÁLCULOS)
// =============================================================================

window.atualizarTanqueVisual = function() {
    const areaVisual = document.getElementById('area-visual-tanques');
    
    if (carretasAtuais.length === 0) {
        areaVisual.innerHTML = '<span style="color: #ccc;">Selecione um cavalo para visualizar</span>';
        const legenda = document.getElementById('legenda-combustiveis');
        if(legenda) legenda.innerHTML = '';
        return;
    }

    let capacidadeTotalConjunto = 0;
    let volumeTotalCarregado = 0;

    const tanquesRender = carretasAtuais.map(carreta => {
        const cap = parseFloat(carreta.capacidade_tanque || 1);
        capacidadeTotalConjunto += cap;

        const itemCarga = itensCargaGlobal.find(i => String(i.id_carreta) === String(carreta.id));
        const vol = itemCarga ? parseFloat(itemCarga.volume || 0) : 0;
        volumeTotalCarregado += vol;

        const pct = (vol / cap) * 100;
        
        let classeCor = 'fuel-default';
        let nomeCombustivel = '-';
        
        if (itemCarga) {
            const tipo = itemCarga.combustivel;
            nomeCombustivel = tipo;
            if (tipo === 'Etanol') classeCor = 'fuel-etanol';
            else if (tipo === 'Gasolina') classeCor = 'fuel-gasolina';
            else if (tipo.includes('S-500')) classeCor = 'fuel-s500';
            else if (tipo.includes('S-10')) classeCor = 'fuel-s10';
        }

        return {
            placa: carreta.placa,
            capacidade: cap,
            volume: vol,
            percentual: pct,
            classeCor: classeCor,
            combustivel: nomeCombustivel
        };
    });

    const pctTotalConjunto = capacidadeTotalConjunto > 0 ? (volumeTotalCarregado / capacidadeTotalConjunto) * 100 : 0;

    let html = '';

    // CARD DE APROVEITAMENTO TOTAL
    html += `
        <div style="width:100%; display:flex; justify-content:center;">
            <div class="total-utilization-card">
                <span style="display:block; font-size:0.75rem; color:#666; margin-bottom:2px;">Aproveitamento do Conjunto</span>
                <strong style="font-size:1.4rem; color:${pctTotalConjunto > 100 ? '#dc3545' : 'var(--cor-primaria)'};">
                    ${pctTotalConjunto.toFixed(1)}%
                </strong>
                <div style="font-size:0.8rem; color:#888;">
                    ${volumeTotalCarregado.toLocaleString()} de ${(capacidadeTotalConjunto/1000).toLocaleString()}k Litros
                </div>
            </div>
        </div>
    `;

    html += '<div class="tanker-wrapper">';
    
    tanquesRender.forEach((t, index) => {
        if (index > 0) html += `<div class="connector"></div>`;

        const alturaVisual = t.percentual > 100 ? 95 : (t.percentual * 0.95);
        
        // --- CORREÇÃO VISUAL AQUI: Texto centralizado e fixo ---
        const stylePct = `
            position: absolute; 
            top: 50%; 
            left: 50%; 
            transform: translate(-50%, -50%); 
            width: 100%; 
            text-align: center; 
            font-weight: bold; 
            font-size: 1.1rem; 
            color: #333; 
            z-index: 10;
            text-shadow: 0 0 8px rgba(255,255,255,0.8); /* Garante contraste */
            pointer-events: none;
        `;

        html += `
            <div style="display:flex; flex-direction:column; align-items:center;">
                <div class="tanker-body ${t.volume === 0 ? 'empty' : ''}">
                    <div class="liquid-fill ${t.classeCor}" style="height: ${alturaVisual}%;"></div>
                    <div style="${stylePct}">
                        ${t.volume > 0 ? t.percentual.toFixed(0) + '%' : 'Vazio'}
                    </div>
                </div>
                <div class="tanker-label" style="font-size: 0.85rem; margin-top: 8px; font-weight:bold;">${t.placa}</div>
                <div class="tanker-capacity" style="font-weight:bold; color:#333;">${t.volume.toLocaleString()} L</div>
                <div style="font-size: 0.65rem; color:#999; margin-top:2px;">
                    ${t.combustivel.replace('Diesel ', '')}
                </div>
            </div>
        `;
    });
    html += '</div>';

    areaVisual.innerHTML = html;

    // LEGENDA (Mantida igual)
    const legenda = document.getElementById('legenda-combustiveis');
    if(legenda) {
        if(volumeTotalCarregado > 0) {
            legenda.innerHTML = `
                <div style="display:flex; gap:15px; flex-wrap:wrap; justify-content:center;">
                    <span style="display:flex;align-items:center;gap:5px; font-size:0.75rem;">
                        <div style="width:10px;height:10px;background:#d63333;border-radius:50%"></div> Diesel S-500
                    </span>
                    <span style="display:flex;align-items:center;gap:5px; font-size:0.75rem;">
                        <div style="width:10px;height:10px;background:#ff9933;border-radius:50%"></div> Diesel S-10
                    </span>
                    <span style="display:flex;align-items:center;gap:5px; font-size:0.75rem;">
                        <div style="width:10px;height:10px;background:#ffcc00;border-radius:50%"></div> Gasolina
                    </span>
                    <span style="display:flex;align-items:center;gap:5px; font-size:0.75rem;">
                        <div style="width:10px;height:10px;background:#aaddff;border-radius:50%"></div> Etanol
                    </span>
                </div>
            `;
        } else {
            legenda.innerHTML = '';
        }
    }
};

window.sugerirCapacidadeDoVeiculo = function() {
    // Futuro: Buscar do cadastro de veículos quando implementado carretas
    // Por enquanto, pode setar um valor padrão ou deixar o usuário digitar
    const placa = document.getElementById('col-placa').value;
    if(placa) {
        // Mock: Se quiser automatizar algo agora
        // document.getElementById('col-capacidade').value = 45000;
        // atualizarTanqueVisual();
    }
};

// =============================================================================
// 6. PERSISTÊNCIA
// =============================================================================

window.getPayloadColeta = function() {
    const inicioCompleto = document.getElementById('col-data-inicio').value;
    const previsao = document.getElementById('col-data-previsao').value;
    const id = document.getElementById('col-id').value;

    // 1. Recupera o status atual para saber se já foi Entregue
    let statusFinal = null;
    if (id) {
        const item = listaColetasGlobal.find(i => String(i.id) === String(id));
        statusFinal = item ? item.status : null;
    }

    // 2. Lógica de Status Automática (se não estiver Entregue)
    if (statusFinal !== 'Entregue') {
        const agora = new Date();
        const dtInicio = new Date(inicioCompleto);
        statusFinal = (dtInicio > agora) ? 'Agendado' : 'Em Trânsito';
    }

    return {
        
        // Novos campos de agendamento
        data_hora_inicio: inicioCompleto || null,
        data_hora_previsao_entrega: previsao || null,
        
        unidade_id: document.getElementById('col-unidade').value,
        motorista_id: document.getElementById('col-motorista').value,
        placa_cavalo: document.getElementById('col-placa').value,
        
        base_carregamento: document.getElementById('col-base').value.trim(),
        cidade_carregamento: document.getElementById('col-cidade').value.trim(),
        solicitante: document.getElementById('col-solicitante').value.trim(),
        observacao: document.getElementById('col-obs').value.trim(),
        
        // Dados de carga e cálculos precisos
        itens_carga: itensCargaGlobal, 
        volume_litros: itensCargaGlobal.reduce((acc, curr) => acc + (parseFloat(curr.volume) || 0), 0),
        percentual_carregamento: parseFloat(calcularPercentualTotal().toFixed(2)),
        
        // O status agora faz parte do payload base
        status: statusFinal
    };
};

window.salvarColeta = async function(e) {
    if (e) { e.preventDefault(); e.stopPropagation(); }

    const id = document.getElementById('col-id').value;
    const inicio = document.getElementById('col-data-inicio').value;
    const previsao = document.getElementById('col-data-previsao').value;
    const placa = document.getElementById('col-placa').value;
    
    // 1. Validações Básicas
    if (!inicio || !previsao) {
        mostrarToast("Informe os horários de início e entrega.", "warning");
        return;
    }

    if (new Date(inicio) >= new Date(previsao)) {
        mostrarToast("A entrega deve ser após o início.", "warning");
        return;
    }

    // 2. Validação de Conflito (Modal Plano B)
    const conflito = await verificarConflitoAgenda(placa, inicio, previsao, id);
    if (conflito) {
        const fDate = (iso) => {
            const [d, h] = iso.split('T');
            const [y, m, dia] = d.split('-');
            return `${dia}/${m}/${y} às ${h.slice(0, 5)}`;
        };
        document.getElementById('conf-placa').innerText = conflito.placa_cavalo;
        document.getElementById('conf-veiculo-detalhe').innerText = `${conflito.marca} ${conflito.modelo}`;
        document.getElementById('conf-motorista').innerText = conflito.perfis?.nome_completo || 'Não identificado';
        document.getElementById('conf-inicio').innerText = fDate(conflito.data_hora_inicio);
        document.getElementById('conf-fim').innerText = fDate(conflito.data_hora_previsao_entrega);
        document.getElementById('modal-conflito-agenda').classList.add('active');
        return;
    }

    // 3. Verificação de Itens
    if (itensCargaGlobal.length === 0) {
        alternarAbaColeta('tanque');
        mostrarToast("Adicione ao menos um combustível.", "warning");
        return;
    }

    // 4. MONTAGE E VALIDAÇÃO DE ALTERAÇÕES (SNAPSHOT)
    const payload = getPayloadColeta();

    if (id && dadosOriginaisColeta) {
        // Agora o payload tem EXATAMENTE os mesmos campos do snapshot
        if (JSON.stringify(payload) === dadosOriginaisColeta) {
            mostrarToast("Nenhuma alteração detectada para salvar.", "info");
            return;
        }
    }

    const btnSalvar = document.getElementById('btn-salvar-coleta');
    btnSalvar.innerText = 'Salvando...';
    btnSalvar.disabled = true;

    try {
        let idReg = id;
        let acao = id ? 'UPDATE' : 'INSERT';

        if (id) {
            const { error } = await clienteSupabase.from('coletas_combustivel').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { data, error } = await clienteSupabase.from('coletas_combustivel').insert([payload]).select();
            if (error) throw error;
            idReg = data[0].id;
        }

        // 5. Auditoria de Log (Caminho completo do registro)
        const { data: { user } } = await clienteSupabase.auth.getUser();
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'coletas_combustivel',
            id_registro_afetado: String(idReg),
            acao: acao,
            usuario_id: user?.id,
            dados_antigos: id ? dadosOriginaisColeta : JSON.stringify({ info: "Novo registro" }),
            dados_novos: JSON.stringify(payload),
            data_hora: new Date().toISOString()
        });

        mostrarToast("Coleta salva!", "success");
        document.getElementById('modal-coleta').classList.remove('active');
        await listarColetas();

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao salvar: " + err.message, "error");
    } finally {
        btnSalvar.innerText = 'Salvar';
        btnSalvar.disabled = false;
    }
};

window.confirmarEntregaColeta = async function() {
    if (!confirm("Confirma a entrega desta carga? O veículo ficará disponível novamente.")) return;
    
    const id = document.getElementById('col-id').value;
    const user = window.usuarioLogadoGlobal;

    try {
        const payload = {
            status: 'Entregue',
            data_entrega: new Date().toISOString(),
            usuario_entrega_id: user.id
        };

        const { error } = await clienteSupabase.from('coletas_combustivel').update(payload).eq('id', id);
        if (error) throw error;

        await registrarLogColeta(id, 'CONFIRMAR_ENTREGA', { status: 'Em Trânsito' }, payload);

        mostrarToast("Entrega confirmada!", "success");
        document.getElementById('modal-coleta').classList.remove('active');
        listarColetas();

    } catch (err) {
        mostrarToast("Erro ao confirmar entrega.", "error");
    }
};

async function registrarLogColeta(id, acao, antigo, novo) {
    const user = window.usuarioLogadoGlobal;
    await clienteSupabase.from('logs_auditoria').insert([{
        tabela_afetada: 'coletas_combustivel',
        id_registro_afetado: id,
        acao: acao,
        usuario_id: user.id,
        dados_antigos: antigo,
        dados_novos: novo,
        data_hora: new Date().toISOString()
    }]);
}

// Auxiliar para popular combos (Simplificado)
async function popularSelectsColeta() {
    const selUni = document.getElementById('col-unidade');
    const selPlaca = document.getElementById('col-placa');
    
    if(selUni.options.length <= 1) selUni.innerHTML = '<option value="">Carregando...</option>';
    if(selPlaca.options.length <= 1) selPlaca.innerHTML = '<option value="">Carregando...</option>';

    try {
        // Dispara as duas requisições ao mesmo tempo
        const [resUnidades, resCavalos] = await Promise.all([
            clienteSupabase.from('unidades').select('id, nome').eq('ativo', true).order('nome'),
            
            clienteSupabase.from('veiculos').select('id, placa, modelo, ativo').eq('tipo_veiculo', 'Cavalo').order('placa')
        ]);

        selUni.innerHTML = '<option value="">Selecione...</option>';
        if (resUnidades.data) {
            resUnidades.data.forEach(u => selUni.innerHTML += `<option value="${u.id}">${u.nome}</option>`);
        }

        selPlaca.innerHTML = '<option value="">Selecione...</option>';
        if (resCavalos.data) {
            resCavalos.data.forEach(v => {
                
                const statusAttr = v.ativo ? '' : 'disabled';
                const tagInativo = v.ativo ? '' : ' (Inativo)';
                selPlaca.innerHTML += `<option value="${v.placa}" ${statusAttr}>${v.placa} - ${v.modelo}${tagInativo}</option>`;
            });
        }
        
        const selMotorista = document.getElementById('col-motorista');
        if(selMotorista) {
            selMotorista.innerHTML = '<option value="">Selecione a unidade primeiro...</option>';
            selMotorista.disabled = true;
        }

    } catch (error) {
        console.error("Erro ao popular selects:", error);
        mostrarToast("Erro ao carregar listas.", "error");
    }
}

window.repopularFiltrosColeta = function() {
    const container = document.getElementById('container-filtros-coletas');
    if (!container) return;

    const linhas = container.querySelectorAll('.filter-row-coleta');

    linhas.forEach(div => {
        const selectTipo = div.querySelector('select'); // O select do tipo (Motorista/Placa)
        if (selectTipo && (selectTipo.value === 'motorista' || selectTipo.value === 'placa')) {
            const id = div.id.replace('filter-', '');
            configurarInputFiltroColeta(selectTipo, id);
        }
    });
};

window.aoSelecionarPlacaCavalo = async function() {
    if (!document.getElementById('col-id').value) {
        itensCargaGlobal = [];
        renderizarListaItensCarga();
    }
    
    const placaCavalo = document.getElementById('col-placa').value;
    
    // Elementos de UI
    const lblCapacidade = document.getElementById('lbl-capacidade-total-texto');
    const inputCapacidade = document.getElementById('col-capacidade');
    const infoCarretas = document.getElementById('info-carretas-vinculadas'); // Aba Tanque
    const inputCarretasGeral = document.getElementById('col-carretas-texto'); // NOVO CAMPO (Aba Geral)

    carretasAtuais = [];
    
    // Reset visual
    if (inputCarretasGeral) inputCarretasGeral.value = '';
    
    if (!placaCavalo) {
        atualizarTanqueVisual();
        return;
    }

    try {
        const { data: cavalo } = await clienteSupabase
            .from('veiculos').select('id').eq('placa', placaCavalo).single();

        if (!cavalo) return;

        const { data: carretas } = await clienteSupabase
            .from('veiculos')
            .select('id, placa, capacidade_tanque')
            .eq('cavalo_id', cavalo.id)
            .eq('ativo', true);

        carretasAtuais = carretas || [];

        let capacidadeTotal = 0;
        let nomes = [];
        
        carretasAtuais.forEach(c => {
            capacidadeTotal += parseFloat(c.capacidade_tanque || 0);
            nomes.push(c.placa);
        });

        // Atualiza UI Aba Tanque
        if(lblCapacidade) lblCapacidade.innerText = capacidadeTotal.toLocaleString() + ' L';
        inputCapacidade.value = capacidadeTotal;
        if(infoCarretas) infoCarretas.innerText = `Conjunto: ${nomes.join(' + ')}`;
        
        // Atualiza UI Aba Geral (NOVO)
        if(inputCarretasGeral) {
            inputCarretasGeral.value = nomes.length > 0 ? nomes.join(' + ') : 'Nenhuma carreta vinculada';
        }
        
        atualizarTanqueVisual();

    } catch (error) { console.error(error); }
};

// =============================================================================
// LÓGICA DE CARGA MULTI-TANQUE
// =============================================================================

window.abrirModalItemCarga = function (indexEdicao = null) {
    if (!Array.isArray(carretasAtuais) || carretasAtuais.length === 0) {
        mostrarToast("Selecione um cavalo válido primeiro.", "warning");
        return;
    }

    const modal = document.getElementById('modal-item-carga');
    const selTanque = document.getElementById('item-tanque-alvo');
    const infoCapacidade = document.getElementById('info-capacidade-tanque');
    const inputVolume = document.getElementById('item-volume');
    const selCombustivel = document.getElementById('item-combustivel');

    // 1. Limpeza eficiente
    selTanque.innerHTML = ''; 
    infoCapacidade.innerText = '';
    inputVolume.value = '';
    selCombustivel.value = 'Diesel S-500';
    
    indiceEdicaoCarga = indexEdicao;
    let idTanqueEmEdicao = null;

    // Recupera dados de edição se houver
    if (indiceEdicaoCarga !== null && itensCargaGlobal[indiceEdicaoCarga]) {
        const item = itensCargaGlobal[indiceEdicaoCarga];
        inputVolume.value = item.volume;
        selCombustivel.value = item.combustivel;
        idTanqueEmEdicao = String(item.id_carreta);
        
        const titulo = modal.querySelector('.modal-header span');
        if(titulo) titulo.innerText = 'Editar Combustível';
    } else {
        const titulo = modal.querySelector('.modal-header span');
        if(titulo) titulo.innerText = 'Abastecer Tanque';
    }

    // Filtra tanques disponíveis
    const idsUsados = itensCargaGlobal.map(i => String(i.id_carreta));
    const tanquesDisponiveis = carretasAtuais.filter(c => {
        return !idsUsados.includes(String(c.id)) || (String(c.id) === idTanqueEmEdicao);
    });

    if (tanquesDisponiveis.length === 0) {
        mostrarToast("Todos os tanques já possuem carga atribuída.", "warning");
        return;
    }

    // 2. OTIMIZAÇÃO DE RENDERIZAÇÃO (Monta string primeiro)
    let optionsHtml = '';
    tanquesDisponiveis.forEach(c => {
        const cap = parseFloat(c.capacidade_tanque || 0);
        optionsHtml += `
            <option 
                value="${c.id}" 
                data-placa="${c.placa}" 
                data-cap="${cap}"
            >
                ${c.placa} - ${cap.toLocaleString()} L
            </option>
        `;
    });
    
    // Injeta no DOM uma única vez (Reflow único)
    selTanque.innerHTML = optionsHtml;

    // Lógica de Seleção Automática
    if (selTanque.options.length > 0) {
        if (idTanqueEmEdicao) {
            selTanque.value = idTanqueEmEdicao;
        } else {
            selTanque.selectedIndex = 0;
        }
        
        // Atualiza info de capacidade
        const opt = selTanque.options[selTanque.selectedIndex];
        if (opt) {
            const cap = parseFloat(opt.getAttribute('data-cap') || 0);
            infoCapacidade.innerText = `Capacidade Máxima: ${cap.toLocaleString()} Litros`;
        }
    }

    // Evento change
    selTanque.onchange = function () {
        const opt = selTanque.options[selTanque.selectedIndex];
        if (!opt) {
            infoCapacidade.innerText = '';
            return;
        }
        const cap = parseFloat(opt.getAttribute('data-cap') || 0);
        infoCapacidade.innerText = cap
            ? `Capacidade Máxima: ${cap.toLocaleString()} Litros`
            : '';
    };

    modal.classList.add('active');

    // 3. Foco mais rápido (50ms é imperceptível mas garante que a renderização terminou)
    setTimeout(() => {
        if(inputVolume) inputVolume.focus();
    }, 50);
};

window.atualizarInfoTanqueSelecionado = function() {
    const sel = document.getElementById('item-tanque-alvo');
    const opt = sel.options[sel.selectedIndex];
    if(opt) {
        const cap = opt.getAttribute('data-cap');
        document.getElementById('info-capacidade-tanque').innerText = `Capacidade Máxima: ${parseInt(cap).toLocaleString()} Litros`;
    }
};

window.salvarItemCarga = function (e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }

    const selTanque = document.getElementById('item-tanque-alvo');
    const inputVolume = document.getElementById('item-volume');
    const selCombustivel = document.getElementById('item-combustivel');

    if (!selTanque || !inputVolume || !selCombustivel) return;

    const opt = selTanque.options[selTanque.selectedIndex];
    if (!opt || !opt.value) {
        mostrarToast("Selecione um tanque.", "warning");
        return;
    }

    const idCarreta = String(opt.value);
    const placaCarreta = opt.getAttribute('data-placa') || '';
    const capacidade = parseFloat(opt.getAttribute('data-cap')) || 0;
    const volume = parseFloat(inputVolume.value);

    if (!capacidade || capacidade <= 0) {
        mostrarToast("Capacidade inválida.", "error");
        return;
    }
    if (!volume || volume <= 0) {
        mostrarToast("Informe um volume válido.", "warning");
        return;
    }
    if (volume > capacidade) {
        mostrarToast(`Volume excede a capacidade (${capacidade.toLocaleString()} L)!`, "error");
        return;
    }

    // Validação de duplicidade (apenas se mudou o tanque durante a edição ou é novo)
    // Se estou editando e mantive o mesmo tanque, não é duplicidade.
    const itemExistenteOutro = itensCargaGlobal.find(i => String(i.id_carreta) === idCarreta);
    
    // Se existe um item com esse tanque E (não estou editando OU estou editando mas é OUTRO índice)
    if (itemExistenteOutro && (indiceEdicaoCarga === null || itensCargaGlobal.indexOf(itemExistenteOutro) !== indiceEdicaoCarga)) {
        mostrarToast("Este tanque já possui carga atribuída.", "warning");
        return;
    }

    const novoItem = {
        id_carreta: idCarreta,
        placa: placaCarreta,
        combustivel: selCombustivel.value,
        volume: volume,
        capacidade: capacidade
    };

    if (indiceEdicaoCarga !== null && indiceEdicaoCarga >= 0) {
        // ATUALIZAÇÃO
        itensCargaGlobal[indiceEdicaoCarga] = novoItem;
        mostrarToast("Item atualizado.", "success");
    } else {
        // INSERÇÃO
        itensCargaGlobal.push(novoItem);
    }

    // --- CORREÇÃO: Marca o formulário como alterado para ativar o alerta de saída ---
    formColetaSujo = true; 
    // -------------------------------------------------------------------------------

    atualizarTanqueVisual();
    renderizarListaItensCarga();
    fecharModalItemCarga();
};

window.fecharModalItemCarga = function() {
    const modal = document.getElementById('modal-item-carga');
    if (modal) {
        modal.classList.remove('active');
    }
    // Reseta o índice para que a próxima abertura seja "Novo Item"
    indiceEdicaoCarga = null;
};

window.renderizarListaItensCarga = function() {
    const container = document.getElementById('lista-itens-carga');
    container.innerHTML = '';
    let totalCarregado = 0;

    if (itensCargaGlobal.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #ccc; margin-top: 20px; font-size: 0.9rem;">Nenhum combustível adicionado.</div>';
    } else {
        itensCargaGlobal.forEach((item, index) => {
            totalCarregado += item.volume;
            
            let corBadge = '#999';
            const tipo = item.combustivel;
            if(tipo === 'Etanol') corBadge = '#aaddff; color: #004488'; 
            else if(tipo === 'Gasolina') corBadge = '#ffcc00; color: #554400'; 
            else if(tipo.includes('S-500')) corBadge = '#d63333; color: white'; 
            else if(tipo.includes('S-10')) corBadge = '#ff9933; color: white'; 

            const div = document.createElement('div');
            div.style.cssText = 'display: flex; justify-content: space-between; align-items: center; background: #fff; border: 1px solid #eee; padding: 8px; border-radius: 4px; animation: fadeIn 0.3s; margin-bottom: 5px;';
            div.innerHTML = `
                <div style="flex: 1;">
                    <div style="font-weight: bold; font-size: 0.9rem; color: #333;">${item.placa}</div>
                    <div style="font-size: 0.75rem;">
                        <span class="badge" style="background:${corBadge}; padding: 3px 8px; border-radius: 10px; font-weight:bold; border: 1px solid rgba(0,0,0,0.1);">${item.combustivel}</span>
                    </div>
                </div>
                <div style="text-align: right; margin-right: 15px;">
                    <div style="font-weight: bold; color: var(--cor-primaria);">${item.volume.toLocaleString()} L</div>
                    <div style="font-size: 0.7rem; color: #999;">de ${item.capacidade.toLocaleString()} L</div>
                </div>
                <div style="display:flex; gap: 5px;">
                    <button type="button" onclick="abrirModalItemCarga(${index})" title="Editar" style="border:none; background:none; color: var(--cor-primaria); cursor:pointer;">
                        <i class="fas fa-pen"></i>
                    </button>
                    <button type="button" onclick="removerItemCarga(${index})" title="Remover" style="border:none; background:none; color:#dc3545; cursor:pointer;">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            `;
            container.appendChild(div);
        });
    }

    document.getElementById('lbl-total-carregado').innerText = totalCarregado.toLocaleString() + ' L';
};

window.removerItemCarga = function(index) {
    itensCargaGlobal.splice(index, 1);
    formColetaSujo = true;
    renderizarListaItensCarga();
    atualizarTanqueVisual();
};

function executarFechamentoColeta() {
    formColetaSujo = false;
    dadosOriginaisColeta = null;
    document.getElementById('modal-coleta').classList.remove('active');
}

window.abrirModalLogsColeta = async function(id) {
    if (!id) {
        mostrarToast("ID inválido para consulta de histórico.", "error");
        return;
    }

    try {
        // Busca nomes para traduzir IDs no log (Visualização amigável)
        const [resUnidades, resPerfis] = await Promise.all([
            clienteSupabase.from('unidades').select('id, nome'),
            clienteSupabase.from('perfis').select('id, nome_completo')
        ]);

        const mapaTraducao = {
            'unidade_id': resUnidades.data || [],
            'motorista_id': resPerfis.data || []
        };

        // Chama a função global garantindo que o ID seja String
        if (typeof abrirModalLogsGlobal === 'function') {
            abrirModalLogsGlobal('coletas_combustivel', String(id), 'Histórico da Coleta', mapaTraducao);
        } else {
            console.error("Função abrirModalLogsGlobal não encontrada no app.js");
        }

    } catch (error) {
        console.error("Erro ao preparar logs:", error);
        mostrarToast("Erro ao carregar histórico.", "error");
    }
};

function formatarDataISO(dataString) {
    if (!dataString) return '-';
    // Divide a string "YYYY-MM-DD" para evitar conversão de fuso do navegador
    const [ano, mes, dia] = dataString.split('-');
    return `${dia}/${mes}/${ano}`;
}

window.abrirModalEntrega = function(id) {
    document.getElementById('entrega-id-coleta').value = id;
    
    // Define Data/Hora padrão (Agora)
    const agora = new Date();
    // Ajuste fuso horário Brasil simples
    const dataLocal = new Date(agora.getTime() - (agora.getTimezoneOffset() * 60000)).toISOString();
    
    document.getElementById('entrega-data').value = dataLocal.split('T')[0];
    
    const horas = String(agora.getHours()).padStart(2, '0');
    const minutos = String(agora.getMinutes()).padStart(2, '0');
    document.getElementById('entrega-hora').value = `${horas}:${minutos}`;

    document.getElementById('modal-confirmar-entrega').classList.add('active');
};

window.salvarEntrega = async function(e) {
    if (e) e.preventDefault();
    
    const id = document.getElementById('entrega-id-coleta').value;
    const dataInput = document.getElementById('entrega-data').value;
    const horaInput = document.getElementById('entrega-hora').value;
    
    if(!dataInput || !horaInput) {
        mostrarToast("Por favor, informe a data e o horário da entrega.", "warning");
        return;
    }

    const isoEntregaExata = `${dataInput}T${horaInput}:00`;
    
    // Objeto Date mantido apenas para cálculos e comparações (maior/menor)
    const dataEntregaFinal = new Date(isoEntregaExata);
    const agora = new Date();

    try {
        // 1. Busca os dados atuais para validar o cronograma
        const { data: coleta, error: errBusca } = await clienteSupabase
            .from('coletas_combustivel')
            .select('*')
            .eq('id', id)
            .single();
            
        if (errBusca || !coleta) throw new Error("Não foi possível localizar os dados da coleta.");

        // --- VALIDAÇÃO 1: NÃO PERMITIR ENTREGA FUTURA ---
        if (dataEntregaFinal > agora) {
            mostrarToast("A entrega não pode ser registrada com data/hora futura.", "warning");
            return;
        }

        // --- VALIDAÇÃO 2: NÃO PERMITIR ENTREGA ANTES DO INÍCIO PREVISTO ---
        if (coleta.data_hora_inicio) {
            // Converte a data do banco garantindo que seja lida como local
            const dataInicioColeta = new Date(coleta.data_hora_inicio);
            
            if (dataEntregaFinal < dataInicioColeta) {
                const hInicioFmt = dataInicioColeta.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
                mostrarToast(`A entrega não pode ser anterior ao início da coleta (${hInicioFmt}).`, "warning");
                return; // Barre o processo aqui
            }
        }

        // 2. Prepara a atualização com a Data Literal Local
        const user = window.usuarioLogadoGlobal;
        const payloadUpdate = {
            status: 'Entregue',
            data_entrega: isoEntregaExata, // <-- USANDO A STRING LOCAL 
            usuario_entrega_id: user?.id
        };

        const { error } = await clienteSupabase
            .from('coletas_combustivel')
            .update(payloadUpdate)
            .eq('id', id);

        if (error) throw error;

        // 3. Registro no Log de Auditoria para o Histórico
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'coletas_combustivel',
            id_registro_afetado: String(id),
            acao: 'CONFIRMAR_ENTREGA',
            usuario_id: user?.id,
            dados_antigos: JSON.stringify(coleta),
            dados_novos: JSON.stringify({ ...coleta, ...payloadUpdate }),
            data_hora: agora.toISOString() // O log não interfere na exibição visual da tabela principal
        });

        mostrarToast("Entrega confirmada com sucesso!", "success");
        document.getElementById('modal-confirmar-entrega').classList.remove('active');
        await listarColetas();

    } catch (err) {
        console.error("Erro na confirmação:", err);
        mostrarToast(err.message || "Falha ao processar entrega.", "error");
    }
};

window.verificarConflitoAgenda = async function(placaVeiculo, inicio, fim, idColetaAtual = null) {
    try {
        // 1. Busca a coleta em conflito
        let query = clienteSupabase
            .from('coletas_combustivel')
            .select(`
                id, placa_cavalo, data_hora_inicio, data_hora_previsao_entrega,
                perfis:motorista_id (nome_completo)
            `)
            .eq('placa_cavalo', placaVeiculo)
            .neq('status', 'Entregue')
            .lt('data_hora_inicio', fim)
            .gt('data_hora_previsao_entrega', inicio);

        if (idColetaAtual) query = query.neq('id', idColetaAtual);

        const { data, error } = await query;
        if (error) throw error;
        if (data.length === 0) return null;

        const conflito = data[0];

        // 2. Busca Marca/Modelo do veículo conflitante
        const { data: vInfo } = await clienteSupabase
            .from('veiculos')
            .select('marca, modelo')
            .eq('placa', placaVeiculo)
            .maybeSingle();

        // Retorna o objeto completo para o modal
        return {
            ...conflito,
            marca: vInfo?.marca || 'Não informada',
            modelo: vInfo?.modelo || 'Veículo'
        };
    } catch (err) {
        console.error("Erro na verificação:", err);
        return null;
    }
};

window.calcularPercentualTotal = function() {
    if (!carretasAtuais || carretasAtuais.length === 0) return 0;

    // Soma a capacidade total de todas as carretas atreladas ao cavalo
    const capacidadeTotal = carretasAtuais.reduce((acc, c) => acc + (parseFloat(c.capacidade_tanque) || 0), 0);
    
    // Soma o volume total que foi adicionado na lista de carga
    const volumeTotal = itensCargaGlobal.reduce((acc, i) => acc + (parseFloat(i.volume) || 0), 0);

    if (capacidadeTotal === 0) return 0;

    // Retorna o valor numérico (o log e a tabela cuidam da formatação visual)
    return (volumeTotal / capacidadeTotal) * 100;
};

window.excluirColeta = function(id) {
    const item = listaColetasGlobal.find(c => String(c.id) === String(id));
    if (!item) return;

    // Função interna para formatar a data sem erro de fuso
    const formatar = (iso) => {
        const [d, h] = iso.split('T');
        const [y, m, dia] = d.split('-');
        return `${dia}/${m}/${y} às ${h.slice(0, 5)}`;
    };

    // Alimenta o modal com informações para segurança do usuário
    document.getElementById('excluir-coleta-id').value = id;
    document.getElementById('excluir-detalhe-veiculo').innerText = `Placa: ${item.placa_cavalo}`;
    document.getElementById('excluir-detalhe-data').innerText = `Coleta em: ${formatar(item.data_hora_inicio || item.data_coleta)}`;

    // Abre o modal nativo
    document.getElementById('modal-confirmar-exclusao').classList.add('active');
};

window.executarExclusaoDefinitiva = async function() {
    const id = document.getElementById('excluir-coleta-id').value;
    const btn = document.getElementById('btn-confirmar-delete');
    
    if (!id) return;

    btn.innerText = 'Limpando Base...';
    btn.disabled = true;

    try {
        // 1. REMOVE O REGISTRO PRINCIPAL
        const { error: errDelete } = await clienteSupabase
            .from('coletas_combustivel')
            .delete()
            .eq('id', id);

        if (errDelete) throw errDelete;

        // 2. LIMPEZA DE "LIXO": REMOVE TODOS OS LOGS DESTE ID
        // Filtramos pela tabela afetada e pelo ID do registro para não apagar logs de outros módulos
        const { error: errLogs } = await clienteSupabase
            .from('logs_auditoria')
            .delete()
            .eq('tabela_afetada', 'coletas_combustivel')
            .eq('id_registro_afetado', String(id));

        if (errLogs) {
            console.warn("A coleta foi excluída, mas houve um erro ao limpar os logs:", errLogs);
        }

        mostrarToast("Registro e histórico removidos com sucesso.", "success");
        
        // 3. Fecha modal e atualiza interface
        document.getElementById('modal-confirmar-exclusao').classList.remove('active');
        await listarColetas();

    } catch (err) {
        console.error("Erro na exclusão total:", err);
        mostrarToast("Erro ao processar limpeza: " + err.message, "error");
    } finally {
        btn.innerText = 'Sim, Excluir';
        btn.disabled = false;
    }
};