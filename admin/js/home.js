async function carregarVisaoGeral() {
    // 1. Atualiza título e limpa menu
    const titulo = document.getElementById('titulo-pagina');
    if(titulo) titulo.innerText = 'Visão Geral';
    
    document.querySelectorAll('.submenu-item').forEach(i => i.classList.remove('menu-ativo'));

    const area = document.getElementById('area-conteudo');
    
    // 2. Loader inicial (Centralizado)
    area.innerHTML = `
        <div style="display:flex; flex-direction:column; justify-content:center; align-items:center; height:80vh; color:#555;">
            <i class="fas fa-circle-notch fa-spin fa-3x"></i><br><br>
            <span>Carregando métricas estratégicas...</span>
        </div>
    `;

    try {
        // 3. Busca dados no Supabase com as colunas necessárias
        const [resColab, resVeic, resUnidades] = await Promise.all([
            clienteSupabase
                .from('perfis')
                .select('id, unidade_id, funcao, nome_completo, unidades(nome)'), 
            
            clienteSupabase
                .from('veiculos')
                .select('id, unidade_id, tipo_veiculo, capacidade_tanque, unidades(nome)'), 
            
            clienteSupabase
                .from('unidades')
                .select('id, nome, estado, cidade') 
        ]);

        if (resColab.error) throw resColab.error;
        if (resVeic.error) throw resVeic.error;
        if (resUnidades.error) throw resUnidades.error;

        // --- 4. APLICAÇÃO DOS FILTROS DE REGRA DE NEGÓCIO ---

        // Set para controlar duplicidade de nomes (evita contagem dupla de quem tem acesso mobile + web)
        const nomesUnicos = new Set();

        // Filtro Colaboradores Complexo
        const listaColabFiltrada = resColab.data.filter(c => {
            // Normaliza para minúsculas e remove espaços extras para comparação
            const nome = (c.nome_completo || '').trim().toLowerCase();
            const funcao = (c.funcao || '').toLowerCase();

            // Regra 1: Remove o "Administrador Geral" da contagem
            if (c.nome_completo === 'Administrador Geral') return false;

            // Regra 2: Tratativa específica para "Alan"
            // Exclui o cadastro dele de "manutentor" para contabilizar apenas o de "analista"
            if (nome.includes('alan') && funcao === 'manutentor') {
                return false;
            }

            // [NOVA REGRA]: Tratativa específica para "Rondinele"
            // Exclui o cadastro dele de "manutentor"
            if (nome.includes('rondinele') && funcao === 'manutentor') {
                return false;
            }

            // Regra 3: Deduplicação Geral (Para manutentores com 2 logins: CPF e Email)
            // Se o nome já foi processado, ignoramos este registro (mantém apenas o primeiro encontrado)
            if (nomesUnicos.has(nome)) {
                return false;
            }

            // Se passou pelos filtros, registra o nome e inclui na lista
            nomesUnicos.add(nome);
            return true;
        });

        // Filtro Veículos: Contabiliza apenas a frota operacional (remove Automóveis)
        const listaVeiculosFiltrada = resVeic.data.filter(v => 
            v.tipo_veiculo !== 'Automóvel'
        );

        // --- 5. MONTAGEM DOS CARDS ---
        const htmlColab = montarCardColaboradores(listaColabFiltrada);
        const htmlVeic = montarCardVeiculos(listaVeiculosFiltrada);
        const htmlUnidades = montarCardUnidades(resUnidades.data);

        // --- 6. RENDERIZAÇÃO DO LAYOUT FINAL ---
        area.innerHTML = `
            <div style="
                display: flex; 
                flex-direction: column; 
                justify-content: center; 
                min-height: calc(100vh - 120px); 
                padding: 20px 0;
            ">
                <div class="dashboard-grid">
                    ${htmlColab}
                    ${htmlVeic}
                    ${htmlUnidades}
                </div>
            </div>
        `;

    } catch (error) {
        console.error("Erro dashboard:", error);
        area.innerHTML = `
            <div style="display:flex; justify-content:center; align-items:center; height:80vh; color:red">
                <div style="text-align:center">
                    <h3><i class="fas fa-exclamation-triangle"></i> Erro ao carregar Visão Geral</h3>
                    <p>${error.message}</p>
                </div>
            </div>
        `;
    }
}

// --- CARD: COLABORADORES ---
function montarCardColaboradores(lista) {
    const total = lista.length;
    const mapaFuncoes = {};
    const mapaUnidades = {};

    lista.forEach(item => {
        // Contagem por Perfil (Função)
        const f = item.funcao || 'Não Definido';
        mapaFuncoes[f] = (mapaFuncoes[f] || 0) + 1;

        // Contagem por Unidade para Concentração
        const uni = (item.unidades && item.unidades.nome) ? item.unidades.nome : 'Sem Unidade';
        mapaUnidades[uni] = (mapaUnidades[uni] || 0) + 1;
    });

    // Gera lista de perfis
    let htmlPerfis = '';
    Object.entries(mapaFuncoes).forEach(([funcao, qtd]) => {
        const label = funcao.charAt(0).toUpperCase() + funcao.slice(1);
        htmlPerfis += `<div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
            <span>${label}</span><strong>${qtd}</strong>
        </div>`;
    });

    // Cálculo da Maior Concentração
    let maiorUnidade = "Nenhuma", maiorQtd = 0;
    Object.entries(mapaUnidades).forEach(([nome, qtd]) => {
        if (qtd > maiorQtd) { maiorQtd = qtd; maiorUnidade = nome; }
    });
    const perc = total > 0 ? ((maiorQtd / total) * 100).toFixed(1) : 0;

    return `
        <div class="dash-card card-colab">
            <i class="fas fa-users dash-icon-bg"></i>
            <div class="dash-title"><i class="fas fa-user-tie"></i> Equipe Total</div>
            <div class="dash-main-number">${total}</div>
            
            <div style="margin: 15px 0; padding: 10px; background: rgba(0,0,0,0.03); border-radius: 6px;">
                <h6 style="margin-bottom:8px; font-size:11px; color:#666; text-transform:uppercase;">Perfis</h6>
                ${htmlPerfis}
            </div>

            <div class="dash-detail">
                <h6>Maior Concentração</h6>
                <p>${maiorUnidade}</p>
                <small>${maiorQtd} pessoas (${perc}%)</small>
                <div class="progress-container"><div class="progress-bar" style="width: ${perc}%; background-color: #007bff;"></div></div>
            </div>
        </div>
    `;
}

// --- CARD: VEÍCULOS ---
function montarCardVeiculos(lista) {
    const total = lista.length;
    const mapaCapacidades = {};
    const mapaFrota = {};
    let totalCarretas = 0;

    lista.forEach(v => {
        // Contagem específica de Carretas (Independente da capacidade)
        if (v.tipo_veiculo === 'Carreta') {
            totalCarretas++;
        }

        // Agrupa por Capacidade para o Top 3
        const cap = v.capacidade_tanque ? parseFloat(v.capacidade_tanque).toLocaleString('pt-BR') + ' L' : 'Outros';
        mapaCapacidades[cap] = (mapaCapacidades[cap] || 0) + 1;

        // Agrupa por Unidade para Maior Frota
        const uni = (v.unidades && v.unidades.nome) ? v.unidades.nome : 'Sem Unidade';
        mapaFrota[uni] = (mapaFrota[uni] || 0) + 1;
    });

    // Gera HTML das Capacidades (Top 3)
    let htmlCaps = '';
    Object.entries(mapaCapacidades).sort((a,b) => b[1] - a[1]).slice(0, 3).forEach(([cap, qtd]) => {
        htmlCaps += `
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:4px;">
                <span>${cap}</span><strong>${qtd}</strong>
            </div>`;
    });

    // Cálculo da Maior Frota
    let maiorUnidade = "Nenhuma", maiorQtd = 0;
    Object.entries(mapaFrota).forEach(([nome, qtd]) => {
        if (qtd > maiorQtd) { maiorQtd = qtd; maiorUnidade = nome; }
    });
    const perc = total > 0 ? ((maiorQtd / total) * 100).toFixed(1) : 0;

    return `
        <div class="dash-card card-veic">
            <i class="fas fa-truck dash-icon-bg"></i>
            <div class="dash-title"><i class="fas fa-truck-moving"></i> Frota Operacional</div>
            <div class="dash-main-number">${total}</div>

            <div style="margin: 15px 0; padding: 10px; background: rgba(0,0,0,0.03); border-radius: 6px;">
                <h6 style="margin-bottom:8px; font-size:11px; color:#666; text-transform:uppercase;">Capacidades (Top 3)</h6>
                ${htmlCaps}
                
                <div style="margin-top: 8px; padding-top: 5px; border-top: 1px dashed #ccc; display: flex; justify-content: space-between; font-size: 10px; color: #888; font-style: italic;">
                    <span>Total de Carretas:</span>
                    <span>${totalCarretas} un.</span>
                </div>
            </div>
            
            <div class="dash-detail" style="border-left-color: #28a745;">
                <h6>Maior Frota Operacional</h6>
                <p>${maiorUnidade}</p>
                <small>${maiorQtd} veículos (${perc}%)</small>
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${perc}%; background-color: #28a745;"></div>
                </div>
            </div>
        </div>
    `;
}

// --- CARD: UNIDADES (Distribuição por Estado) ---
function montarCardUnidades(lista) {
    const total = lista.length;
    let listaCidadesHtml = '';

    if (total > 0) {
        // Ordena por estado e depois por cidade
        const ordenada = [...lista].sort((a, b) => {
            if (a.estado !== b.estado) return a.estado.localeCompare(b.estado);
            return (a.cidade || '').localeCompare(b.cidade || '');
        });

        ordenada.forEach(item => {
            const cidade = item.cidade || 'Não informada';
            const estado = item.estado || '??';
            
            listaCidadesHtml += `
                <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(0,0,0,0.05); font-size: 13px;">
                    <span style="color: #333;"><i class="fas fa-city" style="font-size: 10px; color: #ccc; margin-right: 8px;"></i>${cidade}</span>
                    <strong style="background: #f8f9fa; padding: 2px 6px; border-radius: 4px; font-size: 11px; color: #fd7e14;">${estado}</strong>
                </div>
            `;
        });
    } else {
        listaCidadesHtml = '<span style="color:#999">Sem dados</span>';
    }

    return `
        <div class="dash-card card-unit">
            <i class="fas fa-building dash-icon-bg"></i>
            <div class="dash-title"><i class="fas fa-map-marker-alt"></i> Unidades</div>
            <div class="dash-main-number">${total}</div>
            
            <div class="dash-detail" style="border-left-color: #fd7e14; max-height: 200px; overflow-y: auto;">
                <h6 style="margin-bottom:10px; font-size: 11px; text-transform: uppercase; color: #666;">Cidades c/ Unidades</h6>
                <div class="city-list-vertical">
                    ${listaCidadesHtml}
                </div>
            </div>
        </div>
    `;
}