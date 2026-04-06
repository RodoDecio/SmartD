let listaCatalogoTelaGlobal = [];
let listaVeiculosCatGlobal = [];
let catalogoSujo = false;
let dadosOriginaisCat = null;

const arvoreSistemasCat = {
    "Motor": ["Distribuição (Cabeçote/Válvulas)", "Alimentação (Injeção/Bomba)", "Arrefecimento (Radiador/Bomba d'água)", "Lubrificação", "Exaustão", "Turbina/Intercooler", "Motor Completo"],
    "Transmissão": ["Embreagem", "Caixa de Câmbio", "Eixo Cardã", "Diferencial (Coroa/Pinhão/Planetária)"],
    "Freios": ["Lonas/Pastilhas", "Tambor/Disco", "Catracas/Ajustadores", "Válvulas de Ar", "Compressor de Ar", "Cuícas/Cilindros"],
    "Suspensão": ["Molas/Feixes", "Bolsas de Ar", "Amortecedores", "Balanças/Tirantes", "Pinos e Buchas"],
    "Direção": ["Caixa de Direção", "Bomba Hidráulica", "Barras e Terminais", "Coluna de Direção"],
    "Elétrica": ["Bateria", "Alternador", "Motor de Partida", "Iluminação/Lâmpadas", "Chicotes/Módulos", "Painel de Instrumentos"],
    "Rodas": ["Cubos", "Rolamentos"], 
    "Cabine/Carroceria": ["Ar Condicionado", "Vidros/Travas", "Funilaria/Pintura", "Estofamento", "Quinta Roda/Pino Rei", "Baú/Sider/Tanque"],
    "Filtros e Fluidos": ["Lubrificação"],
    "Outros": ["Serviços Gerais", "Socorro Mecânico (Geral)"]
};

window.inicializarCatalogo = async function() {
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Catálogo de Peças e Serviços';

    const container = document.getElementById('container-filtros-cat-tela');
    if (container) {
        container.innerHTML = '';
        window.adicionarFiltroCatTela();
    }
    
    const selSis = document.getElementById('cat-tela-sis');
    if(selSis) {
        selSis.innerHTML = '<option value="">(Geral)</option>';
        Object.keys(arvoreSistemasCat).sort().forEach(s => selSis.innerHTML += `<option value="${s}">${s}</option>`);
    }

    const catSelect = document.getElementById('cat-tela-cat');
    if(catSelect) {
        catSelect.addEventListener('change', () => {
            window.atualizarCodigoInterno();
            window.verificarAbaPeriodicidade();
        });
    }

    const form = document.getElementById('form-catalogo');
    if(form) {
        form.addEventListener('input', () => catalogoSujo = true);
        form.addEventListener('change', () => catalogoSujo = true);
    }

    await window.carregarVeiculosParaAplicacao();
    await window.listarCatalogo();
}

window.carregarVeiculosParaAplicacao = async function() {
    try {
        const { data } = await clienteSupabase.from('veiculos').select('id, placa, marca, modelo, tipo_veiculo').eq('ativo', true).order('placa');
        listaVeiculosCatGlobal = data || [];
    } catch(e) { console.error(e); }
}

window.listarCatalogo = async function() {
    const loading = document.getElementById('loading-catalogo');
    if(loading) loading.style.display = 'flex';

    try {
        const { data, error } = await clienteSupabase.from('manutencao_catalogo').select('*').order('descricao');
        if (error) throw error;
        listaCatalogoTelaGlobal = data || [];
        window.aplicarFiltrosCatTela();
    } catch (e) {
        mostrarToast("Erro ao carregar catálogo.", "error");
    } finally {
        if(loading) loading.style.display = 'none';
    }
}

window.renderizarTabelaCatalogo = function(lista) {
    const tbody = document.getElementById('tbody-catalogo');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    document.getElementById('lbl-contagem-cat').innerText = `Exibindo ${lista.length} item(ns)`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-4 text-muted">Nenhum item encontrado.</td></tr>';
        return;
    }

    lista.forEach(i => {
        let badgeCat = i.categoria === 'Peça' ? '<span class="badge" style="background:#6c757d; color:white;">Peça</span>' : '<span class="badge" style="background:#17a2b8; color:white;">Serviço</span>';
        let badgeStatus = (i.ativo !== false) ? '<span class="badge" style="background:#28a745; color:white;">Ativo</span>' : '<span class="badge" style="background:#dc3545; color:white;">Inativo</span>';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight: bold; color: #444;">${i.codigo_interno || '-'}</td>
            <td>${badgeCat}</td>
            <td>
                <div style="font-weight: bold; color: var(--cor-primaria);">${i.descricao}</div>
            </td>
            <td style="font-size: 0.85rem; color: #555;">${i.codigo_fabricante || '-'}</td>
            <td>
                <div style="font-size: 0.85rem; font-weight: bold; color: #555;">${i.sistema || '-'}</div>
                <div style="font-size: 0.75rem; color: #888;">${i.subsistema || ''}</div>
            </td>
            <td style="text-align: center;">${badgeStatus}</td>
            <td style="text-align: center;">
                <button class="btn-icon-action icon-view" onclick="window.abrirModalCatalogoTela('${i.id}', true)" title="Visualizar"><i class="fas fa-eye"></i></button>
                <button class="btn-icon-action icon-hist" onclick="abrirModalLogsGlobal('manutencao_catalogo', '${i.id}', 'Histórico do Item')" title="Histórico"><i class="fas fa-history"></i></button>
                <button class="btn-icon-action icon-edit" onclick="window.abrirModalCatalogoTela('${i.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon-action icon-del" onclick="window.confirmarExclusaoCat('${i.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =============================================================================
// FILTROS TELA PRINCIPAL
// =============================================================================

window.adicionarFiltroCatTela = function() {
    const container = document.getElementById('container-filtros-cat-tela');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row-cat';
    div.id = `filter-c-${id}`;
    div.style.cssText = 'display: flex; gap: 10px; align-items: center; margin-bottom: 8px;';

    div.innerHTML = `
        <select class="form-control" style="width: 160px;" onchange="window.configurarInputFiltroCatTela(this, ${id})">
            <option value="">Filtrar por...</option>
            <option value="codigo_interno">Cód. Interno</option>
            <option value="descricao">Descrição</option>
            <option value="codigo_fabricante">Cód. Fabricante</option>
            <option value="categoria">Categoria (Peça/Serviço)</option>
            <option value="sistema">Sistema</option>
            <option value="subsistema">Subsistema</option>
            <option value="aplicacao">Aplicação (Marca/Modelo)</option>
        </select>
        <div id="wrapper-c-${id}" style="width: 260px; display: flex;">
            <input type="text" class="form-control input-filtro-cat" disabled placeholder="Selecione..." style="width: 100%;">
        </div>
        <button onclick="window.removerFiltroCatTela(${id})" style="border:none; background:none; color:#dc3545; cursor:pointer; padding: 0 5px;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

window.removerFiltroCatTela = function(id) {
    document.getElementById(`filter-c-${id}`)?.remove();
    window.aplicarFiltrosCatTela();
}

window.configurarInputFiltroCatTela = function(sel, id) {
    const wrapper = document.getElementById(`wrapper-c-${id}`);
    const tipo = sel.value;
    wrapper.innerHTML = '';
    
    if (tipo === 'sistema' || tipo === 'subsistema' || tipo === 'categoria' || tipo === 'aplicacao') {
        const select = document.createElement('select');
        select.className = 'form-control input-filtro-cat';
        select.style.width = '100%';
        select.innerHTML = '<option value="">Todos</option>';
        
        if (tipo === 'sistema') {
            Object.keys(arvoreSistemasCat).sort().forEach(s => select.innerHTML += `<option value="${s}">${s}</option>`);
        } else if (tipo === 'subsistema') {
            Object.values(arvoreSistemasCat).flat().sort().forEach(s => select.innerHTML += `<option value="${s}">${s}</option>`);
        } else if (tipo === 'categoria') {
            select.innerHTML += '<option value="Peça">Peça</option><option value="Serviço">Serviço</option>';
        } else if (tipo === 'aplicacao') {
            const aplicacoesUnicas = new Set();
            listaVeiculosCatGlobal.forEach(v => {
                const marcaModelo = v.modelo ? `${v.marca} - ${v.modelo}` : v.marca;
                if (marcaModelo) aplicacoesUnicas.add(marcaModelo);
            });
            Array.from(aplicacoesUnicas).sort().forEach(app => {
                select.innerHTML += `<option value="${app}">${app}</option>`;
            });
        }
        
        select.onchange = window.aplicarFiltrosCatTela;
        wrapper.appendChild(select);
    } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-control input-filtro-cat';
        inp.style.width = '100%';
        inp.placeholder = 'Digite para buscar...';
        inp.onkeyup = window.aplicarFiltrosCatTela;
        wrapper.appendChild(inp);
    }
    window.aplicarFiltrosCatTela();
}

window.aplicarFiltrosCatTela = function() {
    const container = document.getElementById('container-filtros-cat-tela');
    let dados = [...listaCatalogoTelaGlobal];
    let descricoes = [];

    if (container) {
        container.querySelectorAll('.filter-row-cat').forEach(linha => {
            const tipo = linha.querySelector('select').value;
            const input = linha.querySelector('.input-filtro-cat');
            if (!tipo || !input || !input.value) return;

            const valor = input.value.toLowerCase();
            const labelTipo = linha.querySelector('select').options[linha.querySelector('select').selectedIndex].text;
            let valorDisplay = input.tagName === 'SELECT' ? input.options[input.selectedIndex].text : valor;
            
            if (valor === 'todos' || valor === '') return;
            descricoes.push(`<b>${labelTipo}:</b> ${valorDisplay}`);

            dados = dados.filter(i => {
                if (tipo === 'codigo_interno') return (i.codigo_interno || '').toLowerCase().includes(valor);
                if (tipo === 'descricao') return (i.descricao || '').toLowerCase().includes(valor);
                if (tipo === 'codigo_fabricante') return (i.codigo_fabricante || '').toLowerCase().includes(valor);
                if (tipo === 'categoria') return (i.categoria || '').toLowerCase() === valor;
                if (tipo === 'sistema') return (i.sistema || '').toLowerCase() === valor;
                if (tipo === 'subsistema') return (i.subsistema || '').toLowerCase() === valor;
                
                if (tipo === 'aplicacao') {
                    if (!i.veiculos_aplicacao_json || !Array.isArray(i.veiculos_aplicacao_json)) return false;
                    return i.veiculos_aplicacao_json.some(idVeiculo => {
                        const veiculoBanco = listaVeiculosCatGlobal.find(v => String(v.id) === String(idVeiculo));
                        if (!veiculoBanco) return false;
                        const marcaModelo = veiculoBanco.modelo ? `${veiculoBanco.marca} - ${veiculoBanco.modelo}` : veiculoBanco.marca;
                        return marcaModelo.toLowerCase() === valor;
                    });
                }
                return true;
            });
        });
    }

    const lbl = document.getElementById('lbl-filtros-ativos-cat');
    if (lbl) {
        lbl.innerHTML = descricoes.length > 0 ? `<i class="fas fa-filter" style="color:#003399;"></i> ${descricoes.join(' | ')}` : '<i>Todos os registros</i>';
    }
    window.renderizarTabelaCatalogo(dados);
}

// =============================================================================
// MODAL (ABAS E DADOS)
// =============================================================================

window.alternarAbaCat = function(aba) {
    ['geral', 'aplicacao', 'observacoes', 'periodicidade'].forEach(a => {
        const content = document.getElementById(`content-cat-${a}`);
        const btn = document.getElementById(`tab-cat-${a}`);
        
        if(content) content.style.display = 'none';
        if(btn) {
            btn.style.borderBottomColor = 'transparent';
            btn.style.color = '#666';
            btn.style.fontWeight = 'normal';
        }
    });

    const contentAtivo = document.getElementById(`content-cat-${aba}`);
    const btnAtivo = document.getElementById(`tab-cat-${aba}`);
    
    if(contentAtivo) contentAtivo.style.display = 'block';
    if(btnAtivo) {
        btnAtivo.style.borderBottomColor = 'var(--cor-primaria)';
        btnAtivo.style.color = 'var(--cor-primaria)';
        btnAtivo.style.fontWeight = 'bold';
    }
}

window.verificarAbaPeriodicidade = function() {
    const catEl = document.getElementById('cat-tela-cat');
    const tabBtn = document.getElementById('tab-cat-periodicidade');
    const tabContent = document.getElementById('content-cat-periodicidade');
    
    if (catEl && tabBtn) {
        // Checagem blindada ignorando maiúsculas e minúsculas
        const isServico = catEl.value && catEl.value.toLowerCase().includes('servi');
        
        if (isServico) {
            tabBtn.style.setProperty('display', 'block', 'important');
        } else {
            tabBtn.style.setProperty('display', 'none', 'important');
            if (tabContent && tabContent.style.display === 'block') {
                window.alternarAbaCat('geral');
            }
        }
    }
}

window.carregarSubsistemasCatTela = function() {
    const sis = document.getElementById('cat-tela-sis').value;
    const sel = document.getElementById('cat-tela-subsis');
    sel.innerHTML = '<option value="">(Geral)</option>';
    if (sis && arvoreSistemasCat[sis]) {
        arvoreSistemasCat[sis].forEach(s => sel.innerHTML += `<option value="${s}">${s}</option>`);
    }
}

window.filtrarVeiculosAplicacao = function() {
    const tipo = document.getElementById('filtro-tipo-veiculo').value;
    document.querySelectorAll('.card-veiculo-app').forEach(card => {
        const tipoVeiculo = card.getAttribute('data-tipo');
        if (tipo === 'todos' || tipoVeiculo === tipo) {
            card.style.display = 'flex';
        } else {
            card.style.display = 'none';
        }
    });
}

window.gerarProximoCodigoInterno = function(categoria) {
    const prefixo = categoria === 'Peça' ? 'P' : 'S';
    let maxNum = 0;
    
    listaCatalogoTelaGlobal.forEach(item => {
        if (item.codigo_interno && item.codigo_interno.startsWith(prefixo)) {
            let numStr = item.codigo_interno.substring(1);
            let num = parseInt(numStr, 10);
            if (!isNaN(num) && num > maxNum) {
                maxNum = num;
            }
        }
    });
    
    let proxNum = maxNum + 1;
    return `${prefixo}${String(proxNum).padStart(6, '0')}`;
}

window.atualizarCodigoInterno = function() {
    const id = document.getElementById('cat-tela-id').value;
    if (!id) {
        const categoria = document.getElementById('cat-tela-cat').value;
        document.getElementById('cat-tela-cod-int').value = window.gerarProximoCodigoInterno(categoria);
    }
}

window.abrirModalCatalogoTela = function(id = null, readonly = false) {
    const form = document.getElementById('form-catalogo');
    form.reset();
    catalogoSujo = false;
    dadosOriginaisCat = null;

    document.getElementById('cat-tela-id').value = id || '';
    document.getElementById('titulo-modal-cat').innerText = id ? (readonly ? 'Visualizar Item' : 'Editar Item do Catálogo') : 'Novo Item no Catálogo';
    
    window.alternarAbaCat('geral');
    window.carregarSubsistemasCatTela();

    if (!id) {
        document.getElementById('cat-tela-cat').value = 'Peça';
        document.getElementById('cat-tela-cod-int').value = window.gerarProximoCodigoInterno('Peça');
        document.getElementById('cat-tela-status').value = 'true';
    }

    const contVeic = document.getElementById('container-veiculos-aplicacao');
    contVeic.innerHTML = '';
    document.getElementById('filtro-tipo-veiculo').value = 'todos'; 

    listaVeiculosCatGlobal.forEach(v => {
        const tipo = v.tipo_veiculo || 'Outros';
        const marcaModelo = v.modelo ? `${v.marca} - ${v.modelo}` : v.marca;
        
        contVeic.innerHTML += `
            <label class="card-veiculo-app" data-tipo="${tipo}">
                <input type="checkbox" value="${v.id}" class="chk-veic-aplicacao"> 
                <div style="display: flex; flex-direction: column;">
                    <span style="font-weight: bold; font-size: 1rem; color: #333;">${v.placa}</span>
                    <span style="font-size: 0.8rem; color: #666;">${marcaModelo}</span>
                </div>
            </label>
        `;
    });

    form.querySelectorAll('input:not([readonly]), select, textarea, button').forEach(el => el.disabled = false);

    if (id) {
        const item = listaCatalogoTelaGlobal.find(x => x.id === id);
        if (item) {
            document.getElementById('cat-tela-cod-int').value = item.codigo_interno || '';
            document.getElementById('cat-tela-cat').value = item.categoria || 'Peça';
            document.getElementById('cat-tela-desc').value = item.descricao || '';
            document.getElementById('cat-tela-cod-fab').value = item.codigo_fabricante || '';
            
            document.getElementById('cat-tela-sis').value = item.sistema || '';
            window.carregarSubsistemasCatTela();
            document.getElementById('cat-tela-subsis').value = item.subsistema || '';
            document.getElementById('cat-tela-status').value = (item.ativo !== false) ? 'true' : 'false';
            document.getElementById('cat-tela-obs').value = item.observacoes || '';

            // Tratamento do campo composto de Periodicidade
            const inpKm = document.getElementById('cat-tela-period-km');
            const inpTempo = document.getElementById('cat-tela-period-tempo');
            const selUnidade = document.getElementById('cat-tela-period-unidade');

            if(inpKm) inpKm.value = item.periodicidade_km || '';
            
            if (inpTempo && selUnidade) {
                if (item.periodicidade_dias) {
                    inpTempo.value = item.periodicidade_dias;
                    selUnidade.value = 'dias';
                } else if (item.periodicidade_meses) {
                    inpTempo.value = item.periodicidade_meses;
                    selUnidade.value = 'meses';
                } else {
                    inpTempo.value = '';
                    selUnidade.value = 'meses';
                }
            }

            if (item.veiculos_aplicacao_json && Array.isArray(item.veiculos_aplicacao_json)) {
                document.querySelectorAll('.chk-veic-aplicacao').forEach(chk => {
                    if (item.veiculos_aplicacao_json.includes(chk.value)) chk.checked = true;
                });
            }
        }
    }

    // Delay milimétrico para garantir que o DOM renderizou antes de checar a categoria
    setTimeout(() => {
        window.verificarAbaPeriodicidade();
    }, 10);

    if (readonly) {
        form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
        document.getElementById('btn-salvar-cat-tela').style.display = 'none';
        document.getElementById('btn-marcar-todos-veic').style.display = 'none';
        document.getElementById('btn-desmarcar-todos-veic').style.display = 'none';
        document.getElementById('filtro-tipo-veiculo').disabled = false;
        document.querySelector('.btn-cancel').disabled = false;
    } else {
        document.getElementById('btn-salvar-cat-tela').style.display = 'block';
        document.getElementById('btn-marcar-todos-veic').style.display = 'inline-block';
        document.getElementById('btn-desmarcar-todos-veic').style.display = 'inline-block';
        setTimeout(() => { dadosOriginaisCat = JSON.stringify(window.getPayloadCat()); }, 100);
    }

    document.getElementById('modal-catalogo-tela').classList.add('active');
}

window.marcarTodosVeiculos = function(marcar) {
    const tipo = document.getElementById('filtro-tipo-veiculo').value;
    document.querySelectorAll('.card-veiculo-app').forEach(card => {
        const tipoVeiculo = card.getAttribute('data-tipo');
        if (tipo === 'todos' || tipoVeiculo === tipo) {
            const chk = card.querySelector('.chk-veic-aplicacao');
            if(chk) chk.checked = marcar;
        }
    });
    catalogoSujo = true;
}

window.fecharModalCatalogoTela = function(forcar = false) {
    if (!forcar && catalogoSujo) {
        window.solicitarConfirmacao(() => { window.executarFechamentoCat(); });
        return;
    }
    window.executarFechamentoCat();
}

window.executarFechamentoCat = function() {
    catalogoSujo = false;
    dadosOriginaisCat = null;
    document.getElementById('modal-catalogo-tela').classList.remove('active');
}

// =============================================================================
// SALVAMENTO E EXCLUSÃO
// =============================================================================

window.getPayloadCat = function() {
    const veiculosMarcados = Array.from(document.querySelectorAll('.chk-veic-aplicacao:checked')).map(c => c.value);
    
    // Verificação blindada na hora de salvar
    const catEl = document.getElementById('cat-tela-cat');
    const isServico = catEl && catEl.value && catEl.value.toLowerCase().includes('servi');

    const valKm = document.getElementById('cat-tela-period-km') ? document.getElementById('cat-tela-period-km').value : '';
    const valTempo = document.getElementById('cat-tela-period-tempo') ? document.getElementById('cat-tela-period-tempo').value : '';
    const unidadeTempo = document.getElementById('cat-tela-period-unidade') ? document.getElementById('cat-tela-period-unidade').value : 'meses';

    let pMeses = null;
    let pDias = null;

    if (isServico && valTempo) {
        if (unidadeTempo === 'dias') {
            pDias = parseInt(valTempo);
        } else {
            pMeses = parseInt(valTempo);
        }
    }

    return {
        codigo_interno: document.getElementById('cat-tela-cod-int').value.trim(),
        categoria: document.getElementById('cat-tela-cat').value,
        descricao: document.getElementById('cat-tela-desc').value.trim(),
        codigo_fabricante: document.getElementById('cat-tela-cod-fab').value.trim(),
        sistema: document.getElementById('cat-tela-sis').value || null,
        subsistema: document.getElementById('cat-tela-subsis').value || null,
        ativo: document.getElementById('cat-tela-status').value === 'true',
        observacoes: document.getElementById('cat-tela-obs').value.trim(),
        veiculos_aplicacao_json: veiculosMarcados,
        
        // Atribui os valores tratados para o banco
        periodicidade_km: isServico && valKm ? parseInt(valKm) || null : null,
        periodicidade_meses: pMeses,
        periodicidade_dias: pDias
    };
}

window.salvarCatalogoTela = async function(e) {
    e.preventDefault();
    const id = document.getElementById('cat-tela-id').value;
    const payload = window.getPayloadCat();

    if (id && dadosOriginaisCat) {
        if (JSON.stringify(payload) === dadosOriginaisCat) {
            mostrarToast("Nenhuma alteração detectada.", "info");
            return;
        }
    }

    const btn = document.getElementById('btn-salvar-cat-tela');
    const txtOriginal = btn.innerText;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    try {
        let acao = id ? 'UPDATE' : 'INSERT';
        let idReg = id;

        if (id) {
            const { error } = await clienteSupabase.from('manutencao_catalogo').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { data, error } = await clienteSupabase.from('manutencao_catalogo').insert([payload]).select();
            if (error) throw error;
            idReg = data[0].id;
        }

        const { data: { user } } = await clienteSupabase.auth.getUser();
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'manutencao_catalogo',
            id_registro_afetado: String(idReg),
            acao: acao,
            usuario_id: user.id,
            dados_antigos: id ? dadosOriginaisCat : JSON.stringify({ info: "Novo item" }),
            dados_novos: JSON.stringify(payload),
            data_hora: new Date().toISOString()
        });

        mostrarToast("Item salvo no catálogo!", "success");
        window.fecharModalCatalogoTela(true);
        window.listarCatalogo();

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao salvar no catálogo.", "error");
    } finally {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
    }
}

window.confirmarExclusaoCat = function(id) {
    const i = listaCatalogoTelaGlobal.find(x => String(x.id) === String(id));
    if(!i) return;

    document.getElementById('excluir-cat-id').value = id;
    document.getElementById('modal-confirmar-exclusao-cat').classList.add('active');
}

window.executarExclusaoDefinitivaCat = async function() {
    const id = document.getElementById('excluir-cat-id').value;
    const btn = document.querySelector('#modal-confirmar-exclusao-cat .btn-primary');
    if (!id) return;

    btn.innerText = 'Limpando...';
    btn.disabled = true;

    try {
        const item = listaCatalogoTelaGlobal.find(x => String(x.id) === String(id));
        const { error } = await clienteSupabase.from('manutencao_catalogo').delete().eq('id', id);
        if (error) throw error;

        await clienteSupabase.from('logs_auditoria').delete().eq('tabela_afetada', 'manutencao_catalogo').eq('id_registro_afetado', String(id));

        const { data: { user } } = await clienteSupabase.auth.getUser();
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'manutencao_catalogo',
            id_registro_afetado: String(id), 
            acao: 'DELETE',
            usuario_id: user.id,
            dados_antigos: JSON.stringify(item),
            dados_novos: JSON.stringify({ status: "Deletado" }),
            data_hora: new Date().toISOString()
        });

        mostrarToast("Item excluído permanentemente.", "success");
        document.getElementById('modal-confirmar-exclusao-cat').classList.remove('active');
        window.listarCatalogo();

    } catch (e) {
        console.error(e);
        mostrarToast("Erro ao excluir item. Verifique as dependências.", "error");
    } finally {
        btn.innerText = 'Sim, Excluir';
        btn.disabled = false;
    }
}