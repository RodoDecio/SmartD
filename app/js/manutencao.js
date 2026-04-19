// app/js/manutencao.js

let tarefasCache = [];
let tarefaAtual = null;
let usuarioAtualId = null;
let perfilManutentor = null;
let idTarefaParaAssumir = null; 
let itensTrabalhoCache = []; 
let filtroItemAtual = 'todos'; 
let callbackSucesso = null

// Configuração do Bucket do Supabase (Ajuste o nome se for diferente)
const BUCKET_COMPROVANTES = 'comprovantes'; 

// =================================================================
// 1. INICIALIZAÇÃO E PERFIL
// =================================================================

async function carregarPerfilManutentor() {
    try {
        const { data, error } = await clienteSupabase
            .from('perfis')
            .select('*, unidades_acesso:perfis_unidades(unidade_id)')
            .eq('id', usuarioAtualId)
            .single();

        if (error || !data) throw error;

        perfilManutentor = data;

        // Atualização da Saudação
        const elSaudacao = document.getElementById('saudacao-usuario');
        if (elSaudacao && data.nome_completo) {
            const primeiroNome = data.nome_completo.split(' ')[0];
            elSaudacao.innerText = `Olá, ${primeiroNome}`;
        }

        // Processamento de Unidades
        if (data.unidades_acesso && data.unidades_acesso.length > 0) {
            perfilManutentor.listaUnidades = data.unidades_acesso.map(u => u.unidade_id);
        } else {
            perfilManutentor.listaUnidades = [data.unidade_id];
        }

    } catch (e) {
        console.error("Erro ao carregar perfil:", e);
    }
}

window.inicializarManutencaoMobile = async function() {
    
    // 1. DEFINIR O PONTO ZERO (IGUAL AO MOTORISTA)
    // Isso cria a "base" do histórico. Sem isso, o primeiro "voltar" fecha o app.
    history.replaceState({ screen: 'hub' }, "Hub", "#hub");

    // 2. O CÉREBRO DA NAVEGAÇÃO (ESCUTA O BOTÃO VOLTAR)
    window.addEventListener('popstate', function (event) {
        const state = event.state;

        // --- A. DETECÇÃO DE MODAIS (Lógica "O Truque" do Motorista) ---
        // Se houver modal aberto, fecha o modal e IMPEDE a navegação de voltar
        const modalAssumir = document.getElementById('modal-assumir-tarefa');
        const modalConcluir = document.getElementById('modal-concluir-reparo');
        const modalAviso = document.getElementById('modal-aviso');
        const modalSucesso = document.getElementById('modal-sucesso');
        const modalImagem = document.getElementById('modal-visualizar-foto');

        const algumModalAberto = (
            (modalAssumir && modalAssumir.style.display === 'flex') ||
            (modalConcluir && modalConcluir.style.display === 'flex') ||
            (modalAviso && modalAviso.style.display === 'flex') ||
            (modalSucesso && modalSucesso.style.display === 'flex') ||
            (modalImagem && modalImagem.style.display === 'flex')
        );

        if (algumModalAberto) {
            // Fecha os modais visualmente
            if(window.fecharModalAssumir) fecharModalAssumir();
            if(window.fecharModalConclusao) fecharModalConclusao();
            if(window.fecharModalAviso) fecharModalAviso();
            if(window.fecharModalSucesso) fecharModalSucesso();
            if(window.fecharModalFoto) fecharModalFoto();

            // [O PULO DO GATO DO MOTORISTA]
            // O navegador já voltou 1 passo no histórico ao clicar no botão.
            // Nós recolocamos esse passo para manter o usuário na mesma tela.
            // Se não fizermos isso, o próximo voltar fechará o app.
            const estadoAtual = state || { screen: 'hub' }; 
            history.pushState(estadoAtual, document.title, window.location.href);
            return;
        }

        // --- B. NAVEGAÇÃO DE TELAS ---
        
        // Se o histórico diz 'hub' (ou está vazio), mostra o HUB
        if (!state || state.screen === 'hub') {
            document.getElementById('screen-work').style.display = 'none';
            document.getElementById('screen-list').style.display = 'none';
            document.getElementById('screen-hub').style.display = 'flex';
            return;
        }

        // Se o histórico diz 'lista', mostra a LISTA
        if (state.screen === 'lista') {
            document.getElementById('screen-work').style.display = 'none';
            document.getElementById('screen-hub').style.display = 'none';
            document.getElementById('screen-list').style.display = 'flex';
            // Recarrega a lista para garantir dados frescos
            if(typeof carregarTarefasOficina === 'function') carregarTarefasOficina();
            return;
        }

        // Se o histórico diz 'work', mostra o TRABALHO
        if (state.screen === 'work') {
            document.getElementById('screen-list').style.display = 'none';
            document.getElementById('screen-work').style.display = 'flex';
            return;
        }
    });

    // 3. Autenticação e Cargas (Seu código original)
    const { data: { session } } = await clienteSupabase.auth.getSession();
    if (!session) {
        window.location.href = '../index.html';
        return;
    }

    usuarioAtualId = session.user.id;
    
    if(typeof mostrarLoader === 'function') mostrarLoader(true);
    await carregarPerfilManutentor();
    await popularRodape();
    // A lista carrega em background
    if(typeof carregarTarefasOficina === 'function') await carregarTarefasOficina(); 
    if(typeof mostrarLoader === 'function') mostrarLoader(false);
    
    // Garante estado visual inicial
    document.getElementById('screen-list').style.display = 'none';
    document.getElementById('screen-work').style.display = 'none';
    document.getElementById('screen-hub').style.display = 'flex';
};

// =================================================================
// 2. LISTAGEM E FILTROS (HUB & OFICINA)
// =================================================================

window.carregarTarefasOficina = async function() {
    const div = document.getElementById('lista-tarefas-container');
    const selUnidRodape = document.getElementById('sel-unidade-rodape');
    const unidadeSel = selUnidRodape ? selUnidRodape.value : 'TODAS';
    
    div.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; width: 100%; color: var(--cor-primary);">
            <div class="spinner-border" role="status" style="width: 3rem; height: 3rem; margin-bottom: 15px;"></div>
            <p style="font-weight: bold; letter-spacing: 1px; animation: pulse 1.5s infinite;">ATUALIZANDO FILA...</p>
        </div>`;

    try {
        // Removido 'modelos_checklist(titulo)' da query. Elimina o erro de "Could not find a relationship".
        let query = clienteSupabase.from('inspecoes')
            .select(`
                *,
                veiculos!inner(placa, modelo, unidade_id, unidades(nome)),
                motorista:perfis!motorista_id(nome_completo),
                responsavel:perfis!responsavel_atual_id(nome_completo)
            `)
            .order('data_abertura', { ascending: true });

        if (unidadeSel !== 'TODAS') {
            query = query.eq('veiculos.unidade_id', unidadeSel);
        } else if (perfilManutentor?.listaUnidades) {
            query = query.in('veiculos.unidade_id', perfilManutentor.listaUnidades);
        }

        const { data, error } = await query;
        if (error) throw error;

        tarefasCache = data || [];
        
        const tarefasPendentes = tarefasCache.filter(t => t.status !== 'cancelado');
        
        renderizarCardsOficina(tarefasPendentes.length > 0 ? tarefasPendentes : tarefasCache);
        
        const selTipo = document.getElementById('sel-filtro-tipo');
        if(selTipo) selTipo.value = "";
        
        const selVal = document.getElementById('sel-filtro-valor');
        if(selVal) {
            selVal.innerHTML = '<option value="">Selecione...</option>';
            selVal.disabled = true;
        }

    } catch (err) {
        console.error("Erro detalhado:", err);
        div.innerHTML = `<div style="text-align:center; padding:30px; color:#dc3545;">
                            <p>Falha ao carregar tarefas.</p>
                            <small style="font-size:0.75rem">${err.message || 'Erro desconhecido'}</small>
                         </div>`;
    }
};

// app/js/manutencao.js

function renderizarCardsOficina(lista) {
    const div = document.getElementById('lista-tarefas-container');
    div.innerHTML = '';

    if (lista.length === 0) {
        div.innerHTML = `<div class="empty-state"><i class="fas fa-check-circle fa-3x"></i><p>Tudo limpo por aqui!</p></div>`;
        return;
    }

    lista.forEach(t => {
        const isMinha = (t.responsavel_atual_id === usuarioAtualId);
        
        // Datas
        const dt = new Date(t.data_abertura);
        const dataCurta = dt.toLocaleDateString('pt-BR', {day:'2-digit', month:'2-digit'}) + ' ' + dt.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        
        // [ATUALIZADO] Cálculo Inteligente do SLA
        const tempoSLA = calcularTempoSLA(t.data_abertura, t.status, t.data_resolucao);
        
        // Define se o SLA é "Ativo" (Contando) ou "Final" (Parado)
        const isSlaFinalizado = ['concluido', 'corrigido', 'aguardando_motorista'].includes(t.status);
        const labelSla = isSlaFinalizado ? `Tempo Total: ${tempoSLA}` : `${tempoSLA} atrás`;
        const iconSla = isSlaFinalizado ? '<i class="fas fa-flag-checkered"></i>' : '<i class="far fa-clock"></i>';

        // Nomes e IDs
        const nomeMot = t.motorista?.nome_completo ? t.motorista.nome_completo.split(' ')[0] : '--';
        const nomeTec = t.responsavel?.nome_completo ? t.responsavel.nome_completo.split(' ')[0] : '---';
        const modeloChecklist = t.modelos_checklist?.titulo || 'Checklist';
        const idChecklist = t.numero_controle || t.id;

        // Status e Cores
        let corStatus = '#6c757d'; 
        let labelStatus = t.status ? t.status.toUpperCase().replace('_', ' ') : '---';
        
        if (t.status === 'pendente') { 
            corStatus = '#ffc107'; labelStatus = 'ABERTO'; 
        }
        else if (t.status === 'em_analise') { 
            corStatus = '#fd7e14'; labelStatus = 'EM ANDAMENTO'; 
        }
        else if (t.status === 'bloqueado') { 
            corStatus = '#dc3545'; labelStatus = 'BLOQUEADO'; 
        }
        else if (t.status === 'aguardando_motorista') { 
            corStatus = '#6f42c1'; labelStatus = 'VALIDAÇÃO'; 
        }
        else if (t.status === 'corrigido') { 
            corStatus = '#17a2b8'; labelStatus = 'CORRIGIDO'; 
        }
        else if (t.status === 'concluido') { 
            corStatus = '#28a745'; labelStatus = 'CONCLUÍDO'; 
        }

        div.innerHTML += `
            <div class="card-task" style="border-left-color: ${corStatus}" onclick="visualizarChecklist('${t.id}')">
                
                <div class="card-header-row" style="align-items:flex-start;">
                    <div>
                        <div style="font-size:0.85rem; color:#555; font-weight:600; margin-bottom:2px;">
                            #${idChecklist} • ${modeloChecklist}
                        </div>
                        <div class="task-placa" style="font-size:1.3rem;">${t.veiculos.placa}</div>
                        <div class="task-modelo">${t.veiculos.modelo}</div>
                    </div>
                    <span class="badge-status" style="background:${corStatus}">${labelStatus}</span>
                </div>

                <div class="card-info-row" style="margin-top:12px;">
                    <div class="info-left">
                        <span><i class="fas fa-steering-wheel"></i> Motorista: ${nomeMot}</span>
                        <span><i class="fas fa-wrench"></i> Atendente: <b>${nomeTec}</b></span>
                    </div>
                    <div class="info-right">
                        <span><i class="far fa-calendar-alt"></i> ${dataCurta}</span>
                        <span style="color:${corStatus}; font-weight:bold; font-size:0.75rem;">
                            ${iconSla} ${labelSla}
                        </span>
                    </div>
                </div>

                ${renderizarBotaoCompacto(t, isMinha, corStatus, nomeTec)}
            </div>
        `;
    });
}

function renderizarBotaoCompacto(t, isMinha, cor, nomeTecnico) {
    if (['concluido', 'corrigido'].includes(t.status)) return ''; 

    if (t.status === 'aguardando_motorista') {
        return `<div style="text-align:center; font-size:0.75rem; color:#fd7e14; font-weight:bold; margin-top:8px;">
                    <i class="fas fa-hourglass-half"></i> Aguardando Validação do Motorista
                </div>`;
    }

    if (t.responsavel_atual_id && !isMinha) {
        return `<button class="btn-action-small" style="background:#6c757d; cursor:not-allowed; opacity:0.8; margin-top:8px;" disabled>
                    <i class="fas fa-lock"></i> Com ${nomeTecnico}
                </button>`;
    }

    const texto = isMinha ? 'Continuar Reparo' : 'Assumir Chamado';
    const icone = isMinha ? 'fa-play' : 'fa-hand-paper';
    
    // [MUDANÇA AQUI] Adicionado event.stopPropagation() antes da função
    return `<button class="btn-action-small" style="background:${cor}; margin-top:8px;" onclick="event.stopPropagation(); prepararTarefa('${t.id}')">
                <i class="fas ${icone}"></i> ${texto}
            </button>`;
}

function renderizarBotaoAcao(tarefa, isMinha, cor) {
    if (tarefa.status === 'concluido' || tarefa.status === 'aguardando_motorista') {
        return `<div style="text-align:center; margin-top:10px; color:#28a745; font-weight:bold;"><i class="fas fa-check"></i> Processo Finalizado</div>`;
    }

    if (tarefa.responsavel_atual_id && !isMinha) {
        return `<button class="btn-action" style="background:#6c757d; cursor:not-allowed;" disabled>
                    <i class="fas fa-user-lock"></i> Em atendimento por outro
                </button>`;
    }

    const textoBtn = isMinha ? 'CONTINUAR REPARO' : 'ASSUMIR CHAMADO';
    const iconeBtn = isMinha ? 'fa-tools' : 'fa-hand-paper';
    
    return `<button class="btn-action" style="background:${cor}" onclick="prepararTarefa('${tarefa.id}')">
                <i class="fas ${iconeBtn}"></i> ${textoBtn}
            </button>`;
}

// =================================================================
// 3. FLUXO DE TRABALHO (ASSUMIR E CORRIGIR)
// =================================================================

window.prepararTarefa = async function(id) {
    // Busca dados no cache
    tarefaAtual = tarefasCache.find(t => t.id == id);
    if (!tarefaAtual) return;

    // --- VALIDAÇÕES ---
    // Se já finalizado ou validando -> Apenas Abre
    if (['concluido', 'corrigido', 'aguardando_motorista'].includes(tarefaAtual.status)) {
        abrirTelaTrabalho();
        return;
    }
    // Se é MEU -> Abre direto
    if (tarefaAtual.responsavel_atual_id === usuarioAtualId) {
        abrirTelaTrabalho();
        return;
    }
    // Se é de OUTRO -> Bloqueia
    if (tarefaAtual.responsavel_atual_id && tarefaAtual.responsavel_atual_id !== usuarioAtualId) {
        alert(`Chamado já em atendimento por outro técnico.`);
        return;
    }

    // --- ABRIR MODAL ---
    const modal = document.getElementById('modal-assumir-tarefa');
    const lblVeiculo = document.getElementById('lbl-veiculo-modal');
    
    if(modal) {
        // [FIX] Armazena o ID direto no HTML do modal (dataset)
        modal.setAttribute('data-id-alvo', id); 
        
        if(lblVeiculo) lblVeiculo.innerText = tarefaAtual.veiculos.placa;
        
        modal.style.display = 'flex';
        history.pushState({ screen: 'modal-assumir' }, "Confirmar", "#confirmar");
    }
};

// app/js/manutencao.js

async function abrirTelaTrabalho() {
    // 1. Navegação
    history.pushState({ screen: 'work' }, "Em Atendimento", "#reparo");
    document.getElementById('screen-list').style.display = 'none';
    document.getElementById('screen-work').style.display = 'flex';

    // 2. Cabeçalho
    const kmFormatado = tarefaAtual.km_atual ? `${tarefaAtual.km_atual.toLocaleString('pt-BR')} km` : 'KM N/A';
    const numChecklist = tarefaAtual.numero_controle || tarefaAtual.id;
    const modeloNome = tarefaAtual.modelos_checklist?.titulo || 'Checklist';

    document.getElementById('work-placa').innerText = tarefaAtual.veiculos.placa;
    document.getElementById('work-id').innerText = `#${numChecklist}`;
    document.getElementById('work-modelo').innerText = modeloNome;
    document.getElementById('work-km').innerText = kmFormatado;

    const btn = document.querySelector('#screen-work .btn-action');
    if(btn) {
        btn.innerHTML = '<i class="fas fa-check-double"></i> CONCLUIR REPARO';
        btn.disabled = false;
    }

    // 3. Verifica Modo de Leitura (Checklist Finalizado)
    // Se estiver Concluído, Corrigido ou Aguardando Validação -> SOMENTE LEITURA
    const isReadOnly = ['concluido', 'corrigido', 'aguardando_motorista'].includes(tarefaAtual.status);
    
    // Esconde/Mostra botão de concluir geral dependendo do status
    const footerConcluir = document.querySelector('#screen-work .btn-action').parentNode;
    if(footerConcluir) footerConcluir.style.display = isReadOnly ? 'none' : 'block';

    const divContent = document.getElementById('work-content');
    divContent.innerHTML = `<div class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> Carregando itens...</div>`;

    try {
        // 4. Busca TODOS os itens (não só NOK)
        const { data: respostas, error } = await clienteSupabase
            .from('respostas_inspecao')
            .select(`*, itens_checklist (pergunta, opcao_nok, categorias_checklist (nome, ordem))`)
            .eq('inspecao_id', tarefaAtual.id);

        if (error) throw error;

        itensTrabalhoCache = respostas || [];
        filtroItemAtual = 'todos'; // Reset filtro

        // 5. Renderiza Barra de Filtros + Lista
        renderizarBarraFiltros();
        renderizarListaItens(isReadOnly);

    } catch (e) {
        console.error(e);
        divContent.innerHTML = `<div class="text-center p-4 text-danger">Erro: ${e.message}</div>`;
    }
}

// Pré-visualização da imagem selecionada
window.previewImagem = function(input, id) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = document.getElementById(`preview-${id}`);
            img.src = e.target.result;
            img.style.display = 'block';
            
            const btn = document.getElementById(`btn-wrapper-${id}`);
            btn.className = 'btn-foto-resolucao com-foto';
            btn.innerHTML = '<i class="fas fa-check"></i> Foto Selecionada';
        }
        reader.readAsDataURL(input.files[0]);
    }
};

// =================================================================
// 4. UTILITÁRIOS E FILTROS DE UI
// =================================================================

function fecharTarefa(veioDoBrowser = false) {
    // 1. Verifica se há dados não salvos (Opcional, mas recomendado)
    // Aqui simplificamos fechando direto, mas você poderia por um confirm igual no motorista
    
    document.getElementById('screen-work').style.display = 'none';
    document.getElementById('screen-list').style.display = 'flex';
    
    // 2. Sincronia de Histórico
    // Se o usuário clicou no botão "Voltar" da tela (setinha), fazemos o back manual.
    // Se ele usou o botão físico (veioDoBrowser=true), o navegador já voltou sozinho.
    if (!veioDoBrowser) {
        history.back();
    }

    carregarTarefasOficina();
}

function mostrarLoader(vis) {
    const l = document.getElementById('loader');
    if(l) l.style.display = vis ? 'flex' : 'none';
}

async function registrarLog(inspecaoId, acao, mensagem) {
    try {
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'inspecoes',
            id_registro_afetado: String(inspecaoId),
            acao: acao,
            usuario_id: usuarioAtualId,
            data_hora: new Date().toISOString(),
            dados_novos: { "descricao": mensagem }
        });
    } catch (err) {
        console.error("Falha ao registrar log silencioso:", err);
    }
}

async function popularRodape() {
    if (!perfilManutentor) return;
    document.getElementById('footer-user-name').innerText = perfilManutentor.nome_completo;
    document.getElementById('user-initials').innerText = perfilManutentor.nome_completo.charAt(0).toUpperCase();

    const { data: unidades } = await clienteSupabase
        .from('unidades')
        .select('id, nome')
        .in('id', perfilManutentor.listaUnidades);

    const selUnid = document.getElementById('sel-unidade-rodape');
    selUnid.innerHTML = '<option value="TODAS">Todas Unid.</option>';
    if (unidades) {
        unidades.forEach(u => {
            selUnid.innerHTML += `<option value="${u.id}">${u.nome}</option>`;
        });
    }
}

// Configuração Dinâmica dos Filtros
window.configurarInputValor = function() {
    const tipo = document.getElementById('sel-filtro-tipo').value;
    const selValor = document.getElementById('sel-filtro-valor');
    
    selValor.disabled = false;
    selValor.innerHTML = '<option value="">Todos...</option>';

    if (tipo === 'placa') {
        // Extrai placas únicas ordenadas
        const placas = [...new Set(tarefasCache.map(t => t.veiculos?.placa))].sort();
        placas.forEach(p => selValor.innerHTML += `<option value="${p}">${p}</option>`);
    } 
    else if (tipo === 'status') {
        // Opções manuais para garantir ordem lógica e coerência com o banco
        const statusMap = [
            { val: 'pendente', label: 'Pendente' },
            { val: 'em_analise', label: 'Em Andamento' },
            { val: 'aguardando_motorista', label: 'Validação (Motorista)' },
            { val: 'bloqueado', label: 'Bloqueado' },
            { val: 'corrigido', label: 'Corrigido' },
            { val: 'concluido', label: 'Concluído (OK)' }
        ];

        statusMap.forEach(opt => {
            selValor.innerHTML += `<option value="${opt.val}">${opt.label}</option>`;
        });
    }
    
    // Reaplica o filtro ao mudar
    selValor.onchange = aplicarFiltroDuplo;
};

function aplicarFiltroDuplo() {
    const tipo = document.getElementById('sel-filtro-tipo').value;
    const valor = document.getElementById('sel-filtro-valor').value;

    if (!valor) {
        renderizarCardsOficina(tarefasCache);
        return;
    }

    const filtrados = tarefasCache.filter(t => {
        if (tipo === 'placa') return t.veiculos.placa === valor;
        if (tipo === 'status') return t.status === valor;
        return true;
    });
    renderizarCardsOficina(filtrados);
}

// Navegação
window.exibirTelaHub = function() {
    document.getElementById('screen-list').style.display = 'none';
    document.getElementById('screen-hub').style.display = 'flex';
};

window.exibirTelaOficina = function() {
    // Adiciona "Lista" no histórico. Agora o botão voltar sabe que existe um degrau para descer.
    history.pushState({ screen: 'lista' }, "Lista", "#lista");
    
    document.getElementById('screen-hub').style.display = 'none';
    document.getElementById('screen-list').style.display = 'flex';
    carregarTarefasOficina();
};

function calcularTempoSLA(dataAbertura) {
    const diff = new Date() - new Date(dataAbertura);
    const horas = Math.floor(diff / (1000 * 60 * 60));
    const dias = Math.floor(horas / 24);
    if (dias > 0) return `${dias}d atrás`;
    return `${horas}h atrás`;
}

window.confirmarAssumirAction = async function() {
    const modal = document.getElementById('modal-assumir-tarefa');
    
    // [FIX] Recupera o ID do HTML (muito mais seguro que variável global)
    const idAlvo = modal.getAttribute('data-id-alvo');

    // Remove do histórico e fecha visualmente
    fecharModalAssumir(); 

    if (!idAlvo) {
        console.error("ID perdido na transição."); // Apenas log silencioso
        return;
    }

    mostrarLoader(true);

    try {
        // Update no Banco
        const { error } = await clienteSupabase.from('inspecoes').update({
            status: 'em_analise',
            responsavel_atual_id: usuarioAtualId,
            data_atendimento: new Date().toISOString()
        }).eq('id', idAlvo);

        if(error) throw error;
        
        await registrarLog(idAlvo, 'ASSUMIR', 'Manutentor assumiu via Mobile.');
        
        // Atualiza cache local instantaneamente
        // Precisamos atualizar o 'tarefaAtual' com base no ID recuperado
        tarefaAtual = tarefasCache.find(t => t.id == idAlvo);
        if(tarefaAtual) {
            tarefaAtual.responsavel_atual_id = usuarioAtualId;
            tarefaAtual.status = 'em_analise';
        }
        
        // Sucesso: Abre a tela
        abrirTelaTrabalho();

    } catch(e) {
        console.error(e);
        alert("Erro de conexão ao assumir chamado.");
    } finally {
        mostrarLoader(false);
        // Limpa o atributo por segurança
        modal.removeAttribute('data-id-alvo');
    }
};

window.fecharModalAssumir = function() {
    const modal = document.getElementById('modal-assumir-tarefa');
    if(modal) {
        modal.style.display = 'none';
        modal.removeAttribute('data-id-alvo'); // Limpa ao fechar
    }
};

// Ação ao clicar no CARD (Apenas visualiza)
window.visualizarChecklist = function(id) {
    tarefaAtual = tarefasCache.find(t => t.id == id);
    if (tarefaAtual) {
        abrirTelaTrabalho();
    }
};

// Renderiza os botões de filtro no topo da lista
function renderizarBarraFiltros() {
    const divContent = document.getElementById('work-content');
    
    // Conta quantidades para os badges
    const total = itensTrabalhoCache.length;
    const nok = itensTrabalhoCache.filter(r => !r.is_conforme).length;
    const ok = itensTrabalhoCache.filter(r => r.is_conforme).length;

    divContent.innerHTML = `
        <div class="filter-bar-sticky">
            <div class="filter-chip active" onclick="aplicarFiltroItens('todos', this)">
                Todos (${total})
            </div>
            <div class="filter-chip" onclick="aplicarFiltroItens('nok', this)">
                <i class="fas fa-exclamation-triangle"></i> Pendentes (${nok})
            </div>
            <div class="filter-chip" onclick="aplicarFiltroItens('ok', this)">
                <i class="fas fa-check-circle"></i> OK/Corrigidos (${ok})
            </div>
        </div>
        <div id="lista-itens-render" style="padding:10px; padding-bottom: 80px;"></div>
    `;
}

// Filtra a lista em memória e atualiza a UI
window.aplicarFiltroItens = function(tipo, el) {
    filtroItemAtual = tipo;
    
    // Atualiza visual dos botões
    document.querySelectorAll('.filter-chip').forEach(c => c.classList.remove('active'));
    el.classList.add('active');

    // Verifica modo leitura novamente (baseado no status global)
    const isReadOnly = ['concluido', 'corrigido', 'aguardando_motorista'].includes(tarefaAtual.status);
    renderizarListaItens(isReadOnly);
};

function renderizarListaItens(isReadOnly) {
    const container = document.getElementById('lista-itens-render');
    container.innerHTML = '';

    let lista = itensTrabalhoCache;
    if (filtroItemAtual === 'nok') lista = lista.filter(r => !r.is_conforme);
    else if (filtroItemAtual === 'ok') lista = lista.filter(r => r.is_conforme);

    if (lista.length === 0) {
        container.innerHTML = '<div class="text-center p-4 text-muted">Nenhum item neste filtro.</div>';
        return;
    }

    lista.sort((a,b) => (a.itens_checklist?.categorias_checklist?.ordem || 99) - (b.itens_checklist?.categorias_checklist?.ordem || 99));

    lista.forEach(r => {
        let statusClass = 'status-ok'; 
        let icon = '<i class="fas fa-check-circle" style="color:var(--cor-ok)"></i>';
        
        if (r.obs_resolucao) { 
            statusClass = 'status-corrigido'; 
            icon = '<i class="fas fa-wrench" style="color:#17a2b8"></i>'; 
        } else if (!r.is_conforme) { 
            statusClass = 'status-nok'; 
            icon = '<i class="fas fa-exclamation-triangle" style="color:var(--cor-nok)"></i>'; 
        }

        let html = `
            <div class="item-card ${statusClass}" id="card-item-${r.id}">
                <div style="font-weight:700; color:#333; margin-bottom:8px;">${icon} ${r.itens_checklist.pergunta}</div>
        `;

        // --- RENDERIZAÇÃO DO HISTÓRICO COM FOTO ANTIGA ---
        if (r.observacao_motorista || r.foto_url) {
            let textoCompleto = r.observacao_motorista || '';
            
            let partes = textoCompleto.split('_______________________');
            let defeitoOriginal = partes[0].trim();
            let historico = partes.slice(1); 

            // A. Balão do Defeito Original
            html += `
                <div class="bubble-driver" style="font-size:0.9rem; background:#fff5f5; padding:10px; border-radius:8px; margin-bottom:10px; border-left: 4px solid #dc3545;">
                    <div style="font-weight:bold; color:#dc3545; font-size:0.75rem; margin-bottom:4px;">MOTORISTA (Relato Original):</div>
                    <div style="color:#333;">${defeitoOriginal || 'Sem relato inicial.'}</div>
                    ${r.foto_url ? `<div style="text-align:right; margin-top:8px;"><span class="btn-ver-foto" onclick="verFoto('${r.foto_url}')"><i class="fas fa-image"></i> Ver Foto Defeito</span></div>` : ''}
                </div>
            `;

            // B. Balões do Histórico (Loop nas recusas anteriores)
            if (historico.length > 0) {
                historico.forEach(bloco => {
                    // 1. Detecta se tem Link de Foto no texto
                    let botaoFotoAntiga = '';
                    // Regex para capturar [FOTO_RES::url] e removê-lo do texto visível
                    bloco = bloco.replace(/\[FOTO_RES::(.*?)\]/g, function(match, url) {
                        // Cria o botão para esta URL
                        botaoFotoAntiga = `
                            <div style="margin-top:5px; text-align:right;">
                                <button onclick="verFoto('${url}')" style="font-size:0.75rem; padding:4px 8px; border:1px solid #17a2b8; background:white; color:#17a2b8; border-radius:4px; cursor:pointer;">
                                    <i class="fas fa-camera-retro"></i> Foto da Correção
                                </button>
                            </div>`;
                        return ''; // Remove a tag do texto corrido
                    });

                    // 2. Formatação do Texto
                    let htmlBloco = bloco
                        .replace(/\[🔧 MANUTENÇÃO/g, '<div style="margin-top:8px; font-weight:bold; color:#0056b3;"><i class="fas fa-wrench"></i> MANUTENÇÃO')
                        .replace(/\[❌ RECUSA/g, '</div>' + botaoFotoAntiga + '<div style="margin-top:8px; font-weight:bold; color:#c82333; border-top:1px dashed #ccc; padding-top:5px;"><i class="fas fa-times-circle"></i> RECUSA')
                        .replace(/\]:/g, ']:</div><div style="padding-left:10px; color:#555; font-size:0.85rem;">'); 

                    html += `
                        <div style="background:#f8f9fa; border:1px solid #e9ecef; border-radius:6px; padding:10px; margin-bottom:10px;">
                            ${htmlBloco}</div>
                        </div>
                    `;
                });
            }
        }

        // --- ÁREA DE NOVA AÇÃO ---
        if (!r.is_conforme || r.obs_resolucao) {
            const val = r.obs_resolucao || ''; 
            const temFotoResolucao = r.foto_resolucao && r.foto_resolucao.length > 10;

            html += `<div style="margin-top:15px; border-top:2px solid #eee; padding-top:10px;">`;
            
            if (isReadOnly) {
                html += `
                    <label style="font-size:0.75rem; font-weight:bold; color:#17a2b8;">ÚLTIMA SOLUÇÃO APLICADA:</label>
                    <div style="background:#e3f2fd; padding:10px; border-radius:6px; color:#0056b3; margin-top:4px; font-weight:500;">
                        ${val || '---'}
                    </div>
                    ${temFotoResolucao ? `
                        <div style="margin-top:8px; text-align:right;">
                            <button onclick="verFoto('${r.foto_resolucao}')" style="background:#fff; color:#17a2b8; border:1px solid #17a2b8; padding:6px 12px; border-radius:4px; cursor:pointer;">
                                <i class="fas fa-check-circle"></i> Ver Foto da Correção
                            </button>
                        </div>
                    ` : ''}
                `;
            } else {
                const btnClass = temFotoResolucao ? 'btn-foto-resolucao com-foto' : 'btn-foto-resolucao';
                const btnTxt = temFotoResolucao ? 'Trocar Foto' : 'Adicionar Foto';
                
                html += `
                    <label style="font-size:0.75rem; font-weight:bold; color:var(--cor-primary);">NOVA AÇÃO TÉCNICA:</label>
                    <div class="input-group-row">
                        <textarea class="form-control" id="res-obs-${r.id}" rows="2" style="margin:0" placeholder="Descreva a correção atual...">${val}</textarea>
                        <button class="btn-save-item" onclick="salvarItemIndividual(${r.id})" title="Salvar"><i class="fas fa-save"></i></button>
                    </div>
                    
                    <div style="display:flex; gap:10px; align-items:center; margin-top:8px;">
                        <input type="file" id="file-res-${r.id}" style="display:none" onchange="previewImagem(this, '${r.id}')">
                        <div id="btn-wrapper-${r.id}" class="${btnClass}" onclick="document.getElementById('file-res-${r.id}').click()" style="flex:1; padding:8px; text-align:center;">
                            <i class="fas fa-camera"></i> ${btnTxt}
                        </div>
                        ${temFotoResolucao ? `
                            <button class="btn-action-small" onclick="verFoto('${r.foto_resolucao}')" style="background:#17a2b8; border:none; padding:8px 12px; border-radius:4px; flex:1;" title="Ver foto salva">
                                <i class="fas fa-eye"></i> Ver Atual
                            </button>
                        ` : ''}
                    </div>
                    <img id="preview-${r.id}" src="" class="preview-mini" style="display:none; margin-top:5px;">
                    <input type="hidden" id="url-res-${r.id}" value="${r.foto_resolucao || ''}">
                `;
            }
            html += `</div>`;
        }
        html += `</div>`;
        container.innerHTML += html;
    });
}


window.salvarItemIndividual = async function(itemId) {
    // 1. Coleta e Validação
    const txtArea = document.getElementById(`res-obs-${itemId}`);
    const obs = txtArea.value.trim();
    const fileInput = document.getElementById(`file-res-${itemId}`);
    
    // Recupera a URL antiga (caso o usuário esteja apenas editando o texto e mantendo a foto)
    let finalUrl = document.getElementById(`url-res-${itemId}`).value;

    if (!obs) {
        mostrarAviso("Por favor, <b>descreva a ação técnica</b> realizada.", false);
        txtArea.focus();
        return;
    }

    // 2. Setup Visual do Botão (Loading)
    const btn = document.querySelector(`#card-item-${itemId} .btn-save-item`);
    // Guarda o HTML original para restaurar em caso de erro
    const originalBtnHtml = btn.innerHTML;
    
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    btn.disabled = true; 

    try {
        // 3. Auto-Assumir (Se o técnico ainda não for o responsável)
        if (tarefaAtual.responsavel_atual_id !== usuarioAtualId) {
            await clienteSupabase.from('inspecoes').update({
                status: 'em_analise',
                responsavel_atual_id: usuarioAtualId,
                data_atendimento: new Date().toISOString()
            }).eq('id', tarefaAtual.id);

            tarefaAtual.responsavel_atual_id = usuarioAtualId;
            tarefaAtual.status = 'em_analise';
        }

        // 4. UPLOAD DA FOTO (Com Compressão Automática)
        if (fileInput.files.length > 0) {
            const arquivoOriginal = fileInput.files[0];
            
            console.log("Iniciando compressão...");
            
            // [NOVO] Comprime a imagem antes de subir
            // Certifique-se que a função window.comprimirImagem está no seu arquivo
            const arquivoComprimido = await window.comprimirImagem(arquivoOriginal);
            
            // Gera nome único: ID_USUARIO / TIMESTAMP_ITEMID.jpg
            // Nota: Forçamos .jpg pois a compressão converte para JPEG
            const nomeArquivo = `${Date.now()}_${itemId}.jpg`;
            const filePath = `${usuarioAtualId}/${nomeArquivo}`;

            console.log("Iniciando upload para:", filePath);

            // a) Faz o Upload do ARQUIVO COMPRIMIDO
            const { error: upErr } = await clienteSupabase.storage
                .from(BUCKET_COMPROVANTES)
                .upload(filePath, arquivoComprimido, { upsert: true });

            if (upErr) throw upErr;

            // b) Pega a URL Pública
            const { data: urlData } = clienteSupabase.storage
                .from(BUCKET_COMPROVANTES)
                .getPublicUrl(filePath);
            
            finalUrl = urlData.publicUrl;
            console.log("URL Gerada com sucesso:", finalUrl);
        }

        // 5. Update no Banco de Dados
        const payload = {
            obs_resolucao: obs,
            foto_resolucao: finalUrl, // Aqui garantimos que a URL vai para o banco
            resolvido_por: usuarioAtualId,
            data_resolucao_item: new Date().toISOString(),
            is_conforme: false // Mantém false para o motorista validar depois
        };

        const { error: errUp } = await clienteSupabase
            .from('respostas_inspecao')
            .update(payload)
            .eq('id', itemId);

        if (errUp) throw errUp;

        // 6. Atualiza Cache Local (Para a UI atualizar sem F5)
        const itemCache = itensTrabalhoCache.find(i => i.id == itemId);
        if(itemCache) {
            itemCache.obs_resolucao = obs;
            itemCache.foto_resolucao = finalUrl;
            itemCache.is_conforme = false;
        }

        // 7. Atualiza a Tela Imediatamente
        const isReadOnly = ['concluido', 'corrigido', 'aguardando_motorista'].includes(tarefaAtual.status);
        renderizarListaItens(isReadOnly);

        // Feedback Visual no botão (Verde temporário)
        const novoBtn = document.querySelector(`#card-item-${itemId} .btn-save-item`);
        if(novoBtn) {
            novoBtn.style.backgroundColor = '#28a745';
            novoBtn.innerHTML = '<i class="fas fa-check"></i>';
            setTimeout(() => {
                novoBtn.style.backgroundColor = 'var(--cor-primary)';
                novoBtn.innerHTML = '<i class="fas fa-save"></i>';
            }, 2000);
        }

    } catch (e) {
        console.error("Erro ao salvar item:", e);
        mostrarAviso("Erro ao salvar: " + e.message, true);
        
        // Restaura botão
        btn.innerHTML = '<i class="fas fa-save"></i>';
        btn.disabled = false;
    }
};

window.verFoto = function(url) {
    if(!url) return;
    const modal = document.getElementById('modal-visualizar-foto');
    const img = document.getElementById('img-full-view');
    img.src = url;
    modal.style.display = 'flex';
};

window.fecharModalFoto = function() {
    document.getElementById('modal-visualizar-foto').style.display = 'none';
};

function calcularTempoSLA(dataAbertura, status, dataResolucao) {
    if (!dataAbertura) return '--';

    const inicio = new Date(dataAbertura);
    let fim = new Date();

    // REGRA: Se o checklist foi finalizado (pela manutenção ou completo), o SLA para de contar.
    // Usamos a 'data_resolucao' como ponto final.
    if (['concluido', 'corrigido', 'aguardando_motorista'].includes(status) && dataResolucao) {
        fim = new Date(dataResolucao);
    }

    const diffMs = Math.max(0, fim - inicio); // Evita números negativos
    const diffMin = Math.floor(diffMs / (1000 * 60)); // Total em minutos

    // LÓGICA DE EXIBIÇÃO INTELIGENTE
    
    // Menos de 1 hora -> Mostra em minutos
    if (diffMin < 60) {
        return `${diffMin} min`;
    }
    
    // Menos de 1 dia -> Mostra em horas
    const diffHoras = Math.floor(diffMin / 60);
    if (diffHoras < 24) {
        return `${diffHoras} h`;
    }

    // Mais de 1 dia -> Mostra em dias
    const diffDias = Math.floor(diffHoras / 24);
    return `${diffDias} dias`; 
}

// =================================================================
// 6. FINALIZAÇÃO DO SERVIÇO (Botão "Concluir Reparo")
// =================================================================

window.concluirServico = function() {
    if (!tarefaAtual) return;

    // Verifica itens pendentes (sem resolução e que são NOK)
    const itensPendentes = itensTrabalhoCache.filter(i => 
        !i.is_conforme && !i.obs_resolucao
    );

    // [CORREÇÃO] Lógica de Bloqueio em vez de Pergunta Dupla
    if (itensPendentes.length > 0) {
        // 1. Muda filtro para mostrar os problemas
        aplicarFiltroItens('nok', document.querySelector('.filter-chip:nth-child(2)')); // Seleciona aba Pendentes visualmente
        
        // 2. Rola até o primeiro problema
        const primeiroId = itensPendentes[0].id;
        setTimeout(() => {
            const card = document.getElementById(`card-item-${primeiroId}`);
            if (card) {
                card.scrollIntoView({ behavior: 'smooth', block: 'center' });
                // Piscar para chamar atenção
                card.style.transition = "0.3s";
                card.style.transform = "scale(1.02)";
                card.style.boxShadow = "0 0 10px rgba(220, 53, 69, 0.5)";
                setTimeout(() => {
                    card.style.transform = "scale(1)";
                    card.style.boxShadow = "none";
                }, 500);
            }
        }, 200);

        // 3. Mostra Aviso (Bloqueante)
        mostrarAviso(`Existem <b>${itensPendentes.length} itens pendentes</b> sem resolução.<br>Descreva a ação técnica em todos os itens NOK antes de concluir.`, true);
        return; // PARE AQUI. Não abre o modal de conclusão.
    }

    // Se chegou aqui, está tudo resolvido. Abre o modal de confirmação final.
    const lblMsg = document.getElementById('lbl-msg-conclusao');
    lblMsg.innerHTML = "Todos os itens foram tratados.<br>Deseja finalizar a manutenção e enviar para validação do motorista?";

    const modal = document.getElementById('modal-concluir-reparo');
    if(modal) {
        modal.style.display = 'flex';
        history.pushState({ screen: 'modal-conclusao' }, "Concluir", "#concluir");
    }
};

// 3. Fecha o Modal
window.fecharModalConclusao = function() {
    const modal = document.getElementById('modal-concluir-reparo');
    if(modal) modal.style.display = 'none';
};

window.mostrarModalSucesso = function(msg, callback) {
    const modal = document.getElementById('modal-sucesso');
    const lbl = document.getElementById('lbl-msg-sucesso');
    
    if(modal && lbl) {
        lbl.innerText = msg;
        callbackSucesso = callback; // Salva a função de retorno (ex: fechar a tela)
        modal.style.display = 'flex';
    }
};

window.fecharModalSucesso = function() {
    const modal = document.getElementById('modal-sucesso');
    if(modal) modal.style.display = 'none';
    
    // Executa a ação posterior (ex: voltar para a lista)
    if (callbackSucesso) {
        callbackSucesso();
        callbackSucesso = null;
    }
};

// --- ATUALIZAÇÃO DA FUNÇÃO DE CONCLUSÃO ---

window.confirmarConclusaoAction = async function() {
    // Remove o estado do modal do histórico e fecha visualmente
    history.back(); 
    fecharModalConclusao(); 
    
    const btnPrincipal = document.querySelector('#screen-work .btn-action');
    const htmlPadrao = '<i class="fas fa-check-double"></i> CONCLUIR REPARO'; 

    if(btnPrincipal) {
        btnPrincipal.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        btnPrincipal.disabled = true;
    }

    try {
        // 1. Atualiza Status da Inspeção
        const { error } = await clienteSupabase.from('inspecoes').update({
            status: 'aguardando_motorista',
            data_resolucao: new Date().toISOString()
        }).eq('id', tarefaAtual.id);

        if (error) throw error;

        // 2. GERAÇÃO DE LOG DETALHADO (CORRIGIDO)
        // Agora filtramos apenas itens que NÃO estão conformes (is_conforme === false)
        // Isso evita que itens já aprovados anteriormente apareçam de novo no log.
        let logDetalhes = "Manutentor finalizou os reparos.\n\nRESUMO DAS AÇÕES NESTA RODADA:";
        let itensTratadosCount = 0;
        
        itensTrabalhoCache.forEach(item => {
            // [FILTRO DE LIMPEZA]:
            // Só lista se tiver solução escrita E se ainda estiver pendente de validação (!is_conforme).
            // Se is_conforme for true, significa que já foi aprovado antes, então ignoramos no log.
            if (item.obs_resolucao && !item.is_conforme) {
                logDetalhes += `\n- Item: ${item.itens_checklist.pergunta} | Solução: ${item.obs_resolucao}`;
                itensTratadosCount++;
            }
        });

        // Se por algum motivo não houve itens (ex: apenas foto), ajusta o texto
        if (itensTratadosCount === 0) {
            logDetalhes += "\n(Ajustes realizados, verificar fotos).";
        }

        // 3. Grava o Log com o texto limpo
        await registrarLog(tarefaAtual.id, 'CONCLUSAO_MANUTENCAO', logDetalhes);

        // 4. Sucesso e Saída
        mostrarModalSucesso("Checklist enviado para validação do motorista!", () => {
            fecharTarefa(); 
        });

    } catch (e) {
        console.error(e);
        mostrarAviso("Erro ao concluir: " + e.message, true);
        
        if(btnPrincipal) {
            btnPrincipal.innerHTML = htmlPadrao;
            btnPrincipal.disabled = false;
        }
    } 
};

window.logoutApp = async function() {
    await clienteSupabase.auth.signOut();
    window.location.href = '../index.html';
}

// Função para abrir o modal de aviso (Substitui o alert)
window.mostrarAviso = function(msg, isErro = true) {
    const modal = document.getElementById('modal-aviso');
    const titulo = document.getElementById('modal-aviso-titulo');
    const lbl = document.getElementById('modal-aviso-msg');
    
    if(modal && lbl) {
        lbl.innerHTML = msg;
        // Ajusta cor dependendo se é erro ou apenas aviso
        titulo.style.color = isErro ? '#dc3545' : '#ffc107'; 
        titulo.innerHTML = isErro ? '<i class="fas fa-times-circle"></i> Erro' : '<i class="fas fa-exclamation-triangle"></i> Atenção';
        
        modal.style.display = 'flex';
    } else {
        // Fallback caso o HTML não tenha sido atualizado ainda
        alert(msg);
    }
};

window.fecharModalAviso = function() {
    const modal = document.getElementById('modal-aviso');
    if(modal) modal.style.display = 'none';
};

// Função específica para o botão "Voltar" do cabeçalho
window.voltarAoHub = function() {
    history.back(); // Simula o botão físico
};

/**
 * Comprime e redimensiona uma imagem no navegador antes do upload.
 * @param {File} file - O arquivo de imagem original (do input type="file")
 * @param {number} quality - Qualidade da compressão (0 a 1). Padrão 0.7 (70%)
 * @param {number} maxWidth - Largura máxima em pixels. Padrão 1024px.
 * @returns {Promise<Blob>} - Retorna o blob da imagem comprimida pronto para o Supabase
 */
window.comprimirImagem = function(file, quality = 0.7, maxWidth = 1024) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            
            img.onload = () => {
                // 1. Cálculo das novas dimensões (mantendo proporção)
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                // 2. Criação do Canvas para desenhar a imagem menor
                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                // 3. Exportação comprimida (image/jpeg ou image/webp)
                // Se quiser economizar ainda mais, mude 'image/jpeg' para 'image/webp'
                ctx.canvas.toBlob((blob) => {
                    if (blob) {
                        console.log(`Compressão: De ${(file.size/1024).toFixed(0)}KB para ${(blob.size/1024).toFixed(0)}KB`);
                        resolve(blob);
                    } else {
                        reject(new Error("Erro na compressão da imagem."));
                    }
                }, 'image/jpeg', quality);
            };
            
            img.onerror = error => reject(error);
        };
        
        reader.onerror = error => reject(error);
    });
};