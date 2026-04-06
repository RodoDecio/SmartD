window.inicializarRelatoriosColetas = async function () {
    const titulo = document.getElementById('titulo-pagina');
    if(titulo) titulo.innerText = 'Relatórios de Coletas de Combustível';
    
    const container = document.getElementById('container-filtros-coletas');
    if (container) container.innerHTML = ''; 

    const btnGerar = document.getElementById('btn-gerar-coletas');
    if (btnGerar) {
        const newBtn = btnGerar.cloneNode(true);
        btnGerar.parentNode.replaceChild(newBtn, btnGerar);
        
        newBtn.onclick = function() {
            document.getElementById('modal-selecao-formato-coletas').classList.add('active');
        };
    }

    // Adiciona o filtro inicial padrão de Data
    window.adicionarLinhaFiltroColetas('periodo');
};

// --- GESTÃO DE FILTROS ---
window.adicionarLinhaFiltroColetas = function (tipoPadrao = "") {
    const container = document.getElementById('container-filtros-coletas');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `row-col-${id}`;
    div.style = "display:flex; gap:10px; align-items:center; margin-bottom:8px;";

    div.innerHTML = `
        <select class="filter-select" style="width:200px" onchange="window.configurarInputRelColetas(this, '${id}')">
            <option value="" disabled ${!tipoPadrao ? 'selected' : ''}>Filtrar por...</option>
            <option value="periodo">Período (Início)</option>
            <option value="status">Status</option>
            <option value="motorista">Motorista (Nome)</option>
            <option value="placa">Placa Cavalo</option>
            <option value="combustivel">Tipo de Combustível</option>
        </select>
        <div id="wrapper-val-col-${id}" style="display:flex; gap:10px; flex:0 1 450px; align-items:center;">
            <input type="text" class="form-control" disabled placeholder="Selecione um filtro...">
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#ff4444;cursor:pointer">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
    
    if (tipoPadrao) {
        const sel = div.querySelector('select');
        sel.value = tipoPadrao;
        window.configurarInputRelColetas(sel, id);
    }
};

window.configurarInputRelColetas = async function (sel, id) {
    const tipo = sel.value;
    const wrapper = document.getElementById(`wrapper-val-col-${id}`);
    if(!wrapper) return;
    wrapper.innerHTML = '';

    const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";

    if (tipo === 'periodo') {
        wrapper.innerHTML = `
            <input type="date" class="form-control" id="val-col-ini-${id}" title="Data Inicial">
            <span style="color:#666;">até</span>
            <input type="date" class="form-control" id="val-col-fim-${id}" title="Data Final">
        `;
    } else if (tipo === 'status') {
        wrapper.innerHTML = `
            <select class="form-control" id="val-col-${id}">
                <option value="Agendado">Agendado</option>
                <option value="Em Trânsito">Em Trânsito</option>
                <option value="Entregue">Entregue</option>
            </select>`;
    } else if (tipo === 'combustivel') {
        wrapper.innerHTML = `
            <select class="form-control" id="val-col-${id}">
                <option value="Diesel S-500">Diesel S-500</option>
                <option value="Diesel S-10">Diesel S-10</option>
                <option value="Gasolina">Gasolina</option>
                <option value="Etanol">Etanol</option>
            </select>`;
    } else if (tipo === 'motorista' || tipo === 'placa') {
        // Exibe "Carregando" enquanto busca os dados no banco
        wrapper.innerHTML = `<select class="form-control" id="val-col-${id}"><option value="">Carregando...</option></select>`;
        
        try {
            // Busca os registros diretamente na tabela de COLETAS
            let query = clienteSupabase.from('coletas_combustivel')
                .select('placa_cavalo, perfis:motorista_id(nome_completo)');
            
            if (unidadeId !== 'TODAS') {
                query = query.eq('unidade_id', unidadeId);
            }

            const { data, error } = await query;
            if (error) throw error;
            
            const selectEl = document.getElementById(`val-col-${id}`);
            if (!selectEl) return;
            
            selectEl.innerHTML = `<option value="">Todos</option>`;
            
            if (data && data.length > 0) {
                if (tipo === 'motorista') {
                    // Extrai apenas os nomes dos motoristas, remove nulos e duplicados, e ordena alfabeticamente
                    const nomesUnicos = [...new Set(data.map(c => c.perfis?.nome_completo).filter(Boolean))].sort();
                    nomesUnicos.forEach(nome => {
                        selectEl.innerHTML += `<option value="${nome}">${nome}</option>`;
                    });
                } else if (tipo === 'placa') {
                    // Extrai apenas as placas, remove nulos e duplicados, e ordena
                    const placasUnicas = [...new Set(data.map(c => c.placa_cavalo).filter(Boolean))].sort();
                    placasUnicas.forEach(placa => {
                        selectEl.innerHTML += `<option value="${placa}">${placa}</option>`;
                    });
                }
            } else {
                selectEl.innerHTML = `<option value="">Nenhum registro encontrado</option>`;
            }
        } catch (e) {
            console.error("Erro ao carregar lista de filtro:", e);
            // Fallback: se falhar a busca, volta a ser texto livre
            wrapper.innerHTML = `<input type="text" class="form-control" id="val-col-${id}" placeholder="Digite para filtrar...">`;
        }
    }
};

window.capturarFiltrosColetas = function() {
    let obj = { resumo: [], periodo: null, status: null, motorista: null, placa: null, combustivel: null };
    
    document.querySelectorAll('#container-filtros-coletas .filter-row').forEach(row => {
        const selTipo = row.querySelector('.filter-select');
        const tipo = selTipo?.value;
        const rootId = row.id.split('-')[2];
        
        if (tipo === 'periodo') {
            const dtIni = row.querySelector(`#val-col-ini-${rootId}`)?.value;
            const dtFim = row.querySelector(`#val-col-fim-${rootId}`)?.value;
            if (dtIni || dtFim) {
                obj.periodo = { inicio: dtIni, fim: dtFim };
                const fIni = dtIni ? dtIni.split('-').reverse().join('/') : 'Início';
                const fFim = dtFim ? dtFim.split('-').reverse().join('/') : 'Hoje';
                obj.resumo.push(`Período: ${fIni} a ${fFim}`);
            }
        } else {
            const el = row.querySelector(`#val-col-${rootId}`); 
            if (el?.value) {
                obj[tipo] = el.value;
                const label = el.tagName === 'SELECT' ? el.options[el.selectedIndex].text : el.value;
                obj.resumo.push(`${selTipo.options[selTipo.selectedIndex].text}: ${label}`);
            }
        }
    });
    
    return obj;
};

// --- BUSCA DE DADOS ---
window.buscarDadosColetasRelatorio = async function() {
    const filtros = window.capturarFiltrosColetas();
    const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
    const nomeUnidade = document.getElementById('sel-unidade')?.options[document.getElementById('sel-unidade').selectedIndex]?.text || "Todas";

    let textoResumo = filtros.resumo.join(' | ');
    if (textoResumo) textoResumo += ` | Unidade: ${nomeUnidade}`;
    else textoResumo = `Filtro Geral | Unidade: ${nomeUnidade}`;

    // Busca relacional de Motorista e Unidade
    let query = clienteSupabase.from('coletas_combustivel')
        .select(`*, perfis:motorista_id(nome_completo), unidades:unidade_id(nome)`)
        .order('data_hora_inicio', { ascending: false });

    // Filtros de Banco (Query)
    if (unidadeId !== 'TODAS') {
        query = query.eq('unidade_id', unidadeId);
    }
    if (filtros.status) {
        query = query.eq('status', filtros.status);
    }
    if (filtros.periodo) {
        if (filtros.periodo.inicio) query = query.gte('data_hora_inicio', `${filtros.periodo.inicio}T00:00:00`);
        if (filtros.periodo.fim) query = query.lte('data_hora_inicio', `${filtros.periodo.fim}T23:59:59`);
    }

    const { data, error } = await query;
    if (error) throw error;
    
    let resultados = data || [];

    // Filtros Locais (JS) para relacionamentos e campos JSON
    if (filtros.motorista) {
        const termo = filtros.motorista.toLowerCase();
        resultados = resultados.filter(c => c.perfis?.nome_completo?.toLowerCase().includes(termo));
    }
    if (filtros.placa) {
        const termo = filtros.placa.toLowerCase();
        resultados = resultados.filter(c => c.placa_cavalo?.toLowerCase().includes(termo));
    }
    if (filtros.combustivel) {
        const termo = filtros.combustivel.toLowerCase();
        resultados = resultados.filter(c => {
            if (!c.itens_carga || !Array.isArray(c.itens_carga)) return false;
            return c.itens_carga.some(item => (item.combustivel || '').toLowerCase().includes(termo));
        });
    }

    if (resultados.length === 0) throw new Error("Nenhuma coleta encontrada com os filtros selecionados.");

    return { coletas: resultados, filtrosTexto: textoResumo };
};

// --- ORQUESTRADOR ---
window.iniciarExportacaoColetas = async function(formato) {
    document.getElementById('modal-selecao-formato-coletas').classList.remove('active');
    const btn = document.getElementById('btn-gerar-coletas');
    if(btn) { btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> GERANDO...`; btn.disabled = true; }

    try {
        const dados = await window.buscarDadosColetasRelatorio();
        if (formato === 'excel') await window.gerarRelatorioColetasExcel(dados);
        else await window.gerarRelatorioColetasPDF(dados);
    } catch (e) {
        console.error(e);
        window.mostrarToast(e.message, "warning");
    } finally {
        if(btn) { btn.innerHTML = '<i class="fas fa-file-alt"></i> GERAR RELATÓRIO'; btn.disabled = false; }
    }
};

// =============================================================================
// FUNÇÕES AUXILIARES DE FORMATAÇÃO
// =============================================================================
function formatarDataHoraRel(isoString) {
    if (!isoString) return '-';
    try {
        const d = new Date(isoString);
        return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute:'2-digit' });
    } catch(e) { return isoString; }
}

// Extrai a soma de um tipo específico de combustível
function extrairVolumePorTipo(itensCarga, tipoDesejado) {
    if (!itensCarga || !Array.isArray(itensCarga)) return 0;
    return itensCarga
        .filter(i => i.combustivel === tipoDesejado)
        .reduce((acc, curr) => acc + (parseFloat(curr.volume) || 0), 0);
}

// NOVA FUNÇÃO: Formata a lista de combustíveis com seus volumes (Para o PDF)
function formatarCombustiveisComVolumePDF(itensCarga) {
    if (!itensCarga || !Array.isArray(itensCarga) || itensCarga.length === 0) return '-';
    
    // Agrupa os volumes caso a mesma carreta tenha recebido do mesmo tipo
    const totais = {};
    itensCarga.forEach(i => {
        const tipo = i.combustivel || 'Desconhecido';
        totais[tipo] = (totais[tipo] || 0) + (parseFloat(i.volume) || 0);
    });

    // Retorna string com quebra de linha para a célula do PDF
    return Object.entries(totais)
        .map(([tipo, vol]) => `${tipo}: ${vol.toLocaleString('pt-BR')} L`)
        .join('\n');
}

/* =========================================================
                       GERADOR EXCEL (COLUNAS DINÂMICAS)
========================================================= */
window.gerarRelatorioColetasExcel = async function({ coletas, filtrosTexto }) {
    if (typeof ExcelJS === 'undefined') {
        const btn = document.getElementById('btn-gerar-coletas');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> BAIXANDO LIB...';
        await new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
            s.onload = resolve;
            document.head.appendChild(s);
        });
    }

    // --- 1. CÁLCULO PRÉVIO DE TOTAIS (Para definir colunas dinâmicas) ---
    let totalVolume = 0, totalS500 = 0, totalS10 = 0, totalGas = 0, totalEta = 0;
    coletas.forEach(c => {
        totalVolume += parseFloat(c.volume_litros || 0);
        totalS500 += extrairVolumePorTipo(c.itens_carga, 'Diesel S-500');
        totalS10 += extrairVolumePorTipo(c.itens_carga, 'Diesel S-10');
        totalGas += extrairVolumePorTipo(c.itens_carga, 'Gasolina');
        totalEta += extrairVolumePorTipo(c.itens_carga, 'Etanol');
    });

    const showS500 = totalS500 > 0;
    const showS10 = totalS10 > 0;
    const showGas = totalGas > 0;
    const showEta = totalEta > 0;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Coletas');
    
    sheet.views = [{ showGridLines: false }];
    sheet.pageSetup = { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1, fitToHeight: 0 };

    // --- 2. CONSTRUÇÃO DINÂMICA DE COLUNAS ---
    const excelCols = [{ width: 22 }]; // Coluna A (Logo) oculta na tabela, mas existe na sheet
    
    // Definição das colunas da tabela com seus metadados para formatação posterior
    const tableCols = [
        { name: 'Data Início', filterButton: true, align: 'center', width: 18 },
        { name: 'Motorista', filterButton: true, align: 'left', width: 30 },
        { name: 'Placa', filterButton: true, align: 'center', width: 12 },
        { name: 'Unidade', filterButton: true, align: 'left', width: 20 },
        { name: 'Base/Local', filterButton: true, align: 'left', width: 20, totalsRowLabel: 'TOTAIS:' }
    ];

    if (showS500) tableCols.push({ name: 'Diesel S-500', filterButton: true, totalsRowFunction: 'sum', align: 'center', numFmt: '#,##0', width: 14 });
    if (showS10) tableCols.push({ name: 'Diesel S-10', filterButton: true, totalsRowFunction: 'sum', align: 'center', numFmt: '#,##0', width: 14 });
    if (showGas) tableCols.push({ name: 'Gasolina', filterButton: true, totalsRowFunction: 'sum', align: 'center', numFmt: '#,##0', width: 14 });
    if (showEta) tableCols.push({ name: 'Etanol', filterButton: true, totalsRowFunction: 'sum', align: 'center', numFmt: '#,##0', width: 14 });

    tableCols.push(
        { name: 'Vol Total (L)', filterButton: true, totalsRowFunction: 'sum', align: 'center', numFmt: '#,##0', width: 16 },
        { name: '% Carga', filterButton: true, totalsRowFunction: 'average', align: 'center', numFmt: '0.00%', width: 12 },
        { name: 'Status', filterButton: true, align: 'center', width: 15 },
        { name: 'Entrega', filterButton: true, align: 'center', width: 18 }
    );

    tableCols.forEach(tc => excelCols.push({ width: tc.width }));
    sheet.columns = excelCols;

    // --- 3. CABEÇALHO E LOGO ---
    try {
        const response = await fetch('icons/Logo-TRR.png');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            const logoId = workbook.addImage({ buffer: buffer, extension: 'png' });
            sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 45 } });
        }
    } catch (e) {}

    // Merge Cells usa números (LinhaIni, ColIni, LinhaFim, ColFim) para ser dinâmico
    sheet.mergeCells(1, 2, 1, excelCols.length);
    const titleCell = sheet.getCell(1, 2);
    titleCell.value = "RELATÓRIO DE COLETAS E ABASTECIMENTO";
    titleCell.style = { font: { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } }, alignment: { vertical: 'middle', horizontal: 'center' } };

    sheet.mergeCells(2, 2, 2, excelCols.length);
    const subCell = sheet.getCell(2, 2);
    subCell.value = filtrosTexto;
    subCell.style = { font: { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } }, fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } }, alignment: { vertical: 'middle', horizontal: 'center' } };

    sheet.getRow(1).height = 40;
    sheet.getRow(2).height = 20;

    // Totais no Topo (Dinamico encostado na direita)
    const colTotalTexto = excelCols.length - 1;
    const colTotalValor = excelCols.length;
    
    const lblTotal = sheet.getCell(4, colTotalTexto);
    lblTotal.value = "Volume Total Geral (L):";
    lblTotal.font = { bold: true, color: { argb: 'FF003399' } };
    lblTotal.alignment = { horizontal: 'right', vertical: 'middle' };
    
    const valTotal = sheet.getCell(4, colTotalValor);
    valTotal.value = totalVolume;
    valTotal.numFmt = '#,##0';
    valTotal.font = { bold: true };
    valTotal.alignment = { horizontal: 'left', vertical: 'middle' };

    // --- 4. PREPARAÇÃO DOS DADOS ---
    const linhas = coletas.map(c => {
        let rowData = [
            '', // Logo
            formatarDataHoraRel(c.data_hora_inicio),
            c.perfis?.nome_completo || '-',
            c.placa_cavalo || '-',
            c.unidades?.nome || '-',
            c.base_carregamento || c.cidade_carregamento || '-'
        ];

        const vS500 = extrairVolumePorTipo(c.itens_carga, 'Diesel S-500');
        const vS10 = extrairVolumePorTipo(c.itens_carga, 'Diesel S-10');
        const vGas = extrairVolumePorTipo(c.itens_carga, 'Gasolina');
        const vEta = extrairVolumePorTipo(c.itens_carga, 'Etanol');

        if (showS500) rowData.push(vS500 > 0 ? vS500 : 0);
        if (showS10) rowData.push(vS10 > 0 ? vS10 : 0);
        if (showGas) rowData.push(vGas > 0 ? vGas : 0);
        if (showEta) rowData.push(vEta > 0 ? vEta : 0);

        rowData.push(
            parseFloat(c.volume_litros || 0),
            (parseFloat(c.percentual_carregamento || 0) / 100), 
            c.status ? c.status.toUpperCase() : '-',
            c.status === 'Entregue' ? formatarDataHoraRel(c.data_entrega) : '-'
        );
        return rowData;
    });

    // --- 5. CRIAÇÃO DA TABELA ---
    sheet.addTable({
        name: 'TabelaColetas',
        ref: 'B6',
        headerRow: true,
        totalsRow: true, 
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: tableCols,
        rows: linhas.map(r => r.slice(1)) // Remove a coluna vazia da logo
    });

    // --- 6. APLICAÇÃO DE FORMATAÇÃO BASEADA NO ARRAY DINÂMICO ---
    sheet.getRow(6).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    tableCols.forEach((tc, idx) => {
        const colIndex = idx + 2; // +1 porque array começa no 0, +1 porque pula a coluna A
        const col = sheet.getColumn(colIndex);
        col.alignment = { horizontal: tc.align, vertical: 'middle' };
        if (tc.numFmt) col.numFmt = tc.numFmt;
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_Coletas_${Date.now()}.xlsx`;
    link.click();
};

/* =========================================================
                       GERADOR PDF (COLUNAS DINÂMICAS)
========================================================= */
window.gerarRelatorioColetasPDF = async function({ coletas, filtrosTexto }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4'); // Retrato / Portrait
    const usuarioLogado = window.usuarioLogadoGlobal?.nome_completo || "Sistema";

    // --- 1. CÁLCULO PRÉVIO DE TOTAIS (Para ocultar colunas vazias) ---
    let totalVolume = 0, totalS500 = 0, totalS10 = 0, totalGas = 0, totalEta = 0;
    coletas.forEach(c => {
        totalVolume += parseFloat(c.volume_litros || 0);
        totalS500 += extrairVolumePorTipo(c.itens_carga, 'Diesel S-500');
        totalS10 += extrairVolumePorTipo(c.itens_carga, 'Diesel S-10');
        totalGas += extrairVolumePorTipo(c.itens_carga, 'Gasolina');
        totalEta += extrairVolumePorTipo(c.itens_carga, 'Etanol');
    });

    const showS500 = totalS500 > 0;
    const showS10 = totalS10 > 0;
    const showGas = totalGas > 0;
    const showEta = totalEta > 0;

    // --- 2. CABEÇALHO VISUAL ---
    doc.setFillColor(242, 242, 242).rect(0, 0, 60, 25, 'F'); 
    try { doc.addImage('icons/Logo-TRR.png', 'PNG', 10, 5, 40, 15); } catch(e) {}
    doc.setFillColor(0, 51, 153).rect(60, 0, 150, 25, 'F'); 
    doc.setTextColor(255).setFontSize(12).setFont(undefined, 'bold').text("RELATÓRIO DE COLETAS E ABASTECIMENTO", 65, 12);
    doc.setFontSize(7).setFont(undefined, 'normal').text(`Filtros: ${filtrosTexto}`, 65, 17);
    doc.setFontSize(6).setTextColor(220).text(`Gerado por: ${usuarioLogado} | ${new Date().toLocaleString('pt-BR')}`, 65, 22);

    // --- 3. CONSTRUÇÃO DO CORPO DA TABELA ---
    const rows = coletas.map(c => {
        const fVol = (v) => v > 0 ? v.toLocaleString('pt-BR') : '-';
        
        let rowData = [
            formatarDataHoraRel(c.data_hora_inicio),
            c.perfis?.nome_completo || '-',
            c.placa_cavalo || '-',
            c.unidades?.nome || '-',
            c.base_carregamento || c.cidade_carregamento || '-'
        ];

        if (showS500) rowData.push(fVol(extrairVolumePorTipo(c.itens_carga, 'Diesel S-500')));
        if (showS10) rowData.push(fVol(extrairVolumePorTipo(c.itens_carga, 'Diesel S-10')));
        if (showGas) rowData.push(fVol(extrairVolumePorTipo(c.itens_carga, 'Gasolina')));
        if (showEta) rowData.push(fVol(extrairVolumePorTipo(c.itens_carga, 'Etanol')));

        rowData.push(
            fVol(parseFloat(c.volume_litros || 0)),
            c.status ? c.status.toUpperCase() : '-',
            c.status === 'Entregue' ? formatarDataHoraRel(c.data_entrega) : '-'
        );
        return rowData;
    });

    // --- 4. CONSTRUÇÃO DOS CABEÇALHOS E ESTILOS DINÂMICOS ---
    const headRow = ['Início', 'Motorista', 'Placa', 'Unidade', 'Local'];
    if (showS500) headRow.push('S-500');
    if (showS10) headRow.push('S-10');
    if (showGas) headRow.push('Gasolina');
    if (showEta) headRow.push('Etanol');
    headRow.push('Vol. Tot', 'Status', 'Entrega');

    // Configuração base
    let colStyles = {
        0: { cellWidth: 15, halign: 'center' }, // Início
        1: { cellWidth: 'auto', overflow: 'linebreak' }, // Motorista (Estica livremente)
        2: { cellWidth: 12, halign: 'center', fontStyle: 'bold' }, // Placa
        3: { cellWidth: 'auto', overflow: 'linebreak' }, // Unidade (Estica)
        4: { cellWidth: 'auto', overflow: 'linebreak' }, // Local (Estica)
    };

    let cIdx = 5; // Índice que vai avançar dinamicamente
    if (showS500) { colStyles[cIdx++] = { cellWidth: 12, halign: 'right' }; }
    if (showS10) { colStyles[cIdx++] = { cellWidth: 12, halign: 'right' }; }
    if (showGas) { colStyles[cIdx++] = { cellWidth: 12, halign: 'right' }; }
    if (showEta) { colStyles[cIdx++] = { cellWidth: 12, halign: 'right' }; }

    colStyles[cIdx++] = { cellWidth: 14, halign: 'right', fontStyle: 'bold' }; // Total
    colStyles[cIdx++] = { cellWidth: 16, halign: 'center' }; // Status
    colStyles[cIdx++] = { cellWidth: 15, halign: 'center' }; // Entrega

    doc.autoTable({
        startY: 30,
        margin: { left: 8, right: 8 },
        head: [headRow],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 6, valign: 'middle', cellPadding: 1 }, 
        headStyles: { fillColor: [0, 51, 153], halign: 'center', fontSize: 6 },
        columnStyles: colStyles
    });

    const finalY = doc.lastAutoTable.finalY + 8;
    
    // --- 5. RESUMO ESTATÍSTICO NO FINAL ---
    doc.setFontSize(9).setFont(undefined, 'bold').setTextColor(0, 51, 153);
    doc.text("RESUMO DE VOLUMES (LITROS)", 10, finalY);
    
    doc.setFontSize(8).setTextColor(50).setFont(undefined, 'normal');
    let linhaY = finalY + 6;
    
    if(totalS500 > 0) { doc.text(`Diesel S-500: ${totalS500.toLocaleString('pt-BR')}`, 10, linhaY); linhaY += 5; }
    if(totalS10 > 0) { doc.text(`Diesel S-10: ${totalS10.toLocaleString('pt-BR')}`, 10, linhaY); linhaY += 5; }
    
    let linhaYDir = finalY + 6;
    if(totalGas > 0) { doc.text(`Gasolina: ${totalGas.toLocaleString('pt-BR')}`, 60, linhaYDir); linhaYDir += 5; }
    if(totalEta > 0) { doc.text(`Etanol: ${totalEta.toLocaleString('pt-BR')}`, 60, linhaYDir); linhaYDir += 5; }

    const maiorY = Math.max(linhaY, linhaYDir) + 3;

    doc.setFontSize(9).setFont(undefined, 'bold').setTextColor(0, 0, 0);
    doc.text(`Volume Total Movimentado: ${totalVolume.toLocaleString('pt-BR')}`, 10, maiorY);
    doc.text(`Total de Cargas: ${rows.length}`, 10, maiorY + 5);

    // Paginação
    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7).setTextColor(150).text(`Página ${i} de ${totalPages}`, 200, 288, { align: 'right' }); 
    }

    const url = URL.createObjectURL(doc.output('blob'));
    document.getElementById('iframe-pdf-coletas').src = url;
    document.getElementById('modal-preview-coletas').classList.add('active');
}; 