/* =========================================================
   RELATÓRIOS DE USUÁRIOS
========================================================= */

window.inicializarRelatoriosUsuarios = async function () {
    const titulo = document.getElementById('titulo-pagina');
    if(titulo) titulo.innerText = 'Relatórios de Usuários';
    
    const container = document.getElementById('container-filtros-usuarios');
    if (container) {
        container.innerHTML = '';
        // Inicia sem filtros extras por padrão, pois a Unidade já está no rodapé
    }

    // Configura botão de gerar
    const btnGerar = document.getElementById('btn-gerar-usuarios');
    if (btnGerar) {
        // Remove listeners antigos
        const newBtn = btnGerar.cloneNode(true);
        btnGerar.parentNode.replaceChild(newBtn, btnGerar);
        
        newBtn.onclick = function() {
            document.getElementById('modal-selecao-formato-usuarios').classList.add('active');
        };
    }
};

// --- GESTÃO DE FILTROS ---
window.adicionarLinhaFiltroUsuarios = function (tipoPadrao = "") {
    const container = document.getElementById('container-filtros-usuarios');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row';
    div.id = `row-usr-${id}`;
    div.style = "display:flex; gap:10px; align-items:center; margin-bottom:8px;";

    div.innerHTML = `
        <select class="filter-select" style="width:200px" onchange="window.configurarInputRelUsuario(this, '${id}')">
            <option value="" disabled ${!tipoPadrao ? 'selected' : ''}>Filtrar por...</option>
            <option value="funcao">Função / Perfil</option>
            <option value="status">Status</option>
        </select>
        <div id="wrapper-val-usr-${id}" style="display:flex; gap:10px; flex:0 1 450px;">
            <input type="text" class="form-control" disabled placeholder="Selecione um filtro...">
        </div>
        <button onclick="this.parentElement.remove()" style="background:none;border:none;color:#ff4444;cursor:pointer">
            <i class="fas fa-times"></i>
        </button>
    `;
    container.appendChild(div);
    if (tipoPadrao) window.configurarInputRelUsuario(div.querySelector('select'), id);
};

window.configurarInputRelUsuario = function (sel, id) {
    const tipo = sel.value;
    const wrapper = document.getElementById(`wrapper-val-usr-${id}`);
    if(!wrapper) return;
    wrapper.innerHTML = '';

    if (tipo === 'status') {
        wrapper.innerHTML = `
            <select class="form-control" id="val-usr-${id}">
                <option value="true">Ativo</option>
                <option value="false">Inativo</option>
            </select>`;
    } else if (tipo === 'funcao') {
        wrapper.innerHTML = `
            <select class="form-control" id="val-usr-${id}">
                <option value="motorista">Motorista</option>
                <option value="manutentor">Manutentor</option>
                <option value="analista">Analista</option>
                <option value="coordenador">Coordenador</option>
                <option value="especialista">Especialista</option>
                <option value="admin">Admin</option>
            </select>`;
    }
};

window.capturarFiltrosUsuarios = function() {
    let obj = { resumo: [], funcao: null, status: null };
    
    document.querySelectorAll('#container-filtros-usuarios .filter-row').forEach(row => {
        const tipo = row.querySelector('.filter-select')?.value;
        const el = row.querySelector(`#val-usr-${row.id.split('-')[2]}`); 
        
        if (el?.value) {
            obj[tipo] = el.value;
            const label = el.tagName === 'SELECT' ? el.options[el.selectedIndex].text : el.value;
            obj.resumo.push(`${tipo.toUpperCase()}: ${label}`);
        }
    });
    
    return obj;
};

// --- BUSCA DE DADOS ---
window.buscarDadosUsuariosRelatorio = async function() {
    const filtros = window.capturarFiltrosUsuarios();
    const unidadeId = document.getElementById('sel-unidade')?.value || "TODAS";
    const nomeUnidade = document.getElementById('sel-unidade')?.options[document.getElementById('sel-unidade').selectedIndex]?.text || "Todas";

    let textoResumo = filtros.resumo.join(' | ');
    if (textoResumo) textoResumo += ` | Unidade: ${nomeUnidade}`;
    else textoResumo = `Unidade: ${nomeUnidade}`;

    // [ALTERAÇÃO] Buscando a unidade de lotação (singular) em vez da lista
    let query = clienteSupabase.from('perfis')
        .select(`
            *,
            unidade:unidade_id (nome) 
        `)
        .order('nome_completo');

    // Filtro de Unidade (Baseado na Lotação Principal)
    if (unidadeId !== 'TODAS') {
        query = query.eq('unidade_id', unidadeId);
    }

    if (filtros.funcao) query = query.eq('funcao', filtros.funcao);
    if (filtros.status) query = query.eq('ativo', filtros.status === 'true');

    const { data, error } = await query;
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("Nenhum usuário encontrado com os filtros selecionados.");

    return { usuarios: data, filtrosTexto: textoResumo };
};

// --- ORQUESTRADOR ---
window.iniciarExportacaoUsuarios = async function(formato) {
    document.getElementById('modal-selecao-formato-usuarios').classList.remove('active');
    const btn = document.getElementById('btn-gerar-usuarios');
    if(btn) { btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> GERANDO...`; btn.disabled = true; }

    try {
        const dados = await window.buscarDadosUsuariosRelatorio();
        
        if (formato === 'excel') await window.gerarRelatorioUsuariosExcel(dados);
        else await window.gerarRelatorioUsuariosPDF(dados);

    } catch (e) {
        console.error(e);
        window.mostrarToast(e.message, "warning");
    } finally {
        if(btn) { btn.innerHTML = '<i class="fas fa-file-alt"></i> GERAR RELATÓRIO'; btn.disabled = false; }
    }
};

// --- EXCEL ---
window.gerarRelatorioUsuariosExcel = async function({ usuarios, filtrosTexto }) {
    if (typeof ExcelJS === 'undefined') {
        await new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.3.0/exceljs.min.js';
            s.onload = resolve;
            document.head.appendChild(s);
        });
    }

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Usuários');
    sheet.views = [{ showGridLines: false }];

    // [AJUSTE DE LARGURAS]
    sheet.getColumn('A').width = 22; // Logo
    sheet.getColumn('B').width = 8;  // ID (Reduzido)
    sheet.getColumn('C').width = 45; // Nome (Expandido)
    sheet.getColumn('D').width = 18; // CPF
    sheet.getColumn('E').width = 25; // Função (Expandido para não quebrar)
    sheet.getColumn('F').width = 20; // Unidade (Alocação é menor que lista)
    sheet.getColumn('G').width = 12; // Status (Reduzido)

    try {
        const response = await fetch('icons/Logo-TRR.png');
        if (response.ok) {
            const buffer = await response.arrayBuffer();
            const logoId = workbook.addImage({ buffer: buffer, extension: 'png' });
            sheet.addImage(logoId, { tl: { col: 0, row: 0 }, ext: { width: 120, height: 45 } });
        }
    } catch (e) {}

    // Cabeçalho
    sheet.mergeCells('B1:G1');
    const titleCell = sheet.getCell('B1');
    titleCell.value = "RELATÓRIO DE USUÁRIOS";
    titleCell.font = { name: 'Arial', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
    titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    titleCell.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.mergeCells('B2:G2');
    const subCell = sheet.getCell('B2');
    subCell.value = filtrosTexto;
    subCell.font = { name: 'Arial', size: 10, italic: true, color: { argb: 'FFFFFFFF' } };
    subCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF003399' } };
    subCell.alignment = { vertical: 'middle', horizontal: 'center' };

    sheet.getRow(1).height = 40;
    sheet.getRow(2).height = 20;

    // Dados
    const linhas = usuarios.map(u => {
        let cpf = u.email;
        if (cpf.includes('@frota.com')) {
            cpf = cpf.split('@')[0].replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
        }
        
        // [ALTERAÇÃO] Usando a unidade de lotação (singular)
        const unidadePrincipal = u.unidade?.nome || '-';

        return [
            '', // A (vazia)
            u.matricula || '-',
            u.nome_completo,
            cpf,
            u.funcao ? u.funcao.toUpperCase() : '-',
            unidadePrincipal, // Coluna F
            u.ativo ? 'ATIVO' : 'INATIVO'
        ];
    });

    const table = sheet.addTable({
        name: 'TabelaUsuarios',
        ref: 'B6',
        headerRow: true,
        totalsRow: false,
        style: { theme: 'TableStyleMedium2', showRowStripes: true },
        columns: [
            { name: 'ID', filterButton: true },
            { name: 'Nome', filterButton: true },
            { name: 'CPF/Login', filterButton: true },
            { name: 'Função', filterButton: true },
            { name: 'Unidade Alocada', filterButton: true }, // Título alterado
            { name: 'Status', filterButton: true }
        ],
        rows: linhas.map(r => [r[1], r[2], r[3], r[4], r[5], r[6]])
    });

    sheet.getRow(6).alignment = { horizontal: 'center', vertical: 'middle' };
    sheet.getRow(6).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    
    sheet.getColumn('B').alignment = { horizontal: 'center' };
    sheet.getColumn('C').alignment = { horizontal: 'left' };
    sheet.getColumn('D').alignment = { horizontal: 'center' };
    sheet.getColumn('E').alignment = { horizontal: 'center' };
    sheet.getColumn('F').alignment = { horizontal: 'center' }; // Unidade centralizada
    sheet.getColumn('G').alignment = { horizontal: 'center' };

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Usuarios_${Date.now()}.xlsx`;
    link.click();
};

// --- PDF ---
window.gerarRelatorioUsuariosPDF = async function({ usuarios, filtrosTexto }) {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF('p', 'mm', 'a4');
    const usuarioLogado = window.usuarioLogadoGlobal?.nome_completo || "Sistema";

    doc.setFillColor(242, 242, 242).rect(0, 0, 60, 25, 'F'); 
    try { doc.addImage('icons/Logo-TRR.png', 'PNG', 10, 5, 40, 15); } catch(e) {}
    doc.setFillColor(0, 51, 153).rect(60, 0, 150, 25, 'F');
    doc.setTextColor(255).setFontSize(14).setFont(undefined, 'bold').text("RELATÓRIO DE USUÁRIOS", 65, 12);
    doc.setFontSize(8).setFont(undefined, 'normal').text(`Filtros: ${filtrosTexto}`, 65, 17);
    doc.setFontSize(7).setTextColor(220).text(`Gerado por: ${usuarioLogado} | ${new Date().toLocaleString('pt-BR')}`, 65, 22);

    const rows = usuarios.map(u => {
        let cpf = u.email;
        if (cpf.includes('@frota.com')) {
            cpf = cpf.split('@')[0].replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4");
        }
        
        // [ALTERAÇÃO] Unidade Principal
        const unidadePrincipal = u.unidade?.nome || '-';

        return [
            u.matricula || '-',
            u.nome_completo,
            cpf,
            u.funcao ? u.funcao.toUpperCase() : '-',
            unidadePrincipal,
            u.ativo ? 'ATIVO' : 'INATIVO'
        ];
    });

    doc.autoTable({
        startY: 35,
        head: [['ID', 'Nome', 'CPF/Login', 'Função', 'Unidade', 'Status']],
        body: rows,
        theme: 'grid',
        styles: { fontSize: 8, valign: 'middle' }, // Fonte ajustada
        headStyles: { fillColor: [0, 51, 153], halign: 'center' },
        // [REDISTRIBUIÇÃO DE LARGURA - TOTAL ~190mm]
        columnStyles: {
            0: { cellWidth: 12, halign: 'center' }, // ID (Reduzido para 12)
            1: { cellWidth: 60 },                   // Nome (Aumentado para garantir espaço)
            2: { cellWidth: 32, halign: 'center' }, // CPF
            3: { cellWidth: 40, halign: 'center' }, // Função (Aumentado para não quebrar linha)
            4: { cellWidth: 25, halign: 'center' }, // Unidade (Alocação é curta: GUR, RVE...)
            5: { cellWidth: 18, halign: 'center' }  // Status (Reduzido)
        }
    });

    const totalPages = doc.internal.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        doc.setFontSize(7).setTextColor(150).text(`Página ${i} de ${totalPages}`, 185, 288);
    }

    doc.setFontSize(9).setFont(undefined, 'bold').setTextColor(0, 51, 153);
    doc.text(`Total de Registros: ${rows.length}`, 14, doc.lastAutoTable.finalY + 10);

    const url = URL.createObjectURL(doc.output('blob'));
    document.getElementById('iframe-pdf-usuarios').src = url;
    document.getElementById('modal-preview-usuarios').classList.add('active');
};