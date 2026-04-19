// js/controle_epi.js - SCRIPT CORRIGIDO E ISOLADO

let listaEntregasCache = [];
let listaCatalogoCache = [];
let carrinhoItens = []; 

// Controle de Edição
let carrinhoEdicao = []; 
let itensEdicaoRemovidos = []; 
let indexEdicaoTroca = -1;
let registroOriginal = null; 

let modoCatalogo = 'registro';

function inicializarControleEPI() {
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Controle de Entrega de EPIs';
    
    const container = document.getElementById('container-filtros-entregas');
    if (container && container.children.length === 0) {
        adicionarFiltroEntrega();
    }
    
    // FILTRO DE UNIDADE DO RODAPÉ
    const selUnidade = document.getElementById('sel-unidade');
    if (selUnidade) {
        selUnidade.removeEventListener('change', listarEntregas);
        selUnidade.addEventListener('change', listarEntregas);
    }

    listarEntregas();
}

// =============================================================================
// FUNÇÕES AUXILIARES DE DATA
// =============================================================================

function calcularVencimentoSeguro(dataString, diasValidade) {
    if (!diasValidade) return null;
    const partes = dataString.split('-');
    const data = new Date(partes[0], partes[1] - 1, partes[2]);
    data.setDate(data.getDate() + parseInt(diasValidade));
    
    const y = data.getFullYear();
    const m = String(data.getMonth() + 1).padStart(2, '0');
    const d = String(data.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function calcularDiferencaDias(dataStringBanco) {
    if (!dataStringBanco) return null;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const partes = dataStringBanco.split('-');
    const dataItem = new Date(partes[0], partes[1] - 1, partes[2]);
    dataItem.setHours(0, 0, 0, 0);

    if (hoje.getTime() === dataItem.getTime()) return 0;

    const diffTempo = hoje.getTime() - dataItem.getTime();
    const diffDias = Math.ceil(diffTempo / (1000 * 3600 * 24));
    
    return diffDias;
}

// =============================================================================
// LISTAGEM (COM FILTRO DE UNIDADE)
// =============================================================================

async function listarEntregas() {
    const tbody = document.getElementById('tbody-entregas');
    if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Buscando dados...</td></tr>';

    const unidadeSelecionada = document.getElementById('sel-unidade')?.value;

    try {
        const { data, error } = await clienteSupabase
            .from('epi_entregas')
            .select('*, perfis (nome_completo, unidade_id)')
            // ORDENAÇÃO: Primeiro pela data de entrega, depois pelos mais recentes criados
            .order('data_entrega', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1000); 

        if (error) throw error;
        
        let dadosFiltrados = data || [];
        
        if (unidadeSelecionada && unidadeSelecionada !== 'TODAS') {
            dadosFiltrados = dadosFiltrados.filter(item => 
                item.perfis && String(item.perfis.unidade_id) === String(unidadeSelecionada)
            );
        }

        listaEntregasCache = dadosFiltrados;
        aplicarFiltrosEntrega();

    } catch (err) {
        console.error(err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        mostrarToastEPI("Erro ao carregar lista de EPIs.", "erro");
    }
}

function renderizarTabelaEntregas(lista) {
    const tbody = document.getElementById('tbody-entregas');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const contador = document.getElementById('lbl-contagem-entregas');
    if (contador) contador.innerHTML = `Exibindo <strong>${lista.length}</strong> registro(s)`;

    if (lista.length === 0) {
        // Alterado colspan de 6 para 7 para comportar a nova coluna
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">Nenhuma entrega encontrada.</td></tr>';
        return;
    }

    lista.forEach(item => {
        const nomeColaborador = item.perfis ? item.perfis.nome_completo : 'Desconhecido';
        
        const dataPartes = item.data_entrega.split('-');
        const dataFmt = `${dataPartes[2]}/${dataPartes[1]}/${dataPartes[0]}`;
        
        let validadeHtml = '-';
        if (item.data_vencimento) {
            const partesVenc = item.data_vencimento.split('-');
            const venc = new Date(partesVenc[0], partesVenc[1]-1, partesVenc[2]);
            venc.setHours(0,0,0,0);
            const hoje = new Date();
            hoje.setHours(0,0,0,0);
            
            const vencFmt = `${partesVenc[2]}/${partesVenc[1]}/${partesVenc[0]}`;
            
            if (venc < hoje) validadeHtml = `<span style="color:var(--cor-perigo); font-weight:bold;">Vencido (${vencFmt})</span>`;
            else validadeHtml = `<span style="color:var(--cor-sucesso);">Vence em ${vencFmt}</span>`;
        }

        // Garante que tenha pelo menos 1 na quantidade
        const qtd = item.quantidade || 1;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dataFmt}</td>
            <td><b>${nomeColaborador}</b></td>
            <td>${item.epi_nome}</td>
            <td>${item.ca_numero || '-'}</td>
            <td style="text-align: center; font-weight: 600;">${qtd}</td> <td>${validadeHtml}</td>
            <td style="white-space:nowrap;">
                <button class="action-btn" onclick="visualizarEntrega('${item.id}')" title="Visualizar"><i class="fas fa-eye" style="color:#003399;"></i></button>
                <button class="action-btn" onclick="abrirModalLogsEPI('${item.id}')" title="Histórico"><i class="fas fa-history"></i></button>
                <button class="action-btn" onclick="editarEntrega('${item.id}')" title="Editar"><i class="fas fa-edit"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =============================================================================
// FILTROS
// =============================================================================

function adicionarFiltroEntrega() {
    const container = document.getElementById('container-filtros-entregas');
    if (!container) return;
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `row-epi-${id}`;
    div.innerHTML = `
        <select class="filter-select" onchange="configurarInputFiltroEntrega(this, '${id}')">
            <option value="" disabled selected>Filtrar por...</option>
            <option value="colaborador">Colaborador</option>
            <option value="epi">EPI</option>
            <option value="ca">C.A.</option>
            <option value="data">Data</option>
        </select>
        <div id="wrapper-val-epi-${id}"><input type="text" class="filter-select" disabled placeholder="Selecione..."></div>
        <button class="btn-remove-filter" onclick="removerFiltroEntrega('${id}')"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

function removerFiltroEntrega(id) { 
    const el = document.getElementById(`row-epi-${id}`);
    if (el) el.remove(); 
    aplicarFiltrosEntrega(); 
}

function configurarInputFiltroEntrega(select, id) {
    const wrapper = document.getElementById(`wrapper-val-epi-${id}`);
    if (!wrapper) return;
    wrapper.innerHTML = '';
    const tipo = select.value;
    
    if (tipo === 'colaborador') {
        const sel = document.createElement('select');
        sel.className = 'filter-select';
        const nomesUnicos = [...new Set(listaEntregasCache.map(i => i.perfis ? i.perfis.nome_completo : '').filter(n => n))].sort();
        sel.innerHTML = '<option value="">Todos</option>';
        nomesUnicos.forEach(nome => {
            sel.innerHTML += `<option value="${nome}">${nome}</option>`;
        });
        sel.onchange = aplicarFiltrosEntrega;
        wrapper.appendChild(sel);
    } 
    else {
        const input = document.createElement('input');
        input.className = 'filter-select';
        if (tipo === 'data') input.type = 'date';
        else { input.type = 'text'; input.placeholder = "Digite..."; }
        input.onchange = aplicarFiltrosEntrega;
        input.onkeyup = aplicarFiltrosEntrega;
        wrapper.appendChild(input);
        if(tipo !== 'data') input.focus();
    }
}

function aplicarFiltrosEntrega() {
    let filtrados = [...listaEntregasCache];
    let descricoesFiltros = []; // Array para armazenar os textos da legenda

    const container = document.getElementById('container-filtros-entregas');
    if (container) {
        const rows = container.querySelectorAll('.filter-row');
        
        rows.forEach(row => {
            // 1. Identifica o Tipo do Filtro
            const selectTipo = row.querySelector('select');
            const tipo = selectTipo ? selectTipo.value : '';
            // Pega o texto visual do tipo (ex: "Colaborador", "Data")
            const tipoTexto = selectTipo.options[selectTipo.selectedIndex].text;

            // 2. Identifica o Valor do Filtro
            // O ID do wrapper é dinâmico, então buscamos pelo padrão ou pelo filho
            const wrapper = row.querySelector('div[id^="wrapper-val-epi-"]');
            const campoValor = wrapper ? wrapper.querySelector('input, select') : null;

            if (!campoValor || !campoValor.value) return;

            const val = campoValor.value.toLowerCase();
            let valTexto = campoValor.value; // Texto para exibição na legenda

            // Se for SELECT, pega o texto da opção selecionada (ex: Nome do Colaborador)
            if (campoValor.tagName === 'SELECT' && campoValor.selectedIndex >= 0) {
                valTexto = campoValor.options[campoValor.selectedIndex].text;
            } 
            // Se for DATA, formata para PT-BR
            else if (tipo === 'data') {
                const parts = valTexto.split('-');
                if (parts.length === 3) valTexto = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }

            // Adiciona à lista de legendas
            descricoesFiltros.push(`<b>${tipoTexto}:</b> ${valTexto}`);

            // 3. Aplica a Filtragem nos Dados
            filtrados = filtrados.filter(item => {
                if (tipo === 'colaborador') {
                    // Compara texto parcial ou exato dependendo da sua preferência
                    // Como o select traz nomes exatos, comparamos o nome
                    return item.perfis?.nome_completo.toLowerCase().includes(val);
                }
                if (tipo === 'epi') {
                    return item.epi_nome.toLowerCase().includes(val);
                }
                if (tipo === 'ca') {
                    return item.ca_numero && item.ca_numero.toLowerCase().includes(val);
                }
                if (tipo === 'data') {
                    return item.data_entrega === campoValor.value; // Compara valor cru (YYYY-MM-DD)
                }
                return true;
            });
        });
    }

    // 4. Atualiza a Barra de Legenda (Stats Bar)
    const lblFiltros = document.getElementById('lbl-filtros-epi-ativos');
    if (lblFiltros) {
        if (descricoesFiltros.length > 0) {
            lblFiltros.innerHTML = `<i class="fas fa-filter"></i> ${descricoesFiltros.join(' <span style="margin:0 5px; color:#ccc;">|</span> ')}`;
            lblFiltros.style.color = '#003399'; // Destaque visual
        } else {
            lblFiltros.innerHTML = `<i class="fas fa-filter"></i> Mostrando todos os registros`;
            lblFiltros.style.color = '#666';
        }
    }

    renderizarTabelaEntregas(filtrados);
}

// =============================================================================
// REGISTRO (MODAL E CARRINHO)
// =============================================================================

async function abrirModalRegistroEPI() {
    modoCatalogo = 'registro';
    await carregarColaboradores('sel-colaborador-entrega');
    
    const inputData = document.getElementById('data-entrega-input');
    const inputObs = document.getElementById('obs-entrega-input');
    
    // CORREÇÃO DA DATA: Garante a data atual no fuso horário local (Brasil/Brasília)
    if(inputData) {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        inputData.value = `${ano}-${mes}-${dia}`;
    }

    if(inputObs) inputObs.value = '';
    
    carrinhoItens = [];
    atualizarCarrinhoUI();
    const modal = document.getElementById('modal-registro-epi');
    if (modal) modal.classList.add('active');
}

async function carregarColaboradores(elementId) {
    const sel = document.getElementById(elementId);
    if(!sel) return;
    
    const valorAtual = sel.value;
    sel.innerHTML = '<option>Carregando...</option>';
    
    const unidadeSelecionada = document.getElementById('sel-unidade')?.value;

    try {
        let query = clienteSupabase
            .from('perfis')
            .select('id, nome_completo, unidade_id, matricula') 
            .eq('ativo', true)
            .order('nome_completo');
        
        if (unidadeSelecionada && unidadeSelecionada !== 'TODAS') {
            query = query.eq('unidade_id', unidadeSelecionada);
        }

        const { data, error } = await query;
        sel.innerHTML = '<option value="">Selecione...</option>';
        
        if (data) {
            // --- LÓGICA DE FILTRAGEM DE NOMES DUPLICADOS ---
            const nomesVistos = new Set();
            
            data.forEach(p => {
                const nomeLimpo = p.nome_completo.trim();
                
                // Só adiciona ao select se o nome ainda não foi processado
                if (!nomesVistos.has(nomeLimpo)) {
                    nomesVistos.add(nomeLimpo);
                    
                    const mat = p.matricula ? p.matricula : 'N/D';
                    sel.innerHTML += `<option value="${p.id}" data-matricula="${mat}">${nomeLimpo}</option>`;
                }
            });
            
            if(valorAtual) sel.value = valorAtual;
        }
    } catch(e) { 
        console.error("Erro ao carregar colaboradores:", e); 
    }
}

function fecharModalRegistroEPI() {
    const modal = document.getElementById('modal-registro-epi');
    if (modal) modal.classList.remove('active');
}

function atualizarCarrinhoUI() {
    const container = document.getElementById('lista-carrinho-epi');
    if (!container) return;
    container.innerHTML = '';
    if (carrinhoItens.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #999; padding: 20px; border: 2px dashed #ddd; border-radius: 8px;">Nenhum item adicionado.</div>`;
        return;
    }
    carrinhoItens.forEach((item, index) => {
        const histHtml = montarHtmlHistorico(item.historico);
        const div = document.createElement('div');
        div.className = 'cart-item-card';
        div.innerHTML = `
            <div class="cart-info"><h4>${item.nome}</h4><p>C.A.: ${item.ca_numero || 'N/A'}</p></div>
            <div class="cart-history">${histHtml}</div>
            <div class="cart-actions">
                <div class="cart-qty-area">
                    <label>Qtd:</label>
                    <input type="number" class="cart-qty-input" value="${item.qtd || 1}" min="1" onchange="atualizarQtdCarrinho(${index}, this.value, 'registro')">
                </div>
                <button class="btn-trash" onclick="removerDoCarrinho(${index})"><i class="fas fa-trash-alt"></i></button>
            </div>
        `;
        container.appendChild(div);
    });
}

function atualizarQtdCarrinho(index, qtd, contexto) { 
    const v = parseInt(qtd < 1 ? 1 : qtd);
    if (contexto === 'registro') {
        carrinhoItens[index].qtd = v;
    } else {
        carrinhoEdicao[index].qtd = v;
        formFeriasSujo = true; // Assumindo que você usa alguma variável de controle global de dirty form para o EPI
    }
}


function removerDoCarrinho(index) { carrinhoItens.splice(index, 1); atualizarCarrinhoUI(); }

// =============================================================================
// CATÁLOGO
// =============================================================================

async function abrirModalCatalogo(modo, indexTroca = -1) {
    modoCatalogo = modo;
    indexEdicaoTroca = indexTroca;

    let colabId = (modo === 'registro') ? document.getElementById('sel-colaborador-entrega').value : document.getElementById('edit-sel-colaborador').value;
    if (!colabId) { mostrarToastEPI("Selecione o colaborador primeiro.", "erro"); return; }

    const modal = document.getElementById('modal-catalogo');
    const tbody = document.getElementById('tbody-catalogo');
    
    const inputFiltro = document.getElementById('filtro-catalogo-input');
    if(inputFiltro) inputFiltro.value = '';

    if (tbody) tbody.innerHTML = '<tr><td colspan="4" class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    if (modal) modal.classList.add('active');

    try {
        const { data } = await clienteSupabase.from('epis').select('*').eq('ativo', true).order('nome').limit(1000);
        listaCatalogoCache = data || [];
        renderizarCatalogo(listaCatalogoCache);
    } catch (e) { console.error(e); }
}

function renderizarCatalogo(lista) {
    const tbody = document.getElementById('tbody-catalogo');
    if (!tbody) return;
    tbody.innerHTML = '';
    lista.forEach(epi => {
        const epiJson = JSON.stringify(epi).replace(/"/g, '&quot;');
        tbody.innerHTML += `
            <tr>
                <td><b>${epi.nome}</b></td>
                <td>${epi.ca_numero || '-'}</td>
                <td>${epi.validade_dias || '-'}</td>
                <td class="text-center"><button class="btn-add-green" onclick="selecionarItemCatalogo(${epiJson})"><i class="fas fa-plus"></i></button></td>
            </tr>`;
    });
}

function filtrarCatalogoUI() {
    const v = document.getElementById('filtro-catalogo-input').value.toLowerCase();
    renderizarCatalogo(listaCatalogoCache.filter(e => e.nome.toLowerCase().includes(v) || (e.ca_numero && e.ca_numero.includes(v))));
}

function fecharModalCatalogo() { 
    const modal = document.getElementById('modal-catalogo');
    if(modal) modal.classList.remove('active'); 
}

async function selecionarItemCatalogo(epi) {
    let colabId = (modoCatalogo === 'registro') ? document.getElementById('sel-colaborador-entrega').value : document.getElementById('edit-sel-colaborador').value;
    
    // Busca histórico baseada no NOME, pois o ID pode mudar ou não ser relevante para o histórico visual
    const hist = await buscarUltimaEntrega(colabId, epi.nome);
    
    // [LÓGICA SNAPSHOT] 
    // Criamos um objeto que copia explicitamente os dados vitais do EPI.
    // Assim, 'epi_nome' e 'ca_numero' ficam gravados neste item do carrinho.
    const itemObj = { 
        ...epi, 
        epi_nome: epi.nome, // Força a criação da propriedade usada no banco
        ca_numero: epi.ca_numero, // Garante que o CA atual do catálogo seja o usado
        dias_validade: epi.validade_dias, // Cópia da validade atual
        qtd: 1, 
        historico: hist 
    };

    if (modoCatalogo === 'registro') {
        carrinhoItens.push(itemObj);
        atualizarCarrinhoUI();
    } 
    else if (modoCatalogo === 'edicao_adicionar') {
        carrinhoEdicao.push({
            id: null,
            epi_nome: itemObj.epi_nome,
            ca_numero: itemObj.ca_numero,
            dias_validade: itemObj.dias_validade,
            historico: hist,
            isNew: true
        });
        renderizarCarrinhoEdicaoEPI(false);
    }
    else if (modoCatalogo === 'edicao_trocar' && indexEdicaoTroca >= 0) {
        // Na troca, substituímos os dados antigos pelos novos do catálogo
        const itemOriginal = carrinhoEdicao[indexEdicaoTroca];
        carrinhoEdicao[indexEdicaoTroca] = {
            ...itemOriginal,
            epi_nome: itemObj.epi_nome,
            ca_numero: itemObj.ca_numero,
            dias_validade: itemObj.dias_validade,
            historico: hist
        };
        renderizarCarrinhoEdicaoEPI(false);
    }
    
    fecharModalCatalogo();
}

async function buscarUltimaEntrega(colabId, epiNome) {
    try {
        const { data } = await clienteSupabase.from('epi_entregas')
            .select('data_entrega')
            .eq('perfil_id', colabId).eq('epi_nome', epiNome)
            .order('data_entrega', { ascending: false }).limit(1).maybeSingle(); 
        
        if (data) {
            const diasDiff = calcularDiferencaDias(data.data_entrega);
            const partes = data.data_entrega.split('-');
            
            return { 
                dataFmt: `${partes[2]}/${partes[1]}/${partes[0]}`, 
                diasDiff: diasDiff 
            };
        }
    } catch(e) { return null; }
}

function montarHtmlHistorico(hist) {
    if (!hist) return `<span class="hist-label">Última Entrega</span><span class="hist-date" style="color:#999;">Nunca</span>`;
    
    let textoTempo = '';
    let cor = '#28a745';

    if (hist.diasDiff === 0) {
        textoTempo = 'Hoje';
        cor = '#003399'; 
    } else if (hist.diasDiff === 1) {
        textoTempo = 'Ontem';
        cor = '#666';
    } else {
        textoTempo = `Há ${hist.diasDiff} dias`;
        if (hist.diasDiff > 365) cor = '#dc3545';
    }

    // [CORREÇÃO]: Inserido 'margin-left: 5px;' na tag do texto de tempo para afastar da data
    return `<span class="hist-label">Última Entrega</span><span class="hist-date">${hist.dataFmt}</span><span style="margin-left: 5px; font-size:10px; color: ${cor}; font-weight: bold;">${textoTempo}</span>`;
}

// =============================================================================
// SALVAR NOVO
// =============================================================================
async function salvarEntregaCompleta() {
    const pId = document.getElementById('sel-colaborador-entrega').value;
    const dt = document.getElementById('data-entrega-input').value;
    const obs = document.getElementById('obs-entrega-input').value;

    if (!pId || !dt || carrinhoItens.length === 0) { 
        mostrarToastEPI("Preencha todos os dados e adicione itens.", "erro"); 
        return; 
    }

    try {
        let inserts = [];
        carrinhoItens.forEach(i => {
            const venc = calcularVencimentoSeguro(dt, i.dias_validade || i.validade_dias);
            
            // [CORREÇÃO]: Agora insere apenas 1 registro com a coluna 'quantidade' preenchida
            inserts.push({ 
                perfil_id: pId, 
                epi_nome: i.epi_nome || i.nome, 
                ca_numero: i.ca_numero, 
                dias_validade: i.dias_validade || i.validade_dias, 
                data_entrega: dt,
                data_vencimento: venc, 
                observacao: obs,
                quantidade: i.qtd || 1 // Grava a quantidade na coluna
            });
        });

        const { data, error } = await clienteSupabase.from('epi_entregas').insert(inserts).select();
        if (error) throw error;

        if (data && data.length > 0) {
            for (const novoItem of data) {
                await registrarLogEPI(novoItem.id, 'INSERT', null, novoItem);
            }
        }

        mostrarToastEPI("Salvo com sucesso!", "sucesso");
        fecharModalRegistroEPI();
        listarEntregas();
    } catch(e) { 
        console.error(e);
        mostrarToastEPI("Erro: " + e.message, "erro"); 
    }
}

// =============================================================================
// EDIÇÃO E VISUALIZAÇÃO (FUNÇÕES RENOMEADAS PARA EVITAR CONFLITO COM UNIFORMES)
// =============================================================================

function visualizarEntrega(id) { abrirModalEdicaoEPI(id, true); }
function editarEntrega(id) { abrirModalEdicaoEPI(id, false); }

async function abrirModalEdicaoEPI(id, readonly) {
    const reg = listaEntregasCache.find(x => x.id == id);
    if (!reg) return;

    registroOriginal = {
        perfil_id: reg.perfil_id,
        data_entrega: reg.data_entrega,
        observacao: reg.observacao || '',
        epi_nome: reg.epi_nome,
        ca_numero: reg.ca_numero,
        dias_validade: reg.dias_validade,
        comprovante_url: reg.comprovante_url,
        quantidade: reg.quantidade || 1 // Snapshot da quantidade
    };

    await carregarColaboradores('edit-sel-colaborador');
    document.getElementById('edit-sel-colaborador').value = reg.perfil_id;

    carrinhoEdicao = [];
    itensEdicaoRemovidos = [];
    
    const itemInicial = {
        id: reg.id,
        epi_nome: reg.epi_nome, 
        ca_numero: reg.ca_numero,
        dias_validade: reg.dias_validade,
        qtd: reg.quantidade || 1, // Preenche a quantidade no carrinho de edição
        historico: null 
    };
    
    carrinhoEdicao.push(itemInicial);

    document.getElementById('edit-data-input').value = reg.data_entrega;
    document.getElementById('edit-obs-input').value = reg.observacao || '';
    
    const titulo = document.getElementById('titulo-modal-edicao');
    const inputs = document.querySelectorAll('#modal-editar-completo input, #modal-editar-completo select');
    const btnAdd = document.getElementById('btn-add-item-edicao');
    const btnSalvar = document.getElementById('btn-salvar-edicao');
    const btnExcluir = document.getElementById('btn-excluir-reg');

    if(readonly) {
        if(titulo) titulo.innerText = "Visualizar Entrega";
        if(btnAdd) btnAdd.style.display = 'none';
        if(btnSalvar) btnSalvar.style.display = 'none';
        if(btnExcluir) btnExcluir.style.display = 'none';
        inputs.forEach(i => i.disabled = true);
    } else {
        if(titulo) titulo.innerText = "Editar Entrega";
        if(btnAdd) btnAdd.style.display = 'block';
        if(btnSalvar) btnSalvar.style.display = 'block';
        if(btnExcluir) btnExcluir.style.display = 'block';
        inputs.forEach(i => i.disabled = false);
    }

    const btnAnexo = document.getElementById('btn-anexo-epi');
    const btnVerAnexo = document.getElementById('btn-ver-anexo-epi');
    const inputAnexo = document.getElementById('input-anexo-epi');
    if(inputAnexo) inputAnexo.value = '';

    if(btnAnexo) {
        btnAnexo.innerHTML = '<i class="fas fa-paperclip"></i> <span>Anexar</span>';
        btnAnexo.classList.remove('has-file');
        btnAnexo.title = "Anexar documento assinado";
        btnAnexo.disabled = readonly; 
    }
    
    if(btnVerAnexo) {
        btnVerAnexo.style.display = 'none';
        btnVerAnexo.dataset.url = '';
    }

    if (reg.comprovante_url) {
        if(btnAnexo) {
            btnAnexo.innerHTML = '<i class="fas fa-sync-alt"></i> <span>Alterar Arq.</span>';
            btnAnexo.classList.add('has-file');
            btnAnexo.title = "Substituir documento existente";
        }
        if(btnVerAnexo) {
            btnVerAnexo.style.display = 'inline-flex';
            btnVerAnexo.dataset.url = reg.comprovante_url;
        }
    }

    const modal = document.getElementById('modal-editar-completo');
    if(modal) modal.classList.add('active');

    setTimeout(() => {
        renderizarCarrinhoEdicaoEPI(readonly);
    }, 50);

    buscarUltimaEntrega(reg.perfil_id, reg.epi_nome).then(hist => {
        if(carrinhoEdicao[0] && carrinhoEdicao[0].id === reg.id) {
            carrinhoEdicao[0].historico = hist;
            renderizarCarrinhoEdicaoEPI(readonly); 
        }
    });
}

function renderizarCarrinhoEdicaoEPI(readonly) {
    const container = document.getElementById('lista-itens-edicao');
    if(!container) return; 
    container.innerHTML = '';

    if (carrinhoEdicao.length === 0) {
        container.innerHTML = '<div style="padding:15px; color:#999; text-align:center;">Nenhum item.</div>';
        return;
    }

    carrinhoEdicao.forEach((item, index) => {
        const histHtml = montarHtmlHistorico(item.historico);
        const div = document.createElement('div');
        div.className = 'cart-item-card';
        div.style.animation = 'fadeIn 0.3s ease';
        
        const nomeExibido = item.epi_nome || item.nome || 'EPI Sem Nome';

        let botoesAcao = '';
        if (!readonly) {
            botoesAcao = `
                <div class="cart-qty-area" style="margin-right: 15px;">
                    <label>Qtd:</label>
                    <input type="number" class="cart-qty-input" value="${item.qtd || 1}" min="1" onchange="atualizarQtdCarrinho(${index}, this.value, 'edicao')">
                </div>
                <div style="display:flex; gap:10px;">
                    <button class="btn-sync" onclick="abrirModalCatalogo('edicao_trocar', ${index})" title="Trocar Item">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                    <button class="btn-trash" onclick="removerItemEdicao(${index})" title="Remover">
                        <i class="fas fa-trash-alt"></i>
                    </button>
                </div>
            `;
        } else {
             botoesAcao = `
                <div class="cart-qty-area" style="margin-right: 15px;">
                    <label>Qtd:</label>
                    <span style="font-weight: bold;">${item.qtd || 1}</span>
                </div>
                <i class="fas fa-check-circle" style="color:#ccc;" title="Item registrado"></i>
             `;
        }

        div.innerHTML = `
            <div class="cart-info"><h4>${nomeExibido}</h4><p>C.A.: ${item.ca_numero || 'N/A'}</p></div>
            <div class="cart-history">${histHtml}</div>
            <div class="cart-actions" style="display:flex; align-items:center;">
                ${botoesAcao}
            </div>
        `;
        container.appendChild(div);
    });
}

function removerItemEdicao(index) {
    const item = carrinhoEdicao[index];
    if (item.id) itensEdicaoRemovidos.push(item.id);
    carrinhoEdicao.splice(index, 1);
    renderizarCarrinhoEdicaoEPI(false); // Chama a função correta
}

function fecharModalEdicao(forcar = false) {
    // 1. Verifica se houve mudanças reais comparando com o registro original
    // Se não for 'forcar' (clique direto) E houver alterações pendentes:
    if (!forcar && verificarAlteracoes()) {
        // Tenta usar a função global de confirmação bonita, ou fallback para o nativo
        if (typeof window.solicitarConfirmacao === 'function') {
            window.solicitarConfirmacao(() => {
                fecharModalEdicao(true); // Chama recursivamente forçando o fechamento
            }, "Existem alterações não salvas. Deseja sair e perder o progresso?");
        } else {
            if (confirm("Existem alterações não salvas. Deseja sair e perder o progresso?")) {
                fecharModalEdicao(true);
            }
        }
        return; // Interrompe o fechamento
    }

    // 2. Limpeza e Fechamento
    const modal = document.getElementById('modal-editar-completo');
    if (modal) modal.classList.remove('active');
    
    // Reseta variáveis de controle
    registroOriginal = null;
    carrinhoEdicao = [];
    itensEdicaoRemovidos = [];
}

// Verifica se houve mudanças reais antes de salvar
function verificarAlteracoes() {
    if (!registroOriginal) return true; 

    const pId = document.getElementById('edit-sel-colaborador').value;
    const dt = document.getElementById('edit-data-input').value;
    const obs = document.getElementById('edit-obs-input').value;

    if (String(pId) !== String(registroOriginal.perfil_id)) return true;
    if (dt !== registroOriginal.data_entrega) return true;
    if (obs !== registroOriginal.observacao) return true;

    if (carrinhoEdicao.length !== 1) return true; 
    if (itensEdicaoRemovidos.length > 0) return true;

    const itemAtual = carrinhoEdicao[0];
    if (itemAtual.epi_nome !== registroOriginal.epi_nome) return true;
    if (itemAtual.ca_numero !== registroOriginal.ca_numero) return true;
    if (String(itemAtual.dias_validade) !== String(registroOriginal.dias_validade)) return true;
    if (String(itemAtual.qtd || 1) !== String(registroOriginal.quantidade || 1)) return true; // Adicionado cheque de quantidade

    return false; 
}

async function salvarEdicaoCompleta() {
    const pId = document.getElementById('edit-sel-colaborador').value;
    const dt = document.getElementById('edit-data-input').value;
    const obs = document.getElementById('edit-obs-input').value;

    if (!pId || !dt) { 
        mostrarToastEPI("Preencha colaborador e data.", "erro"); 
        return; 
    }
    
    if (carrinhoEdicao.length === 0) { 
        mostrarToastEPI("A entrega deve ter pelo menos um item.", "erro"); 
        return; 
    }

    const houveAlteracao = verificarAlteracoes();
    if (!houveAlteracao) {
        mostrarToastEPI("Nenhuma alteração foi realizada.", "aviso");
        return;
    }

    const btnSalvar = document.getElementById('btn-salvar-edicao');
    if(btnSalvar) {
        btnSalvar.innerText = "Salvando...";
        btnSalvar.disabled = true;
    }

    try {
        if (itensEdicaoRemovidos.length > 0) {
            const { data: itensParaDeletar } = await clienteSupabase
                .from('epi_entregas')
                .select('*')
                .in('id', itensEdicaoRemovidos);

            const { error: errDel } = await clienteSupabase
                .from('epi_entregas')
                .delete()
                .in('id', itensEdicaoRemovidos);

            if (errDel) throw errDel;

            if (itensParaDeletar) {
                for (const itemDel of itensParaDeletar) {
                    await registrarLogEPI(itemDel.id, 'DELETE', itemDel, null);
                }
            }
        }

        for (const item of carrinhoEdicao) {
            const venc = calcularVencimentoSeguro(dt, item.dias_validade);

            const payload = {
                perfil_id: pId,
                epi_nome: item.epi_nome || item.nome, 
                ca_numero: item.ca_numero,
                data_entrega: dt,
                dias_validade: item.dias_validade,
                data_vencimento: venc,
                observacao: obs,
                quantidade: item.qtd || 1 // Atualiza a quantidade
            };

            if (item.id) {
                let dadosAntigos = null;
                const itemCache = listaEntregasCache.find(x => String(x.id) === String(item.id));
                
                if (itemCache) {
                    dadosAntigos = JSON.parse(JSON.stringify(itemCache));
                } else if (registroOriginal && String(registroOriginal.id) === String(item.id)) {
                    dadosAntigos = registroOriginal;
                }

                const { data, error } = await clienteSupabase
                    .from('epi_entregas')
                    .update(payload)
                    .eq('id', item.id)
                    .select() 
                    .single();

                if (error) throw error;
                await registrarLogEPI(item.id, 'UPDATE', dadosAntigos, data);

            } else {
                const { data, error } = await clienteSupabase
                    .from('epi_entregas')
                    .insert(payload)
                    .select()
                    .single();

                if (error) throw error;
                await registrarLogEPI(data.id, 'INSERT', null, data);
            }
        }
        
        mostrarToastEPI("Alterações salvas com sucesso!", "sucesso");
        fecharModalEdicao(true); 
        listarEntregas();

    } catch(e) { 
        console.error("Erro ao salvar edição:", e);
        mostrarToastEPI("Erro ao salvar: " + e.message, "erro"); 
    } finally {
        if(btnSalvar) {
            btnSalvar.innerText = "Salvar Alterações";
            btnSalvar.disabled = false;
        }
    }
}

function solicitarExclusaoEntrega() {
    const idsParaDeletar = carrinhoEdicao.filter(i => i.id).map(i => i.id);
    const todosOsIds = [...idsParaDeletar, ...itensEdicaoRemovidos];

    if (todosOsIds.length === 0) { 
        mostrarToastEPI("O registro ainda não foi salvo no banco.", "erro");
        return; 
    }
    
    const modal = document.getElementById('modal-confirmacao');
    if(modal) modal.classList.add('active');
}

function fecharModalConfirmacao() { 
    const modal = document.getElementById('modal-confirmacao');
    if(modal) modal.classList.remove('active'); 
}

async function confirmarExclusaoUI() {
    fecharModalConfirmacao();
    const idsParaDeletar = carrinhoEdicao.filter(i => i.id).map(i => i.id);
    const todosOsIds = [...idsParaDeletar, ...itensEdicaoRemovidos];
    
    try {
        if(todosOsIds.length > 0) {
            // Busca dados para o log antes de excluir
            const { data: dadosParaLog } = await clienteSupabase.from('epi_entregas').select('*').in('id', todosOsIds);

            const { error } = await clienteSupabase.from('epi_entregas').delete().in('id', todosOsIds);
            if(error) throw error;

            // Grava logs
            if(dadosParaLog) {
                for(const item of dadosParaLog) {
                    await registrarLogEPI(item.id, 'DELETE', item, null);
                }
            }
        }
        mostrarToastEPI("Excluído com sucesso!", "sucesso");
        fecharModalEdicao();
        listarEntregas();
    } catch(e) { mostrarToastEPI("Erro: " + e.message, "erro"); }
}

function mostrarToastEPI(mensagem, tipo = 'sucesso') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        document.body.appendChild(container);
    }

    let iconClass = 'fa-check-circle';
    let typeClass = 'smart-toast-success'; 
    
    const tipoLower = tipo.toLowerCase();
    
    if (tipoLower === 'erro' || tipoLower === 'error') {
        iconClass = 'fa-times-circle';
        typeClass = 'smart-toast-error';
    } else if (tipoLower === 'aviso' || tipoLower === 'warning') {
        iconClass = 'fa-exclamation-triangle';
        typeClass = 'smart-toast-warning';
    }

    const toast = document.createElement('div');
    toast.className = `smart-toast ${typeClass}`;
    toast.innerHTML = `<i class="fas ${iconClass}"></i><span class="smart-toast-msg">${mensagem}</span>`;
    container.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { 
            if (toast.parentElement) toast.parentElement.removeChild(toast); 
        }, 400); 
    }, 3000);
}

// =============================================================================
// GESTÃO DE DOCUMENTOS E IMPRESSÃO
// =============================================================================

function imprimirTermoAtual() {
    // 1. Coleta de Dados (Mesma lógica original)
    const selColab = document.getElementById('edit-sel-colaborador');
    const selectedOption = selColab.options[selColab.selectedIndex];
    
    const nomeColaborador = selectedOption.text;
    const matricula = selectedOption.getAttribute('data-matricula') || 'N/D';
    
    const dataEntregaVal = document.getElementById('edit-data-input').value;
    let dataFormatada = '___/___/____';
    if(dataEntregaVal) {
        const partes = dataEntregaVal.split('-');
        dataFormatada = `${partes[2]}/${partes[1]}/${partes[0]}`;
    }

    // 2. Lista de Itens (Mesma lógica original)
    let itensHtml = '';
    carrinhoEdicao.forEach(item => {
        const nome = item.epi_nome || item.nome;
        const ca = item.ca_numero || 'N/A';
        const qtd = item.qtd || 1; 
        
        itensHtml += `
            <li style="padding: 8px 0; border-bottom: 1px dashed #ccc; display:flex; justify-content:space-between;">
                <span><strong>EPI:</strong> ${nome} (C.A.: ${ca})</span>
                <span><strong>Qtd:</strong> ${qtd}</span>
            </li>`;
    });

    if (carrinhoEdicao.length === 0) {
        mostrarToastEPI("Não há itens para imprimir.", "erro");
        return;
    }

    // 3. Captura da Logo (Mesma lógica original)
    const imgLogoElement = document.querySelector('.sidebar-header img') || document.querySelector('.logo img') || document.querySelector('img');
    const logoUrl = imgLogoElement ? imgLogoElement.src : '';

    // 4. Montagem do Documento
    // [CORREÇÃO TÉCNICA 1] Usamos '_blank' para evitar conflito de referência de janela
    const win = window.open('', '_blank', 'height=750,width=950');

    // Verificação de bloqueio de popup
    if (!win) {
        mostrarToastEPI("Pop-up bloqueado. Permita pop-ups para imprimir.", "erro");
        return;
    }
    
    win.document.write('<html><head><title>Termo de Entrega de EPI</title>');
    win.document.write('<style>');
    // [CONTEÚDO ORIGINAL] Mantendo exatamente o seu CSS
    win.document.write(`
        @page { margin: 15mm; size: A4; }
        html, body { height: 100%; margin: 0; padding: 0; }
        body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; 
            font-size: 13px; 
            color: #333; 
            display: flex; 
            flex-direction: column; 
            padding: 20px;
            box-sizing: border-box;
        }
        
        .main-content { flex: 1; }

        .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #003366; padding-bottom: 15px; margin-bottom: 30px; }
        .header img { max-height: 55px; object-fit: contain; }
        .header h1 { margin: 0; text-transform: uppercase; font-size: 18px; color: #003366; }
        
        .info-box { background: #f8f9fa; padding: 15px; border: 1px solid #dee2e6; margin-bottom: 25px; border-radius: 4px; }
        .info-row { margin-bottom: 8px; font-size: 14px; }
        .info-label { font-weight: bold; color: #555; width: 130px; display: inline-block; }
        
        .items-box { margin-bottom: 25px; }
        .items-box h3 { font-size: 14px; border-bottom: 1px solid #ccc; padding-bottom: 5px; margin-bottom: 10px; color: #003366; }
        ul { list-style: none; padding: 0; margin: 0; }
        
        .legal-text { 
            text-align: justify; 
            font-size: 12px; 
            background: #fff; 
            padding: 15px; 
            border: 1px solid #e0e0e0; 
            color: #444;
            line-height: 1.4;
        }

        .footer-section { 
            margin-top: auto;
            padding-top: 20px;
            page-break-inside: avoid;
        }

        .date-field { 
            text-align: center; 
            margin-bottom: 40px; 
            font-size: 14px;
        }

        .signatures { display: flex; justify-content: space-between; gap: 40px; }
        .sig-block { flex: 1; text-align: center; border-top: 1px solid #333; padding-top: 10px; font-size: 13px; }
    `);
    win.document.write('</style></head><body>');
    
    // [CONTEÚDO ORIGINAL] Estrutura HTML preservada
    win.document.write(`<div class="main-content">`);
        
        win.document.write(`
            <div class="header">
                <img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'">
                <h1>Termo de Entrega de EPI</h1>
            </div>
        `);

        win.document.write(`
            <div class="info-box">
                <div class="info-row"><span class="info-label">Colaborador:</span> ${nomeColaborador}</div>
                <div class="info-row"><span class="info-label">Matrícula:</span> <strong>${matricula}</strong></div>
                <div class="info-row"><span class="info-label">Data Entrega:</span> ${dataFormatada}</div>
            </div>
        `);

        win.document.write(`
            <div class="items-box">
                <h3>Equipamentos Entregues</h3>
                <ul>${itensHtml}</ul>
            </div>
        `);

        // Texto Legal Original
        win.document.write(`
            <div class="legal-text">
                <strong>Conforme consta na NR (Norma Regulamentadora) nº 6, da portaria 3214/78 - EQUIPAMENTO DE PROTEÇÃO INDIVIDUAL - EPI, inciso 6.7, responsabilidades:</strong><br><br>
                6.7.1 - Cabe ao EMPREGADO, quando ao EPI:<br>
                a) usar, utilizando-o apenas para a finalidade a que se destina;<br>
                b) responsabilizar-se pela guarda e conservação;<br>
                c) comunicar ao empregador qualquer alteração que o torne impróprio para o uso; e<br>
                d) cumprir as determinações do empregador sobre o uso adequado.
            </div>
        `);
    
    win.document.write(`</div>`); // Fim main-content

    win.document.write(`
        <div class="footer-section">
            <div class="date-field">
                Data: _____ / _____ / __________
            </div>

            <div class="signatures">
                <div class="sig-block">
                    <strong>Empregador / Responsável</strong><br>
                    <span style="font-size:11px; color:#666;">(Assinatura do Responsável pela Entrega)</span>
                </div>
                <div class="sig-block">
                    <strong>${nomeColaborador}</strong><br>
                    <span style="font-size:11px; color:#666;">(Assinatura do Empregado)</span>
                </div>
            </div>
        </div>
    `);
    
    // [CORREÇÃO TÉCNICA 2] 
    // Injetamos o script de impressão dentro da janela para disparar apenas no onload.
    // Isso evita o travamento causado pelo setTimeout externo.
    win.document.write(`
        <script>
            window.onload = function() {
                setTimeout(function() { 
                    window.print(); 
                }, 500);
            };
        </script>
    `);

    win.document.write('</body></html>');
    
    // [CORREÇÃO TÉCNICA 3] Fundamental para evitar o spinner eterno e liberar a memória
    win.document.close();
    win.focus();
}

// Gatilho para abrir o seletor de arquivo
function triggerUploadAnexo() {
    const inputAnexo = document.getElementById('input-anexo-epi');
    
    if (inputAnexo) {
        inputAnexo.click();
    } else {
        console.error("Erro: O input de arquivo 'input-anexo-epi' não foi encontrado no DOM.");
        mostrarToastEPI("Erro interno: Campo de anexo não localizado.", "erro");
    }
}

// Processa o arquivo selecionado (PDF ou Imagem)
async function processarUploadAnexo(input) {
    if (input.files && input.files[0]) {
        let file = input.files[0]; // 'let' pois vamos substituir pelo comprimido
        
        if (!registroOriginal || !carrinhoEdicao[0] || !carrinhoEdicao[0].id) {
            mostrarToastEPI("Salve o registro antes de anexar o documento.", "aviso");
            input.value = ''; 
            return;
        }

        const epiId = carrinhoEdicao[0].id;
        const btnAnexo = document.getElementById('btn-anexo-epi');
        const txtOriginal = btnAnexo.innerHTML;
        
        // Feedback Visual
        btnAnexo.innerHTML = '<i class="fas fa-compress-arrows-alt fa-spin"></i> Otimizando...';
        btnAnexo.disabled = true;

        try {
            // 1. TENTA COMPRIMIR O ARQUIVO
            try {
                file = await comprimirImagem(file);
            } catch (errComp) {
                console.warn("Falha na compressão, usando original:", errComp);
            }

            // Atualiza feedback para Upload
            btnAnexo.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

            // Nome do arquivo (sempre .jpg se foi comprimido, ou mantém original se for pdf)
            const fileExt = file.name.split('.').pop();
            const fileName = `termo_${epiId}_${Date.now()}.${fileExt}`;
            const filePath = `termos_epi/${fileName}`; 

            // 2. Upload
            const { error: uploadError } = await clienteSupabase
                .storage
                .from('comprovantes') // Ou 'termos_epi' se você criou o bucket
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            // 3. URL Pública
            const { data: { publicUrl } } = clienteSupabase
                .storage
                .from('comprovantes')
                .getPublicUrl(filePath);

            // 4. Update Banco
            const { error: updateError } = await clienteSupabase
                .from('epi_entregas')
                .update({ comprovante_url: publicUrl })
                .eq('id', epiId);

            if (updateError) throw updateError;

            mostrarToastEPI("Documento vinculado com sucesso!", "sucesso");
            
            const btnVer = document.getElementById('btn-ver-anexo-epi');
            if (btnVer) {
                btnVer.style.display = 'inline-flex';
                btnVer.dataset.url = publicUrl;
            }
            
            btnAnexo.innerHTML = '<i class="fas fa-sync-alt"></i> <span>Alterar Arq.</span>';
            btnAnexo.classList.add('has-file');
            
            const itemCache = listaEntregasCache.find(x => x.id == epiId);
            if(itemCache) itemCache.comprovante_url = publicUrl;
            if(registroOriginal) registroOriginal.comprovante_url = publicUrl;

        } catch (error) {
            console.error("Erro upload:", error);
            mostrarToastEPI("Erro ao enviar: " + error.message, "erro");
            btnAnexo.innerHTML = txtOriginal;
        } finally {
            btnAnexo.disabled = false;
            input.value = ''; 
        }
    }
}

function visualizarAnexoAtual() {
    const btn = document.getElementById('btn-ver-anexo-epi');
    const url = btn.dataset.url;
    if (url) {
        window.open(url, '_blank');
    }
}

// =============================================================================
// UTILITÁRIO DE COMPRESSÃO DE IMAGEM
// =============================================================================
async function comprimirImagem(file) {
    // Se não for imagem (ex: PDF), retorna o arquivo original
    if (!file.type.match(/image.*/)) return file;

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                // Configuração de Redimensionamento
                const maxWidth = 1024; // Máximo de 1024px de largura
                const maxHeight = 1024;
                let width = img.width;
                let height = img.height;

                // Calcula nova proporção
                if (width > height) {
                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                } else {
                    if (height > maxHeight) {
                        width *= maxHeight / height;
                        height = maxHeight;
                    }
                }

                // Cria o Canvas para desenhar a imagem redimensionada
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // Exporta comprimido (JPEG com 70% de qualidade)
                // Isso reduz uma foto de 5MB para ~200KB sem perder legibilidade
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Erro na compressão da imagem'));
                        return;
                    }
                    // Retorna um novo arquivo com o mesmo nome, mas extensão jpg
                    const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                        type: 'image/jpeg',
                        lastModified: Date.now(),
                    });
                    resolve(newFile);
                }, 'image/jpeg', 0.7);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// Abre o modal global de logs (assumindo que existe no app.js, igual ao módulo de Coletas)
window.abrirModalLogsEPI = async function(id) {
    if (!id) return;

    // Mapeamento para traduzir IDs em nomes legíveis no log
    try {
        const [resPerfis] = await Promise.all([
            clienteSupabase.from('perfis').select('id, nome_completo')
        ]);

        const mapaTraducao = {
            'perfil_id': resPerfis.data || []
        };

        if (typeof abrirModalLogsGlobal === 'function') {
            abrirModalLogsGlobal('epi_entregas', String(id), 'Histórico do EPI', mapaTraducao);
        } else {
            console.error("Função abrirModalLogsGlobal não encontrada.");
            mostrarToastEPI("Erro: Visualizador de logs não carregado.", "erro");
        }
    } catch (e) {
        console.error(e);
    }
};

// Função auxiliar para gravar no banco
async function registrarLogEPI(id, acao, dadosAntigos, dadosNovos) {
    try {
        const user = window.usuarioLogadoGlobal || { id: null }; // Tenta pegar usuário logado
        
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'epi_entregas',
            id_registro_afetado: String(id),
            acao: acao, // 'INSERT', 'UPDATE', 'DELETE'
            usuario_id: user.id,
            dados_antigos: dadosAntigos ? JSON.stringify(dadosAntigos) : null,
            dados_novos: dadosNovos ? JSON.stringify(dadosNovos) : null,
            data_hora: new Date().toISOString()
        });
    } catch (err) {
        console.error("Falha ao gravar log de auditoria:", err);
    }
}