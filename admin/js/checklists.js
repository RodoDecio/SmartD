// admin/js/checklists.js

// =============================================================================
// VARIÁVEIS GLOBAIS
// =============================================================================
let listaModelos = [];
let formChecklistSujo = false;

// Arrays temporários (State local)
let tempCategorias = [];
let tempItens = [];

// Controle de edição
let indexCategoriaEdicao = null;
let indexItemEdicao = null;

// Controle de exclusão (Modal Customizado)
let itemParaExcluir = null; // Índice
let tipoExclusao = null;    // 'categoria' ou 'item'

let dadosOriginaisChecklist = null;

let tempVeiculosVinculados = []; 
let listaTodosVeiculos = [];
let listaOpcoesTemp = [];

// =============================================================================
// 1. INICIALIZAÇÃO E LISTAGEM
// =============================================================================

function inicializarChecklists() {
    document.getElementById('titulo-pagina').innerText = 'Gestão de Modelos de Checklist';
    configurarFormularioChecklist();
    carregarCacheVeiculos(); // NOVO: Pré-carrega veículos para o modal
    listarModelos();
}

async function carregarCacheVeiculos() {
    const { data } = await clienteSupabase
        .from('veiculos')
        .select('id, placa, modelo')
        .eq('ativo', true)
        .order('placa');
    listaTodosVeiculos = data || [];
}

async function listarModelos() {
    const tbody = document.getElementById('tbody-checklists');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        const { data: modelos, error } = await clienteSupabase
            .from('modelos_checklist')
            .select('*')
            .order('id', { ascending: false });

        if (error) throw error;
        listaModelos = modelos || [];

        const { data: todosItens } = await clienteSupabase.from('itens_checklist').select('modelo_id');

        tbody.innerHTML = '';
        if (listaModelos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center p-3">Nenhum modelo encontrado.</td></tr>';
            return;
        }

        listaModelos.forEach(m => {
            const qtd = todosItens ? todosItens.filter(i => i.modelo_id === m.id).length : '-';
            const isAtivo = m.ativo === true;
            const classeBadge = isAtivo ? 'badge-ativo' : 'badge-inativo';
            const corIcone = isAtivo ? 'var(--cor-sucesso)' : '#ccc';

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><b>${m.titulo}</b></td>
                <td><small>${m.descricao || ''}</small></td>
                <td><span class="badge badge-coord">${qtd} Itens</span></td>
                <td><span class="badge ${classeBadge}">${isAtivo ? 'ATIVO' : 'INATIVO'}</span></td>
                <td style="white-space: nowrap;">
                    <button class="action-btn" onclick="visualizarChecklist('${m.id}')" title="Visualizar">
                        <i class="fas fa-eye" style="color: #003399;"></i>
                    </button>
                    <button class="action-btn" onclick="abrirModalLogs('${m.id}')" title="Histórico">
                        <i class="fas fa-history"></i>
                    </button>
                    <button class="action-btn" onclick="abrirModalChecklist('${m.id}')" title="Editar">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="action-btn" onclick="alternarStatus('${m.id}', ${isAtivo})" style="color:${corIcone}">
                        <i class="fas ${isAtivo ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao carregar lista: " + err.message, "error");
    }
}

// --- FUNÇÕES DE ALERTA PERSONALIZADO ---
function mostrarAlerta(mensagem) {
    document.getElementById('msg-alerta-texto').innerText = mensagem;
    document.getElementById('modal-alerta').classList.add('active');
}

function fecharModalAlerta() {
    document.getElementById('modal-alerta').classList.remove('active');
}

// =============================================================================
// 2. MODAL PRINCIPAL E NAVEGAÇÃO DE ABAS
// =============================================================================

async function abrirModalChecklist(id = null) {
    formChecklistSujo = false;
    dadosOriginaisChecklist = null;
    
    const modal = document.getElementById('modal-checklist');
    const form = document.getElementById('form-checklist');
    
    form.reset();
    document.getElementById('chk-id').value = '';
    tempCategorias = [];
    tempItens = [];
    tempVeiculosVinculados = []; // Reset da nova aba

    habilitarCamposChecklist(true);

    if (id) {
        document.getElementById('titulo-modal-checklist').innerText = 'Editar Modelo';
        const m = listaModelos.find(x => x.id == id);
        if (m) {
            document.getElementById('chk-id').value = m.id;
            document.getElementById('chk-titulo').value = m.titulo;
            document.getElementById('chk-descricao').value = m.descricao || '';
            
            await carregarDadosDetalhados(id); // Agora carrega também os veículos

            dadosOriginaisChecklist = {
                titulo: m.titulo,
                descricao: m.descricao || '',
                categorias: JSON.stringify(tempCategorias),
                itens: JSON.stringify(tempItens),
                // NOVO: Adiciona veículos no snapshot de validação
                veiculos: JSON.stringify(tempVeiculosVinculados.sort()) 
            };
        }
    } else {
        document.getElementById('titulo-modal-checklist').innerText = 'Novo Modelo';
        tempCategorias = [ { id: `temp_${Date.now()}_1`, nome: 'Geral' } ];
    }

    renderizarCategoriasUI();
    renderizarItensUI();
    renderizarVeiculosUI(); // NOVO: Renderiza a aba 4
    mudarAba('tab-dados'); 
    modal.classList.add('active');
}

async function visualizarChecklist(id) {
    await abrirModalChecklist(id);
    document.getElementById('titulo-modal-checklist').innerText = 'Visualizar Modelo';
    habilitarCamposChecklist(false);
}

function habilitarCamposChecklist(ativo) {
    const form = document.getElementById('form-checklist');
    if (!form) return;

    // 1. Aplica a classe de controle PRIMEIRO
    if (!ativo) {
        form.classList.add('modo-visualizacao');
    } else {
        form.classList.remove('modo-visualizacao');
    }

    // 2. Desabilita inputs e textareas
    form.querySelectorAll('input, textarea').forEach(el => el.disabled = !ativo);
    
    // 3. Desabilita checkboxes de veículos
    document.querySelectorAll('.veiculo-check-card input').forEach(el => el.disabled = !ativo);

    // 4. Gestão do botão principal de salvar
    const btnSalvar = document.getElementById('btn-salvar-checklist');
    if (btnSalvar) btnSalvar.style.display = ativo ? 'block' : 'none';
}

function mudarAba(abaId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.style.display = 'none';
        el.style.removeProperty('display'); 
        el.style.display = 'none'; 
    });
    
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    
    const abaAtual = document.getElementById(abaId);
    // Aba veiculos também usa layout flex/grid
    if(abaId === 'tab-categorias' || abaId === 'tab-itens' || abaId === 'tab-veiculos') {
        abaAtual.style.display = 'flex';
    } else {
        abaAtual.style.display = 'block';
    }
    
    // Mapeamento atualizado
    const mapIndex = { 'tab-dados': 0, 'tab-categorias': 1, 'tab-itens': 2, 'tab-veiculos': 3 };
    const index = mapIndex[abaId];
    if(document.querySelectorAll('.tab-btn')[index]) {
        document.querySelectorAll('.tab-btn')[index].classList.add('active');
    }
}

function renderizarVeiculosUI() {
    const container = document.getElementById('lista-veiculos-container');
    if(!container) return;
    container.innerHTML = '';
    
    listaTodosVeiculos.forEach(v => {
        const isChecked = tempVeiculosVinculados.includes(v.id);
        
        const div = document.createElement('div');
        div.className = 'veiculo-check-card';
        // Estilo inline para garantir visualização correta
        div.style.cssText = `
            background: #fff; border: 1px solid ${isChecked ? '#003399' : '#ddd'}; 
            border-radius: 6px; padding: 10px; cursor: pointer; 
            display: flex; align-items: center; gap: 10px; transition: all 0.2s;
            background-color: ${isChecked ? '#f0f4ff' : '#fff'};
        `;
        
        div.onclick = (e) => toggleVeiculoVinculo(v.id, div);

        div.innerHTML = `
            <input type="checkbox" ${isChecked ? 'checked' : ''} style="pointer-events: none;">
            <div>
                <div style="font-weight:bold; font-size:0.9rem; color:#333;">${v.placa}</div>
                <div style="font-size:0.75rem; color:#666;">${v.modelo}</div>
            </div>
        `;
        
        div.setAttribute('data-search', v.placa.toLowerCase() + ' ' + v.modelo.toLowerCase());
        container.appendChild(div);
    });
}

async function carregarDadosDetalhados(modeloId) {
    // Categorias
    const { data: cats } = await clienteSupabase.from('categorias_checklist').select('*').eq('modelo_id', modeloId).order('ordem');
    tempCategorias = cats || [];

    // Itens
    const { data: its } = await clienteSupabase.from('itens_checklist').select('*').eq('modelo_id', modeloId).order('ordem');
    tempItens = its || [];

    // NOVO: Veículos Vinculados
    const { data: links } = await clienteSupabase.from('checklist_veiculos').select('veiculo_id').eq('modelo_id', modeloId);
    tempVeiculosVinculados = links ? links.map(l => l.veiculo_id) : [];
}

function toggleVeiculoVinculo(id, cardDiv) {
    // [CORREÇÃO] Bloqueia alteração no modo visualização
    const isVisualizacao = document.getElementById('form-checklist').classList.contains('modo-visualizacao');
    if (isVisualizacao) return;

    const chk = cardDiv.querySelector('input');
    const index = tempVeiculosVinculados.indexOf(id);
    
    if (index > -1) {
        tempVeiculosVinculados.splice(index, 1);
        chk.checked = false;
        cardDiv.style.borderColor = '#ddd';
        cardDiv.style.backgroundColor = '#fff';
    } else {
        tempVeiculosVinculados.push(id);
        chk.checked = true;
        cardDiv.style.borderColor = '#003399';
        cardDiv.style.backgroundColor = '#f0f4ff';
    }
    formChecklistSujo = true;
}

function filtrarVeiculosChecklist(texto) {
    const termo = texto.toLowerCase();
    const cards = document.querySelectorAll('#lista-veiculos-container > div');
    cards.forEach(card => {
        const searchVal = card.getAttribute('data-search');
        card.style.display = searchVal.includes(termo) ? 'flex' : 'none';
    });
}

function fecharModalChecklist(force = false) {
    const isVisualizacao = document.getElementById('form-checklist').classList.contains('modo-visualizacao');
    if (isVisualizacao) force = true;

    if(!force && formChecklistSujo) {
        solicitarConfirmacao(() => fecharModalChecklist(true));
        return;
    }
    document.getElementById('modal-checklist').classList.remove('active');
    formChecklistSujo = false;
}

// =============================================================================
// 3. GERENCIAMENTO DE CATEGORIAS
// =============================================================================

function renderizarCategoriasUI() {
    const container = document.getElementById('lista-categorias-container');
    if (!container) return;
    container.innerHTML = '';
    
    const isVisualizacao = document.getElementById('form-checklist').classList.contains('modo-visualizacao');

    if (tempCategorias.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">Nenhuma categoria cadastrada.</p>';
        return;
    }

    tempCategorias.forEach((cat, index) => {
        const div = document.createElement('div');
        div.className = 'cat-item-row';
        
        // Só gera o HTML dos botões se NÃO for visualização
        const botoesHtml = isVisualizacao ? '' : `
            <div style="display:flex; gap:5px;">
                <button type="button" class="action-btn" onclick="editarCategoria(${index})" title="Editar">
                    <i class="fas fa-pencil-alt" style="color:#003399;"></i>
                </button>
                <button type="button" class="btn-remove-filter" onclick="solicitarExclusaoCategoria(${index})" title="Remover">
                    <i class="fas fa-trash"></i>
                </button>
            </div>
        `;

        div.innerHTML = `
            <span><i class="fas fa-folder" style="color:#f0ad4e; margin-right:10px;"></i> <b>${cat.nome}</b></span>
            ${botoesHtml}
        `;
        container.appendChild(div);
    });
}

function abrirModalNovaCategoria() {
    indexCategoriaEdicao = null;
    document.getElementById('cat-nome-input').value = '';
    document.querySelector('#modal-nova-categoria .modal-header').innerText = 'Nova Categoria';
    document.getElementById('modal-nova-categoria').classList.add('active');
    setTimeout(() => document.getElementById('cat-nome-input').focus(), 100);
}

function editarCategoria(index) {
    if (document.getElementById('form-checklist').classList.contains('modo-visualizacao')) return;
    
    indexCategoriaEdicao = index;
    const cat = tempCategorias[index];
    document.getElementById('cat-nome-input').value = cat.nome;
    document.querySelector('#modal-nova-categoria .modal-header').innerText = 'Editar Categoria';
    document.getElementById('modal-nova-categoria').classList.add('active');
    setTimeout(() => document.getElementById('cat-nome-input').focus(), 100);
}

function fecharModalCategoria() {
    document.getElementById('modal-nova-categoria').classList.remove('active');
}

function confirmarAdicaoCategoria() {
    // Prevenção simples: verifica se já existe uma categoria idêntica sendo adicionada (opcional, mas bom para UX)
    const nome = document.getElementById('cat-nome-input').value.trim();
    if (!nome) {
        alert("Digite o nome da categoria.");
        return;
    }
    
    // Evita duplicidade visual se o usuário clicar rápido demais
    const btn = document.querySelector('#modal-nova-categoria .btn-primary');
    btn.disabled = true;

    try {
        if (indexCategoriaEdicao !== null) {
            tempCategorias[indexCategoriaEdicao].nome = nome;
        } else {
            tempCategorias.push({ id: `temp_${Date.now()}`, nome: nome });
        }

        renderizarCategoriasUI();
        renderizarItensUI(); 
        formChecklistSujo = true;
        fecharModalCategoria();
    } finally {
        setTimeout(() => btn.disabled = false, 500); // Reativa após meio segundo
    }
}

// =============================================================================
// 4. GERENCIAMENTO DE ITENS
// =============================================================================

function renderizarItensUI() {
    const container = document.getElementById('lista-itens-container');
    if (!container) return;
    container.innerHTML = '';
    
    const isVisualizacao = document.getElementById('form-checklist').classList.contains('modo-visualizacao');

    tempCategorias.forEach(cat => {
        const itensDaCat = tempItens.filter(i => String(i.categoria_id) === String(cat.id));

        if (itensDaCat.length > 0) {
            const header = document.createElement('div');
            header.style.cssText = "margin-top:15px; margin-bottom:5px; font-weight:bold; color:#555; border-bottom:1px solid #ddd;";
            header.innerText = cat.nome;
            container.appendChild(header);

            itensDaCat.forEach(item => {
                const div = document.createElement('div');
                div.className = 'item-detail-row';
                const realIndex = tempItens.indexOf(item);
                
                const botoesHtml = isVisualizacao ? '' : `
                    <div style="display:flex; gap:5px; align-items:center;">
                        <button type="button" class="action-btn" onclick="editarItem(${realIndex})" title="Editar">
                            <i class="fas fa-pencil-alt" style="color:#003399;"></i>
                        </button>
                        <button type="button" class="btn-remove-filter" style="width:25px; height:25px;" onclick="solicitarExclusaoItem(${realIndex})" title="Remover">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                `;

                div.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">
                        <div>
                            <div style="font-size:14px; font-weight:600; color:#333;">${item.pergunta}</div>
                            <div style="margin-top:4px;">
                                <span class="badge-tipo">${item.tipo_resposta === 'ok_nok' ? 'Conforme/Não' : 'Lista'}</span>
                                <span class="badge-tipo" style="background:#e3f2fd; color:#0d47a1; margin-left:5px;"><i class="fas fa-clock"></i> ${item.sla_horas || 24}h</span>
                            </div>
                        </div>
                        ${botoesHtml}
                    </div>
                `;
                container.appendChild(div);
            });
        }
    });
}

function abrirModalNovoItem() {
    if (tempCategorias.length === 0) {
        alert("Crie pelo menos uma categoria antes de adicionar itens.");
        mudarAba('tab-categorias');
        return;
    }
    
    indexItemEdicao = null;
    document.querySelector('#modal-novo-item .modal-header').innerText = 'Novo Item';
    document.getElementById('modal-novo-item').classList.add('active');
    
    // 1. Popula as categorias primeiro
    popularSelectCategorias();
    
    // 2. Reseta o formulário completamente (garantindo limpeza após edição anterior)
    resetarFormItem();
}

function editarItem(index) {
    if (document.getElementById('form-checklist').classList.contains('modo-visualizacao')) return;

    indexItemEdicao = index;
    const item = tempItens[index];
    document.querySelector('#modal-novo-item .modal-header').innerText = 'Editar Item';
    document.getElementById('modal-novo-item').classList.add('active');
    popularSelectCategorias();
    document.getElementById('item-categoria-select').value = item.categoria_id;
    document.getElementById('item-tipo-select').value = item.tipo_resposta;
    document.getElementById('item-pergunta-input').value = item.pergunta;
    const inputSla = document.getElementById('item-sla-input');
    if(inputSla) inputSla.value = item.sla_horas || 24;
    document.getElementById('chk-exige-foto').checked = item.exige_foto === true;
    document.getElementById('chk-bloqueia-viagem').checked = item.bloqueia_viagem === true;
    listaOpcoesTemp = (item.opcoes_resposta && Array.isArray(item.opcoes_resposta)) ? [...item.opcoes_resposta] : [];
    atualizarInterfaceOpcoes();
    if (item.opcao_nok) document.getElementById('select-opcao-nok').value = item.opcao_nok;
    toggleOpcoesRespostaModal();
}

function resetarFormItem() {
    // 1. Campos Básicos
    document.getElementById('item-tipo-select').value = 'ok_nok';
    document.getElementById('div-opcoes-resposta-modal').style.display = 'none';
    document.getElementById('item-pergunta-input').value = '';
    
    // 2. Reseta Categoria (Seleciona a primeira disponível)
    const catSelect = document.getElementById('item-categoria-select');
    if (catSelect && catSelect.options.length > 0) {
        catSelect.selectedIndex = 0;
    }

    // 3. Reseta SLA para o padrão
    const inputSla = document.getElementById('item-sla-input');
    if(inputSla) inputSla.value = '24'; 
    
    // 4. Reseta Checkboxes
    document.getElementById('chk-exige-foto').checked = false;
    document.getElementById('chk-bloqueia-viagem').checked = false; 

    // 5. Reseta a lista dinâmica e Opção NOK
    listaOpcoesTemp = [];
    const inputAdd = document.getElementById('input-add-opcao');
    if(inputAdd) inputAdd.value = '';
    
    const selectNok = document.getElementById('select-opcao-nok');
    if(selectNok) {
        selectNok.innerHTML = '<option value="">-- Selecione uma opção --</option>';
        selectNok.value = "";
    }

    // Atualiza a UI visual das pílulas
    atualizarInterfaceOpcoes();
}

function popularSelectCategorias() {
    const sel = document.getElementById('item-categoria-select');
    sel.innerHTML = '';
    tempCategorias.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.innerText = cat.nome;
        sel.appendChild(opt);
    });
}

function toggleOpcoesRespostaModal() {
    const tipo = document.getElementById('item-tipo-select').value;
    document.getElementById('div-opcoes-resposta-modal').style.display = (tipo === 'selecao') ? 'block' : 'none';
}

function fecharModalItem() {
    document.getElementById('modal-novo-item').classList.remove('active');
}

function confirmarAdicaoItem() {
    const btn = document.querySelector('#modal-novo-item .btn-primary');
    
    const catId = document.getElementById('item-categoria-select').value;
    const tipo = document.getElementById('item-tipo-select').value;
    const pergunta = document.getElementById('item-pergunta-input').value.trim();
    
    // NOVO: Captura SLA
    const inputSla = document.getElementById('item-sla-input');
    const slaHoras = inputSla ? parseInt(inputSla.value) || 24 : 24;

    const exigeFoto = document.getElementById('chk-exige-foto').checked;
    const bloqueiaViagem = document.getElementById('chk-bloqueia-viagem').checked;
    
    if (!pergunta) { mostrarToast("Digite a pergunta.", "warning"); return; }

    let opcoesJson = null;
    let finalOpcaoNok = null;

    if(tipo === 'selecao') {
        if(listaOpcoesTemp.length < 2) {
            mostrarToast("Adicione pelo menos 2 opções para a lista de seleção.", "warning");
            document.getElementById('input-add-opcao').focus();
            return;
        }
        
        const opcaoNokSelecionada = document.getElementById('select-opcao-nok').value;
        
        if(!opcaoNokSelecionada) {
            mostrarToast("Selecione qual opção será considerada NOK.", "warning");
            return;
        }

        opcoesJson = listaOpcoesTemp;
        finalOpcaoNok = opcaoNokSelecionada;
    }

    btn.disabled = true;

    try {
        const objItem = {
            categoria_id: catId,
            pergunta: pergunta,
            tipo_resposta: tipo,
            opcoes_resposta: opcoesJson,
            opcao_nok: finalOpcaoNok,
            exige_foto: exigeFoto,
            bloqueia_viagem: bloqueiaViagem,
            sla_horas: slaHoras // NOVO: Salva no objeto
        };

        if (indexItemEdicao !== null) {
            const idOriginal = tempItens[indexItemEdicao].id;
            tempItens[indexItemEdicao] = { ...objItem, id: idOriginal };
        } else {
            tempItens.push({ ...objItem, id: `temp_item_${Date.now()}` });
        }

        renderizarItensUI();
        formChecklistSujo = true;
        fecharModalItem();
    } finally {
        setTimeout(() => btn.disabled = false, 500);
    }
}

// =============================================================================
// NOVO: LÓGICA DE EXCLUSÃO COM MODAL CUSTOMIZADO
// =============================================================================

function solicitarExclusaoCategoria(index) {
    itemParaExcluir = index;
    tipoExclusao = 'categoria';
    document.getElementById('msg-exclusao-item').innerHTML = `
        Tem certeza que deseja excluir esta categoria?<br><br>
        <b style="color:red">Atenção:</b> Todas as perguntas vinculadas a ela também serão removidas!
    `;
    document.getElementById('modal-exclusao-item').classList.add('active');
}

function solicitarExclusaoItem(index) {
    itemParaExcluir = index;
    tipoExclusao = 'item';
    const item = tempItens[index];
    document.getElementById('msg-exclusao-item').innerHTML = `
        Deseja excluir a pergunta:<br>
        <b>"${item.pergunta}"</b>?
    `;
    document.getElementById('modal-exclusao-item').classList.add('active');
}

function confirmarExclusaoLista() {
    if (tipoExclusao === 'categoria' && itemParaExcluir !== null) {
        const catId = tempCategorias[itemParaExcluir].id;
        
        // Remove os itens vinculados a essa categoria no array local
        tempItens = tempItens.filter(i => String(i.categoria_id) !== String(catId));
        
        // Remove a categoria
        tempCategorias.splice(itemParaExcluir, 1);
        
        renderizarCategoriasUI();
        renderizarItensUI();
    } 
    // ... restante da função
    formChecklistSujo = true;
    fecharModalExclusao();
}

function fecharModalExclusao() {
    document.getElementById('modal-exclusao-item').classList.remove('active');
    itemParaExcluir = null;
    tipoExclusao = null;
}

// =============================================================================
// 5. SALVAMENTO E UTILITÁRIOS (MANTIDO)
// =============================================================================

async function salvarChecklistCompleto(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-checklist');
    
    const idModelo = document.getElementById('chk-id').value;
    const titulo = document.getElementById('chk-titulo').value.trim();
    const descricao = document.getElementById('chk-descricao').value.trim();

    // 1. VALIDAÇÃO DE ALTERAÇÃO
    if (idModelo && dadosOriginaisChecklist) {
        const normalizar = (key, value) => (value === null || value === undefined) ? "" : value;
        const atualCat = JSON.stringify(tempCategorias, normalizar);
        const atualItens = JSON.stringify(tempItens, normalizar);
        const atualVeic = JSON.stringify(tempVeiculosVinculados.sort(), normalizar);

        const origTitulo = dadosOriginaisChecklist.titulo;
        const origDesc = dadosOriginaisChecklist.descricao;
        const origCat = JSON.stringify(JSON.parse(dadosOriginaisChecklist.categorias), normalizar);
        const origItens = JSON.stringify(JSON.parse(dadosOriginaisChecklist.itens), normalizar);
        const origVeic = JSON.stringify(JSON.parse(dadosOriginaisChecklist.veiculos), normalizar);

        if (titulo === origTitulo && descricao === origDesc && atualCat === origCat && atualItens === origItens && atualVeic === origVeic) {
            mostrarToast("Nenhuma alteração detectada.", "warning");
            return; 
        }
    }

    const txtOriginal = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    try {
        // 2. CAPTURA O ESTADO ANTIGO PARA AUDITORIA
        let snapshotAntigo = null;
        const getPlacaById = (id) => listaTodosVeiculos.find(v => v.id == id)?.placa || `(ID ${id})`;
        const getCatNomeById = (id, listaCats) => listaCats.find(c => c.id == id)?.nome || 'Geral';

        if (idModelo) {
            const { data: mAntigo } = await clienteSupabase.from('modelos_checklist').select('*').eq('id', idModelo).single();
            const { data: cAntigo } = await clienteSupabase.from('categorias_checklist').select('*').eq('modelo_id', idModelo).order('ordem');
            const { data: iAntigo } = await clienteSupabase.from('itens_checklist').select('*').eq('modelo_id', idModelo).order('ordem');
            const { data: vAntigo } = await clienteSupabase.from('checklist_veiculos').select('veiculo_id').eq('modelo_id', idModelo);
            
            if(mAntigo) {
                snapshotAntigo = { 
                    modelo: mAntigo, 
                    categorias: cAntigo || [], 
                    itens: (iAntigo || []).map(i => ({ ...i, nome_categoria: getCatNomeById(i.categoria_id, cAntigo || []) })), 
                    veiculos: (vAntigo || []).map(v => getPlacaById(v.veiculo_id)).sort()
                };
            }
        }

        let finalModeloId = idModelo;

        // 3. GRAVAÇÃO DO MODELO (INSERT OU UPDATE)
        if (idModelo) {
            const { error } = await clienteSupabase.from('modelos_checklist').update({ titulo, descricao }).eq('id', idModelo);
            if(error) throw error;
        } else {
            const { data, error } = await clienteSupabase.from('modelos_checklist').insert([{ titulo, descricao, ativo: true }]).select();
            if(error) throw error;
            finalModeloId = data[0].id;
        }

        // 4. [CORREÇÃO CRÍTICA] LIMPEZA DE ITENS E CATEGORIAS REMOVIDOS
        if (idModelo) {
            const idsCategoriasAtuais = tempCategorias.filter(c => !String(c.id).startsWith('temp_')).map(c => c.id);
            const idsItensAtuais = tempItens.filter(i => !String(i.id).startsWith('temp_')).map(i => i.id);

            // Remove do banco categorias que não estão mais no array temporário
            await clienteSupabase.from('categorias_checklist')
                .delete()
                .eq('modelo_id', finalModeloId)
                .not('id', 'in', `(${idsCategoriasAtuais.join(',') || '0'})`);

            // Remove do banco itens que não estão mais no array temporário
            await clienteSupabase.from('itens_checklist')
                .delete()
                .eq('modelo_id', finalModeloId)
                .not('id', 'in', `(${idsItensAtuais.join(',') || '0'})`);
        }

        // 5. PROCESSAMENTO DE CATEGORIAS
        const mapaIdsCategorias = {}; 
        for (let i = 0; i < tempCategorias.length; i++) {
            const cat = tempCategorias[i];
            if (String(cat.id).startsWith('temp_')) {
                const { data: catNova, error } = await clienteSupabase.from('categorias_checklist').insert([{ modelo_id: finalModeloId, nome: cat.nome, ordem: i + 1 }]).select();
                if (error) throw error;
                mapaIdsCategorias[cat.id] = catNova[0].id;
            } else {
                await clienteSupabase.from('categorias_checklist').update({ nome: cat.nome, ordem: i + 1 }).eq('id', cat.id);
                mapaIdsCategorias[cat.id] = cat.id;
            }
        }

        // 6. PROCESSAMENTO DE ITENS
        for (let i = 0; i < tempItens.length; i++) {
            const item = tempItens[i];
            const realCatId = mapaIdsCategorias[item.categoria_id] || item.categoria_id;
            const payload = {
                modelo_id: finalModeloId,
                categoria_id: realCatId,
                pergunta: item.pergunta,
                tipo_resposta: item.tipo_resposta,
                opcoes_resposta: item.opcoes_resposta, 
                opcao_nok: item.opcao_nok,
                exige_foto: item.exige_foto,
                bloqueia_viagem: item.bloqueia_viagem,
                sla_horas: item.sla_horas || 24,
                ordem: i + 1,
                ativo: true
            };

            if (String(item.id).startsWith('temp_')) {
                await clienteSupabase.from('itens_checklist').insert([payload]);
            } else {
                await clienteSupabase.from('itens_checklist').update(payload).eq('id', item.id);
            }
        }
        
        // 7. SINCRONIZAÇÃO DE VEÍCULOS
        await clienteSupabase.from('checklist_veiculos').delete().eq('modelo_id', finalModeloId);
        if (tempVeiculosVinculados.length > 0) {
            const payloadVeiculos = tempVeiculosVinculados.map(vid => ({ modelo_id: finalModeloId, veiculo_id: vid }));
            await clienteSupabase.from('checklist_veiculos').insert(payloadVeiculos);
        }

        // 8. LOG DE AUDITORIA
        const user = (await clienteSupabase.auth.getUser()).data.user;
        const snapshotNovo = {
            modelo: { titulo, descricao },
            categorias: tempCategorias, 
            itens: tempItens, 
            veiculos: tempVeiculosVinculados.map(vid => getPlacaById(vid)).sort()
        };

        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'modelos_checklist', acao: idModelo ? 'UPDATE' : 'INSERT',
            id_registro_afetado: finalModeloId, usuario_id: user?.id,
            dados_antigos: snapshotAntigo ? JSON.stringify(snapshotAntigo) : null,
            dados_novos: JSON.stringify(snapshotNovo),
            data_hora: new Date().toISOString()
        }]);

        mostrarToast("Modelo atualizado com sucesso!", "success");
        fecharModalChecklist(true);
        listarModelos();

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao salvar: " + err.message, "error");
    } finally {
        btn.innerText = txtOriginal;
        btn.disabled = false;
    }
}

function configurarFormularioChecklist() {
    const form = document.getElementById('form-checklist');
    if(!form) return;
    
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    
    newForm.addEventListener('submit', salvarChecklistCompleto);
    
    newForm.querySelectorAll('input, textarea').forEach(el => {
        el.addEventListener('change', () => formChecklistSujo = true);
    });
}

async function alternarStatus(id, statusAtual) {
    try {
        await clienteSupabase.from('modelos_checklist').update({ ativo: !statusAtual }).eq('id', id);
        mostrarToast("Status atualizado!");
        listarModelos();
    } catch (e) {
        mostrarToast("Erro: " + e.message, "error");
    }
}

async function abrirModalLogs(idRegistro) {
    const modal = document.getElementById('modal-logs');
    const container = document.getElementById('timeline-logs');
    document.getElementById('titulo-modal-logs').innerText = 'Histórico do Checklist'; // Título padrão
    
    container.innerHTML = '<div style="text-align:center; padding:20px"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';
    modal.classList.add('active');

    try {
        const { data: logs } = await clienteSupabase
            .from('logs_auditoria')
            .select('*, perfis(nome_completo)')
            .eq('tabela_afetada', 'modelos_checklist')
            .eq('id_registro_afetado', idRegistro)
            .order('data_hora', { ascending: false });

        container.innerHTML = '';
        if(!logs || logs.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#777">Sem histórico disponível.</p>';
            return;
        }

        logs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'log-item'; // Classe padrão do sistema
            
            const nomeUser = log.perfis ? log.perfis.nome_completo : 'Sistema';
            const dataFmt = new Date(log.data_hora).toLocaleString('pt-BR');

            // Tradução da Ação (Estilo Padrão)
            let acaoTexto = 'DESCONHECIDO';
            if (log.acao === 'INSERT') acaoTexto = 'CRIADO';
            if (log.acao === 'UPDATE') acaoTexto = 'ATUALIZADO';
            if (log.acao === 'UPDATE_STATUS') acaoTexto = 'STATUS ALTERADO';

            let diffHtml = gerarDiffChecklist(log.dados_antigos, log.dados_novos);

            // Estrutura HTML idêntica à Imagem 1 (Veículos)
            item.innerHTML = `
                <div class="log-header">
                    <strong>${dataFmt}</strong> por <span style="color:#003399">${nomeUser}</span>
                </div>
                <div style="margin-top:5px; margin-bottom:10px; font-weight:800; color:#222; text-transform:uppercase;">
                    Ação: ${acaoTexto}
                </div>
                ${diffHtml}
            `;
            container.appendChild(item);
        });
    } catch(e) {
        console.error(e);
        container.innerHTML = '<p style="color:red">Erro ao buscar logs.</p>';
    }
}

function gerarDiffChecklist(jsonAntigo, jsonNovo) {
    if (!jsonAntigo || !jsonNovo) return '<div class="log-diff text-muted">Registro inicial criado.</div>';

    const ant = JSON.parse(jsonAntigo);
    const nov = JSON.parse(jsonNovo);
    let html = '';
    
    const arrow = ' <i class="fas fa-arrow-right" style="font-size:0.8em; color:#666; margin:0 5px;"></i> ';

    // 1. DADOS BÁSICOS
    if (ant.modelo.titulo !== nov.modelo.titulo) {
        html += `<div class="log-diff"><b>Título:</b> ${ant.modelo.titulo} ${arrow} ${nov.modelo.titulo}</div>`;
    }
    if ((ant.modelo.descricao || '') !== (nov.modelo.descricao || '')) {
        html += `<div class="log-diff"><b>Descrição:</b> alterada.</div>`;
    }

    // 2. CATEGORIAS (Por Nome)
    const cAnt = ant.categorias || [];
    const cNov = nov.categorias || [];
    const cNomesAnt = cAnt.map(c => c.nome);
    const cNomesNov = cNov.map(c => c.nome);

    cNomesNov.filter(x => !cNomesAnt.includes(x)).forEach(c => html += `<div class="log-diff" style="color:green"><b>+ Categoria:</b> ${c}</div>`);
    cNomesAnt.filter(x => !cNomesNov.includes(x)).forEach(c => html += `<div class="log-diff" style="color:red"><b>- Categoria:</b> ${c}</div>`);

    // 3. VEÍCULOS
    const vAnt = ant.veiculos || [];
    const vNov = nov.veiculos || [];
    
    vNov.filter(x => !vAnt.includes(x)).forEach(v => html += `<div class="log-diff" style="color:green"><b>+ Veículo:</b> ${v}</div>`);
    vAnt.filter(x => !vNov.includes(x)).forEach(v => html += `<div class="log-diff" style="color:red"><b>- Veículo:</b> ${v}</div>`);

    // 4. ITENS (COMPARAÇÃO PROFUNDA POR ID)
    const iAnt = ant.itens || [];
    const iNov = nov.itens || [];
    const mapAnt = {};
    
    // Mapeia itens antigos pelo ID real
    iAnt.forEach(i => mapAnt[i.id] = i);

    iNov.forEach(novo => {
        // Se o ID é temp_, é novo. Se é ID real, busca no mapa.
        const idBusca = String(novo.id).startsWith('temp_') ? null : novo.id;
        const antigo = idBusca ? mapAnt[idBusca] : null;

        if (!antigo) {
            // Item Novo
            html += `<div class="log-diff" style="color:green"><b>+ Item:</b> "${novo.pergunta}"</div>`;
        } else {
            // Item Existente - Checa mudanças campo a campo
            const nomeItem = novo.pergunta.length > 30 ? novo.pergunta.substring(0,30)+'...' : novo.pergunta;
            const prefix = `<b>Item "${nomeItem}"`;

            // 1. Pergunta (Texto)
            if (antigo.pergunta !== novo.pergunta) {
                html += `<div class="log-diff">${prefix} (Texto):</b> ${antigo.pergunta} ${arrow} ${novo.pergunta}</div>`;
            }

            // 2. Tipo de Resposta
            if (antigo.tipo_resposta !== novo.tipo_resposta) {
                const tipoDe = antigo.tipo_resposta === 'ok_nok' ? 'Conforme/Não' : (antigo.tipo_resposta === 'selecao' ? 'Lista' : 'Texto');
                const tipoPara = novo.tipo_resposta === 'ok_nok' ? 'Conforme/Não' : (novo.tipo_resposta === 'selecao' ? 'Lista' : 'Texto');
                html += `<div class="log-diff">${prefix} (Tipo):</b> ${tipoDe} ${arrow} ${tipoPara}</div>`;
            }

            // 3. Foto Obrigatória
            if (!!antigo.exige_foto !== !!novo.exige_foto) {
                const de = antigo.exige_foto ? 'SIM' : 'NÃO';
                const para = novo.exige_foto ? 'SIM' : 'NÃO';
                html += `<div class="log-diff">${prefix} (Foto Obrig.):</b> ${de} ${arrow} ${para}</div>`;
            }

            // 4. Bloqueia Viagem
            if (!!antigo.bloqueia_viagem !== !!novo.bloqueia_viagem) {
                const de = antigo.bloqueia_viagem ? 'SIM' : 'NÃO';
                const para = novo.bloqueia_viagem ? 'SIM' : 'NÃO';
                html += `<div class="log-diff">${prefix} (Bloqueia Viagem):</b> ${de} ${arrow} ${para}</div>`;
            }

            // 5. Opções da Lista
            const optsAnt = JSON.stringify(antigo.opcoes_resposta || []);
            const optsNov = JSON.stringify(novo.opcoes_resposta || []);
            if (optsAnt !== optsNov) {
                const listaAnt = (antigo.opcoes_resposta || []).join(', ') || '(vazio)';
                const listaNov = (novo.opcoes_resposta || []).join(', ') || '(vazio)';
                html += `<div class="log-diff">${prefix} (Lista):</b> ${listaAnt} ${arrow} ${listaNov}</div>`;
            }

            // 6. Opção NOK
            if ((antigo.opcao_nok || '') !== (novo.opcao_nok || '')) {
                const nokAnt = antigo.opcao_nok || '(sem)';
                const nokNov = novo.opcao_nok || '(sem)';
                html += `<div class="log-diff">${prefix} (Opção NOK):</b> ${nokAnt} ${arrow} ${nokNov}</div>`;
            }

            if ((antigo.sla_horas || 24) !== (novo.sla_horas || 24)) {
                html += `<div class="log-diff">${prefix} (SLA):</b> ${antigo.sla_horas||24}h ${arrow} ${novo.sla_horas||24}h</div>`;
            }

            delete mapAnt[antigo.id]; // Remove do mapa para identificar exclusões
        }
    });

    // Os que sobraram no mapaAnt foram excluídos
    Object.values(mapAnt).forEach(removido => {
        html += `<div class="log-diff" style="color:red"><b>- Item Removido:</b> "${removido.pergunta}"</div>`;
    });

    if (html === '') return '<div class="log-diff text-muted">Salvou sem alterações visíveis.</div>';
    
    return html;
}

function adicionarOpcaoNaLista() {
    const input = document.getElementById('input-add-opcao');
    const valor = input.value.trim();

    if (!valor) return;

    // Evita duplicatas
    if (listaOpcoesTemp.some(o => o.toLowerCase() === valor.toLowerCase())) {
        mostrarToast("Esta opção já foi adicionada.", "warning");
        return;
    }

    listaOpcoesTemp.push(valor);
    input.value = ''; // Limpa campo
    input.focus();
    
    atualizarInterfaceOpcoes();
}

function removerOpcaoDaLista(index) {
    listaOpcoesTemp.splice(index, 1);
    atualizarInterfaceOpcoes();
}

function atualizarInterfaceOpcoes() {
    // 1. Renderiza as Pílulas
    const container = document.getElementById('container-pills-opcoes');
    container.innerHTML = '';

    listaOpcoesTemp.forEach((opt, index) => {
        const pill = document.createElement('div');
        pill.className = 'pill-item';
        pill.innerHTML = `
            <span>${opt}</span>
            <div class="pill-remove" onclick="removerOpcaoDaLista(${index})" title="Remover">
                <i class="fas fa-times" style="font-size: 10px;"></i>
            </div>
        `;
        container.appendChild(pill);
    });

    // 2. Atualiza o Select de NOK (Mantendo a seleção atual se possível)
    const selectNok = document.getElementById('select-opcao-nok');
    const valorAtual = selectNok.value;

    selectNok.innerHTML = '<option value="">-- Selecione uma opção --</option>';
    
    listaOpcoesTemp.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt;
        option.innerText = opt;
        selectNok.appendChild(option);
    });

    // Tenta restaurar o valor selecionado se ele ainda existir na lista
    if (listaOpcoesTemp.includes(valorAtual)) {
        selectNok.value = valorAtual;
    }
}