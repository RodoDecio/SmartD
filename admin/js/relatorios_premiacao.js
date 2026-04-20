/* =========================================================
   MOTOR DE RELATÓRIOS DE PREMIAÇÃO - VERSÃO INTEGRAL
========================================================= */

window.inicializarRelatoriosPremiacao = async function () {
    const titulo = document.getElementById('titulo-pagina');
    if(titulo) titulo.innerText = 'Relatórios de Premiação';
    
    const container = document.getElementById('container-filtros-rel-premiacao');
    if (container) {
        container.innerHTML = '';
        window.adicionarFiltroRelatorioPremiacao('competencia');
    }

    const selectRodape = document.getElementById('sel-unidade');
    if (selectRodape) {
        selectRodape.removeEventListener('change', window.atualizarFiltrosPremiacaoPorUnidade);
        selectRodape.addEventListener('change', window.atualizarFiltrosPremiacaoPorUnidade);
    }

    // Configura o botão para abrir o modal de seleção
    const btnGerar = document.getElementById('btn-gerar-rel-premiacao');
    if (btnGerar) {
        btnGerar.onclick = function() {
            document.getElementById('modal-selecao-formato-prem').classList.add('active');
        };
    }
};

window.atualizarFiltrosPremiacaoPorUnidade = function() {
    document.querySelectorAll('#container-filtros-rel-premiacao .filter-row').forEach(row => {
        const selTipo = row.querySelector('.filter-select');
        if (selTipo && selTipo.value === 'motorista') {
            const id = row.id.replace('row-prem-', '');
            window.configurarInputRelPremiacao(selTipo, id);
        }
    });
};

window.adicionarFiltroRelatorioPremiacao = function (tipoPadrao = "") {
    const container = document.getElementById('container-filtros-rel-premiacao');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `row-prem-${id}`;
    div.style = "display:flex; gap:10px; align-items:center; margin-bottom:8px;";

    div.innerHTML = `
        <select class="filter-select" style="width:200px" onchange="window.configurarInputRelPremiacao(this, '${id}')">
            <option value="" disabled ${!tipoPadrao ? 'selected' : ''}>Filtrar por...</option>
            <option value="competencia" ${tipoPadrao === 'competencia' ? 'selected' : ''}>Competência (Mês/Ano)</option>
            <option value="motorista">Motorista</option>
            <option value="status">Status da Apuração</option> 
            <option value="status_motorista">Status do Colaborador</option> 
        </select>
        <div id="wrapper-prem-${id}" style="display:flex; gap:10px; flex:0 1 450px;"></div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#ff4444;cursor:pointer"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
    if (tipoPadrao) window.configurarInputRelPremiacao(div.querySelector('select'), id);
};

window.configurarInputRelPremiacao = async function (sel, id) {
    const tipo = sel.value;
    const wrapper = document.getElementById(`wrapper-prem-${id}`);
    if(!wrapper) return;
    wrapper.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";

    if (tipo === 'competencia') {
        wrapper.innerHTML = `<input type="month" class="form-control" id="val-prem-${id}" style="max-width: 160px;">`;
    } 
    else if (tipo === 'status') {
        wrapper.innerHTML = `
            <select class="form-control" id="val-prem-${id}">
                <option value="Aberto">Aberto</option>
                <option value="Fechado">Fechado</option>
            </select>
        `;
    } 
    else if (tipo === 'status_motorista') { // NOVO BLOCO
        wrapper.innerHTML = `
            <select class="form-control" id="val-prem-${id}">
                <option value="">Todos (Ativos e Inativos)</option>
                <option value="true">Somente Ativos</option>
                <option value="false">Somente Inativos</option>
            </select>
        `;
    }
    else if (tipo === 'motorista') {
        const s = document.createElement('select');
        s.className = "form-control";
        s.id = `val-prem-${id}`;
        
        // [CORREÇÃO]: Removemos o .eq('ativo', true) para trazer o histórico completo
        let query = clienteSupabase.from('perfis').select('id, nome_completo').eq('funcao', 'motorista');
        
        if(unidadeId !== 'TODAS') query = query.eq('unidade_id', unidadeId);
        
        const { data } = await query.order('nome_completo');
        s.innerHTML = '<option value="">Todos os Motoristas</option>';
        data?.forEach(m => s.innerHTML += `<option value="${m.id}">${m.nome_completo}</option>`);
        
        wrapper.innerHTML = '';
        wrapper.appendChild(s);
    }
};

/* =========================================================
   1. BUSCA DE DADOS CENTRALIZADA
========================================================= */
window.buscarDadosPremiacao = async function() {
    const filtros = window.capturarFiltrosRelPremiacao();
    const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
    const nomeUnidadeFiltro = document.getElementById('sel-unidade')?.options[document.getElementById('sel-unidade').selectedIndex]?.text || "Todas";

    filtros.resumo += ` | Unidade: ${nomeUnidadeFiltro}`;

    // LÓGICA DO INNER JOIN: Necessário para filtrar dados da tabela referenciada
    let joinMotorista = 'motorista:motorista_id';
    if (filtros.status_motorista) {
        joinMotorista = 'motorista:motorista_id!inner';
    }

    let query = clienteSupabase.from('premiacoes_apuracoes').select(`
        *,
        ${joinMotorista} (nome_completo, email, matricula, ativo),
        unidade:unidade_id (nome),
        politica:premiacao_id (valor_maximo),
        itens:premiacoes_apuracoes_itens(*, config:item_config_id(topico, peso))
    `);

    if (filtros.motorista) query = query.eq('motorista_id', filtros.motorista);
    if (filtros.status) query = query.eq('status', filtros.status);
    if (filtros.competencia) query = query.eq('competencia', `${filtros.competencia}-01`);
    
    if (unidadeId !== 'TODAS') {
        query = query.eq('unidade_id', unidadeId);
    }
    
    // APLICA O NOVO FILTRO DE ATIVO/INATIVO
    if (filtros.status_motorista) {
        const isAtivo = filtros.status_motorista === 'true';
        query = query.eq('motorista.ativo', isAtivo);
    }

    const { data: lancamentos, error } = await query;
    if (error) throw error;
    if (!lancamentos || !lancamentos.length) throw new Error("Nenhuma apuração encontrada para os filtros selecionados.");

    return { lancamentos, filtrosTexto: filtros.resumo };
};

/* =========================================================
   2. ORQUESTRADOR DE EXPORTAÇÃO
========================================================= */
window.iniciarExportacaoPremiacao = async function(formato) {
    document.getElementById('modal-selecao-formato-prem').classList.remove('active');
    
    const btn = document.getElementById('btn-gerar-rel-premiacao');
    if (btn) {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> GERANDO ${formato.toUpperCase()}...`;
        btn.disabled = true;
    }

    try {
        // Busca dados uma única vez
        const dados = await window.buscarDadosPremiacao();

        if (formato === 'pdf') {
            await window.gerarRelatorioPremiacaoPDF(dados);
        } else if (formato === 'excel') {
            await window.gerarRelatorioPremiacaoExcel(dados);
        }

    } catch (e) {
        console.error(e);
        window.mostrarToast(e.message, "warning");
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-file-alt"></i> GERAR RELATÓRIO';
            btn.disabled = false;
        }
    }
};


/* =========================================================
   3. GERADOR DE EXCEL (NOVO)
========================================================= */
window.gerarRelatorioPremiacaoExcel = async function({ lancamentos, filtrosTexto }) {
    if (typeof ExcelJS === 'undefined') {
        const btn = document.getElementById('btn-gerar-rel-premiacao');
        if(btn) btn.innerHTML = '<i class="fas fa-download"></i> BAIXANDO LIB...';
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Erro ExcelJS.'));
            document.head.appendChild(script);
        });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Premiação');
    sheet.views = [{ showGridLines: false }];

    // [ALTERAÇÃO]: Configuração de Colunas (Inserida Coluna ID)
    sheet.getColumn('A').width = 22; 
    sheet.getColumn('B').width = 15; 
    sheet.getColumn('C').width = 10; // ID
    sheet.getColumn('D').width = 40; 
    sheet.getColumn('E').width = 18; 
    sheet.getColumn('F').width = 15; 
    sheet.getColumn('G').width = 22; 

    try {
        const response = await fetch('icons/Logo-TRR.png');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            const logoId = workbook.addImage({ buffer: buffer, extension: 'png' });
            sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 45 } });
        }
    } catch (e) {}

    // Cabeçalho (Mescla até G)
    sheet.mergeCells('B1:G1'); 
    const titleCell = sheet.getCell('B1');
    titleCell.value = "RELATÓRIO DE PREMIAÇÕES"; 
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.mergeCells('B2:G2');
    const subTitleCell = sheet.getCell('B2');
    subTitleCell.value = filtrosTexto;
    subTitleCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
    subTitleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    subTitleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.getRow(1).height = 40;
    sheet.getRow(2).height = 20;

    // Subtotal
    const labelTotal = sheet.getCell('F4');
    labelTotal.value = "TOTAL GERAL:";
    labelTotal.font = { bold: true, color: { argb: 'FF003399' } };
    labelTotal.alignment = { horizontal: 'right' };

    const cellTotal = sheet.getCell('G4');
    cellTotal.value = { formula: 'SUBTOTAL(109, TabelaPremiacao[Valor])' }; 
    cellTotal.font = { bold: true, size: 12 };
    cellTotal.numFmt = '_-"R$ "* #,##0.00_-;-"R$ "* #,##0.00_-;_- "R$ "* "-"??_-;_-@_-';

    const linhasTabela = [];
    lancamentos.sort((a, b) => {
        const uA = a.unidade?.nome || "";
        const uB = b.unidade?.nome || "";
        if (uA !== uB) return uA.localeCompare(uB);
        return (a.motorista?.nome_completo || "").localeCompare(b.motorista?.nome_completo || "");
    });

    lancamentos.forEach(l => {
        const [ano, mes] = l.competencia.split('-');
        const dataJs = new Date(Date.UTC(parseInt(ano), parseInt(mes) - 1, 1));
        const cpfRaw = (l.motorista?.email || "").split('@')[0];
        const cpfFmt = cpfRaw.length === 11 ? cpfRaw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpfRaw;

        linhasTabela.push([
            dataJs,                            
            l.unidade?.nome || "OUTROS",       
            l.motorista?.matricula || '-', // [ALTERAÇÃO] Valor ID
            l.motorista?.nome_completo,        
            cpfFmt,                            
            l.status.toUpperCase(),            
            parseFloat(l.valor_calculado || 0) 
        ]);
    });

    const table = sheet.addTable({
        name: 'TabelaPremiacao',
        ref: 'A6', 
        headerRow: true,
        totalsRow: true,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: [
            { name: 'Competência', filterButton: true },
            { name: 'Unidade', filterButton: true },
            { name: 'ID', filterButton: true }, // [NOVO]
            { name: 'Motorista', filterButton: true },
            { name: 'CPF', filterButton: true },
            { name: 'Status', filterButton: true },
            { name: 'Valor', filterButton: true, totalsRowFunction: 'sum' }
        ],
        rows: linhasTabela
    });

    sheet.getRow(6).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    sheet.getColumn('A').numFmt = 'mm/yyyy'; 
    sheet.getColumn('A').alignment = { horizontal: 'center' };
    sheet.getColumn('B').alignment = { horizontal: 'center' };
    sheet.getColumn('C').alignment = { horizontal: 'center' }; // ID
    sheet.getColumn('D').alignment = { horizontal: 'left' };
    sheet.getColumn('E').alignment = { horizontal: 'center' };
    sheet.getColumn('F').alignment = { horizontal: 'center' };
    sheet.getColumn('G').numFmt = '_-"R$ "* #,##0.00_-;-"R$ "* #,##0.00_-;_- "R$ "* "-"??_-;_-@_-';

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Premiacao_${Date.now()}.xlsx`;
    link.click();
};


/* =========================================================
   4. GERADOR DE PDF 
========================================================= */
window.gerarRelatorioPremiacaoPDF = async function ({ lancamentos, filtrosTexto }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const isDetalhado = document.getElementById('rel-prem-detalhado').checked;
    const usuarioLogado = window.perfilUsuario?.nome_completo || "Administrador Geral";

    let totalGeralRegistros = 0;
    let totalGeralValor = 0;
    const unidadesMap = {};

    lancamentos.forEach(l => {
        const uNome = l.unidade?.nome || "OUTROS";
        if (!unidadesMap[uNome]) unidadesMap[uNome] = [];
        unidadesMap[uNome].push(l);
        totalGeralRegistros++;
        totalGeralValor += parseFloat(l.valor_calculado || 0);
    });

    const unidadesSorted = Object.keys(unidadesMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    
    // Variável para controlar a inserção de novas páginas corretamente
    let primeiraPaginaPreenchida = false;

    for (const uNome of unidadesSorted) {
        
        // Controle de quebra de página: se não for a primeira iteração, adiciona página nova
        if (primeiraPaginaPreenchida) {
            doc.addPage();
        } else {
            primeiraPaginaPreenchida = true;
        }

        const motoristas = unidadesMap[uNome].sort((a, b) => 
            (a.motorista?.nome_completo || "").localeCompare(b.motorista?.nome_completo || "", 'pt-BR')
        );

        let totalValorUnidade = 0;

        if (!isDetalhado) {
            // --- MODO SIMPLIFICADO ---
            await window.desenharCabecalhoCorporativoPremiacao(doc, "RELATÓRIO DE PREMIAÇÕES", { 
                resumo: filtrosTexto,
                emissor: `Gerado por: ${usuarioLogado} | ${new Date().toLocaleString('pt-BR')}` 
            });

            let currentY = 32;
            doc.setTextColor(0, 51, 153).setFontSize(10).setFont(undefined, 'bold').text(`AGRUPAMENTO POR UNIDADE: ${uNome.toUpperCase()}`, 14, currentY);
            currentY += 6;

            const rows = motoristas.map(apur => {
                const [ano, mes] = apur.competencia.split('-');
                const vCalc = parseFloat(apur.valor_calculado || 0);
                totalValorUnidade += vCalc;
                const cpfRaw = (apur.motorista?.email || "").split('@')[0];
                const cpfFmt = cpfRaw.length === 11 ? cpfRaw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpfRaw;

                return [
                    `${mes}/${ano}`, 
                    apur.motorista?.matricula || '-',
                    cpfFmt, 
                    apur.motorista?.nome_completo, 
                    `R$ ${vCalc.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`, 
                    apur.status.toUpperCase()
                ];
            });

            doc.autoTable({
                startY: currentY,
                head: [['Mês', 'ID', 'CPF', 'Motorista', 'Resultado', 'Status']],
                body: rows,
                theme: 'grid',
                styles: { fontSize: 7.5, valign: 'middle' },
                headStyles: { fillColor: [0, 51, 153], halign: 'center' },
                columnStyles: { 
                    0: { cellWidth: 15, halign: 'center' }, 
                    1: { cellWidth: 15, halign: 'center' }, 
                    2: { cellWidth: 28, halign: 'center' }, 
                    4: { cellWidth: 25, halign: 'right' }, 
                    5: { cellWidth: 20, halign: 'center' } 
                }
            });
            
            doc.autoTable({
                startY: doc.lastAutoTable.finalY + 5,
                body: [
                    ["TOTAL DE MOTORISTAS NA UNIDADE:", motoristas.length],
                    ["TOTAL DE PREMIAÇÃO DA UNIDADE:", `R$ ${totalValorUnidade.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]
                ],
                theme: 'plain',
                styles: { fontSize: 9, fontStyle: 'bold', textColor: [0, 51, 153], valign: 'middle' },
                columnStyles: { 0: { cellWidth: 130, halign: 'right' }, 1: { halign: 'right' } }
            });

        } else {
            // --- MODO DETALHADO ---
            for (let i = 0; i < motoristas.length; i++) {
                const apur = motoristas[i];
                
                // Se não for o primeiro motorista, quebra a página (o primeiro já usa a página recém-criada no topo do loop)
                if (i > 0) doc.addPage();
                
                await window.desenharCabecalhoCorporativoPremiacao(doc, "RELATÓRIO DE PREMIAÇÕES", { 
                    resumo: filtrosTexto,
                    emissor: `Gerado por: ${usuarioLogado} | ${new Date().toLocaleString('pt-BR')}` 
                });

                let currentY = 32;
                doc.setTextColor(0, 51, 153).setFontSize(10).setFont(undefined, 'bold').text(`AGRUPAMENTO POR UNIDADE: ${uNome.toUpperCase()}`, 14, currentY);
                currentY += 6;
                
                const [ano, mes] = apur.competencia.split('-');
                const vCalc = parseFloat(apur.valor_calculado || 0);
                totalValorUnidade += vCalc;
                const cpfFmt = (apur.motorista?.email || "").split('@')[0].replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");

                // Tabela Cabeçalho do Motorista
                doc.autoTable({
                    startY: currentY,
                    head: [['Mês', 'ID', 'CPF', 'Motorista', 'Resultado', 'Status']],
                    body: [[
                        `${mes}/${ano}`, 
                        apur.motorista?.matricula || '-', 
                        cpfFmt, 
                        apur.motorista?.nome_completo, 
                        `R$ ${vCalc.toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, 
                        apur.status.toUpperCase()
                    ]],
                    theme: 'grid',
                    styles: { fontSize: 8, fontStyle: 'bold', valign: 'middle' },
                    headStyles: { fillColor: [0, 51, 153] },
                    columnStyles: { 0: { cellWidth: 15, halign: 'center' }, 1: { cellWidth: 15, halign: 'center' }, 2: { cellWidth: 28, halign: 'center' }, 4: { cellWidth: 25, halign: 'right' }, 5: { cellWidth: 20, halign: 'center' } }
                });
                
                // Tabela de itens (Critérios)
                if (apur.itens) {
                    const valorMax = parseFloat(apur.politica?.valor_maximo || 0);
                    const somaPesos = apur.itens.reduce((acc, it) => acc + parseFloat(it.config?.peso || 0), 0);
                    const rowsItens = apur.itens.map(it => {
                        const pesoItem = parseFloat(it.config?.peso || 0);
                        const vItem = somaPesos > 0 ? (pesoItem / somaPesos) * valorMax : 0;
                        return [
                            it.config?.topico, 
                            it.qtd_realizada, 
                            it.atingiu_meta ? 'CONQUISTADO' : 'NÃO ATINGIDO', 
                            `R$ ${(it.atingiu_meta ? vItem : 0).toLocaleString('pt-BR', {minimumFractionDigits: 2})}`, 
                            it.observacao || '---'
                        ];
                    });

                    doc.autoTable({
                        startY: doc.lastAutoTable.finalY,
                        head: [['Critério', 'Qtd.', 'Aproveitamento', 'Valor', 'Observação']],
                        body: rowsItens,
                        theme: 'striped',
                        styles: { fontSize: 7, valign: 'middle' },
                        headStyles: { fillColor: [100, 100, 100] },
                        columnStyles: { 0: { cellWidth: 55 }, 1: { cellWidth: 12, halign: 'center' }, 2: { cellWidth: 28, halign: 'center' }, 3: { cellWidth: 25, halign: 'right' } }
                    });
                }
            }

            // Resumo unidade detalhada (quebra página para não espremer)
            doc.addPage();
            await window.desenharCabecalhoCorporativoPremiacao(doc, "RELATÓRIO DE PREMIAÇÕES", { 
                resumo: filtrosTexto,
                emissor: `Gerado por: ${usuarioLogado} | ${new Date().toLocaleString('pt-BR')}` 
            });
            
            doc.autoTable({
                startY: 32,
                body: [
                    ["TOTAL DE MOTORISTAS NA UNIDADE:", motoristas.length],
                    ["TOTAL DE PREMIAÇÃO DA UNIDADE:", `R$ ${totalValorUnidade.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]
                ],
                theme: 'plain',
                styles: { fontSize: 9, fontStyle: 'bold', textColor: [0, 51, 153], valign: 'middle' },
                columnStyles: { 0: { cellWidth: 130, halign: 'right' }, 1: { halign: 'right' } }
            });
        }
    }

    // --- PÁGINA FINAL (RESUMO GERAL) ---
    doc.addPage();
    await window.desenharCabecalhoCorporativoPremiacao(doc, "RESUMO GERAL DO RELATÓRIO", { 
        resumo: filtrosTexto,
        emissor: `Gerado por: ${usuarioLogado} | ${new Date().toLocaleString('pt-BR')}` 
    });
    
    doc.autoTable({
        startY: 40,
        head: [[{ content: 'CONSOLIDADO FINAL', colSpan: 2, styles: { halign: 'center', fillColor: [0, 51, 153] } }]],
        body: [
            ["TOTAL GERAL DE MOTORISTAS:", totalGeralRegistros],
            ["VALOR TOTAL GERAL DISTRIBUÍDO:", `R$ ${totalGeralValor.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`]
        ],
        theme: 'grid',
        styles: { fontSize: 11, fontStyle: 'bold', valign: 'middle' },
        columnStyles: { 0: { cellWidth: 130, halign: 'right' }, 1: { halign: 'right', textColor: [0, 100, 0] } }
    });

    window.finalizarPaginacaoPremiacao(doc, lancamentos.length);
    
    // --- CORREÇÃO DA TELA BRANCA AQUI ---
    // Usamos um Blob URL, que não tem limites de tamanho e não é bloqueado pelos navegadores
    const pdfBlob = doc.output('blob');
    const pdfUrl = URL.createObjectURL(pdfBlob);
    document.getElementById('iframe-pdf-premiacao').src = pdfUrl;
    
    document.getElementById('modal-preview-rel-premiacao').classList.add('active');
};

/* --- FUNÇÕES AUXILIARES E DE FORMATAÇÃO --- */
window.desenharCabecalhoCorporativoPremiacao = async function(doc, titulo, info) {
    doc.setFillColor(242, 242, 242).rect(0, 0, 210, 25, 'F'); // Cabeçalho de ponta a ponta
    try { doc.addImage('icons/Logo-TRR.png', 'PNG', 10, 5, 40, 15); } catch(e) {}

    doc.setFillColor(0, 51, 153).rect(60, 0, 150, 25, 'F');
    doc.setTextColor(255).setFontSize(14).setFont(undefined, 'bold').text(titulo, 65, 12);
    
    doc.setFontSize(8).setFont(undefined, 'normal').text(`Filtros: ${info.resumo}`, 65, 17);
    doc.setFontSize(7).setTextColor(220).text(info.emissor, 65, 22);
};

window.capturarFiltrosRelPremiacao = function() {
    let obj = { resumo: "", motorista: null, competencia: null, status: null, status_motorista: null };
    let txt = [];
    document.querySelectorAll('#container-filtros-rel-premiacao .filter-row').forEach(row => {
        const selectTipo = row.querySelector('.filter-select');
        const tipo = selectTipo?.value;
        const el = row.querySelector(`#val-prem-${row.id.split('-')[2]}`); 
        if (el?.value) {
            obj[tipo] = el.value;
            let label = el.tagName === 'SELECT' ? el.options[el.selectedIndex].text : el.value;
            
            if (tipo === 'competencia') label = label.split('-').reverse().join('/');
            
            const tipoDisplay = tipo === 'status_motorista' ? 'STATUS COLAB.' : tipo.toUpperCase();
            txt.push(`${tipoDisplay}: ${label}`);
        }
    });
    obj.resumo = txt.join(' | ') || "Geral";
    return obj;
};

// --- CORREÇÃO DA PAGINAÇÃO ---
window.finalizarPaginacaoPremiacao = function(doc, total) {
    const pages = doc.internal.getNumberOfPages();
    // A remoção da página 1 (doc.deletePage(1)) foi excluída pois ela causava o relatório em branco.
    for (let i = 1; i <= pages; i++) {
        doc.setPage(i);
        doc.setFontSize(8).setTextColor(150).text(`Página ${i} de ${pages}`, 185, 288);
    }
    // Escreve o total apenas na última página
    doc.setPage(pages);
    doc.setFontSize(9).setFont(undefined, 'bold').setTextColor(0, 51, 153).text(`Total de Apurações: ${total}`, 14, 282);
};