/* =========================================================
                  RELATÓRIOS DE VEÍCULOS 
========================================================= */

window.inicializarRelatoriosVeiculos = async function () {
    const titulo = document.getElementById('titulo-pagina');
    if(titulo) titulo.innerText = 'Relatórios de Veículos';
    
    const container = document.getElementById('container-filtros-veiculos');
    if (container) container.innerHTML = ''; // Limpa e deixa vazio inicialmente

    // Reconfigura o botão para evitar múltiplos eventos
    const btnGerar = document.getElementById('btn-gerar-veiculos');
    if (btnGerar) {
        const newBtn = btnGerar.cloneNode(true);
        btnGerar.parentNode.replaceChild(newBtn, btnGerar);
        
        newBtn.onclick = function() {
            document.getElementById('modal-selecao-formato-veiculos').classList.add('active');
        };
    }
};

// --- GESTÃO DE FILTROS ---
window.adicionarLinhaFiltroVeiculos = function (tipoPadrao = "") {
    const container = document.getElementById('container-filtros-veiculos');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `row-veic-${id}`;
    div.style = "display:flex; gap:10px; align-items:center; margin-bottom:8px;";

    div.innerHTML = `
        <select class="filter-select" style="width:200px" onchange="window.configurarInputRelVeiculos(this, '${id}')">
            <option value="" disabled ${!tipoPadrao ? 'selected' : ''}>Filtrar por...</option>
            <option value="tipo">Tipo de Veículo</option>
            <option value="capacidade">Capacidade</option>
            <option value="status">Status</option>
        </select>
        <div id="wrapper-val-veic-${id}" style="display:flex; gap:10px; flex:0 1 450px;">
            <input type="text" class="form-control" disabled placeholder="Selecione um filtro...">
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#ff4444;cursor:pointer">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
    if (tipoPadrao) window.configurarInputRelVeiculos(div.querySelector('select'), id);
};

window.configurarInputRelVeiculos = function (sel, id) {
    const tipo = sel.value;
    const wrapper = document.getElementById(`wrapper-val-veic-${id}`);
    if(!wrapper) return;
    wrapper.innerHTML = '';

    if (tipo === 'status') {
        wrapper.innerHTML = `
            <select class="form-control" id="val-veic-${id}">
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
            </select>`;
    } else if (tipo === 'tipo') {
        wrapper.innerHTML = `
            <select class="form-control" id="val-veic-${id}">
                <option value="Automóvel">Automóvel</option>
                <option value="Caminhão">Caminhão</option>
                <option value="Cavalo">Cavalo</option>
                <option value="Carreta">Carreta</option>
            </select>`;
    } else if (tipo === 'capacidade') {
        wrapper.innerHTML = `<input type="number" class="form-control" id="val-veic-${id}" placeholder="Ex: 45000">`;
    }
};

window.capturarFiltrosVeiculos = function() {
    let obj = { resumo: [], tipo: null, capacidade: null, status: null };
    
    document.querySelectorAll('#container-filtros-veiculos .filter-row').forEach(row => {
        const selTipo = row.querySelector('.filter-select');
        const tipo = selTipo?.value;
        const el = row.querySelector(`#val-veic-${row.id.split('-')[2]}`); 
        
        if (el?.value) {
            obj[tipo] = el.value;
            const label = el.tagName === 'SELECT' ? el.options[el.selectedIndex].text : el.value;
            obj.resumo.push(`${selTipo.options[selTipo.selectedIndex].text}: ${label}`);
        }
    });
    
    return obj;
};

// --- BUSCA DE DADOS ---
window.buscarDadosVeiculosRelatorio = async function() {
    const filtros = window.capturarFiltrosVeiculos();
    const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
    const nomeUnidade = document.getElementById('sel-unidade')?.options[document.getElementById('sel-unidade').selectedIndex]?.text || "Todas";

    let textoResumo = filtros.resumo.join(' | ');
    if (textoResumo) textoResumo += ` | Unidade: ${nomeUnidade}`;
    else textoResumo = `Unidade: ${nomeUnidade}`;

    let query = clienteSupabase.from('veiculos')
        .select(`*, unidades(nome)`) // capacidade_tanque já vem aqui
        .order('placa');

    if (unidadeId !== 'TODAS') {
        query = query.eq('unidade_id', unidadeId);
    }

    if (filtros.tipo) query = query.eq('tipo_veiculo', filtros.tipo);
    if (filtros.status) query = query.eq('ativo', filtros.status === 'true');
    // Filtro aproximado ou exato para capacidade
    if (filtros.capacidade) query = query.gte('capacidade_tanque', parseFloat(filtros.capacidade));

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Nenhum veículo encontrado com os filtros selecionados.");

    return { veiculos: data, filtrosTexto: textoResumo };
};

// --- ORQUESTRADOR ---
window.iniciarExportacaoVeiculos = async function(formato) {
    document.getElementById('modal-selecao-formato-veiculos').classList.remove('active');
    const btn = document.getElementById('btn-gerar-veiculos');
    if(btn) { btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> GERANDO...`; btn.disabled = true; }

    try {
        const dados = await window.buscarDadosVeiculosRelatorio();
        if (formato === 'excel') await window.gerarRelatorioVeiculosExcel(dados);
        else await window.gerarRelatorioVeiculosPDF(dados);
    } catch (e) {
        console.error(e);
        window.mostrarToast(e.message, "warning");
    } finally {
        if(btn) { btn.innerHTML = '<i class="fas fa-file-alt"></i> GERAR RELATÓRIO'; btn.disabled = false; }
    }
};

/* =========================================================
                       GERADOR EXCEL 
========================================================= */
window.gerarRelatorioVeiculosExcel = async function({ veiculos, filtrosTexto }) {
    if (typeof ExcelJS === 'undefined') {
        const btn = document.getElementById('btn-gerar-veiculos');
        if(btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> BAIXANDO LIB...';
        await new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
            s.onload = resolve;
            document.head.appendChild(s);
        });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Veículos');
    sheet.views = [{ showGridLines: false }];

    // --- 1. CONFIGURAÇÃO DE COLUNAS ---
    // Coluna J (AnoInt) é oculta e essencial para a fórmula da média funcionar
    sheet.columns = [
        { width: 22 }, // A: Logo
        { width: 12 }, // B: Placa
        { width: 25 }, // C: Marca
        { width: 25 }, // D: Modelo / Rótulo Média
        { width: 15 }, // E: Ano / Valor Média
        { width: 20 }, // F: Tipo
        { width: 18 }, // G: Capacidade
        { width: 25 }, // H: Unidade
        { width: 12 }, // I: Status
        { width: 0, hidden: true }, // J: Ano Inteiro (Oculto - Base do cálculo)
    ];

    // Logo
    try {
        const response = await fetch('icons/Logo-TRR.png');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            const logoId = workbook.addImage({ buffer: buffer, extension: 'png' });
            sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 45 } });
        }
    } catch (e) {}

    // --- 2. CABEÇALHO ---
    sheet.mergeCells('B1:I1');
    const titleCell = sheet.getCell('B1');
    titleCell.value = "RELATÓRIO DE VEÍCULOS";
    titleCell.style = {
        font: { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } },
        alignment: { vertical: 'middle', horizontal: 'center' }
    };

    sheet.mergeCells('B2:I2');
    const subCell = sheet.getCell('B2');
    subCell.value = filtrosTexto || "Filtros: Geral";
    subCell.style = {
        font: { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } },
        fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } },
        alignment: { vertical: 'middle', horizontal: 'center' }
    };

    sheet.getRow(1).height = 40;
    sheet.getRow(2).height = 20;

    // --- 3. ESTATÍSTICA (SOMENTE IDADE MÉDIA) ---
    
    // Rótulo (D4)
    const lblMedia = sheet.getCell('D4');
    lblMedia.value = "Idade Média:";
    lblMedia.font = { bold: true, color: { argb: 'FF003399' } };
    lblMedia.alignment = { horizontal: 'right', vertical: 'middle' };
    lblMedia.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    lblMedia.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };

    // Valor / Equação (E4) - DINÂMICO
    const valMedia = sheet.getCell('E4');
    // Fórmula: Ano Atual - Média da Coluna Oculta J (filtrada)
    // SUBTOTAL(101) = AVERAGE ignorando linhas ocultas pelo filtro
    valMedia.value = { formula: '=ROUND(YEAR(TODAY()) - SUBTOTAL(101, TabelaVeiculos[AnoInt]), 1)' };
    valMedia.numFmt = '0.0 "anos"'; 
    valMedia.font = { bold: true, color: { argb: 'FF333333' } };
    valMedia.alignment = { horizontal: 'left', vertical: 'middle' };
    valMedia.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF0F0F0' } };
    valMedia.border = { bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } } };

    // --- 4. PREPARAÇÃO DOS DADOS ---
    const linhas = veiculos.map(v => {
        // Tratamento Ano (Extrai 4 dígitos para a coluna oculta)
        let anoInt = 0;
        if (v.ano_fab_mod && v.ano_fab_mod.length >= 4) {
            anoInt = parseInt(v.ano_fab_mod.substring(0, 4)) || 0;
        }

        // Tratamento Capacidade (Visual)
        let cap = parseFloat(v.capacidade_tanque || 0);
        if (cap === 0 && v.compartimentos_json) {
            try {
                const comps = typeof v.compartimentos_json === 'string' ? JSON.parse(v.compartimentos_json) : v.compartimentos_json;
                if (Array.isArray(comps)) cap = comps.reduce((acc, val) => acc + parseFloat(val || 0), 0);
            } catch (e) {}
        }

        return [
            '', // A: Logo
            v.placa,
            v.marca,
            v.modelo,
            v.ano_fab_mod || '-',
            v.tipo_veiculo ? v.tipo_veiculo.toUpperCase() : '-',
            cap > 0 ? cap : 0, // G: Valor Numérico
            v.unidades?.nome || '-',
            v.ativo ? 'ATIVO' : 'INATIVO',
            anoInt > 0 ? anoInt : null // J: Coluna Oculta (AnoInt) usada na fórmula
        ];
    });

    // --- 5. TABELA EXCEL ---
    const table = sheet.addTable({
        name: 'TabelaVeiculos',
        ref: 'B6',
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: [
            { name: 'Placa', filterButton: true },
            { name: 'Marca', filterButton: true },
            { name: 'Modelo', filterButton: true },
            { name: 'Ano', filterButton: true },
            { name: 'Tipo', filterButton: true },
            { name: 'Capacidade', filterButton: true },
            { name: 'Unidade', filterButton: true },
            { name: 'Status', filterButton: true },
            { name: 'AnoInt', filterButton: false } // Coluna Oculta J
        ],
        rows: linhas.map(r => r.slice(1))
    });

    // --- 6. FORMATAÇÃO FINAL ---
    sheet.getRow(6).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    // Alinhamentos
    ['B','E','H','I'].forEach(col => sheet.getColumn(col).alignment = { horizontal: 'center', vertical: 'middle' }); 
    ['C','D','F'].forEach(col => sheet.getColumn(col).alignment = { horizontal: 'left', vertical: 'middle' });
    
    // Formatação da Coluna de Capacidade (G)
    sheet.getColumn('G').numFmt = '#,##0 "L"';
    sheet.getColumn('G').alignment = { horizontal: 'center', vertical: 'middle' };

    // Download
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_Veiculos_${Date.now()}.xlsx`;
    link.click();
    
    const btn = document.getElementById('btn-gerar-veiculos');
    if(btn) btn.innerHTML = '<i class="fas fa-file-alt"></i> GERAR RELATÓRIO';
};

/* =========================================================
                        GERADOR PDF
========================================================= */
window.gerarRelatorioVeiculosPDF = async function({ veiculos, filtrosTexto }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const usuarioLogado = window.usuarioLogadoGlobal?.nome_completo || "Sistema";

    doc.setFillColor(242, 242, 242).rect(0, 0, 60, 25, 'F'); 
    try { doc.addImage('icons/Logo-TRR.png', 'PNG', 10, 5, 40, 15); } catch(e) {}
    doc.setFillColor(0, 51, 153).rect(60, 0, 150, 25, 'F');
    doc.setTextColor(255).setFontSize(14).setFont(undefined, 'bold').text("RELATÓRIO DE VEÍCULOS", 65, 12);
    doc.setFontSize(8).setFont(undefined, 'normal').text(`Filtros: ${filtrosTexto}`, 65, 17);
    doc.setFontSize(7).setTextColor(220).text(`Gerado por: ${usuarioLogado} | ${new Date().toLocaleString('pt-BR')}`, 65, 22);

    const rows = veiculos.map(v => [
        v.placa,
        v.marca,
        v.modelo,
        v.ano_fab_mod || '-',
        v.tipo_veiculo,
        v.capacidade_tanque ? parseFloat(v.capacidade_tanque).toLocaleString('pt-BR') : '-', // [CORREÇÃO] Mostra valor
        v.unidades?.nome || '-',
        v.ativo ? 'ATIVO' : 'INATIVO'
    ]);

    doc.autoTable({
        startY: 35,
        head: [['Placa', 'Marca', 'Modelo', 'Ano', 'Tipo', 'Cap.', 'Unidade', 'Status']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 8, valign: 'middle' },
        headStyles: { fillColor: [0, 51, 153], halign: 'center' },
        
        // [CORREÇÃO] Ajuste de larguras para evitar quebras
        columnStyles: {
            0: { cellWidth: 18, halign: 'center', fontStyle: 'bold' }, // Placa
            1: { cellWidth: 25 }, // Marca (Aumentada)
            2: { cellWidth: 35 }, // Modelo
            3: { cellWidth: 15, halign: 'center', overflow: 'hidden' }, // Ano (Aumentado p/ não quebrar)
            4: { cellWidth: 22 }, // Tipo
            5: { cellWidth: 15, halign: 'center' }, // Cap (Centralizado)
            6: { cellWidth: 20, halign: 'center' }, // Unidade
            7: { cellWidth: 15, halign: 'center' }  // Status
        }
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7).setTextColor(150).text(`Página ${i} de ${totalPages}`, 185, 288);
    }

    doc.setFontSize(9).setFont(undefined, 'bold').setTextColor(0, 51, 153);
    doc.text(`Total de Veículos: ${rows.length}`, 14, doc.lastAutoTable.finalY + 10);

    const url = URL.createObjectURL(doc.output('blob'));
    document.getElementById('iframe-pdf-veiculos').src = url;
    document.getElementById('modal-preview-veiculos').classList.add('active');
};