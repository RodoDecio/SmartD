/* =========================================================
   RELATÓRIOS DE CHECKLISTS - VERSÃO INTEGRAL CORRIGIDA
========================================================= */

// 1. INICIALIZAÇÃO DA TELA
window.inicializarRelatoriosChecklist = async function () {
    const titulo = document.getElementById('titulo-pagina');
    if(titulo) titulo.innerText = 'Relatórios de Checklists';
    
    const container = document.getElementById('container-filtros-relatorio');
    if (container) {
        container.innerHTML = '';
        window.adicionarLinhaFiltroRelatorio('data');
    }

    const selectRodape = document.getElementById('sel-unidade');
    if (selectRodape) {
        selectRodape.removeEventListener('change', window.atualizarInputsPorUnidade);
        selectRodape.addEventListener('change', window.atualizarInputsPorUnidade);
    }

    // [CORREÇÃO DO ERRO]: Vincula o evento via JS, eliminando o erro "not a function" do HTML
    const btnGerar = document.getElementById('btn-gerar-checklist');
    if (btnGerar) {
        // Remove event listeners antigos clonando o nó (segurança contra duplicação)
        const newBtn = btnGerar.cloneNode(true);
        btnGerar.parentNode.replaceChild(newBtn, btnGerar);
        
        newBtn.onclick = function() {
            document.getElementById('modal-selecao-formato-checklist').classList.add('active');
        };
    }
};

window.atualizarInputsPorUnidade = function() {
    document.querySelectorAll('#container-filtros-relatorio .filter-row').forEach(row => {
        const selTipo = row.querySelector('.filter-select');
        if (selTipo && (selTipo.value === 'motorista' || selTipo.value === 'placa')) {
            const id = row.id.replace('row-', '');
            window.configurarInputRelatorio(selTipo, id);
        }
    });
};

// 2. GESTÃO DE FILTROS DINÂMICOS
window.adicionarLinhaFiltroRelatorio = function (tipoPadrao = "") {
    const container = document.getElementById('container-filtros-relatorio');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `row-${id}`;
    div.style = "display:flex; gap:10px; align-items:center; margin-bottom:8px;";

    div.innerHTML = `
        <select class="filter-select" style="width:200px" onchange="window.configurarInputRelatorio(this, '${id}')">
            <option value="" disabled ${!tipoPadrao ? 'selected' : ''}>Filtrar por...</option>
            <option value="data" ${tipoPadrao === 'data' ? 'selected' : ''}>Período (De/Até)</option>
            <option value="placa">Placa / Veículo</option>
            <option value="motorista">Motorista</option>
            <option value="status">Status</option>
        </select>
        <div id="wrapper-val-${id}" style="display:flex; gap:10px; flex:0 1 450px;">
            <input type="text" class="form-control" disabled placeholder="Selecione um filtro...">
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#ff4444;cursor:pointer">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
    if (tipoPadrao) window.configurarInputRelatorio(div.querySelector('select'), id);
};

window.configurarInputRelatorio = async function (sel, id) {
    const tipo = sel.value;
    const wrapper = document.getElementById(`wrapper-val-${id}`);
    if(!wrapper) return;
    wrapper.innerHTML = ''; // Limpa antes de inserir para evitar replicação

    const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";

    if (tipo === 'data') {
        wrapper.innerHTML = `<input type="date" class="form-control" id="val-ini-${id}"> <span style="align-self:center">até</span> <input type="date" class="form-control" id="val-fim-${id}">`;
    } else if (tipo === 'status') {
        // Status sincronizados com a realidade da tela
        wrapper.innerHTML = `
            <select class="form-control" id="val-${id}">
                <option value="pendente">PENDENTE</option>
                <option value="concluido_ok">CONCLUÍDO (OK)</option>
                <option value="concluido_corrigido">CORRIGIDO</option>
            </select>`;
    } else if (tipo === 'motorista' || tipo === 'placa') {
        const s = document.createElement('select');
        s.className = "form-control";
        s.id = `val-${id}`;
        
        let query;
        if (tipo === 'motorista') {
            query = clienteSupabase.from('perfis').select('id, nome_completo').eq('funcao', 'motorista').eq('ativo', true);
            if(unidadeId !== 'TODAS') query = query.eq('unidade_id', unidadeId);
        } else {
            query = clienteSupabase.from('veiculos').select('id, placa').eq('ativo', true);
            if(unidadeId !== 'TODAS') query = query.eq('unidade_id', unidadeId);
        }
        const { data } = await query.order(tipo === 'motorista' ? 'nome_completo' : 'placa');
        s.innerHTML = `<option value="">Todos (${tipo === 'motorista' ? 'Motoristas' : 'Placas'})</option>`;
        data?.forEach(item => {
            // CORREÇÃO: Usa ID para motorista e placa string para veículos para evitar erros de busca
            const val = tipo === 'motorista' ? item.id : item.placa;
            s.innerHTML += `<option value="${val}">${item.nome_completo || item.placa}</option>`;
        });
        wrapper.appendChild(s);
    }
};

// 3. CAPTURA DE FILTROS E GERAÇÃO PDF
window.capturarFiltrosChecklist = function() {
    let obj = { resumo: "", data_ini: null, data_fim: null, status: null, placa: null, motorista: null };
    let txt = [];
    document.querySelectorAll('#container-filtros-relatorio .filter-row').forEach(row => {
        const tipo = row.querySelector('.filter-select')?.value;
        const el = row.querySelector('select[id^="val-"], input[id^="val-"]');
        if (tipo === 'data') {
            obj.data_ini = row.querySelector('input[id^="val-ini"]')?.value;
            obj.data_fim = row.querySelector('input[id^="val-fim"]')?.value;
            if(obj.data_ini) txt.push(`Período: ${new Date(obj.data_ini + 'T00:00:00').toLocaleDateString('pt-BR')} a ${obj.data_fim ? new Date(obj.data_fim + 'T00:00:00').toLocaleDateString('pt-BR') : 'Hoje'}`);
        } else if (el?.value) {
            obj[tipo] = el.value;
            const label = el.tagName === 'SELECT' ? el.options[el.selectedIndex].text : el.value;
            txt.push(`${tipo.toUpperCase()}: ${label}`);
        }
    });
    obj.resumo = txt.join(' | ') || "Geral";
    return obj;
};

/* =========================================================
   2. BUSCA DE DADOS CENTRALIZADA
========================================================= */
window.buscarDadosChecklist = async function() {
    const filtros = window.capturarFiltrosChecklist();
    const unidadeMestre = document.getElementById('sel-unidade')?.value;
    
    // Texto de filtros para o cabeçalho
    const unidadeTexto = document.getElementById('sel-unidade')?.options[document.getElementById('sel-unidade').selectedIndex]?.text || "Todas";
    const filtrosTexto = `${filtros.resumo} | Unidade: ${unidadeTexto}`;

    let query = clienteSupabase.from('inspecoes').select(`
        *,
        veiculos!inner (placa, unidade_id, unidades(nome)),
        motorista:perfis!motorista_id (nome_completo),
        responsavel:perfis!responsavel_atual_id (nome_completo)
    `);

    if (unidadeMestre && unidadeMestre !== 'TODAS') query = query.eq('veiculos.unidade_id', unidadeMestre);

    // Aplicação dos Filtros
    if (filtros.placa) query = query.eq('veiculos.placa', filtros.placa);
    if (filtros.motorista) query = query.eq('motorista_id', filtros.motorista);
    if (filtros.status) {
        const st = filtros.status.toLowerCase();
        if (st === 'pendente') query = query.in('status', ['aberto', 'NOK', 'divergente', 'pendente', 'em_analise', 'aguardando_motorista']);
        else if (st === 'concluido_corrigido' || st === 'corrigido') query = query.eq('status', 'concluido').not('data_atendimento', 'is', null);
        else if (st === 'concluido_ok') query = query.eq('status', 'concluido').is('data_atendimento', null);
        else query = query.eq('status', st);
    }
    if (filtros.data_ini) query = query.gte('data_abertura', `${filtros.data_ini}T00:00:00`);
    if (filtros.data_fim) query = query.lte('data_abertura', `${filtros.data_fim}T23:59:59`);

    const { data: inspecoes, error } = await query.order('numero_controle', { ascending: true });
    if (error || !inspecoes || inspecoes.length === 0) throw error || new Error("Nenhum dado encontrado");

    return { inspecoes, filtrosTexto };
};

/* =========================================================
   3. ORQUESTRADOR DE EXPORTAÇÃO
========================================================= */
window.iniciarExportacaoChecklist = async function(formato) {
    document.getElementById('modal-selecao-formato-checklist').classList.remove('active');
    
    const btn = document.getElementById('btn-gerar-checklist');
    if (btn) { btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> GERANDO ${formato.toUpperCase()}...`; btn.disabled = true; }

    try {
        const isDetalhado = document.getElementById('rel-tipo-detalhado').checked;
        const dados = await window.buscarDadosChecklist();

        // Se for detalhado, precisamos buscar as respostas também (para PDF e Excel)
        if (isDetalhado) {
            // Busca respostas em lote para todas as inspeções encontradas
            const ids = dados.inspecoes.map(i => i.id);
            const { data: respostas } = await clienteSupabase.from('respostas_inspecao')
                .select('*, item:itens_checklist(pergunta, sla_horas, categoria:categorias_checklist(nome))')
                .in('inspecao_id', ids);
            
            // Anexa as respostas a cada inspeção
            dados.inspecoes.forEach(insp => {
                insp.respostas = respostas.filter(r => r.inspecao_id === insp.id);
            });
        }

        if (formato === 'pdf') {
            await window.gerarRelatorioChecklistPDF(dados, isDetalhado);
        } else if (formato === 'excel') {
            await window.gerarRelatorioChecklistExcel(dados, isDetalhado);
        }

    } catch (e) {
        console.error(e);
        window.mostrarToast(e.message, "error");
    } finally {
        if (btn) { btn.innerHTML = '<i class="fas fa-file-alt"></i> GERAR RELATÓRIO'; btn.disabled = false; }
    }
};

/* =========================================================
   4. GERADOR EXCEL
========================================================= */
window.gerarRelatorioChecklistExcel = async function({ inspecoes, filtrosTexto }, isDetalhado) {
    if (typeof ExcelJS === 'undefined') {
        const btn = document.getElementById('btn-gerar-checklist');
        if(btn) btn.innerHTML = '<i class="fas fa-download"></i> BAIXANDO LIB...';
        await new Promise((resolve) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
            script.onload = resolve;
            document.head.appendChild(script);
        });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Checklists');
    sheet.views = [{ showGridLines: false }];

    // 1. LOGO
    try {
        const response = await fetch('icons/Logo-TRR.png');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            const logoId = workbook.addImage({ buffer: buffer, extension: 'png' });
            sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 45 } });
        }
    } catch (e) { console.warn("Logo off"); }

    // 2. CABEÇALHO
    sheet.mergeCells('B1:H1'); 
    const titleCell = sheet.getCell('B1');
    titleCell.value = isDetalhado ? "RELATÓRIO DE CHECKLISTS (DETALHADO)" : "RELATÓRIO DE CHECKLISTS (RESUMO)";
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.mergeCells('B2:H2');
    const subTitleCell = sheet.getCell('B2');
    subTitleCell.value = filtrosTexto;
    subTitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
    subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.getRow(1).height = 40;
    sheet.getRow(2).height = 20;

    // 3. DEFINIÇÃO DE COLUNAS E DADOS
    const linhasTabela = [];
    let colunasConfig = [];

    // --- CONFIGURAÇÃO DE LARGURA E COLUNAS ---
    if (!isDetalhado) {
        // MODO RESUMIDO
        colunasConfig = [
            { name: 'Nº Controle', filterButton: true },
            { name: 'Data Abertura', filterButton: true },
            { name: 'Unidade', filterButton: true },
            { name: 'Placa', filterButton: true },
            { name: 'Motorista', filterButton: true },
            { name: 'Status', filterButton: true },
            { name: 'Responsável', filterButton: true },
            { name: 'SLA / Tempo', filterButton: true }
        ];

        // Larguras Expandidas
        sheet.getColumn('A').width = 22; // Logo
        sheet.getColumn('B').width = 18; // Data
        sheet.getColumn('C').width = 20; // Unidade
        sheet.getColumn('D').width = 15; // Placa
        sheet.getColumn('E').width = 40; // Motorista (Expandido)
        sheet.getColumn('F').width = 20; // Status
        sheet.getColumn('G').width = 35; // Responsável (Expandido)
        sheet.getColumn('H').width = 20; // SLA

        inspecoes.forEach(i => {
            const [ano, mes, dia] = i.data_abertura.split('T')[0].split('-');
            const dataJs = new Date(Date.UTC(parseInt(ano), parseInt(mes) - 1, parseInt(dia)));
            
            let slaTxt = "-";
            if (i.data_atendimento) {
                const diff = new Date(i.data_atendimento) - new Date(i.data_abertura);
                const hrs = Math.floor(diff / 36e5);
                slaTxt = `${hrs}h ${Math.floor((diff % 36e5) / 60000)}m`;
            }

            linhasTabela.push([
                `#${i.numero_controle}`,
                dataJs,
                i.veiculos?.unidades?.nome || '-',
                i.veiculos?.placa,
                i.motorista?.nome_completo,
                window.obterStatusParaRelatorio(i),
                i.responsavel?.nome_completo || '-',
                slaTxt
            ]);
        });

    } else {
        // MODO DETALHADO
        colunasConfig = [
            { name: 'Nº Controle', filterButton: true },
            { name: 'Placa', filterButton: true },
            { name: 'Categoria', filterButton: true },
            { name: 'Item Verificado', filterButton: true },
            { name: 'Resposta', filterButton: true },
            { name: 'Conformidade', filterButton: true },
            { name: 'Status SLA', filterButton: true },
            { name: 'Observação', filterButton: true }
        ];

        // Larguras Expandidas para Detalhes
        sheet.getColumn('A').width = 22; // Logo
        sheet.getColumn('B').width = 15; // Placa
        sheet.getColumn('C').width = 25; // Categoria
        sheet.getColumn('D').width = 50; // Item (Bem Largo)
        sheet.getColumn('E').width = 25; // Resposta
        sheet.getColumn('F').width = 18; // Conformidade
        sheet.getColumn('G').width = 20; // SLA
        sheet.getColumn('H').width = 50; // Obs (Bem Largo)

        inspecoes.forEach(i => {
            if (i.respostas) {
                i.respostas.forEach(r => {
                    const slaInfo = window.calcularSlaSemaforo(r, i.data_abertura);
                    linhasTabela.push([
                        `#${i.numero_controle}`,
                        i.veiculos?.placa,
                        r.item?.categoria?.nome?.toUpperCase() || 'GERAL',
                        r.item?.pergunta || '-',
                        r.resposta_valor,
                        r.is_conforme ? 'OK' : 'NOK',
                        slaInfo.tempo,
                        (r.observacao_motorista || '')
                    ]);
                });
            }
        });
    }

    // 4. CRIAR TABELA
    const table = sheet.addTable({
        name: 'TabelaChecklists',
        ref: 'A6',
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: colunasConfig,
        rows: linhasTabela
    });

    // 5. FORMATAÇÃO E ALINHAMENTO
    
    // Cabeçalho da Tabela (Linha 6)
    sheet.getRow(6).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    // --- ALINHAMENTO DAS COLUNAS DE DADOS ---
    
    // A: Nº Controle (Centro)
    sheet.getColumn('A').alignment = { horizontal: 'center', vertical: 'middle' };
    
    // B: Data/Placa (Centro)
    if (!isDetalhado) sheet.getColumn('B').numFmt = 'dd/mm/yyyy';
    sheet.getColumn('B').alignment = { horizontal: 'center', vertical: 'middle' };

    // C: Unidade/Categoria (Centro)
    sheet.getColumn('C').alignment = { horizontal: 'center', vertical: 'middle' };

    // D: Placa/Item (Placa=Centro, Item=Esquerda)
    sheet.getColumn('D').alignment = { horizontal: isDetalhado ? 'left' : 'center', vertical: 'middle', wrapText: isDetalhado };

    // E: Motorista/Resposta (Esquerda)
    sheet.getColumn('E').alignment = { horizontal: 'left', vertical: 'middle' };

    // F: Status/Conformidade (Centro)
    sheet.getColumn('F').alignment = { horizontal: 'center', vertical: 'middle' };

    // G: Responsável/SLA (Resp=Esquerda, SLA=Centro)
    sheet.getColumn('G').alignment = { horizontal: isDetalhado ? 'center' : 'left', vertical: 'middle' };

    // H: Tempo/Obs (Tempo=Centro, Obs=Esquerda)
    sheet.getColumn('H').alignment = { horizontal: isDetalhado ? 'left' : 'center', vertical: 'middle', wrapText: isDetalhado };

    // Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Checklists_${Date.now()}.xlsx`;
    link.click();
    
    // Restaura botão
    const btn = document.getElementById('btn-gerar-checklist');
    if (btn) btn.innerHTML = '<i class="fas fa-file-alt"></i> GERAR RELATÓRIO';
};

/* =========================================================
   5. GERADOR PDF 
========================================================= */

window.gerarRelatorioChecklistPDF = async function ({ inspecoes, filtrosTexto }, isDetalhado) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    
    // Filtro objeto simulado para aproveitar função de cabeçalho existente
    const filtrosObj = { resumo: filtrosTexto }; 

    if (!isDetalhado) {
        // RELATÓRIO SIMPLES
        await window.montarRelatorioSimples(doc, inspecoes, filtrosObj);
    } else {
        // RELATÓRIO DETALHADO
        // Nota: inspecoes já vem com .respostas populado pelo "buscarDadosChecklist"
        await window.montarRelatorioDetalhado(doc, inspecoes, filtrosObj);
    }

    window.finalizarPaginacaoRelatorio(doc, inspecoes.length);
    document.getElementById('iframe-pdf').src = doc.output('datauristring');
    document.getElementById('modal-preview-relatorio').classList.add('active');
};

// 4. MONTAGEM DE CONTEÚDO
window.montarRelatorioSimples = async function(doc, inspecoes, filtros) {
    doc.addPage(); // Inicia na primeira página real
    await window.desenharCabecalhoCorporativo(doc, "RELATÓRIO DE CHECKLISTS", filtros);
    const rows = inspecoes.map(i => [
        `#${i.numero_controle}`,
        new Date(i.data_abertura).toLocaleDateString('pt-BR'),
        i.veiculos?.placa || '---',
        i.motorista?.nome_completo || '---',
        window.obterStatusParaRelatorio(i),
        i.responsavel?.nome_completo || '---'
    ]);
    doc.autoTable({
        startY: 35,
        head: [['Nº Controle', 'Data', 'Placa', 'Motorista', 'Status', 'Atendente']],
        body: rows,
        theme: 'grid', styles: { fontSize: 7.5 }, headStyles: { fillColor: [0, 51, 153], halign: 'center' }
    });
};

window.montarRelatorioDetalhado = async function(doc, inspecoes, filtros) {
    for (const insp of inspecoes) {
        doc.addPage();
        await window.desenharCabecalhoCorporativo(doc, "RELATÓRIO DE CHECKLISTS", filtros);
        let currentY = 35;
        doc.setFillColor(230, 230, 230).rect(14, currentY, 182, 7, 'F');
        doc.setFontSize(8).setFont(undefined, 'bold').setTextColor(0);
        doc.text(`CHECKLIST #${insp.numero_controle} | DATA: ${new Date(insp.data_abertura).toLocaleDateString('pt-BR')} | PLACA: ${insp.veiculos?.placa} | STATUS: ${window.obterStatusParaRelatorio(insp)}`, 16, currentY + 5);
        currentY += 10;

        const { data: respostas } = await clienteSupabase.from('respostas_inspecao')
            .select('*, item:itens_checklist(pergunta, sla_horas, categoria:categorias_checklist(nome))')
            .eq('inspecao_id', insp.id);

        const categorias = {};
        respostas?.forEach(r => {
            const c = r.item?.categoria?.nome || 'GERAL';
            if (!categorias[c]) categorias[c] = [];
            categorias[c].push(r);
        });

        const bodyTable = [];
        for (const cat in categorias) {
            bodyTable.push([{ content: cat.toUpperCase(), colSpan: 4, styles: { fillColor: [242, 242, 242], fontStyle: 'bold' } }]);
            categorias[cat].forEach(r => {
                const { tempo, cor, estourou } = window.calcularSlaSemaforo(r, insp.data_abertura);
                bodyTable.push([r.item?.pergunta || '---', r.resposta_valor, r.is_conforme ? 'Conforme' : 'Não Conforme', { content: tempo, styles: { textColor: cor, fontStyle: estourou ? 'bold' : 'normal' } }]);
            });
        }
        doc.autoTable({
            startY: currentY, head: [['Pergunta', 'Resposta', 'Avaliação', 'SLA Correção']], body: bodyTable,
            theme: 'grid', styles: { fontSize: 7 }, headStyles: { fillColor: [100, 100, 100] }
        });
        currentY = doc.lastAutoTable.finalY + 8;
        const totalMs = (insp.data_resolucao ? new Date(insp.data_resolucao) : new Date()) - new Date(insp.data_abertura);
        doc.setFontSize(8.5).setFont(undefined, 'bold').setTextColor(0, 51, 153).text(`SLA TOTAL DO PROCESSO: ${window.fmtMsParaSla(totalMs)} | ATENDENTE: ${insp.responsavel?.nome_completo || '---'}`, 14, currentY);
    }
};

// 5. UTILS E PAGINAÇÃO
window.finalizarPaginacaoRelatorio = function(doc, total) {
    const totalPaginas = doc.internal.getNumberOfPages();
    // CORREÇÃO: Remove a página técnica (em branco) gerada na criação do objeto jsPDF
    doc.deletePage(1); 
    const totalReal = totalPaginas - 1;

    for (let i = 1; i <= totalReal; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150).text(`Página ${i} de ${totalReal}`, 185, 288);
    }
    doc.setPage(totalReal);
    doc.setFontSize(9).setFont(undefined, 'bold').setTextColor(0, 51, 153).text(`Total de registros exibidos: ${total}`, 14, 280);
};

window.obterStatusParaRelatorio = function(i) {
    const st = (i.status || '').toLowerCase();
    if (st === 'concluido') return i.data_atendimento ? 'CORRIGIDO' : 'CONCLUÍDO';
    if (['pendente', 'nok', 'divergente', 'aberto'].includes(st)) return 'PENDENTE';
    return st.toUpperCase();
};

window.desenharCabecalhoCorporativo = async function(doc, titulo, filtros) {
    doc.setFillColor(242, 242, 242).rect(0, 0, 55, 25, 'F');
    try { doc.addImage('icons/Logo-TRR.png', 'PNG', 7, 5, 40, 15); } catch(e) {}
    doc.setFillColor(0, 51, 153).rect(55, 0, 155, 25, 'F');
    doc.setTextColor(255).setFontSize(14).setFont(undefined, 'bold').text(titulo, 60, 12);
    doc.setFontSize(8).setFont(undefined, 'normal').text(`Filtros: ${filtros.resumo}`, 60, 18);
    doc.setFontSize(7).setTextColor(200).text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, 60, 23);
};

window.calcularSlaSemaforo = function(res, abertura) {
    // [CORREÇÃO]
    // 1. Se é conforme E não tem data de resolução, significa que nunca deu problema (OK Original).
    if (res.is_conforme && !res.data_resolucao_item) {
        return { tempo: "---", cor: [0,0,0], estourou: false };
    }

    // 2. Se não tem data de resolução (e não caiu no if acima), está Pendente.
    if (!res.data_resolucao_item) {
        return { tempo: "Pendente", cor: [200, 0, 0], estourou: true };
    }

    // 3. Se chegou aqui, tem data_resolucao_item. 
    // Significa que foi corrigido (mesmo que agora esteja is_conforme = true).
    // Calculamos o tempo gasto.
    const ms = new Date(res.data_resolucao_item) - new Date(abertura);
    const horas = ms / 36e5; // Converte ms para horas
    
    // Pega o SLA definido no cadastro do item ou assume 24h padrão
    const sla = res.item?.sla_horas || 24; 
    
    // Define cores do semáforo (Verde < 33%, Azul < 66%, Laranja < 100%, Vermelho estourado)
    const f1 = sla / 3; 
    const f2 = f1 * 2;
    
    let cor = [200, 0, 0]; // Padrão Vermelho (Estourado)
    let estourou = horas > sla;

    if (!estourou) {
        if (horas <= f1) cor = [0, 128, 0]; // Verde (Rápido)
        else if (horas <= f2) cor = [0, 51, 153]; // Azul (Médio)
        else cor = [255, 165, 0]; // Laranja (Atenção)
    }

    return { tempo: window.fmtMsParaSla(ms), cor, estourou };
};

window.fmtMsParaSla = function(ms) {
    const totalMin = Math.floor(Math.max(0, ms) / 60000);
    return `${String(Math.floor(totalMin / 60)).padStart(2, '0')}h ${String(totalMin % 60).padStart(2, '0')}m`;
};

window.fecharPreviewRelatorio = function() {
    document.getElementById('modal-preview-relatorio').classList.remove('active');
    document.getElementById('iframe-pdf').src = "";
};