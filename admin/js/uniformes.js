// admin/js/uniformes.js

let listaUniformes = [];
let formUniformeSujo = false;
let dadosOriginaisUniforme = null;

function inicializarUniformes() {
    document.getElementById('titulo-pagina').innerText = 'Gestão de Uniformes';
    configurarFormularioUniforme();
    listarUniformes();
}

async function listarUniformes() {
    const tbody = document.getElementById('tbody-uniformes');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center"><i class="fas fa-spinner fa-spin"></i> Carregando...</td></tr>';

    try {
        const { data, error } = await clienteSupabase
            .from('uniformes')
            .select('*')
            .order('nome');

        if (error) throw error;
        listaUniformes = data || [];
        atualizarTabelaUniformes(listaUniformes);

    } catch (err) {
        console.error(err);
        mostrarToast("Erro ao carregar uniformes.", "error");
    }
}

function atualizarTabelaUniformes(lista) {
    const tbody = document.getElementById('tbody-uniformes');
    tbody.innerHTML = '';
    document.getElementById('lbl-contagem-uniformes').innerHTML = `Total: <strong>${lista.length}</strong>`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3">Nenhum registro encontrado.</td></tr>';
        return;
    }

    lista.forEach(u => {
        const isAtivo = u.ativo === true;
        const classeBadge = isAtivo ? 'badge-ativo' : 'badge-inativo';
        const corIcone = isAtivo ? 'var(--cor-sucesso)' : '#ccc';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><b>${u.nome}</b></td>
            <td>${u.tipo}</td>
            <td><span class="badge" style="background:#eee; color:#333;">${u.tamanho}</span></td>
            <td>${u.genero}</td>
            <td><span class="badge ${classeBadge}">${isAtivo ? 'ATIVO' : 'INATIVO'}</span></td>
            <td style="white-space: nowrap;">
                <button class="action-btn" onclick="visualizarUniforme('${u.id}')" title="Visualizar">
                    <i class="fas fa-eye" style="color: #003399;"></i>
                </button>
                <button class="action-btn" onclick="abrirModalLogsUniforme('${u.id}')" title="Histórico">
                    <i class="fas fa-history"></i>
                </button>
                <button class="action-btn" onclick="abrirModalUniforme('${u.id}')" title="Editar">
                    <i class="fas fa-edit"></i>
                </button>
                <button class="action-btn" onclick="alternarStatusUniforme('${u.id}', ${isAtivo})" style="color:${corIcone}">
                    <i class="fas ${isAtivo ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filtrarUniformes(texto) {
    const termo = texto.toLowerCase();
    const filtrados = listaUniformes.filter(u => 
        u.nome.toLowerCase().includes(termo) || 
        u.tipo.toLowerCase().includes(termo)
    );
    atualizarTabelaUniformes(filtrados);
}

// --- VISUALIZAÇÃO E EDIÇÃO ---

function visualizarUniforme(id) {
    abrirModalUniforme(id);
    document.getElementById('titulo-modal-uniforme').innerText = 'Visualizar Uniforme';
    
    const form = document.getElementById('form-uniforme');
    form.querySelectorAll('input, select').forEach(el => el.disabled = true);
    
    const btnSalvar = form.querySelector('button[type="submit"]');
    if(btnSalvar) btnSalvar.style.display = 'none';
    
    const btnCancel = form.querySelector('.btn-cancel');
    btnCancel.innerText = 'Fechar';
    
    form.classList.add('modo-visualizacao');
}

function abrirModalUniforme(id = null) {
    formUniformeSujo = false;
    dadosOriginaisUniforme = null; // Reseta snapshot
    
    const modal = document.getElementById('modal-uniforme');
    const form = document.getElementById('form-uniforme');
    form.reset();
    document.getElementById('uni-id').value = '';
    
    form.classList.remove('modo-visualizacao');
    form.querySelectorAll('input, select').forEach(el => el.disabled = false);
    
    const btnSalvar = form.querySelector('button[type="submit"]');
    if(btnSalvar) btnSalvar.style.display = 'block';
    form.querySelector('.btn-cancel').innerText = 'Cancelar';

    if (id) {
        document.getElementById('titulo-modal-uniforme').innerText = 'Editar Uniforme';
        const u = listaUniformes.find(x => x.id == id);
        if (u) {
            document.getElementById('uni-id').value = u.id;
            document.getElementById('uni-nome').value = u.nome;
            document.getElementById('uni-tipo').value = u.tipo;
            document.getElementById('uni-tamanho').value = u.tamanho;
            document.getElementById('uni-genero').value = u.genero;

            // --- CORREÇÃO: Salva estado original para validação ---
            dadosOriginaisUniforme = {
                nome: u.nome,
                tipo: u.tipo,
                tamanho: u.tamanho,
                genero: u.genero
            };
        }
    } else {
        document.getElementById('titulo-modal-uniforme').innerText = 'Novo Uniforme';
    }
    modal.classList.add('active');
}

// --- SALVAR COM LOG ---

async function salvarUniforme(e) {
    e.preventDefault();
    const btn = e.submitter;
    
    // Se estiver em modo visualização (botão oculto), não faz nada
    if(btn.style.display === 'none') return;

    // Coleta dados
    const id = document.getElementById('uni-id').value;
    const nome = document.getElementById('uni-nome').value.trim();
    const tipo = document.getElementById('uni-tipo').value;
    const tamanho = document.getElementById('uni-tamanho').value;
    const genero = document.getElementById('uni-genero').value;

    // --- VALIDAÇÃO DE ALTERAÇÃO ---
    if (id && dadosOriginaisUniforme) {
        const nadaMudou = (
            nome === dadosOriginaisUniforme.nome &&
            tipo === dadosOriginaisUniforme.tipo &&
            tamanho === dadosOriginaisUniforme.tamanho &&
            genero === dadosOriginaisUniforme.genero
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
            tipo: tipo,
            tamanho: tamanho,
            genero: genero
        };

        let logAcao = '';
        let dadosAntigos = null;
        let idRegistro = id;

        if (id) {
            logAcao = 'UPDATE';
            const { data: antigo } = await clienteSupabase.from('uniformes').select('*').eq('id', id).single();
            dadosAntigos = antigo;
            
            const { error } = await clienteSupabase.from('uniformes').update(dadosNovos).eq('id', id);
            if(error) throw error;
        } else {
            logAcao = 'INSERT';
            // Define ativo como true por padrão
            dadosNovos.ativo = true;
            const { data, error } = await clienteSupabase.from('uniformes').insert([dadosNovos]).select();
            if(error) throw error;
            if(data) idRegistro = data[0].id;
        }

        const user = (await clienteSupabase.auth.getUser()).data.user;
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'uniformes',
            acao: logAcao,
            id_registro_afetado: idRegistro,
            usuario_id: user?.id,
            dados_antigos: dadosAntigos ? JSON.stringify(dadosAntigos) : null,
            dados_novos: JSON.stringify(dadosNovos),
            data_hora: new Date().toISOString()
        }]);

        mostrarToast("Uniforme salvo com sucesso!", "success");
        fecharModalUniforme(true);
        listarUniformes();

    } catch (err) {
        console.error(err);
        mostrarToast("Erro: " + err.message, "error");
    } finally {
        btn.innerText = txtOriginal;
        btn.disabled = false;
    }
}

async function alternarStatusUniforme(id, statusAtual) {
    await clienteSupabase.from('uniformes').update({ ativo: !statusAtual }).eq('id', id);
    const user = (await clienteSupabase.auth.getUser()).data.user;
    await clienteSupabase.from('logs_auditoria').insert([{
        tabela_afetada: 'uniformes', acao: 'UPDATE_STATUS', id_registro_afetado: id, 
        usuario_id: user?.id, dados_novos: JSON.stringify({ ativo: !statusAtual })
    }]);
    listarUniformes();
}

function fecharModalUniforme(force = false) {
    const isVis = document.getElementById('form-uniforme').classList.contains('modo-visualizacao');
    if (isVis) force = true;

    if(!force && formUniformeSujo) {
        solicitarConfirmacao(() => fecharModalUniforme(true));
        return;
    }
    document.getElementById('modal-uniforme').classList.remove('active');
    formUniformeSujo = false;
}

function configurarFormularioUniforme() {
    const form = document.getElementById('form-uniforme');
    if(!form) return;
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener('submit', salvarUniforme);
    newForm.querySelectorAll('input, select').forEach(el => el.addEventListener('change', () => formUniformeSujo = true));
}

// --- HISTÓRICO DETALHADO ---

async function abrirModalLogsUniforme(idRegistro) {
    const modal = document.getElementById('modal-logs');
    const container = document.getElementById('timeline-logs');
    document.getElementById('titulo-modal-logs').innerText = 'Histórico do Uniforme';
    
    container.innerHTML = '<div style="text-align:center; padding:20px"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';
    modal.classList.add('active');

    try {
        const { data: logs } = await clienteSupabase
            .from('logs_auditoria')
            .select('*, perfis(nome_completo)')
            .eq('tabela_afetada', 'uniformes')
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
            else if (log.acao === 'UPDATE') diff = gerarDiffUniforme(log.dados_antigos, log.dados_novos);
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

function gerarDiffUniforme(antigoStr, novoStr) {
    if(!antigoStr || !novoStr) return '';
    const ant = JSON.parse(antigoStr);
    const nov = JSON.parse(novoStr);
    let html = '';
    
    const campos = { nome: 'Nome', tipo: 'Tipo', tamanho: 'Tamanho', genero: 'Gênero' };
    
    for (let key in campos) {
        if (ant[key] != nov[key]) {
            html += `<div class="log-diff"><b>${campos[key]}:</b> ${ant[key] || '-'} <i class="fas fa-arrow-right"></i> <b>${nov[key] || '-'}</b></div>`;
        }
    }
    return html || '<div class="log-diff text-muted">Sem alterações visíveis.</div>';
}