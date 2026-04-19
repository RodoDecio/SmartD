// admin/js/app.js - VERSÃO BLINDADA (FUNÇÕES GLOBAIS EXPLICITAS)

let listaUnidadesGlobal = [];
let usuarioLogadoGlobal = null;
let acaoDescartePendente = null;

window.idsComNovidade = window.idsComNovidade || new Set();
window.contadorNotificacoes = window.contadorNotificacoes || 0;
window.origemLocal = false;

document.addEventListener('DOMContentLoaded', async () => {
    restaurarEstadoSidebar();
    await carregarDadosSessao();
    
    // Listener central para troca de unidade no rodapé
    const selUnidade = document.getElementById('sel-unidade');
    if (selUnidade) {
        selUnidade.addEventListener('change', (e) => {
            const novaUnidadeId = e.target.value;
            recarregarDadosModuloAtivo(novaUnidadeId);
        });
    }
});

// =============================================================================
// FUNÇÕES DE MENU E NAVEGAÇÃO (GLOBALIZADAS)
// =============================================================================


window.logout = async function() {
    await clienteSupabase.auth.signOut();
    window.location.href = '../index.html';
};

// =============================================================================
// FUNÇÕES GLOBAIS DE CONFIRMAÇÃO
// =============================================================================

window.solicitarConfirmacao = function(callback) {
    acaoDescartePendente = callback;
    document.getElementById('modal-confirmacao').classList.add('active');
};

window.fecharConfirmacaoGlobal = function() {
    document.getElementById('modal-confirmacao').classList.remove('active');
    acaoDescartePendente = null;
};

window.executarDescarteGlobal = function() {
    if (typeof acaoDescartePendente === 'function') {
        acaoDescartePendente();
    }
    window.fecharConfirmacaoGlobal();
};

// =============================================================================
// SESSÃO E UNIDADES
// =============================================================================

async function carregarDadosSessao() {
    try {
        const { data: { user } } = await clienteSupabase.auth.getUser();
        if (!user) return;
        
        const { data: perfil } = await clienteSupabase
            .from('perfis')
            .select('*, unidades(nome)')
            .eq('id', user.id)
            .single();

        if (perfil) {
            usuarioLogadoGlobal = perfil;
            // Disponibiliza globalmente também, caso outros scripts precisem acessar via window
            window.usuarioLogadoGlobal = perfil; 

            document.getElementById('lbl-usuario').innerText = perfil.nome_completo;
            document.getElementById('lbl-perfil').innerText = perfil.funcao.toUpperCase();
            
            await carregarUnidadesRodape(perfil);
        }
    } catch (e) { 
        console.error("Erro na sessão:", e); 
    }
}

async function carregarUnidadesRodape(perfil) {
    try {
        const sel = document.getElementById('sel-unidade');
        if (!sel) return;
        sel.innerHTML = '';

        const funcao = (perfil.funcao || '').toLowerCase();
        // Definindo quem tem acesso global (vê todas as unidades)
        // Adicione 'admin' se houver esse papel no seu sistema
        const isGlobalUser = ['coordenador', 'especialista', 'admin'].includes(funcao);

        let unidadesParaExibir = [];

        if (isGlobalUser) {
            // Se for gestor global, busca TODAS as unidades
            const { data } = await clienteSupabase
                .from('unidades')
                .select('id, nome, ativo')
                .eq('ativo', true) // Opcional: só ativas
                .order('nome');
            unidadesParaExibir = data || [];

            // Adiciona opção "TODAS" apenas para gestores
            const optTodas = document.createElement('option');
            optTodas.value = "TODAS";
            optTodas.innerText = "--- TODAS AS UNIDADES ---";
            optTodas.selected = true;
            sel.appendChild(optTodas);

        } else {
            // Se for usuário comum (Motorista, Analista, Manutentor), busca SÓ AS VINCULADAS
            // 1. Busca os IDs na tabela de ligação
            const { data: links } = await clienteSupabase
                .from('perfis_unidades')
                .select('unidade_id')
                .eq('perfil_id', perfil.id);
            
            const idsPermitidos = (links || []).map(l => l.unidade_id);

            // Garante que a unidade de lotação (principal) também esteja inclusa, por segurança
            if (perfil.unidade_id && !idsPermitidos.includes(perfil.unidade_id)) {
                idsPermitidos.push(perfil.unidade_id);
            }

            if (idsPermitidos.length > 0) {
                // 2. Busca os detalhes dessas unidades
                const { data } = await clienteSupabase
                    .from('unidades')
                    .select('id, nome, ativo')
                    .in('id', idsPermitidos)
                    .eq('ativo', true)
                    .order('nome');
                unidadesParaExibir = data || [];
            }
        }

        // Popula o Select
        unidadesParaExibir.forEach(u => {
            const opt = document.createElement('option');
            opt.value = u.id;
            opt.innerText = u.nome;
            
            // Se não for global, seleciona a unidade de lotação por padrão
            if (!isGlobalUser && u.id == perfil.unidade_id) {
                opt.selected = true;
            }
            sel.appendChild(opt);
        });
        
        // Atualiza a lista global para uso em outros módulos
        listaUnidadesGlobal = unidadesParaExibir;

    } catch (e) { 
        console.error("Erro ao carregar unidades no rodapé:", e); 
    }
}

// =============================================================================
// ROTEADOR E RECARREGAMENTO
// =============================================================================

function recarregarDadosModuloAtivo(unidadeId) {
    const btnAtivo = document.querySelector('.submenu-item.ativo');
    if (!btnAtivo) return;

    const modulo = btnAtivo.id.replace('btn-', '');
    
    const mapeamentoListas = {
        'Usuarios': () => typeof buscarDadosUsuarios === 'function' && buscarDadosUsuarios(unidadeId),
        'Veiculos': () => typeof listarVeiculos === 'function' && listarVeiculos(unidadeId),
        'Premiacoes': () => typeof listarPremiacoes === 'function' && listarPremiacoes(unidadeId),
        'Acoes_Checklist': () => typeof listarInspecoes === 'function' && listarInspecoes(unidadeId),
        'Diarias': () => typeof listarDiarias === 'function' && listarDiarias(unidadeId),
        'Lancamentos_Diarias': () => typeof listarCompetenciasDiarias === 'function' && listarCompetenciasDiarias(unidadeId),
        'Controle_Epi': () => typeof listarEntregas === 'function' && listarEntregas(),
        'Relatorios_Coletas': () => typeof window.buscarDadosColetasRelatorio === 'function' && window.inicializarRelatoriosColetas(),
        'Relatorios_Ferias': () => typeof window.buscarDadosFeriasRel === 'function' && window.inicializarRelatoriosFerias(),
        'Relatorios_Veiculos': () => typeof buscarDadosVeiculosRelatorio === 'function' && window.iniciarExportacaoVeiculos && window.inicializarRelatoriosVeiculos(),
        'Relatorios_Usuarios': () => typeof buscarDadosUsuariosRelatorio === 'function' && window.inicializarRelatoriosUsuarios(),
        
        'Manutencao': () => typeof listarManutencoes === 'function' && listarManutencoes(),
        'Pneus_Estoque': () => typeof listarPneusEstoque === 'function' && listarPneusEstoque(),
        'Pneus_Aplicacao': () => typeof carregarVeiculosMapa === 'function' && carregarVeiculosMapa(),
        'Pneus_Servicos': () => typeof listarPneusServicos === 'function' && listarPneusServicos(),
        'Pneus_Recapagem': () => typeof listarPneusRecapagem === 'function' && listarPneusRecapagem(),
        'Fornecedores': () => typeof listarFornecedores === 'function' && listarFornecedores(),
        'Catalogo': () => typeof listarCatalogo === 'function' && listarCatalogo(),

        'Lancamento_Premiacao': () => typeof listarApuracoes === 'function' && listarApuracoes(),
        'Chamados': () => typeof listarChamados === 'function' && listarChamados(),
        'Ferias': () => typeof inicializarFerias === 'function' && inicializarFerias(),
        'Coletas': () => typeof listarColetas === 'function' && listarColetas(),

        'Calculadora': () => typeof inicializarCalculadora === 'function' && inicializarCalculadora(),
        'Sobre': () => typeof inicializarSobre === 'function' && inicializarSobre()
    };

    if (mapeamentoListas[modulo]) {
        mapeamentoListas[modulo]();
    }
}

// Exposta globalmente para o onclick do HTML
window.carregarModulo = async function(modulo) {
    // Visual do Menu
    document.querySelectorAll('.submenu-item').forEach(el => el.classList.remove('ativo'));
    document.querySelectorAll('.menu-parent').forEach(el => el.classList.remove('active-group'));

    const btn = document.getElementById(`btn-${modulo}`);
    if (btn) {
        btn.classList.add('ativo');
        // Abre o submenu pai se estiver fechado
        const parentSubmenu = btn.closest('.submenu');
        if (parentSubmenu) {
            parentSubmenu.style.maxHeight = parentSubmenu.scrollHeight + "px";
            // Usa a função global toggleMenu para garantir consistência visual
            const parentTrigger = document.querySelector(`[onclick="toggleMenu('${parentSubmenu.id}')"]`);
            if (parentTrigger) {
                parentTrigger.classList.add('open');
                parentTrigger.classList.add('active-group');
            }
        }
    }

    const container = document.getElementById('area-conteudo');
    
    try {
        const response = await fetch(`pages/${modulo.toLowerCase()}.html`);
        if (!response.ok) throw new Error(`Erro ao carregar módulo: ${modulo}`);
        
        const html = await response.text();
        container.innerHTML = html;

        // Pega a unidade selecionada no rodapé para já carregar filtrado
        const unidadeAtual = document.getElementById('sel-unidade')?.value || "TODAS";

        // Inicializadores de cada módulo
        // Assegura que as funções existem antes de chamar
        const inicializadores = {
            'Usuarios': () => typeof inicializarUsuarios === 'function' && inicializarUsuarios(unidadeAtual),
            'Veiculos': () => typeof inicializarVeiculos === 'function' && inicializarVeiculos(unidadeAtual),
            'Acoes_Checklist': () => typeof inicializarAcoesChecklist === 'function' && inicializarAcoesChecklist(unidadeAtual),
            'Lancamentos_Diarias': () => typeof inicializarLancamentosDiarias === 'function' && inicializarLancamentosDiarias(),
            'Lancamento_Premiacao': () => typeof inicializarLancamentoPremiacao === 'function' && inicializarLancamentoPremiacao(),
            'Premiacoes': () => typeof inicializarPremiacoes === 'function' && inicializarPremiacoes(unidadeAtual),
            'Diarias': () => typeof inicializarDiarias === 'function' && inicializarDiarias(unidadeAtual),
            'Unidades': () => typeof inicializarUnidades === 'function' && inicializarUnidades(),
            'Checklists': () => typeof inicializarChecklists === 'function' && inicializarChecklists(),
            'Epis': () => typeof inicializarEpis === 'function' && inicializarEpis(),
            'Uniformes': () => typeof inicializarUniformes === 'function' && inicializarUniformes(),
            'Controle_Epi': () => typeof inicializarControleEPI === 'function' && inicializarControleEPI(),
            'Controle_Uniformes': () => typeof inicializarControleUniformes === 'function' && inicializarControleUniformes(),
            'Chamados': () => typeof inicializarChamados === 'function' && inicializarChamados(),
            'Ferias': () => typeof inicializarChamados === 'function' && inicializarFerias(),
            'Coletas': () => typeof inicializarColetas === 'function' && inicializarColetas(),
            'Relatorios_Checklist': () => typeof inicializarRelatoriosChecklist === 'function' && inicializarRelatoriosChecklist(),
            'Relatorios_Diaria': () => typeof inicializarRelatoriosDiaria === 'function' && inicializarRelatoriosDiaria(),
            'Relatorios_Premiacao': () => typeof inicializarRelatoriosPremiacao === 'function' && inicializarRelatoriosPremiacao(),
            'Relatorios_Coletas': () => typeof inicializarRelatoriosColetas === 'function' && inicializarRelatoriosColetas(),
            'Relatorios_Ferias': () => typeof inicializarRelatoriosFerias === 'function' && inicializarRelatoriosFerias(),
            'Relatorios_Usuarios': () => typeof inicializarRelatoriosUsuarios === 'function' && inicializarRelatoriosUsuarios(),
            'Relatorios_Veiculos': () => typeof inicializarRelatoriosVeiculos === 'function' && inicializarRelatoriosVeiculos(),
            
            'Manutencao': () => typeof inicializarManutencao === 'function' && inicializarManutencao(),
            'Pneus_Estoque': () => typeof inicializarPneusEstoque === 'function' && inicializarPneusEstoque(),
            'Pneus_Aplicacao': () => typeof inicializarPneusAplicacao === 'function' && inicializarPneusAplicacao(),
            'Pneus_Servicos': () => typeof inicializarPneusServicos === 'function' && inicializarPneusServicos(),
            'Pneus_Recapagem': () => typeof inicializarPneusRecapagem === 'function' && inicializarPneusRecapagem(),
            'Fornecedores': () => typeof inicializarFornecedores === 'function' && inicializarFornecedores(),
            'Catalogo': () => typeof inicializarCatalogo === 'function' && inicializarCatalogo(),

            'Calculadora': () => typeof inicializarCalculadora === 'function' && inicializarCalculadora(),
            'Sobre': () => typeof inicializarSobre === 'function' && inicializarSobre()
        };

        if (inicializadores[modulo]) {
            inicializadores[modulo]();
        }

    } catch (e) { 
        console.error(e);
        container.innerHTML = `<div class="card"><h2>Erro</h2><p>Falha ao carregar modulo ${modulo}.</p></div>`;
    }
};

// =============================================================================
// FUNÇÃO UNIVERSAL DE HISTÓRICO (LOGS)
// =============================================================================

window.abrirModalLogsGlobal = async function(tabelaBanco, idRegistro, tituloModal = 'Histórico', mapaIds = {}) {
    const modal = document.getElementById('modal-logs');
    const container = document.getElementById('timeline-logs');
    const tituloEl = document.getElementById('titulo-modal-logs');

    if (!modal || !container) return;

    if (tituloEl) tituloEl.innerText = tituloModal;
    container.innerHTML = '<div class="text-center p-4"><i class="fas fa-spinner fa-spin"></i> Buscando histórico...</div>';
    modal.classList.add('active');

    try {
        const { data: logs, error } = await clienteSupabase
            .from('logs_auditoria')
            .select('*, perfis(nome_completo)')
            .eq('tabela_afetada', tabelaBanco)
            .eq('id_registro_afetado', idRegistro)
            .order('data_hora', { ascending: false });

        if (error) throw error;

        container.innerHTML = '';
        if (!logs || logs.length === 0) {
            container.innerHTML = '<div class="text-center p-4 text-muted">Sem histórico disponível.</div>';
            return;
        }

        logs.forEach(log => {
            const dataF = new Date(log.data_hora).toLocaleString('pt-BR');
            const resp = log.perfis ? log.perfis.nome_completo : 'Sistema';
            
            const diffHtml = gerarDiffHtmlGlobal(log.acao, log.dados_antigos, log.dados_novos, mapaIds);

            const div = document.createElement('div');
            div.className = 'log-item';
            div.innerHTML = `
                <div class="log-header"><strong>${dataF}</strong> por <span style="color:#003399">${resp}</span></div>
                <div class="log-action"><b>Ação:</b> ${traduzirAcao(log.acao)}</div>
                ${diffHtml}
            `;
            container.appendChild(div);
        });

    } catch (err) {
        console.error(err);
        container.innerHTML = '<div class="text-center text-danger">Erro ao carregar histórico.</div>';
    }
};

function gerarDiffHtmlGlobal(acao, antigo, novo, mapaIds = {}) {
    if (acao === 'INSERT') return '<div class="log-diff" style="color:green"><i class="fas fa-plus-circle"></i> Registro criado.</div>';
    
    if (acao === 'UPDATE_STATUS') {
        try {
            const s = JSON.parse(novo).ativo ? 'ATIVO' : 'INATIVO';
            const cor = JSON.parse(novo).ativo ? 'green' : 'red';
            return `<div class="log-diff">Status alterado para <b style="color:${cor}">${s}</b></div>`;
        } catch(e) { return ''; }
    }
    
    if (!antigo || !novo) return '';

    try {
        const objAntigo = (typeof antigo === 'string') ? JSON.parse(antigo) : antigo;
        const objNovo = (typeof novo === 'string') ? JSON.parse(novo) : novo;
        let html = '';
        
        const labels = {
            'placa': 'Placa', 'marca': 'Marca', 'modelo': 'Modelo', 
            'ano_fab_mod': 'Ano', 'tipo_veiculo': 'Tipo', 'eixos': 'Eixos',
            'unidade_id': 'Unidade', 'motorista_id': 'Motorista', 'km_atual': 'Km Atual', 
            'capacidade_tanque': 'Capacidade', 'observacao': 'Observação',
            'status': 'Status', 'nome': 'Nome/Fantasia', 'razao_social': 'Razão Social',
            'cnpj': 'CNPJ/CPF', 'telefone': 'Telefone', 'cidade': 'Cidade',
            'periodicidade_km': 'Periodicidade (Km)',
            'periodicidade_meses': 'Periodicidade (Meses)',
            'numero_fogo': 'Nº de Fogo',
            'tipo': 'Tipo',
            'medida': 'Medida'
        };

        const ignorar = ['id', 'created_at', 'updated_at', 'ativo', 'unidades', 'perfis', 'compartimentos_json', 'veiculos'];

        for (const key in objNovo) {
            if (ignorar.includes(key)) continue;

            let valAnt = objAntigo[key] == null ? '' : objAntigo[key];
            let valNov = objNovo[key] == null ? '' : objNovo[key];

            // Pula se for estritamente igual
            if (String(JSON.stringify(valAnt)) === String(JSON.stringify(valNov))) continue;

            // --- NOVO TRATAMENTO: UNIDADE ID (Busca o nome na lista global) ---
            if (key === 'unidade_id') {
                const obterNomeUnidade = (id) => {
                    if (!id) return '(vazio)';
                    try {
                        if (typeof listaUnidadesGlobal !== 'undefined' && Array.isArray(listaUnidadesGlobal)) {
                            const u = listaUnidadesGlobal.find(uni => String(uni.id) === String(id));
                            if (u && u.nome) return u.nome;
                        }
                    } catch (err) {}
                    return `ID ${id}`;
                };
                
                const aStr = obterNomeUnidade(valAnt);
                const nStr = obterNomeUnidade(valNov);
                html += `<div class="log-diff"><b>Unidade:</b> ${aStr} <i class="fas fa-arrow-right"></i> <span style="color:#007bff">${nStr}</span></div>`;
                continue;
            }

            // --- TRATAMENTO: VEICULOS APLICAÇÃO (CATÁLOGO) ---
            if (key === 'veiculos_aplicacao_json') {
                try {
                    const arrAnt = (Array.isArray(valAnt) ? valAnt : (valAnt ? JSON.parse(valAnt) : [])).map(String);
                    const arrNov = (Array.isArray(valNov) ? valNov : (valNov ? JSON.parse(valNov) : [])).map(String);
                    
                    const adicionados = arrNov.filter(x => !arrAnt.includes(x));
                    const removidos = arrAnt.filter(x => !arrNov.includes(x));
                    
                    const obterPlaca = (id) => {
                        try {
                            if (typeof listaVeiculosCatGlobal !== 'undefined' && Array.isArray(listaVeiculosCatGlobal)) {
                                const v = listaVeiculosCatGlobal.find(veic => String(veic.id) === String(id));
                                if (v && v.placa) return v.placa;
                            }
                        } catch (err) { }
                        return `ID ${id}`;
                    };
                    
                    let mudancas = [];
                    if (adicionados.length > 0) mudancas.push(`<span style="color:#28a745">+ ${adicionados.map(obterPlaca).join(', ')}</span>`);
                    if (removidos.length > 0) mudancas.push(`<span style="color:#dc3545">- ${removidos.map(obterPlaca).join(', ')}</span>`);
                    
                    if (mudancas.length > 0) {
                        html += `<div class="log-diff" style="margin-top:4px;"><b>Veículos Aplicáveis:</b> ${mudancas.join(' | ')}</div>`;
                    }
                } catch(e) {
                    console.error("Erro ao processar diff de veículos:", e);
                }
                continue;
            }

            // --- TRATAMENTO: PERIODICIDADE KM E MESES ---
            if (key === 'periodicidade_km') {
                const formatarKm = (v) => v ? `${Number(v).toLocaleString('pt-BR')} km` : '(vazio)';
                html += `<div class="log-diff"><b>Periodicidade:</b> ${formatarKm(valAnt)} <i class="fas fa-arrow-right"></i> ${formatarKm(valNov)}</div>`;
                continue;
            }
            if (key === 'periodicidade_meses') {
                const formatarMeses = (v) => v ? `${v} meses` : '(vazio)';
                html += `<div class="log-diff"><b>Validade:</b> ${formatarMeses(valAnt)} <i class="fas fa-arrow-right"></i> ${formatarMeses(valNov)}</div>`;
                continue;
            }

            // --- TRATAMENTO: LISTA DE SISTEMAS ATENDIDOS (+ e -) ---
            if (key === 'sistemas_atendidos') {
                const arrAnt = valAnt ? String(valAnt).split(',').map(s=>s.trim()).filter(Boolean) : [];
                const arrNov = valNov ? String(valNov).split(',').map(s=>s.trim()).filter(Boolean) : [];
                
                const adicionados = arrNov.filter(x => !arrAnt.includes(x));
                const removidos = arrAnt.filter(x => !arrNov.includes(x));
                
                let mudancas = [];
                if(adicionados.length > 0) mudancas.push(`<span style="color:#28a745">+ ${adicionados.join(', ')}</span>`);
                if(removidos.length > 0) mudancas.push(`<span style="color:#dc3545">- ${removidos.join(', ')}</span>`);
                
                if(mudancas.length > 0) {
                    html += `<div class="log-diff"><b>Sistemas:</b> ${mudancas.join(' | ')}</div>`;
                }
                continue;
            }

            // --- TRATAMENTO: JSON DE CONTATOS DO FORNECEDOR ---
            if (key === 'contatos_json') {
                const listaAnt = Array.isArray(valAnt) ? valAnt : [];
                const listaNov = Array.isArray(valNov) ? valNov : [];
                
                const formatarCtt = (c) => `[${c.nome || 'S/N'}: ${c.telefone || ''} ${c.email || ''}]`.trim();
                const strAnt = listaAnt.map(formatarCtt).join(', ');
                const strNov = listaNov.map(formatarCtt).join(', ');
                
                html += `<div class="log-diff" style="margin-top:5px; border-left: 3px solid #ccc; padding-left: 8px;">
                            <div style="font-weight:bold; color:#555; margin-bottom:3px;">Contatos Alterados:</div>
                            <div style="color:#dc3545; font-size:0.85rem;">- ${strAnt || 'Nenhum'}</div>
                            <div style="color:#28a745; font-size:0.85rem;">+ ${strNov || 'Nenhum'}</div>
                         </div>`;
                continue;
            }

            // --- TRATAMENTO ESPECÍFICO: ORDEM DE SERVIÇO (CABEÇALHO) ---
            if (key === 'os') {
                const osAnt = valAnt || {};
                const osNov = valNov || {};
                let mudancasOS = [];
                
                const chavesOS = ['data_manutencao', 'km_manutencao', 'tipo_manutencao', 'sistema', 'subsistema', 'valor_total'];
                chavesOS.forEach(k => {
                    if (osAnt[k] != osNov[k]) {
                        const lbl = k.replace('_', ' ').toUpperCase();
                        let aStr = osAnt[k] || '(vazio)';
                        let nStr = osNov[k] || '(vazio)';
                        if(k === 'valor_total') {
                            aStr = `R$ ${parseFloat(aStr).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                            nStr = `R$ ${parseFloat(nStr).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`;
                        }
                        mudancasOS.push(`<b>${lbl}:</b> ${aStr} <i class="fas fa-arrow-right"></i> <span style="color:#007bff">${nStr}</span>`);
                    }
                });
                
                if (osAnt.fornecedor_id != osNov.fornecedor_id) mudancasOS.push("<b>OFICINA (Serviços):</b> Fornecedor Alterado");
                if (osAnt.fornecedor_pecas_id != osNov.fornecedor_pecas_id) mudancasOS.push("<b>FORNECEDOR (Peças):</b> Fornecedor Alterado");

                if (mudancasOS.length > 0) {
                    html += `<div class="log-diff" style="margin-top:5px; border-left: 3px solid #007bff; padding-left: 8px;">
                                <div style="font-weight:bold; color:#555; margin-bottom:3px;">Alterações Gerais (O.S.):</div>
                                <div style="font-size:0.85rem;">${mudancasOS.join('<br>')}</div>
                             </div>`;
                }
                continue;
            }

            // --- TRATAMENTO ESPECÍFICO: ORDEM DE SERVIÇO (ITENS) ---
            if (key === 'itens') {
                const listaAnt = Array.isArray(valAnt) ? valAnt : [];
                const listaNov = Array.isArray(valNov) ? valNov : [];
                
                const fmtItem = (i) => `${i.quantidade}x ${i.descricao} (${i.categoria}) - R$ ${parseFloat(i.valor_unitario||0).toLocaleString('pt-BR')}`;
                const strAnt = listaAnt.map(fmtItem).sort().join('<br>');
                const strNov = listaNov.map(fmtItem).sort().join('<br>');
                
                if (strAnt !== strNov) {
                    html += `<div class="log-diff" style="margin-top:5px; border-left: 3px solid #28a745; padding-left: 8px;">
                                <div style="font-weight:bold; color:#555; margin-bottom:3px;">Itens/Serviços Modificados:</div>
                                <div style="color:#dc3545; font-size:0.8rem; margin-bottom:2px;"><b>Antes:</b><br>${strAnt || 'Nenhum item'}</div>
                                <div style="color:#28a745; font-size:0.8rem;"><b>Depois:</b><br>${strNov || 'Nenhum item'}</div>
                             </div>`;
                }
                continue;
            }

            // --- TRATAMENTO: OBJETO GENÉRICO (Fallback de Segurança) ---
            if (typeof valAnt === 'object') valAnt = JSON.stringify(valAnt);
            if (typeof valNov === 'object') valNov = JSON.stringify(valNov);

            // --- DEMAIS CAMPOS PADRÕES ---
            let displayAnt = valAnt || '(vazio)';
            let displayNov = valNov || '(vazio)';
            const label = labels[key] || key;
            html += `<div class="log-diff"><b>${label}:</b> ${displayAnt} <i class="fas fa-arrow-right"></i> ${displayNov}</div>`;
        }
        return html || '<div class="log-diff text-muted">Edição sem alterações visíveis.</div>';
    } catch (e) {
        return '<div class="log-diff text-muted">Erro ao processar detalhes da auditoria.</div>';
    }
}

function traduzirAcao(a) {
    const map = { 'INSERT':'CRIADO', 'UPDATE':'ATUALIZADO', 'DELETE':'EXCLUÍDO', 'UPDATE_STATUS':'STATUS' };
    return map[a] || a;
}

// =============================================================================
// UTILITÁRIOS GLOBAIS
// =============================================================================

window.mostrarToast = function(msg, tipo = 'success') {
    const box = document.getElementById('toast-container');
    if (!box) return;
    box.style.zIndex = '999999';
    const div = document.createElement('div');
    div.className = `toast ${tipo}`;
    div.innerHTML = `<i class="fas ${tipo==='success'?'fa-check-circle':'fa-times-circle'}"></i> <span>${msg}</span>`;
    box.appendChild(div);
    setTimeout(() => { div.remove(); }, 3500);
};

window.fecharModalLogs = function() {
    const modal = document.getElementById('modal-logs');
    if (modal) modal.classList.remove('active');
};

function iniciarMonitoramentoGlobal() {
    console.log("📡 Monitoramento Global Iniciado");

    const canais = clienteSupabase.getChannels();
    const canalAntigo = canais.find(c => c.topic === 'realtime:public:inspecoes:global');
    if (canalAntigo) clienteSupabase.removeChannel(canalAntigo);

    clienteSupabase
        .channel('realtime:public:inspecoes:global')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'inspecoes' }, (payload) => {
            
            // 1. FILTRO DE AUTO-AÇÃO (Anti-Eco)
            // Se a flag estiver ativa, ignora (foi alteração minha)
            if (window.origemLocal === true) {
                return; 
            }

            // 2. FILTRO DE STATUS (INTELIGENTE)
            const novoStatus = (payload.new.status || '').toLowerCase();
            const ehNovo = (payload.eventType === 'INSERT');

            // Lista Negra: Status que NÃO devem gerar notificação para a oficina
            const statusSilenciosos = ['concluido', 'corrigido', 'aguardando_motorista'];

            // Regra:
            // - Se é NOVO (INSERT): Sempre notifica.
            // - Se é UPDATE: Notifica SÓ SE o status NÃO for silencioso.
            // - Se foi DELETADO: Ignora.
            if (payload.eventType === 'DELETE') return;
            
            if (!ehNovo && statusSilenciosos.includes(novoStatus)) {
                return; // Não perturbe
            }

            // 3. AÇÃO: SOM E VISUAL
            const idAfetado = payload.new.id;
            
            // Adiciona ID na lista para pintar a linha da tabela
            window.idsComNovidade.add(idAfetado);
            
            // Toca Som
            tocarSomGlobal();
            
            // Incrementa Menu
            window.contadorNotificacoes++;
            atualizarBadgeMenu();

            // 4. ATUALIZAÇÃO DA TELA (Se estiver na Central de Checklists)
            if (typeof window.listarInspecoes === 'function') {
                window.listarInspecoes();
            } else if (typeof listarInspecoes === 'function') {
                listarInspecoes();
            }
            
            // 5. TOAST GLOBAL
            // Mostra toast apenas se não tiver modal aberto (para não sobrepor sua edição)
            const temModalAberto = document.querySelector('.modal.active');
            if(typeof mostrarToast === 'function' && !temModalAberto) {
                 const num = payload.new.numero_controle || payload.new.id;
                 const msg = ehNovo ? `🔔 Novo Checklist #${num}` : `🔔 Atualização no #${num}`;
                 mostrarToast(msg, 'info');
            }
        })
        .subscribe();
}

function atualizarBadgeMenu() {
    const menuLink = document.getElementById('btn-AcoesChecklist'); 
    if (menuLink) {
        let badge = menuLink.querySelector('.menu-badge');
        
        // Se o badge ainda não existe, cria ele
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'menu-badge';
            
            // --- CORREÇÃO DE ALINHAMENTO ---
            menuLink.style.display = 'flex';
            menuLink.style.alignItems = 'center';
            menuLink.style.gap = '8px'; // Garante um espacinho entre ícone e texto
            
            // REMOVIDO: menuLink.style.justifyContent = 'space-between'; 
            
            // Empurra o badge para o final (direita) sem separar o texto do ícone
            badge.style.marginLeft = 'auto'; 
            
            menuLink.appendChild(badge);
        }

        if (window.contadorNotificacoes > 0) {
            badge.innerText = window.contadorNotificacoes;
            badge.style.display = 'inline-block';
            
            // Estilo do badge (bolinha vermelha pequena e elegante)
            badge.style.backgroundColor = '#dc3545';
            badge.style.color = 'white';
            badge.style.borderRadius = '10px';
            badge.style.padding = '2px 6px';
            badge.style.fontSize = '10px';
            badge.style.fontWeight = 'bold';
            
            // Destaque suave no item do menu
            menuLink.style.backgroundColor = 'rgba(220, 53, 69, 0.1)'; 
        } else {
            badge.style.display = 'none';
            menuLink.style.backgroundColor = ''; 
        }
    }
}

function tocarSomGlobal() {
    const audio = new Audio("sounds/alert.mp3"); // Ajuste o caminho conforme sua estrutura
    audio.play().catch(e => console.warn("Som bloqueado pelo navegador"));
}

// Ao carregar qualquer página, inicia o monitor
document.addEventListener('DOMContentLoaded', () => {
    // Se o clienteSupabase estiver carregado
    if (typeof clienteSupabase !== 'undefined') {
        iniciarMonitoramentoGlobal();
    }
});

// Função para limpar notificações (chamar quando entrar na tela de checklist)
window.limparNotificacoesMenu = function() {
    window.contadorNotificacoes = 0;
    atualizarBadgeMenu();
}

// =============================================================================
// CONTROLE DA SIDEBAR (EXPANDIR/CONTRAIR)
// =============================================================================

// Anexa explicitamente ao window para garantir acesso via HTML onclick
window.toggleSidebarState = function() {
    document.body.classList.toggle('sidebar-closed');
    const isClosed = document.body.classList.contains('sidebar-closed');
    
    // Fecha submenus para evitar bugs visuais
    if (isClosed) {
        document.querySelectorAll('.submenu').forEach(el => el.style.maxHeight = null);
        document.querySelectorAll('.menu-parent').forEach(el => el.classList.remove('open'));
    }
};

function expandirSubmenu(idMenu) {
    const submenu = document.getElementById(idMenu);
    if (!submenu) return;
    
    // Gira a setinha do pai
    const parent = document.querySelector(`[onclick="toggleMenu('${idMenu}')"]`);
    if (parent) parent.classList.toggle('open');

    // Abre ou fecha o submenu (efeito sanfona)
    if (submenu.style.maxHeight) {
        submenu.style.maxHeight = null; // Fecha
    } else {
        submenu.style.maxHeight = submenu.scrollHeight + "px"; // Abre
    }
}

// Função para restaurar o estado ao carregar a página
function restaurarEstadoSidebar() {
    const state = localStorage.getItem('sidebar-state');
    if (state === 'closed') {
        document.body.classList.add('sidebar-closed');
    }
}

// Executa a restauração imediatamente
restaurarEstadoSidebar();

window.toggleMenu = function(idMenu) {
    // CENÁRIO A: A Sidebar está fechada (contraída)
    if (document.body.classList.contains('sidebar-closed')) {
        // 1. Abre a sidebar primeiro
        window.toggleSidebarState();
        
        // 2. Espera a animação da sidebar (300ms) e então abre o submenu desejado
        setTimeout(() => {
            expandirSubmenu(idMenu);
        }, 300);
    } 
    // CENÁRIO B: Sidebar já está aberta (comportamento normal)
    else {
        expandirSubmenu(idMenu);
    }
};

// Função para lidar com Menus Aninhados (Nível 3)
window.toggleNestedMenu = function(idNested, event) {
    if (event) event.stopPropagation(); // Evita que clique feche acidentalmente o menu pai

    const nestedMenu = document.getElementById(idNested);
    if (!nestedMenu) return;

    // Busca a setinha (chevron) usando a correlação de IDs
    const chevronId = idNested.replace('menu-', 'chevron-').replace('-nested', '');
    const chevron = document.getElementById(chevronId);
    
    // Alterna a visibilidade
    if (nestedMenu.style.display === 'block') {
        nestedMenu.style.display = 'none';
        if (chevron) chevron.style.transform = 'rotate(0deg)';
    } else {
        nestedMenu.style.display = 'block';
        if (chevron) chevron.style.transform = 'rotate(90deg)';
    }
    
    // MÁGICA: Recalcular a altura (maxHeight) do Menu Pai imediatamente
    // Isso impede que o menu aninhado fique "cortado" dentro do container do pai
    const parentSubmenu = nestedMenu.closest('.submenu');
    if (parentSubmenu && parentSubmenu.style.maxHeight) {
        // Usa setTimeout minúsculo para garantir que o display:block renderizou antes do cálculo
        setTimeout(() => {
            parentSubmenu.style.maxHeight = parentSubmenu.scrollHeight + "px";
        }, 10);
    }
};