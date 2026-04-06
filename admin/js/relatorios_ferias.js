/* =========================================================
   RELATÓRIOS DE FÉRIAS - SMART D
========================================================= */

window.inicializarRelatoriosFerias = async function () {
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Relatórios de Férias';

    const selUnidadeRodape = document.getElementById('sel-unidade');
    if (selUnidadeRodape) {
        selUnidadeRodape.removeEventListener('change', window.recarregarFiltrosFeriasRel);
        selUnidadeRodape.addEventListener('change', window.recarregarFiltrosFeriasRel);
    }

    const container = document.getElementById('container-filtros-ferias-rel');
    if (container) {
        container.innerHTML = '';
        window.adicionarLinhaFiltroFeriasRel('competencia');
    }

    const btnGerar = document.getElementById('btn-gerar-ferias');
    if (btnGerar) {
        btnGerar.onclick = () => document.getElementById('modal-formato-ferias').classList.add('active');
    }
};

window.recarregarFiltrosFeriasRel = function() {
    document.querySelectorAll('.filter-row').forEach(row => {
        const selTipo = row.querySelector('.filter-select');
        if (selTipo && selTipo.value === 'colaborador') {
            const id = row.id.replace('row-fer-rel-', '');
            window.configurarInputFeriasRel(selTipo, id);
        }
    });
};

window.adicionarLinhaFiltroFeriasRel = function (tipoPadrao = "") {
    const container = document.getElementById('container-filtros-ferias-rel');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `row-fer-rel-${id}`;
    div.style = "display:flex; gap:10px; align-items:center;";

    // AJUSTE: Alterado de 'flex: 1' para 'flex: 0 0 40%' para reduzir a largura em 60%
    div.innerHTML = `
        <select class="filter-select form-control" style="width:180px" onchange="window.configurarInputFeriasRel(this, '${id}')">
            <option value="" disabled ${!tipoPadrao ? 'selected' : ''}>Filtrar por...</option>
            <option value="competencia" ${tipoPadrao === 'competencia' ? 'selected' : ''}>Mês Início</option>
            <option value="colaborador">Colaborador</option>
            <option value="status">Status</option>
        </select>
        <div id="wrapper-val-fer-rel-${id}" style="display:flex; gap:10px; flex: 0 0 40%;"> 
            <input type="text" class="form-control" disabled placeholder="Selecione um filtro..." style="width: 100%;">
        </div>
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:#dc3545; cursor:pointer; padding: 5px;"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(div);
    if (tipoPadrao) window.configurarInputFeriasRel(div.querySelector('select'), id);
};

window.configurarInputFeriasRel = async function (sel, id) {
    const tipo = sel.value;
    const wrapper = document.getElementById(`wrapper-val-fer-rel-${id}`);
    if (!wrapper) return;
    wrapper.innerHTML = '';
    const unidadeMestre = document.getElementById('sel-unidade')?.value || "TODAS";

    if (tipo === 'competencia') {
        const agora = new Date();
        const mesFmt = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
        wrapper.innerHTML = `<input type="month" class="form-control" id="val-fer-rel-${id}" data-tipo="competencia" value="${mesFmt}">`;
    } 
    else if (tipo === 'status') {
        wrapper.innerHTML = `
            <select class="form-control" id="val-fer-rel-${id}" data-tipo="status">
                <option value="">Todos os Status</option>
                <option value="pendente">Pendente</option>
                <option value="aprovado">Aprovado</option>
                <option value="processado">Processado</option>
                <option value="rejeitado">Rejeitado</option>
            </select>`;
    }
    else if (tipo === 'colaborador') {
        const s = document.createElement('select');
        s.className = "form-control";
        s.id = `val-fer-rel-${id}`;
        s.dataset.tipo = "colaborador";
        s.innerHTML = '<option value="">Todos os Colaboradores</option>';
        wrapper.appendChild(s);
        
        let query = clienteSupabase.from('perfis').select('id, nome_completo').eq('ativo', true);
        if (unidadeMestre !== 'TODAS') query = query.eq('unidade_id', unidadeMestre);

        const { data } = await query.order('nome_completo');
        if (data) data.forEach(p => s.innerHTML += `<option value="${p.id}">${p.nome_completo}</option>`);
    }
};

window.buscarDadosFeriasRel = async function() {
    let competencia = "";
    let colaboradorId = null;
    let statusFiltro = null;
    let filtrosTexto = [];

    document.querySelectorAll('[id^="val-fer-rel-"]').forEach(el => {
        if (el.dataset.tipo === "competencia" && el.value) {
            competencia = el.value;
            const [y, m] = el.value.split('-');
            filtrosTexto.push(`Início em: ${m}/${y}`);
        }
        if (el.dataset.tipo === "colaborador" && el.value) {
            colaboradorId = el.value;
            filtrosTexto.push(`Colaborador: ${el.options[el.selectedIndex].text}`);
        }
        if (el.dataset.tipo === "status" && el.value) {
            statusFiltro = el.value;
            filtrosTexto.push(`Status: ${el.options[el.selectedIndex].text}`);
        }
    });

    const unidadeMestre = document.getElementById('sel-unidade')?.value || "TODAS";
    const selUnidadeTexto = document.getElementById('sel-unidade')?.options[document.getElementById('sel-unidade').selectedIndex]?.text || 'Todas';
    filtrosTexto.push(`Unidade: ${selUnidadeTexto}`);

    let query = clienteSupabase.from('solicitacoes_ferias').select(`
        *,
        colaborador:perfis!colaborador_id(nome_completo, email, matricula),
        unidades(nome)
    `);

    if (unidadeMestre !== 'TODAS') query = query.eq('unidade_id', unidadeMestre);
    if (colaboradorId) query = query.eq('colaborador_id', colaboradorId);
    if (statusFiltro) query = query.eq('status', statusFiltro);

    if (competencia) {
        const [ano, mes] = competencia.split('-').map(Number);
        const ultimoDia = new Date(ano, mes, 0).getDate(); 
        query = query.gte('data_inicio', `${competencia}-01`).lte('data_inicio', `${competencia}-${String(ultimoDia).padStart(2, '0')}`);
    }

    const { data, error } = await query.order('data_inicio', { ascending: true });
    if (error) throw error;

    const unidadesMap = {};
    (data || []).forEach(f => {
        const uNome = f.unidades?.nome || "OUTROS";
        if (!unidadesMap[uNome]) unidadesMap[uNome] = [];
        unidadesMap[uNome].push(f);
    });

    return { unidadesMap, filtrosTexto };
};

window.iniciarExportacaoFerias = async function(formato) {
    document.getElementById('modal-formato-ferias').classList.remove('active');
    const btn = document.getElementById('btn-gerar-ferias');
    const original = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> GERANDO...`;
    btn.disabled = true;

    try {
        const dados = await window.buscarDadosFeriasRel();
        if (formato === 'pdf') await window.gerarRelatorioFeriasPDF(dados);
        else await window.gerarRelatorioFeriasExcel(dados);
    } catch (e) {
        window.mostrarToast("Erro: " + e.message, "error");
    } finally {
        btn.innerHTML = original;
        btn.disabled = false;
    }
};

window.gerarRelatorioFeriasPDF = async function({ unidadesMap, filtrosTexto }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const usuarioLogado = window.usuarioLogadoGlobal?.nome_completo || "Administrador";
    const dataGeracao = new Date().toLocaleString('pt-BR');

    const unidades = Object.keys(unidadesMap).sort();
    if (unidades.length === 0) {
        window.mostrarToast("Nenhum dado encontrado.", "warning");
        return;
    }

    unidades.forEach((uNome, index) => {
        if (index > 0) doc.addPage();
        
        // Cabeçalho (Padrão esquerda)
        doc.setFillColor(242, 242, 242).rect(0, 0, 60, 25, 'F');
        doc.setFillColor(0, 51, 153).rect(60, 0, 150, 25, 'F');
        try { doc.addImage('icons/Logo-TRR.png', 'PNG', 10, 5, 40, 15); } catch(e) {}

        doc.setTextColor(255).setFontSize(14).setFont(undefined, 'bold').text("RELATÓRIO DE SOLICITAÇÕES DE FÉRIAS", 65, 12);
        doc.setFontSize(8).setFont(undefined, 'normal').text(`Filtros: ${filtrosTexto.join(' | ')}`, 65, 18);
        doc.setFontSize(7).setTextColor(220).text(`Gerado por: ${usuarioLogado} | ${dataGeracao}`, 65, 22);

        doc.setTextColor(0, 51, 153).setFontSize(10).setFont(undefined, 'bold').text(`UNIDADE: ${uNome.toUpperCase()}`, 14, 35);

        const rows = unidadesMap[uNome].map(f => [
            f.colaborador?.nome_completo || '?',
            f.colaborador?.matricula || '-',
            f.data_inicio.split('-').reverse().join('/'),
            f.dias_qtd,
            f.data_fim ? f.data_fim.split('-').reverse().join('/') : '-',
            (f.status || 'Pendente').toUpperCase()
        ]);

        doc.autoTable({
            startY: 40,
            head: [['Colaborador', 'Matrícula', 'Início', 'Dias', 'Fim', 'Status']],
            body: rows,
            theme: 'grid',
            headStyles: { fillColor: [0, 51, 153], halign: 'center' },
            styles: { fontSize: 8, valign: 'middle' },
            columnStyles: { 
                1: { halign: 'center', cellWidth: 25 }, // Matrícula
                2: { halign: 'center', cellWidth: 25 }, // Início
                3: { halign: 'center', cellWidth: 15 }, // Dias
                4: { halign: 'center', cellWidth: 25 }, // Fim
                5: { halign: 'center', cellWidth: 25 }  // Status
            }
        });
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150).text(`Página ${i} de ${totalPages}`, 180, 288);
    }

    const url = URL.createObjectURL(doc.output('blob'));
    document.getElementById('iframe-ferias-pdf').src = url;
    document.getElementById('modal-preview-ferias').classList.add('active');
};

window.gerarRelatorioFeriasExcel = async function({ unidadesMap, filtrosTexto }) {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Férias');
    
    // 1. Definição das Colunas (Sem CPF)
    sheet.columns = [
        { key: 'unidade', width: 25 },
        { key: 'nome', width: 40 },
        { key: 'id', width: 15 },
        { key: 'inicio', width: 15 },
        { key: 'dias', width: 10 },
        { key: 'fim', width: 15 },
        { key: 'status', width: 15 }
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

    // 2. Cabeçalho Corporativo (Padrão Premiação)
    // Linha 1: Título Azul (Mescla B1 até G1 - última coluna)
    sheet.mergeCells('B1:G1');
    const titleCell = sheet.getCell('B1');
    titleCell.value = "RELATÓRIO DE SOLICITAÇÕES DE FÉRIAS";
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(1).height = 35;

    // Linha 2: Filtros
    sheet.mergeCells('B2:G2');
    const filterCell = sheet.getCell('B2');
    filterCell.value = `Filtros: ${filtrosTexto.join(' | ')}`;
    filterCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
    filterCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    filterCell.alignment = { vertical: 'middle', horizontal: 'center' };
    sheet.getRow(2).height = 20;

    // Linha 3: Auditoria
    sheet.mergeCells('A3:G3');
    const metaCell = sheet.getCell('A3');
    const usuarioLogado = window.usuarioLogadoGlobal?.nome_completo || "Administrador";
    metaCell.value = `Gerado por: ${usuarioLogado} | ${new Date().toLocaleString('pt-BR')}`;
    metaCell.font = { name: 'Arial', size: 8, color: { argb: 'FF555555' } };
    metaCell.alignment = { horizontal: 'right' };

    // Linha 5: Cabeçalho da Tabela
    const headerRow = sheet.getRow(5);
    headerRow.values = ['Unidade', 'Colaborador', 'Matrícula', 'Início', 'Dias', 'Fim', 'Status'];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    headerRow.alignment = { horizontal: 'center', vertical: 'middle' };
    headerRow.height = 20;

    // 3. Inserção dos Dados
    const rows = [];
    Object.keys(unidadesMap).sort().forEach(uNome => {
        unidadesMap[uNome].forEach(f => {
            rows.push([
                uNome,
                f.colaborador?.nome_completo,
                f.colaborador?.matricula || '-',
                f.data_inicio.split('-').reverse().join('/'),
                f.dias_qtd,
                f.data_fim ? f.data_fim.split('-').reverse().join('/') : '-',
                (f.status || 'Pendente').toUpperCase()
            ]);
        });
    });

    sheet.addRows(rows);

    // 4. Estilização Final
    sheet.eachRow((row, rowNumber) => {
        if (rowNumber >= 5) {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' }
                };
                if (rowNumber > 5 && cell.col > 2) cell.alignment = { horizontal: 'center' };
            });
        }
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Relatorio_Ferias_${Date.now()}.xlsx`;
    link.click();
};

window.fecharPreviewFerias = function() {
    document.getElementById('modal-preview-ferias').classList.remove('active');
    document.getElementById('iframe-ferias-pdf').src = "";
};