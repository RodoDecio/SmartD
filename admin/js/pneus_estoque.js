let listaPneusGlobal = [];
let pneuSujo = false;
let dadosOriginaisPneu = null;
let isModoVisualizacaoPneu = false;

window.formatarMoedaGenerica = function(input) {
    let v = input.value.replace(/\D/g, '');
    if(v === '') { input.value = ''; return; }
    v = (parseInt(v) / 100).toFixed(2);
    v = v.replace(".", ",");
    v = v.replace(/(\d)(?=(\d{3})+(?!\d))/g, "$1.");
    input.value = v;
}

window.parseMoeda = function(str) {
    if(!str) return 0;
    return parseFloat(str.replace(/\./g, '').replace(',', '.'));
}

window.inicializarPneusEstoque = async function() {
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Estoque e Cadastro de Pneus';

    const container = document.getElementById('container-filtros-pneus');
    if (container) {
        container.innerHTML = '';
        window.adicionarFiltroPneus();
    }

    const form = document.getElementById('form-pneu');
    if(form) {
        form.addEventListener('input', () => pneuSujo = true);
        form.addEventListener('change', () => pneuSujo = true);
    }

    await window.listarPneusEstoque();
}

// =============================================================================
// LISTAGEM PRINCIPAL
// =============================================================================

window.listarPneusEstoque = async function(unidadeFiltro = null) {
    const loading = document.getElementById('loading-pneus');
    const tbody = document.getElementById('tbody-pneus');
    if (loading) loading.style.display = 'flex';

    // Usa a unidade passada pelo rodapé (app.js) ou pega do próprio HTML
    const uniRodape = document.getElementById('sel-unidade')?.value || 'TODAS';
    const uniSelecionada = unidadeFiltro || uniRodape;

    try {
        let query = clienteSupabase
            .from('pneus')
            .select(`*, veiculos (placa), unidades (nome)`) // Puxa o nome da unidade também
            .order('created_at', { ascending: false });

        // Se o usuário selecionou uma unidade específica no rodapé, aplica o filtro direto no banco
        if (uniSelecionada && uniSelecionada !== 'TODAS') {
            query = query.eq('unidade_id', uniSelecionada);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        listaPneusGlobal = data || [];
        window.aplicarFiltrosPneus();
    } catch (error) {
        console.error(error);
        mostrarToast("Erro ao carregar os pneus.", "error");
    } finally {
        if (loading) loading.style.display = 'none';
    }
};

window.renderizarTabelaPneus = function(lista) {
    const tbody = document.getElementById('tbody-pneus');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    let totalEstoqueFiltrado = lista.filter(p => (p.status || 'ESTOQUE NOVO').toUpperCase().includes('ESTOQUE')).length;

    document.getElementById('lbl-contagem-pneus').innerHTML = `Exibindo ${lista.length} pneu(s) <span style="margin: 0 10px; color: #ccc;">|</span> Total (em Estoque) nesta visão: <b style="color: var(--cor-primaria); font-size: 0.95rem;">${totalEstoqueFiltrado} unid.</b>`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 30px; color:#999;">Nenhum pneu encontrado para esta unidade.</td></tr>';
        return;
    }

    lista.forEach(p => {
        let badgeStatus = '';
        const s = (p.status || 'ESTOQUE NOVO').toUpperCase();
        
        if (s === 'ESTOQUE NOVO') badgeStatus = '<span class="badge-status-pneu status-novo">Estoque Novo</span>';
        else if (s === 'EM USO') badgeStatus = '<span class="badge-status-pneu status-uso">Em Uso</span>';
        else if (s === 'EM RECAPAGEM') badgeStatus = '<span class="badge-status-pneu status-recapagem">Em Recapagem</span>';
        else if (s === 'ESTOQUE RECAPADO') badgeStatus = '<span class="badge-status-pneu status-estoque-recap">Estoque Recapado</span>';
        else badgeStatus = '<span class="badge-status-pneu status-descartado">Descartado</span>';

        let local = '<span style="color: #666; font-style: italic;">No Almoxarifado</span>';
        if (s === 'EM USO' && p.veiculos) {
            local = `<b style="color: var(--cor-primaria);">${p.veiculos.placa}</b> <br> <span style="font-size: 0.75rem; color: #555;">Pos: ${p.posicao || 'N/D'}</span>`;
        } else if (s === 'EM RECAPAGEM') {
            local = `<span style="color: #fd7e14; font-weight: bold;">Na Recapadora</span>`;
        }

        const tipoPneu = p.tipo || '-';
        const nomeUnidade = p.unidades ? p.unidades.nome : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="vertical-align: middle; font-weight: bold; color: #333;">${p.numero_fogo}</td>
            <td style="vertical-align: middle;"><div style="font-weight: bold; color: var(--cor-primaria);">${p.marca}</div><div style="font-size: 0.75rem; color: #888;">${p.modelo}</div></td>
            <td style="vertical-align: middle; font-size: 0.85rem;">${tipoPneu}</td>
            <td style="vertical-align: middle; font-size: 0.85rem; font-weight: 500;">${p.medida}</td>
            <td style="vertical-align: middle; font-size: 0.85rem;">${nomeUnidade}</td>
            <td style="vertical-align: middle;">${badgeStatus}</td>
            <td style="vertical-align: middle;">${local}</td>
            <td style="vertical-align: middle; text-align: center; white-space: nowrap;">
                <button type="button" class="btn-action-sm icon-view" onclick="window.abrirModalPneu('${p.id}', true)" title="Visualizar"><i class="fas fa-eye"></i></button>
                <button type="button" class="btn-action-sm icon-hist" onclick="abrirModalLogsGlobal('pneus', '${p.id}', 'Histórico do Pneu')" title="Ver Histórico (Auditoria)"><i class="fas fa-history"></i></button>
                <button type="button" class="btn-action-sm icon-edit" onclick="window.abrirModalPneu('${p.id}')" title="Editar Pneu"><i class="fas fa-edit"></i></button>
                <button type="button" class="btn-action-sm icon-del" onclick="window.confirmarExclusaoPneu('${p.id}', '${p.numero_fogo}')" title="Excluir Pneu"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// =============================================================================
// FILTROS
// =============================================================================

window.adicionarFiltroPneus = function() {
    const container = document.getElementById('container-filtros-pneus');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row-pneus';
    div.id = `filter-pneu-${id}`;
    div.style.cssText = 'display: flex; gap: 10px; align-items: center; margin-bottom: 8px;';

    div.innerHTML = `
        <select class="form-control form-control-fix" style="width: 160px;" onchange="window.configurarInputFiltroPneus(this, ${id})">
            <option value="">Filtrar por...</option>
            <option value="numero_fogo">Nº de Fogo</option>
            <option value="placa">Placa (Aplicação)</option>
            <option value="status">Status</option>
            <option value="marca">Marca</option>
            <option value="modelo">Modelo</option>
            <option value="tipo_pneu">Tipo</option>
            <option value="medida">Medida</option>
        </select>
        <div id="wrapper-pneu-${id}" style="width: 260px; display: flex;"><input type="text" class="form-control form-control-fix" disabled placeholder="Selecione..." style="width: 100%;"></div>
        <button type="button" onclick="window.removerFiltroPneus(${id})" style="border:none; background:none; color:#dc3545; cursor:pointer; padding: 0 5px;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

window.removerFiltroPneus = function(id) { document.getElementById(`filter-pneu-${id}`)?.remove(); window.aplicarFiltrosPneus(); }

window.configurarInputFiltroPneus = function(sel, id) {
    const wrapper = document.getElementById(`wrapper-pneu-${id}`);
    const tipo = sel.value;
    wrapper.innerHTML = '';
    
    if (tipo === 'status') {
        const select = document.createElement('select');
        select.className = 'form-control form-control-fix input-filtro-pneus';
        select.style.width = '100%';
        select.innerHTML = '<option value="">Todos</option><option value="ESTOQUE NOVO">Estoque Novo</option><option value="EM USO">Em Uso</option><option value="EM RECAPAGEM">Em Recapagem</option><option value="ESTOQUE RECAPADO">Estoque Recapado</option><option value="DESCARTADO">Descartado</option>';
        select.onchange = window.aplicarFiltrosPneus;
        wrapper.appendChild(select);
    } else if (tipo === 'tipo_pneu') {
        const select = document.createElement('select');
        select.className = 'form-control form-control-fix input-filtro-pneus';
        select.style.width = '100%';
        select.innerHTML = '<option value="">Todos</option><option value="Liso (Direcional)">Liso (Direcional)</option><option value="Misto">Misto</option><option value="Borrachudo (Tração)">Borrachudo (Tração)</option>';
        select.onchange = window.aplicarFiltrosPneus;
        wrapper.appendChild(select);
    } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-control form-control-fix input-filtro-pneus';
        inp.style.width = '100%';
        inp.placeholder = 'Digite para buscar...';
        inp.disabled = (tipo === '');
        inp.onkeyup = window.aplicarFiltrosPneus;
        wrapper.appendChild(inp);
    }
    window.aplicarFiltrosPneus();
}

window.aplicarFiltrosPneus = function() {
    const container = document.getElementById('container-filtros-pneus');
    let dados = [...listaPneusGlobal];
    let descricoes = [];

    if (container) {
        container.querySelectorAll('.filter-row-pneus').forEach(linha => {
            const tipo = linha.querySelector('select').value;
            const input = linha.querySelector('.input-filtro-pneus');
            if (!tipo || !input || !input.value) return;

            const valor = input.value.toLowerCase();
            const labelTipo = linha.querySelector('select').options[linha.querySelector('select').selectedIndex].text;
            let valorDisplay = input.tagName === 'SELECT' ? input.options[input.selectedIndex].text : valor;
            
            if (valor === 'todos' || valor === '') return;
            descricoes.push(`<b>${labelTipo}:</b> ${valorDisplay}`);

            dados = dados.filter(p => {
                if (tipo === 'numero_fogo') return (p.numero_fogo || '').toLowerCase().includes(valor);
                if (tipo === 'marca') return (p.marca || '').toLowerCase().includes(valor);
                if (tipo === 'modelo') return (p.modelo || '').toLowerCase().includes(valor);
                if (tipo === 'medida') return (p.medida || '').toLowerCase().includes(valor);
                if (tipo === 'status') return (p.status || '').toLowerCase() === valor;
                if (tipo === 'tipo_pneu') return (p.tipo || '').toLowerCase() === valor;
                if (tipo === 'placa') return (p.veiculos?.placa || '').toLowerCase().includes(valor);
                return true;
            });
        });
    }
    const lbl = document.getElementById('lbl-filtros-ativos-pneus');
    if (lbl) lbl.innerHTML = descricoes.length > 0 ? `<i class="fas fa-filter" style="color:#003399;"></i> ${descricoes.join(' | ')}` : '<i>Todos os registros</i>';
    window.renderizarTabelaPneus(dados);
}

// =============================================================================
// MODAL DE CADASTRO E EDIÇÃO
// =============================================================================

window.getPayloadPneu = function() {
    const valV = document.getElementById('pneu-valor').value;
    const uniId = document.getElementById('pneu-unidade').value;

    return {
        numero_fogo: document.getElementById('pneu-fogo').value.trim().toUpperCase(),
        unidade_id: uniId ? parseInt(uniId) : null,
        dot: document.getElementById('pneu-dot').value.trim(),
        medida: document.getElementById('pneu-medida').value.trim(),
        marca: document.getElementById('pneu-marca').value.trim().toUpperCase(),
        modelo: document.getElementById('pneu-modelo').value.trim().toUpperCase(),
        tipo: document.getElementById('pneu-tipo').value,
        sulco_original: parseFloat(document.getElementById('pneu-sulco-orig').value) || 0,
        valor_compra: valV ? window.parseMoeda(valV) : 0,
        nota_fiscal: document.getElementById('pneu-nota').value.trim(),
        observacoes: document.getElementById('pneu-obs').value.trim(),
        status: document.getElementById('pneu-id').value ? undefined : 'ESTOQUE NOVO',
        sulco_atual: document.getElementById('pneu-id').value ? undefined : parseFloat(document.getElementById('pneu-sulco-orig').value)
    };
}

window.abrirModalPneu = async function(id = null, readonly = false) {
    window.isModoVisualizacaoPneu = readonly;
    const form = document.getElementById('form-pneu');
    if(form) form.reset();
    
    pneuSujo = false;
    dadosOriginaisPneu = null;

    document.getElementById('pneu-id').value = id || '';
    document.getElementById('titulo-modal-pneu').innerText = id ? (readonly ? 'Ficha do Pneu' : 'Editar Pneu') : 'Cadastrar Pneu Novo';
    if(form) form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = false);

    // Preenche as Unidades disponíveis buscando da variável global do app.js
    const selUni = document.getElementById('pneu-unidade');
    if (selUni) {
        selUni.innerHTML = '<option value="">-- Selecione --</option>';
        if (typeof listaUnidadesGlobal !== 'undefined') {
            listaUnidadesGlobal.forEach(u => {
                selUni.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
            });
        }
    }

    if (id) {
        const p = listaPneusGlobal.find(x => String(x.id) === String(id));
        if (p) {
            document.getElementById('pneu-fogo').value = p.numero_fogo || '';
            document.getElementById('pneu-unidade').value = p.unidade_id || '';
            document.getElementById('pneu-dot').value = p.dot || '';
            document.getElementById('pneu-medida').value = p.medida || '';
            document.getElementById('pneu-marca').value = p.marca || '';
            document.getElementById('pneu-modelo').value = p.modelo || '';
            document.getElementById('pneu-tipo').value = p.tipo || 'Liso (Direcional)';
            document.getElementById('pneu-sulco-orig').value = p.sulco_original || '';
            document.getElementById('pneu-nota').value = p.nota_fiscal || '';
            document.getElementById('pneu-obs').value = p.observacoes || '';
            
            const elValor = document.getElementById('pneu-valor');
            if (elValor && p.valor_compra) {
                elValor.value = p.valor_compra.toFixed(2);
                window.formatarMoedaGenerica(elValor);
            }
        }
    } else {
        document.getElementById('pneu-tipo').value = 'Liso (Direcional)';
        // Se estiver criando um novo, já auto-seleciona a unidade do rodapé (se não for TODAS)
        const uniRodape = document.getElementById('sel-unidade')?.value;
        if (uniRodape && uniRodape !== 'TODAS') {
            document.getElementById('pneu-unidade').value = uniRodape;
        }
    }

    if (readonly) {
        if(form) form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
        const btnS = document.getElementById('btn-salvar-pneu');
        if(btnS) btnS.style.display = 'none';
        const btnC = document.querySelector('#modal-pneu .btn-cancel');
        if(btnC) btnC.disabled = false;
    } else {
        const btnS = document.getElementById('btn-salvar-pneu');
        if(btnS) btnS.style.display = 'block';
        setTimeout(() => { dadosOriginaisPneu = JSON.stringify(window.getPayloadPneu()); }, 300);
    }

    document.getElementById('modal-pneu').classList.add('active');
}

window.fecharModalPneu = function(forcar = false) {
    if (forcar || window.isModoVisualizacaoPneu) {
        document.getElementById('modal-pneu').classList.remove('active');
        return;
    }

    if (dadosOriginaisPneu) {
        const estadoAtual = JSON.stringify(window.getPayloadPneu());
        if (estadoAtual !== dadosOriginaisPneu) {
            window.solicitarConfirmacao(() => {
                document.getElementById('modal-pneu').classList.remove('active');
            });
            return;
        }
    }
    document.getElementById('modal-pneu').classList.remove('active');
}

window.salvarPneu = async function(e) {
    e.preventDefault();
    const id = document.getElementById('pneu-id').value;
    const payload = window.getPayloadPneu();
    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    if (id && dadosOriginaisPneu && JSON.stringify(payload) === dadosOriginaisPneu) {
        mostrarToast("Nenhuma alteração detectada.", "info");
        return;
    }

    const btn = document.getElementById('btn-salvar-pneu');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';

    try {
        let idReg = id;
        let acao = id ? 'UPDATE' : 'INSERT';

        if (id) {
            const { error } = await clienteSupabase.from('pneus').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { data: existente } = await clienteSupabase.from('pneus').select('id').eq('numero_fogo', payload.numero_fogo);
            if (existente && existente.length > 0) {
                mostrarToast("Este Nº de Fogo já está cadastrado!", "warning");
                btn.disabled = false;
                btn.innerHTML = 'Salvar Pneu';
                return;
            }
            const { data, error } = await clienteSupabase.from('pneus').insert([payload]).select();
            if (error) throw error;
            idReg = data[0].id;
        }

        // SALVA AUDITORIA (Histórico)
        const { data: { user } } = await clienteSupabase.auth.getUser();
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'pneus',
            id_registro_afetado: String(idReg),
            acao: acao,
            usuario_id: user?.id,
            dados_antigos: id ? dadosOriginaisPneu : JSON.stringify({ info: "Novo Pneu" }),
            dados_novos: JSON.stringify(payload),
            data_hora: new Date().toISOString()
        });

        mostrarToast(id ? "Pneu atualizado!" : "Pneu cadastrado!", "success");
        window.fecharModalPneu(true);
        window.listarPneusEstoque();
    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao gravar dados no banco.", "error");
    } finally {
        btn.disabled = false;
        btn.innerText = 'Salvar Pneu';
    }
};

// =============================================================================
// EXCLUSÃO
// =============================================================================

window.confirmarExclusaoPneu = function(id, fogo) {
    document.getElementById('excluir-pneu-id').value = id;
    document.getElementById('lbl-excluir-pneu-fogo').innerText = `Pneu Nº Fogo: ${fogo}`;
    document.getElementById('modal-confirmar-exclusao-pneu').classList.add('active');
}

window.executarExclusaoDefinitivaPneu = async function() {
    const id = document.getElementById('excluir-pneu-id').value;
    if (!id) return;
    
    const btn = document.querySelector('#modal-confirmar-exclusao-pneu .btn-primary');
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...';
    btn.disabled = true;

    try {
        const pneu = listaPneusGlobal.find(x => String(x.id) === String(id));
        
        // Executa exclusão na tabela original
        const { error } = await clienteSupabase.from('pneus').delete().eq('id', id);
        if (error) throw error;

        // Limpa o histórico de auditoria antigo para não deixar "lixo" no banco
        await clienteSupabase.from('logs_auditoria').delete().eq('tabela_afetada', 'pneus').eq('id_registro_afetado', String(id));

        // Insere o Log de Exclusão (Para sabermos quem deletou)
        const { data: { user } } = await clienteSupabase.auth.getUser();
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'pneus',
            id_registro_afetado: String(id), 
            acao: 'DELETE',
            usuario_id: user?.id,
            dados_antigos: JSON.stringify(pneu),
            dados_novos: JSON.stringify({ status: "Deletado permanentemente do sistema" }),
            data_hora: new Date().toISOString()
        });

        mostrarToast("Pneu excluído permanentemente.", "success");
        document.getElementById('modal-confirmar-exclusao-pneu').classList.remove('active');
        window.listarPneusEstoque();
    } catch (e) {
        console.error(e);
        mostrarToast("Erro ao excluir. O pneu pode estar vinculado a algum registro.", "error");
    } finally {
        btn.innerHTML = 'Sim, Excluir';
        btn.disabled = false;
    }
}