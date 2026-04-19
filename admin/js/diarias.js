// admin/js/diarias.js

let listaDiarias = [];
let listaUnidadesDiarias = []; 
let formDiariaSujo = false;
let dadosOriginaisDiaria = null;

function inicializarDiarias(unidadeId) {
    document.getElementById('titulo-pagina').innerText = 'Valores de Diárias e Alimentação (CCT)';
    
    configurarFormularioDiaria();
    carregarUnidadesSelect(); 
    listarDiarias(unidadeId);

    const inputBusca = document.getElementById('input-busca');
    if (inputBusca) {
        const novoInput = inputBusca.cloneNode(true);
        inputBusca.parentNode.replaceChild(novoInput, inputBusca);
        novoInput.placeholder = "Buscar por unidade...";
        novoInput.value = ''; 
        novoInput.addEventListener('keyup', (e) => filtrarDiarias(e.target.value));
    }
}

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
        if (!unidadeId) {
            unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
        }

        let query = clienteSupabase
            .from('valores_diarias')
            .select('*, unidades(nome)')
            .order('unidade_id');

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
    }
}

function atualizarTabelaDiarias(lista) {
    const tbody = document.getElementById('tbody-diarias');
    if(!tbody) return;
    tbody.innerHTML = '';
    document.getElementById('lbl-contagem-diarias').innerHTML = `Total: <strong>${lista.length}</strong>`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-3">Nenhum registro encontrado.</td></tr>';
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
            <td>${fmt(d.valor_diaria)}</td>
            <td>${fmt(d.valor_alimentacao)}</td>
            <td><span class="badge ${classeBadge}">${isAtivo ? 'ATIVO' : 'INATIVO'}</span></td>
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

    if (id) {
        document.getElementById('titulo-modal-diaria').innerText = 'Editar Valor';
        const d = listaDiarias.find(x => x.id == id);
        if (d) {
            document.getElementById('dia-id').value = d.id;
            setTimeout(() => { document.getElementById('dia-unidade').value = d.unidade_id; }, 50);
            
            const valRef = parseFloat(d.valor_refeicao || 0).toFixed(2);
            const valDia = parseFloat(d.valor_diaria || 0).toFixed(2);
            const valAli = parseFloat(d.valor_alimentacao || 0).toFixed(2);

            document.getElementById('dia-vlr-refeicao').value = valRef;
            document.getElementById('dia-vlr-diaria').value = valDia;
            document.getElementById('dia-vlr-alimentacao').value = valAli;

            dadosOriginaisDiaria = {
                unidade: String(d.unidade_id),
                refeicao: valRef,
                diaria: valDia,
                alimentacao: valAli
            };
        }
    } else {
        document.getElementById('titulo-modal-diaria').innerText = 'Novo Valor CCT';
        document.getElementById('dia-vlr-refeicao').value = "0.00";
        document.getElementById('dia-vlr-diaria').value = "0.00";
        document.getElementById('dia-vlr-alimentacao').value = "0.00";
    }
    modal.classList.add('active');
}

async function salvarDiaria(e) {
    e.preventDefault();
    const btn = e.submitter;
    const id = document.getElementById('dia-id').value;
    const unidadeId = document.getElementById('dia-unidade').value;
    
    const vRef = parseFloat(document.getElementById('dia-vlr-refeicao').value || 0).toFixed(2);
    const vDia = parseFloat(document.getElementById('dia-vlr-diaria').value || 0).toFixed(2);
    const vAli = parseFloat(document.getElementById('dia-vlr-alimentacao').value || 0).toFixed(2);

    if (id && dadosOriginaisDiaria) {
        const nadaMudou = (
            unidadeId === dadosOriginaisDiaria.unidade &&
            vRef === dadosOriginaisDiaria.refeicao &&
            vDia === dadosOriginaisDiaria.diaria &&
            vAli === dadosOriginaisDiaria.alimentacao
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
            valor_diaria: vDia,
            valor_alimentacao: vAli
        };

        let logAcao = id ? 'UPDATE' : 'INSERT';
        let idRegistro = id;

        if (id) {
            await clienteSupabase.from('valores_diarias').update(dadosNovos).eq('id', id);
        } else {
            dadosNovos.ativo = true;
            const { data } = await clienteSupabase.from('valores_diarias').insert([dadosNovos]).select();
            if(data) idRegistro = data[0].id;
        }

        // Auditoria
        const user = (await clienteSupabase.auth.getUser()).data.user;
        await clienteSupabase.from('logs_auditoria').insert([{
            tabela_afetada: 'valores_diarias',
            acao: logAcao,
            id_registro_afetado: idRegistro,
            usuario_id: user?.id,
            dados_novos: JSON.stringify(dadosNovos),
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

window.fecharModalDiaria = function(force = false) {
    const isVis = document.getElementById('form-diaria').classList.contains('modo-visualizacao');
    if (isVis) force = true;

    if(!force && formDiariaSujo) {
        if(typeof solicitarConfirmacao === 'function') {
            solicitarConfirmacao(() => fecharModalDiaria(true));
        } else {
            if(confirm("Existem alterações não salvas. Deseja sair mesmo assim?")) {
                fecharModalDiaria(true);
            }
        }
        return;
    }
    document.getElementById('modal-diaria').classList.remove('active');
    formDiariaSujo = false;
};

function configurarFormularioDiaria() {
    const form = document.getElementById('form-diaria');
    if(!form) return;
    const newForm = form.cloneNode(true);
    form.parentNode.replaceChild(newForm, form);
    newForm.addEventListener('submit', salvarDiaria);
    
    newForm.querySelectorAll('input, select').forEach(el => el.addEventListener('change', () => formDiariaSujo = true));

    ['dia-vlr-refeicao', 'dia-vlr-diaria', 'dia-vlr-alimentacao'].forEach(id => {
        const input = document.getElementById(id);
        if(input) {
            input.addEventListener('blur', function() {
                this.value = this.value ? parseFloat(this.value).toFixed(2) : "0.00";
            });
        }
    });
}

function gerarDiffDiarias(antigoStr, novoStr) {
    if(!antigoStr || !novoStr) return '';
    const ant = JSON.parse(antigoStr);
    const nov = JSON.parse(novoStr);
    let html = '';
    const formatar = (v) => parseFloat(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const arrow = ' <i class="fas fa-arrow-right"></i> ';

    if (parseFloat(ant.valor_refeicao) !== parseFloat(nov.valor_refeicao)) {
        html += `<div class="log-diff"><b>Refeição:</b> ${formatar(ant.valor_refeicao)}${arrow}<b>${formatar(nov.valor_refeicao)}</b></div>`;
    }
    if (parseFloat(ant.valor_diaria) !== parseFloat(nov.valor_diaria)) {
        html += `<div class="log-diff"><b>Diária:</b> ${formatar(ant.valor_diaria)}${arrow}<b>${formatar(nov.valor_diaria)}</b></div>`;
    }
    if (parseFloat(ant.valor_alimentacao || 0) !== parseFloat(nov.valor_alimentacao || 0)) {
        html += `<div class="log-diff"><b>Alimentação:</b> ${formatar(ant.valor_alimentacao)}${arrow}<b>${formatar(nov.valor_alimentacao)}</b></div>`;
    }
    return html || '<div class="log-diff text-muted">Sem alterações de valor.</div>';
}