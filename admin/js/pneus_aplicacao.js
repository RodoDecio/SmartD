window.veiculosMapaGlobal = [];
window.pneusLivresGlobal = [];
window.estadoMapaInicial = []; 
window.pneusRascunho = []; 

// =============================================================================
// NOVO: INJEÇÃO DE CSS DINÂMICO (Medidas fixas universais e Drag to Shelf)
// =============================================================================
window.injetarEstilosMapa = function() {
    if (document.getElementById('css-dinamico-mapa')) return;
    const style = document.createElement('style');
    style.id = 'css-dinamico-mapa';
    style.innerHTML = `
        :root {
            --pneu-w: 55px; /* LARGURA FIXA E UNIVERSAL */
            --pneu-h: 120px; /* ALTURA FIXA E UNIVERSAL */
        }

        /* 1. Medidas Fixas e Consistentes para TUDO */
        .drop-zone, .pneu-instalado, .pneu-card-estoque {
            width: var(--pneu-w) !important;
            height: var(--pneu-h) !important;
            min-width: var(--pneu-w) !important;
            max-width: var(--pneu-w) !important;
            box-sizing: border-box;
            margin-left: auto;
            margin-right: auto;
            border-radius: 6px;
            position: relative;
            overflow: hidden;
            flex-shrink: 0; /* Impede que o flexbox esprema o pneu */
        }

        /* Congela a largura do pai para que a borda do pneu fique reta */
        .roda-posicao {
            display: flex;
            flex-direction: column;
            align-items: center;
            width: 75px; 
        }

        .roda-label {
            font-size: 0.65rem;
            white-space: nowrap;
            margin-bottom: 4px;
        }

        /* 2. Layout de Estantes / Prateleiras Físicas */
        .zona-estoque-drop {
            transition: all 0.2s ease;
        }
        .zona-estoque-drop.drag-over-estoque {
            background-color: #e9ecef;
            border-radius: 8px;
            box-shadow: inset 0 0 10px rgba(0,0,0,0.1);
        }

        .estante-fisica {
            display: flex;
            flex-direction: column;
            gap: 15px;
            padding: 15px;
            background-color: #f8f9fa;
            border-radius: 8px;
            min-height: 200px; /* Garante área para dropar mesmo vazia */
        }
        .unidade-container {
            border: 2px solid #ccc;
            border-radius: 8px;
            background-color: #fff;
        }
        .titulo-unidade {
            margin: 0;
            padding: 10px 15px;
            background-color: var(--cor-primaria, #0d6efd);
            color: #fff;
            border-radius: 6px 6px 0 0;
            font-size: 1rem;
        }
        .tipo-container {
            padding: 10px;
        }
        .titulo-tipo {
            margin: 0 0 10px;
            font-size: 0.85rem;
            color: #666;
            font-weight: bold;
        }
        .estante-fisica-prateleiras {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 10px;
            border: 2px solid #0d6efd; 
            background-color: #fff;
            border-radius: 0 0 6px 6px;
        }
        .prateleira-linha {
            display: flex; gap: 10px; overflow-x: auto; padding-bottom: 8px;
            border-bottom: 5px solid #e0e0e0; 
            margin-bottom: 5px; border-radius: 2px; min-height: var(--pneu-h);
            background: linear-gradient(180deg, rgba(255,255,255,0) 80%, rgba(0,0,0,0.05) 100%);
        }
        .prateleira-linha::-webkit-scrollbar { height: 6px; }
        .prateleira-linha::-webkit-scrollbar-thumb { background: #ccc; border-radius: 3px; }

        .estepe-zone-container {
            display: flex;
            justify-content: center;
        }

        /* 3. Texturas de Banda de Rodagem */
        .tread-pattern {
            position: absolute; top: 0; left: 0; right: 0; bottom: 0;
            opacity: 0.30; 
            pointer-events: none; z-index: 1; border-radius: inherit;
            -webkit-print-color-adjust: exact; print-color-adjust: exact;
        }
        .banda-lisa {
            background: repeating-linear-gradient(90deg, 
                transparent, transparent 20%, #ccc 20%, #ccc 25%, 
                transparent 25%, transparent 47%, #ccc 47%, #ccc 53%, 
                transparent 53%, transparent 75%, #ccc 75%, #ccc 80%, transparent 80%
            );
        }
        .banda-borrachuda {
            background-image: radial-gradient(#ccc 30%, transparent 30%);
            background-size: 12px 12px; background-position: 0 0, 6px 6px;
        }
        .banda-mista {
            background: 
                linear-gradient(90deg, transparent 48%, #ccc 48%, #ccc 52%, transparent 52%),
                linear-gradient(135deg, #ccc 20%, transparent 20%) left center / 15px 15px repeat-y,
                linear-gradient(225deg, #ccc 20%, transparent 20%) right center / 15px 15px repeat-y;
        }

        /* 4. Visual Idêntico de Pneu (Chassi e Estoque) */
        .pneu-card-estoque, .pneu-instalado {
            background-color: #222; 
            color: #fff; 
            box-shadow: 0 2px 4px rgba(0,0,0,0.3); 
            cursor: grab;
        }
        .pneu-card-estoque:active, .pneu-instalado:active { cursor: grabbing; }
        
        /* Informações internas do pneu padronizadas */
        .pneu-info-base {
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            text-align: center; height: 100%; position: relative; z-index: 2;
            line-height: 1.1; padding: 4px;
        }
        .btn-remover-pneu { position: absolute; z-index: 3; right: -5px; top: -5px; }

        /* Unificação Cabeçalho */
        #sel-veiculo-mapa { width: 100% !important; }
        #wrapper-km-veiculo-mapa { width: 100% !important; }
        #km-veiculo-mapa { width: 100% !important; }
    `;
    document.head.appendChild(style);
}

window.inicializarPneusAplicacao = async function() {
    window.injetarEstilosMapa(); 
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Mapa de Aplicação (Instalação e Rodízio)';

    await window.carregarVeiculosMapa();
    window.configurarEventosDragEstoque(); // NOVO: Inicia listeners de drag-drop da estante
}

window.configurarEventosDragEstoque = function() {
    const painelEstoque = document.getElementById('lista-pneus-drag');
    if (!painelEstoque) return;

    painelEstoque.classList.add('zona-estoque-drop');

    painelEstoque.addEventListener('dragover', (e) => {
        e.preventDefault(); // Permite o drop
        painelEstoque.classList.add('drag-over-estoque');
    });

    painelEstoque.addEventListener('dragleave', () => {
        painelEstoque.classList.remove('drag-over-estoque');
    });

    painelEstoque.addEventListener('drop', (e) => {
        e.preventDefault();
        painelEstoque.classList.remove('drag-over-estoque');

        const dataStr = e.dataTransfer.getData('text/plain');
        if (!dataStr) return;

        const pneuArrastado = JSON.parse(dataStr);

        // Se o pneu veio do chassi, envia de volta para o rascunho
        if (pneuArrastado.origem === 'chassi') {
            window.pneusRascunho = window.pneusRascunho.filter(p => String(p.id) !== String(pneuArrastado.id));
            mostrarToast(`Pneu ${pneuArrastado.numero_fogo} retornado à prateleira.`, 'info');
            
            const veiculoId = document.getElementById('sel-veiculo-mapa').value;
            window.renderizarChassiVeiculo(veiculoId);
            window.aplicarFiltroEstoqueMapa();
            window.verificarAlteracoesPendentes();
        }
    });
}

window.carregarVeiculosMapa = async function() {
    try {
        const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
        let q = clienteSupabase.from('veiculos').select('id, placa, modelo, eixos, tipo_veiculo, km_atual').eq('ativo', true).order('placa');
        if (unidadeId !== 'TODAS') q = q.eq('unidade_id', unidadeId);
        
        const { data, error } = await q;
        if (error) throw error; 
        
        window.veiculosMapaGlobal = data || []; 

        const sel = document.getElementById('sel-veiculo-mapa');
        if(sel) {
            sel.innerHTML = '<option value="">-- Selecione o Veículo --</option>';
            window.veiculosMapaGlobal.forEach(v => {
                const cfg = v.eixos || v.tipo_veiculo || 'N/D';
                sel.innerHTML += `<option value="${v.id}">${v.placa} - ${v.modelo || ''} (${cfg})</option>`;
            });
        }
        
        await window.buscarPneusLivresMapa();
        
        document.getElementById('area-chassi-render').innerHTML = '<div style="text-align: center; color: #aaa; margin-top: 15%; font-size: 1.1rem;"><i class="fas fa-truck-moving fa-3x" style="opacity: 0.3; margin-bottom: 15px;"></i><br>Selecione um veículo na barra superior.</div>';
        document.getElementById('info-eixos-mapa').innerText = '';
        document.getElementById('km-veiculo-mapa').value = '';
        
        const btnSalvar = document.getElementById('btn-salvar-aplicacao');
        if(btnSalvar) {
            btnSalvar.style.display = 'none';
            btnSalvar.title = "Salvar Alterações"; 
            btnSalvar.innerHTML = '<i class="fas fa-save"></i>'; 
        }

    } catch(e) { 
        console.error("Erro ao carregar veículos:", e); 
        mostrarToast("Erro ao carregar lista de veículos.", "error");
    }
}

window.buscarPneusLivresMapa = async function() {
    try {
        const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
        let q = clienteSupabase.from('pneus').select('*, unidades(nome)').in('status', ['ESTOQUE NOVO', 'ESTOQUE RECAPADO']).order('numero_fogo');
        if (unidadeId !== 'TODAS') q = q.eq('unidade_id', unidadeId);
            
        const { data, error } = await q;
        if(error) throw error;
        
        window.pneusLivresGlobal = data || [];
        window.preencherFiltrosEstoqueMapa();
        window.aplicarFiltroEstoqueMapa();
    } catch(e) { console.error("Erro ao buscar estoque:", e); }
}

// =============================================================================
// FILTROS CASCATEADOS (ESTOQUE)
// =============================================================================

window.preencherFiltrosEstoqueMapa = function() {
    const selMedida = document.getElementById('filtro-mapa-medida');
    const selMarca = document.getElementById('filtro-mapa-marca');
    if(selMedida) {
        const medidas = [...new Set(window.pneusLivresGlobal.map(p => p.medida))].filter(Boolean).sort();
        selMedida.innerHTML = '<option value="">Medida...</option>' + medidas.map(m => `<option value="${m}">${m}</option>`).join('');
    }
    if(selMarca) {
        const marcas = [...new Set(window.pneusLivresGlobal.map(p => p.marca))].filter(Boolean).sort();
        selMarca.innerHTML = '<option value="">Marca...</option>' + marcas.map(m => `<option value="${m}">${m}</option>`).join('');
    }
}

window.adicionarFiltroEstoqueMapa = function() {
    const container = document.getElementById('container-filtros-mapa-estoque');
    const id = Date.now();
    const div = document.createElement('div');
    div.id = `filtro-mapa-${id}`;
    div.style.cssText = 'display: flex; gap: 5px; margin-bottom: 5px; align-items: center;';

    div.innerHTML = `
        <select class="form-control" style="width: 90px; height: 26px; padding: 2px; font-size: 0.75rem;" onchange="window.configurarInputFiltroMapa(this, ${id})">
            <option value="">Campo...</option>
            <option value="marca">Marca</option>
            <option value="modelo">Modelo</option>
            <option value="medida">Medida</option>
            <option value="tipo">Tipo</option>
        </select>
        <div id="wrapper-mapa-filtro-${id}" style="flex: 1; display: flex;">
            <input type="text" class="form-control input-filtro-mapa" disabled placeholder="..." style="width: 100%; height: 26px; padding: 2px; font-size: 0.75rem;">
        </div>
        <button onclick="window.removerFiltroEstoqueMapa(${id})" style="border:none; background:none; color:#dc3545; cursor:pointer;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

window.removerFiltroEstoqueMapa = function(id) { 
    document.getElementById(`filtro-mapa-${id}`)?.remove(); 
    window.aplicarFiltroEstoqueMapa(); 
}

window.configurarInputFiltroMapa = function(sel, id) {
    const wrapper = document.getElementById(`wrapper-mapa-filtro-${id}`);
    const tipo = sel.value;
    wrapper.innerHTML = '';
    
    if (tipo === 'tipo') {
        wrapper.innerHTML = `<select class="form-control input-filtro-mapa" style="width: 100%; height: 26px; padding: 2px; font-size: 0.75rem;" onchange="window.aplicarFiltroEstoqueMapa()">
            <option value="">Todos</option><option value="Liso (Direcional)">Liso (Direcional)</option><option value="Misto">Misto</option><option value="Borrachudo (Tração)">Borrachudo (Tração)</option>
        </select>`;
    } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-control input-filtro-mapa';
        inp.style.cssText = 'width: 100%; height: 26px; padding: 2px; font-size: 0.75rem;';
        inp.placeholder = 'Digite...';
        inp.disabled = (tipo === '');
        inp.onkeyup = window.aplicarFiltroEstoqueMapa;
        wrapper.appendChild(inp);
    }
    window.aplicarFiltroEstoqueMapa();
}

window.aplicarFiltroEstoqueMapa = function() {
    const container = document.getElementById('container-filtros-mapa-estoque');
    let filtrados = [...window.pneusLivresGlobal];

    if (container) {
        container.querySelectorAll('div[id^="filtro-mapa-"]').forEach(linha => {
            const tipo = linha.querySelector('select').value;
            const input = linha.querySelector('.input-filtro-mapa');
            if (!tipo || !input || !input.value) return;

            const valor = input.value.toLowerCase();
            filtrados = filtrados.filter(p => {
                if (tipo === 'marca') return (p.marca || '').toLowerCase().includes(valor);
                if (tipo === 'modelo') return (p.modelo || '').toLowerCase().includes(valor);
                if (tipo === 'medida') return (p.medida || '').toLowerCase().includes(valor);
                if (tipo === 'tipo') return (p.tipo || '').toLowerCase().includes(valor);
                return true;
            });
        });
    }

    const idsNoRascunho = window.pneusRascunho.map(p => String(p.id));
    filtrados = filtrados.filter(p => !idsNoRascunho.includes(String(p.id)));

    window.renderizarPneusParaArrastar(filtrados);
}

// =============================================================================
// NOVO: LAYOUT DE ESTANTE DE ESTOQUE FÍSICA (Idêntico ao Chassi)
// =============================================================================
window.renderizarPneusParaArrastar = function(lista = null) {
    if(!lista) lista = window.pneusLivresGlobal.filter(p => !window.pneusRascunho.map(x=>String(x.id)).includes(String(p.id)));

    const containerArrastavel = document.getElementById('lista-pneus-drag');
    if (!containerArrastavel) return;
    
    // Preserva o listener limpando o conteúdo interno de forma seletiva, 
    // ou apenas substituindo o HTML interno mantendo a div raiz.
    containerArrastavel.innerHTML = '';

    if (lista.length === 0) {
        containerArrastavel.innerHTML = '<div style="text-align:center; padding:20px; color:#999; font-size:0.8rem;">Nenhum pneu atende ao filtro ou estoque vazio.</div>';
        return;
    }

    const estantes = {};
    lista.forEach(p => {
        const und = p.unidades ? p.unidades.nome : 'Geral';
        if (!estantes[und]) estantes[und] = { 'Liso (Direcional)': [], 'Borrachudo (Tração)': [], 'Misto': [], 'Outros': [] };
        
        const t = (p.tipo || '').toLowerCase();
        if (t.includes('liso') || t.includes('direcional')) estantes[und]['Liso (Direcional)'].push(p);
        else if (t.includes('borrachudo') || t.includes('tração') || t.includes('tracao')) estantes[und]['Borrachudo (Tração)'].push(p);
        else if (t.includes('misto')) estantes[und]['Misto'].push(p);
        else estantes[und]['Outros'].push(p);
    });

    const divEstanteFisica = document.createElement('div');
    divEstanteFisica.className = 'estante-fisica'; 

    for (const [unidade, tipos] of Object.entries(estantes)) {
        const divUnidade = document.createElement('div');
        divUnidade.className = 'unidade-container';
        divUnidade.innerHTML = `<h4 class="titulo-unidade"><i class="fas fa-warehouse"></i> Unidade: ${unidade}</h4>`;
        
        const divPrateleirasFisicas = document.createElement('div');
        divPrateleirasFisicas.className = 'estante-fisica-prateleiras';

        for (const [tipoNome, pneus] of Object.entries(tipos)) {
            if (pneus.length === 0) continue;

            const divPrateleiraTipo = document.createElement('div');
            divPrateleiraTipo.className = 'tipo-container';
            divPrateleiraTipo.innerHTML = `<div class="titulo-tipo">${tipoNome} (${pneus.length})</div>`;
            
            const linhaBase = document.createElement('div');
            linhaBase.className = 'prateleira-linha';

            pneus.forEach(p => linhaBase.appendChild(window.criarCardPneuVisual(p, false)));
            
            divPrateleiraTipo.appendChild(linhaBase);
            divPrateleirasFisicas.appendChild(divPrateleiraTipo);
        }
        
        divUnidade.appendChild(divPrateleirasFisicas);
        divEstanteFisica.appendChild(divUnidade);
    }
    containerArrastavel.appendChild(divEstanteFisica);
}

// CORRIGIDO: Função Universal para montar o "Card Preto" do Pneu (Serve para Chassi e Estoque)
window.criarCardPneuVisual = function(p, instaladoNoChassi = false) {
    const card = document.createElement('div');
    card.className = instaladoNoChassi ? 'pneu-instalado' : 'pneu-card-estoque'; 
    card.setAttribute('draggable', 'true');
    card.id = `drag-pneu-${p.id}`;
    
    card.dataset.pneuStr = JSON.stringify({ ...p, origem: instaladoNoChassi ? 'chassi' : 'estoque' });

    let classeFogo = ''; let classeBanda = '';
    
    const t = (p.tipo || '').toLowerCase();
    if (t.includes('liso') || t.includes('direcional')) { 
        classeFogo = 'fogo-liso'; classeBanda = 'banda-lisa';
    } else if (t.includes('misto')) { 
        classeFogo = 'fogo-misto'; classeBanda = 'banda-mista';
    } else if (t.includes('borrachudo') || t.includes('tração') || t.includes('tracao')) { 
        classeFogo = 'fogo-borrachudo'; classeBanda = 'banda-borrachuda';
    }

    // O HTML interno é estritamente o mesmo, garantindo fontes proporcionais ao tamanho do card de 55px
    const btnRemoverHTML = instaladoNoChassi ? `<button class="btn-remover-pneu" title="Retornar ao Estoque"><i class="fas fa-times"></i></button>` : ``;

    card.innerHTML = `
        <div class="tread-pattern ${classeBanda}"></div>
        ${btnRemoverHTML}
        <div class="pneu-info-base">
            <span class="fogo ${classeFogo}" style="font-size: 0.8rem;">${p.numero_fogo}</span>
            <span style="font-size: 0.65rem; font-weight: bold; margin-top:2px;">${p.marca}</span>
            <span style="font-size: 0.55rem; color:#ddd;">${p.medida}</span>
            <span style="font-size: 0.55rem; color:#aaa; margin-top:2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 100%;">${p.modelo || ''}</span>
        </div>
    `;

    card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', card.dataset.pneuStr);
        setTimeout(() => card.style.opacity = '0.5', 0);
    });
    card.addEventListener('dragend', () => { card.style.opacity = '1'; });
    
    // Adiciona evento ao botão se estiver instalado
    if (instaladoNoChassi) {
        const btnRemover = card.querySelector('.btn-remover-pneu');
        if (btnRemover) {
            btnRemover.addEventListener('click', (e) => {
                e.stopPropagation(); 
                window.pneusRascunho = window.pneusRascunho.filter(x => String(x.id) !== String(p.id));
                window.renderizarChassiVeiculo(p.veiculo_id);
                window.aplicarFiltroEstoqueMapa();
                window.verificarAlteracoesPendentes(); 
            });
        }
    }

    return card;
}

// =============================================================================
// LÓGICA DE INTERPRETAÇÃO DO CHASSI E DRAG AND DROP INTERNO
// =============================================================================

window.aoSelecionarVeiculoMapa = async function() {
    const veiculoId = document.getElementById('sel-veiculo-mapa').value;
    const kmInput = document.getElementById('km-veiculo-mapa');
    const btnSalvar = document.getElementById('btn-salvar-aplicacao');
    
    if(btnSalvar) btnSalvar.style.display = 'none';
    window.estadoMapaInicial = [];
    window.pneusRascunho = [];

    if (!veiculoId) {
        document.getElementById('area-chassi-render').innerHTML = '<div style="text-align: center; color: #aaa; margin-top: 15%; font-size: 1.1rem;"><i class="fas fa-truck-moving fa-3x" style="opacity: 0.3; margin-bottom: 15px;"></i><br>Selecione um veículo na barra superior.</div>';
        document.getElementById('info-eixos-mapa').innerText = '';
        kmInput.value = '';
        return;
    }

    try {
        const v = window.veiculosMapaGlobal.find(x => String(x.id) === String(veiculoId));
        if (v && v.km_atual) kmInput.value = v.km_atual; else kmInput.value = '';

        const { data, error } = await clienteSupabase.from('pneus').select('*').eq('veiculo_id', veiculoId).eq('status', 'EM USO');
        if(error) throw error;
        
        window.estadoMapaInicial = JSON.parse(JSON.stringify(data || [])); 
        window.pneusRascunho = JSON.parse(JSON.stringify(data || [])); 
        
        window.renderizarChassiVeiculo(veiculoId);
        window.aplicarFiltroEstoqueMapa(); 

    } catch (e) { console.error(e); mostrarToast("Erro ao ler banco de dados.", "error"); }
}

window.renderizarChassiVeiculo = function(veiculoId) {
    const chassiArea = document.getElementById('area-chassi-render');
    const veiculo = window.veiculosMapaGlobal.find(v => String(v.id) === String(veiculoId));
    
    let layoutEixos = []; 
    const conf = String(veiculo.configuracao_eixos || veiculo.eixos || '').toLowerCase();
    const tipoV = String(veiculo.tipo_veiculo || '').toLowerCase();

    if (tipoV.includes('carreta') || tipoV.includes('semi-reboque') || conf.includes('carreta')) {
        let numEixos = parseInt(veiculo.eixos) || 2;
        for(let i=0; i<numEixos; i++) layoutEixos.push({ pneus: 4, tracao: false, tipo: 'Carreta' });
    } else {
        if (conf.includes('8x2') || conf.includes('8 x 2') || conf.includes('bi-truck') || conf.includes('bitruck')) {
            layoutEixos = [ {pneus: 2, tracao: false, tipo: 'Dir'}, {pneus: 2, tracao: false, tipo: 'Dir'}, {pneus: 4, tracao: true, tipo: 'Tração'}, {pneus: 4, tracao: false, tipo: 'Truck'} ];
        } else if (conf.includes('6x4') || conf.includes('6 x 4') || conf.includes('traçado')) {
            layoutEixos = [ {pneus: 2, tracao: false, tipo: 'Dir'}, {pneus: 4, tracao: true, tipo: 'Tração'}, {pneus: 4, tracao: true, tipo: 'Tração'} ];
        } else if (conf.includes('6x2') || conf.includes('6 x 2') || conf.includes('truck')) {
            layoutEixos = [ {pneus: 2, tracao: false, tipo: 'Dir'}, {pneus: 4, tracao: true, tipo: 'Tração'}, {pneus: 4, tracao: false, tipo: 'Truck'} ];
        } else if (conf.includes('4x2') || conf.includes('4 x 2') || conf.includes('toco')) {
            layoutEixos = [ {pneus: 2, tracao: false, tipo: 'Dir'}, {pneus: 4, tracao: true, tipo: 'Tração'} ];
        } else {
            let numEixosFallback = parseInt(veiculo.eixos) || 2;
            layoutEixos = [{ pneus: 2, tracao: false, tipo: 'Dir' }]; 
            for(let i=1; i<numEixosFallback; i++) layoutEixos.push({ pneus: 4, tracao: true, tipo: 'Tração' });
        }
    }

    document.getElementById('info-eixos-mapa').innerHTML = `Layout: <b style="color:var(--cor-primaria);">${layoutEixos.length} Eixos (${layoutEixos.reduce((a,b)=>a+b.pneus, 0)} Pneus + Estepe)</b>`;
    
    chassiArea.innerHTML = `
        <div style="background: #e9ecef; border: 2px solid #ccc; width: 140px; height: 60px; border-radius: 15px 15px 0 0; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; font-weight: bold; color: #555; box-shadow: 0 -4px 10px rgba(0,0,0,0.05);">
            ${veiculo.placa}
        </div>
    `;

    layoutEixos.forEach((eixo, index) => {
        const i = index + 1;
        const eixoRow = document.createElement('div');
        eixoRow.className = 'eixo-linha';

        if (eixo.pneus === 2) {
            eixoRow.appendChild(window.criarDropZone(`Eixo ${i} - Esq`, `E${i}-E`, veiculoId));
            
            const espacador = window.criarEspacador();
            espacador.style.width = '110px'; 
            espacador.style.position = 'relative'; 
            
            const barraInterna = document.createElement('div');
            barraInterna.className = 'eixo-barra';
            barraInterna.style.width = '100%';
            barraInterna.style.position = 'absolute';
            barraInterna.style.top = '50%';
            barraInterna.style.transform = 'translateY(-50%)';
            barraInterna.style.zIndex = '-1';
            espacador.appendChild(barraInterna);

            eixoRow.appendChild(espacador);
            eixoRow.appendChild(window.criarDropZone(`Eixo ${i} - Dir`, `E${i}-D`, veiculoId));

        } else if (eixo.pneus === 4) {
            const barraGeral = document.createElement('div');
            barraGeral.className = 'eixo-barra';
            eixoRow.appendChild(barraGeral);

            if (eixo.tracao) {
                const diferencial = document.createElement('div');
                diferencial.className = 'diferencial-circulo';
                diferencial.style.position = 'absolute';
                diferencial.style.left = '50%';
                diferencial.style.transform = 'translateX(-50%)';
                eixoRow.appendChild(diferencial);
            }

            eixoRow.appendChild(window.criarDropZone(`E${i} - Ext. Esq`, `E${i}-EE`, veiculoId));
            eixoRow.appendChild(window.criarDropZone(`E${i} - Int. Esq`, `E${i}-IE`, veiculoId));
            eixoRow.appendChild(window.criarEspacador());
            eixoRow.appendChild(window.criarDropZone(`E${i} - Int. Dir`, `E${i}-ID`, veiculoId));
            eixoRow.appendChild(window.criarDropZone(`Eixo ${i} - Ext. Dir`, `E${i}-ED`, veiculoId));
        }

        chassiArea.appendChild(eixoRow);
    });

    const estepeContainer = document.createElement('div');
    estepeContainer.className = 'estepe-zone-container eixo-linha'; 
    estepeContainer.style.marginTop = '40px';
    estepeContainer.style.marginBottom = '60px'; 
    estepeContainer.appendChild(window.criarDropZone('Estepe', 'Estepe', veiculoId, true));
    chassiArea.appendChild(estepeContainer);
}

window.criarEspacador = function() {
    const div = document.createElement('div');
    div.style.width = '70px'; 
    div.style.zIndex = '2';
    return div;
}

window.criarDropZone = function(labelTxt, idPosicao, veiculoId, ehEstepe = false) {
    const wrapper = document.createElement('div');
    wrapper.className = 'roda-posicao';

    const label = document.createElement('div');
    label.className = 'roda-label';
    label.innerText = labelTxt;

    const zone = document.createElement('div');
    zone.className = 'drop-zone';
    zone.dataset.posicao = idPosicao;
    if (ehEstepe) zone.classList.add('estepe-zone');

    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => { zone.classList.remove('drag-over'); });
    zone.addEventListener('drop', e => window.lidarComDrop(e, idPosicao, veiculoId, zone));

    const pneuInstalado = window.pneusRascunho.find(p => p.posicao === idPosicao);
    if (pneuInstalado) {
        window.instalarPneuVisual(zone, pneuInstalado);
    }

    wrapper.appendChild(label);
    wrapper.appendChild(zone);
    return wrapper;
}

window.lidarComDrop = function(e, posAlvo, veiculoId, zoneDOM) {
    e.preventDefault();
    zoneDOM.classList.remove('drag-over');
    
    const dataStr = e.dataTransfer.getData('text/plain');
    if (!dataStr) return;
    
    const pneuArrastado = JSON.parse(dataStr);
    const pneuNaPosicaoAlvo = window.pneusRascunho.find(p => p.posicao === posAlvo);

    if (pneuArrastado.origem === 'estoque') {
        if (pneuNaPosicaoAlvo) {
            window.pneusRascunho = window.pneusRascunho.filter(p => p.id !== pneuNaPosicaoAlvo.id);
            mostrarToast(`Pneu ${pneuNaPosicaoAlvo.numero_fogo} retornou ao estoque.`, 'info');
        }
        pneuArrastado.posicao = posAlvo;
        pneuArrastado.veiculo_id = veiculoId;
        pneuArrastado.origem = 'chassi'; 
        window.pneusRascunho.push(pneuArrastado);

    } else if (pneuArrastado.origem === 'chassi') {
        const posOrigem = pneuArrastado.posicao;
        const pneuOriginal = window.pneusRascunho.find(p => String(p.id) === String(pneuArrastado.id));
        
        if (pneuNaPosicaoAlvo) {
            pneuNaPosicaoAlvo.posicao = posOrigem;
            pneuOriginal.posicao = posAlvo;
            mostrarToast("Posições invertidas no Rodízio!", "info");
        } else {
            pneuOriginal.posicao = posAlvo;
        }
    }

    window.verificarConflitoEixo(posAlvo);
    window.renderizarChassiVeiculo(veiculoId); 
    window.aplicarFiltroEstoqueMapa(); 
    window.verificarAlteracoesPendentes(); 
}

// Renderiza o card dentro da Drop Zone do Chassi reaproveitando a função unificada
window.instalarPneuVisual = function(zonaHTML, p) {
    zonaHTML.classList.add('ocupada');
    const cardInstalado = window.criarCardPneuVisual(p, true);
    zonaHTML.appendChild(cardInstalado);
}

window.verificarAlteracoesPendentes = function() {
    const btnSalvar = document.getElementById('btn-salvar-aplicacao');
    if (!btnSalvar) return;

    let temAlteracao = false;

    if (window.pneusRascunho.length !== window.estadoMapaInicial.length) {
        temAlteracao = true;
    } else {
        for (let pneuRas of window.pneusRascunho) {
            const pneuInicial = window.estadoMapaInicial.find(i => String(i.id) === String(pneuRas.id));
            if (!pneuInicial || pneuInicial.posicao !== pneuRas.posicao) {
                temAlteracao = true;
                break;
            }
        }
    }

    btnSalvar.style.display = temAlteracao ? 'flex' : 'none';
}

window.verificarConflitoEixo = function(posicao) {
    if (posicao === 'Estepe') return;
    const eixoPrefix = posicao.split('-')[0]; 
    
    const pneusNoEixo = window.pneusRascunho.filter(p => p.posicao && p.posicao.startsWith(eixoPrefix));
    if (pneusNoEixo.length > 1) {
        const tipos = [...new Set(pneusNoEixo.map(p => p.tipo))];
        if (tipos.length > 1) {
            mostrarToast(`Atenção: Pneus de tipos divergentes no ${eixoPrefix.replace('E', 'Eixo ')}!`, 'warning');
        }
    }
}

// =============================================================================
// SALVAR E IMPRIMIR
// =============================================================================

window.salvarAlteracoesMapa = async function() {
    const veiculoId = document.getElementById('sel-veiculo-mapa').value;
    const kmInstalacao = document.getElementById('km-veiculo-mapa').value;
    const btn = document.getElementById('btn-salvar-aplicacao');

    if (!kmInstalacao) { mostrarToast("Informe o KM do veículo no momento da alteração!", "warning"); return; }

    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; 
    btn.disabled = true;

    try {
        const { data: { user } } = await clienteSupabase.auth.getUser();
        const dataOS = new Date().toISOString();

        const pneusUpdates = window.pneusRascunho.filter(ras => {
            const ini = window.estadoMapaInicial.find(i => String(i.id) === String(ras.id));
            return !ini || ini.posicao !== ras.posicao; 
        });

        const pneusRemovidos = window.estadoMapaInicial.filter(ini => {
            return !window.pneusRascunho.find(r => String(r.id) === String(ini.id));
        });

        for (const p of pneusUpdates) {
            const antigo = window.estadoMapaInicial.find(i => String(i.id) === String(p.id)) || window.pneusLivresGlobal.find(i => String(i.id) === String(p.id)) || {status: "Desconhecido"};
            const payloadPneu = { veiculo_id: veiculoId, posicao: p.posicao, km_instalacao: kmInstalacao, status: 'EM USO' };

            const { error: errorPneu } = await clienteSupabase.from('pneus').update(payloadPneu).eq('id', p.id);
            if (errorPneu) throw errorPneu;

            const acaoKardex = antigo.veiculo_id ? 'RODÍZIO' : 'INSTALAÇÃO'; 
            await clienteSupabase.from('logs_auditoria').insert({
                tabela_afetada: 'pneus',
                id_registro_afetado: String(p.id),
                acao: 'UPDATE',
                usuario_id: user?.id,
                dados_antigos: JSON.stringify(antigo),
                dados_novos: JSON.stringify({ ...p, ...payloadPneu, acao_kardex: acaoKardex }),
                data_hora: dataOS
            });
        }

        for (const p of pneusRemovidos) {
            const antigo = {...p};
            const payloadPneu = { veiculo_id: null, posicao: null, status: antigo.status.includes('RECAPADO') ? 'ESTOQUE RECAPADO' : 'ESTOQUE NOVO' };

            const { error: errorPneu } = await clienteSupabase.from('pneus').update(payloadPneu).eq('id', p.id);
            if (errorPneu) throw errorPneu;

            await clienteSupabase.from('logs_auditoria').insert({
                tabela_afetada: 'pneus',
                id_registro_afetado: String(p.id),
                acao: 'UPDATE',
                usuario_id: user?.id,
                dados_antigos: JSON.stringify(antigo),
                dados_novos: JSON.stringify({ ...p, ...payloadPneu, acao_kardex: 'RETIRADA' }),
                data_hora: dataOS
            });
        }

        await clienteSupabase.from('veiculos').update({ km_atual: kmInstalacao }).eq('id', veiculoId);

        mostrarToast("Alterações salvas com sucesso!", "success");
        await window.aoSelecionarVeiculoMapa(); 

    } catch (e) {
        console.error(e);
        mostrarToast("Erro ao gravar dados no banco.", "error");
    } finally {
        btn.innerHTML = '<i class="fas fa-save"></i>'; 
        btn.disabled = false;
    }
}

window.imprimirMapaPneus = function(tipo) {
    const veiculoId = document.getElementById('sel-veiculo-mapa').value;
    const placa = document.getElementById('sel-veiculo-mapa').options[document.getElementById('sel-veiculo-mapa').selectedIndex]?.text;
    
    if(!veiculoId) { mostrarToast("Selecione um veículo primeiro.", "warning"); return; }
    document.getElementById('modal-print-mapa').classList.remove('active');

    const chassiRenderizado = document.getElementById('area-chassi-render').innerHTML;
    const areaPrint = document.getElementById('area-impressao-mapa');
    
    let htmlPrint = '';

    if (tipo === 'atual') {
        htmlPrint = `
            <div class="print-page">
                <div class="print-title">Mapa Atual de Pneus - ${placa}</div>
                <div style="font-size: 0.9rem; margin-bottom: 20px; text-align: center;">Impresso em: ${new Date().toLocaleString('pt-BR')}</div>
                <div class="print-chassi-box">${chassiRenderizado}</div>
            </div>
        `;
    } else {
        let chassiVazio = chassiRenderizado.replace(/<div class="pneu-instalado".*?<\/div>/gs, '');
        chassiVazio = chassiVazio.replace(/ocupada/g, ''); 

        htmlPrint = `
            <div class="print-page">
                <div class="print-title">Situação Atual no Sistema - ${placa}</div>
                <div style="font-size: 0.9rem; margin-bottom: 20px; text-align: center;">Data de Emissão: ${new Date().toLocaleDateString('pt-BR')}</div>
                <div class="print-chassi-box">${chassiRenderizado}</div>
            </div>
            
            <div class="print-page" style="margin-top: 30px;">
                <div class="print-title">Anotação Física (Para Preenchimento) - ${placa}</div>
                <div style="font-size: 0.9rem; margin-bottom: 20px; text-align: center;">Data: ___/___/20___ &nbsp;&nbsp;&nbsp; Inspetor: ___________________________</div>
                <div class="print-chassi-box">${chassiVazio}</div>
            </div>
        `;
    }

    areaPrint.innerHTML = htmlPrint;
    areaPrint.style.display = 'block';
    
    setTimeout(() => {
        window.print();
        areaPrint.style.display = 'none';
    }, 500);
}