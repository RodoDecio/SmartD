/* =========================================================
   INICIALIZAÇÃO E FILTROS DINÂMICOS
========================================================= */
window.inicializarRelatoriosDiaria = async function () {
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Relatórios de Diárias';

    // REATIVIDADE DO RODAPÉ: Escuta mudanças na unidade global
    const selUnidadeRodape = document.getElementById('sel-unidade');
    if (selUnidadeRodape) {
        // Remove ouvintes antigos para evitar execuções duplicadas
        selUnidadeRodape.removeEventListener('change', window.atualizarFiltrosMotoristaDinamicos);
        selUnidadeRodape.addEventListener('change', window.atualizarFiltrosMotoristaDinamicos);
    }

    const container = document.getElementById('container-filtros-diaria');
    if (container) {
        container.innerHTML = '';
        window.adicionarLinhaFiltroDiaria('competencia');
    }

    // [CORREÇÃO] Adiciona o evento de clique ao botão para abrir o modal de seleção
    const btnGerar = document.getElementById('btn-gerar-diaria');
    if (btnGerar) {
        // Remove onclick antigo (se houver no HTML) e define a nova ação
        btnGerar.onclick = function() {
            const modal = document.getElementById('modal-selecao-formato');
            if(modal) modal.classList.add('active');
        };
    }
};

// Função para atualizar os selects de motorista já abertos na tela
window.atualizarFiltrosMotoristaDinamicos = function() {
    document.querySelectorAll('.filter-row').forEach(row => {
        const selTipo = row.querySelector('.filter-select');
        if (selTipo && selTipo.value === 'motorista') {
            const id = row.id.replace('row-diaria-', '');
            window.configurarInputDiaria(selTipo, id);
        }
    });
};

window.adicionarLinhaFiltroDiaria = function (tipoPadrao = "") {
    const container = document.getElementById('container-filtros-diaria');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `row-diaria-${id}`;
    div.style = "display:flex; gap:10px; align-items:center; margin-bottom:8px;";

    // Adicionado o 'status_motorista' na lista de options
    div.innerHTML = `
        <select class="filter-select" style="width:200px" onchange="window.configurarInputDiaria(this, '${id}')">
            <option value="" disabled ${!tipoPadrao ? 'selected' : ''}>Filtrar por...</option>
            <option value="competencia" ${tipoPadrao === 'competencia' ? 'selected' : ''}>Mês Competência</option>
            <option value="motorista">Motorista</option>
            <option value="status">Status Lançamento</option>
            <option value="status_motorista">Status Colaborador</option> 
        </select>
        <div id="wrapper-val-diaria-${id}" style="display:flex; gap:10px; flex:0 1 450px;">
            <input type="text" class="form-control" disabled placeholder="Selecione um filtro...">
        </div>
        <button onclick="this.parentElement.remove()" style="background:none; border:none; color:#dc3545; cursor:pointer;"><i class="fas fa-trash"></i></button>
    `;
    container.appendChild(div);
    if (tipoPadrao) window.configurarInputDiaria(div.querySelector('select'), id);
};

window.configurarInputDiaria = async function (sel, id) {
    const tipo = sel.value;
    const wrapper = document.getElementById(`wrapper-val-diaria-${id}`);
    if (!wrapper) return;
    wrapper.innerHTML = '';

    const unidadeMestre = document.getElementById('sel-unidade')?.value || "TODAS";

    if (tipo === 'competencia') {
        const agora = new Date();
        const mesFmt = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
        wrapper.innerHTML = `<input type="month" class="form-control" id="val-diaria-${id}" data-tipo="competencia" value="${mesFmt}">`;
    } 
    else if (tipo === 'status') { 
        wrapper.innerHTML = `
            <select class="form-control" id="val-diaria-${id}" data-tipo="status">
                <option value="Aberto">Aberto</option>
                <option value="Fechado">Fechado</option>
            </select>
        `;
    }
    
    else if (tipo === 'status_motorista') {
        wrapper.innerHTML = `
            <select class="form-control" id="val-diaria-${id}" data-tipo="status_motorista">
                <option value="">Todos (Ativos e Inativos)</option>
                <option value="true">Somente Ativos</option>
                <option value="false">Somente Inativos</option>
            </select>
        `;
    }
    else if (tipo === 'motorista') {
        const s = document.createElement('select');
        s.className = "form-control";
        s.id = `val-diaria-${id}`;
        s.dataset.tipo = "motorista";
        s.innerHTML = '<option value="">Todos os Motoristas</option>';
        wrapper.appendChild(s);
        
        let query = clienteSupabase.from('perfis')
            .select('id, nome_completo')
            .eq('funcao', 'motorista');

        if (unidadeMestre !== 'TODAS') {
            query = query.eq('unidade_id', unidadeMestre);
        }

        const { data, error } = await query.order('nome_completo');
        if (data) {
            data.forEach(m => {
                s.innerHTML += `<option value="${m.id}">${m.nome_completo}</option>`;
            });
        }
        if (error) window.mostrarToast("Erro ao filtrar motoristas", "error");
    }
};

/* =========================================================
   NOVA LÓGICA CENTRALIZADA DE DADOS
========================================================= */

// Função 1: Apenas busca e organiza os dados (Desacoplada da geração visual)
window.buscarDadosDiarias = async function() {
    let competenciaSelecionada = "";
    let motoristaId = null;
    let statusFiltro = null;
    let statusMotoristaFiltro = null; // NOVO: Armazena o estado (true/false)
    let filtrosTexto = [];

    // Captura de Filtros
    document.querySelectorAll('[id^="val-diaria-"]').forEach(el => {
        if (el.dataset.tipo === "competencia") {
            competenciaSelecionada = el.value;
            if (el.value) {
                const [ano, mes] = el.value.split('-');
                filtrosTexto.push(`Competência: ${mes}/${ano}`);
            }
        }
        if (el.dataset.tipo === "motorista" && el.value !== "") {
            motoristaId = el.value;
            filtrosTexto.push(`Motorista: ${el.options[el.selectedIndex].text}`);
        }
        if (el.dataset.tipo === "status" && el.value !== "") {
            statusFiltro = el.value;
            filtrosTexto.push(`Status Lanç.: ${statusFiltro}`);
        }
        // NOVO: Captura Status Motorista
        if (el.dataset.tipo === "status_motorista" && el.value !== "") {
            statusMotoristaFiltro = el.value === 'true'; // converte a string para booleano
            filtrosTexto.push(`Colaborador: ${statusMotoristaFiltro ? 'Ativos' : 'Inativos'}`);
        }
    });

    const unidadeMestreRel = document.getElementById('sel-unidade')?.value || "TODAS";
    const unidadeTexto = document.getElementById('sel-unidade')?.options[document.getElementById('sel-unidade').selectedIndex]?.text || "Todas as Unidades";
    filtrosTexto.push(`Filtro Unidade: ${unidadeTexto}`);

    if (!competenciaSelecionada) throw new Error("Selecione o Mês de Competência.");

    const [anoRef, mesRef] = competenciaSelecionada.split('-');
    const dataInicio = new Date(parseInt(anoRef), parseInt(mesRef) - 2, 16, 12, 0, 0);
    const dataFim = new Date(parseInt(anoRef), parseInt(mesRef) - 1, 15, 12, 0, 0);
    const formatarISO = (d) => {
        const ano = d.getFullYear();
        const mes = String(d.getMonth() + 1).padStart(2, '0');
        const dia = String(d.getDate()).padStart(2, '0');
        return `${ano}-${mes}-${dia}`;
    };
    const dtIni = formatarISO(dataInicio);
    const dtFim = formatarISO(dataFim);

    // BUSCA OS VALORES DE ALIMENTAÇÃO DAS UNIDADES
    const { data: valoresData } = await clienteSupabase.from('valores_diarias').select('unidade_id, valor_alimentacao').eq('ativo', true);
    const mapValoresAli = {};
    if (valoresData) {
        valoresData.forEach(v => mapValoresAli[v.unidade_id] = parseFloat(v.valor_alimentacao || 0));
    }

    // [CORREÇÃO DE QUERY]: Adicionado o `!inner` para forçar o filtro no relacionamento
    // Se o usuário selecionou Inativo, a query só trará linhas cuja FK motorista esteja inativa no cadastro
    let innerText = 'motorista:perfis!diarias_lancamentos_perfil_id_fkey';
    if (statusMotoristaFiltro !== null) {
        innerText = `motorista:perfis!diarias_lancamentos_perfil_id_fkey!inner`;
    }

    let queryBase = clienteSupabase.from('diarias_lancamentos').select(`
        data_referencia, tipo_consumo, valor_dia, status, 
        ${innerText} (
            nome_completo, email, matricula, unidade_id, ativo, unidades(nome)
        )
    `, { count: 'exact' })
    .gte('data_referencia', dtIni)
    .lte('data_referencia', dtFim);

    if (unidadeMestreRel !== 'TODAS') queryBase = queryBase.eq('unidade_id', unidadeMestreRel);
    if (motoristaId) queryBase = queryBase.eq('perfil_id', motoristaId);
    if (statusFiltro) queryBase = queryBase.eq('status', statusFiltro);
    
    // APLICA O FILTRO BOOLEANO DO PERFIL
    if (statusMotoristaFiltro !== null) {
        queryBase = queryBase.eq('motorista.ativo', statusMotoristaFiltro);
    }

    queryBase = queryBase.order('data_referencia', { ascending: true });

    let todosLancamentos = [];
    let page = 0;
    const pageSize = 1000;
    let continuarBuscando = true;

    while (continuarBuscando) {
        const from = page * pageSize;
        const to = from + pageSize - 1;
        const { data, error } = await queryBase.range(from, to);

        if (error) throw error;

        if (data && data.length > 0) {
            todosLancamentos = todosLancamentos.concat(data);
            if (data.length < pageSize) continuarBuscando = false;
            else page++;
        } else {
            continuarBuscando = false;
        }
    }
    
    // Processamento dos Dados
    const unidadesMap = {};
    let totalGeralMotoristas = 0;
    let totalGeralRelatorio = 0;

    todosLancamentos.forEach(l => {
        const uNome = l.motorista?.unidades?.nome || "OUTROS";
        const mNome = l.motorista?.nome_completo || "DESCONHECIDO";
        const mMatricula = l.motorista?.matricula || ""; 
        const uId = l.motorista?.unidade_id || l.unidade_id; 
        
        let cpfRaw = (l.motorista?.email || "").split('@')[0];
        let cpfFmt = cpfRaw.length === 11 ? cpfRaw.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") : cpfRaw;

        if (!unidadesMap[uNome]) unidadesMap[uNome] = {};
        
        if (!unidadesMap[uNome][mNome]) {
            const valAli = mapValoresAli[uId] || 0;

            unidadesMap[uNome][mNome] = { 
                cpf: cpfFmt, 
                matricula: mMatricula, 
                logs: [], 
                totais: {},
                valorAlimentacao: valAli, 
                totalPix: 0,
                totalCartao: valAli
            };
            totalGeralMotoristas++;
            totalGeralRelatorio += valAli;
        } else {
            if (!unidadesMap[uNome][mNome].matricula && mMatricula) {
                unidadesMap[uNome][mNome].matricula = mMatricula;
            }
        }

        const tipo = l.tipo_consumo.toLowerCase();
        const tipoLabel = tipo.toUpperCase();
        unidadesMap[uNome][mNome].logs.push(l);
        
        if (!unidadesMap[uNome][mNome].totais[tipoLabel]) {
            unidadesMap[uNome][mNome].totais[tipoLabel] = { qtd: 0, valor: 0 };
        }
        unidadesMap[uNome][mNome].totais[tipoLabel].qtd++;
        
        const valorLinha = (l.valor_dia || 0);
        unidadesMap[uNome][mNome].totais[tipoLabel].valor += valorLinha;
        
        if (tipo === 'diaria') {
            unidadesMap[uNome][mNome].totalPix += valorLinha;
        } else {
            unidadesMap[uNome][mNome].totalCartao += valorLinha;
        }
        
        totalGeralRelatorio += valorLinha;
    });

    return { unidadesMap, totalGeralMotoristas, totalGeralRelatorio, filtrosTexto };
};

// Função 2: Orquestrador (Chamado pelos botões do Modal)
window.iniciarExportacao = async function(formato) {
    document.getElementById('modal-selecao-formato').classList.remove('active');
    
    const btn = document.getElementById('btn-gerar-diaria');
    const txtOriginal = btn ? btn.innerHTML : '';
    
    if (btn) {
        btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> GERANDO ${formato.toUpperCase()}...`;
        btn.disabled = true;
    }

    try {
        // 1. Busca dados (Comum aos dois formatos)
        const dados = await window.buscarDadosDiarias();

        if (formato === 'pdf') {
            await window.gerarRelatorioPDF(dados);
        } else if (formato === 'excel') {
            await window.gerarRelatorioExcel(dados);
        }

    } catch (e) {
        console.error(e);
        window.mostrarToast(e.message, "error");
    } finally {
        if (btn) {
            btn.innerHTML = '<i class="fas fa-file-alt"></i> GERAR RELATÓRIO'; // Reseta texto padrão
            btn.disabled = false;
        }
    }
};

/* =========================================================
   GERADORES ESPECÍFICOS
========================================================= */


/* =========================================================
   GERADOR DE PDF (COMPLETO)
========================================================= */
window.gerarRelatorioPDF = async function({ unidadesMap, totalGeralMotoristas, totalGeralRelatorio, filtrosTexto }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const usuarioLogado = window.usuarioLogadoGlobal?.nome_completo || "Administrador Geral";
    const isDetalhado = document.getElementById('rel-diaria-detalhado').checked;
    const unidadesSorted = Object.keys(unidadesMap).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    for (const uNome of unidadesSorted) {
        const motoristas = unidadesMap[uNome];
        const nomesSorted = Object.keys(motoristas).sort((a, b) => a.localeCompare(b, 'pt-BR'));
        let motoristasUnidadeCont = 0;
        let valorUnidadeSoma = 0;

        doc.addPage();
        doc.setFillColor(242, 242, 242).rect(0, 0, 60, 25, 'F'); 
        try { doc.addImage('icons/Logo-TRR.png', 'PNG', 10, 5, 40, 15); } catch(e) {}
        doc.setFillColor(0, 51, 153).rect(60, 0, 150, 25, 'F');
        doc.setTextColor(255).setFontSize(14).setFont(undefined, 'bold').text("RELATÓRIO DE LANÇAMENTO DE DIÁRIAS", 65, 12);
        doc.setFontSize(8).setFont(undefined, 'normal').text(`Filtros: ${filtrosTexto.join(' | ')}`, 65, 17);
        doc.setFontSize(7).setTextColor(220).text(`Gerado por: ${usuarioLogado} | ${new Date().toLocaleString('pt-BR')}`, 65, 22);

        let currentY = 32;
        doc.setTextColor(0, 51, 153).setFontSize(10).setFont(undefined, 'bold').text(`AGRUPAMENTO POR UNIDADE: ${uNome.toUpperCase()}`, 14, currentY);
        currentY += 8;

        for (const mNome of nomesSorted) {
            const d = motoristas[mNome];
            motoristasUnidadeCont++;

            if (isDetalhado) {
                if (motoristasUnidadeCont > 1) {
                    doc.addPage();
                    doc.setFillColor(0, 51, 153).rect(0, 0, 210, 10, 'F');
                    doc.setTextColor(255).setFontSize(9).text(`DETALHAMENTO - ${mNome} (${uNome})`, 14, 7);
                    currentY = 15;
                }
            } else if (currentY > 230) {
                doc.addPage();
                currentY = 20;
            }

            doc.setTextColor(0).setFontSize(9).setFont(undefined, 'bold');
            
            const txtID = d.matricula ? ` | ID: ${d.matricula}` : '';
            doc.text(`Motorista: ${mNome}${txtID} | CPF: ${d.cpf}`, 14, currentY);
            currentY += 4;

            if (isDetalhado) {
                d.logs.sort((a, b) => a.data_referencia.localeCompare(b.data_referencia));
                const diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
                const bodyDet = d.logs.map(log => {
                    const [anoLog, mesLog, diaLog] = log.data_referencia.split('-');
                    const dtObj = new Date(parseInt(anoLog), parseInt(mesLog)-1, parseInt(diaLog));
                    const diaSem = diasSemana[dtObj.getDay()];
                    const dataVisual = `${diaLog}/${mesLog}/${anoLog} (${diaSem})`;
                    return [
                        dataVisual, 
                        log.tipo_consumo.toUpperCase(),
                        "R$",
                        (log.valor_dia || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
                        log.status || '-'
                    ];
                });

                doc.autoTable({
                    startY: currentY,
                    head: [['Data', 'Lançamento', '', 'Valor', 'Status']],
                    body: bodyDet,
                    theme: 'grid',
                    styles: { fontSize: 7.5 },
                    columnStyles: { 2: { cellWidth: 8, halign: 'right' }, 3: { halign: 'right', cellWidth: 20 } },
                    didParseCell: function(data) {
                        if (data.section === 'body' && data.column.index === 0) {
                            const text = data.cell.text[0] || "";
                            if (text.includes('(Dom)')) {
                                data.cell.styles.textColor = [220, 53, 69]; 
                                data.cell.styles.fontStyle = 'bold';
                            } else if (text.includes('(Sáb)')) {
                                data.cell.styles.textColor = [0, 51, 153]; 
                                data.cell.styles.fontStyle = 'bold';
                            }
                        }
                    }
                });
                currentY = doc.lastAutoTable.finalY + 3;
            }

            const tiposOrdenados = Object.keys(d.totais).sort();
            const bodyRes = tiposOrdenados.map(t => {
                const v = d.totais[t];
                return [t, v.qtd, "R$", v.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })];
            });

            // INJETA ALIMENTAÇÃO FIXA SE EXISTIR
            if (d.valorAlimentacao > 0) {
                bodyRes.push(['ALIMENTAÇÃO (FIXA)', '1', "R$", d.valorAlimentacao.toLocaleString('pt-BR', { minimumFractionDigits: 2 })]);
            }
            
            const somaMotorista = d.totalPix + d.totalCartao;
            valorUnidadeSoma += somaMotorista;

            // RESUMO DIVIDIDO: PIX x CARTÃO
            bodyRes.push([{ content: 'Diárias', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', textColor: [0, 51, 153] } }, { content: 'R$', styles: { fontStyle: 'bold', halign: 'right', textColor: [0, 51, 153] } }, { content: d.totalPix.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', textColor: [0, 51, 153], halign: 'right' } }]);
            bodyRes.push([{ content: 'Refeições/Alimentação', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', textColor: [200, 80, 0] } }, { content: 'R$', styles: { fontStyle: 'bold', halign: 'right', textColor: [200, 80, 0] } }, { content: d.totalCartao.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', textColor: [200, 80, 0], halign: 'right' } }]);
            
            bodyRes.push([{ content: 'CUSTO TOTAL DO MOTORISTA', colSpan: 2, styles: { halign: 'right', fontStyle: 'bold', fillColor: [240,240,240] } }, { content: 'R$', styles: { fontStyle: 'bold', halign: 'right', fillColor: [240,240,240] } }, { content: somaMotorista.toLocaleString('pt-BR', { minimumFractionDigits: 2 }), styles: { fontStyle: 'bold', textColor: [0, 100, 0], halign: 'right', fillColor: [240,240,240] } }]);

            doc.autoTable({
                startY: currentY,
                head: [['Resumo de Incidências', 'Qtd', '', 'Soma de Valores']],
                body: bodyRes,
                theme: isDetalhado ? 'plain' : 'striped',
                styles: { fontSize: 8 },
                headStyles: { fillColor: isDetalhado ? [120, 120, 120] : [0, 51, 153] },
                columnStyles: { 2: { cellWidth: 8, halign: 'right' }, 3: { halign: 'right', cellWidth: 22 } }
            });
            currentY = doc.lastAutoTable.finalY + 8;
        }

        doc.setFontSize(8).setFont(undefined, 'bold').setTextColor(0);
        doc.text(`Total de motoristas (${uNome}): ${motoristasUnidadeCont}`, 14, currentY);
        doc.text(`Custo total da Unidade (${uNome}): R$ ${valorUnidadeSoma.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, currentY + 4);
    }

    doc.addPage();
    doc.setFillColor(0, 51, 153).rect(0, 0, 210, 20, 'F');
    doc.setTextColor(255).setFontSize(12).setFont(undefined, 'bold').text("RESUMO GERAL DO RELATÓRIO", 14, 13);
    doc.setTextColor(0).setFontSize(10).setFont(undefined, 'normal');
    doc.text(`Total geral de motoristas listados: ${totalGeralMotoristas}`, 14, 35);
    doc.setFont(undefined, 'bold');
    doc.text(`VALOR TOTAL GERAL LANÇADO: R$ ${totalGeralRelatorio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, 14, 42);

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        if (i > 1) doc.setFontSize(7).setTextColor(150).text(`Página ${i-1} de ${totalPages-1}`, 185, 288);
    }
    
    if (doc.internal.pages.length > 1 && doc.internal.pages[1].length < 10) doc.deletePage(1);
    else doc.deletePage(1);

    const url = URL.createObjectURL(doc.output('blob'));
    document.getElementById('iframe-diaria-pdf').src = url;
    document.getElementById('modal-preview-diaria').classList.add('active');
};

/* =========================================================
   GERADOR DE EXCEL (COM 2 ABAS: DETALHADO E RESUMO)
========================================================= */
window.gerarRelatorioExcel = async function({ unidadesMap, filtrosTexto }) {
    const btn = document.getElementById('btn-gerar-diaria');
    const txtOriginal = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<i class="fas fa-file-excel"></i> GERANDO EXCEL...';

    const workbook = new ExcelJS.Workbook();
    
    // ==========================================
    // ABA 1: DETALHAMENTO (Lançamentos Diários)
    // ==========================================
    const sheetDetalhe = workbook.addWorksheet('Detalhamento');
    sheetDetalhe.views = [{ showGridLines: false }];

    sheetDetalhe.columns = [
        { width: 15 }, // A: Data
        { width: 15 }, // B: Unidade
        { width: 12 }, // C: ID
        { width: 40 }, // D: Motorista
        { width: 18 }, // E: CPF
        { width: 25 }, // F: Tipo Lançamento
        { width: 25 }, // G: Destino (PIX ou Cartão)
        { width: 15 }, // H: Status
        { width: 18 }  // I: Valor
    ];

    // ==========================================
    // ABA 2: RESUMO CONSOLIDADO
    // ==========================================
    const sheetResumo = workbook.addWorksheet('Resumo Consolidado');
    sheetResumo.views = [{ showGridLines: false }];

    sheetResumo.columns = [
        { width: 20 }, // A: Unidade
        { width: 12 }, // B: ID
        { width: 40 }, // C: Motorista
        { width: 18 }, // D: CPF
        { width: 15 }, // E: Qtd Lançamentos
        { width: 22 }, // F: Total PIX (Diárias)
        { width: 25 }, // G: Total Cartão (Ref/Alim)
        { width: 22 }  // H: Total Geral
    ];

    // --- CORREÇÃO 1: Inserção Segura da Logo ---
    // Instanciamos DUAS imagens separadas para não corromper o XML do Excel
    try {
        const response = await fetch('icons/Logo-TRR.png');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            const logoIdAba1 = workbook.addImage({ buffer: buffer, extension: 'png' });
            const logoIdAba2 = workbook.addImage({ buffer: buffer, extension: 'png' });
            
            sheetDetalhe.addImage(logoIdAba1, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 45 } });
            sheetResumo.addImage(logoIdAba2, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 45 } });
        }
    } catch (e) {
        console.warn("Aviso: Não foi possível carregar a logo para o Excel", e);
    }

    // --- Cabeçalhos Aba 1 ---
    sheetDetalhe.mergeCells('B1:I1');
    const titleCell1 = sheetDetalhe.getCell('B1');
    titleCell1.value = "RELATÓRIO DE LANÇAMENTO DE DIÁRIAS E ALIMENTAÇÃO - DETALHADO";
    titleCell1.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    titleCell1.alignment = { vertical: 'middle', horizontal: 'center' };

    sheetDetalhe.mergeCells('B2:I2');
    const subTitleCell1 = sheetDetalhe.getCell('B2');
    subTitleCell1.value = filtrosTexto.join(" | ");
    subTitleCell1.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
    subTitleCell1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    subTitleCell1.alignment = { vertical: 'middle', horizontal: 'center' };

    sheetDetalhe.getRow(1).height = 40;
    sheetDetalhe.getRow(2).height = 20;

    const labelTotal1 = sheetDetalhe.getCell('H4');
    labelTotal1.value = "CUSTO TOTAL GERAL:";
    labelTotal1.font = { bold: true, color: { argb: 'FF003399' } };
    labelTotal1.alignment = { horizontal: 'right' };

    const cellTotal1 = sheetDetalhe.getCell('I4');
    cellTotal1.value = { formula: 'SUBTOTAL(109, TabelaDiarias[Valor])' }; 
    cellTotal1.font = { bold: true, size: 12 };
    cellTotal1.numFmt = '_-"R$ "* #,##0.00_-;-"R$ "* #,##0.00_-;_- "R$ "* "-"??_-;_-@_-';

    // --- Cabeçalhos Aba 2 ---
    sheetResumo.mergeCells('B1:H1');
    const titleCell2 = sheetResumo.getCell('B1');
    titleCell2.value = "RESUMO CONSOLIDADO - DIÁRIAS E ALIMENTAÇÃO";
    titleCell2.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    titleCell2.alignment = { vertical: 'middle', horizontal: 'center' };

    sheetResumo.mergeCells('B2:H2');
    const subTitleCell2 = sheetResumo.getCell('B2');
    subTitleCell2.value = filtrosTexto.join(" | ");
    subTitleCell2.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
    subTitleCell2.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    subTitleCell2.alignment = { vertical: 'middle', horizontal: 'center' };

    sheetResumo.getRow(1).height = 40;
    sheetResumo.getRow(2).height = 20;

    // --- Extração e Organização de Dados ---
    const linhasDetalhamento = [];
    const linhasResumo = [];
    const unidadesSorted = Object.keys(unidadesMap).sort();

    unidadesSorted.forEach(uNome => {
        const motoristas = unidadesMap[uNome];
        Object.keys(motoristas).sort().forEach(mNome => {
            const dadosM = motoristas[mNome];
            
            // PREPARA ABA 1: Loop nos Dias
            dadosM.logs.sort((a, b) => a.data_referencia.localeCompare(b.data_referencia)).forEach(log => {
                const [ano, mes, dia] = log.data_referencia.split('-');
                const dataJs = new Date(Date.UTC(parseInt(ano), parseInt(mes) - 1, parseInt(dia)));
                const txtMatricula = dadosM.matricula ? dadosM.matricula : '-';
                
                const isDiaria = log.tipo_consumo.toLowerCase() === 'diaria';
                const destinoPagamento = isDiaria ? 'CONTA / PIX' : 'CARTÃO CORPORATIVO';
                const valorLimpo = Number(log.valor_dia) || 0; // Garante que seja número numérico

                linhasDetalhamento.push([
                    dataJs,
                    uNome,
                    txtMatricula, 
                    mNome,
                    dadosM.cpf,
                    log.tipo_consumo.toUpperCase(),
                    destinoPagamento, 
                    log.status,
                    valorLimpo
                ]);
            });

            // PREPARA ABA 1: Adiciona linha do Fixo (se houver)
            if (dadosM.valorAlimentacao > 0) {
                const statusM = dadosM.logs.length > 0 ? dadosM.logs[0].status : 'Fechado';
                const valorAlimLimpo = Number(dadosM.valorAlimentacao) || 0;
                
                linhasDetalhamento.push([
                    '-', 
                    uNome,
                    dadosM.matricula ? dadosM.matricula : '-', 
                    mNome,
                    dadosM.cpf,
                    'ALIMENTAÇÃO (FIXA)',
                    'CARTÃO CORPORATIVO', 
                    statusM,
                    valorAlimLimpo
                ]);
            }

            // PREPARA ABA 2: Cria a linha Consolidada
            let totalLancamentos = dadosM.logs.length;
            if (dadosM.valorAlimentacao > 0) totalLancamentos += 1;

            const pixLimpo = Number(dadosM.totalPix) || 0;
            const cartaoLimpo = Number(dadosM.totalCartao) || 0;

            linhasResumo.push([
                uNome,
                dadosM.matricula ? dadosM.matricula : '-',
                mNome,
                dadosM.cpf,
                totalLancamentos,
                pixLimpo,
                cartaoLimpo,
                pixLimpo + cartaoLimpo
            ]);
        });
    });

    // --- CORREÇÃO 2: Bloqueio de Tabela Vazia ---
    // Se a pesquisa não retornar nada, insere uma linha fantasma para não corromper o arquivo
    if (linhasDetalhamento.length === 0) {
        linhasDetalhamento.push([new Date(), 'Nenhum', '-', 'Sem Registros', '-', '-', '-', '-', 0]);
    }
    if (linhasResumo.length === 0) {
        linhasResumo.push(['Nenhum', '-', 'Sem Registros', '-', 0, 0, 0, 0]);
    }

    // --- Adiciona Tabela Aba 1 ---
    sheetDetalhe.addTable({
        name: 'TabelaDiarias',
        ref: 'A6',
        headerRow: true,
        totalsRow: true,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: [
            { name: 'Data', filterButton: true },
            { name: 'Unidade', filterButton: true },
            { name: 'ID', filterButton: true }, 
            { name: 'Motorista', filterButton: true },
            { name: 'CPF', filterButton: true },
            { name: 'Tipo Lançamento', filterButton: true },
            { name: 'Destino Pagamento', filterButton: true },
            { name: 'Status', filterButton: true },
            { name: 'Valor', filterButton: true, totalsRowFunction: 'sum' }
        ],
        rows: linhasDetalhamento,
    });

    // Formatação Aba 1
    sheetDetalhe.getRow(6).alignment = { horizontal: 'center', vertical: 'middle' };
    sheetDetalhe.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    sheetDetalhe.getColumn('A').numFmt = 'dd/mm/yyyy';
    sheetDetalhe.getColumn('A').alignment = { horizontal: 'center' };
    sheetDetalhe.getColumn('B').alignment = { horizontal: 'center' };
    sheetDetalhe.getColumn('C').alignment = { horizontal: 'center' }; 
    sheetDetalhe.getColumn('D').alignment = { horizontal: 'left' };
    sheetDetalhe.getColumn('E').alignment = { horizontal: 'center' };
    sheetDetalhe.getColumn('F').alignment = { horizontal: 'center' };
    sheetDetalhe.getColumn('G').alignment = { horizontal: 'center' };
    sheetDetalhe.getColumn('H').alignment = { horizontal: 'center' };
    sheetDetalhe.getColumn('I').numFmt = '_-"R$ "* #,##0.00_-;-"R$ "* #,##0.00_-;_- "R$ "* "-"??_-;_-@_-';

    // --- Adiciona Tabela Aba 2 ---
    sheetResumo.addTable({
        name: 'TabelaResumo',
        ref: 'A6',
        headerRow: true,
        totalsRow: true,
        style: { theme: 'TableStyleMedium4', showRowStripes: true },
        columns: [
            { name: 'Unidade', filterButton: true },
            { name: 'ID', filterButton: true }, 
            { name: 'Motorista', filterButton: true },
            { name: 'CPF', filterButton: true, totalsRowLabel: 'TOTAIS GERAIS:' },
            { name: 'Qtd Lançamentos', filterButton: true, totalsRowFunction: 'sum' },
            { name: 'Total Diárias', filterButton: true, totalsRowFunction: 'sum' },
            { name: 'Total Refeição / Alimentação', filterButton: true, totalsRowFunction: 'sum' },
            { name: 'Total Geral', filterButton: true, totalsRowFunction: 'sum' }
        ],
        rows: linhasResumo,
    });

    // Formatação Aba 2
    sheetResumo.getRow(6).alignment = { horizontal: 'center', vertical: 'middle' };
    sheetResumo.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    sheetResumo.getColumn('A').alignment = { horizontal: 'center' };
    sheetResumo.getColumn('B').alignment = { horizontal: 'center' };
    sheetResumo.getColumn('C').alignment = { horizontal: 'left' };
    sheetResumo.getColumn('D').alignment = { horizontal: 'center' };
    sheetResumo.getColumn('E').alignment = { horizontal: 'center' };
    
    // Formata Colunas Financeiras do Resumo (F, G, H)
    ['F', 'G', 'H'].forEach(col => {
        sheetResumo.getColumn(col).numFmt = '_-"R$ "* #,##0.00_-;-"R$ "* #,##0.00_-;_- "R$ "* "-"??_-;_-@_-';
        sheetResumo.getColumn(col).alignment = { horizontal: 'right' };
    });

    // Gera e faz Download do arquivo
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    
    // --- CORREÇÃO 3: Nomenclatura segura do arquivo ---
    const dataAtualFmt = new Date().toLocaleDateString('pt-BR').replace(/\//g, '-');
    link.download = `Relatorio_Diarias_e_Refeicoes_${dataAtualFmt}.xlsx`;
    
    link.click();

    if (btn) btn.innerHTML = txtOriginal;
};

window.fecharPreviewDiaria = function () {
    document.getElementById('modal-preview-diaria').classList.remove('active');
    document.getElementById('iframe-diaria-pdf').src = "";
};

/* =========================================================
   LÓGICA DE JANELA FLUTUANTE (DRAGGABLE)
========================================================= */
window.tornarJanelaArrastavel = function() {
    const el = document.getElementById("modal-preview-diaria");
    const handle = document.getElementById("drag-handle-diaria");
    if (!el || !handle) return;

    let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

    handle.onmousedown = function(e) {
        e = e || window.event;
        e.preventDefault();
        pos3 = e.clientX;
        pos4 = e.clientY;
        document.onmouseup = closeDragElement;
        document.onmousemove = elementDrag;
        // Traz a janela para frente ao clicar
        el.style.zIndex = "5001";
    };

    function elementDrag(e) {
        e = e || window.event;
        e.preventDefault();
        pos1 = pos3 - e.clientX;
        pos2 = pos4 - e.clientY;
        pos3 = e.clientX;
        pos4 = e.clientY;
        el.style.top = (el.offsetTop - pos2) + "px";
        el.style.left = (el.offsetLeft - pos1) + "px";
    }

    function closeDragElement() {
        document.onmouseup = null;
        document.onmousemove = null;
    }
};