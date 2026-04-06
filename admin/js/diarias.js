// admin/js/diarias.js

let listaDiarias = [];
let listaUnidadesDiarias = []; 
let formDiariaSujo = false;
let dadosOriginaisDiaria = null;

function inicializarDiarias(unidadeId) {
    document.getElementById('titulo-pagina').innerText = 'Valores de Diárias, Refeição e Alimentação (CCT)';
    
    configurarFormularioDiaria();
    carregarUnidadesSelect(); 
    
    // Passamos o ID recebido (do rodapé) para a listagem
    listarDiarias(unidadeId);

    // VINCULA O INPUT DE BUSCA (Texto)
    const inputBusca = document.getElementById('input-busca');
    if (inputBusca) {
        const novoInput = inputBusca.cloneNode(true);
        inputBusca.parentNode.replaceChild(novoInput, inputBusca);
        novoInput.placeholder = "Buscar por unidade...";
        novoInput.value = ''; 
        novoInput.addEventListener('keyup', (e) => filtrarDiarias(e.target.value));
    }
}

// --- DADOS ---

async function carregarUnidadesSelect() {
    const { data } = await clienteSupabase.from('unidades').select('id, nome').eq('ativo', true).order('nome');
    listaUnidadesDiarias = data || [];
    
    const sel = document.getElementById('dia-unidade');
    if(sel) {
        sel.innerHTML = '<option value="">Selecione a Unidade...</option>';
        listaUnidadesDiarias.forEach(u => {
            sel.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
        });
    }
}

async function listarDiarias(unidadeId = null) {
    const tbody = document.getElementById('tbody-diarias');
    if(!tbody) return;
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        // Se não veio por parâmetro, tenta pegar do seletor do rodapé como fallback
        if (!unidadeId) {
            unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
        }

        let query = clienteSupabase
            .from('valores_diarias')
            .select('*, unidades(nome)')
            .order('unidade_id');

        // --- CORREÇÃO: APLICA O FILTRO DO RODAPÉ ---
        if (unidadeId !== "TODAS" && unidadeId) {
            query = query.eq('unidade_id', unidadeId);
        }

        const { data, error } = await query;

        if (error) throw error;
        listaDiarias = data || [];
        atualizarTabelaDiarias(listaDiarias);

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao carregar valores.", "error");
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Erro ao carregar dados.</td></tr>';
    }
}

function atualizarTabelaDiarias(lista) {
    const tbody = document.getElementById('tbody-diarias');
    if(!tbody) return;
    tbody.innerHTML = '';
    document.getElementById('lbl-contagem-diarias').innerHTML = `Total: <strong>${lista.length}</strong>`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center p-3">Nenhum registro encontrado.</td></tr>';
        return;
    }

    lista.forEach(d => {
        const isAtivo = d.ativo === true;
        const classeBadge = isAtivo ? 'badge-ativo' : 'badge-inativo';
        const corIcone = isAtivo ? 'var(--cor-sucesso)' : '#ccc';
        const nomeUnidade = d.unidades ? d.unidades.nome : 'Unidade excluída';

        const fmt = (v) => v ? parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '-';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${nomeUnidade}</b></td>
            <td>${fmt(d.valor_refeicao)}</td>
            <td>${fmt(d.valor_jantar)}</td>
            <td>${fmt(d.valor_diaria)}</td>
            <td>${fmt(d.valor_alimentacao)}</td> <td><span class="badge ${classeBadge}">${isAtivo ? 'ATIVO' : 'INATIVO'}</span></td>
            <td style="white-space: nowrap;">
                <button class="action-btn" onclick="visualizarDiaria('${d.id}')" title="Visualizar"><i class="fas fa-eye" style="color: #003399;"></i></button>
                <button class="action-btn" onclick="abrirModalLogsDiaria('${d.id}')" title="Histórico"><i class="fas fa-history"></i></button>
                <button class="action-btn" onclick="abrirModalDiaria('${d.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="action-btn" onclick="alternarStatusDiaria('${d.id}', ${isAtivo})" style="color:${corIcone}"><i class="fas ${isAtivo ? 'fa-toggle-on' : 'fa-toggle-off'}"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarDiarias(texto) {
    const termo = texto.toLowerCase();
    const filtrados = listaDiarias.filter(d =>
        (d.unidades && d.unidades.nome.toLowerCase().includes(termo))
    );
    atualizarTabelaDiarias(filtrados);
}

// --- MODAL, SALVAR E VISUALIZAR ---

function visualizarDiaria(id) {
    abrirModalDiaria(id);
    document.getElementById('titulo-modal-diaria').innerText = 'Visualizar Valor';
    const form = document.getElementById('form-diaria');
    form.querySelectorAll('input, select').forEach(el => el.disabled = true);
    
    const btnSalvar = form.querySelector('button[type="submit"]');
    if(btnSalvar) btnSalvar.style.display = 'none';
    
    const btnCancel = form.querySelector('.btn-cancel');
    btnCancel.innerText = 'Fechar';
    
    form.classList.add('modo-visualizacao');
}

function abrirModalDiaria(id = null) {
    formDiariaSujo = false;
    dadosOriginaisDiaria = null; 
    
    const modal = document.getElementById('modal-diaria');
    const form = document.getElementById('form-diaria');
    form.reset();
    document.getElementById('dia-id').value = '';
    
    form.classList.remove('modo-visualizacao');
    form.querySelectorAll('input, select').forEach(el => el.disabled = false);
    
    const btnSalvar = form.querySelector('button[type="submit"]');
    if(btnSalvar) btnSalvar.style.display = 'block';
    form.querySelector('.btn-cancel').innerText = 'Cancelar';

    if (id) {
        document.getElementById('titulo-modal-diaria').innerText = 'Editar Valor';
        const d = listaDiarias.find(x => x.id == id);
        if (d) {
            document.getElementById('dia-id').value = d.id;
            setTimeout(() => { document.getElementById('dia-unidade').value = d.unidade_id; }, 50);
            
            const valRef = parseFloat(d.valor_refeicao || 0).toFixed(2);
            const valJan = parseFloat(d.valor_jantar || 0).toFixed(2);
            const valDia = parseFloat(d.valor_diaria || 0).toFixed(2);
            const valAli = parseFloat(d.valor_alimentacao || 0).toFixed(2); // NOVO CAMPO

            document.getElementById('dia-vlr-refeicao').value = valRef;
            document.getElementById('dia-vlr-jantar').value = valJan;
            document.getElementById('dia-vlr-diaria').value = valDia;
            document.getElementById('dia-vlr-alimentacao').value = valAli; // NOVO CAMPO

            dadosOriginaisDiaria = {
                unidade: String(d.unidade_id),
                refeicao: valRef,
                jantar: valJan,
                diaria: valDia,
                alimentacao: valAli // NOVO CAMPO
            };
        }
    } else {
        document.getElementById('titulo-modal-diaria').innerText = 'Novo Valor CCT';
        document.getElementById('dia-vlr-refeicao').value = "0.00";
        document.getElementById('dia-vlr-jantar').value = "0.00";
        document.getElementById('dia-vlr-diaria').value = "0.00";
        document.getElementById('dia-vlr-alimentacao').value = "0.00"; // NOVO CAMPO
    }
    modal.classList.add('active');
}

async function salvarDiaria(e) {
    e.preventDefault();
    const btn = e.submitter;
    
    if(btn.style.display === 'none') return;

    const id = document.getElementById('dia-id').value;
    const unidadeId = document.getElementById('dia-unidade').value;
    
    const vRef = parseFloat(document.getElementById('dia-vlr-refeicao').value || 0).toFixed(2);
    const vJan = parseFloat(document.getElementById('dia-vlr-jantar').value || 0).toFixed(2);
    const vDia = parseFloat(document.getElementById('dia-vlr-diaria').value || 0).toFixed(2);
    const vAli = parseFloat(document.getElementById('dia-vlr-alimentacao').value || 0).toFixed(2); // NOVO CAMPO

    if (id && dadosOriginaisDiaria) {
        const nadaMudou = (
            unidadeId === dadosOriginaisDiaria.unidade &&
            vRef === dadosOriginaisDiaria.refeicao &&
            vJan === dadosOriginaisDiaria.jantar &&
            vDia === dadosOriginaisDiaria.diaria &&
            vAli === dadosOriginaisDiaria.alimentacao // NOVO CAMPO
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
        const dadosNovos = {
            unidade_id: unidadeId,
            valor_refeicao: vRef,
            valor_jantar: vJan,
            valor_diaria: vDia,
            valor_alimentacao: vAli // NOVO CAMPO
        };

        let logAcao = '';
        let dadosAntigos = null;
        let idRegistro = id;

        if (id) {
            logAcao = 'UPDATE';
            const { data: antigo } = await clienteSupabase.from('valores_diarias').select('*, unidades(nome)').eq('id', id).single();
            dadosAntigos = antigo;
            
            await clienteSupabase.from('valores_diarias').update(dadosNovos).eq('id', id);
        } else {
            logAcao = 'INSERT';
            dadosNovos.ativo = true;
            const { data } = await clienteSupabase.from('valores_diarias').insert([dadosNovos]).select();
            if(data) idRegistro = data[0].id;
        }

        let nomeUnidadeNova = 'Unidade ID ' + dadosNovos.unidade_id;
        const unidadeObj = listaUnidadesDiarias.find(u => u.id == dadosNovos.unidade_id);
        if(unidadeObj) nomeUnidadeNova = unidadeObj.nome;

        const dadosNovosLog = { ...dadosNovos, nome_unidade_visual: nomeUnidadeNova };

        const user = (await clienteSupabase.auth.getUser()).data.user;
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'valores_diarias',
            acao: logAcao,
            id_registro_afetado: idRegistro,
            usuario_id: user?.id,
            dados_antigos: dadosAntigos ? JSON.stringify(dadosAntigos) : null,
            dados_novos: JSON.stringify(dadosNovosLog),
            data_hora: new Date().toISOString()
        }]);

        mostrarToast("Valor salvo com sucesso!", "success");
        fecharModalDiaria(true);
        listarDiarias();

    } catch (err) {
        mostrarToast("Erro: " + err.message, "error");
    } finally {
        btn.innerText = txtOriginal;
        btn.disabled = false;
    }
}

async function alternarStatusDiaria(id, statusAtual) {
    await clienteSupabase.from('valores_diarias').update({ ativo: !statusAtual }).eq('id', id);
    
    // Log de status
    const user = (await clienteSupabase.auth.getUser()).data.user;
    await clienteSupabase.from('logs_auditoria').insert([{
        tabela_afetada: 'valores_diarias',
        acao: 'UPDATE_STATUS',
        id_registro_afetado: id,
        usuario_id: user?.id,
        dados_novos: JSON.stringify({ ativo: !statusAtual })
    }]);
    
    listarDiarias();
}

function fecharModalDiaria(force = false) {
    const isVis = document.getElementById('form-diaria').classList.contains('modo-visualizacao');
    if (isVis) force = true;

    if(!force && formDiariaSujo) {
        solicitarConfirmacao(() => fecharModalDiaria(true));
        return;
    }
    document.getElementById('modal-diaria').classList.remove('active');
    formDiariaSujo = false;
}

function configurarFormularioDiaria() {
    const form = document.getElementById('form-diaria');
    if(!form) return;
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener('submit', salvarDiaria);
    
    newForm.querySelectorAll('input, select').forEach(el => el.addEventListener('change', () => formDiariaSujo = true));

    // Adicionado o novo ID no array de formatação
    ['dia-vlr-refeicao', 'dia-vlr-jantar', 'dia-vlr-diaria', 'dia-vlr-alimentacao'].forEach(id => {
        const input = document.getElementById(id);
        if(input) {
            input.addEventListener('blur', function() {
                if(this.value) {
                    this.value = parseFloat(this.value).toFixed(2);
                } else {
                    this.value = "0.00";
                }
            });
        }
    });
}

// --- HISTÓRICO DETALHADO ---

async function abrirModalLogsDiaria(idRegistro) {
    const modal = document.getElementById('modal-logs');
    const container = document.getElementById('timeline-logs');
    document.getElementById('titulo-modal-logs').innerText = 'Histórico de Valores';
    
    container.innerHTML = '<div style="text-align:center; padding:20px"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';
    modal.classList.add('active');

    try {
        const { data: logs } = await clienteSupabase
            .from('logs_auditoria')
            .select('*, perfis(nome_completo)')
            .eq('tabela_afetada', 'valores_diarias')
            .eq('id_registro_afetado', idRegistro)
            .order('data_hora', { ascending: false });

        container.innerHTML = '';
        if(!logs || logs.length === 0) {
            container.innerHTML = '<p style="text-align:center;color:#777">Sem histórico.</p>';
            return;
        }

        logs.forEach(log => {
            const item = document.createElement('div');
            item.className = 'log-item';
            const nomeUser = log.perfis ? log.perfis.nome_completo : 'Sistema';
            
            let diff = '';
            if (log.acao === 'INSERT') diff = '<div class="log-diff" style="color:green">Definiu os valores iniciais.</div>';
            else if (log.acao === 'UPDATE') diff = gerarDiffDiarias(log.dados_antigos, log.dados_novos);
            else if (log.acao === 'UPDATE_STATUS') {
                const s = JSON.parse(log.dados_novos).ativo ? 'ATIVO' : 'INATIVO';
                diff = `<div class="log-diff">Status alterado para <b>${s}</b></div>`;
            }

            item.innerHTML = `
                <div class="log-header">${new Date(log.data_hora).toLocaleString('pt-BR')} por <span style="color:#003399">${nomeUser}</span></div>
                <div class="log-action">${log.acao}</div>
                ${diff}
            `;
            container.appendChild(item);
        });
    } catch(e) { console.error(e); }
}

function gerarDiffDiarias(antigoStr, novoStr) {
    if(!antigoStr || !novoStr) return '';
    const ant = JSON.parse(antigoStr);
    const nov = JSON.parse(novoStr);
    let html = '';
    
    const formatar = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const nomeAnt = ant.unidades ? ant.unidades.nome : (ant.nome_unidade_visual || ant.unidade_id);
    const nomeNov = nov.unidades ? nov.unidades.nome : (nov.nome_unidade_visual || nov.unidade_id);
    
    if (ant.unidade_id != nov.unidade_id) {
        html += `<div class="log-diff"><b>Unidade:</b> ${nomeAnt} <i class="fas fa-arrow-right"></i> <b>${nomeNov}</b></div>`;
    }

    if (parseFloat(ant.valor_refeicao) !== parseFloat(nov.valor_refeicao)) {
        html += `<div class="log-diff"><b>Refeição:</b> ${formatar(ant.valor_refeicao)} <i class="fas fa-arrow-right"></i> <b>${formatar(nov.valor_refeicao)}</b></div>`;
    }
    if (parseFloat(ant.valor_jantar) !== parseFloat(nov.valor_jantar)) {
        html += `<div class="log-diff"><b>Jantar:</b> ${formatar(ant.valor_jantar)} <i class="fas fa-arrow-right"></i> <b>${formatar(nov.valor_jantar)}</b></div>`;
    }
    if (parseFloat(ant.valor_diaria) !== parseFloat(nov.valor_diaria)) {
        html += `<div class="log-diff"><b>Diária:</b> ${formatar(ant.valor_diaria)} <i class="fas fa-arrow-right"></i> <b>${formatar(nov.valor_diaria)}</b></div>`;
    }
    // Lógica para o novo campo
    if (parseFloat(ant.valor_alimentacao || 0) !== parseFloat(nov.valor_alimentacao || 0)) {
        html += `<div class="log-diff"><b>Alimentação:</b> ${formatar(ant.valor_alimentacao)} <i class="fas fa-arrow-right"></i> <b>${formatar(nov.valor_alimentacao)}</b></div>`;
    }

    return html || '<div class="log-diff text-muted">Sem alterações de valor.</div>';
}