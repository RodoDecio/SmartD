let listaEntregasUniCache = [];
let listaCatalogoUniCache = [];
let carrinhoUni = []; 

// Variáveis de Edição
let carrinhoEdicaoUni = []; 
let itensEdicaoRemovidosUni = [];
let itemPendenteUni = null; 
let modoCatalogoUni = 'registro'; 
let registroOriginalUniforme = null; // Para validar se houve mudanças

function inicializarControleUniformes() {
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Controle de Entrega de Uniformes';
    
    const container = document.getElementById('container-filtros-uniformes');
    if (container && container.children.length === 0) {
        adicionarFiltroUniforme();
    }
    
    // FILTRO DE UNIDADE (RODAPÉ)
    const selUnidade = document.getElementById('sel-unidade');
    if (selUnidade) {
        selUnidade.removeEventListener('change', listarEntregasUniformes);
        selUnidade.addEventListener('change', listarEntregasUniformes);
    }
    
    // Pré-carrega o catálogo para podermos cruzar o gênero
    carregarCatalogoParaCache();

    listarEntregasUniformes();
}

async function carregarCatalogoParaCache() {
    try {
        const { data } = await clienteSupabase.from('uniformes').select('*');
        if (data) listaCatalogoUniCache = data;
    } catch(e) { console.error("Erro cache catalogo", e); }
}

// =============================================================================
// LISTAGEM
// =============================================================================

async function listarEntregasUniformes() {
    const tbody = document.getElementById('tbody-uniformes');
    if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Buscando dados...</td></tr>';

    const unidadeSelecionada = document.getElementById('sel-unidade')?.value;

    try {
        let query = clienteSupabase
            .from('uniformes_entregas')
            .select('*, perfis (nome_completo, unidade_id)')
            // ORDENAÇÃO: Data de entrega (mais recente primeiro)
            .order('data_entrega', { ascending: false })
            // DESEMPATE: Se a data for igual, pega o que foi criado por último
            .order('created_at', { ascending: false }) 
            .limit(500); 

        const { data, error } = await query;

        if (error) throw error;
        
        let dadosFiltrados = data || [];
        if (unidadeSelecionada && unidadeSelecionada !== 'TODAS') {
            dadosFiltrados = dadosFiltrados.filter(item => 
                item.perfis && String(item.perfis.unidade_id) === String(unidadeSelecionada)
            );
        }

        listaEntregasUniCache = dadosFiltrados;
        aplicarFiltrosUniforme();

    } catch (err) {
        console.error(err);
        if (tbody) tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
        mostrarToastUniforme("Erro ao carregar lista.", "erro");
    }
}

function renderizarTabelaUniformes(lista) {
    const tbody = document.getElementById('tbody-uniformes');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const contador = document.getElementById('lbl-contagem-uniformes');
    if(contador) contador.innerHTML = `Exibindo <strong>${lista.length}</strong> registro(s)`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">Nenhum registro encontrado.</td></tr>';
        return;
    }

    lista.forEach(item => {
        const nomeColaborador = item.perfis ? item.perfis.nome_completo : 'Desconhecido';
        
        let dataFmt = '-';
        if (item.data_entrega) {
            const p = item.data_entrega.split('-');
            dataFmt = `${p[2]}/${p[1]}/${p[0]}`;
        }

        let genero = '-';
        const itemCatalogo = listaCatalogoUniCache.find(c => c.nome === item.uniforme_nome);
        if (itemCatalogo && itemCatalogo.genero) genero = itemCatalogo.genero;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${dataFmt}</td>
            <td><b>${nomeColaborador}</b></td>
            <td>${item.uniforme_nome}</td>
            <td>${genero}</td>
            <td><span class="badge" style="background:#eef2ff; color:#003399; border:1px solid #cceeff; padding: 2px 8px; border-radius: 4px;">${item.tamanho || 'U'}</span></td>
            <td>${item.qtd}</td>
            <td style="white-space:nowrap;">
                <button class="action-btn" onclick="visualizarEntregaUniforme('${item.id}')" title="Visualizar"><i class="fas fa-eye" style="color:#003399;"></i></button>
                <button class="action-btn" onclick="window.abrirModalLogsUniforme('${item.id}')" title="Histórico"><i class="fas fa-history"></i></button>
                <button class="action-btn" onclick="editarEntregaUniforme('${item.id}')" title="Editar"><i class="fas fa-edit"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =============================================================================
// FILTROS
// =============================================================================

function adicionarFiltroUniforme() {
    const container = document.getElementById('container-filtros-uniformes');
    if (!container) return;
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `row-uni-${id}`;
    div.innerHTML = `
        <select class="filter-select" onchange="configInputFiltroUni(this, '${id}')">
            <option value="" disabled selected>Filtrar por...</option>
            <option value="colaborador">Colaborador</option>
            <option value="peca">Peça/Uniforme</option>
            <option value="tamanho">Tamanho</option>
            <option value="data">Data</option>
        </select>
        <div id="wrapper-val-uni-${id}"><input type="text" class="filter-select" disabled placeholder="Selecione..."></div>
        <button class="btn-remove-filter" onclick="removerFiltroUni('${id}')"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

function removerFiltroUni(id) { 
    const el = document.getElementById(`row-uni-${id}`);
    if(el) el.remove(); 
    aplicarFiltrosUniforme(); 
}

function configInputFiltroUni(select, id) {
    const wrapper = document.getElementById(`wrapper-val-uni-${id}`);
    if (!wrapper) return;
    wrapper.innerHTML = '';
    const tipo = select.value;
    
    if (tipo === 'colaborador') {
        const sel = document.createElement('select');
        sel.className = 'filter-select';
        
        // Garante que o nome exista e limpa os espaços em branco para o Set funcionar
        const todosNomes = listaEntregasUniCache
            .map(i => i.perfis ? i.perfis.nome_completo.trim() : null)
            .filter(Boolean); // Filtra nulos/vazios
            
        const nomesUnicos = [...new Set(todosNomes)].sort();
        
        sel.innerHTML = '<option value="">Todos</option>';
        nomesUnicos.forEach(nome => {
            sel.innerHTML += `<option value="${nome}">${nome}</option>`;
        });
        
        sel.onchange = aplicarFiltrosUniforme;
        wrapper.appendChild(sel);
    } else {
        const input = document.createElement('input');
        input.className = 'filter-select';
        if (tipo === 'data') input.type = 'date';
        else { input.type = 'text'; input.placeholder = "Digite..."; }
        input.onchange = input.onkeyup = aplicarFiltrosUniforme;
        wrapper.appendChild(input);
        if(tipo !== 'data') input.focus();
    }
}

function aplicarFiltrosUniforme() {
    let filtrados = [...listaEntregasUniCache];
    let descricoesFiltros = []; 

    const container = document.getElementById('container-filtros-uniformes');
    if (container) {
        const rows = container.querySelectorAll('.filter-row');
        
        rows.forEach(row => {
            const selectTipo = row.querySelector('select');
            const tipo = selectTipo ? selectTipo.value : '';
            const tipoTexto = selectTipo.options[selectTipo.selectedIndex].text; 

            const wrapper = row.querySelector('div[id^="wrapper-val-uni-"]');
            const campoValor = wrapper ? wrapper.querySelector('input, select') : null;

            if (!campoValor || !campoValor.value) return;

            const val = campoValor.value.toLowerCase();
            let valTexto = campoValor.value;

            if (campoValor.tagName === 'SELECT' && campoValor.selectedIndex >= 0) {
                valTexto = campoValor.options[campoValor.selectedIndex].text;
            } else if (tipo === 'data') {
                const parts = valTexto.split('-');
                if (parts.length === 3) valTexto = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }

            descricoesFiltros.push(`<b>${tipoTexto}:</b> ${valTexto}`);

            filtrados = filtrados.filter(item => {
                if (tipo === 'colaborador') {
                    return item.perfis?.nome_completo.toLowerCase().includes(val);
                }
                if (tipo === 'peca') {
                    return item.uniforme_nome.toLowerCase().includes(val);
                }
                if (tipo === 'tamanho') {
                    return item.tamanho && item.tamanho.toLowerCase() === val;
                }
                if (tipo === 'data') {
                    return item.data_entrega === campoValor.value;
                }
                return true;
            });
        });
    }

    const lblFiltros = document.getElementById('lbl-filtros-uniformes-ativos');
    if (lblFiltros) {
        if (descricoesFiltros.length > 0) {
            lblFiltros.innerHTML = `<i class="fas fa-filter"></i> ${descricoesFiltros.join(' <span style="margin:0 5px; color:#ccc;">|</span> ')}`;
            lblFiltros.style.color = '#003399';
        } else {
            lblFiltros.innerHTML = `<i class="fas fa-filter"></i> Mostrando todos os registros`;
            lblFiltros.style.color = '#666';
        }
    }

    renderizarTabelaUniformes(filtrados);
}

// =============================================================================
// REGISTRO (MODAL E CARRINHO)
// =============================================================================

async function abrirModalRegistroUniforme() {
    modoCatalogoUni = 'registro';
    await carregarColaboradoresUni('sel-colaborador-uniforme');
    
    // Limpeza MANUAL
    const inputData = document.getElementById('data-uniforme-input');
    const inputObs = document.getElementById('obs-uniforme-input');
    
    // CORREÇÃO DA DATA:
    // Cria a string YYYY-MM-DD baseada no horário LOCAL do navegador
    if(inputData) {
        const hoje = new Date();
        const ano = hoje.getFullYear();
        // getMonth() começa em 0, por isso +1. padStart garante 2 dígitos (05, 12, etc)
        const mes = String(hoje.getMonth() + 1).padStart(2, '0');
        const dia = String(hoje.getDate()).padStart(2, '0');
        
        inputData.value = `${ano}-${mes}-${dia}`;
    }

    if(inputObs) inputObs.value = '';
    
    carrinhoUni = [];
    atualizarCarrinhoUniUI();
    
    const modal = document.getElementById('modal-registro-uniforme');
    if(modal) modal.classList.add('active');
}

async function carregarColaboradoresUni(elementId) {
    const sel = document.getElementById(elementId);
    if(!sel) return;
    
    const valorAtual = sel.value;
    sel.innerHTML = '<option>Carregando...</option>';
    
    const unidadeSelecionada = document.getElementById('sel-unidade')?.value;

    try {
        // Remove .eq('ativo', true) para gerenciar no front
        let query = clienteSupabase
            .from('perfis')
            .select('id, nome_completo, matricula, unidade_id, ativo') 
            .order('nome_completo');
        
        if (unidadeSelecionada && unidadeSelecionada !== 'TODAS') {
            query = query.eq('unidade_id', unidadeSelecionada);
        }

        const { data, error } = await query;
        
        if (error) throw error;

        sel.innerHTML = '<option value="">Selecione...</option>';
        
        if (data) {
            const nomesVistos = new Set(); 
            
            data.forEach(p => {
                const nomeLimpo = p.nome_completo.trim();
                
                // LÓGICA: Se é inativo E NÃO for o dono do registro atual em edição, pula.
                if (!p.ativo && String(p.id) !== String(valorAtual)) {
                    return; 
                }

                if (!nomesVistos.has(nomeLimpo)) {
                    nomesVistos.add(nomeLimpo);
                    
                    const mat = p.matricula ? p.matricula : 'N/D';
                    const tagInativo = p.ativo ? '' : ' (Inativo)';
                    
                    sel.innerHTML += `<option value="${p.id}" data-matricula="${mat}">${nomeLimpo}${tagInativo}</option>`;
                }
            });
            
            if(valorAtual) sel.value = valorAtual;
        }
    } catch(e) { 
        console.error("Erro ao carregar colaboradores:", e); 
        sel.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

function fecharModalRegistroUniforme() {
    const modal = document.getElementById('modal-registro-uniforme');
    if(modal) modal.classList.remove('active');
}

// =============================================================================
// EDIÇÃO E VISUALIZAÇÃO
// =============================================================================

function visualizarEntregaUniforme(id) { abrirModalEdicaoEntregaUniforme(id, true); }
function editarEntregaUniforme(id) { abrirModalEdicaoEntregaUniforme(id, false); }

async function abrirModalEdicaoEntregaUniforme(id, readonly) {
    const reg = listaEntregasUniCache.find(x => x.id == id);
    if (!reg) return;

    registroOriginalUniforme = {
        colaborador_id: reg.colaborador_id,
        data_entrega: reg.data_entrega,
        observacao: reg.observacao || '',
        uniforme_nome: reg.uniforme_nome,
        tamanho: reg.tamanho,
        qtd: reg.qtd,
        comprovante_url: reg.comprovante_url
    };

    await carregarColaboradoresUni('edit-sel-colaborador');
    
    const elColab = document.getElementById('edit-sel-colaborador');
    const elData = document.getElementById('edit-data-input');
    const elObs = document.getElementById('edit-obs-input');

    if(elColab) elColab.value = reg.colaborador_id;
    if(elData) elData.value = reg.data_entrega;
    if(elObs) elObs.value = reg.observacao || '';

    let generoItem = '-';
    const itemCatalogo = listaCatalogoUniCache.find(c => c.nome === reg.uniforme_nome);
    if (itemCatalogo) generoItem = itemCatalogo.genero;

    carrinhoEdicaoUni = [{
        id: reg.id,
        nome: reg.uniforme_nome,
        genero: generoItem,
        tamanho: reg.tamanho,
        qtd: reg.qtd,
        isOriginal: true,
        historico: null 
    }];
    itensEdicaoRemovidosUni = []; 

    const modalEdit = document.getElementById('modal-editar-uniforme');
    const inputs = modalEdit.querySelectorAll('input, select');
    const btnSalvar = modalEdit.querySelector('#btn-salvar-edicao');
    const btnExcluir = modalEdit.querySelector('#btn-excluir-reg');
    const btnAdd = modalEdit.querySelector('#btn-add-item-edicao');
    const titulo = modalEdit.querySelector('#titulo-modal-edicao');
    
    // --- CONTROLE DOS BOTÕES DE DOCUMENTO ---
    const btnAnexo = document.getElementById('btn-anexo-uni');
    const btnVer = document.getElementById('btn-ver-anexo-uni');
    const inputFile = document.getElementById('input-anexo-uni');
    if(inputFile) inputFile.value = '';

    if(btnAnexo) {
        btnAnexo.innerHTML = '<i class="fas fa-paperclip"></i> <span>Anexar</span>';
        btnAnexo.classList.remove('has-file');
        btnAnexo.disabled = readonly;
    }
    if(btnVer) {
        btnVer.style.display = 'none';
        btnVer.dataset.url = '';
    }

    if (reg.comprovante_url) {
        if(btnAnexo) {
            btnAnexo.innerHTML = '<i class="fas fa-sync-alt"></i> <span>Alterar Arq.</span>';
            btnAnexo.classList.add('has-file');
        }
        if(btnVer) {
            btnVer.style.display = 'inline-flex';
            btnVer.dataset.url = reg.comprovante_url;
        }
    }
    // ----------------------------------------

    if(readonly) {
        if(titulo) titulo.innerText = "Visualizar Entrega";
        inputs.forEach(i => i.disabled = true);
        if(btnSalvar) btnSalvar.style.display = 'none';
        if(btnExcluir) btnExcluir.style.display = 'none';
        if(btnAdd) btnAdd.style.display = 'none';
    } else {
        if(titulo) titulo.innerText = "Editar Entrega";
        inputs.forEach(i => i.disabled = false);
        if(btnSalvar) btnSalvar.style.display = 'block';
        if(btnExcluir) btnExcluir.style.display = 'block';
        if(btnAdd) btnAdd.style.display = 'block';
    }

    modalEdit.classList.add('active');

    setTimeout(() => {
        renderizarCarrinhoEdicaoUniforme(readonly);
    }, 50);

    buscarUltimaEntregaUni(reg.colaborador_id, reg.uniforme_nome).then(hist => {
        if(carrinhoEdicaoUni[0] && carrinhoEdicaoUni[0].id === reg.id) {
            carrinhoEdicaoUni[0].historico = hist;
            renderizarCarrinhoEdicaoUniforme(readonly); 
        }
    });
}

function renderizarCarrinhoEdicaoUniforme(readonly) {
    const container = document.getElementById('lista-itens-edicao-uni');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (carrinhoEdicaoUni.length === 0) {
        container.innerHTML = `<div style="text-align: center; color: #999; padding: 20px;">Nenhum item.</div>`;
        return;
    }

    carrinhoEdicaoUni.forEach((item, index) => {
        const histHtml = montarHtmlHistoricoUni(item.historico);
        const div = document.createElement('div');
        div.className = 'cart-item-card';
        div.style.animation = 'fadeIn 0.3s ease';
        
        let acoesHtml = '';
        if(!readonly) {
            acoesHtml = `
                <div class="cart-qty-group">
                    <label style="font-size: 12px; font-weight: bold; color: #555;">Qtd:</label>
                    <input type="number" class="cart-qty-input" value="${item.qtd}" min="1" onchange="carrinhoEdicaoUni[${index}].qtd = this.value">
                </div>
                <button class="btn-trash-item" onclick="removerItemEdicaoUniforme(${index})" title="Remover">
                    <i class="fas fa-trash-alt"></i>
                </button>
            `;
        } else {
            acoesHtml = `<div class="cart-qty-group"><strong>Qtd: ${item.qtd}</strong></div>`;
        }

        const generoTxt = item.genero ? `(${item.genero})` : '';

        div.innerHTML = `
            <div class="cart-info">
                <h4>${item.nome} ${generoTxt}</h4>
                <span>Tam: ${item.tamanho}</span>
            </div>
            <div class="cart-history">
                ${histHtml}
            </div>
            <div class="cart-actions">
                ${acoesHtml}
            </div>
        `;
        container.appendChild(div);
    });
}

function removerItemEdicaoUniforme(index) {
    const item = carrinhoEdicaoUni[index];
    if (item.id) {
        itensEdicaoRemovidosUni.push(item.id);
    }
    carrinhoEdicaoUni.splice(index, 1);
    renderizarCarrinhoEdicaoUniforme(false); 
}

function fecharModalEdicaoUniforme(forcar = false) {
    if (!forcar && verificarAlteracoesUniforme()) {
        if (typeof window.solicitarConfirmacao === 'function') {
            window.solicitarConfirmacao(() => {
                fecharModalEdicaoUniforme(true);
            }, "Existem alterações não salvas. Deseja sair?");
        } else {
            if (confirm("Existem alterações não salvas. Deseja sair?")) {
                fecharModalEdicaoUniforme(true);
            }
        }
        return;
    }

    const modal = document.getElementById('modal-editar-uniforme');
    if(modal) modal.classList.remove('active');
    
    registroOriginalUniforme = null;
    carrinhoEdicaoUni = [];
    itensEdicaoRemovidosUni = [];
}

// =============================================================================
// VALIDAÇÃO DE ALTERAÇÕES
// =============================================================================

function verificarAlteracoesUniforme() {
    if (!registroOriginalUniforme) return true;

    const pId = document.getElementById('edit-sel-colaborador').value;
    const dt = document.getElementById('edit-data-input').value;
    const obs = document.getElementById('edit-obs-input').value;

    // 1. Verifica campos principais
    if (String(pId) !== String(registroOriginalUniforme.colaborador_id)) return true;
    if (dt !== registroOriginalUniforme.data_entrega) return true;
    if (obs !== registroOriginalUniforme.observacao) return true;

    // 2. Verifica se a estrutura do carrinho mudou
    if (carrinhoEdicaoUni.length !== 1) return true; 
    if (itensEdicaoRemovidosUni.length > 0) return true;

    // 3. Verifica dados do item
    const itemAtual = carrinhoEdicaoUni[0];
    if (itemAtual.nome !== registroOriginalUniforme.uniforme_nome) return true;
    if (itemAtual.tamanho !== registroOriginalUniforme.tamanho) return true;
    if (String(itemAtual.qtd) !== String(registroOriginalUniforme.qtd)) return true;

    return false; // Nada mudou
}

// =============================================================================
// CATÁLOGO E SELEÇÃO
// =============================================================================

async function abrirModalCatalogoUniformes(modo) {
    modoCatalogoUni = modo; 
    
    let colabId;
    if(modo === 'registro') colabId = document.getElementById('sel-colaborador-uniforme').value;
    else colabId = document.getElementById('edit-sel-colaborador').value;

    if(!colabId) {
        mostrarToastUniforme("Selecione um colaborador primeiro.", "erro");
        return;
    }

    const modal = document.getElementById('modal-catalogo-uniformes');
    const tbody = document.getElementById('tbody-catalogo-uni');
    
    const inputFiltro = document.getElementById('filtro-catalogo-uni-input');
    if(inputFiltro) inputFiltro.value = '';
    
    if(tbody) tbody.innerHTML = '<tr><td colspan="2" class="text-center p-3"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';
    if(modal) modal.classList.add('active');

    try {
        const { data } = await clienteSupabase.from('uniformes').select('*').order('nome');
        if(data) listaCatalogoUniCache = data; 
        renderizarCatalogoUni(listaCatalogoUniCache);
    } catch (e) { console.error(e); }
}

function renderizarCatalogoUni(lista) {
    const tbody = document.getElementById('tbody-catalogo-uni');
    if (!tbody) return;
    tbody.innerHTML = '';
    lista.forEach(uni => {
        const uniSafe = { id: uni.id, nome: uni.nome, genero: uni.genero }; 
        const jsonItem = JSON.stringify(uniSafe).replace(/"/g, '&quot;');
        
        const generoHtml = uni.genero ? `<span style="font-size:11px; color:#666; font-weight:normal; margin-left:5px;">(${uni.genero})</span>` : '';

        tbody.innerHTML += `
            <tr>
                <td style="padding-left:20px; font-weight: 600; color: #333;">
                    ${uni.nome} ${generoHtml}
                </td>
                <td class="text-center">
                    <button class="btn-add-green" onclick="selecionarItemUniforme(${jsonItem})" title="Adicionar">
                        <i class="fas fa-plus"></i>
                    </button>
                </td>
            </tr>`;
    });
}

function filtrarCatalogoUniUI() {
    const v = document.getElementById('filtro-catalogo-uni-input').value.toLowerCase();
    renderizarCatalogoUni(listaCatalogoUniCache.filter(e => e.nome.toLowerCase().includes(v)));
}

function fecharModalCatalogoUni() {
    const modal = document.getElementById('modal-catalogo-uniformes');
    if(modal) modal.classList.remove('active');
}

function selecionarItemUniforme(item) {
    itemPendenteUni = item; 
    fecharModalCatalogoUni();
    const modalTam = document.getElementById('modal-tamanho-uni');
    const generoTexto = item.genero ? ` (${item.genero})` : '';
    document.getElementById('lbl-nome-item-tamanho').innerText = item.nome + generoTexto;
    if(modalTam) modalTam.classList.add('active');
}

async function confirmarAdicaoCarrinho() {
    const tam = document.getElementById('sel-tamanho-uni').value;
    document.getElementById('modal-tamanho-uni').classList.remove('active');

    let colabId;
    if(modoCatalogoUni === 'registro') colabId = document.getElementById('sel-colaborador-uniforme').value;
    else colabId = document.getElementById('edit-sel-colaborador').value;

    const hist = await buscarUltimaEntregaUni(colabId, itemPendenteUni.nome);

    const novoItem = {
        ...itemPendenteUni,
        tamanho: tam,
        qtd: 1,
        historico: hist 
    };

    if (modoCatalogoUni === 'registro') {
        carrinhoUni.push(novoItem);
        atualizarCarrinhoUniUI();
    } else if (modoCatalogoUni === 'edicao') {
        carrinhoEdicaoUni.push({
            id: null,
            nome: novoItem.nome,
            genero: novoItem.genero,
            tamanho: novoItem.tamanho,
            qtd: 1,
            historico: hist
        });
        renderizarCarrinhoEdicaoUniforme(false);
    }
}

// =============================================================================
// LÓGICA DE ÚLTIMA ENTREGA
// =============================================================================

async function buscarUltimaEntregaUni(colabId, nomePeca) {
    if(!colabId || !nomePeca) return null;
    try {
        const { data } = await clienteSupabase
            .from('uniformes_entregas')
            .select('data_entrega')
            .eq('colaborador_id', colabId)
            .eq('uniforme_nome', nomePeca)
            .order('data_entrega', { ascending: false })
            .limit(1)
            .maybeSingle(); 

        if (data) {
            const partes = data.data_entrega.split('-');
            const dataItem = new Date(partes[0], partes[1] - 1, partes[2]);
            dataItem.setHours(0, 0, 0, 0);

            const hoje = new Date();
            hoje.setHours(0,0,0,0);
            
            const diffTime = Math.abs(hoje - dataItem);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            
            const dataFmt = `${partes[2]}/${partes[1]}/${partes[0]}`;

            return { dataFmt: dataFmt, dias: diffDays };
        }
        return null;
    } catch (e) {
        return null;
    }
}

function montarHtmlHistoricoUni(hist) {
    if (!hist) {
        return `<span class="hist-label">Última Entrega</span><span class="hist-date" style="color:#999;">Nunca</span>`;
    }
    
    let textoDias;
    let cor = '#28a745'; 

    if (hist.dias === 0) {
        textoDias = 'Hoje';
        cor = '#003399';
    } else if (hist.dias === 1) {
        textoDias = 'Ontem';
        cor = '#666';
    } else {
        textoDias = `Há ${hist.dias} dias`;
    }

    return `
        <span class="hist-label">Última Entrega</span>
        <span class="hist-date">${hist.dataFmt}</span>
        <span style="font-size:10px; color:${cor}; font-weight:bold;">${textoDias}</span>
    `;
}

// =============================================================================
// CARRINHO UI (REGISTRO)
// =============================================================================

function atualizarCarrinhoUniUI() {
    const container = document.getElementById('lista-carrinho-uniforme');
    if(!container) return;
    container.innerHTML = '';
    
    if (carrinhoUni.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; color: #999; padding: 30px; border: 2px dashed #eee; border-radius: 8px; margin-top: 10px;">
                <i class="fas fa-tshirt" style="font-size: 2rem; opacity: 0.2; margin-bottom: 10px;"></i><br>
                Nenhum uniforme selecionado.
            </div>`;
        return;
    }

    carrinhoUni.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'cart-item-card';
        const histHtml = montarHtmlHistoricoUni(item.historico);
        const generoTxt = item.genero ? `(${item.genero})` : '';

        div.innerHTML = `
            <div class="cart-info">
                <h4>${item.nome} ${generoTxt}</h4>
                <span>Tam: ${item.tamanho}</span>
            </div>
            <div class="cart-history">
                ${histHtml}
            </div>
            <div class="cart-actions">
                <div class="cart-qty-group">
                    <label style="font-size: 12px; font-weight: bold; color: #555;">Qtd:</label>
                    <input type="number" class="cart-qty-input" value="${item.qtd}" min="1" onchange="carrinhoUni[${index}].qtd = this.value">
                </div>
                <button class="btn-trash-item" onclick="removerDoCarrinhoUni(${index})" title="Remover">
                    <i class="fas fa-trash-alt"></i>
                </button>
            </div>
        `;
        container.appendChild(div);
    });
}

function removerDoCarrinhoUni(index) {
    carrinhoUni.splice(index, 1);
    atualizarCarrinhoUniUI();
}

// =============================================================================
// SALVAR NOVO
// =============================================================================

async function salvarEntregaUniforme() {
    const pId = document.getElementById('sel-colaborador-uniforme').value;
    const dt = document.getElementById('data-uniforme-input').value;
    const obs = document.getElementById('obs-uniforme-input').value;

    if (!pId || !dt || carrinhoUni.length === 0) { 
        mostrarToastUniforme("Preencha colaborador, data e adicione itens.", "erro"); 
        return; 
    }

    const btn = document.querySelector('#modal-registro-uniforme .btn-primary');
    if(btn) {
        var txtOriginal = btn.innerHTML;
        btn.textContent = "Salvando...";
        btn.disabled = true;
    }

    try {
        let inserts = [];
        carrinhoUni.forEach(item => {
            inserts.push({
                colaborador_id: pId,
                uniforme_nome: item.nome, 
                tamanho: item.tamanho,
                qtd: parseInt(item.qtd),
                data_entrega: dt,
                observacao: obs
            });
        });

        const { data, error } = await clienteSupabase
            .from('uniformes_entregas')
            .insert(inserts)
            .select();

        if (error) throw error;

        if (data && data.length > 0) {
            // CORRIGIDO: Usa Promise.all e a função registrarLogUniforme consistente
            const promessasLog = data.map(novoItem => 
                registrarLogUniforme(novoItem.id, 'INSERT', null, novoItem)
            );
            await Promise.all(promessasLog);
        }

        mostrarToastUniforme("Entrega registrada com sucesso!", "sucesso");
        fecharModalRegistroUniforme();
        listarEntregasUniformes();

    } catch(e) {
        mostrarToastUniforme("Erro ao salvar: " + e.message, "erro");
    } finally {
        if(btn) {
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }
    }
}

// =============================================================================
// SALVAR EDIÇÃO E EXCLUSÃO
// =============================================================================

async function salvarEdicaoUniforme() {
    const pId = document.getElementById('edit-sel-colaborador').value;
    const dt = document.getElementById('edit-data-input').value;
    const obs = document.getElementById('edit-obs-input').value;

    if(!pId || !dt) { mostrarToastUniforme("Preencha todos os campos.", "erro"); return; }
    
    if(carrinhoEdicaoUni.length === 0) {
        mostrarToastUniforme("A entrega deve ter pelo menos um item.", "erro"); 
        return;
    }

    const btnSalvar = document.getElementById('btn-salvar-edicao');
    if(btnSalvar) { btnSalvar.innerText = "Salvando..."; btnSalvar.disabled = true; }

    // Verifica alterações (Se nada mudou, avisa e para)
    if (!verificarAlteracoesUniforme()) {
        mostrarToastUniforme("Nenhuma alteração detectada.", "aviso");
        if(btnSalvar) { btnSalvar.innerText = "Salvar Alterações"; btnSalvar.disabled = false; }
        return;
    }

    // =========================================================================
    // ♻️ LÓGICA DE CORREÇÃO (SMART SWAP)
    // Se o usuário excluiu o item original e adicionou um novo manualmente,
    // nós "reciclamos" o ID antigo para fazer um UPDATE em vez de DELETE+INSERT.
    // Isso resolve o problema de o item "voltar" ao que era.
    // =========================================================================
    if (itensEdicaoRemovidosUni.length > 0 && carrinhoEdicaoUni.length === 1 && carrinhoEdicaoUni[0].id === null) {
        // Pega o ID do item que estava na lista de exclusão
        const idPreservado = itensEdicaoRemovidosUni[0];
        
        // Atribui este ID ao novo item que estava sem ID (null)
        carrinhoEdicaoUni[0].id = idPreservado;
        
        // Limpa a lista de exclusão (pois não vamos mais deletar esse ID, vamos atualizá-lo)
        itensEdicaoRemovidosUni = [];
        
        console.log("♻️ Troca inteligente ativada: O item será atualizado no ID " + idPreservado);
    }
    // =========================================================================

    try {
        // A. DELETE (Apenas se realmente sobrou algo para deletar)
        if(itensEdicaoRemovidosUni.length > 0) {
            // Snapshot para log
            const { data: deletados } = await clienteSupabase
                .from('uniformes_entregas').select('*').in('id', itensEdicaoRemovidosUni);

            const { error } = await clienteSupabase
                .from('uniformes_entregas').delete().in('id', itensEdicaoRemovidosUni);
            
            if (error) throw error;
            
            // Log de exclusão
            if(deletados) {
                for(const itemDel of deletados) {
                    await registrarLogUniforme(itemDel.id, 'DELETE', itemDel, null);
                }
            }
        }

        // B. UPSERT (Update ou Insert)
        for (const item of carrinhoEdicaoUni) {
            const payload = {
                colaborador_id: pId,
                data_entrega: dt,
                observacao: obs,
                qtd: parseInt(item.qtd),
                // Garante que pega o nome correto, venha do banco ou do novo objeto
                uniforme_nome: item.nome || item.uniforme_nome, 
                tamanho: item.tamanho
            };

            if (item.id) {
                // --- UPDATE ---
                // Busca antigo para Log
                let dadosAntigos = null;
                const itemCache = listaEntregasUniCache.find(x => String(x.id) === String(item.id));
                if (itemCache) {
                    dadosAntigos = JSON.parse(JSON.stringify(itemCache));
                } else {
                    dadosAntigos = registroOriginalUniforme;
                }

                // Atualiza no banco
                const { data, error } = await clienteSupabase
                    .from('uniformes_entregas')
                    .update(payload).eq('id', item.id).select().single();

                if (error) throw error;
                
                await registrarLogUniforme(item.id, 'UPDATE', dadosAntigos, data);

            } else {
                // --- INSERT (Caso raro onde realmente é um item novo extra) ---
                const { data, error } = await clienteSupabase
                    .from('uniformes_entregas')
                    .insert(payload).select().single();

                if (error) throw error;
                await registrarLogUniforme(data.id, 'INSERT', null, data);
            }
        }

        mostrarToastUniforme("Alterações salvas!", "sucesso");
        fecharModalEdicaoUniforme(true); 
        listarEntregasUniformes();

    } catch(e) { 
        mostrarToastUniforme("Erro ao atualizar: " + e.message, "erro"); 
        console.error(e);
    } finally {
        if(btnSalvar) { btnSalvar.innerText = "Salvar Alterações"; btnSalvar.disabled = false; }
    }
}

function solicitarExclusaoUniforme() {
    const idsParaDeletar = carrinhoEdicaoUni.filter(i => i.id).map(i => i.id);
    const todosOsIds = [...idsParaDeletar, ...itensEdicaoRemovidosUni];

    if (todosOsIds.length === 0) {
        mostrarToastUniforme("Registro ainda não salvo no banco.", "erro");
        return;
    }

    window.idsExclusaoTemp = todosOsIds; 
    document.getElementById('modal-confirmacao-uni').classList.add('active');
}

function fecharModalConfirmacaoUni() {
    document.getElementById('modal-confirmacao-uni').classList.remove('active');
}

async function confirmarExclusaoUniUI() {
    if (!window.idsExclusaoTemp || window.idsExclusaoTemp.length === 0) return;

    try {
        const { data: paraDeletar } = await clienteSupabase
            .from('uniformes_entregas')
            .select('*')
            .in('id', window.idsExclusaoTemp);

        const { error } = await clienteSupabase.from('uniformes_entregas').delete().in('id', window.idsExclusaoTemp);
        if (error) throw error;

        if (paraDeletar) {
            for (const item of paraDeletar) {
                await registrarLogUniforme(item.id, 'DELETE', item, null);
            }
        }

        mostrarToastUniforme("Registro(s) excluído(s) com sucesso!", "sucesso");
        fecharModalConfirmacaoUni();
        fecharModalEdicaoUniforme(true); 
        listarEntregasUniformes();
    } catch(e) {
        mostrarToastUniforme("Erro ao excluir: " + e.message, "erro");
    }
}

// =============================================================================
// FUNÇÃO TOAST
// =============================================================================
function mostrarToastUniforme(mensagem, tipo = 'sucesso') {
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
    } 
    else if (tipoLower === 'aviso' || tipoLower === 'warning') {
        iconClass = 'fa-exclamation-triangle';
        typeClass = 'smart-toast-warning'; 
    }

    const toast = document.createElement('div');
    toast.className = `smart-toast ${typeClass}`;
    toast.innerHTML = `<i class="fas ${iconClass}"></i><span class="smart-toast-msg">${mensagem}</span>`;

    container.appendChild(toast);
    
    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { if (toast.parentElement) toast.parentElement.removeChild(toast); }, 400); 
    }, 3000);
}

// =============================================================================
// HISTÓRICO
// =============================================================================

window.abrirModalLogsUniforme = async function(id) {
    if (!id) {
        console.warn("Tentativa de abrir histórico sem ID.");
        return;
    }

    // Feedback Visual
    const btn = document.activeElement; // Pega o botão que foi clicado
    const htmlOriginal = btn ? btn.innerHTML : '';
    
    // Adiciona spinner apenas se for um botão (evita erro se chamado via código)
    if (btn && btn.tagName === 'BUTTON') {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        btn.disabled = true; // Evita duplo clique
    }

    try {
        // 1. Verifica se a dependência global existe
        if (typeof window.abrirModalLogsGlobal !== 'function') {
            throw new Error("Módulo global de logs (app.js) não carregado.");
        }

        // 2. Busca dados auxiliares para tradução
        const { data: perfis, error } = await clienteSupabase
            .from('perfis')
            .select('id, nome_completo');
        
        if (error) console.warn("Erro ao carregar perfis para log:", error);

        const mapaIds = {
            'colaborador_id': perfis || [],
            'usuario_id': perfis || []
        };

        // 3. Abre o Modal
        await window.abrirModalLogsGlobal(
            'uniformes_entregas', 
            String(id), 
            'Histórico do Uniforme', 
            mapaIds
        );

    } catch (e) {
        console.error("Erro ao abrir histórico:", e);
        // Fallback seguro para alerta se o toast falhar
        if (typeof mostrarToastUniforme === 'function') {
            mostrarToastUniforme("Não foi possível carregar o histórico.", "erro");
        } else {
            alert("Erro: " + e.message);
        }
    } finally {
        // Restaura o botão
        if (btn && btn.tagName === 'BUTTON') {
            btn.innerHTML = htmlOriginal;
            btn.disabled = false;
        }
    }
};

async function registrarLogUniforme(id, acao, dadosAntigos, dadosNovos) {
    try {
        // Tenta pegar o usuário da sessão global ou busca na hora
        let userId = window.usuarioLogadoGlobal ? window.usuarioLogadoGlobal.id : null;
        
        if (!userId) {
            const { data: { user } } = await clienteSupabase.auth.getUser();
            if (user) userId = user.id;
        }

        const payload = {
            tabela_afetada: 'uniformes_entregas', // Deve bater com a chamada do abrirModalLogsUniforme
            id_registro_afetado: String(id),
            acao: acao,
            usuario_id: userId, 
            dados_antigos: dadosAntigos ? JSON.stringify(dadosAntigos) : null,
            dados_novos: dadosNovos ? JSON.stringify(dadosNovos) : null,
            data_hora: new Date().toISOString()
        };

        const { error } = await clienteSupabase.from('logs_auditoria').insert(payload);

        
        
    } catch (err) {
        console.error("Erro crítico no logger de uniformes:", err);
    }
}

// =============================================================================
// GESTÃO DE DOCUMENTOS UNIFORME
// =============================================================================

function imprimirTermoUniforme() {
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

    let itensHtml = '';
    carrinhoEdicaoUni.forEach(item => {
        const nome = item.uniforme_nome || item.nome;
        const tam = item.tamanho || 'U';
        const qtd = item.qtd || 1;
        
        itensHtml += `
            <li style="padding: 8px 0; border-bottom: 1px dashed #ccc; display:flex; justify-content:space-between;">
                <span><strong>Item:</strong> ${nome} (Tam: ${tam})</span>
                <span><strong>Qtd:</strong> ${qtd}</span>
            </li>`;
    });

    if (carrinhoEdicaoUni.length === 0) {
        mostrarToastUniforme("Não há itens para imprimir.", "erro");
        return;
    }

    const imgLogoElement = document.querySelector('.sidebar-header img') || document.querySelector('.logo img') || document.querySelector('img');
    const logoUrl = imgLogoElement ? imgLogoElement.src : '';

    const win = window.open('', '_blank', 'height=750,width=950');
    if (!win) {
        mostrarToastUniforme("Pop-up bloqueado.", "erro");
        return;
    }
    
    win.document.write('<html><head><title>Termo de Entrega de Uniforme</title>');
    win.document.write('<style>');
    win.document.write(`
        @page { margin: 15mm; size: A4; }
        html, body { height: 100%; margin: 0; padding: 0; }
        body { font-family: 'Segoe UI', sans-serif; font-size: 13px; color: #333; display: flex; flex-direction: column; padding: 20px; box-sizing: border-box; }
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
        .legal-text { text-align: justify; font-size: 12px; background: #fff; padding: 15px; border: 1px solid #e0e0e0; color: #444; line-height: 1.4; }
        .footer-section { margin-top: auto; padding-top: 20px; page-break-inside: avoid; }
        .date-field { text-align: center; margin-bottom: 40px; font-size: 14px; }
        .signatures { display: flex; justify-content: space-between; gap: 40px; }
        .sig-block { flex: 1; text-align: center; border-top: 1px solid #333; padding-top: 10px; font-size: 13px; }
    `);
    win.document.write('</style></head><body>');
    
    win.document.write(`<div class="main-content">`);
        win.document.write(`
            <div class="header">
                <img src="${logoUrl}" alt="Logo" onerror="this.style.display='none'">
                <h1>Termo de Entrega de Uniforme</h1>
            </div>
            <div class="info-box">
                <div class="info-row"><span class="info-label">Colaborador:</span> ${nomeColaborador}</div>
                <div class="info-row"><span class="info-label">Matrícula:</span> <strong>${matricula}</strong></div>
                <div class="info-row"><span class="info-label">Data Entrega:</span> ${dataFormatada}</div>
            </div>
            <div class="items-box">
                <h3>Uniformes / Peças Entregues</h3>
                <ul>${itensHtml}</ul>
            </div>
            <div class="legal-text">
                <strong>Termo de Responsabilidade:</strong><br><br>
                Declaro que recebi os itens de uniforme listados acima em perfeito estado de conservação e uso.
                Comprometo-me a:<br>
                a) Zelar pela guarda e conservação dos uniformes;<br>
                b) Utilizá-los exclusivamente no exercício das minhas funções;<br>
                c) Comunicar imediatamente qualquer dano ou perda;<br>
                d) Devolvê-los em caso de desligamento ou troca.
            </div>
        `);
    win.document.write(`</div>`);

    win.document.write(`
        <div class="footer-section">
            <div class="date-field">Data: _____ / _____ / __________</div>
            <div class="signatures">
                <div class="sig-block">
                    <strong>Empregador / Responsável</strong><br>
                    <span style="font-size:11px; color:#666;">(Responsável pela Entrega)</span>
                </div>
                <div class="sig-block">
                    <strong>${nomeColaborador}</strong><br>
                    <span style="font-size:11px; color:#666;">(Assinatura do Empregado)</span>
                </div>
            </div>
        </div>
        <script>
            window.onload = function() { setTimeout(function() { window.print(); }, 500); };
        </script>
    `);
    
    win.document.write('</body></html>');
    win.document.close();
    win.focus();
}

function triggerUploadAnexoUni() {
    document.getElementById('input-anexo-uni').click();
}

function visualizingAnexoUni() { 
    const btn = document.getElementById('btn-ver-anexo-uni');
    const url = btn.dataset.url;
    if (url) window.open(url, '_blank');
}
window.visualizarAnexoUni = visualizingAnexoUni;

async function processarUploadAnexoUni(input) {
    if (input.files && input.files[0]) {
        let file = input.files[0];
        
        if (!registroOriginalUniforme || !carrinhoEdicaoUni[0] || !carrinhoEdicaoUni[0].id) {
            mostrarToastUniforme("Salve o registro antes de anexar.", "aviso");
            input.value = ''; 
            return;
        }

        const uniId = carrinhoEdicaoUni[0].id;
        const btnAnexo = document.getElementById('btn-anexo-uni');
        const txtOriginal = btnAnexo.innerHTML;
        
        btnAnexo.innerHTML = '<i class="fas fa-compress-arrows-alt fa-spin"></i> Otimizando...';
        btnAnexo.disabled = true;

        try {
            try {
                file = await comprimirImagem(file);
            } catch (errComp) {
                console.warn("Falha na compressão, usando original:", errComp);
            }

            btnAnexo.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

            const fileExt = file.name.split('.').pop();
            const fileName = `uniforme_${uniId}_${Date.now()}.${fileExt}`;
            const filePath = `termos_uniforme/${fileName}`; 

            const { error: uploadError } = await clienteSupabase
                .storage
                .from('comprovantes') 
                .upload(filePath, file, { upsert: true });

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = clienteSupabase
                .storage
                .from('comprovantes')
                .getPublicUrl(filePath);

            const { error: updateError } = await clienteSupabase
                .from('uniformes_entregas')
                .update({ comprovante_url: publicUrl })
                .eq('id', uniId);

            if (updateError) throw updateError;

            mostrarToastUniforme("Documento vinculado!", "sucesso");
            
            const btnVer = document.getElementById('btn-ver-anexo-uni');
            if (btnVer) {
                btnVer.style.display = 'inline-flex';
                btnVer.dataset.url = publicUrl;
            }
            
            btnAnexo.innerHTML = '<i class="fas fa-sync-alt"></i> <span>Alterar Arq.</span>';
            btnAnexo.classList.add('has-file');
            
            const itemCache = listaEntregasUniCache.find(x => x.id == uniId);
            if(itemCache) itemCache.comprovante_url = publicUrl;
            if(registroOriginalUniforme) registroOriginalUniforme.comprovante_url = publicUrl;

        } catch (error) {
            console.error("Erro upload:", error);
            mostrarToastUniforme("Erro ao enviar: " + error.message, "erro");
            btnAnexo.innerHTML = txtOriginal;
        } finally {
            btnAnexo.disabled = false;
            input.value = ''; 
        }
    }
}

async function comprimirImagem(file) {
    if (!file.type.match(/image.*/)) return file;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const maxWidth = 1024; 
                const maxHeight = 1024;
                let width = img.width;
                let height = img.height;
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
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);
                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Erro na compressão da imagem'));
                        return;
                    }
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