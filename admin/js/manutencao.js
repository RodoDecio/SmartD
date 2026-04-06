let listaManutencoesGlobal = [];
let itensManutencaoGlobal = [];
let listaVeiculosModal = []; 
let fornecedoresGlobal = [];
let catalogoGlobal = [];

let indexLinhaEditCatalogo = -1;
let tipoAlvoForn = 'Peça'; 

let sistemasManuais = new Set();
let subsistemasManuais = new Set();

// Variáveis de Controle de Estado (Dirty State)
let osSuja = false;
let dadosOriginaisOS = null;

const arvoreSistemas = {
    "Motor": ["Distribuição (Cabeçote/Válvulas)", "Alimentação (Injeção/Bomba)", "Arrefecimento (Radiador/Bomba d'água)", "Lubrificação", "Exaustão", "Turbina/Intercooler", "Motor Completo"],
    "Transmissão": ["Embreagem", "Caixa de Câmbio", "Eixo Cardã", "Diferencial (Coroa/Pinhão/Planetária)"],
    "Freios": ["Lonas/Pastilhas", "Tambor/Disco", "Catracas/Ajustadores", "Válvulas de Ar", "Compressor de Ar", "Cuícas/Cilindros"],
    "Suspensão": ["Molas/Feixes", "Bolsas de Ar", "Amortecedores", "Balanças/Tirantes", "Pinos e Buchas"],
    "Direção": ["Caixa de Direção", "Bomba Hidráulica", "Barras e Terminais", "Coluna de Direção"],
    "Elétrica": ["Bateria", "Alternador", "Motor de Partida", "Iluminação/Lâmpadas", "Chicotes/Módulos", "Painel de Instrumentos"],
    "Rodas": ["Cubos", "Rolamentos"], 
    "Cabine/Carroceria": ["Ar Condicionado", "Vidros/Travas", "Funilaria/Pintura", "Estofamento", "Quinta Roda/Pino Rei", "Baú/Sider/Tanque"],
    "Filtros e Fluidos": ["Revisão Preventiva (Troca de Óleo e Filtros)"],
    "Outros": ["Serviços Gerais", "Socorro Mecânico (Geral)"]
};

// Funções utilitárias de moeda contábil
window.formatarMoeda = function(input) {
    let v = input.value.replace(/\D/g, '');
    if(v === '') { input.value = ''; return; }
    v = (parseInt(v) / 100).toFixed(2);
    v = v.replace(".", ",");
    v = v.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    input.value = v;
    window.calcularTotaisOS();
}

window.parseMoeda = function(str) {
    if(!str) return 0;
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
}

window.inicializarManutencao = async function() {
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Gestão de Manutenção';

    const container = document.getElementById('container-filtros-manutencao');
    if (container) {
        container.innerHTML = '';
        window.adicionarFiltroManutencao();
    }

    const formOS = document.getElementById('form-manutencao');
    if (formOS) {
        formOS.onsubmit = window.salvarFormularioOS;
        // Monitora as digitações para ativar o estado "sujo"
        formOS.addEventListener('input', () => osSuja = true);
        formOS.addEventListener('change', () => osSuja = true);
    }

    window.popularSelectSistemasModal();
    await carregarSelectsModal();
    await carregarBaseFornecedoresECatalogo();
    await window.listarManutencoes();
}

// =============================================================================
// GERAÇÃO DO PAYLOAD (PARA SALVAR E COMPARAR MUDANÇAS)
// =============================================================================
window.getPayloadOS = function() {
    window.syncItensDaTelaParaArray(); 
    
    const fornServEl = document.getElementById('man-fornecedor-servicos-id');
    const fornPecasEl = document.getElementById('man-fornecedor-pecas-id');
    const totalEl = document.getElementById('man-valor-total-display');

    const badgesSist = Array.from(document.querySelectorAll('#man-sistemas-badges .badge-sistema-os')).map(b => b.innerText.replace('×', '').trim());
    const badgesSub = Array.from(document.querySelectorAll('#man-subsistemas-badges .badge-sistema-os')).map(b => b.innerText.replace('×', '').trim());

    return {
        os: {
            veiculo_id: document.getElementById('man-placa') ? document.getElementById('man-placa').value : '',
            data_manutencao: document.getElementById('man-data') ? document.getElementById('man-data').value : '',
            km_manutencao: parseInt(document.getElementById('man-km') ? document.getElementById('man-km').value : 0) || 0,
            tipo_manutencao: document.getElementById('man-tipo') ? document.getElementById('man-tipo').value : '',
            sistema: badgesSist.join(', ') || 'Diversos',
            subsistema: badgesSub.join(', ') || '',
            oficina_externa: true,
            fornecedor_id: fornServEl && fornServEl.value ? fornServEl.value : null,
            fornecedor_pecas_id: fornPecasEl && fornPecasEl.value ? fornPecasEl.value : null,
            observacoes: document.getElementById('man-obs') ? document.getElementById('man-obs').value.trim() : '',
            valor_total: parseFloat(totalEl ? totalEl.dataset.valorBruto : 0) || 0
        },
        itens: JSON.parse(JSON.stringify(itensManutencaoGlobal)) // Deep copy para evitar ref cruzada
    };
}

// =============================================================================
// LÓGICA DE SISTEMAS E SUBSISTEMAS (SELECT + BADGES)
// =============================================================================

window.popularSelectSistemasModal = function() {
    const sel = document.getElementById('man-sistema-manual');
    if (!sel) return;
    sel.innerHTML = '<option value="">Selecionar Sistema (Manual)...</option>';
    Object.keys(arvoreSistemas).sort().forEach(sis => {
        sel.innerHTML += `<option value="${sis}">${sis}</option>`;
    });
}

window.adicionarSistemaManual = function() {
    const sel = document.getElementById('man-sistema-manual');
    if (sel && sel.value) {
        sistemasManuais.add(sel.value);
        sel.value = '';
        osSuja = true;
        window.renderizarSistemasESubsistemas();
    }
}

window.removerSistemaManual = function(sis) {
    sistemasManuais.delete(sis);
    osSuja = true;
    window.renderizarSistemasESubsistemas();
}

window.adicionarSubsistemaManual = function() {
    const sel = document.getElementById('man-subsistema-manual');
    if (sel && sel.value) {
        subsistemasManuais.add(sel.value);
        sel.value = '';
        osSuja = true;
        window.renderizarSistemasESubsistemas();
    }
}

window.removerSubsistemaManual = function(sub) {
    subsistemasManuais.delete(sub);
    osSuja = true;
    window.renderizarSistemasESubsistemas();
}

window.renderizarSistemasESubsistemas = function() {
    const sistemasAuto = new Set();
    const subsistemasAuto = new Set();
    
    itensManutencaoGlobal.forEach(item => {
        const baseCat = catalogoGlobal.find(c => c.descricao.toLowerCase() === item.descricao.toLowerCase());
        if (baseCat) {
            if (baseCat.sistema) sistemasAuto.add(baseCat.sistema);
            if (baseCat.subsistema) subsistemasAuto.add(baseCat.subsistema);
        }
    });

    const todosSistemas = new Set([...sistemasManuais, ...sistemasAuto]);
    const todosSubsistemas = new Set([...subsistemasManuais, ...subsistemasAuto]);

    const containerSist = document.getElementById('man-sistemas-badges');
    if (containerSist) {
        containerSist.innerHTML = '';
        if (todosSistemas.size === 0) {
            containerSist.innerHTML = '<span class="text-muted" style="font-size: 0.8rem;">Nenhum sistema selecionado...</span>';
        } else {
            todosSistemas.forEach(sis => {
                const isAuto = sistemasAuto.has(sis);
                const btnRemover = isAuto ? '' : `<i class="fas fa-times" style="margin-left: 6px; cursor: pointer;" onclick="window.removerSistemaManual('${sis}')"></i>`;
                const bgCor = isAuto ? 'var(--cor-primaria)' : '#6c757d'; 
                containerSist.innerHTML += `<span class="badge-sistema-os" style="background:${bgCor}; display: inline-flex; align-items: center; cursor: default;">${sis} ${btnRemover}</span>`;
            });
        }
    }

    const selSub = document.getElementById('man-subsistema-manual');
    if (selSub) {
        selSub.innerHTML = '<option value="">Selecionar Subsistema (Manual)...</option>';
        let subsDisponiveis = [];
        todosSistemas.forEach(sis => {
            if (arvoreSistemas[sis]) subsDisponiveis = subsDisponiveis.concat(arvoreSistemas[sis]);
        });
        [...new Set(subsDisponiveis)].sort().forEach(sub => {
            selSub.innerHTML += `<option value="${sub}">${sub}</option>`;
        });
    }

    const containerSub = document.getElementById('man-subsistemas-badges');
    if (containerSub) {
        containerSub.innerHTML = '';
        if (todosSubsistemas.size === 0) {
            containerSub.innerHTML = '<span class="text-muted" style="font-size: 0.8rem;">Nenhum subsistema selecionado...</span>';
        } else {
            todosSubsistemas.forEach(sub => {
                const isAuto = subsistemasAuto.has(sub);
                const btnRemover = isAuto ? '' : `<i class="fas fa-times" style="margin-left: 6px; cursor: pointer;" onclick="window.removerSubsistemaManual('${sub}')"></i>`;
                const bgCor = isAuto ? '#17a2b8' : '#6c757d'; 
                containerSub.innerHTML += `<span class="badge-sistema-os" style="background:${bgCor}; display: inline-flex; align-items: center; cursor: default;">${sub} ${btnRemover}</span>`;
            });
        }
    }
}

async function carregarSelectsModal() {
    try {
        const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
        let queryVeiculos = clienteSupabase.from('veiculos').select('id, placa, marca, modelo, km_atual').eq('ativo', true).order('placa');
        if (unidadeId !== 'TODAS') queryVeiculos = queryVeiculos.eq('unidade_id', unidadeId);
        
        const { data: veiculos } = await queryVeiculos;
        listaVeiculosModal = veiculos || [];
        
        const selModalPlaca = document.getElementById('man-placa');
        if (selModalPlaca) {
            selModalPlaca.innerHTML = '<option value="">Selecione a Placa...</option>';
            if (veiculos) veiculos.forEach(v => {
                selModalPlaca.innerHTML += `<option value="${v.id}" data-km="${v.km_atual || ''}">${v.placa} - ${v.marca || ''} ${v.modelo || ''}</option>`;
            });
        }
    } catch (e) { console.error("Erro modais", e); }
}

async function carregarBaseFornecedoresECatalogo() {
    try {
        const [resForn, resCat] = await Promise.all([
            clienteSupabase.from('manutencao_fornecedores').select('*').order('nome'),
            clienteSupabase.from('manutencao_catalogo').select('*').order('descricao')
        ]);
        fornecedoresGlobal = resForn.data || [];
        catalogoGlobal = resCat.data || [];
    } catch (e) { console.error(e); }
}

window.aoSelecionarPlacaManutencao = function() {
    const sel = document.getElementById('man-placa');
    if(!sel) return;
    const placaId = sel.value;
    const opt = sel.options[sel.selectedIndex];
    
    const inputKm = document.getElementById('man-km');
    if(inputKm && opt && opt.dataset.km && inputKm.value === '') {
        inputKm.value = opt.dataset.km;
    }
    osSuja = true;
}

window.puxarKmVeiculo = function() {
    const sel = document.getElementById('man-placa');
    if(!sel || sel.value === '') {
        mostrarToast("Selecione um veículo primeiro.", "warning");
        return;
    }
    const opt = sel.options[sel.selectedIndex];
    if (opt && opt.dataset.km) {
        document.getElementById('man-km').value = opt.dataset.km;
        osSuja = true;
        mostrarToast("Odômetro atualizado com o cadastro do veículo.", "success");
    } else {
        mostrarToast("Veículo selecionado não possui KM cadastrado.", "info");
    }
}

// =============================================================================
// FILTROS DA TELA PRINCIPAL
// =============================================================================

window.adicionarFiltroManutencao = function() {
    const container = document.getElementById('container-filtros-manutencao');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row-manutencao';
    div.id = `filter-${id}`;
    div.style.cssText = 'display: flex; gap: 10px; align-items: center; margin-bottom: 8px;';

    div.innerHTML = `
        <select class="form-control form-control-fix" style="width: 160px;" onchange="window.configurarInputFiltroManutencao(this, ${id})">
            <option value="">Filtrar por...</option>
            <option value="data">Data Exata</option>
            <option value="periodo">Período</option>
            <option value="placa">Placa</option>
            <option value="tipo">Tipo Manutenção</option>
            <option value="sistema">Sistema</option>
            <option value="fornecedor">Fornecedor</option>
        </select>
        <div id="wrapper-man-${id}" style="width: 260px; display: flex;">
            <input type="text" class="form-control form-control-fix" disabled placeholder="Selecione..." style="width: 100%;">
        </div>
        <button type="button" onclick="window.removerFiltroManutencao(${id})" style="border:none; background:none; color:#dc3545; cursor:pointer; padding: 0 5px;">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
};

window.removerFiltroManutencao = function(id) {
    const row = document.getElementById(`filter-${id}`);
    if (row) {
        row.remove();
        window.aplicarFiltrosManutencao();
    }
};

window.configurarInputFiltroManutencao = async function(sel, id) {
    const wrapper = document.getElementById(`wrapper-man-${id}`);
    if (!wrapper) return;
    
    wrapper.innerHTML = '<i class="fas fa-spinner fa-spin" style="margin-top: 10px; color: #999;"></i>';
    const tipo = sel.value;
    const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
    
    wrapper.innerHTML = '';
    
    if (tipo === 'periodo') {
        wrapper.innerHTML = `
            <div style="display: flex; gap: 5px; width: 100%; align-items: center;">
                <input type="date" class="form-control form-control-fix dt-inicio" style="width: 50%;" onchange="window.aplicarFiltrosManutencao()">
                <span style="color: #666;">a</span>
                <input type="date" class="form-control form-control-fix dt-fim" style="width: 50%;" onchange="window.aplicarFiltrosManutencao()">
            </div>
        `;
        window.aplicarFiltrosManutencao();
        return; 
    }

    let el;
    if (tipo === 'data') {
        el = document.createElement('input');
        el.type = 'date';
    } else if (tipo === 'tipo') {
        el = document.createElement('select');
        el.innerHTML = '<option value="">Todos</option><option value="Preventiva">Preventiva</option><option value="Corretiva">Corretiva</option><option value="Emergencial">Emergencial</option>';
    } else if (tipo === 'sistema') {
        el = document.createElement('select');
        el.innerHTML = '<option value="">Todos</option>';
        Object.keys(arvoreSistemas).sort().forEach(s => el.innerHTML += `<option value="${s}">${s}</option>`);
    } else if (tipo === 'placa') {
        el = document.createElement('select');
        el.innerHTML = '<option value="">Carregando...</option>';
        let q = clienteSupabase.from('veiculos').select('placa').eq('ativo', true).order('placa');
        if (unidadeId !== 'TODAS') q = q.eq('unidade_id', unidadeId);
        q.then(({ data }) => {
            el.innerHTML = '<option value="">Todas</option>';
            data?.forEach(v => el.innerHTML += `<option value="${v.placa}">${v.placa}</option>`);
        });
    } else {
        el = document.createElement('input');
        el.type = 'text';
        el.placeholder = tipo === 'fornecedor' ? 'Digite o nome do fornecedor...' : 'Selecione o filtro...';
        el.disabled = (tipo === '');
    }

    el.className = 'form-control form-control-fix input-filtro-manutencao';
    el.style.cssText = 'width: 100%; box-sizing: border-box;';
    
    el.onchange = () => window.aplicarFiltrosManutencao();
    if (el.tagName === 'INPUT' && el.type !== 'date') el.onkeyup = () => window.aplicarFiltrosManutencao();
    
    wrapper.appendChild(el);
    window.aplicarFiltrosManutencao();
};

window.repopularFiltrosManutencao = function() {
    const container = document.getElementById('container-filtros-manutencao');
    if (!container) return;

    const linhas = container.querySelectorAll('.filter-row-manutencao');
    const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";

    linhas.forEach(async (linha) => {
        const selectTipo = linha.querySelector('select');
        const wrapper = linha.querySelector('div[id^="wrapper-man-"]');
        const inputAtual = wrapper ? wrapper.querySelector('.input-filtro-manutencao') : null;

        if (!selectTipo || !inputAtual || inputAtual.tagName !== 'SELECT') return;
        const tipo = selectTipo.value;
        const valorSelecionado = inputAtual.value;

        if (tipo === 'placa') {
            let q = clienteSupabase.from('veiculos').select('placa').eq('ativo', true).order('placa');
            if (unidadeId !== 'TODAS') q = q.eq('unidade_id', unidadeId);
            const { data } = await q;
            inputAtual.innerHTML = '<option value="">Todas</option>';
            if (data) data.forEach(v => inputAtual.innerHTML += `<option value="${v.placa}">${v.placa}</option>`);
            inputAtual.value = valorSelecionado;
        }
    });
};

window.aplicarFiltrosManutencao = function() {
    const container = document.getElementById('container-filtros-manutencao');
    let dados = [...listaManutencoesGlobal];
    let descricoesFiltros = []; 

    if (container) {
        const linhas = container.querySelectorAll('.filter-row-manutencao');
        linhas.forEach(linha => {
            const selectTipo = linha.querySelector('select');
            if (!selectTipo) return;
            
            const tipo = selectTipo.value;
            const labelTipo = selectTipo.options[selectTipo.selectedIndex].text;
            
            if (tipo === 'periodo') {
                const dtInicio = linha.querySelector('.dt-inicio')?.value;
                const dtFim = linha.querySelector('.dt-fim')?.value;
                
                if (dtInicio || dtFim) {
                    let desc = "";
                    const formatar = (d) => d.split('-').reverse().join('/');
                    if (dtInicio && dtFim) {
                        desc = `${formatar(dtInicio)} a ${formatar(dtFim)}`;
                        dados = dados.filter(d => d.data_manutencao >= dtInicio && d.data_manutencao <= dtFim);
                    } else if (dtInicio) {
                        desc = `A partir de ${formatar(dtInicio)}`;
                        dados = dados.filter(d => d.data_manutencao >= dtInicio);
                    } else if (dtFim) {
                        desc = `Até ${formatar(dtFim)}`;
                        dados = dados.filter(d => d.data_manutencao <= dtFim);
                    }
                    descricoesFiltros.push(`<b>${labelTipo}:</b> ${desc}`);
                }
                return; 
            }

            const input = linha.querySelector('.input-filtro-manutencao');
            if (!input || !input.value) return;

            const valor = input.value;
            const valorMin = valor.toLowerCase();
            
            let valorDisplay = valor;
            if (input.tagName === 'SELECT' && input.selectedIndex >= 0) {
                valorDisplay = input.options[input.selectedIndex].text;
            } else if (input.type === 'date') {
                const parts = valor.split('-');
                if (parts.length === 3) valorDisplay = `${parts[2]}/${parts[1]}/${parts[0]}`;
            }

            if (valorMin === 'todos' || valor === '') return;

            descricoesFiltros.push(`<b>${labelTipo}:</b> ${valorDisplay}`);

            if (tipo === 'data') {
                dados = dados.filter(d => d.data_manutencao && d.data_manutencao.startsWith(valor));
            } else if (tipo === 'tipo') {
                dados = dados.filter(d => (d.tipo_manutencao || '').toLowerCase() === valorMin);
            } else if (tipo === 'sistema') {
                dados = dados.filter(d => (d.sistema || '').toLowerCase().includes(valorMin));
            } else if (tipo === 'placa') {
                dados = dados.filter(d => (d.veiculos?.placa || '').toLowerCase() === valorMin);
            } else if (tipo === 'fornecedor') {
                // Checa no nome do fornecedor de peças OU no de serviços
                dados = dados.filter(d => {
                    const nS = (d.fornecedor_servicos?.nome || '').toLowerCase();
                    const nP = (d.fornecedor_pecas?.nome || '').toLowerCase();
                    return nS.includes(valorMin) || nP.includes(valorMin);
                });
            }
        });
    }

    const lblFiltros = document.getElementById('lbl-filtros-ativos-manutencao');
    if (lblFiltros) {
        if (descricoesFiltros.length > 0) {
            lblFiltros.innerHTML = `<i class="fas fa-filter" style="color: #003399; margin-right:5px;"></i> ${descricoesFiltros.join(' <span style="margin:0 5px; color:#ccc;">|</span> ')}`;
        } else {
            lblFiltros.innerHTML = '<i>Mostrando todos os registros</i>';
        }
    }

    window.renderizarTabelaManutencoes(dados);
};

// =============================================================================
// LISTAGEM PRINCIPAL (DB)
// =============================================================================

window.listarManutencoes = async function() {
    const loading = document.getElementById('loading-manutencoes');
    const tbody = document.getElementById('tbody-manutencoes');
    
    if (loading) loading.style.display = 'flex';
    if (tbody) tbody.innerHTML = '';

    try {
        const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";

        let query = clienteSupabase
            .from('manutencoes')
            .select(`
                *,
                veiculos!inner (placa, marca, modelo, unidade_id),
                fornecedor_servicos:manutencao_fornecedores!manutencoes_fornecedor_id_fkey (nome),
                fornecedor_pecas:manutencao_fornecedores!manutencoes_fornecedor_pecas_id_fkey (nome)
            `)
            .order('data_manutencao', { ascending: false })
            .order('created_at', { ascending: false });

        if (unidadeId !== 'TODAS') {
            query = query.eq('veiculos.unidade_id', unidadeId);
        }

        const { data, error } = await query;
        if (error) throw error;

        listaManutencoesGlobal = data || [];
        
        await carregarSelectsModal();
        window.repopularFiltrosManutencao();
        window.aplicarFiltrosManutencao();

    } catch (error) {
        console.error("Erro ao listar manutenções:", error);
        mostrarToast("Erro ao carregar os dados.", "error");
    } finally {
        if (loading) loading.style.display = 'none';
    }
};

window.renderizarTabelaManutencoes = function(lista) {
    const tbody = document.getElementById('tbody-manutencoes');
    if (!tbody) return;
    tbody.innerHTML = '';

    document.getElementById('lbl-contagem-manutencoes').innerText = `Exibindo ${lista.length} registro(s)`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px; color:#999;">Nenhuma manutenção encontrada.</td></tr>';
        return;
    }

    lista.forEach(m => {
        const partesData = m.data_manutencao.split('-');
        const dataFmt = `${partesData[2]}/${partesData[1]}/${partesData[0]}`;
        
        let badgeTipo = '';
        if (m.tipo_manutencao === 'Preventiva') badgeTipo = '<span class="badge" style="background:#17a2b8; color:white; padding:4px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">PREVENTIVA</span>';
        else if (m.tipo_manutencao === 'Corretiva') badgeTipo = '<span class="badge" style="background:#ffc107; color:#333; padding:4px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">CORRETIVA</span>';
        else badgeTipo = '<span class="badge" style="background:#dc3545; color:white; padding:4px 8px; border-radius:12px; font-size:0.75rem; font-weight:bold;">EMERGENCIAL</span>';

        // Pega apenas a primeira palavra do nome fantasia
        const fornS = m.fornecedor_servicos?.nome ? m.fornecedor_servicos.nome.split(' ')[0] : '-';
        const fornP = m.fornecedor_pecas?.nome ? m.fornecedor_pecas.nome.split(' ')[0] : '-'; 

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="vertical-align: middle;">${dataFmt}</td>
            <td style="vertical-align: middle; font-weight: bold; color: var(--cor-primaria);">${m.veiculos?.placa || '-'}</td>
            <td style="vertical-align: middle; font-size: 0.85rem;">
                ${m.veiculos?.marca || ''} <br> <span style="color:#666;">${m.veiculos?.modelo || ''}</span>
            </td>
            <td style="vertical-align: middle;">
                ${(m.km_manutencao || 0).toLocaleString('pt-BR')} <br> <span style="font-size:0.75rem; color:#666;">km</span>
            </td>
            <td style="vertical-align: middle;">${badgeTipo}</td>
            <td style="vertical-align: middle; font-size: 0.8rem; color: #555; white-space: nowrap;">
                P: ${fornP}<br>S: ${fornS}
            </td>
            <td style="vertical-align: middle; text-align: right; color: var(--cor-primaria); font-weight: 500;">
                ${parseFloat(m.valor_total).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'})}
            </td>
            <td style="vertical-align: middle; text-align: center; white-space: nowrap;">
                <button type="button" class="btn-action-sm" onclick="window.abrirModalManutencao('${m.id}', true)" title="Visualizar"><i class="fas fa-eye" style="color:var(--cor-primaria)"></i></button>
                <button type="button" class="btn-action-sm" onclick="abrirModalLogsGlobal('manutencoes', '${m.id}', 'Histórico da Ordem de Serviço')" title="Auditoria (Logs)"><i class="fas fa-history" style="color:#20c997"></i></button>
                <button type="button" class="btn-action-sm" onclick="window.abrirModalManutencao('${m.id}')" title="Editar"><i class="fas fa-edit" style="color:#6c757d"></i></button>
                <button type="button" class="btn-action-sm" onclick="window.confirmarExclusaoOS('${m.id}', '${m.veiculos?.placa} - ${dataFmt}')" title="Excluir"><i class="fas fa-trash" style="color:#dc3545"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// =============================================================================
// MODAL PRINCIPAL E ABAS (COM PROTEÇÃO DIRTY STATE)
// =============================================================================

window.alternarAbaManutencao = function(aba) {
    ['geral', 'itens', 'local', 'obs'].forEach(a => {
        const content = document.getElementById(`content-man-${a}`);
        if(content) content.style.display = 'none';
        
        const btn = document.getElementById(`tab-man-${a}`);
        if(btn) {
            btn.style.borderBottomColor = 'transparent';
            btn.style.color = '#666';
            btn.style.fontWeight = 'normal';
        }
    });

    const activeContent = document.getElementById(`content-man-${aba}`);
    if(activeContent) activeContent.style.display = 'block';

    const activeBtn = document.getElementById(`tab-man-${aba}`);
    if(activeBtn) {
        activeBtn.style.borderBottomColor = 'var(--cor-primaria)';
        activeBtn.style.color = 'var(--cor-primaria)';
        activeBtn.style.fontWeight = 'bold';
    }
}

window.abrirModalManutencao = async function(id = null, readonly = false) {
    // 1. Grava de forma blindada se estamos no modo leitura
    window.isModoVisualizacaoOS = readonly; 

    const form = document.getElementById('form-manutencao');
    if(form) form.reset();
    
    dadosOriginaisOS = null;

    const setV = (idEl, val) => { const el = document.getElementById(idEl); if(el) el.value = val; }
    
    setV('man-id', '');
    
    const titulo = document.getElementById('titulo-modal-manutencao');
    if(titulo) titulo.innerText = id ? (readonly ? 'Visualizar Ordem de Serviço' : 'Editar Ordem de Serviço') : 'Nova Ordem de Serviço';
    
    const hoje = new Date();
    setV('man-data', new Date(hoje.getTime() - (hoje.getTimezoneOffset() * 60000)).toISOString().split('T')[0]);
    
    window.limparFornecedor('pecas');
    window.limparFornecedor('servicos');
    
    itensManutencaoGlobal = [];
    sistemasManuais.clear();
    subsistemasManuais.clear();
    
    window.renderizarListaItensManutencao();
    window.renderizarSistemasESubsistemas(); 
    
    window.alternarAbaManutencao('geral');

    const modal = document.getElementById('modal-manutencao');
    if (modal) {
        modal.querySelectorAll('.btn-primary').forEach(b => b.style.display = 'inline-block');
        modal.querySelectorAll('.fa-times').forEach(i => i.style.display = 'inline-block');
        modal.querySelectorAll('.btn-action-sm').forEach(b => {
            b.disabled = false;
            b.style.opacity = '1';
            b.style.cursor = 'pointer';
        });
        
        const btnSugerir = modal.querySelector('button[onclick="window.sugerirFornecedorHistorico()"]');
        if (btnSugerir) btnSugerir.style.display = 'inline-block';
    }

    if(form) form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = false);

    if (id) {
        const m = listaManutencoesGlobal.find(x => String(x.id) === String(id));
        if (m) {
            setV('man-id', m.id);
            setV('man-placa', m.veiculo_id);
            window.aoSelecionarPlacaManutencao(); 
            
            setV('man-data', m.data_manutencao);
            setV('man-km', m.km_manutencao);
            setV('man-tipo', m.tipo_manutencao);
            setV('man-obs', m.observacoes || '');

            if (m.sistema) m.sistema.split(',').map(s=>s.trim()).forEach(s => { if(s) sistemasManuais.add(s); });
            if (m.subsistema) m.subsistema.split(',').map(s=>s.trim()).forEach(s => { if(s) subsistemasManuais.add(s); });

            if (m.fornecedor_id) {
                const fornS = fornecedoresGlobal.find(f => String(f.id) === String(m.fornecedor_id));
                if (fornS) window.selecionarFornecedor(fornS.id, `${fornS.nome} - ${fornS.cnpj || fornS.razao_social || ''}`, 'servicos');
            }
            if (m.fornecedor_pecas_id) {
                const fornP = fornecedoresGlobal.find(f => String(f.id) === String(m.fornecedor_pecas_id));
                if (fornP) window.selecionarFornecedor(fornP.id, `${fornP.nome} - ${fornP.cnpj || fornP.razao_social || ''}`, 'pecas');
            }

            try {
                const { data: itens } = await clienteSupabase.from('manutencao_itens').select('*').eq('manutencao_id', m.id).order('created_at');
                if (itens && itens.length > 0) {
                    itensManutencaoGlobal = await Promise.all(itens.map(async i => {
                        let hint = "Sem histórico anterior.";
                        try {
                            const { data: hist } = await clienteSupabase.from('manutencao_itens').select('manutencoes(data_manutencao, km_manutencao)').eq('descricao', i.descricao).eq('manutencoes.veiculo_id', m.veiculo_id).lt('created_at', i.created_at).order('created_at', { ascending: false }).limit(1);
                            if (hist && hist[0]) {
                                const ms = hist[0].manutencoes;
                                hint = `Troca Anterior: ${ms.data_manutencao.split('-').reverse().join('/')} com ${ms.km_manutencao.toLocaleString('pt-BR')} km`;
                            }
                        } catch(e) {}
                        return { ...i, hint: hint };
                    }));
                    window.renderizarListaItensManutencao();
                }
            } catch (e) { console.error("Erro ao carregar itens:", e); }

            window.renderizarSistemasESubsistemas();
        }
    }

    if (readonly) {
        if(form) form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
        const btnS = document.getElementById('btn-salvar-manutencao');
        if(btnS) btnS.style.display = 'none';
        
        if (modal) {
            modal.querySelectorAll('.btn-primary').forEach(b => b.style.display = 'none');
            modal.querySelectorAll('.fa-times').forEach(i => i.style.display = 'none'); 
            
            modal.querySelectorAll('.btn-action-sm').forEach(b => {
                if (!b.classList.contains('icon-history-item')) {
                    b.disabled = true;
                    b.style.opacity = '0.4';
                    b.style.cursor = 'not-allowed';
                }
            });

            const btnSugerir = modal.querySelector('button[onclick="window.sugerirFornecedorHistorico()"]');
            if (btnSugerir) btnSugerir.style.display = 'none';
        }

        const btnC = document.querySelector('button[onclick="window.fecharModalManutencao()"]');
        if(btnC) btnC.disabled = false;
        
        document.querySelectorAll('.modal-tabs div').forEach(div => div.style.pointerEvents = 'auto');
    } else {
        const btnS = document.getElementById('btn-salvar-manutencao');
        if(btnS) btnS.style.display = 'block';
        
        // Tira a foto do estado inicial 500ms depois para garantir que tudo já foi carregado
        setTimeout(() => {
            dadosOriginaisOS = JSON.stringify(window.getPayloadOS());
        }, 500); 
    }

    if(modal) modal.classList.add('active');
}

window.fecharModalManutencao = function(forcar = false) {
    // 2. Se a requisição for de fechamento forçado OU se o modal estiver no modo visualização, fecha IMEDIATAMENTE sem checar o Payload
    if (forcar || window.isModoVisualizacaoOS) {
        const modal = document.getElementById('modal-manutencao');
        if(modal) modal.classList.remove('active');
        return;
    }

    // 3. Se for modo edição e não foi forçado, compara com a foto tirada na abertura
    if (dadosOriginaisOS) {
        const estadoAtual = JSON.stringify(window.getPayloadOS());
        if (estadoAtual !== dadosOriginaisOS) {
            document.getElementById('modal-confirmar-fechar-os').classList.add('active');
            return;
        }
    }
    
    const modal = document.getElementById('modal-manutencao');
    if(modal) modal.classList.remove('active');
}

window.fecharModalManutencao = function(forcar = false) {
    const btnSalvar = document.getElementById('btn-salvar-manutencao');
    const isReadonly = btnSalvar && btnSalvar.style.display === 'none';

    // Checagem blindada: Compara o formulário atual com a foto tirada na abertura
    if (!forcar && !isReadonly && dadosOriginaisOS) {
        const estadoAtual = JSON.stringify(window.getPayloadOS());
        if (estadoAtual !== dadosOriginaisOS) {
            document.getElementById('modal-confirmar-fechar-os').classList.add('active');
            return;
        }
    }
    
    const modal = document.getElementById('modal-manutencao');
    if(modal) modal.classList.remove('active');
}

window.alternarCategoriaCapsula = function(index) {
    // Blinda a alternância de categoria caso a tela esteja em modo de Visualização (Leitura)
    const titulo = document.getElementById('titulo-modal-manutencao');
    if (titulo && titulo.innerText.includes('Visualizar')) return; 

    window.syncItensDaTelaParaArray();
    if(itensManutencaoGlobal[index].categoria === 'Peça') {
        itensManutencaoGlobal[index].categoria = 'Serviço';
    } else {
        itensManutencaoGlobal[index].categoria = 'Peça';
    }
    osSuja = true;
    window.renderizarListaItensManutencao();
}

window.fecharModalManutencao = function(forcar = false) {
    // 1. Se a requisição for de fechamento forçado (botão "Sim, sair sem salvar"), fecha direto
    if (forcar) {
        document.getElementById('modal-manutencao').classList.remove('active');
        return;
    }

    // 2. BLINDAGEM ABSOLUTA: Checagem pelo DOM
    // Se o botão Salvar está oculto, é 100% de certeza que estamos no modo Visualizar.
    const btnSalvar = document.getElementById('btn-salvar-manutencao');
    const modoVisualizacao = btnSalvar && (btnSalvar.style.display === 'none' || window.getComputedStyle(btnSalvar).display === 'none');

    // Se for modo leitura, fecha direto e ignora qualquer checagem de dados
    if (modoVisualizacao) {
        document.getElementById('modal-manutencao').classList.remove('active');
        return;
    }

    // 3. Se for modo de Edição / Nova O.S., compara com a foto tirada na abertura
    if (dadosOriginaisOS) {
        const estadoAtual = JSON.stringify(window.getPayloadOS());
        if (estadoAtual !== dadosOriginaisOS) {
            document.getElementById('modal-confirmar-fechar-os').classList.add('active');
            return;
        }
    }
    
    // Se chegou aqui, não houve alteração, fecha normalmente
    document.getElementById('modal-manutencao').classList.remove('active');
}

window.cancelarFechamentoOS = function() {
    document.getElementById('modal-confirmar-fechar-os').classList.remove('active');
}

window.forcarFechamentoOS = function() {
    document.getElementById('modal-confirmar-fechar-os').classList.remove('active');
    window.fecharModalManutencao(true);
}


// =============================================================================
// GERENCIAMENTO DE ITENS DA O.S. (INLINE EDIT TABLE)
// =============================================================================

window.syncItensDaTelaParaArray = function() {
    const tbody = document.getElementById('tbody-itens-manutencao');
    if (!tbody) return;
    
    const rows = tbody.querySelectorAll('tr.row-historico-hint');
    let novosItens = [];
    
    rows.forEach(tr => {
        const descEl = tr.querySelector('.item-descricao');
        if (descEl) {
            novosItens.push({
                categoria: tr.querySelector('.capsula-cat').innerText,
                descricao: descEl.value,
                marca: tr.querySelector('.item-marca').value,
                quantidade: parseFloat(tr.querySelector('.item-qtd').value) || 0,
                valor_unitario: window.parseMoeda(tr.querySelector('.item-valor').value),
                observacao: tr.querySelector('.item-obs').value,
                hint: tr.title 
            });
        }
    });
    itensManutencaoGlobal = novosItens;
}

window.calcularTotaisOS = function() {
    const rows = document.querySelectorAll('#tbody-itens-manutencao tr.row-historico-hint');
    let totalOS = 0;
    let count = 0;
    
    rows.forEach(tr => {
        const elQtd = tr.querySelector('.item-qtd');
        const elVal = tr.querySelector('.item-valor');
        const elTot = tr.querySelector('.item-total-display');
        
        if (elQtd && elVal && elTot) {
            const q = parseFloat(elQtd.value) || 0;
            const v = window.parseMoeda(elVal.value);
            const tot = q * v;
            totalOS += tot;
            count++;
            elTot.innerText = tot.toLocaleString('pt-BR', {minimumFractionDigits: 2});
        }
    });
    
    const displayTot = document.getElementById('man-valor-total-display');
    if(displayTot) {
        displayTot.innerText = totalOS.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
        displayTot.dataset.valorBruto = totalOS;
    }
    
    const displayQtd = document.getElementById('lbl-qtd-itens');
    if(displayQtd) displayQtd.innerText = count;
}

window.renderizarListaItensManutencao = function() {
    const tbody = document.getElementById('tbody-itens-manutencao');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    if (itensManutencaoGlobal.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 25px; color: #999;">Nenhum item ou serviço adicionado. Clique em "Buscar no Catálogo Base".</td></tr>';
        window.calcularTotaisOS();
        return;
    } 

    itensManutencaoGlobal.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.className = 'row-historico-hint';
        tr.title = item.hint || '';
        
        const isPeca = item.categoria === 'Peça';
        const capsuleHtml = `<span class="capsula-cat ${isPeca ? 'capsula-peca' : 'capsula-servico'}" style="cursor:pointer;" onclick="window.alternarCategoriaCapsula(${index})">${item.categoria}</span>`;
        const valUnitarioStr = item.valor_unitario ? (item.valor_unitario.toFixed(2).replace('.', ',')) : '';

        tr.innerHTML = `
            <td style="text-align: center;">${capsuleHtml}</td>
            <td><input type="text" class="item-descricao" value="${item.descricao}" placeholder="Descrição..." style="width: 100%;"></td>
            <td><input type="text" class="item-marca" value="${item.marca || ''}" placeholder="Marca..."></td>
            <td><input type="number" class="item-qtd" value="${item.quantidade}" min="0.01" step="0.01" oninput="window.calcularTotaisOS(); osSuja=true;" style="text-align: center;"></td>
            <td><input type="text" class="item-valor col-contabil" value="${valUnitarioStr}" placeholder="0,00" onkeyup="window.formatarMoeda(this); osSuja=true;"></td>
            <td><input type="text" class="item-obs" value="${item.observacao || ''}" placeholder="Observação..."></td>
            <td class="col-contabil" style="vertical-align: middle; color: var(--cor-primaria);">
                R$ <span class="item-total-display">0,00</span>
            </td>
            <td style="text-align: center; vertical-align: middle; white-space: nowrap;">
                <div style="display: flex; gap: 8px; justify-content: center;">
                    <button type="button" class="btn-action-sm icon-history-item" onclick="window.abrirModalHistoricoItem('${item.descricao.replace(/'/g, "\\'")}')" title="Ver Histórico"><i class="fas fa-history"></i></button>
                    <button type="button" class="btn-action-sm icon-edit-item" onclick="window.abrirModalBuscaCatalogoParaLinha(${index})" title="Trocar pelo Catálogo"><i class="fas fa-search"></i></button>
                    <button type="button" class="btn-action-sm icon-del-item" onclick="window.removerItemManutencao(${index})" title="Remover"><i class="fas fa-trash"></i></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
    
    document.querySelectorAll('.item-valor').forEach(inp => { if(inp.value) window.formatarMoeda(inp); });
    window.calcularTotaisOS();
}

window.alternarCategoriaCapsula = function(index) {
    window.syncItensDaTelaParaArray();
    if(itensManutencaoGlobal[index].categoria === 'Peça') {
        itensManutencaoGlobal[index].categoria = 'Serviço';
    } else {
        itensManutencaoGlobal[index].categoria = 'Peça';
    }
    osSuja = true;
    window.renderizarListaItensManutencao();
}

window.removerItemManutencao = function(index) {
    window.syncItensDaTelaParaArray();
    itensManutencaoGlobal.splice(index, 1);
    osSuja = true;
    window.renderizarListaItensManutencao();
    window.renderizarSistemasESubsistemas();
}

// =============================================================================
// HISTÓRICO DO ITEM (MODAL)
// =============================================================================

window.abrirModalHistoricoItem = async function(descricao) {
    const placaId = document.getElementById('man-placa').value;
    if (!placaId) {
        mostrarToast("Selecione o veículo na aba Dados Gerais primeiro.", "warning");
        window.alternarAbaManutencao('geral');
        return;
    }

    document.getElementById('txt-hist-item-desc').innerText = descricao;
    const tbody = document.getElementById('tbody-modal-historico-item');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 25px; color: #666;"><i class="fas fa-spinner fa-spin"></i> Buscando histórico no servidor...</td></tr>';
    
    document.getElementById('modal-historico-item').classList.add('active');

    try {
        const { data, error } = await clienteSupabase
            .from('manutencao_itens')
            .select('quantidade, valor_unitario, marca, created_at, manutencoes!inner(data_manutencao, km_manutencao, fornecedor_id, fornecedor_servicos:manutencao_fornecedores!manutencoes_fornecedor_id_fkey(nome))')
            .eq('descricao', descricao)
            .eq('manutencoes.veiculo_id', placaId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        tbody.innerHTML = '';

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 25px; color: #999;">Nenhuma troca anterior encontrada para este item neste veículo.</td></tr>';
            return;
        }

        data.forEach(hist => {
            const m = hist.manutencoes;
            const dataFmt = m.data_manutencao.split('-').reverse().join('/');
            const kmFmt = m.km_manutencao ? m.km_manutencao.toLocaleString('pt-BR') + ' km' : '-';
            const vlrFmt = hist.valor_unitario ? parseFloat(hist.valor_unitario).toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'}) : 'R$ 0,00';
            const oficina = m.fornecedor_servicos?.nome || '-';

            tbody.innerHTML += `
                <tr>
                    <td style="vertical-align: middle; font-weight: bold; color: #444;">${dataFmt}</td>
                    <td style="vertical-align: middle;">${kmFmt}</td>
                    <td style="vertical-align: middle;">${hist.marca || '-'}</td>
                    <td style="vertical-align: middle; text-align: center;">${hist.quantidade}</td>
                    <td class="col-contabil" style="vertical-align: middle;">${vlrFmt}</td>
                    <td style="vertical-align: middle; font-size: 0.8rem; color: #555;">${oficina}</td>
                </tr>
            `;
        });

    } catch (e) {
        console.error("Erro ao buscar histórico do item:", e);
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 25px; color: #dc3545;">Erro ao buscar histórico no banco de dados.</td></tr>';
    }
}

window.fecharModalHistoricoItem = function() {
    document.getElementById('modal-historico-item').classList.remove('active');
}

// =============================================================================
// SUB-MODAIS (CATÁLOGO)
// =============================================================================

window.abrirModalBuscaCatalogo = function() {
    const placaId = document.getElementById('man-placa').value;
    if (!placaId) {
        mostrarToast("Selecione a Placa do veículo na aba Dados Gerais primeiro.", "warning");
        window.alternarAbaManutencao('geral');
        return;
    }
    
    indexLinhaEditCatalogo = -1; 
    document.getElementById('container-filtros-busca-cat').innerHTML = '';
    window.adicionarFiltroBuscaCatModal();
    document.getElementById('modal-busca-catalogo').classList.add('active');
    window.aplicarFiltrosBuscaCat();
}

window.abrirModalBuscaCatalogoParaLinha = function(index) {
    const placaId = document.getElementById('man-placa').value;
    if (!placaId) {
        mostrarToast("Selecione a Placa do veículo na aba Dados Gerais primeiro.", "warning");
        window.alternarAbaManutencao('geral');
        return;
    }

    indexLinhaEditCatalogo = index;
    document.getElementById('container-filtros-busca-cat').innerHTML = '';
    window.adicionarFiltroBuscaCatModal();
    document.getElementById('modal-busca-catalogo').classList.add('active');
    window.aplicarFiltrosBuscaCat();
}

window.fecharModalBuscaCatalogo = function() {
    const modal = document.getElementById('modal-busca-catalogo');
    if(modal) modal.classList.remove('active');
}

window.adicionarFiltroBuscaCatModal = function() {
    const container = document.getElementById('container-filtros-busca-cat');
    if(!container) return;

    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row-busca-cat';
    div.id = `filter-cat-${id}`;
    div.style.cssText = 'display: flex; gap: 10px; align-items: center; background: #e9ecef; padding: 5px 10px; border-radius: 4px;';

    div.innerHTML = `
        <select class="form-control form-control-fix" style="width: 150px;" onchange="window.configInputBuscaCat(this, ${id})">
            <option value="descricao">Descrição</option>
            <option value="codigo_interno">Cód. Interno</option>
            <option value="categoria">Categoria</option>
            <option value="sistema">Sistema</option>
            <option value="aplicacao">Aplicação (Marca/Mod)</option>
        </select>
        <div id="wrapper-busca-cat-${id}" style="flex: 1; display: flex;">
            <input type="text" class="form-control form-control-fix input-filtro-busca-cat" placeholder="Digite para buscar..." style="width: 100%;" onkeyup="window.aplicarFiltrosBuscaCat()">
        </div>
        <button type="button" onclick="window.removerFiltroBuscaCat(${id})" style="border:none; background:none; color:#dc3545; cursor:pointer;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

window.removerFiltroBuscaCat = function(id) {
    const el = document.getElementById(`filter-cat-${id}`);
    if(el) el.remove();
    window.aplicarFiltrosBuscaCat();
}

window.configInputBuscaCat = function(sel, id) {
    const wrapper = document.getElementById(`wrapper-busca-cat-${id}`);
    if(!wrapper) return;

    const tipo = sel.value;
    wrapper.innerHTML = '';
    
    if (tipo === 'sistema' || tipo === 'categoria' || tipo === 'aplicacao') {
        const select = document.createElement('select');
        select.className = 'form-control form-control-fix input-filtro-busca-cat';
        select.style.width = '100%';
        select.innerHTML = '<option value="">Todos</option>';
        if (tipo === 'sistema') Object.keys(arvoreSistemas).sort().forEach(s => select.innerHTML += `<option value="${s}">${s}</option>`);
        else if (tipo === 'categoria') select.innerHTML += '<option value="Peça">Peça</option><option value="Serviço">Serviço</option>';
        else if (tipo === 'aplicacao') {
            const aplicacoesUnicas = new Set();
            listaVeiculosModal.forEach(v => {
                const marcaModelo = v.modelo ? `${v.marca} - ${v.modelo}` : v.marca;
                if (marcaModelo) aplicacoesUnicas.add(marcaModelo);
            });
            Array.from(aplicacoesUnicas).sort().forEach(app => select.innerHTML += `<option value="${app}">${app}</option>`);
        }
        select.onchange = window.aplicarFiltrosBuscaCat;
        wrapper.appendChild(select);
    } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-control form-control-fix input-filtro-busca-cat';
        inp.style.width = '100%';
        inp.placeholder = 'Digite para buscar...';
        inp.onkeyup = window.aplicarFiltrosBuscaCat;
        wrapper.appendChild(inp);
    }
    window.aplicarFiltrosBuscaCat();
}

window.aplicarFiltrosBuscaCat = function() {
    const container = document.getElementById('container-filtros-busca-cat');
    let dados = [...catalogoGlobal];

    // NOVO: Filtro automático e invisível pela placa selecionada na O.S.
    const placaId = document.getElementById('man-placa').value;
    if (placaId) {
        dados = dados.filter(i => {
            // Se o item não tem veículos vinculados (array vazio ou nulo), consideramos UNIVERSAL
            if (!i.veiculos_aplicacao_json || !Array.isArray(i.veiculos_aplicacao_json) || i.veiculos_aplicacao_json.length === 0) {
                return true; 
            }
            // Se tem veículos vinculados, a placa atual DEVE estar na lista de aplicação
            return i.veiculos_aplicacao_json.some(idVeiculo => String(idVeiculo) === String(placaId));
        });
    }

    if (container) {
        container.querySelectorAll('.filter-row-busca-cat').forEach(linha => {
            const tipo = linha.querySelector('select').value;
            const input = linha.querySelector('.input-filtro-busca-cat');
            if (!input || !input.value) return;

            const valor = input.value.toLowerCase();
            if (valor === 'todos' || valor === '') return;

            dados = dados.filter(i => {
                if (tipo === 'descricao') return (i.descricao || '').toLowerCase().includes(valor);
                if (tipo === 'codigo_interno') return (i.codigo_interno || '').toLowerCase().includes(valor);
                if (tipo === 'categoria') return (i.categoria || '').toLowerCase() === valor;
                if (tipo === 'sistema') return (i.sistema || '').toLowerCase() === valor;
                if (tipo === 'aplicacao') {
                    if (!i.veiculos_aplicacao_json || !Array.isArray(i.veiculos_aplicacao_json)) return false;
                    return i.veiculos_aplicacao_json.some(idVeiculo => {
                        const v = listaVeiculosModal.find(veic => String(veic.id) === String(idVeiculo));
                        if (!v) return false;
                        const mm = v.modelo ? `${v.marca} - ${v.modelo}` : v.marca;
                        return mm.toLowerCase() === valor;
                    });
                }
                return true;
            });
        });
    }

    const tbody = document.getElementById('tbody-modal-busca-cat');
    if(!tbody) return;
    
    tbody.innerHTML = '';

    if (dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center p-3 text-muted">Nenhum item compatível encontrado para o veículo selecionado.</td></tr>';
        return;
    }

    dados.forEach(i => {
        const sistemaTxt = i.sistema ? `${i.sistema}<br><span style="font-size:0.7rem; color:#888;">${i.subsistema || ''}</span>` : '-';
        const isPeca = i.categoria === 'Peça';
        const capsule = `<span class="capsula-cat ${isPeca ? 'capsula-peca' : 'capsula-servico'}">${i.categoria}</span>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: bold; color: #555; vertical-align:middle;">${i.codigo_interno || '-'}</td>
            <td style="vertical-align:middle;">
                <div style="font-weight:bold; color:#333; font-size:0.9rem;">${i.descricao}</div>
            </td>
            <td style="vertical-align:middle; text-align:center;">${capsule}</td>
            <td style="vertical-align:middle; font-size: 0.8rem; color:#555;">${sistemaTxt}</td>
            <td style="text-align:center; vertical-align:middle;">
                <button type="button" class="btn-check-success-rounded" title="Selecionar Item" onclick="window.adicionarItemDoCatalogo('${i.categoria}', '${i.descricao.replace(/'/g, "\\'")}', '${i.id}')">
                    <i class="fas fa-check"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.adicionarItemDoCatalogo = async function(cat, desc, idCatalogo) {
    window.syncItensDaTelaParaArray(); 

    const itemCat = catalogoGlobal.find(x => String(x.id) === String(idCatalogo));
    const placaId = document.getElementById('man-placa').value;
    let hintText = "Primeiro registro deste item neste veículo.";
    let ehPrimeiraVez = true;

    try {
        const { data } = await clienteSupabase.from('manutencao_itens').select('manutencoes(data_manutencao, km_manutencao)').eq('descricao', desc).eq('manutencoes.veiculo_id', placaId).order('created_at', { ascending: false }).limit(1);
        if (data && data[0] && data[0].manutencoes) {
            const m = data[0].manutencoes;
            hintText = `Última troca: ${m.data_manutencao.split('-').reverse().join('/')} com ${m.km_manutencao.toLocaleString('pt-BR')} km`;
            ehPrimeiraVez = false;
        }
    } catch(e) {}

    const obj = {
        categoria: cat,
        descricao: desc,
        marca: '',
        quantidade: 1,
        valor_unitario: itemCat ? (itemCat.valor_padrao || 0) : 0,
        observacao: '',
        hint: hintText
    };

    if (indexLinhaEditCatalogo === -1) {
        itensManutencaoGlobal.push(obj);
    } else {
        itensManutencaoGlobal[indexLinhaEditCatalogo] = obj;
    }

    osSuja = true;
    window.renderizarListaItensManutencao();
    window.renderizarSistemasESubsistemas(); 
    window.fecharModalBuscaCatalogo();

    if (ehPrimeiraVez) {
        mostrarToast(`Item adicionado: ${desc}. Este é o primeiro registro neste veículo.`, "success");
    } else {
        mostrarToast(`Item adicionado: ${desc}. ${hintText}`, "info");
    }
}

// =============================================================================
// SUB-MODAIS DE BUSCA (FORNECEDOR)
// =============================================================================

window.abrirModalBuscaFornecedor = function(tipoAlvo) {
    tipoAlvoForn = tipoAlvo; 
    
    const title = document.getElementById('titulo-modal-forn');
    if(title) title.innerText = `Buscar Fornecedor (${tipoAlvo})`;

    const container = document.getElementById('container-filtros-busca-forn');
    if(container) container.innerHTML = '';
    
    window.adicionarFiltroBuscaFornModal();
    const modal = document.getElementById('modal-busca-fornecedor');
    if(modal) modal.classList.add('active');
    
    setTimeout(() => { window.aplicarFiltrosBuscaForn(); }, 50);
}

window.fecharModalBuscaFornecedor = function() {
    const modal = document.getElementById('modal-busca-fornecedor');
    if(modal) modal.classList.remove('active');
}

window.adicionarFiltroBuscaFornModal = function() {
    const container = document.getElementById('container-filtros-busca-forn');
    if(!container) return;

    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row-busca-forn';
    div.id = `filter-forn-${id}`;
    div.style.cssText = 'display: flex; gap: 10px; align-items: center; background: #e9ecef; padding: 5px 10px; border-radius: 4px;';

    div.innerHTML = `
        <select class="form-control form-control-fix" style="width: 150px;" onchange="window.configInputBuscaForn(this, ${id})">
            <option value="nome">Nome / Razão</option>
            <option value="cnpj">CPF / CNPJ</option>
            <option value="sistema">Sistema Atendido</option>
        </select>
        <div id="wrapper-busca-forn-${id}" style="flex: 1; display: flex;">
            <input type="text" class="form-control form-control-fix input-filtro-busca-forn" placeholder="Digite Nome/Razão..." style="width: 100%;" onkeyup="window.aplicarFiltrosBuscaForn()">
        </div>
        <button type="button" onclick="window.removerFiltroBuscaForn(${id})" style="border:none; background:none; color:#dc3545; cursor:pointer;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

window.removerFiltroBuscaForn = function(id) {
    const el = document.getElementById(`filter-forn-${id}`);
    if(el) el.remove();
    window.aplicarFiltrosBuscaForn();
}

window.configInputBuscaForn = function(sel, id) {
    const wrapper = document.getElementById(`wrapper-busca-forn-${id}`);
    if(!wrapper) return;
    
    const tipo = sel.value;
    wrapper.innerHTML = '';
    
    if (tipo === 'sistema') {
        const select = document.createElement('select');
        select.className = 'form-control form-control-fix input-filtro-busca-forn';
        select.style.width = '100%';
        select.innerHTML = '<option value="">Todos</option>';
        Object.keys(arvoreSistemas).sort().forEach(s => select.innerHTML += `<option value="${s}">${s}</option>`);
        select.onchange = window.aplicarFiltrosBuscaForn;
        wrapper.appendChild(select);
    } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-control form-control-fix input-filtro-busca-forn';
        inp.style.width = '100%';
        inp.placeholder = tipo === 'cnpj' ? 'Digite CPF/CNPJ...' : 'Digite Nome/Razão...';
        inp.onkeyup = window.aplicarFiltrosBuscaForn;
        wrapper.appendChild(inp);
    }
    window.aplicarFiltrosBuscaForn();
}

window.aplicarFiltrosBuscaForn = function() {
    const container = document.getElementById('container-filtros-busca-forn');
    let dados = [...fornecedoresGlobal];

    if (container) {
        container.querySelectorAll('.filter-row-busca-forn').forEach(linha => {
            const tipo = linha.querySelector('select').value;
            const input = linha.querySelector('.input-filtro-busca-forn');
            if (!input || !input.value) return;

            const valor = input.value.toLowerCase();
            if (valor === 'todos' || valor === '') return;

            dados = dados.filter(f => {
                if (tipo === 'nome') return (f.nome || '').toLowerCase().includes(valor) || (f.razao_social || '').toLowerCase().includes(valor);
                if (tipo === 'cnpj') return (f.cnpj || '').includes(valor);
                if (tipo === 'sistema') return (f.sistemas_atendidos || '').toLowerCase().includes(valor);
                return true;
            });
        });
    }

    const tipoTarget = tipoAlvoForn === 'Peça' ? 'PEÇAS' : 'SERVIÇOS';
    dados = dados.filter(f => {
        const tipoBD = (f.tipo_fornecimento || f.tipo || '').toUpperCase();
        if (tipoBD === 'AMBOS') return true;
        if (tipoBD && tipoBD !== tipoTarget) return false;
        return true; 
    });

    const tbody = document.getElementById('tbody-modal-busca-forn');
    if(!tbody) return;
    tbody.innerHTML = '';

    if(dados.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-3 text-muted">Nenhum fornecedor encontrado para esta categoria.</td></tr>';
        return;
    }

    dados.forEach(f => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:bold; font-size:0.9rem; color:#333;">${f.nome}</div>
                <div style="font-size:0.75rem; color:#888;">${f.razao_social || '-'}</div>
            </td>
            <td style="font-size:0.85rem; vertical-align:middle;">${f.cnpj || '-'}</td>
            <td style="font-size:0.8rem; color:#666; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align:middle;" title="${f.sistemas_atendidos || 'Todos'}">
                ${f.sistemas_atendidos || 'Todos'}
            </td>
            <td style="vertical-align:middle; text-align:center;">
                <button type="button" class="btn-check-success-rounded" title="Selecionar" onclick="window.selecionarFornecedor('${f.id}', '${f.nome.replace(/'/g, "\\'")}', null)">
                    <i class="fas fa-check"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.selecionarFornecedor = async function(id, descricaoAntiga, forcarAlvo) {
    const alvo = forcarAlvo || tipoAlvoForn;
    const ehPeca = (alvo === 'Peça' || alvo === 'pecas');
    
    const inputId = document.getElementById(ehPeca ? 'man-fornecedor-pecas-id' : 'man-fornecedor-servicos-id');
    const txtSel = document.getElementById(ehPeca ? 'txt-forn-pecas-selecionado' : 'txt-forn-servicos-selecionado');
    const alertBox = document.getElementById(ehPeca ? 'alert-forn-pecas' : 'alert-forn-servicos');
    const divEmpty = document.getElementById(ehPeca ? 'div-forn-peca' : 'div-forn-serv');
    
    if (inputId) inputId.value = id;
    if (alertBox) alertBox.style.display = 'flex';
    if (divEmpty) divEmpty.style.display = 'none';
    
    // Exibe um feedback de carregamento rapidamente enquanto busca a data no banco
    if (txtSel) txtSel.innerHTML = `<span style="font-weight: bold; font-size: 0.95rem;">Buscando detalhes do local... <i class="fas fa-spinner fa-spin" style="margin-left: 5px;"></i></span>`;

    let nome = descricaoAntiga || 'Local Desconhecido';
    let cnpj = '';
    let enderecoCompleto = 'Endereço não cadastrado';
    let ultimaMov = 'Sem histórico anterior';

    // 1. Resgata os dados de endereço que já estão carregados na memória
    const forn = fornecedoresGlobal.find(f => String(f.id) === String(id));
    if (forn) {
        nome = forn.nome || '';
        cnpj = forn.cnpj || '';
        let partesEnd = [];
        if (forn.endereco) partesEnd.push(forn.endereco);
        if (forn.numero) partesEnd.push(forn.numero);
        if (forn.bairro) partesEnd.push(forn.bairro);
        if (forn.cidade) partesEnd.push(`${forn.cidade}/${forn.uf}`);
        if (partesEnd.length > 0) enderecoCompleto = partesEnd.join(', ');
    }

    // 2. Busca no banco de dados a data da última manutenção atrelada a este local
    try {
        let colunaBusca = ehPeca ? 'fornecedor_pecas_id' : 'fornecedor_id';
        const { data: ultOs } = await clienteSupabase.from('manutencoes')
            .select('data_manutencao')
            .eq(colunaBusca, id)
            .order('data_manutencao', { ascending: false })
            .limit(1);

        if (ultOs && ultOs.length > 0) {
            ultimaMov = ultOs[0].data_manutencao.split('-').reverse().join('/');
        }
    } catch (e) {
        console.error("Erro ao buscar histórico do fornecedor:", e);
    }

    // 3. Monta o novo visual do card com as informações detalhadas
    const textoExibicao = `
        <div style="display: inline-flex; flex-direction: column; vertical-align: middle; margin-left: 8px;">
            <span style="font-weight: bold; font-size: 0.95rem;">${nome} ${cnpj ? `- ${cnpj}` : ''}</span>
            <span style="font-size: 0.8rem; font-weight: normal; margin-top: 4px; color: #555; text-transform: none;"><i class="fas fa-map-marker-alt" style="width:14px; text-align:center;"></i> ${enderecoCompleto}</span>
            <span style="font-size: 0.75rem; font-weight: normal; margin-top: 2px; color: #666; text-transform: none;"><i class="fas fa-history" style="width:14px; text-align:center;"></i> Última movimentação: <b style="color: #333;">${ultimaMov}</b></span>
        </div>
    `;

    // Atualiza o texto na tela
    if (txtSel) txtSel.innerHTML = textoExibicao;
    
    osSuja = true;
    window.fecharModalBuscaFornecedor(); 
}

window.limparFornecedor = function(tipoAlvo) {
    if (tipoAlvo === 'pecas' || !tipoAlvo) {
        const inputId = document.getElementById('man-fornecedor-pecas-id');
        const alertBox = document.getElementById('alert-forn-pecas');
        const divEmpty = document.getElementById('div-forn-peca');
        
        if(inputId) inputId.value = '';
        if(alertBox) alertBox.style.display = 'none';
        if(divEmpty) divEmpty.style.display = 'flex';
    }
    if (tipoAlvo === 'servicos' || !tipoAlvo) {
        const inputId = document.getElementById('man-fornecedor-servicos-id');
        const alertBox = document.getElementById('alert-forn-servicos');
        const divEmpty = document.getElementById('div-forn-serv');
        
        if(inputId) inputId.value = '';
        if(alertBox) alertBox.style.display = 'none';
        if(divEmpty) divEmpty.style.display = 'flex';
    }
    osSuja = true;
}

window.sugerirFornecedorHistorico = async function() {
    // 1. Verifica se há itens na O.S. para usar como base da busca
    if (itensManutencaoGlobal.length === 0) {
        mostrarToast("Adicione peças ou serviços na aba correspondente para buscar sugestões.", "warning");
        window.alternarAbaManutencao('itens');
        return;
    }

    // 2. Extrai as descrições dos itens atuais
    const descricoes = itensManutencaoGlobal.map(i => i.descricao);

    try {
        mostrarToast("Buscando histórico de fornecedores para estes itens...", "info");

        // 3. Busca nas manutenções anteriores onde esses itens foram usados
        let query = clienteSupabase.from('manutencao_itens')
            .select(`
                created_at,
                manutencoes!inner (
                    fornecedor_id, 
                    fornecedor_pecas_id,
                    forn_servicos:manutencao_fornecedores!manutencoes_fornecedor_id_fkey(nome, cnpj),
                    forn_pecas:manutencao_fornecedores!manutencoes_fornecedor_pecas_id_fkey(nome, cnpj)
                )
            `)
            .in('descricao', descricoes)
            .order('created_at', { ascending: false })
            .limit(20); // Limita para não pesar a busca, pegando só os mais recentes
        
        const { data, error } = await query;
        if (error) throw error;
        
        let achouServico = false;
        let achouPeca = false;

        if (data && data.length > 0) {
            // Varre o histórico buscando a oficina de serviços mais recente vinculada a esses itens
            const histS = data.find(d => d.manutencoes && d.manutencoes.fornecedor_id && d.manutencoes.forn_servicos);
            if (histS) {
                const m = histS.manutencoes;
                window.selecionarFornecedor(m.fornecedor_id, `${m.forn_servicos.nome} - ${m.forn_servicos.cnpj || ''}`, 'servicos');
                achouServico = true;
            }

            // Varre o histórico buscando o fornecedor de peças mais recente vinculado a esses itens
            const histP = data.find(d => d.manutencoes && d.manutencoes.fornecedor_pecas_id && d.manutencoes.forn_pecas);
            if (histP) {
                const m = histP.manutencoes;
                window.selecionarFornecedor(m.fornecedor_pecas_id, `${m.forn_pecas.nome} - ${m.forn_pecas.cnpj || ''}`, 'pecas');
                achouPeca = true;
            }
        }

        if (achouServico || achouPeca) {
            mostrarToast("Locais sugeridos com base no histórico destes itens!", "success");
        } else {
            mostrarToast("Nenhum histórico recente de fornecedores encontrado para estes itens.", "info");
        }

    } catch (e) { 
        console.error("Erro ao sugerir fornecedor pelo histórico dos itens:", e);
        mostrarToast("Erro ao processar sugestão de histórico.", "error");
    }
}

// =============================================================================
// PERSISTÊNCIA (SALVAR E EXCLUIR O.S.) + AUDITORIA LOGS
// =============================================================================

window.salvarFormularioOS = async function(e) {
    if(e) e.preventDefault();
    
    const form = document.getElementById('form-manutencao');

    if (form && !form.checkValidity()) {
        const campoErro = form.querySelector(':invalid');
        if (campoErro) {
            const painel = campoErro.closest('div.tab-pane-os');
            if (painel) {
                const abaErro = painel.id.replace('content-man-', '');
                window.alternarAbaManutencao(abaErro);
            }
            campoErro.focus();
            mostrarToast("Preencha os campos obrigatórios.", "error");
        }
        return;
    }

    const payloadOSFull = window.getPayloadOS(); // Pega tudo agrupado
    const payloadOS = payloadOSFull.os;

    if (payloadOSFull.itens.length === 0) {
        window.alternarAbaManutencao('itens');
        mostrarToast("A O.S. precisa ter ao menos um item/serviço.", "warning");
        return;
    }

    const idEl = document.getElementById('man-id');
    const id = idEl ? idEl.value : '';

    // VALIDAÇÃO: Se nada mudou, avisa e não faz nada
    if (id && dadosOriginaisOS && JSON.stringify(payloadOSFull) === dadosOriginaisOS) {
        mostrarToast("Nenhuma alteração detectada para salvar.", "info");
        return;
    }

    const btn = document.getElementById('btn-salvar-manutencao');
    if(btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gravando...';
    }

    try {
        let osId = id;

        if (id) {
            await clienteSupabase.from('manutencoes').update(payloadOS).eq('id', id);
            await clienteSupabase.from('manutencao_itens').delete().eq('manutencao_id', id);
        } else {
            const { data } = await clienteSupabase.from('manutencoes').insert([payloadOS]).select();
            osId = data[0].id;
        }

        const payloadItens = payloadOSFull.itens.map(i => ({
            manutencao_id: osId,
            categoria: i.categoria,
            descricao: i.descricao,
            marca: i.marca || null,
            quantidade: parseFloat(i.quantidade),
            valor_unitario: parseFloat(i.valor_unitario),
            observacao: i.observacao || null
        }));

        await clienteSupabase.from('manutencao_itens').insert(payloadItens);

        // Auditoria
        const { data: { user } } = await clienteSupabase.auth.getUser();
        if (user) {
            await clienteSupabase.from('logs_auditoria').insert({
                tabela_afetada: 'manutencoes',
                id_registro_afetado: String(osId),
                acao: id ? 'UPDATE' : 'INSERT',
                usuario_id: user.id,
                dados_antigos: id ? dadosOriginaisOS : JSON.stringify({ info: "Nova Ordem de Serviço" }),
                dados_novos: JSON.stringify(payloadOSFull),
                data_hora: new Date().toISOString()
            });
        }

        osSuja = false;
        mostrarToast("Ordem de Serviço salva com sucesso!", "success");
        window.fecharModalManutencao(true);
        window.listarManutencoes();

    } catch (err) {
        console.error("Erro ao salvar O.S.:", err);
        mostrarToast("Erro ao gravar dados no banco.", "error");
    } finally {
        if(btn) {
            btn.disabled = false;
            btn.innerText = 'Salvar Ordem de Serviço';
        }
    }
};

window.confirmarExclusaoOS = function(id, detalheStr) {
    document.getElementById('excluir-os-id').value = id;
    document.getElementById('excluir-detalhe-os').innerText = detalheStr || '';
    document.getElementById('modal-confirmar-exclusao-os').classList.add('active');
}

window.executarExclusaoDefinitivaOS = async function() {
    const id = document.getElementById('excluir-os-id').value;
    if (!id) return;

    const btn = document.getElementById('btn-confirmar-delete-os');
    btn.disabled = true;
    btn.innerText = 'Limpando...';

    try {
        const osExcluida = listaManutencoesGlobal.find(x => String(x.id) === String(id));

        await clienteSupabase.from('manutencoes').delete().eq('id', id);
        
        // Limpa logs da O.S. antiga para não estourar o banco
        await clienteSupabase.from('logs_auditoria').delete().eq('tabela_afetada', 'manutencoes').eq('id_registro_afetado', String(id));

        // Registra o log do DELETE
        const { data: { user } } = await clienteSupabase.auth.getUser();
        if (user) {
            await clienteSupabase.from('logs_auditoria').insert({
                tabela_afetada: 'manutencoes',
                id_registro_afetado: String(id),
                acao: 'DELETE',
                usuario_id: user.id,
                dados_antigos: JSON.stringify(osExcluida || {}),
                dados_novos: JSON.stringify({ status: "Deletado permanentemente" }),
                data_hora: new Date().toISOString()
            });
        }

        mostrarToast("Ordem de Serviço excluída.", "success");
        document.getElementById('modal-confirmar-exclusao-os').classList.remove('active');
        window.listarManutencoes();
    } catch (e) {
        console.error("Erro ao excluir O.S.:", e);
        mostrarToast("Erro ao excluir Ordem de Serviço.", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = 'Sim, Excluir';
    }
}