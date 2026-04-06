// admin/js/premiacoes.js

// =============================================================================
// VARIÁVEIS GLOBAIS
// =============================================================================
let listaPremiacoes = [];
let listaUnidadesPrem = [];
let formPremSujo = false;

// Estado temporário (Itens)
let tempTopicos = [];
let indexTopicoEdicao = null; // null = novo, numero = editando
let indexExclusao = null;

let dadosOriginaisPremiacao = null;

// =============================================================================
// 1. INICIALIZAÇÃO
// =============================================================================

function inicializarPremiacoes(unidadeId) {
    document.getElementById('titulo-pagina').innerText = 'Políticas de Premiações';
    
    configurarFormularioPremiacao();
    carregarUnidadesPrem();
    
    // Passa o filtro do rodapé para a listagem
    listarPremiacoes(unidadeId);

    // --- VINCULA O INPUT DE BUSCA (Texto) ---
    const inputBusca = document.getElementById('input-busca');
    if (inputBusca) {
        const novoInput = inputBusca.cloneNode(true);
        inputBusca.parentNode.replaceChild(novoInput, inputBusca);
        
        novoInput.placeholder = "Buscar por título ou unidade...";
        novoInput.value = ''; 
        
        novoInput.addEventListener('keyup', (e) => {
            filtrarPremiacoes(e.target.value);
        });
    }
}

// --- DADOS ---

async function carregarUnidadesPrem() {
    const { data } = await clienteSupabase.from('unidades').select('id, nome').eq('ativo', true).order('nome');
    listaUnidadesPrem = data || [];
    
    const sel = document.getElementById('prem-unidade');
    if(sel) {
        sel.innerHTML = '<option value="">Selecione...</option>';
        listaUnidadesPrem.forEach(u => {
            sel.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
        });
    }
}

async function listarPremiacoes(unidadeId = null) {
    const tbody = document.getElementById('tbody-premiacoes');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        // Fallback para pegar do select se não vier por parâmetro
        if (!unidadeId) {
            unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
        }

        let query = clienteSupabase
            .from('premiacoes')
            .select('*, unidades(nome)')
            .order('id', { ascending: false });

        // --- FILTRO DE UNIDADE (SERVER-SIDE) ---
        if (unidadeId !== "TODAS" && unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const { data, error } = await query;
        if (error) throw error;
        
        // Busca itens para contagem (de todas as premiações para simplificar, ou poderia filtrar)
        const { data: itens } = await clienteSupabase.from('premiacoes_itens').select('premiacao_id');
        
        // Prepara a lista global já com a contagem de itens injetada
        listaPremiacoes = (data || []).map(p => {
            const qtd = itens ? itens.filter(i => i.premiacao_id === p.id).length : 0;
            return { ...p, qtd_itens_calc: qtd }; // Salvamos a qtd calculada
        });

        // Chama a renderização separada
        atualizarTabelaPremiacoes(listaPremiacoes);

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao carregar lista.", "error");
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
    }
}

// =============================================================================
// 2. MODAL PRINCIPAL
// =============================================================================

async function abrirModalPremiacao(id = null) {
    formPremSujo = false;
    dadosOriginaisPremiacao = null; // Reseta snapshot
    
    const modal = document.getElementById('modal-premiacao');
    const form = document.getElementById('form-premiacao');
    form.reset();
    document.getElementById('prem-id').value = '';
    tempTopicos = [];

    habilitarCamposPrem(true);

    if (id) {
        document.getElementById('titulo-modal-prem').innerText = 'Editar Premiação';
        const p = listaPremiacoes.find(x => x.id == id);
        if (p) {
            document.getElementById('prem-id').value = p.id;
            setTimeout(() => { document.getElementById('prem-unidade').value = p.unidade_id; }, 50);
            document.getElementById('prem-titulo').value = p.titulo;
            
            // Formata valor para 2 casas decimais (padrão do input)
            const valFmt = parseFloat(p.valor_maximo || 0).toFixed(2);
            document.getElementById('prem-valor').value = valFmt;
            
            // Carrega Itens
            const { data: itens } = await clienteSupabase.from('premiacoes_itens').select('*').eq('premiacao_id', id).order('ordem');
            tempTopicos = itens || [];

            // --- CORREÇÃO: Salva estado original para validação ---
            dadosOriginaisPremiacao = {
                unidade: String(p.unidade_id),
                titulo: p.titulo,
                valor: valFmt,
                itens: JSON.stringify(tempTopicos) // Salva a estrutura dos itens como string
            };
        }
    } else {
        document.getElementById('titulo-modal-prem').innerText = 'Nova Premiação';
        document.getElementById('prem-valor').value = "0.00";
    }

    // Renderiza com delay para garantir que o valor total esteja no input para cálculo
    setTimeout(() => renderizarTopicos(), 100);
    mudarAbaPrem('tab-dados');
    modal.classList.add('active');
}
function visualizarPremiacao(id) {
    abrirModalPremiacao(id);
    document.getElementById('titulo-modal-prem').innerText = 'Visualizar Premiação';
    habilitarCamposPrem(false);
}

function habilitarCamposPrem(ativo) {
    const form = document.getElementById('form-premiacao');
    form.querySelectorAll('input, select').forEach(el => el.disabled = !ativo);
    
    const btnSalvar = document.getElementById('btn-salvar-prem');
    if(btnSalvar) btnSalvar.style.display = ativo ? 'block' : 'none';
    
    document.querySelectorAll('.btn-action-tab').forEach(el => el.style.display = ativo ? 'flex' : 'none');

    if(!ativo) form.classList.add('modo-visualizacao');
    else form.classList.remove('modo-visualizacao');
}

function mudarAbaPrem(abaId) {
    document.querySelectorAll('.tab-content').forEach(el => {
        el.style.display = 'none';
        el.style.removeProperty('display'); 
        el.style.display = 'none';
    });
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const aba = document.getElementById(abaId);
    if(abaId === 'tab-itens') aba.style.display = 'flex';
    else aba.style.display = 'block';

    const index = abaId === 'tab-dados' ? 0 : 1;
    document.querySelectorAll('.tab-btn')[index].classList.add('active');
    
    // Se mudou para itens, re-renderiza para atualizar os valores $$ caso o valor total tenha mudado
    if(abaId === 'tab-itens') {
        renderizarTopicos();
    }
}

// =============================================================================
// 3. GERENCIAMENTO DE ITENS (TÓPICOS) E CÁLCULO
// =============================================================================

function renderizarTopicos() {
    const container = document.getElementById('lista-topicos-container');
    container.innerHTML = '';
    const isVis = document.getElementById('form-premiacao').classList.contains('modo-visualizacao');

    if (tempTopicos.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">Nenhum tópico cadastrado.</p>';
        return;
    }

    // CÁLCULO DE VALORES
    // 1. Pega valor total do input
    const valorTotalStr = document.getElementById('prem-valor').value;
    const valorTotal = parseFloat(valorTotalStr) || 0;

    // 2. Soma os pesos
    const somaPesos = tempTopicos.reduce((acc, t) => acc + (parseInt(t.peso) || 0), 0);

    tempTopicos.forEach((t, idx) => {
        // 3. Calcula valor proporcional
        const peso = parseInt(t.peso) || 0;
        let valorItem = 0;
        let percentual = 0;

        if (somaPesos > 0) {
            percentual = (peso / somaPesos) * 100;
            valorItem = (peso / somaPesos) * valorTotal;
        }

        const valorFmt = valorItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const pctFmt = percentual.toFixed(1) + '%';

        const div = document.createElement('div');
        div.className = 'topico-row';
        
        let botoes = '';
        if (!isVis) {
            botoes = `
                <div style="display:flex; gap:5px;">
                    <button type="button" class="action-btn" onclick="editarTopico(${idx})" title="Editar"><i class="fas fa-pencil-alt" style="color:#003399;"></i></button>
                    <button type="button" class="btn-remove-filter" onclick="solicitarExclusaoTopico(${idx})" title="Excluir"><i class="fas fa-trash"></i></button>
                </div>
            `;
        }

        div.innerHTML = `
            <div style="flex:1;">
                <div class="topico-info" style="display:flex; justify-content:space-between; align-items:center; padding-right:15px;">
                    <b>${t.topico}</b>
                    <span style="color:#28a745; font-weight:bold; font-size:13px;">${valorFmt}</span>
                </div>
                <div class="topico-meta">
                    <span class="meta-tag">Tolerância: ${t.tolerancia}x</span>
                    <span class="meta-tag">${pctFmt}</span> </div>
            </div>
            ${botoes}
        `;
        container.appendChild(div);
    });
}

function abrirModalTopico() {
    indexTopicoEdicao = null;
    document.getElementById('top-nome').value = '';
    document.getElementById('top-tolerancia').value = '0';
    document.getElementById('top-peso').value = '1';
    
    document.getElementById('modal-topico').classList.add('active');
    setTimeout(() => document.getElementById('top-nome').focus(), 100);
}

function editarTopico(index) {
    indexTopicoEdicao = index;
    const t = tempTopicos[index];
    document.getElementById('top-nome').value = t.topico;
    document.getElementById('top-tolerancia').value = t.tolerancia;
    document.getElementById('top-peso').value = t.peso;
    document.getElementById('modal-topico').classList.add('active');
}

function fecharModalTopico() {
    document.getElementById('modal-topico').classList.remove('active');
}

function confirmarTopico() {
    const nome = document.getElementById('top-nome').value.trim();
    if(!nome) { alert("Informe o nome do tópico."); return; }

    const obj = {
        topico: nome,
        tolerancia: parseInt(document.getElementById('top-tolerancia').value || 0),
        peso: parseInt(document.getElementById('top-peso').value || 1)
    };

    if (indexTopicoEdicao !== null) {
        const idOrig = tempTopicos[indexTopicoEdicao].id; 
        tempTopicos[indexTopicoEdicao] = { ...obj, id: idOrig };
    } else {
        tempTopicos.push({ ...obj, id: `temp_${Date.now()}` });
    }

    renderizarTopicos();
    formPremSujo = true;
    fecharModalTopico();
}

function solicitarExclusaoTopico(index) {
    indexExclusao = index;
    document.getElementById('modal-exclusao-prem').classList.add('active');
}

function fecharModalExclusaoPrem() {
    document.getElementById('modal-exclusao-prem').classList.remove('active');
    indexExclusao = null;
}

function confirmarExclusaoTopico() {
    if (indexExclusao !== null) {
        tempTopicos.splice(indexExclusao, 1);
        renderizarTopicos();
        formPremSujo = true;
    }
    fecharModalExclusaoPrem();
}

// =============================================================================
// 4. SALVAR COMPLETO COM SNAPSHOT (DIFF)
// =============================================================================

async function salvarPremiacaoCompleta(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-salvar-prem');
    
    // Coleta dados atuais
    const id = document.getElementById('prem-id').value;
    const unidadeId = document.getElementById('prem-unidade').value;
    const titulo = document.getElementById('prem-titulo').value;
    const valor = document.getElementById('prem-valor').value; 
    
    // Validação de Alteração
    if (id && dadosOriginaisPremiacao) {
        const itensAtuaisJson = JSON.stringify(tempTopicos);

        const nadaMudou = (
            unidadeId === dadosOriginaisPremiacao.unidade &&
            titulo === dadosOriginaisPremiacao.titulo &&
            valor === dadosOriginaisPremiacao.valor &&
            itensAtuaisJson === dadosOriginaisPremiacao.itens
        );

        if (nadaMudou) {
            mostrarToast("Nenhuma alteração detectada.", "warning");
            return;
        }
    }

    const txtOriginal = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    try {
        const dadosMestre = {
            unidade_id: unidadeId,
            titulo: titulo,
            valor_maximo: parseFloat(valor) || 0
        };

        // --- 1. CAPTURA O ESTADO ANTIGO (LOG) ---
        let snapshotAntigo = null;
        let idsItensBanco = [];

        if(id) {
            const { data: mAntigo } = await clienteSupabase.from('premiacoes').select('*, unidades(nome)').eq('id', id).single();
            const { data: iAntigo } = await clienteSupabase.from('premiacoes_itens').select('*').eq('premiacao_id', id);
            
            if(mAntigo) {
                snapshotAntigo = { mestre: mAntigo, itens: iAntigo || [] };
                idsItensBanco = (iAntigo || []).map(i => i.id);
            }
        }

        let finalId = id;

        // 2. Atualiza ou Cria o Mestre (Cabeçalho)
        if(id) {
            const { error } = await clienteSupabase.from('premiacoes').update(dadosMestre).eq('id', id);
            if(error) throw error;
        } else {
            const { data, error } = await clienteSupabase.from('premiacoes').insert([dadosMestre]).select();
            if(error) throw error;
            finalId = data[0].id;
        }

        // =====================================================================
        // 3. SINCRONIZAÇÃO DE ITENS (Diff Inteligente)
        // =====================================================================

        // A. Identifica IDs da tela (ignorando os temporários "temp_")
        const idsItensTela = tempTopicos
            .filter(t => t.id && !String(t.id).startsWith('temp_'))
            .map(t => parseInt(t.id));

        // B. Identifica o que foi removido (Estava no banco e não está na tela)
        const idsParaRemover = idsItensBanco.filter(idBanco => !idsItensTela.includes(idBanco));

        if (idsParaRemover.length > 0) {
            const { error: errDel } = await clienteSupabase.from('premiacoes_itens').delete().in('id', idsParaRemover);
            
            if (errDel) {
                // Tratamento amigável para erro de chave estrangeira
                if (errDel.code === '23503') { 
                    throw new Error("Não foi possível excluir alguns tópicos pois já existem apurações vinculadas a eles. Apenas edições e adições foram salvas.");
                }
                throw errDel;
            }
        }

        // C. Upsert (Inserir ou Atualizar)
        for (let i = 0; i < tempTopicos.length; i++) {
            const t = tempTopicos[i];
            const isNew = String(t.id).startsWith('temp_');

            const payload = {
                premiacao_id: finalId,
                topico: t.topico,
                tolerancia: t.tolerancia,
                peso: t.peso,
                ordem: i
            };

            if (isNew) {
                // INSERT
                const { error } = await clienteSupabase.from('premiacoes_itens').insert([payload]);
                if(error) throw error;
            } else {
                // UPDATE
                const { error } = await clienteSupabase.from('premiacoes_itens').update(payload).eq('id', t.id);
                if(error) throw error;
            }
        }

        // --- 4. PREPARA LOG DETALHADO ---
        const snapshotNovo = { mestre: dadosMestre, itens: tempTopicos };
        const uObj = listaUnidadesPrem.find(u => u.id == dadosMestre.unidade_id);
        if(uObj) snapshotNovo.mestre.nome_unidade_visual = uObj.nome;

        const user = (await clienteSupabase.auth.getUser()).data.user;
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'premiacoes',
            acao: id ? 'UPDATE' : 'INSERT',
            id_registro_afetado: finalId,
            usuario_id: user?.id,
            dados_antigos: snapshotAntigo ? JSON.stringify(snapshotAntigo) : null,
            dados_novos: JSON.stringify(snapshotNovo),
            data_hora: new Date().toISOString()
        }]);

        mostrarToast("Premiação salva com sucesso!", "success");
        fecharModalPremiacao(true);
        listarPremiacoes();

    } catch (err) {
        console.error(err);
        mostrarToast("Erro: " + err.message, "error");
    } finally {
        btn.innerText = txtOriginal;
        btn.disabled = false;
    }
}

async function alternarStatusPrem(id, statusAtual) {
    await clienteSupabase.from('premiacoes').update({ ativo: !statusAtual }).eq('id', id);
    // Log Simples
    const user = (await clienteSupabase.auth.getUser()).data.user;
    await clienteSupabase.from('logs_auditoria').insert([{
        tabela_afetada: 'premiacoes', acao: 'UPDATE_STATUS', id_registro_afetado: id, 
        usuario_id: user?.id, dados_novos: JSON.stringify({ ativo: !statusAtual })
    }]);
    listarPremiacoes();
}

function fecharModalPremiacao(force = false) {
    const isVis = document.getElementById('form-premiacao').classList.contains('modo-visualizacao');
    if (isVis) force = true;

    if(!force && formPremSujo) {
        solicitarConfirmacao(() => fecharModalPremiacao(true));
        return;
    }
    document.getElementById('modal-premiacao').classList.remove('active');
    formPremSujo = false;
}

function configurarFormularioPremiacao() {
    const form = document.getElementById('form-premiacao');
    if(!form) return;
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener('submit', salvarPremiacaoCompleta);
    
    newForm.querySelectorAll('input, select').forEach(el => el.addEventListener('change', () => formPremSujo = true));

    // Formatação e recálculo ao sair do campo de valor
    const inputValor = document.getElementById('prem-valor');
    if(inputValor) {
        inputValor.addEventListener('blur', function() {
            if(this.value) this.value = parseFloat(this.value).toFixed(2);
            else this.value = "0.00";
            // Força re-renderizar tópicos para atualizar os valores em R$ nos cards
            renderizarTopicos(); 
        });
    }
}

// =============================================================================
// 5. HISTÓRICO DETALHADO (DIFF)
// =============================================================================

async function abrirModalLogsPrem(idRegistro) {
    const modal = document.getElementById('modal-logs');
    const container = document.getElementById('timeline-logs');
    document.getElementById('titulo-modal-logs').innerText = 'Histórico da Premiação';
    
    container.innerHTML = '<div style="text-align:center; padding:20px"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';
    modal.classList.add('active');

    try {
        const { data: logs } = await clienteSupabase.from('logs_auditoria')
            .select('*, perfis(nome_completo)').eq('tabela_afetada', 'premiacoes').eq('id_registro_afetado', idRegistro).order('data_hora', { ascending: false });

        container.innerHTML = '';
        if(!logs || logs.length === 0) { container.innerHTML = '<p style="text-align:center;">Sem histórico.</p>'; return; }

        logs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'log-item';
            const nomeUser = log.perfis ? log.perfis.nome_completo : 'Sistema';
            const dataFmt = new Date(log.data_hora).toLocaleString('pt-BR');
            
            let diff = '';
            if (log.acao === 'INSERT') diff = '<div class="log-diff" style="color:green">Política criada.</div>';
            else if (log.acao === 'UPDATE') diff = gerarDiffPrem(log.dados_antigos, log.dados_novos);
            else if (log.acao === 'UPDATE_STATUS') {
                const s = JSON.parse(log.dados_novos).ativo ? 'ATIVO' : 'INATIVO';
                diff = `<div class="log-diff">Alterou status para <b>${s}</b></div>`;
            }

            item.innerHTML = `
                <div class="log-header">${dataFmt} por <span style="color:#003399">${nomeUser}</span></div>
                <div class="log-action">${log.acao === 'UPDATE_STATUS' ? 'Alteração de Status' : (log.acao === 'INSERT' ? 'Criação' : 'Edição')}</div>
                ${diff}
            `;
            container.appendChild(item);
        });
    } catch(e){ console.error(e); }
}

function gerarDiffPrem(antigoStr, novoStr) {
    if(!antigoStr || !novoStr) return '<div class="log-diff text-muted">Detalhes indisponíveis.</div>';
    const ant = JSON.parse(antigoStr);
    const nov = JSON.parse(novoStr);
    let html = '';

    const fmt = (v) => parseFloat(v||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

    // 1. Mestre
    if(ant.mestre.titulo !== nov.mestre.titulo) 
        html += `<div class="log-diff"><b>Título:</b> ${ant.mestre.titulo} <i class="fas fa-arrow-right"></i> <b>${nov.mestre.titulo}</b></div>`;
    
    if(parseFloat(ant.mestre.valor_maximo) !== parseFloat(nov.mestre.valor_maximo)) 
        html += `<div class="log-diff"><b>Valor:</b> ${fmt(ant.mestre.valor_maximo)} <i class="fas fa-arrow-right"></i> <b>${fmt(nov.mestre.valor_maximo)}</b></div>`;

    // Nome Unidade (usando o campo visual que injetamos ou o ID)
    const uAnt = ant.mestre.nome_unidade_visual || ant.mestre.unidades?.nome || ant.mestre.unidade_id;
    const uNov = nov.mestre.nome_unidade_visual || nov.mestre.unidade_id;
    if(ant.mestre.unidade_id != nov.mestre.unidade_id)
        html += `<div class="log-diff"><b>Unidade:</b> ${uAnt} <i class="fas fa-arrow-right"></i> <b>${uNov}</b></div>`;

    // 2. Itens (Comparação por Nome do Tópico)
    const antItens = ant.itens || [];
    const novItens = nov.itens || [];

    // Adicionados
    novItens.forEach(nItem => {
        const existe = antItens.find(a => a.topico === nItem.topico);
        if(!existe) {
            html += `<div class="log-diff" style="color:green">+ Tópico: <b>${nItem.topico}</b> (Peso: ${nItem.peso})</div>`;
        } else {
            // Modificados (se nome igual)
            if(nItem.peso != existe.peso || nItem.tolerancia != existe.tolerancia) {
                html += `<div class="log-diff"><b>${nItem.topico}:</b> Alterado (Peso: ${existe.peso}->${nItem.peso}, Tol: ${existe.tolerancia}->${nItem.tolerancia})</div>`;
            }
        }
    });

    // Removidos
    antItens.forEach(aItem => {
        const existe = novItens.find(n => n.topico === aItem.topico);
        if(!existe) {
            html += `<div class="log-diff" style="color:red">- Tópico removido: <b>${aItem.topico}</b></div>`;
        }
    });

    return html || '<div class="log-diff text-muted">Sem alterações visíveis.</div>';
}

function atualizarTabelaPremiacoes(lista) {
    const tbody = document.getElementById('tbody-premiacoes');
    tbody.innerHTML = '';
    
    // Atualiza contador (se houver elemento na tela)
    // document.getElementById('lbl-contagem')?.innerHTML = `Total: <strong>${lista.length}</strong>`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3">Nenhum registro encontrado.</td></tr>';
        return;
    }

    lista.forEach(p => {
        // Usa a quantidade que calculamos no listarPremiacoes
        const qtd = p.qtd_itens_calc !== undefined ? p.qtd_itens_calc : '-';
        
        const isAtivo = p.ativo === true;
        const classeBadge = isAtivo ? 'badge-ativo' : 'badge-inativo';
        const corIcone = isAtivo ? 'var(--cor-sucesso)' : '#ccc';
        const nomeUnidade = p.unidades ? p.unidades.nome : 'Unidade Removida';
        
        const fmt = (v) => parseFloat(v||0).toLocaleString('pt-BR', {style:'currency', currency:'BRL'});

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${nomeUnidade}</b></td>
            <td>${p.titulo}</td>
            <td>${fmt(p.valor_maximo)}</td>
            <td><span class="badge badge-coord">${qtd} Itens</span></td>
            <td><span class="badge ${classeBadge}">${isAtivo ? 'ATIVO' : 'INATIVO'}</span></td>
            <td style="white-space: nowrap;">
                <button class="action-btn" onclick="visualizarPremiacao('${p.id}')" title="Visualizar"><i class="fas fa-eye" style="color: #003399;"></i></button>
                <button class="action-btn" onclick="abrirModalLogsPrem('${p.id}')" title="Histórico"><i class="fas fa-history"></i></button>
                <button class="action-btn" onclick="abrirModalPremiacao('${p.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="action-btn" onclick="alternarStatusPrem('${p.id}', ${isAtivo})" style="color:${corIcone}"><i class="fas ${isAtivo ? 'fa-toggle-on' : 'fa-toggle-off'}"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarPremiacoes(texto) {
    const termo = texto.toLowerCase();
    
    const filtrados = listaPremiacoes.filter(p => {
        const titulo = p.titulo ? p.titulo.toLowerCase() : '';
        const unidade = p.unidades && p.unidades.nome ? p.unidades.nome.toLowerCase() : '';
        
        return titulo.includes(termo) || unidade.includes(termo);
    });
    
    atualizarTabelaPremiacoes(filtrados);
}