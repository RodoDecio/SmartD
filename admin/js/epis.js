// admin/js/epis.js

let listaEpis = [];
let formEpiSujo = false;
let dadosOriginaisEpi = null;

function inicializarEpis() {
    document.getElementById('titulo-pagina').innerText = 'Gestão de EPIs';
    configurarFormularioEpi();
    listarEpis();
}

async function listarEpis() {
    const tbody = document.getElementById('tbody-epis');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        const { data, error } = await clienteSupabase
            .from('epis')
            .select('*')
            .order('nome');

        if (error) throw error;
        listaEpis = data || [];
        atualizarTabelaEpis(listaEpis);

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao carregar EPIs.", "error");
    }
}

function atualizarTabelaEpis(lista) {
    const tbody = document.getElementById('tbody-epis');
    tbody.innerHTML = '';
    document.getElementById('lbl-contagem-epis').innerHTML = `Total: <strong>${lista.length}</strong>`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3">Nenhum registro encontrado.</td></tr>';
        return;
    }

    lista.forEach(e => {
        const isAtivo = e.ativo === true;
        const classeBadge = isAtivo ? 'badge-ativo' : 'badge-inativo';
        const corIcone = isAtivo ? 'var(--cor-sucesso)' : '#ccc';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${e.nome}</b></td>
            <td>${e.ca_numero || '-'}</td>
            <td>${e.descricao || '-'}</td>
            <td>${e.validade_dias ? e.validade_dias + ' dias' : '-'}</td>
            <td><span class="badge ${classeBadge}">${isAtivo ? 'ATIVO' : 'INATIVO'}</span></td>
            <td style="white-space: nowrap;">
                <button class="action-btn" onclick="visualizarEpi('${e.id}')" title="Visualizar">
                    <i class="fas fa-eye" style="color: #003399;"></i>
                </button>
                <button class="action-btn" onclick="abrirModalLogsEpi('${e.id}')" title="Histórico">
                    <i class="fas fa-history"></i>
                </button>
                <button class="action-btn" onclick="abrirModalEpi('${e.id}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn" onclick="alternarStatusEpi('${e.id}', ${isAtivo})" style="color:${corIcone}">
                    <i class="fas ${isAtivo ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarEpis(texto) {
    const termo = texto.toLowerCase();
    const filtrados = listaEpis.filter(e => 
        e.nome.toLowerCase().includes(termo) || 
        (e.ca_numero && e.ca_numero.toLowerCase().includes(termo))
    );
    atualizarTabelaEpis(filtrados);
}

// --- VISUALIZAÇÃO E EDIÇÃO ---

function visualizarEpi(id) {
    abrirModalEpi(id);
    document.getElementById('titulo-modal-epi').innerText = 'Visualizar EPI';
    
    // Bloqueia campos
    const form = document.getElementById('form-epi');
    form.querySelectorAll('input, textarea').forEach(el => el.disabled = true);
    
    // Ajusta botões
    const btnSalvar = form.querySelector('button[type="submit"]');
    if(btnSalvar) btnSalvar.style.display = 'none';
    
    const btnCancel = form.querySelector('.btn-cancel');
    btnCancel.innerText = 'Fechar';
    
    // Marca visualmente
    form.classList.add('modo-visualizacao');
}

function abrirModalEpi(id = null) {
    formEpiSujo = false;
    dadosOriginaisEpi = null; // Reseta o snapshot
    
    const modal = document.getElementById('modal-epi');
    const form = document.getElementById('form-epi');
    
    // Reset
    form.reset();
    document.getElementById('epi-id').value = '';
    form.classList.remove('modo-visualizacao');
    form.querySelectorAll('input, textarea').forEach(el => el.disabled = false);
    
    const btnSalvar = form.querySelector('button[type="submit"]');
    if(btnSalvar) btnSalvar.style.display = 'block';
    form.querySelector('.btn-cancel').innerText = 'Cancelar';

    if (id) {
        document.getElementById('titulo-modal-epi').innerText = 'Editar EPI';
        const e = listaEpis.find(x => x.id == id);
        if (e) {
            document.getElementById('epi-id').value = e.id;
            document.getElementById('epi-nome').value = e.nome;
            document.getElementById('epi-ca').value = e.ca_numero || '';
            document.getElementById('epi-validade').value = e.validade_dias || '';
            document.getElementById('epi-descricao').value = e.descricao || '';

            // --- CORREÇÃO: Salva estado original para validação ---
            dadosOriginaisEpi = {
                nome: e.nome,
                ca_numero: e.ca_numero || '',
                validade_dias: e.validade_dias ? String(e.validade_dias) : '',
                descricao: e.descricao || ''
            };
        }
    } else {
        document.getElementById('titulo-modal-epi').innerText = 'Novo EPI';
    }
    modal.classList.add('active');
}

// --- SALVAR COM LOG DETALHADO ---

async function salvarEpi(e) {
    e.preventDefault();
    const btn = e.submitter;
    
    // Se o botão estiver oculto (modo visualização), aborta
    if(btn.style.display === 'none') return;

    // Coleta dados do formulário
    const id = document.getElementById('epi-id').value;
    const nome = document.getElementById('epi-nome').value.trim();
    const ca = document.getElementById('epi-ca').value.trim();
    const validade = document.getElementById('epi-validade').value;
    const descricao = document.getElementById('epi-descricao').value.trim();

    // --- VALIDAÇÃO DE ALTERAÇÃO ---
    if (id && dadosOriginaisEpi) {
        const nadaMudou = (
            nome === dadosOriginaisEpi.nome &&
            ca === dadosOriginaisEpi.ca_numero &&
            validade === dadosOriginaisEpi.validade_dias &&
            descricao === dadosOriginaisEpi.descricao
        );

        if (nadaMudou) {
            mostrarToast("Nenhuma alteração detectada.", "warning");
            return; // Interrompe o processo
        }
    }

    const txtOriginal = btn.innerText;
    btn.innerText = "Salvando...";
    btn.disabled = true;

    try {
        const dadosNovos = {
            nome: nome,
            ca_numero: ca,
            validade_dias: validade || null,
            descricao: descricao
        };

        let logAcao = '';
        let dadosAntigos = null;
        let idRegistro = id;

        // 1. Se for edição, busca o dado antigo ANTES de salvar (para o Log)
        if (id) {
            logAcao = 'UPDATE';
            const { data: antigo } = await clienteSupabase.from('epis').select('*').eq('id', id).single();
            dadosAntigos = antigo;
            
            const { error } = await clienteSupabase.from('epis').update(dadosNovos).eq('id', id);
            if (error) throw error;
        } else {
            logAcao = 'INSERT';
            // Define ativo como true por padrão na criação
            dadosNovos.ativo = true;
            const { data, error } = await clienteSupabase.from('epis').insert([dadosNovos]).select();
            if (error) throw error;
            if(data) idRegistro = data[0].id;
        }

        // 2. Grava Log Detalhado
        const user = (await clienteSupabase.auth.getUser()).data.user;
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'epis',
            acao: logAcao,
            id_registro_afetado: idRegistro,
            usuario_id: user?.id,
            dados_antigos: dadosAntigos ? JSON.stringify(dadosAntigos) : null,
            dados_novos: JSON.stringify(dadosNovos),
            data_hora: new Date().toISOString()
        }]);

        mostrarToast("EPI salvo com sucesso!", "success");
        fecharModalEpi(true);
        listarEpis();

    } catch (err) {
        console.error(err);
        mostrarToast("Erro: " + err.message, "error");
    } finally {
        btn.innerText = txtOriginal;
        btn.disabled = false;
    }
}

async function alternarStatusEpi(id, statusAtual) {
    await clienteSupabase.from('epis').update({ ativo: !statusAtual }).eq('id', id);
    // Log simples para status
    const user = (await clienteSupabase.auth.getUser()).data.user;
    await clienteSupabase.from('logs_auditoria').insert([{
        tabela_afetada: 'epis', 
        acao: 'UPDATE_STATUS', 
        id_registro_afetado: id, 
        usuario_id: user?.id,
        dados_novos: JSON.stringify({ ativo: !statusAtual })
    }]);
    listarEpis();
}

function fecharModalEpi(force = false) {
    const isVis = document.getElementById('form-epi').classList.contains('modo-visualizacao');
    if (isVis) force = true;

    if(!force && formEpiSujo) {
        solicitarConfirmacao(() => fecharModalEpi(true));
        return;
    }
    document.getElementById('modal-epi').classList.remove('active');
    formEpiSujo = false;
}

function configurarFormularioEpi() {
    const form = document.getElementById('form-epi');
    if(!form) return;
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener('submit', salvarEpi);
    newForm.querySelectorAll('input, textarea').forEach(el => el.addEventListener('change', () => formEpiSujo = true));
}

// --- HISTÓRICO DETALHADO ---

async function abrirModalLogsEpi(idRegistro) {
    const modal = document.getElementById('modal-logs');
    const container = document.getElementById('timeline-logs');
    document.getElementById('titulo-modal-logs').innerText = 'Histórico do EPI';
    
    container.innerHTML = '<div style="text-align:center; padding:20px"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';
    modal.classList.add('active');

    try {
        const { data: logs } = await clienteSupabase
            .from('logs_auditoria')
            .select('*, perfis(nome_completo)')
            .eq('tabela_afetada', 'epis')
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
            if (log.acao === 'INSERT') diff = '<div class="log-diff" style="color:green">Registro criado.</div>';
            else if (log.acao === 'UPDATE') diff = gerarDiffEpi(log.dados_antigos, log.dados_novos);
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

function gerarDiffEpi(antigoStr, novoStr) {
    if(!antigoStr || !novoStr) return '';
    const ant = JSON.parse(antigoStr);
    const nov = JSON.parse(novoStr);
    let html = '';
    
    const campos = { nome: 'Nome', ca_numero: 'C.A.', validade_dias: 'Validade', descricao: 'Descrição' };
    
    for (let key in campos) {
        if (ant[key] != nov[key]) {
            html += `<div class="log-diff"><b>${campos[key]}:</b> ${ant[key] || '(vazio)'} <i class="fas fa-arrow-right"></i> <b>${nov[key] || '(vazio)'}</b></div>`;
        }
    }
    return html || '<div class="log-diff text-muted">Sem alterações visíveis.</div>';
}