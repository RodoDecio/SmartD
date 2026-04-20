let usuarioAtual = null;
let listaInspecoesCache = []; 
let veiculosCache = [];
let modelosCache = [];
let itensModeloAtual = [];
let modeloSelecionadoId = null;
let modoVisualizacao = false;
let perfilMotorista = null;
let payloadPendente = [];
let statusGeralPendente = '';
let formChecklistSujo = false; 

let itensPendentesValidacao = []; 
let itensValidadosCount = 0;3
let itemSendoRecusadoId = null; 

let decisoesValidacao = {}; 
let listaItensParaValidar = [];

// Inicialização completa
document.addEventListener('DOMContentLoaded', async () => {
    
    // 1. GERENCIAMENTO AVANÇADO DO BOTÃO VOLTAR
    window.addEventListener('popstate', function (event) {
        // Verifica se existe ALGUM modal aberto (Imagem, Confirmação, Recusa, etc)
        const modalAtivo = document.querySelector('.modal.active');
        const telaExec = document.getElementById('tela-execucao');

        // CENÁRIO A: Existe um Modal aberto? Fecha o modal, mas fica na tela.
        if (modalAtivo) {
            if (modalAtivo.id === 'modal-imagem') fecharModalImagem();
            else modalAtivo.classList.remove('active');
            
            // Truque: Empurra o histórico de volta para "anular" o voltar do navegador
            // e manter o usuário na mesma tela.
            if (telaExec && telaExec.style.display === 'flex') {
                const hash = window.location.hash || '#checklist';
                history.pushState({ screen: 'modal-closed' }, document.title, hash);
            }
            return; 
        }

        // CENÁRIO B: Estamos dentro de um Checklist? Tenta fechar com segurança.
        if (telaExec && telaExec.style.display === 'flex') {
            // Passamos 'true' indicando que o navegador já voltou o histórico
            fecharExecucao(true); 
        }
    });

    // 2. Autenticação
    const session = await clienteSupabase.auth.getSession();
    if (!session.data.session) {
        window.location.href = '../index.html'; 
        return;
    }
    usuarioAtual = session.data.session.user;

    // 3. Cargas Iniciais
    await carregarPerfil();
    iniciarSplash();

    if (perfilMotorista && (perfilMotorista.funcao === 'manutencao' || perfilMotorista.funcao === 'manutentor' || perfilMotorista.funcao === 'admin')) {
        const btnVoltar = document.getElementById('btn-voltar-admin');
        if (btnVoltar) btnVoltar.style.display = 'inline-block';
    }

    await Promise.all([
        carregarHistorico(),
        carregarVeiculos(),
        carregarModelos()
    ]);

    // 4. Rotinas de Fundo (SLA e Realtime)
    setInterval(() => { if (listaInspecoesCache.length > 0) aplicarFiltro(); }, 60000);

    clienteSupabase
        .channel('app-motorista-realtime')
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'inspecoes', filter: `motorista_id=eq.${usuarioAtual.id}` }, (payload) => {
            carregarHistorico();
            tocarSomNotificacao();
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            
            // Evita modal duplicado se o motorista estiver com a tela aberta
            const modalAberto = document.querySelector('.modal.active');
            if (modalAberto && payload.new.status === 'concluido') return;

            if(payload.new.status === 'aguardando_motorista') showModal("Atenção: A manutenção devolveu seu checklist!", "Ação Necessária");
            else if(payload.new.status === 'concluido') showModal("Seu checklist foi concluído.", "Resolvido");
        })
        .subscribe();

    // 5. FORÇAR EXIBIÇÃO DO RODAPÉ
    // Garante que o rodapé apareça, caso o CSS do login o tenha ocultado
    const footer = document.querySelector('.user-footer'); // Antes estava 'footer'
        if(footer) {
            footer.style.display = 'flex';
            footer.style.visibility = 'visible'; 
        }
});

async function carregarPerfil() {
    try {
        // Adicionamos 'perfis_unidades(unidade_id)' no select
        // Isso busca a tabela que você mostrou no print
        const { data, error } = await clienteSupabase
            .from('perfis')
            .select('*, perfis_unidades(unidade_id)') 
            .eq('id', usuarioAtual.id)
            .single();

        if (error) throw error;

        if (data) {
            // Processa o retorno do banco para criar um array simples: [1, 2, 5...]
            if (data.perfis_unidades && data.perfis_unidades.length > 0) {
                data.listaUnidades = data.perfis_unidades.map(item => item.unidade_id);
            } else {
                data.listaUnidades = [];
            }

            // Salva na variável global correta
            perfilMotorista = data; 
            
            // Atualiza UI (mantendo seu código original)
            if(document.getElementById('footer-name')) document.getElementById('footer-name').innerText = data.nome_completo;
            if(document.getElementById('footer-role')) document.getElementById('footer-role').innerText = (data.funcao || '').toUpperCase();
            if(document.getElementById('splash-name')) document.getElementById('splash-name').innerText = `Olá, ${data.nome_completo.split(' ')[0]}`;
            if(document.getElementById('splash-role')) document.getElementById('splash-role').innerText = (data.funcao || '').toUpperCase();
        }
    } catch (e) { 
        console.error("Erro ao carregar perfil:", e); 
    }
}

function marcarErroCard(id) {
    const card = document.getElementById(`card-${id}`);
    card.style.borderLeft = "5px solid red";
    card.scrollIntoView({behavior:"smooth", block:"center"});
}

function iniciarSplash() {
    const splash = document.getElementById('splash-screen');
    setTimeout(() => {
        splash.style.opacity = '0';
        setTimeout(() => splash.style.display = 'none', 500);
    }, 2000);
}

// --- MODAL SYSTEM ---
function showModal(message, title = "Aviso", callbackSucesso = null) {
    const modal = document.getElementById('customModal');
    // Busca o botão especificamente dentro deste modal
    const btn = modal.querySelector('.modal-btn'); 
    
    if (!btn) {
        console.error("Botão do modal não encontrado!");
        return;
    }

    document.getElementById('modalMessage').innerHTML = message;
    document.getElementById('modalTitle').innerText = title;
    
    // --- CORREÇÃO: LÓGICA SIMPLIFICADA E SEGURA ---
    // Em vez de clonar e substituir o nó (que causou o erro),
    // apenas sobrescrevemos o evento onclick. 
    
    if (callbackSucesso) {
        // Se tem callback (Sucesso), configura a ação
        btn.onclick = function() {
            closeCustomModal();
            callbackSucesso();
        };
        btn.style.backgroundColor = 'var(--cor-primary)';
    } else {
        // Se é apenas aviso (Erro), apenas fecha
        btn.onclick = closeCustomModal;
        btn.style.backgroundColor = '#666'; // Cor cinza para erros/avisos
    }
    
    modal.classList.add('active');
}

// Funções do Modal de Bloqueio
function abrirModalBloqueio() {
    document.getElementById('modalConfirmacaoBloqueio').classList.add('active');
}
function fecharModalBloqueio() {
    document.getElementById('modalConfirmacaoBloqueio').classList.remove('active');
}
function confirmarSalvarBloqueado() {
    fecharModalBloqueio();
    executarEnvioBanco(payloadPendente, statusGeralPendente);
}

function closeCustomModal() {
    const modal = document.getElementById('customModal');
    if(modal) modal.classList.remove('active');
}

document.getElementById('customModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('customModal')) {
        closeCustomModal();
    }
});

// --- FILTROS ---
window.configurarFiltros = function() {
    const tipo = document.getElementById('filtro-tipo').value;
    
    // Elementos do DOM
    const elPlaca = document.getElementById('filtro-valor-placa');
    const elStatus = document.getElementById('filtro-valor-status');
    const elData = document.getElementById('filtro-valor-data');

    // Reseta visibilidade
    if(elPlaca) elPlaca.style.display = 'none';
    if(elStatus) elStatus.style.display = 'none';
    if(elData) elData.style.display = 'none';

    // 1. PLACA: Lista Dinâmica (Select)
    if (tipo === 'placa') {
        if (elPlaca) {
            elPlaca.style.display = 'block';
            elPlaca.innerHTML = '<option value="">Todas as Placas</option>';
            
            // Extrai placas únicas do histórico
            const placas = [...new Set(listaInspecoesCache.map(i => i.veiculos?.placa))].filter(Boolean).sort();
            
            placas.forEach(p => {
                const opt = document.createElement('option');
                opt.value = p;
                opt.innerText = p;
                elPlaca.appendChild(opt);
            });
            elPlaca.value = "";
        }
    } 
    // 2. STATUS: Lista Fixa (Regra de Negócio)
    else if (tipo === 'status') {
        if (elStatus) {
            elStatus.style.display = 'block';
            elStatus.innerHTML = `
                <option value="">Todos</option>
                <option value="pendente">Pendente</option>
                <option value="concluido">Concluído (OK)</option>
                <option value="corrigido">Corrigido</option>
                <option value="aguardando_motorista">Aguardando Validação</option>
                <option value="em_analise">Em Análise</option>
            `;
            elStatus.value = "";
        }
    } 
    // 3. DATA: Input Calendar
    else if (tipo === 'data') {
        if (elData) elData.style.display = 'block';
    }
    
    // Atualiza a lista visualmente
    aplicarFiltro();
}

window.aplicarFiltro = function() {
    const tipo = document.getElementById('filtro-tipo').value;
    let dados = [...listaInspecoesCache]; // Cópia segura

    // --- FILTRO DE STATUS ---
    if (tipo === 'status') {
        const val = document.getElementById('filtro-valor-status').value;
        if (val) {
            // 'pendente' agrupa tudo que está aberto na oficina
            if (val === 'pendente') {
                dados = dados.filter(i => ['pendente', 'bloqueado', 'nok'].includes((i.status || '').toLowerCase()));
            } 
            // Outros status são comparações exatas ('concluido', 'corrigido', etc.)
            else {
                dados = dados.filter(i => (i.status || '').toLowerCase() === val);
            }
        }
    } 
    // --- FILTRO DE PLACA ---
    else if (tipo === 'placa') {
        const val = document.getElementById('filtro-valor-placa').value;
        if (val) {
            dados = dados.filter(i => i.veiculos?.placa === val);
        }
    } 
    // --- FILTRO DE DATA ---
    else if (tipo === 'data') {
        const val = document.getElementById('filtro-valor-data').value; // YYYY-MM-DD
        if (val) {
            dados = dados.filter(i => {
                if (!i.data_abertura) return false;
                
                // Converte timestamp UTC do banco para Data Local do navegador
                const d = new Date(i.data_abertura);
                const ano = d.getFullYear();
                const mes = String(d.getMonth() + 1).padStart(2, '0');
                const dia = String(d.getDate()).padStart(2, '0');
                const dataLocal = `${ano}-${mes}-${dia}`;
                
                return dataLocal === val;
            });
        }
    }

    renderizarLista(dados);
}

// --- HISTÓRICO ---
async function carregarHistorico() {
    try {
        const { data, error } = await clienteSupabase
            .from('inspecoes')
            .select(`
                id, numero_controle, data_abertura, status, responsavel_atual_id, km_atual, modelo_id,
                veiculos(placa, modelo, marca),
                perfis!responsavel_atual_id ( nome_completo )
            `)
            .eq('motorista_id', usuarioAtual.id)
            .order('data_abertura', { ascending: false })
            .limit(50);

        if (error) throw error;
        
        listaInspecoesCache = data || [];
        
        // Mapeia o título do checklist localmente para não depender do relacionamento do banco
        listaInspecoesCache.forEach(ins => {
            const mod = modelosCache.find(m => m.id === ins.modelo_id);
            ins.modelos_checklist = { titulo: mod ? mod.titulo : 'Checklist' };
        });
        
        configurarFiltros(); 
        
    } catch (error) {
        console.error("Erro histórico:", error);
    }
}

function renderizarLista(lista) {
    const container = document.getElementById('lista-historico');
    
    if (lista.length === 0) {
        container.innerHTML = '<div style="text-align:center; margin-top:50px; color:#aaa"><i class="fas fa-check-circle fa-3x" style="opacity:0.3"></i><p>Nada encontrado.</p></div>';
        return;
    }

    const agora = new Date();
    let htmlContent = ''; // Buffer de HTML para não travar o celular

    lista.forEach(ins => {
        const dt = new Date(ins.data_abertura);
        const dataStr = dt.toLocaleDateString('pt-BR') + ' ' + dt.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
        
        let slaHtml = '';
        if (ins.status !== 'concluido' && ins.status !== 'corrigido') {
            const diffMs = agora - dt;
            const totalMin = Math.floor(diffMs / 60000);
            let textoTempo = totalMin < 60 ? `${totalMin}m` : (totalMin > 2880 ? Math.floor(totalMin/1440) + 'd' : Math.floor(totalMin/60) + 'h');
            const corSla = totalMin > 1440 ? '#dc3545' : '#0056b3'; 
            slaHtml = `<div style="margin-top: 4px; text-align: right;"><span style="font-size:0.7rem; color:${corSla}; font-weight:bold; background:rgba(255,255,255,0.9); padding:2px 6px; border-radius:4px; border:1px solid ${corSla};"><i class="fas fa-clock"></i> ${textoTempo}</span></div>`;
        }

        let corBorda = '#ccc';
        let corBadge = '#ccc';
        let corTextoBadge = '#fff';
        let stLabel = '---';
        let responsavelBadje = ''; 
        const st = (ins.status || '').toLowerCase();

        if (st === 'concluido') {
            corBorda = '#28a745'; corBadge = '#28a745'; stLabel = 'CONCLUÍDO';
            responsavelBadje = `<span style="font-size:0.7rem; color:#28a745; background:#e6fffa; padding:2px 6px; border-radius:4px;"><i class="fas fa-check-circle"></i> Sem Pendências</span>`;
        } 
        else if (st === 'corrigido') {
            corBorda = '#17a2b8'; corBadge = '#17a2b8'; stLabel = 'CORRIGIDO';
            responsavelBadje = `<span style="font-size:0.7rem; color:#17a2b8; background:#e0faff; padding:2px 6px; border-radius:4px;"><i class="fas fa-wrench"></i> Manutenção Realizada</span>`;
        }
        else if (['pendente', 'bloqueado', 'nok'].includes(st)) {
            corBorda = '#ffc107'; corBadge = '#ffc107'; corTextoBadge = '#333'; stLabel = 'PENDENTE';
            responsavelBadje = `<span style="font-size:0.7rem; color:#856404; background:#fff3cd; padding:2px 6px; border-radius:4px;"><i class="fas fa-hourglass-half"></i> Aguardando Atendimento</span>`;
        }
        else if (st === 'em_analise') {
            corBorda = '#007bff'; corBadge = '#007bff'; stLabel = 'EM ANÁLISE';
            const tecnico = ins.perfis?.nome_completo ? ins.perfis.nome_completo.split(' ')[0] : 'Técnico';
            responsavelBadje = `<span style="font-size:0.7rem; color:#004085; background:#cce5ff; padding:2px 6px; border-radius:4px;"><i class="fas fa-tools"></i> Com: ${tecnico}</span>`;
        }
        else if (st === 'aguardando_motorista') {
            corBorda = '#fd7e14'; corBadge = '#fd7e14'; stLabel = 'VALIDAR SOLUÇÃO';
            responsavelBadje = `<span style="font-size:0.7rem; color:#fff; background:#fd7e14; padding:2px 6px; border-radius:4px; font-weight:bold;">Ação: Você</span>`;
        }

        const v = ins.veiculos || {};
        const displayId = ins.numero_controle || ins.id;
        const nomeModelo = ins.modelos_checklist?.titulo || 'Checklist';
        const kmExibicao = ins.km_atual ? ins.km_atual.toLocaleString('pt-BR') : '---';

        htmlContent += `
            <div class="history-card" onclick="verDetalhes(${ins.id})" 
                 style="display:flex; justify-content:space-between; align-items:flex-start; padding:15px; cursor:pointer; 
                        border-left: 6px solid ${corBorda}; margin-bottom:10px; background:#fff; box-shadow:0 2px 5px rgba(0,0,0,0.05); border-radius:6px;">
                
                <div style="flex: 1; padding-right: 10px;">
                    <div style="font-size:0.75rem; color:#666; font-weight:bold; margin-bottom:4px; text-transform:uppercase;">
                        #${displayId} • <span style="color:var(--cor-primary);">${nomeModelo}</span>
                    </div>
                    <div style="font-size:1.2rem; font-weight:800; color:#333; line-height:1.2;">${v.placa || '---'}</div>
                    <div style="font-size:0.85rem; color:#555; margin-bottom:6px;">${v.modelo || 'Modelo N/A'}</div>
                    
                    <div style="font-size:0.8rem; color:#444; background:#f4f4f4; display:inline-block; padding:2px 6px; border-radius:4px;">
                        <i class="fas fa-tachometer-alt" style="color:#777; margin-right:3px;"></i> ${kmExibicao} km
                    </div>
                </div>

                <div class="card-meta" style="text-align:right; min-width: 115px;">
                    <div style="margin-bottom:6px;">
                        <span style="background:${corBadge}; color:${corTextoBadge}; padding:4px 8px; border-radius:12px; font-size:0.65rem; font-weight:bold;">${stLabel}</span>
                    </div>
                    <div style="font-size:0.7rem; color:#888; margin-bottom:6px;">${dataStr}</div>
                    <div style="margin-bottom:4px;">${responsavelBadje}</div>
                    ${slaHtml}
                </div>
            </div>
        `;
    });
    
    container.innerHTML = htmlContent;
}

window.verDetalhes = async function(inspecaoId) {
    history.pushState({ screen: 'detalhes' }, "Detalhes", "#detalhes");

    const telaExec = document.getElementById('tela-execucao');
    const containerItens = document.getElementById('container-perguntas'); 
    const titulo = document.getElementById('titulo-tela-exec');
    
    telaExec.style.display = 'flex';
    document.getElementById('step-dados').style.display = 'none'; 
    document.getElementById('step-itens').style.display = 'block';
    
    document.getElementById('footer-start').style.display = 'none';
    document.getElementById('footer-save').style.display = 'none';
    const fValid = document.getElementById('footer-validacao');
    
    if(fValid) fValid.style.display = 'none';

    decisoesValidacao = {};
    listaItensParaValidar = [];

    toggleLoader(true);

    try {
        const { data: insp, error: errInsp } = await clienteSupabase
            .from('inspecoes')
            .select('*, veiculos(placa, modelo)')
            .eq('id', inspecaoId)
            .single();

        if (errInsp) throw errInsp;
        titulo.innerText = `#${insp.numero_controle || insp.id} - ${insp.veiculos?.placa}`;

        const { data: respostas, error: errResp } = await clienteSupabase
            .from('respostas_inspecao')
            .select(`*, foto_url, foto_resolucao, obs_resolucao, itens_checklist(pergunta, categorias_checklist(nome, ordem))`)
            .eq('inspecao_id', inspecaoId);

        if (errResp) throw errResp;

        const categoriasMap = {};
        respostas.forEach(r => {
            const catNome = r.itens_checklist?.categorias_checklist?.nome || 'GERAL';
            const catOrdem = r.itens_checklist?.categorias_checklist?.ordem || 99;
            if (!categoriasMap[catNome]) categoriasMap[catNome] = { ordem: catOrdem, itens: [] };
            categoriasMap[catNome].itens.push(r);
        });
        
        const categoriasOrdenadas = Object.keys(categoriasMap).sort((a, b) => categoriasMap[a].ordem - categoriasMap[b].ordem);
        containerItens.innerHTML = '';

        const isModoValidacao = (insp.status === 'aguardando_motorista');

        categoriasOrdenadas.forEach(catNome => {
            const divCat = document.createElement('div');
            divCat.className = "category-title";
            divCat.style = "margin-top: 25px; border-bottom: 2px solid #eee; font-weight:bold; color:var(--cor-primary); padding-bottom:5px; margin-bottom:10px;";
            divCat.innerText = catNome;
            containerItens.appendChild(divCat);

            categoriasMap[catNome].itens.forEach(r => {
                let classeStatus = 'status-concluido'; 
                let labelStatus = 'OK';
                let corTextoStatus = 'var(--cor-ok)';
                let corBordaEsquerda = 'var(--cor-ok)';
                
                const temResolucao = !!r.obs_resolucao;
                const precisaValidar = isModoValidacao && temResolucao && !r.is_conforme;

                if (precisaValidar) {
                    classeStatus = 'status-pendente'; 
                    labelStatus = 'VALIDAR CORREÇÃO'; 
                    corTextoStatus = '#fd7e14'; 
                    corBordaEsquerda = '#fd7e14';
                    listaItensParaValidar.push(r.id);
                } 
                else if (r.is_conforme) {
                    if (r.obs_resolucao) {
                        classeStatus = 'status-concluido'; 
                        labelStatus = 'CORRIGIDO'; 
                        corTextoStatus = '#007bff'; 
                        corBordaEsquerda = '#007bff';
                    }
                } else {
                    classeStatus = 'status-divergente';
                    labelStatus = r.resposta_valor || 'NOK';
                    corTextoStatus = 'var(--cor-nok)';
                    corBordaEsquerda = 'var(--cor-nok)';
                }

                const card = document.createElement('div');
                card.id = `card-validacao-${r.id}`;
                card.className = `history-card ${classeStatus}`;
                card.style.marginBottom = "15px";
                card.style.borderLeft = `6px solid ${corBordaEsquerda}`;
                
                // --- 1. GERAÇÃO DO HISTÓRICO (AGORA COMPATÍVEL COM BOTÕES) ---
                let htmlObs = '';
                if (r.observacao_motorista) {
                    let texto = r.observacao_motorista;
                    
                    // Separa o relato original do histórico de conversas
                    let partes = texto.split('_______________________');
                    let defeitoOriginal = partes[0].trim();
                    let historico = partes.slice(1);

                    // Relato Original
                    htmlObs += `<div style="font-size:0.9rem; color:#555; margin-bottom:8px; line-height:1.4;">${defeitoOriginal}</div>`;

                    // Loop no Histórico (Chat)
                    if (historico.length > 0) {
                        historico.forEach(bloco => {
                            let botaoFotoAntiga = '';
                            
                            // [NOVO] Detecta a tag da foto e cria o botão
                            bloco = bloco.replace(/\[FOTO_RES::(.*?)\]/g, function(match, url) {
                                botaoFotoAntiga = `
                                    <div style="margin-top:6px; margin-bottom:6px;">
                                        <button onclick="abrirModalImagem('${url}')" style="background:#e0f7fa; color:#006064; border:1px solid #b2ebf2; padding:5px 10px; border-radius:4px; cursor:pointer; font-size:0.75rem; display:flex; align-items:center; gap:5px;">
                                            <i class="fas fa-camera-retro"></i> Ver Foto da Correção
                                        </button>
                                    </div>`;
                                return ''; // Remove a tag do texto
                            });

                            // Formatação Visual (Cores e Ícones)
                            let htmlBloco = bloco
                                .replace(/\n/g, '<br>')
                                .replace(/\[🔧 MANUTENÇÃO/g, '<div style="margin-top:10px; font-weight:bold; color:#0056b3; border-top:1px solid #eee; padding-top:5px;"><i class="fas fa-wrench"></i> MANUTENÇÃO')
                                .replace(/\[❌ RECUSA/g, '</div>' + botaoFotoAntiga + '<div style="margin-top:10px; font-weight:bold; color:#c82333;"><i class="fas fa-times-circle"></i> RECUSA')
                                .replace(/\]:/g, ']:</div><div style="padding-left:8px; color:#444; font-size:0.85rem; margin-top:2px;">');

                            htmlObs += `<div style="background:#f9f9f9; padding:8px; border-radius:6px; margin-top:5px; border:1px solid #eee;">${htmlBloco}</div></div>`;
                        });
                    }
                    
                    // Empacota tudo numa área cinza claro se tiver histórico
                    if (historico.length > 0) {
                        htmlObs = `<div style="background:#fff; padding:5px;">${htmlObs}</div>`;
                    } else {
                        // Se for só o defeito, mantém simples
                        htmlObs = `<div style="font-size:0.85rem; color:#555; margin-top:5px; padding:10px; background:#fff5f5; border-radius:6px; border:1px solid #ffcccc;">${defeitoOriginal}</div>`;
                    }
                }

                // Solução Atual (Última)
                let htmlSolucao = r.obs_resolucao ? `
                    <div style="font-size:0.85rem; color:#004085; background:#cce5ff; padding:10px; border-radius:6px; margin-top:10px; border: 1px solid #b8daff;">
                        <div style="font-weight:bold; margin-bottom:3px;"><i class="fas fa-wrench"></i> Nova Solução:</div>
                        ${r.obs_resolucao}
                    </div>` : '';

                // Botões de Foto Atuais
                let botoesFotos = '';

                // Foto do Problema (Original)
                if (r.foto_url && r.foto_url.length > 5) {
                    botoesFotos += `<button onclick="abrirModalImagem('${r.foto_url}')" class="btn-foto-mini" style="margin-right:5px;"><i class="fas fa-camera"></i> Problema</button>`;
                }

                // Foto da Solução Atual
                if (r.foto_resolucao && r.foto_resolucao.length > 5) {
                    botoesFotos += `<button onclick="abrirModalImagem('${r.foto_resolucao}')" class="btn-foto-mini destaque" style="background:#d4edda; color:#155724; border:1px solid #c3e6cb;"><i class="fas fa-check-circle"></i> Ver Correção</button>`;
                }

                if (botoesFotos) {
                    botoesFotos = `<div style="margin-top:10px; display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end;">${botoesFotos}</div>`;
                }

                // Botões de Ação (Validar/Recusar)
                let htmlAcoesItem = '';
                if (precisaValidar) {
                    if (decisoesValidacao[r.id]) {
                        const dec = decisoesValidacao[r.id];
                        const cor = dec.status === 'aprovado' ? '#28a745' : '#dc3545';
                        const icone = dec.status === 'aprovado' ? 'fa-check' : 'fa-times';
                        const txt = dec.status === 'aprovado' ? 'Validado para envio' : 'Marcado para recusa';
                        
                        htmlAcoesItem = `
                            <div style="margin-top:15px; padding:10px; background:${cor}20; color:${cor}; border:1px solid ${cor}; border-radius:6px; text-align:center; font-weight:bold;">
                                <i class="fas ${icone}"></i> ${txt}
                                <br><small style="color:#666; font-weight:normal;">(Será enviado ao clicar em Concluir)</small>
                            </div>
                        `;
                    } else {
                        htmlAcoesItem = `
                            <div id="acoes-item-${r.id}" style="margin-top: 15px; border-top: 1px solid #eee; padding-top: 10px; display:flex; gap: 10px;">
                                <button onclick="prepararRecusaItem(${r.id})" style="flex:1; padding:10px; border:1px solid #dc3545; color:#dc3545; background:#fff; border-radius:6px; font-weight:bold; cursor:pointer;">
                                    <i class="fas fa-times"></i> Recusar
                                </button>
                                <button onclick="registrarValidacaoLocal(${r.id})" style="flex:1; padding:10px; border:none; color:#fff; background:#28a745; border-radius:6px; font-weight:bold; box-shadow:0 2px 5px rgba(40,167,69,0.3); cursor:pointer;">
                                    <i class="fas fa-check"></i> Validar
                                </button>
                            </div>
                            <div id="msg-feedback-${r.id}" style="display:none; margin-top:10px; font-weight:bold; text-align:center; padding: 8px; border-radius: 4px;"></div>
                        `;
                    }
                }

                card.innerHTML = `
                    <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                        <span style="font-weight:600; font-size:0.95rem; line-height:1.2; padding-right:10px;">${r.itens_checklist?.pergunta}</span>
                        <span style="color:${corTextoStatus}; font-weight:bold; font-size:0.8rem; white-space:nowrap;">${labelStatus}</span>
                    </div>
                    ${htmlObs} ${htmlSolucao} ${botoesFotos} ${htmlAcoesItem}
                `;
                containerItens.appendChild(card);
            });
        });

        if (isModoValidacao && fValid) {
            if (listaItensParaValidar.length > 0) {
                fValid.innerHTML = `
                    <button class="btn-save-final" id="btn-finalizar-batch" style="opacity:1; background:#fd7e14; transition: all 0.3s;">
                        <i class="fas fa-arrow-down"></i> RESTAM ${listaItensParaValidar.length} ITENS
                    </button>
                `;
                fValid.style.display = 'flex';
                fValid.setAttribute('data-id', inspecaoId);
                document.getElementById('btn-finalizar-batch').onclick = focarProximaPendencia;
            }
        }

    } catch (err) {
        console.error(err);
        showModal("Erro: " + err.message, "Erro");
    } finally {
        toggleLoader(false);
    }
};


// --- DADOS (NOVO CHECKLIST) ---
async function carregarVeiculos() {
    // 1. Garante que temos os dados do banco carregados
    if (!perfilMotorista) await carregarPerfil();

    const sel = document.getElementById('sel-veiculo');
    if (!sel) return;

    sel.innerHTML = '<option value="">Carregando frota...</option>';
    sel.disabled = true;

    try {
        // [CORREÇÃO] Removemos o eq('ativo', true) da query para ter a frota completa no cache.
        // Isso preserva os dados para validações de histórico e KM.
        let query = clienteSupabase
            .from('veiculos')
            .select('*')
            .order('placa');

        const funcao = perfilMotorista.funcao || '';
        const isManutencao = ['manutencao', 'manutentor', 'analista'].includes(funcao);
        const temLista = perfilMotorista.listaUnidades && perfilMotorista.listaUnidades.length > 0;

        if (isManutencao && temLista) {
            query = query.in('unidade_id', perfilMotorista.listaUnidades);
        } 
        else {
            if (perfilMotorista.unidade_id) {
                query = query.eq('unidade_id', perfilMotorista.unidade_id);
            } else {
                console.warn("Usuário sem unidade vinculada.");
                sel.innerHTML = '<option value="" disabled>Seu cadastro não possui unidade</option>';
                sel.disabled = false;
                return; 
            }
        }

        const { data, error } = await query;
        if (error) throw error;

        veiculosCache = data || [];
        sel.innerHTML = '<option value="">Selecione...</option>';

        // [LÓGICA VISUAL] Filtra APENAS os veículos ativos para o motorista iniciar a viagem
        const veiculosAtivos = veiculosCache.filter(v => v.ativo === true);

        if (veiculosAtivos.length === 0) {
            sel.innerHTML += '<option value="" disabled>Nenhum veículo disponível</option>';
        } else {
            veiculosAtivos.forEach(v => {
                sel.innerHTML += `<option value="${v.id}">${v.placa} - ${v.modelo || 'Modelo'}</option>`;
            });
        }

    } catch (e) {
        console.error("Erro ao carregar veículos:", e);
        sel.innerHTML = '<option value="">Erro ao carregar</option>';
        if (typeof showModal === 'function') showModal('Erro: ' + e.message, 'Erro');
    } finally {
        sel.disabled = false;
    }
}

async function carregarModelos() {
    try {
       
        const { data, error } = await clienteSupabase.from('modelos_checklist').select('*');
        if (error) throw error;
        modelosCache = data || [];
    } catch (e) {
        console.error("Erro ao carregar modelos:", e);
        modelosCache = [];
    }
}

window.detectarModeloChecklist = async function() {
    const selVeiculo = document.getElementById('sel-veiculo');
    const box = document.getElementById('modelo-info');
    const containerDuplicado = document.getElementById('container-selecao-modelo');
    const lblUnico = document.getElementById('lbl-checklist-unico');
    const veiculoId = selVeiculo.value;
    
    if (!veiculoId) { 
        box.style.display = 'none'; 
        return; 
    }

    try {
        const { data: vAtual, error: errV } = await clienteSupabase
            .from('veiculos')
            .select('id, km_atual, marca, modelo')
            .eq('id', veiculoId)
            .single();

        if (errV) throw errV;

        const { data: vinculosRaw, error: errVinculo } = await clienteSupabase
            .from('checklist_veiculos')
            .select('modelo_id')
            .eq('veiculo_id', veiculoId);

        if (errVinculo) throw errVinculo;

        // [CORREÇÃO] Injeta o título e verifica se o modelo está ATIVO
        const vinculos = (vinculosRaw || []).map(v => {
            const mod = modelosCache.find(m => m.id === v.modelo_id);
            return {
                modelo_id: v.modelo_id,
                modelos_checklist: { 
                    titulo: mod ? mod.titulo : 'Checklist',
                    ativo: mod ? mod.ativo : false 
                }
            };
        }).filter(v => v.modelos_checklist.ativo === true); // Ignora modelos inativos!

        if (vinculos && vinculos.length > 0) {
            document.getElementById('lbl-marca').innerText = vAtual.marca || 'MARCA N/A';
            document.getElementById('lbl-modelo').innerText = vAtual.modelo || 'MODELO N/A';
            box.style.display = 'block';

            if (vinculos.length === 1) {
                modeloSelecionadoId = vinculos[0].modelo_id;
                containerDuplicado.style.display = 'none';
                lblUnico.style.display = 'block';
                document.getElementById('lbl-checklist-nome').innerText = vinculos[0].modelos_checklist.titulo;
            } else {
                modeloSelecionadoId = null; // Reseta para forçar a escolha
                lblUnico.style.display = 'none';
                containerDuplicado.style.display = 'block';
                
                const selectDuplicado = document.getElementById('sel-modelo-duplicado');
                selectDuplicado.innerHTML = '<option value="">-- Escolha o tipo de Checklist --</option>';
                
                vinculos.forEach(v => {
                    const opt = document.createElement('option');
                    opt.value = v.modelo_id;
                    opt.innerText = v.modelos_checklist.titulo;
                    selectDuplicado.appendChild(opt);
                });
            }

            const { data: lastInsp } = await clienteSupabase
                .from('inspecoes')
                .select('data_abertura')
                .eq('veiculo_id', veiculoId)
                .order('data_abertura', { ascending: false })
                .limit(1)
                .maybeSingle();

            let lastDate = 'Nunca Realizado';
            if (lastInsp) {
                lastDate = new Date(lastInsp.data_abertura).toLocaleString('pt-BR', { 
                    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' 
                });
            }

            const kmDisplay = vAtual.km_atual ? parseInt(vAtual.km_atual).toLocaleString('pt-BR') : '0';
            document.getElementById('lbl-last-date').innerHTML = `${lastDate} <br> <span style="color:#333; font-weight:bold; font-size:0.8rem;"><i class="fas fa-tachometer-alt" style="color:var(--cor-primary)"></i> ${kmDisplay} km</span>`;

        } else {
            showModal('Este veículo não possui nenhum modelo de checklist ATIVO vinculado.', 'Aviso');
            box.style.display = 'none';
        }
    } catch (err) { 
        console.error(err);
        showModal('Erro ao validar veículo.', 'Erro');
    }
}

// --- 2. NOVA FUNÇÃO PARA SELEÇÃO MANUAL ---
window.selecionarModeloManual = function(id) {
    if (id) {
        modeloSelecionadoId = id;
        console.log("Modelo definido manualmente:", id);
    } else {
        modeloSelecionadoId = null;
    }
}

// --- EXECUÇÃO (NOVO) ---
window.iniciarConferencia = async function() {
    const kmInput = document.getElementById('inp-km');
    const kmVal = parseInt(kmInput.value);
    const vid = document.getElementById('sel-veiculo').value;

    // 1. Validações Básicas
    if (!kmInput.value || !vid || !modeloSelecionadoId) {
        showModal("Preencha o veículo e o KM atual.", "Atenção");
        return;
    }

    // 2. [NOVO] Validação de KM Regressivo
    // Busca o veículo no cache (carregado no início) para ver o último KM
    const veiculo = veiculosCache.find(v => v.id == vid);
    
    if (veiculo && veiculo.km_atual) {
        if (kmVal < veiculo.km_atual) {
            showModal(`O KM informado <b>(${kmVal})</b> não pode ser menor que o último registrado no sistema <b>(${veiculo.km_atual})</b>.`, "KM Inválido");
            kmInput.classList.add('error-bounce'); // Opcional: efeito visual se tiver CSS
            kmInput.focus();
            return;
        }
    }

    // --- 3. Carregamento dos Itens ---
    toggleLoader(true);

    try {
        const { data: itens } = await clienteSupabase
            .from('itens_checklist')
            .select('*, categorias_checklist(nome, ordem)')
            .eq('modelo_id', modeloSelecionadoId)
            .eq('ativo', true)
            .order('ordem');

        itensModeloAtual = (itens || []).sort((a,b) => {
            const oA = a.categorias_checklist?.ordem || 0;
            const oB = b.categorias_checklist?.ordem || 0;
            return oA - oB || a.ordem - b.ordem;
        });

        renderizarPerguntasForm(itensModeloAtual);

        document.getElementById('step-dados').style.display = 'none';
        document.getElementById('footer-start').style.display = 'none';
        
        document.getElementById('step-itens').style.display = 'block';
        document.getElementById('footer-save').style.display = 'block';
        
        formChecklistSujo = false; 
        window.scrollTo(0, 0);
    } catch (e) {
        console.error(e);
        showModal("Erro ao carregar itens: " + e.message, "Erro");
    } finally {
        toggleLoader(false);
    }
}

function renderizarPerguntasForm(itens) {
    const container = document.getElementById('container-perguntas');
    let lastCat = '';
    let htmlContent = ''; // Acumula HTML para não travar o carregamento

    itens.forEach(item => {
        const cat = item.categorias_checklist?.nome || 'Geral';
        if (cat !== lastCat) {
            htmlContent += `<div class="category-title" style="margin-top: 30px; margin-bottom: 10px; padding-left: 5px;">${cat}</div>`;
            lastCat = cat;
        }

        let badges = '';
        if (item.exige_foto) badges += `<span style="font-size:0.75rem; color:#856404; background:#fff3cd; padding:2px 6px; border-radius:4px; margin-right:5px;"><i class="fas fa-camera"></i> Foto Obrigatória</span>`;
        if (item.bloqueia_viagem) badges += `<span style="font-size:0.75rem; color:#721c24; background:#f8d7da; padding:2px 6px; border-radius:4px;"><i class="fas fa-hand-paper"></i> Crítico</span>`;
        const htmlBadges = badges ? `<div style="margin-bottom:8px;">${badges}</div>` : '';

        let inputHtml = '';
        if (item.tipo_resposta === 'selecao' && item.opcoes_resposta) {
            let btns = '';
            item.opcoes_resposta.forEach(opt => {
                btns += `<div class="sel-btn" onclick="selOption(${item.id}, '${opt}', this, '${item.opcao_nok || ''}', ${item.bloqueia_viagem})">${opt}</div>`;
            });
            inputHtml = `<div class="selection-grid" id="grid-${item.id}" style="margin-bottom:15px;">${btns}</div>`;
        } 
        else if (item.tipo_resposta === 'texto') {
            inputHtml = `<textarea class="form-control" rows="2" placeholder="Sua resposta..." onchange="setResp(${item.id}, this.value, null, false)" style="background:#f8f9fa; border:1px solid #e9ecef;"></textarea>`;
        } 
        else {
            inputHtml = `
                <div class="toggle-options" style="margin-bottom:10px;">
                    <div class="opt-btn" onclick="setResp(${item.id}, 'OK', this, ${item.bloqueia_viagem})">
                        <i class="fas fa-thumbs-up"></i> Conforme
                    </div>
                    <div class="opt-btn" onclick="setResp(${item.id}, 'NOK', this, ${item.bloqueia_viagem})">
                        <i class="fas fa-thumbs-down"></i> Não Conforme
                    </div>
                </div>
            `;
        }

        htmlContent += `
            <div class="history-card" id="card-${item.id}" style="padding: 20px; border-left: 5px solid #ccc;">
                <div class="q-title" style="font-size: 1rem; margin-bottom: 5px; color: #333;">${item.pergunta}</div>
                ${htmlBadges}
                ${inputHtml}
                
                <div id="alert-block-${item.id}" class="alert-block-viagem">
                    <i class="fas fa-ban"></i> ATENÇÃO: Este item impede o início da viagem!
                </div>

                <div id="obs-area-${item.id}" class="obs-area" style="display:none; background: #fff3cd; padding: 15px; border-radius: 8px; margin-top: 10px; border: 1px solid #ffeeba;">
                    <label style="font-size:0.8rem; font-weight:bold; color:#856404; display:block; margin-bottom:5px;">Observação / Motivo</label>
                    <textarea class="form-control" id="txt-${item.id}" rows="2" placeholder="Descreva o problema..." style="background:#fff;"></textarea>
                    
                    <input type="file" id="file-${item.id}" style="display:none" onchange="fotoOk(${item.id})">
                    <button type="button" class="btn-save-final" id="btn-foto-${item.id}" 
                        onclick="document.getElementById('file-${item.id}').click()" 
                        style="margin-top:10px; font-size:0.9rem; padding:10px; background: #fff; color: #333; border: 1px solid #ccc; box-shadow:none;">
                        <i class="fas fa-camera"></i> Adicionar Foto ${item.exige_foto ? '<b>(Obrigatório)</b>' : ''}
                    </button>
                </div>
                <input type="hidden" id="resp-${item.id}">
            </div>
        `;
    });
    
    container.innerHTML = htmlContent;
}

// --- MANIPULAÇÃO DO FORM ---
window.setResp = function(id, val, el, bloqueiaViagem) {
    formChecklistSujo = true;
    document.getElementById(`resp-${id}`).value = val;
    const card = document.getElementById(`card-${id}`);
    const obsArea = document.getElementById(`obs-area-${id}`);
    const alertBlock = document.getElementById(`alert-block-${id}`);
    
    // Busca info se exige foto
    const item = itensModeloAtual.find(i => i.id == id);

    if (el && el.classList.contains('opt-btn')) {
        card.querySelectorAll('.opt-btn').forEach(b => b.classList.remove('active-ok', 'active-nok'));
        
        if(val === 'OK') {
            el.classList.add('active-ok');
            card.style.borderLeftColor = 'var(--cor-ok)';
            if(alertBlock) alertBlock.style.display = 'none';
            
            obsArea.style.display = (item && item.exige_foto) ? 'block' : 'none';
        } else {
            el.classList.add('active-nok');
            obsArea.style.display = 'block';
            card.style.borderLeftColor = 'var(--cor-nok)';
            
            // Exibe alerta se bloqueia viagem
            if(bloqueiaViagem && alertBlock) alertBlock.style.display = 'block';
            
            setTimeout(() => document.getElementById(`txt-${id}`).focus(), 100);
        }
    }
}

window.selOption = function(id, val, el, opcaoNok, bloqueiaViagem) {
    formChecklistSujo = true;
    
    // Atualiza input oculto
    document.getElementById(`resp-${id}`).value = val;
    
    // Atualiza visual dos botões
    const grid = document.getElementById(`grid-${id}`);
    grid.querySelectorAll('.sel-btn').forEach(b => b.classList.remove('selected'));
    el.classList.add('selected');
    
    // --- LÓGICA SANEADA (SIMPLIFICADA) ---
    // Verifica apenas se o valor selecionado é IGUAL à opção definida como NOK
    const isNok = (opcaoNok && val === opcaoNok);
    
    const card = document.getElementById(`card-${id}`);
    const alertBlock = document.getElementById(`alert-block-${id}`);
    const obsArea = document.getElementById(`obs-area-${id}`);
    const item = itensModeloAtual.find(i => i.id == id);

    if (isNok) {
        // Se for NOK: Vermelho e abre observação
        obsArea.style.display = 'block';
        card.style.borderLeftColor = 'var(--cor-nok)';
        if(bloqueiaViagem && alertBlock) alertBlock.style.display = 'block';
    } else {
        // Se for OK: Verde ou Cinza
        if(alertBlock) alertBlock.style.display = 'none';
        
        // Mantém obs aberta apenas se o item exigir foto mesmo estando OK
        if(item && item.exige_foto) {
             obsArea.style.display = 'block';
             card.style.borderLeftColor = 'var(--cor-ok)'; 
        } else {
             obsArea.style.display = 'none';
             card.style.borderLeftColor = '#ccc'; 
        }
    }
}

window.fotoOk = function(id) {
    const btn = document.getElementById(`btn-foto-${id}`);
    btn.style.borderColor = 'green';
    btn.style.color = 'green';
    btn.innerHTML = '<i class="fas fa-check"></i> Foto OK';
}

window.finalizarInspecao = async function() {
    let statusGeral = 'concluido'; 
    let payload = [];
    let itemBloqueanteEncontrado = false;

    document.querySelectorAll('.history-card').forEach(c => c.style.borderLeft = "");

    for (const item of itensModeloAtual) {
        const id = item.id;
        const val = document.getElementById(`resp-${id}`).value;
        const obsInput = document.getElementById(`txt-${id}`);
        const obs = obsInput ? obsInput.value.trim() : '';
        const fileInput = document.getElementById(`file-${id}`);
        const temFoto = fileInput && fileInput.files.length > 0;

        if (!val) {
            showModal(`Responda o item: "<b>${item.pergunta}</b>"`, "Atenção");
            marcarErroCard(id);
            return;
        }

        if (item.exige_foto && !temFoto) {
            showModal(`O item "<b>${item.pergunta}</b>" exige uma foto obrigatória.`, "Foto Necessária");
            marcarErroCard(id);
            const obsArea = document.getElementById(`obs-area-${id}`);
            if(obsArea) obsArea.style.display = 'block';
            return;
        }

        // --- LÓGICA DE DETECÇÃO (Onde decidimos se é NOK) ---
        let isNok = false;

        if (item.tipo_resposta === 'selecao') {
            // Múltipla escolha: NOK apenas se bater com a configuração
            if (item.opcao_nok && val === item.opcao_nok) {
                isNok = true;
            }
        } else {
            // Binário: NOK apenas se for 'NOK'
            if (val === 'NOK') {
                isNok = true;
            }
        }

        if (isNok) {
            statusGeral = 'pendente'; 

            if (!temFoto) {
                showModal(`Divergência em "<b>${item.pergunta}</b>": Foto obrigatória.`, "Evidência Necessária");
                marcarErroCard(id);
                return;
            }
            if (!obs) {
                showModal(`Divergência em "<b>${item.pergunta}</b>": Descreva o problema.`, "Descrição Necessária");
                marcarErroCard(id);
                const obsArea = document.getElementById(`obs-area-${id}`);
                if(obsArea) obsArea.style.display = 'block';
                obsInput.focus();
                return;
            }
            
            if (item.bloqueia_viagem) {
                itemBloqueanteEncontrado = true;
            }
        }

        payload.push({
            item_id: id,
            resposta: val,
            obs: obs,
            file: temFoto ? fileInput.files[0] : null,
            // [CORREÇÃO CRÍTICA] Enviamos a decisão tomada aqui para a função de salvar
            is_nok_validado: isNok 
        });
    }

    if (itemBloqueanteEncontrado) {
        statusGeralPendente = 'pendente'; 
        payloadPendente = payload;
        abrirModalBloqueio(); 
    } else {
        executarEnvioBanco(payload, statusGeral);
    }
}

// --- UTILS ---
window.abrirNovaInspecao = function() {
    // Cria o ponto de retorno no histórico
    history.pushState({ screen: 'novo-checklist' }, "Novo Checklist", "#novo-checklist");

    modoVisualizacao = false;
    document.getElementById('titulo-tela-exec').innerText = "Novo Checklist";
    
    const telaExec = document.getElementById('tela-execucao');
    telaExec.style.display = 'flex';
    
    // Reseta visualização
    document.getElementById('step-dados').style.display = 'block';
    document.getElementById('step-itens').style.display = 'none';
    
    // Configura botões de ação
    document.getElementById('footer-start').style.display = 'block'; 
    document.getElementById('footer-save').style.display = 'none';    
    
    const footerValidacao = document.getElementById('footer-validacao');
    if (footerValidacao) footerValidacao.style.display = 'none';
    
    // Limpa campos
    const selVeiculo = document.getElementById('sel-veiculo');
    if (selVeiculo) selVeiculo.value = "";
    document.getElementById('inp-km').value = "";
    const modInfo = document.getElementById('modelo-info');
    if(modInfo) modInfo.style.display = 'none';
    
    // Garante lista de veículos atualizada
    carregarVeiculos(); 
}

window.fecharExecucao = function(veioDoBrowser = false) {
    const telaExec = document.getElementById('tela-execucao');
    const fValid = document.getElementById('footer-validacao');
    
    // --- VERIFICAÇÕES DE PERDA DE DADOS ---
    
    // A. Modo Validação (Manutenção devolveu -> Motorista valida)
    const emModoValidacao = fValid && fValid.style.display !== 'none';
    const temDecisoesPendentes = Object.keys(decisoesValidacao).length > 0;

    // B. Modo Criação (Novo Checklist sendo preenchido)
    // Se não é validação e a flag de "sujo" está true
    const emModoCriacao = !emModoValidacao;
    const temFormularioSujo = formChecklistSujo === true;

    // Se houver qualquer pendência (Validação ou Criação)
    if ((emModoValidacao && temDecisoesPendentes) || (emModoCriacao && temFormularioSujo)) {
        
        // TRUQUE DO HISTÓRICO:
        // Se o usuário apertou o botão voltar físico (veioDoBrowser=true), o navegador JÁ voltou a página.
        // Nós precisamos "empurrar" o histórico para frente de novo, para cancelar essa saída
        // e manter o usuário na tela enquanto ele decide no Modal.
        if (veioDoBrowser) {
            const hashAtual = emModoValidacao ? '#detalhes' : '#novo-checklist';
            history.pushState({ screen: 'travado' }, "Atenção", hashAtual);
        }

        // Abre o modal perguntando se quer mesmo sair
        abrirModalSaida(emModoValidacao ? 'validacao' : 'criacao');
        return; // Interrompe o fechamento
    }

    // --- SE NÃO HOUVER PENDÊNCIAS (OU CONFIRMOU SAÍDA) ---
    
    telaExec.style.display = 'none';
    
    // Só volta o histórico manualmente se clicou no botão "X" da tela.
    // Se veio do botão físico, o navegador já voltou sozinho.
    if (!veioDoBrowser) {
        history.back();
    }
    
    // Limpeza Geral
    const container = document.getElementById('container-perguntas');
    if(container) container.innerHTML = '';
    decisoesValidacao = {}; 
    formChecklistSujo = false;
}

window.logoutApp = async function() {
    await clienteSupabase.auth.signOut();
    window.location.href = '../index.html';
}

async function executarEnvioBanco(payload, statusGeral) {
    const btn = document.querySelector('#footer-save button');
    let txtOriginal = '<i class="fas fa-save"></i> SALVAR CHECKLIST';
    
    if (btn) {
        txtOriginal = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
        btn.disabled = true;
    }

    try {
        const kmInput = parseInt(document.getElementById('inp-km').value) || 0;
        const veiculoId = document.getElementById('sel-veiculo').value;

        // 1. Cria Header
        const dadosInspecao = {
            modelo_id: modeloSelecionadoId,
            veiculo_id: veiculoId,
            motorista_id: usuarioAtual.id,
            km_atual: kmInput,
            data_abertura: new Date().toISOString(),
            status: statusGeral
        };

        if (statusGeral === 'concluido') dadosInspecao.data_resolucao = new Date().toISOString();

        const { data: insp, error: e1 } = await clienteSupabase.from('inspecoes').insert([dadosInspecao]).select().single();
        if(e1) throw e1;
        
        const inspId = insp.id;
        const numControle = insp.numero_controle || inspId;

        if (kmInput > 0) await clienteSupabase.from('veiculos').update({ km_atual: kmInput }).eq('id', veiculoId);

        // 2. Prepara Itens e LOG DETALHADO
        const respostasParaBanco = [];
        const linhasLog = []; 

        // Loop nos itens para Upload e Compressão
        for (const p of payload) {
            let url = null;
            
            if (p.file) {
                try {
                    // Verifica se a função existe antes de tentar usar
                    if (typeof window.comprimirImagem !== 'function') {
                        throw new Error("Função de compressão não encontrada no script.");
                    }

                    console.log(`Iniciando compressão item ${p.item_id} (Original: ${(p.file.size/1024).toFixed(0)}KB)...`);
                    
                    // TENTA COMPRIMIR
                    const arquivoComprimido = await window.comprimirImagem(p.file);
                    
                    // Se chegou aqui, funcionou. Define nome .jpg
                    const path = `${usuarioAtual.id}/${Date.now()}_${p.item_id}.jpg`;
                    
                    const { error: errUp } = await clienteSupabase.storage
                        .from('comprovantes')
                        .upload(path, arquivoComprimido, { upsert: true });

                    if (!errUp) {
                        const { data } = clienteSupabase.storage.from('comprovantes').getPublicUrl(path);
                        url = data.publicUrl;
                        console.log(`Upload Comprimido OK: ${url}`);
                    } else {
                        throw errUp; // Joga para o catch para tentar o original
                    }

                } catch (errComp) {
                    console.error("FALHA NA COMPRESSÃO/UPLOAD. Enviando original...", errComp);
                    
                    // FALLBACK: Envia o arquivo original se a compressão falhar
                    const ext = p.file.name.split('.').pop();
                    const pathOriginal = `${usuarioAtual.id}/${Date.now()}_${p.item_id}_orig.${ext}`;
                    
                    const { error: errUpOriginal } = await clienteSupabase.storage
                        .from('comprovantes')
                        .upload(pathOriginal, p.file); // Envia p.file (original)
                        
                    if (!errUpOriginal) {
                        const { data } = clienteSupabase.storage.from('comprovantes').getPublicUrl(pathOriginal);
                        url = data.publicUrl;
                    }
                }
            }
            
            const isConforme = p.is_nok_validado ? false : true;
            
            if (!isConforme) {
                 const itemDef = itensModeloAtual.find(i => i.id == p.item_id);
                 if (itemDef) {
                     linhasLog.push(`Item: ${itemDef.pergunta} | Status: ${p.resposta}`);
                 }
            }

            respostasParaBanco.push({ 
                inspecao_id: inspId, 
                item_id: p.item_id, 
                resposta_valor: p.resposta, 
                observacao_motorista: p.obs || null, 
                foto_url: url,
                is_conforme: isConforme 
            });
        }

        const { error: e2 } = await clienteSupabase.from('respostas_inspecao').insert(respostasParaBanco);
        if (e2) throw e2;
        
        // 3. Monta o Log
        let msgLog = `Checklist #${numControle} criado.\nStatus: ${statusGeral.toUpperCase()}.\nKM: ${kmInput}.`;
        
        if (linhasLog.length > 0) {
            msgLog += `\n\nITENS COM APONTAMENTO:\n${linhasLog.join('\n')}`;
        }
        
        await registrarLog(inspId, 'CRIADO', msgLog);

        let tituloMsg = 'Sucesso!';
        let corpoMsg = `Checklist <b>#${numControle}</b> enviado.`;
        if(statusGeral === 'pendente') corpoMsg += `<br><br><span style="color:orange;">⚠ Foram apontadas divergências.</span>`;
        else corpoMsg += `<br><br><span style="color:green;">✔ Veículo Liberado.</span>`;
        
        formChecklistSujo = false;
        fecharExecucao();
        carregarHistorico();
        showModal(corpoMsg, tituloMsg);

    } catch (e) {
        console.error(e);
        showModal("Erro ao salvar: " + e.message, "Erro");
    } finally {
        if (btn) {
            btn.innerHTML = txtOriginal;
            btn.disabled = false;
        }
    }
}

function toggleLoader(show) {
    const loader = document.getElementById('loading-overlay');
    if (loader) loader.style.display = show ? 'flex' : 'none';
}

function fecharModalSaida() {
    document.getElementById('modalConfirmacaoSaida').classList.remove('active');
}

function confirmarSaidaSemSalvar() {
    document.getElementById('modalConfirmacaoSaida').classList.remove('active');
    
    // Limpa travas
    formChecklistSujo = false; 
    decisoesValidacao = {};

    // Volta o histórico (que remove o estado do modal #confirmar-saida)
    history.back();
    
    // Pequeno delay para garantir que o evento popstate processe o fechamento da tela
    setTimeout(() => {
        const telaExec = document.getElementById('tela-execucao');
        if (telaExec && telaExec.style.display === 'flex') {
            fecharExecucao(true); // Força fechamento da tela
        }
    }, 100);
}

// --- VISUALIZADOR DE FOTOS ---
window.abrirModalImagem = function(url) {
    const modal = document.getElementById('modal-imagem');
    const img = document.getElementById('img-preview');
    
    // Evita abrir se não tiver URL
    if (!url) return;

    img.src = url;
    modal.style.display = 'flex'; // Usamos display flex para centralizar
    
    // Pequena animação de entrada
    setTimeout(() => modal.classList.add('active'), 10);
}

window.fecharModalImagem = function() {
    const modal = document.getElementById('modal-imagem');
    modal.style.display = 'none';
    modal.classList.remove('active');
    document.getElementById('img-preview').src = ""; // Limpa para não piscar a antiga na próxima
}

window.validarCorrecao = async function(acao) {
    const footer = document.getElementById('footer-validacao');
    const idInsp = footer.getAttribute('data-id');
    
    if(!idInsp) return;

    if (acao === 'aprovar') {
        abrirModalAprovacao();
    } 
    else if (acao === 'reprovar') {
        // Agora abre o modal customizado em vez do prompt
        abrirModalRecusa();
    }
}

function abrirModalAprovacao() {
    document.getElementById('modalConfirmacaoAprovacao').classList.add('active');
}

function fecharModalAprovacao() {
    document.getElementById('modalConfirmacaoAprovacao').classList.remove('active');
}

function abrirModalRecusa() {
    document.getElementById('txt-motivo-recusa').value = ''; // Limpa o campo
    document.getElementById('modalRecusa').classList.add('active');
    
    // Foca no campo de texto automaticamente
    setTimeout(() => {
        document.getElementById('txt-motivo-recusa').focus();
    }, 100);
}

function fecharModalRecusa() {
    document.getElementById('modalRecusa').classList.remove('active');
}

/*async function confirmarRecusa() {
    const inputMotivo = document.getElementById('txt-motivo-recusa');
    const motivo = inputMotivo.value.trim();
    
    if (!motivo) {
        fecharModalRecusa(); 
        showModal("É obrigatório informar o motivo da recusa.", "Campo Vazio", () => {
            abrirModalRecusa(); 
        });
        return;
    }

    fecharModalRecusa();
    const footer = document.getElementById('footer-validacao');
    const idInsp = footer.getAttribute('data-id');

    toggleLoader(true);
    
    try {
        // [LOG GRANULAR] Grava exatamente o que o motorista escreveu
        await registrarLog(idInsp, 'RECUSA', `Motorista rejeitou a solução. Motivo: "${motivo}"`);

        // Atualiza status para voltar para manutenção
        const { data: atual } = await clienteSupabase.from('inspecoes').select('parecer_tecnico').eq('id', idInsp).single();
        const novoParecer = (atual.parecer_tecnico || '') + `\n[RECUSA ${new Date().toLocaleDateString()}]: ${motivo}`;

        const { error: e1 } = await clienteSupabase.from('inspecoes').update({
            status: 'em_analise', 
            parecer_tecnico: novoParecer
        }).eq('id', idInsp);

        if (e1) throw e1;

        // Reseta os itens NOK para voltarem para a fila do admin
        const { error: errItens } = await clienteSupabase
            .from('respostas_inspecao')
            .update({ 
                obs_resolucao: null,        
                data_resolucao_item: null,  
                resolvido_por: null         
            })
            .eq('inspecao_id', idInsp)
            .in('resposta_valor', ['NOK', 'Não Conforme', 'Ruim', 'Defeito']); 

        if(errItens) throw errItens;
        
        showModal("Checklist devolvido para a manutenção.", "Devolvido", () => {
            fecharExecucao(); 
            carregarHistorico();
        });

    } catch(e) {
        console.error(e);
        showModal("Erro ao reprovar: " + (e.message || "Erro desconhecido"), "Erro");
    } finally {
        toggleLoader(false);
    }
}*/

function tocarSomNotificacao() {
    // Caminho relativo ao admin/index.html
    const audio = new Audio("sounds/alert.mp3");
    audio.volume = 1.0;
    
    const playPromise = audio.play();
    if (playPromise !== undefined) {
        playPromise.catch(error => {
            console.warn("Áudio bloqueado (interaja com a página para liberar):", error);
        });
    }
}

async function confirmarAprovacao() {
    fecharModalAprovacao();
    const footer = document.getElementById('footer-validacao');
    const idInsp = footer ? footer.getAttribute('data-id') : null;
    
    if (!idInsp) return;
    
    toggleLoader(true);

    try {
        const { error } = await clienteSupabase
            .from('inspecoes')
            .update({
                status: 'corrigido', // [MUDANÇA] Status explícito solicitado
                data_validacao: new Date().toISOString()
            })
            .eq('id', idInsp);

        if (error) throw error;
        
        await registrarLog(idInsp, 'APROVADO', 'Solução validada. Status alterado para Corrigido.');
        
        formChecklistSujo = false;
        fecharExecucao();    
        carregarHistorico(); 

        showModal("Solução validada com sucesso.", "Checklist Corrigido");

    } catch(e) {
        console.error(e);
        showModal("Erro ao aprovar: " + e.message, "Erro");
    } finally {
        toggleLoader(false);
    }
}

async function registrarLog(inspecaoId, acao, mensagem) {
    try {
        if (!usuarioAtual) return;

        const { error } = await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'inspecoes',
            id_registro_afetado: String(inspecaoId),
            acao: acao,
            usuario_id: usuarioAtual.id,
            data_hora: new Date().toISOString(),
            dados_novos: { "descricao": mensagem }
        });

        if (error) console.error("Erro silencioso ao gravar log:", error);

    } catch (err) {
        console.error("Erro interno ao gravar log:", err);
    }
}

// app/js/driver_app.js

// Ação: Motorista clica em "Validar" num item específico
window.validarItemIndividual = function(respostaId) {
    // 1. Visual: Some botões, mostra mensagem de sucesso
    document.getElementById(`acoes-item-${respostaId}`).style.display = 'none';
    document.getElementById(`msg-validado-${respostaId}`).style.display = 'block';
    
    // 2. Visual: Pinta a borda do card de verde para dar feedback positivo
    document.getElementById(`card-validacao-${respostaId}`).style.borderLeftColor = '#28a745';

    // 3. Lógica: Incrementa contador
    itensValidadosCount++;
    
    // 4. Verifica se acabou
    checarStatusValidacao();
}

// Verifica se todos os itens pendentes foram validados
function checarStatusValidacao() {
    const btnFinalizar = document.getElementById('btn-finalizar-global');
    if (!btnFinalizar) return;

    if (itensValidadosCount >= itensPendentesValidacao.length) {
        // Habilita o botão final
        btnFinalizar.disabled = false;
        btnFinalizar.style.opacity = '1';
        // Feedback sonoro/vibratório leve
        if (navigator.vibrate) navigator.vibrate(50);
    } else {
        btnFinalizar.disabled = true;
        btnFinalizar.style.opacity = '0.5';
    }
}

// Ação: Motorista clica em "Recusar" num item específico
window.recusarItemIndividual = function(respostaId, inspecaoId) {
    // Guarda o ID do item que está sendo recusado
    itemSendoRecusadoId = respostaId;
    
    // Abre o modal de motivo (reutilizando o existente)
    // Certifique-se que o botão "Confirmar" desse modal chama 'confirmarRecusa()'
    abrirModalRecusa(); 
}

// Ação: Motorista clica no botão final (após validar todos os itens)
window.confirmarAprovacaoGlobal = async function() {
    // Chama a função que já criamos anteriormente para gravar 'corrigido' no banco
    confirmarAprovacao(); 
}

window.confirmarRecusa = async function() {
    const inputMotivo = document.getElementById('txt-motivo-recusa');
    const motivo = inputMotivo ? inputMotivo.value.trim() : '';

    if (!motivo) {
        fecharModalRecusa();
        showModal("É obrigatório descrever o motivo.", "Atenção", () => abrirModalRecusa());
        return;
    }

    if (itemSendoRecusadoId) {
        fecharModalRecusa();
        toggleLoader(true);
        
        try {
            const { data: itemAtual } = await clienteSupabase
                .from('respostas_inspecao')
                .select('observacao_motorista, obs_resolucao, foto_resolucao')
                .eq('id', itemSendoRecusadoId)
                .single();

            const textoOriginal = itemAtual?.observacao_motorista || '';
            let resolucaoAnterior = itemAtual?.obs_resolucao || '(Sem texto)';
            
            // [NOVO] Adiciona link da foto ao texto
            if (itemAtual?.foto_resolucao) {
                resolucaoAnterior += `\n[FOTO_RES::${itemAtual.foto_resolucao}]`;
            }

            const dataHoje = new Date().toLocaleString('pt-BR');
            const novoBloco = `
_______________________
[🔧 MANUTENÇÃO - ${dataHoje}]:
${resolucaoAnterior}

[❌ RECUSA - ${dataHoje}]:
${motivo}`;

            const { error: errItem } = await clienteSupabase
                .from('respostas_inspecao')
                .update({
                    obs_resolucao: null,
                    foto_resolucao: null,
                    data_resolucao_item: null,
                    resolvido_por: null,
                    is_conforme: false,
                    observacao_motorista: textoOriginal + novoBloco
                })
                .eq('id', itemSendoRecusadoId);

            if (errItem) throw errItem;

            const idInsp = document.getElementById('footer-validacao')?.getAttribute('data-id');
            if(idInsp) {
                await registrarLog(idInsp, 'RECUSA_ITEM', `Item recusado: ${motivo}`);
                await clienteSupabase.from('inspecoes').update({ status: 'em_analise' }).eq('id', idInsp);
            }

            showModal("Item devolvido.", "Recusado", () => {
                fecharExecucao();
                carregarHistorico();
            });

        } catch (error) {
            console.error(error);
            showModal("Erro: " + error.message, "Erro");
        } finally {
            toggleLoader(false);
            itemSendoRecusadoId = null;
        }
    }
};
// Ação: Motorista clica em VALIDAR (Verde)
window.registrarValidacaoLocal = function(itemId) {
    // 1. Salva na memória
    decisoesValidacao[itemId] = { status: 'aprovado' };

    // 2. Feedback Visual
    const divAcoes = document.getElementById(`acoes-item-${itemId}`);
    const divMsg = document.getElementById(`msg-feedback-${itemId}`);
    const card = document.getElementById(`card-validacao-${itemId}`);

    if(divAcoes) divAcoes.style.display = 'none';
    if(divMsg) {
        divMsg.style.display = 'block';
        divMsg.innerHTML = '<i class="fas fa-check-circle"></i> Aprovado';
        divMsg.style.color = '#155724';
        divMsg.style.backgroundColor = '#d4edda';
    }
    if(card) card.style.borderLeftColor = '#28a745'; // Borda Verde

    // 3. Verifica se terminou
    checarProgressoBatch();
}

// Ação: Motorista clica em RECUSAR (Vermelho) -> Abre Modal
window.prepararRecusaItem = function(itemId) {
    itemSendoRecusadoId = itemId; 
    
    // Limpa o campo de texto
    const txtMotivo = document.getElementById('txt-motivo-recusa');
    if(txtMotivo) txtMotivo.value = '';

    // Abre o modal
    abrirModalRecusa(); 
    
    // [CORREÇÃO CRÍTICA]
    // Substitui o comportamento do botão "Confirmar" APENAS para este fluxo
    const btnConfirmar = document.getElementById('btn-confirma-recusa-modal');
    
    if (btnConfirmar) {
        // Remove listeners antigos (para evitar cliques duplos)
        const novoBtn = btnConfirmar.cloneNode(true);
        btnConfirmar.parentNode.replaceChild(novoBtn, btnConfirmar);
        
        // Define a nova ação: Salvar na memória (Local)
        novoBtn.onclick = function() {
            registrarRecusaLocal();
        };
        
        // Foca no campo de texto
        setTimeout(() => { if(txtMotivo) txtMotivo.focus(); }, 500);
    } else {
        console.error("Erro: Botão 'btn-confirma-recusa-modal' não encontrado no HTML.");
    }
}

// Ação: Motorista confirma a recusa no Modal
window.registrarRecusaLocal = function() {
    const motivo = document.getElementById('txt-motivo-recusa').value.trim();
    
    // [CORREÇÃO] Substituição do alert genérico
    if (!motivo) {
        fecharModalRecusa(); // Fecha o modal atual para mostrar o aviso
        
        showModal("Por favor, informe o motivo da recusa para prosseguir.", "Motivo Obrigatório", () => {
            // Callback: Quando clicar em OK no aviso, reabre o modal de digitação
            abrirModalRecusa(); 
        });
        return;
    }
    
    const itemId = itemSendoRecusadoId;
    
    // 1. Salva na memória
    decisoesValidacao[itemId] = { status: 'recusado', motivo: motivo };

    // 2. Fecha modal
    fecharModalRecusa();

    // 3. Feedback Visual
    const divAcoes = document.getElementById(`acoes-item-${itemId}`);
    const divMsg = document.getElementById(`msg-feedback-${itemId}`);
    const card = document.getElementById(`card-validacao-${itemId}`);

    if(divAcoes) divAcoes.style.display = 'none';
    if(divMsg) {
        divMsg.style.display = 'block';
        divMsg.innerHTML = `<i class="fas fa-times-circle"></i> Recusado`;
        divMsg.style.color = '#721c24'; 
        divMsg.style.backgroundColor = '#f8d7da'; 
        divMsg.style.border = '1px solid #f5c6cb';
    }
    if(card) {
        card.style.borderLeftColor = '#dc3545'; 
    }

    // 4. Verifica progresso
    checarProgressoBatch();
};

// Verifica se todos os itens da lista já têm uma decisão
function checarProgressoBatch() {
    const btnFinal = document.getElementById('btn-finalizar-batch');
    if (!btnFinal) return;

    const totalDecididos = Object.keys(decisoesValidacao).length;
    const totalNecessarios = listaItensParaValidar.length;
    const faltam = totalNecessarios - totalDecididos;

    if (faltam === 0) {
        // Tudo pronto: Botão Verde
        btnFinal.disabled = false;
        btnFinal.style.opacity = '1';
        btnFinal.style.background = '#28a745'; 
        btnFinal.innerHTML = '<i class="fas fa-paper-plane"></i> CONCLUIR VALIDAÇÃO';
        
        // AQUI ESTAVA O ERRO DE REFERÊNCIA, AGORA CORRIGIDO POIS A FUNÇÃO EXISTE
        btnFinal.onclick = enviarValidacaoFinalBatch; 
    } else {
        // Ainda falta: Botão Laranja
        btnFinal.disabled = false; 
        btnFinal.style.opacity = '1';
        btnFinal.style.background = '#fd7e14'; 
        btnFinal.innerHTML = `<i class="fas fa-arrow-down"></i> RESTAM ${faltam} ITENS`;
        btnFinal.onclick = focarProximaPendencia; 
    }
}

window.abrirModalSaida = function(modo) {
    const modal = document.getElementById('modalConfirmacaoSaida');
    
    // Se o modal for aberto via código (botão X), precisamos criar um estado no histórico
    // para que o botão voltar feche o modal e não a tela.
    if (history.state && history.state.screen !== 'modal-saida') {
        history.pushState({ screen: 'modal-saida' }, "Confirmar Saída", "#confirmar-saida");
    }

    if(modal) {
        const p = modal.querySelector('p');
        if (modo === 'validacao') {
            p.innerHTML = "Você avaliou alguns itens.<br>Se sair agora, <b>suas decisões serão perdidas</b>.";
        } else {
            p.innerHTML = "Você iniciou o preenchimento.<br>Se sair agora, <b>todos os dados serão perdidos</b>.";
        }
        modal.classList.add('active');
    } else {
        // Fallback
        if(confirm("Deseja realmente sair? Dados não salvos serão perdidos.")) {
            confirmarSaidaSemSalvar();
        } else {
            // Se cancelou no confirm nativo, restaura histórico
            history.back();
        }
    }
}

// Busca o primeiro item pendente e rola a tela até ele
window.focarProximaPendencia = function() {
    // Encontra o primeiro ID da lista que ainda não tem decisão (aprovado/recusado)
    const idPendente = listaItensParaValidar.find(id => !decisoesValidacao[id]);

    if (idPendente) {
        const card = document.getElementById(`card-validacao-${idPendente}`);
        if (card) {
            // Rola até o card
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // Efeito visual de "Piscar" em laranja
            const corOriginal = card.style.borderLeftColor;
            const bordaOriginal = card.style.borderLeft;
            
            card.style.transition = "all 0.3s ease";
            card.style.borderLeft = "15px solid #fd7e14"; // Engrossa a borda
            card.style.transform = "scale(1.02)"; // Aumenta levemente
            
            setTimeout(() => { 
                card.style.borderLeft = bordaOriginal;
                card.style.transform = "scale(1)";
            }, 600);
        }
    }
}

// app/js/app.js (Função de inicialização ou carregamento de perfil)

async function verificarPermissaoManutentor() {
    // Assume que usuarioAtualId já foi definido na inicialização
    const { data: perfil } = await clienteSupabase
        .from('perfis')
        .select('funcao')
        .eq('id', usuarioAtualId)
        .single();

    // Se for manutentor, injeta o botão de voltar
    if (perfil && (perfil.funcao === 'manutencao' || perfil.funcao === 'admin')) {
        criarBotaoRetornoOficina();
    }
}

function criarBotaoRetornoOficina() {
    const btn = document.createElement('div');
    btn.innerHTML = `<i class="fas fa-wrench"></i>`;
    
    // Estilo Flutuante (Canto inferior direito ou no Header)
    Object.assign(btn.style, {
        position: 'fixed',
        bottom: '80px', // Acima do rodapé
        right: '20px',
        width: '50px',
        height: '50px',
        background: 'var(--cor-primary)', // Azul da oficina
        color: 'white',
        borderRadius: '50%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
        zIndex: '9999',
        cursor: 'pointer',
        fontSize: '1.2rem'
    });

    btn.onclick = function() {
        // Redireciona de volta para a tela de manutenção
        window.location.href = 'manutencao.html';
    };

    document.body.appendChild(btn);
}

window.enviarValidacaoFinalBatch = async function() {
    const footer = document.getElementById('footer-validacao');
    const idInsp = footer.getAttribute('data-id');
    const btn = document.getElementById('btn-finalizar-batch');

    if (!idInsp) return;

    if (btn) {
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processando...';
        btn.disabled = true;
    }
    toggleLoader(true);

    try {
        let temRecusa = false;
        let logsTexto = [];

        // 2. Processa cada decisão tomada
        for (const [itemId, decisao] of Object.entries(decisoesValidacao)) {
            
            if (decisao.status === 'recusado') {
                temRecusa = true;
                const motivo = decisao.motivo || 'Motivo não informado';

                // --- LÓGICA DE RECUSA (COM LINK DA FOTO) ---
                const { data: itemAtual } = await clienteSupabase
                    .from('respostas_inspecao')
                    .select('observacao_motorista, obs_resolucao, foto_resolucao')
                    .eq('id', itemId)
                    .single();

                const textoOriginal = itemAtual?.observacao_motorista || '';
                let resolucaoAnterior = itemAtual?.obs_resolucao || '(Sem texto da manutenção)';
                
                // Se tinha foto na resolução, salva o link no histórico com a TAG especial
                if (itemAtual?.foto_resolucao) {
                    resolucaoAnterior += `\n[FOTO_RES::${itemAtual.foto_resolucao}]`;
                }

                const dataHoje = new Date().toLocaleString('pt-BR');
                const novoBlocoHistorico = `
_______________________
[🔧 MANUTENÇÃO - ${dataHoje}]:
${resolucaoAnterior}

[❌ RECUSA - ${dataHoje}]:
${motivo}`;

                // Atualiza o item: Limpa a resolução técnica, salva histórico e mantem NOK
                const { error: errUpd } = await clienteSupabase
                    .from('respostas_inspecao')
                    .update({
                        obs_resolucao: null,
                        foto_resolucao: null,
                        data_resolucao_item: null,
                        resolvido_por: null,
                        is_conforme: false, // Mantém pendente
                        observacao_motorista: textoOriginal + novoBlocoHistorico
                    })
                    .eq('id', itemId);
                
                if (errUpd) throw errUpd;
                logsTexto.push(`Item ${itemId} RECUSADO.`);

            } else {
                // --- LÓGICA DE APROVAÇÃO (CORRIGIDA) ---
                // Removemos a coluna 'data_validacao_item' que causava o erro.
                const { error: errOk } = await clienteSupabase
                    .from('respostas_inspecao')
                    .update({
                        is_conforme: true // Marca como resolvido (sai da lista)
                    })
                    .eq('id', itemId);

                if (errOk) throw errOk;
                logsTexto.push(`Item ${itemId} APROVADO e BAIXADO.`);
            }
        }

        // 3. Atualiza Status Global
        let statusFinal = temRecusa ? 'em_analise' : 'corrigido';
        const updatePayload = { 
            status: statusFinal,
            parecer_tecnico: temRecusa ? `[RETORNO]: Existem itens recusados.` : undefined
        };
        
        if (!temRecusa) updatePayload.data_validacao = new Date().toISOString();

        const { error: errInsp } = await clienteSupabase.from('inspecoes').update(updatePayload).eq('id', idInsp);
        if (errInsp) throw errInsp;

        await registrarLog(idInsp, temRecusa ? 'RECUSA_PARCIAL' : 'APROVADO', logsTexto.join('\n'));

        decisoesValidacao = {}; 
        formChecklistSujo = false;

        const titulo = temRecusa ? "Devolvido à Manutenção" : "Checklist Concluído";
        const msg = temRecusa 
            ? "Itens aprovados foram baixados. Itens recusados voltaram para a oficina." 
            : "Todos os itens foram validados com sucesso!";

        showModal(msg, titulo, () => {
            fecharExecucao();
            carregarHistorico();
        });

    } catch (e) {
        console.error(e);
        showModal("Erro: " + e.message, "Erro");
        if (btn) {
            btn.innerHTML = '<i class="fas fa-paper-plane"></i> Tentar Novamente';
            btn.disabled = false;
        }
    } finally {
        toggleLoader(false);
    }
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
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = Math.round((height * maxWidth) / width);
                    width = maxWidth;
                }

                const canvas = document.createElement('canvas');
                canvas.width = width;
                canvas.height = height;
                
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, width, height);

                ctx.canvas.toBlob((blob) => {
                    if (blob) {
                        // Resolução definitiva do erro "Convert to Response"
                        const newFile = new File([blob], file.name.replace(/\.[^/.]+$/, "") + ".jpg", {
                            type: 'image/jpeg',
                            lastModified: Date.now(),
                        });
                        resolve(newFile);
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