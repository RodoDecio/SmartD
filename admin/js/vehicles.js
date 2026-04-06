// admin/js/vehicles.js - SCRIPT INTEGRAL COM FILTROS DINÂMICOS E LOGS DETALHADOS

let listaVeiculosTela = [];
let listaUnidadesVeiculo = []; 
let formVeiculoSujo = false;
let dadosOriginaisVeiculo = null;


// =============================================================================
// 1. INICIALIZAÇÃO
// =============================================================================

function inicializarVeiculos(unidadeId) {
    document.getElementById('titulo-pagina').innerText = 'Gestão de Veículos';
    
    configurarFormularioVeiculo();
    
    // --- CORREÇÃO DO BOTÃO DE FILTRO ---
    // Remove o evento onclick do HTML para evitar duplicidade ao clicar
    const btnAdd = document.querySelector('button[onclick*="adicionarLinhaFiltro"]');
    if (btnAdd) {
        const novoBtn = btnAdd.cloneNode(true);
        novoBtn.removeAttribute('onclick'); 
        novoBtn.addEventListener('click', adicionarLinhaFiltro);
        btnAdd.parentNode.replaceChild(novoBtn, btnAdd);
    }

    // --- GARANTE FILTRO INICIAL VAZIO ---
    const container = document.getElementById('container-filtros');
    if (container) {
        container.innerHTML = '';
        adicionarLinhaFiltro(); // Adiciona 1 linha vazia padrão
    }

    // Carrega unidades e inicia a listagem
    carregarUnidadesVeiculo().then(() => {
        listarVeiculos(unidadeId);
    });
}

// =============================================================================
// 2. DADOS (SUPABASE)
// =============================================================================

async function carregarUnidadesVeiculo() {
    try {
        const { data } = await clienteSupabase
            .from('unidades')
            .select('id, nome')
            .eq('ativo', true)
            .order('nome');
        listaUnidadesVeiculo = data || [];
    } catch (e) { 
        console.error("Erro ao carregar unidades:", e); 
    }
}

async function listarVeiculos(unidadeId = null) {
    const tbody = document.getElementById('tbody-veiculos');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="9" class="text-center p-3">Carregando... <i class="fas fa-spinner fa-spin"></i></td></tr>';

    try {
        // Se unidadeId não for passado, busca o valor atual do rodapé
        if (!unidadeId) {
            unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
        }

        let query = clienteSupabase
            .from('veiculos')
            .select('*, unidades(nome)')
            .order('placa');

        // Filtro global do rodapé
        if (unidadeId !== "TODAS") {
            query = query.eq('unidade_id', unidadeId);
        }

        const { data, error } = await query;
        if (error) throw error;

        listaVeiculosTela = data || [];
        
        // Aplica os filtros dinâmicos de tela (se houver algum preenchido)
        aplicarFiltrosDinamicos(); 

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao carregar veículos.", "error");
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
    }
}

// =============================================================================
// 3. SALVAMENTO E LOGS DETALHADOS (CORRIGIDO)
// =============================================================================

async function salvarVeiculo(e) {
    e.preventDefault();
    const btn = e.submitter;
    if (!btn || btn.disabled) return;

    const id = document.getElementById('vec-id').value;
    const placa = document.getElementById('vec-placa').value.toUpperCase().trim();
    const marca = document.getElementById('vec-marca').value;
    const modelo = document.getElementById('vec-modelo').value;
    const ano = document.getElementById('vec-ano').value;
    const unidadeId = document.getElementById('vec-unidade').value;
    const tipo = document.getElementById('vec-tipo').value;
    const kmAtual = parseInt(document.getElementById('vec-km').value || 0);
    const observacao = document.getElementById('vec-obs').value.trim();

    const compsInputs = document.querySelectorAll('.input-comp-cap');
    const listaCompartimentos = Array.from(compsInputs).map(inp => parseFloat(inp.value || 0));
    const capacidadeTotal = calcularCapacidadeTotal();

    let carretasSelecionadasIds = [];
    if (tipo === 'Cavalo') {
        document.querySelectorAll('.chk-carreta:checked').forEach(chk => {
            carretasSelecionadasIds.push(chk.value);
        });
    }

    let infoEixos = null;
    if (['Caminhão', 'Cavalo'].includes(tipo)) {
        infoEixos = document.getElementById('vec-eixo-select').value;
    } else if (tipo === 'Carreta') {
        const valInput = document.getElementById('vec-eixo-input').value;
        infoEixos = valInput ? valInput + " eixos" : null;
    }

    // --- VALIDAÇÃO "NADA MUDOU" (USANDO AS CHAVES CORRETAS) ---
    if (id && dadosOriginaisVeiculo) {
        const compJsonAtual = JSON.stringify(listaCompartimentos);
        const carretasStringAtual = carretasSelecionadasIds.sort().join(',');
        
        const nadaMudou = (
            placa === dadosOriginaisVeiculo.placa &&
            marca === dadosOriginaisVeiculo.marca &&
            modelo === dadosOriginaisVeiculo.modelo &&
            ano === dadosOriginaisVeiculo.ano_fab_mod && // Corrigido
            tipo === dadosOriginaisVeiculo.tipo_veiculo && // Corrigido
            kmAtual === dadosOriginaisVeiculo.km_atual && 
            unidadeId === dadosOriginaisVeiculo.unidade_id && // Corrigido
            (infoEixos || '') === (dadosOriginaisVeiculo.eixos || '') &&
            observacao === dadosOriginaisVeiculo.observacao &&
            compJsonAtual === dadosOriginaisVeiculo.compartimentos_json && // Corrigido
            carretasStringAtual === dadosOriginaisVeiculo.carretas_vinculadas
        );

        if (nadaMudou) {
            mostrarToast("Nenhuma alteração detectada.", "warning");
            return;
        }
    }

    // Validação Placa
    try {
        let queryPlaca = clienteSupabase.from('veiculos').select('id').eq('placa', placa);
        if (id) queryPlaca = queryPlaca.neq('id', id);
        const { data: existe } = await queryPlaca.maybeSingle();
        if (existe) {
            mostrarToast(`A placa ${placa} já existe!`, "error");
            return;
        }
    } catch (err) { console.error(err); return; }

    const txtOriginal = btn.innerText;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    try {
        const dadosNovos = { 
            placa, marca, modelo, 
            ano_fab_mod: ano, 
            tipo_veiculo: tipo, 
            eixos: infoEixos, 
            unidade_id: unidadeId,
            km_atual: kmAtual,
            observacao: observacao,
            capacidade_tanque: (tipo === 'Caminhão' || tipo === 'Carreta') ? capacidadeTotal : 0,
            compartimentos_json: (tipo === 'Caminhão' || tipo === 'Carreta') ? listaCompartimentos : []
        };

        let logAcao = id ? 'UPDATE' : 'INSERT';
        let idReg = id;
        let dadosAntigosLog = null;

        if (id) {
            // Remove campos de controle interno do JS antes de mandar pro Log
            dadosAntigosLog = { ...dadosOriginaisVeiculo };
            // Remove o compartimentos_json stringificado do antigo se quiser que o diff compare objetos, 
            // mas como o novo vai como array, o diff pode se perder. 
            // O ideal é manter a string ou garantir que ambos sejam array.
            // Para simplificar, o log vai mostrar mudança.
            
            const { error } = await clienteSupabase.from('veiculos').update(dadosNovos).eq('id', id);
            if (error) throw error;
        } else {
            dadosNovos.ativo = true;
            const { data, error } = await clienteSupabase.from('veiculos').insert([dadosNovos]).select();
            if (error) throw error;
            idReg = data[0].id;
        }

        if (tipo === 'Cavalo' && idReg) {
            if (carretasSelecionadasIds.length > 0) {
                 await clienteSupabase.from('veiculos')
                    .update({ cavalo_id: null })
                    .eq('cavalo_id', idReg)
                    .not('id', 'in', `(${carretasSelecionadasIds.join(',')})`);
                
                await clienteSupabase.from('veiculos')
                    .update({ cavalo_id: idReg }) 
                    .in('id', carretasSelecionadasIds);
            } else {
                await clienteSupabase.from('veiculos')
                    .update({ cavalo_id: null })
                    .eq('cavalo_id', idReg);
            }
        } else if (idReg) {
             await clienteSupabase.from('veiculos')
                .update({ cavalo_id: null })
                .eq('cavalo_id', idReg);
        }

        // LOG
        const dadosNovosLog = { 
            ...dadosNovos, 
            // Adiciona o campo extra para o comparador de log
            carretas_vinculadas: carretasSelecionadasIds.sort().join(','),
            // Garante que compartimentos vire string para bater com o antigo no diff (opcional)
            compartimentos_json: JSON.stringify(dadosNovos.compartimentos_json)
        };

        const { data: { user } } = await clienteSupabase.auth.getUser();
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'veiculos',
            acao: logAcao,
            id_registro_afetado: String(idReg),
            usuario_id: user?.id,
            dados_antigos: dadosAntigosLog ? JSON.stringify(dadosAntigosLog) : null,
            dados_novos: JSON.stringify(dadosNovosLog),
            data_hora: new Date().toISOString()
        }]);

        mostrarToast("Veículo salvo com sucesso!", "success");
        fecharModalVeiculo(true);
        listarVeiculos();

    } catch (err) {
        console.error("Erro salvar:", err);
        mostrarToast("Erro: " + err.message, "error");
    } finally {
        btn.innerText = txtOriginal;
        btn.disabled = false;
    }
}

async function alternarStatusVeiculo(id, statusAtual) {
    try {
        const { error } = await clienteSupabase.from('veiculos').update({ ativo: !statusAtual }).eq('id', id);
        if (error) throw error;
        
        const user = (await clienteSupabase.auth.getUser()).data.user;
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'veiculos', 
            acao: 'UPDATE_STATUS', 
            id_registro_afetado: id, 
            usuario_id: user?.id, 
            dados_novos: JSON.stringify({ ativo: !statusAtual }),
            data_hora: new Date().toISOString()
        }]);

        mostrarToast("Status atualizado!", "success");
        listarVeiculos(); 
    } catch (err) { mostrarToast("Erro ao mudar status.", "error"); }
}

// =============================================================================
// 4. UI: FILTROS DINÂMICOS (BUSCA MULTI-COLUNAS)
// =============================================================================

function adicionarLinhaFiltro() {
    const container = document.getElementById('container-filtros');
    if(!container) return;
    
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `f-${id}`;
    div.innerHTML = `
        <select class="filter-select" onchange="atualizarOpcoesFiltro(this)">
            <option value="" disabled selected>Filtrar por...</option>
            <option value="placa">Placa</option>
            <option value="marca">Marca</option>
            <option value="modelo">Modelo</option>
            <option value="ano">Ano</option>
            <option value="tipo">Tipo de Veículo</option>
            <option value="capacidade">Capacidade (L)</option>
            <option value="status">Status</option>
        </select>
        
        <input type="text" class="form-control" style="display:none; width:200px;" placeholder="Digite..." onkeyup="aplicarFiltrosDinamicos()">
        <select class="filter-select" style="display:none; width:200px;" onchange="aplicarFiltrosDinamicos()"></select>
        
        <button class="btn-remove-filter" onclick="removerFiltro('${id}')"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

function removerFiltro(id) {
    const el = document.getElementById(`f-${id}`);
    if(el) el.remove();
    aplicarFiltrosDinamicos();
}

function atualizarOpcoesFiltro(selectTipo) {
    const tipo = selectTipo.value;
    const inputTexto = selectTipo.nextElementSibling;
    const selectValor = inputTexto.nextElementSibling;

    inputTexto.value = '';
    inputTexto.style.display = 'none';
    selectValor.innerHTML = '<option value="">Todos</option>';
    selectValor.style.display = 'none';

    if (['placa', 'marca', 'modelo', 'ano'].includes(tipo)) {
        inputTexto.style.display = 'block';
        inputTexto.focus();
    } 
    else {
        selectValor.style.display = 'block';
        
        if (tipo === 'capacidade') {
            // Extrai capacidades únicas da lista de veículos em tela
            const caps = [...new Set(listaVeiculosTela
                .map(v => v.capacidade_tanque)
                .filter(c => c && c > 0))]
                .sort((a, b) => a - b);
            
            caps.forEach(c => {
                const label = parseFloat(c).toLocaleString('pt-BR') + ' L';
                selectValor.innerHTML += `<option value="${c}">${label}</option>`;
            });
        } 
        else if (tipo === 'tipo') {
            ['Automóvel', 'Caminhão', 'Cavalo', 'Carreta'].forEach(t => {
                selectValor.innerHTML += `<option value="${t}">${t}</option>`;
            });
        } 
        else if (tipo === 'status') {
            selectValor.innerHTML += `<option value="true">Ativo</option><option value="false">Inativo</option>`;
        }
    }
}

function aplicarFiltrosDinamicos() {
    let dados = [...listaVeiculosTela];
    const filtrosAtivos = [];

    document.querySelectorAll('.filter-row').forEach(linha => {
        const tipo = linha.querySelector('select:first-child').value;
        const inputTexto = linha.querySelector('input');
        const selectValor = linha.querySelector('select:last-of-type');
        
        let valor = (inputTexto.style.display !== 'none') ? inputTexto.value : selectValor.value;

        if (tipo && valor) {
            filtrosAtivos.push(tipo);
            dados = dados.filter(v => {
                const termo = valor.toLowerCase();
                if (tipo === 'placa') return v.placa.toLowerCase().includes(termo);
                if (tipo === 'marca') return v.marca.toLowerCase().includes(termo);
                if (tipo === 'modelo') return v.modelo.toLowerCase().includes(termo);
                if (tipo === 'ano') return v.ano_fab_mod && v.ano_fab_mod.includes(termo);
                if (tipo === 'tipo') return v.tipo_veiculo === valor;
                if (tipo === 'status') return String(v.ativo) === valor;
                
                // Filtro por capacidade exata vinda do select
                if (tipo === 'capacidade') return String(v.capacidade_tanque) === valor;
                
                return true;
            });
        }
    });

    const lblFiltros = document.getElementById('lbl-filtros-ativos');
    if(lblFiltros) {
        lblFiltros.innerText = filtrosAtivos.length > 0 
            ? `Filtros: ${filtrosAtivos.join(', ')}` 
            : 'Mostrando todos os registros';
    }

    atualizarTabelaVeiculos(dados);
}

// =============================================================================
// 5. UI: TABELA
// =============================================================================

function atualizarTabelaVeiculos(lista) {
    const tbody = document.getElementById('tbody-veiculos');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const lblContagem = document.getElementById('lbl-contagem-veiculos');
    if(lblContagem) lblContagem.innerHTML = `Total: <strong>${lista.length}</strong>`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center p-3">Nenhum veículo encontrado.</td></tr>';
        return;
    }

    lista.forEach(v => {
        const isAtivo = v.ativo === true;
        const classeBadge = isAtivo ? 'badge-ativo' : 'badge-inativo';
        const corIcone = isAtivo ? 'var(--cor-sucesso)' : '#ccc';
        const nomeUnidade = v.unidades ? v.unidades.nome : '-';
        
        // Exibe a capacidade formatada com 'L' ou '-' se for zero/nulo
        const capacidadeDisplay = v.capacidade_tanque ? parseFloat(v.capacidade_tanque).toLocaleString('pt-BR') + ' L' : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${v.placa}</b></td>
            <td>${v.marca}</td>
            <td>${v.modelo}</td>
            <td>${v.ano_fab_mod || '-'}</td>
            <td><span class="badge" style="background:#f0f0f0; color:#333;">${v.tipo_veiculo}</span></td>
            <td style="font-weight: bold; color: var(--cor-primaria);">${capacidadeDisplay}</td>
            <td>${nomeUnidade}</td>
            <td><span class="badge ${classeBadge}">${isAtivo ? 'ATIVO' : 'INATIVO'}</span></td>
            <td style="white-space: nowrap;">
                 <button class="action-btn" onclick="visualizarVeiculo('${v.id}')" title="Visualizar">
                    <i class="fas fa-eye" style="color: #003399;"></i>
                 </button>
                 <button class="action-btn" onclick="abrirModalLogsVeiculo('${v.id}')" title="Histórico">
                    <i class="fas fa-history"></i>
                 </button>
                 <button class="action-btn" onclick="abrirModalVeiculo('${v.id}')" title="Editar">
                    <i class="fas fa-edit"></i>
                 </button>
                 <button class="action-btn" onclick="alternarStatusVeiculo('${v.id}', ${isAtivo})" style="color:${corIcone}">
                    <i class="fas ${isAtivo ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                 </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// =============================================================================
// 6. MODAL E FUNÇÕES AUXILIARES
// =============================================================================

function visualizarVeiculo(id) {
    // Chama o modal passando o flag 'true' para ativar o modo somente leitura
    abrirModalVeiculo(id, true);
}

async function abrirModalVeiculo(id = null, readonly = false) {
    formVeiculoSujo = false;
    dadosOriginaisVeiculo = null;

    const modal = document.getElementById('modal-veiculo');
    const form = document.getElementById('form-veiculo');
    if (!form) return;

    // 1. RESET TOTAL
    form.reset();
    document.getElementById('vec-id').value = '';
    
    // Habilita tudo inicialmente
    form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = false);

    const btnSalvar = form.querySelector('button[type="submit"]');
    const btnCancel = form.querySelector('.btn-cancel');
    if (btnSalvar) {
        btnSalvar.style.display = 'block';
        btnSalvar.innerText = 'Salvar';
    }
    if (btnCancel) btnCancel.innerText = 'Cancelar';

    const titulo = document.getElementById('titulo-modal-veiculo');
    titulo.innerText = id ? 'Editar Veículo' : 'Novo Veículo';
    
    // Reset Visual
    document.getElementById('btn-tab-dinamica').style.display = 'none';
    document.getElementById('container-compartimentos').innerHTML = '';
    document.getElementById('txt-capacidade-total').innerText = '0 L';
    document.getElementById('lista-carretas-selecao').innerHTML = '';
    document.getElementById('div-eixo-config').style.display = 'none';
    document.getElementById('div-eixo-qtd').style.display = 'none';

    // Popula Unidades
    const selUnidade = document.getElementById('vec-unidade');
    selUnidade.innerHTML = '<option value="">Selecione...</option>';
    listaUnidadesVeiculo.forEach(u => selUnidade.innerHTML += `<option value="${u.id}">${u.nome}</option>`);

    if (id) {
        const v = listaVeiculosTela.find(x => x.id == id);
        if (v) {
            document.getElementById('vec-id').value = v.id;
            document.getElementById('vec-placa').value = v.placa;
            document.getElementById('vec-marca').value = v.marca;
            document.getElementById('vec-modelo').value = v.modelo;
            document.getElementById('vec-ano').value = v.ano_fab_mod;
            document.getElementById('vec-tipo').value = v.tipo_veiculo;
            document.getElementById('vec-km').value = v.km_atual || 0;
            document.getElementById('vec-obs').value = v.observacao || '';
            
            setTimeout(() => { if(selUnidade) selUnidade.value = v.unidade_id; }, 50);

            toggleCamposEixos();
            configurarAbasPorTipo();

            if (v.tipo_veiculo === 'Carreta') {
                document.getElementById('vec-eixo-input').value = v.eixos ? v.eixos.replace(/\D/g,'') : '';
            } else if (['Caminhão', 'Cavalo'].includes(v.tipo_veiculo)) {
                document.getElementById('vec-eixo-select').value = v.eixos;
            }

            if (v.compartimentos_json && Array.isArray(v.compartimentos_json)) {
                v.compartimentos_json.forEach(c => adicionarLinhaCompartimento(c));
                calcularCapacidadeTotal();
            }
            
            let carretasVinculadasIds = [];
            if (v.tipo_veiculo === 'Cavalo') {
                await carregarCarretasParaVinculo(v.id);
                document.querySelectorAll('.chk-carreta:checked').forEach(ch => carretasVinculadasIds.push(ch.value));
            }

            // --- CORREÇÃO AQUI: Chaves idênticas ao banco de dados ---
            dadosOriginaisVeiculo = {
                placa: v.placa, 
                marca: v.marca, 
                modelo: v.modelo,
                ano_fab_mod: v.ano_fab_mod, // Nome corrigido (antes era 'ano')
                tipo_veiculo: v.tipo_veiculo, // Nome corrigido (antes era 'tipo')
                eixos: v.eixos,
                km_atual: parseInt(v.km_atual || 0), 
                unidade_id: String(v.unidade_id), // Nome corrigido (antes era 'unidade')
                observacao: v.observacao || '',
                capacidade_tanque: parseFloat(v.capacidade_tanque || 0), // Adicionado
                // Campos especiais para comparação
                compartimentos_json: JSON.stringify(v.compartimentos_json || []),
                carretas_vinculadas: carretasVinculadasIds.sort().join(',') 
            };
        }
    } else {
        alternarAbaVeiculo('geral');
    }
    
    // MODO SOMENTE LEITURA
    if (readonly) {
        titulo.innerText = 'Detalhes do Veículo';
        if (btnSalvar) btnSalvar.style.display = 'none';
        if (btnCancel) btnCancel.innerText = 'Fechar';
        form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
        form.querySelectorAll('button:not(.btn-cancel)').forEach(el => el.disabled = true);
        document.querySelectorAll('.chk-carreta').forEach(chk => chk.disabled = true);
    }

    alternarAbaVeiculo('geral');
    modal.classList.add('active');
}

function fecharModalVeiculo(forçar = false) {
    const btnSalvar = document.querySelector('#form-veiculo button[type="submit"]');
    
    // Se o botão de salvar estiver oculto (modo visualização), permite fechar direto
    if(btnSalvar && btnSalvar.style.display === 'none') forçar = true;

    if (!forçar && formVeiculoSujo) {
        // Utiliza o modal de confirmação padrão do sistema
        window.solicitarConfirmacao(() => {
            executarFechamentoVeiculo();
        }, "Existem alterações não salvas (incluindo compartimentos do tanque). Deseja realmente sair?");
        return; 
    }

    executarFechamentoVeiculo();
}

function configurarFormularioVeiculo() {
    const form = document.getElementById('form-veiculo');
    if(!form) return;
    
    // Clona para limpar eventos anteriores e evitar duplicidade
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    
    // 1. OUVINTE DE SUBMISSÃO (SALVAR)
    newForm.addEventListener('submit', salvarVeiculo);
    
    // 2. OUVINTE DE ALTERAÇÕES (DETECÇÃO DE MUDANÇAS)
    // Monitora o formulário base e os compartimentos dinâmicos injetados
    newForm.addEventListener('input', (e) => {
        if (e.target.classList.contains('input-comp-cap') || e.target.closest('#form-veiculo')) {
            formVeiculoSujo = true;
        }
    });
    
    const inputAno = document.getElementById('vec-ano');
    if(inputAno) inputAno.addEventListener('input', aplicarMascaraAno);
}

function toggleCamposEixos() {
    const tipo = document.getElementById('vec-tipo').value;
    const divConfig = document.getElementById('div-eixo-config');
    const divQtd = document.getElementById('div-eixo-qtd');
    
    if(!divConfig || !divQtd) return;
    
    // Esconde tudo por padrão
    divConfig.style.display = 'none';
    divQtd.style.display = 'none';

    if (!tipo) return; // Se vazio, sai com tudo escondido

    if (['Caminhão', 'Cavalo'].includes(tipo)) {
        divConfig.style.display = 'block';
    } else if (tipo === 'Carreta') {
        divQtd.style.display = 'block';
    }
}

function aplicarMascaraAno(e) {
    let v = e.target.value.replace(/\D/g, "");
    if (v.length > 6) v = v.slice(0, 6);
    if (v.length > 4) v = v.replace(/^(\d{4})(\d)/, "$1/$2");
    e.target.value = v;
}

// =============================================================================
// 7. HISTÓRICO (LOGS) DETALHADO
// =============================================================================

async function abrirModalLogsVeiculo(id) {
    // 1. Busca lista de veiculos (ID e Placa) para traduzir os códigos no log
    const { data: listaVeiculos } = await clienteSupabase
        .from('veiculos')
        .select('id, placa')
        .order('placa');

    // 2. Monta o mapa de tradução
    // O campo 'carretas_vinculadas' usará essa lista para trocar ID por PLACA
    const mapaTraducao = {
        'unidade_id': listaUnidadesVeiculo, // Já existente
        'carretas_vinculadas': listaVeiculos ? listaVeiculos.map(v => ({ id: v.id, nome: v.placa })) : []
    };

    abrirModalLogsGlobal('veiculos', id, 'Histórico do Veículo', mapaTraducao);
}

function alternarAbaVeiculo(aba) {
    // 1. Esconde todas as abas
    const todasAbas = ['geral', 'tanque', 'carretas', 'obs'];
    todasAbas.forEach(nome => {
        const div = document.getElementById(`aba-${nome}`);
        if (div) div.style.display = 'none';
    });
    
    // 2. Reseta estilo de todos os botões
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.style.borderBottom = 'none';
        btn.style.color = '#888';
        btn.classList.remove('active');
    });

    // 3. Mostra a aba desejada
    const divAlvo = document.getElementById(`aba-${aba}`);
    if (divAlvo) divAlvo.style.display = 'block';

    // 4. Ativa o botão correspondente
    let btnId = '';
    if (aba === 'geral') btnId = 'btn-tab-geral';
    else if (aba === 'obs') btnId = 'btn-tab-obs';
    else btnId = 'btn-tab-dinamica'; // Serve tanto para Tanque quanto para Carretas

    const btnAlvo = document.getElementById(btnId);
    if (btnAlvo) {
        btnAlvo.style.borderBottom = '3px solid var(--cor-primaria)';
        btnAlvo.style.color = 'var(--cor-primaria)';
        btnAlvo.classList.add('active');
    }
}

function gerenciarAcessoAbaTanque() {
    const tipo = document.getElementById('vec-tipo').value;
    const btnTanque = document.getElementById('btn-tab-tanque');
    
    if (!btnTanque) return;

    // Tipos que NÃO possuem tanque de carga
    const bloqueado = (tipo === 'Automóvel' || tipo === 'Cavalo');

    if (bloqueado) {
        btnTanque.disabled = true;
        btnTanque.style.opacity = '0.3';
        btnTanque.style.cursor = 'not-allowed';
        btnTanque.title = "Indisponível para este tipo de veículo";
        
        // Se estiver na aba tanque e mudar o tipo para um bloqueado, volta para a geral
        const abaTanqueAtiva = document.getElementById('aba-tanque').style.display === 'block';
        if (abaTanqueAtiva) {
            alternarAbaVeiculo('geral');
        }
    } else {
        // LIBERA A ABA
        btnTanque.disabled = false;
        btnTanque.style.opacity = '1';
        btnTanque.style.cursor = 'pointer';
        btnTanque.title = "Capacidade do Tanque";
    }
}

function adicionarLinhaCompartimento(valor = '') {
    const container = document.getElementById('container-compartimentos');
    const index = container.children.length + 1;
    const div = document.createElement('div');
    
    // MANTÉM O VISUAL ORIGINAL (conforme image_809ec3.png)
    div.className = 'form-group compartment-row';
    div.style.cssText = 'display: flex; gap: 10px; margin-bottom: 8px; align-items: center;';
    
    div.innerHTML = `
        <span style="font-size: 12px; font-weight: bold; width: 60px;">Comp. ${index}</span>
        <input type="number" class="form-control input-comp-cap" value="${valor}" placeholder="Capacidade (L)" oninput="calcularCapacidadeTotal()" style="flex:1">
        <button type="button" onclick="this.parentElement.remove(); calcularCapacidadeTotal();" style="color:red; border:none; background:none; cursor:pointer;">
            <i class="fas fa-trash"></i>
        </button>
    `;
    
    container.appendChild(div);

    // --- NOVA MECÂNICA DE USABILIDADE ---
    const novoInput = div.querySelector('.input-comp-cap');
    if (novoInput) {
        // 1. Posiciona o cursor automaticamente no campo criado
        novoInput.focus();
        
        // 2. Teclar Enter dispara a adição do próximo compartimento
        novoInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault(); // Impede que o formulário principal seja enviado
                adicionarLinhaCompartimento(); // Chama a si mesma para criar a próxima linha
            }
        });
    }

    calcularCapacidadeTotal();
}

function calcularCapacidadeTotal() {
    let total = 0;
    document.querySelectorAll('.input-comp-cap').forEach(input => {
        total += parseFloat(input.value || 0);
    });
    const el = document.getElementById('txt-capacidade-total');
    if (el) el.innerText = total.toLocaleString('pt-BR') + ' L';
    return total;
}

// Função auxiliar para limpar o estado ao fechar
function executarFechamentoVeiculo() {
    const modal = document.getElementById('modal-veiculo');
    if (modal) modal.classList.remove('active');
    formVeiculoSujo = false;
    dadosOriginaisVeiculo = null;
}

async function carregarCarretasParaVinculo(cavaloIdAtual) {
    const container = document.getElementById('lista-carretas-selecao');
    // Limpa e exibe loading
    container.innerHTML = '<div style="text-align: center; color: #999; padding:20px; grid-column: 1/-1;"><i class="fas fa-spinner fa-spin"></i> Buscando carretas...</div>';
    
    // Reseta estilos inline antigos para usar o CSS Grid
    container.style.display = 'grid'; 
    container.className = 'grid-carretas'; // Aplica a classe CSS do Grid
    container.style.border = 'none'; // Remove borda do container antigo
    container.style.background = 'transparent';

    try {
        let query = clienteSupabase
            .from('veiculos')
            .select('id, placa, marca, modelo, cavalo_id') // Adicionei 'modelo' para ficar mais rico
            .eq('tipo_veiculo', 'Carreta')
            .eq('ativo', true)
            .order('placa');

        const { data, error } = await query;
        if (error) throw error;

        container.innerHTML = '';
        
        if (!data || data.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#777; grid-column: 1/-1;">Nenhuma carreta cadastrada ou ativa.</div>';
            return;
        }

        // FILTRO: Carretas LIVRES ou MINHAS
        const disponiveis = data.filter(c => 
            c.cavalo_id === null || 
            (cavaloIdAtual && String(c.cavalo_id) === String(cavaloIdAtual))
        );

        if (disponiveis.length === 0) {
            container.innerHTML = '<div style="padding:10px; color:#777; grid-column: 1/-1;">Todas as carretas estão em uso.</div>';
            return;
        }

        disponiveis.forEach(c => {
            const isChecked = (cavaloIdAtual && String(c.cavalo_id) === String(cavaloIdAtual));
            
            // Cria o Card (Label)
            const label = document.createElement('label');
            label.className = `card-carreta-option ${isChecked ? 'selected' : ''}`;
            
            label.innerHTML = `
                <input type="checkbox" class="chk-carreta" value="${c.id}" ${isChecked ? 'checked' : ''} style="margin-top: 3px;">
                <div class="card-carreta-info">
                    <strong>${c.placa}</strong>
                    <span>${c.modelo || c.marca || 'Sem modelo'}</span>
                </div>
            `;
            
            // Evento para alternar a cor azul visualmente
            const checkbox = label.querySelector('input');
            checkbox.addEventListener('change', function() {
                formVeiculoSujo = true;
                if (this.checked) {
                    label.classList.add('selected');
                } else {
                    label.classList.remove('selected');
                }
            });

            container.appendChild(label);
        });

    } catch (e) {
        console.error(e);
        container.style.display = 'block'; // Volta ao normal para exibir erro
        container.innerHTML = '<div style="color:red; padding:10px;">Erro ao carregar carretas.</div>';
    }
}

function configurarAbasPorTipo() {
    const tipo = document.getElementById('vec-tipo').value;
    const btnDinamico = document.getElementById('btn-tab-dinamica');
    
    // Se não tiver tipo selecionado (Novo Veículo), esconde a aba extra
    if (!tipo) {
        btnDinamico.style.display = 'none';
        toggleCamposEixos();
        return;
    }

    if (tipo === 'Cavalo') {
        btnDinamico.innerText = 'Carreta(s)';
        btnDinamico.style.display = 'block';
        
        // Carrega a lista se necessário
        const idAtual = document.getElementById('vec-id').value;
        const listaTemItens = document.getElementById('lista-carretas-selecao').children.length > 0;
        
        if (!listaTemItens) {
            carregarCarretasParaVinculo(idAtual);
        }

    } else if (['Caminhão', 'Carreta'].includes(tipo)) {
        btnDinamico.innerText = 'Tanque';
        btnDinamico.style.display = 'block';
    } else {
        // Automóvel
        btnDinamico.style.display = 'none';
        // Se estava na aba que sumiu, volta para a geral
        const abaDinamicaVisivel = document.getElementById('aba-tanque').style.display === 'block' || 
                                   document.getElementById('aba-carretas').style.display === 'block';
        if (abaDinamicaVisivel) {
            alternarAbaVeiculo('geral');
        }
    }
    
    toggleCamposEixos(); 
}

function tratarCliqueSegundaAba() {
    const texto = document.getElementById('btn-tab-dinamica').innerText;
    // Redireciona para a div correta baseada no texto do botão
    if (texto.includes('Carreta')) {
        alternarAbaVeiculo('carretas');
    } else {
        alternarAbaVeiculo('tanque');
    }
}