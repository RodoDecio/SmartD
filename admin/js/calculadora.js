let veiculosCalculadoraCache = [];
let itensRateio = [];
let isTotalManual = false; // Flag para controlar a trava do limite

async function inicializarCalculadora() {
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Calculadora de Rateio';

    const unidadeAtual = document.getElementById('sel-unidade')?.value || "TODAS";
    
    const selUnidadeGlobal = document.getElementById('sel-unidade');
    if (selUnidadeGlobal) {
        selUnidadeGlobal.removeEventListener('change', eventoMudarUnidadeCalculadora);
        selUnidadeGlobal.addEventListener('change', eventoMudarUnidadeCalculadora);
    }

    // Ouve o Enter globalmente para abrir o modal na tela principal
    document.addEventListener('keydown', handleGlobalEnterCalculadora);

    await carregarPlacasCalculadora(unidadeAtual);
    renderizarTabelaRateio();
}

function eventoMudarUnidadeCalculadora(e) {
    carregarPlacasCalculadora(e.target.value);
}

function limparCalculadora() {
    itensRateio = [];
    isTotalManual = false;
    document.getElementById('calc-total-nota').value = '';
    renderizarTabelaRateio();
    document.getElementById('calc-total-nota').focus();
}

// Lógica de Trava
function aoMudarTotalManual() {
    const val = document.getElementById('calc-total-nota').value;
    isTotalManual = (val !== ''); // Se o campo não estiver vazio, o total é restrito/manual
    recalcularTudoPorTotal();
}

async function carregarPlacasCalculadora(unidadeId) {
    const selPlaca = document.getElementById('calc-placa');
    if (!selPlaca) return;

    selPlaca.innerHTML = '<option value="">Buscando placas...</option>';

    try {
        let query = clienteSupabase.from('veiculos').select('placa, unidade_id').eq('ativo', true).order('placa');
        if (unidadeId && unidadeId !== 'TODAS') {
            query = query.eq('unidade_id', unidadeId);
        }
        const { data, error } = await query;
        if (error) throw error;

        veiculosCalculadoraCache = data || [];
        selPlaca.innerHTML = '<option value="">Selecione a Placa...</option>';
        veiculosCalculadoraCache.forEach(v => {
            selPlaca.innerHTML += `<option value="${v.placa}">${v.placa}</option>`;
        });
    } catch (e) {
        console.error("Erro ao carregar placas:", e);
        selPlaca.innerHTML = '<option value="">Erro ao carregar</option>';
    }
}

// =============================================================================
// GESTÃO DO MODAL E ATALHOS
// =============================================================================

function abrirModalCalculadoraAdd() {
    document.getElementById('calc-placa').value = '';
    document.getElementById('calc-valor').value = '';
    document.getElementById('calc-percentual').value = '';
    
    atualizarValorRestanteModal(); // <--- Chamada nova aqui
    
    document.getElementById('modal-calc-add').classList.add('active');
    setTimeout(() => document.getElementById('calc-placa').focus(), 100);
}

function fecharModalCalculadoraAdd() {
    document.getElementById('modal-calc-add').classList.remove('active');
}

// Atalho global para abrir o modal
function handleGlobalEnterCalculadora(event) {
    // Se não estivermos na tela da calculadora, remove o evento para não causar bugs
    if (!document.getElementById('calc-total-nota')) {
        document.removeEventListener('keydown', handleGlobalEnterCalculadora);
        return;
    }

    const modalAdd = document.getElementById('modal-calc-add');
    const isModalOpen = modalAdd && modalAdd.classList.contains('active');

    // Se estiver na tela principal (modal fechado) e não estiver interagindo com tabela ou botão
    if (event.key === 'Enter' && !isModalOpen) {
        const tag = document.activeElement.tagName;
        if (tag !== 'BUTTON' && tag !== 'INPUT') {
            event.preventDefault();
            abrirModalCalculadoraAdd();
        } else if (document.activeElement.id === 'calc-total-nota') {
            event.preventDefault();
            abrirModalCalculadoraAdd();
        }
    }
}

// Atalho dentro do Modal
function verificarAtalhoCalculadoraModal(event, acao) {
    if (event.key === 'Enter') {
        event.preventDefault();
        if (acao === 'calc-valor') {
            document.getElementById('calc-valor').focus();
        } else if (acao === 'enter') {
            adicionarItemRateio();
        }
    }
}

// =============================================================================
// REATIVIDADE E TRAVAS DE INSERÇÃO
// =============================================================================

function calcularPercentualDoInputAdd() {
    const totalNota = parseFloat(document.getElementById('calc-total-nota').value) || 0;
    const inputValor = document.getElementById('calc-valor');
    const inputPct = document.getElementById('calc-percentual');

    let valor = parseFloat(inputValor.value) || 0;

    // A trava só funciona se o Total foi setado manualmente
    if (isTotalManual && totalNota > 0 && valor > totalNota) {
        mostrarToast("O valor do item não pode ultrapassar o Total estipulado.", "warning");
        valor = totalNota; 
        inputValor.value = valor.toFixed(2);
    }
    
    // Se o total for fixo, atualiza a porcentagem enquanto digita
    if (isTotalManual && totalNota > 0 && valor > 0) {
        const pct = (valor / totalNota) * 100;
        inputPct.value = pct.toFixed(2);
    } else {
        inputPct.value = '';
    }
}

function calcularValorDoInputAdd() {
    const totalNota = parseFloat(document.getElementById('calc-total-nota').value) || 0;
    const inputValor = document.getElementById('calc-valor');
    const inputPct = document.getElementById('calc-percentual');

    let pct = parseFloat(inputPct.value) || 0;

    if (isTotalManual && totalNota > 0 && pct > 100) {
        mostrarToast("O percentual não pode ultrapassar 100%.", "warning");
        pct = 100;
        inputPct.value = pct.toFixed(2);
    }
    
    if (isTotalManual && totalNota > 0 && pct > 0) {
        const valor = totalNota * (pct / 100);
        inputValor.value = valor.toFixed(2);
    } else {
        inputValor.value = '';
    }
}

// =============================================================================
// LÓGICA CENTRAL DO RATEIO
// =============================================================================

function adicionarItemRateio() {
    const placa = document.getElementById('calc-placa').value;
    let valor = parseFloat(document.getElementById('calc-valor').value) || 0;

    if (!placa) {
        mostrarToast("Selecione uma placa.", "warning");
        document.getElementById('calc-placa').focus();
        return;
    }
    if (valor <= 0) {
        mostrarToast("Informe um valor maior que zero.", "warning");
        document.getElementById('calc-valor').focus();
        return;
    }

    let totalNota = parseFloat(document.getElementById('calc-total-nota').value) || 0;

    // Trava no momento de adicionar se o Total for manual
    if (isTotalManual && totalNota > 0 && valor > totalNota) {
        mostrarToast("O valor do item excede o Total da Nota.", "warning");
        return;
    }

    // Localiza ou adiciona
    const indexExistente = itensRateio.findIndex(i => i.placa === placa);
    if (indexExistente >= 0) {
        itensRateio[indexExistente].valor += valor;
        mostrarToast(`Valor somado à placa ${placa}.`, "info");
    } else {
        itensRateio.push({ placa: placa, valor: valor, percentual: 0 });
    }

    // Se o total não é manual (somatória livre), atualiza o campo de Total com a soma de tudo
    if (!isTotalManual) {
        const somaNova = itensRateio.reduce((acc, item) => acc + item.valor, 0);
        document.getElementById('calc-total-nota').value = somaNova.toFixed(2);
    }

    recalcularTudoPorTotal();
    fecharModalCalculadoraAdd();
}

function recalcularTudoPorTotal() {
    const totalNota = parseFloat(document.getElementById('calc-total-nota').value) || 0;
    
    itensRateio.forEach(item => {
        if (totalNota > 0) {
            item.percentual = (item.valor / totalNota) * 100;
        } else {
            item.percentual = 0;
        }
    });

    renderizarTabelaRateio();
}

function atualizarLinhaPorValor(index, inputObj) {
    const totalNota = parseFloat(document.getElementById('calc-total-nota').value) || 0;
    let novoValor = parseFloat(inputObj.value) || 0;

    // Se é manual, trava. Se for livre, permite alterar e atualiza o total no final
    if (isTotalManual && totalNota > 0 && novoValor > totalNota) {
        mostrarToast("O valor não pode ultrapassar o Total da Nota.", "warning");
        novoValor = totalNota;
        inputObj.value = novoValor.toFixed(2);
    }
    
    itensRateio[index].valor = novoValor;
    
    if (!isTotalManual) {
        const somaNova = itensRateio.reduce((acc, item) => acc + item.valor, 0);
        document.getElementById('calc-total-nota').value = somaNova.toFixed(2);
    }

    recalcularTudoPorTotal();
}

function atualizarLinhaPorPercentual(index, inputObj) {
    const totalNota = parseFloat(document.getElementById('calc-total-nota').value) || 0;
    let novoPct = parseFloat(inputObj.value) || 0;
    
    if (totalNota > 0 && novoPct > 100) {
        mostrarToast("O percentual não pode ultrapassar 100%.", "warning");
        novoPct = 100;
        inputObj.value = novoPct.toFixed(2);
    }

    itensRateio[index].percentual = novoPct;
    
    if (totalNota > 0) {
        itensRateio[index].valor = totalNota * (novoPct / 100);
        
        if (!isTotalManual) {
            const somaNova = itensRateio.reduce((acc, item) => acc + item.valor, 0);
            document.getElementById('calc-total-nota').value = somaNova.toFixed(2);
        }
    }
    
    recalcularTudoPorTotal();
}

function removerItemRateio(index) {
    itensRateio.splice(index, 1);
    
    if (!isTotalManual) {
        const somaNova = itensRateio.reduce((acc, item) => acc + item.valor, 0);
        document.getElementById('calc-total-nota').value = somaNova > 0 ? somaNova.toFixed(2) : '';
    }

    recalcularTudoPorTotal();
}

function atalhoTabela(event, index) {
    if (event.key === '-' || event.key === 'Backspace') {
        if (event.target.value === '') {
            event.preventDefault();
            removerItemRateio(index);
            mostrarToast("Registro excluído.", "info");
        }
    }
}

// =============================================================================
// COPY AREA
// =============================================================================
async function copiarRateioParaAreaTransferencia() {
    if (itensRateio.length === 0) {
        mostrarToast("Não há itens para copiar.", "warning");
        return;
    }

    const totalNota = parseFloat(document.getElementById('calc-total-nota').value) || 0;
    
    let texto = `📊 *RATEIO DE DESPESAS*\n`;
    texto += `💰 *Valor Total da Nota:* R$ ${totalNota.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n\n`;
    texto += `🚚 *Distribuição por Veículo:*\n`;

    let somaValores = 0;
    let somaPct = 0;

    itensRateio.forEach(item => {
        somaValores += item.valor;
        somaPct += item.percentual;
        texto += `🔹 *${item.placa}:* R$ ${item.valor.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${item.percentual.toFixed(2)}%)\n`;
    });

    const diferenca = totalNota - somaValores;
    texto += `\n⚖️ *Soma Aplicada:* R$ ${somaValores.toLocaleString('pt-BR', {minimumFractionDigits: 2})} (${somaPct.toFixed(2)}%)\n`;
    
    if (totalNota > 0 && Math.abs(diferenca) > 0.01) {
        texto += `⚠ *Diferença:* R$ ${diferenca.toLocaleString('pt-BR', {minimumFractionDigits: 2})}\n`;
    }

    try {
        await navigator.clipboard.writeText(texto);
        mostrarToast("Rateio copiado! Cole (Ctrl+V) onde desejar.", "success");
    } catch (err) {
        mostrarToast("Erro ao copiar.", "error");
    }
}

// =============================================================================
// RENDERIZAÇÃO
// =============================================================================

function renderizarTabelaRateio() {
    const tbody = document.getElementById('tbody-calculadora');
    const totalNota = parseFloat(document.getElementById('calc-total-nota').value) || 0;
    
    if (!tbody) return;
    tbody.innerHTML = '';

    let somaValores = 0;
    let somaPercentuais = 0;

    if (itensRateio.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; padding: 60px 20px; color: #999; vertical-align: middle;">
                    <div style="display: flex; flex-direction: column; justify-content: center; align-items: center;">
                        <i class="fas fa-box-open fa-2x mb-2" style="opacity: 0.3;"></i>
                        <span>Nenhum veículo adicionado.</span>
                    </div>
                </td>
            </tr>`;
    }

    itensRateio.forEach((item, index) => {
        somaValores += item.valor;
        somaPercentuais += item.percentual;

        const tr = document.createElement('tr');
        tr.style.transition = "background-color 0.2s";
        tr.onmouseover = () => tr.style.backgroundColor = "#f8f9fa";
        tr.onmouseout = () => tr.style.backgroundColor = "transparent";

        tr.innerHTML = `
            <td style="padding: 6px 15px; vertical-align: middle;">
                <span class="badge" style="background: var(--cor-primaria); color: white; font-size: 0.9rem; padding: 5px 10px; letter-spacing: 1px;">${item.placa}</span>
            </td>
            <td style="padding: 6px 15px; vertical-align: middle;">
                <div style="display: flex; align-items: center; border: 1px solid #ccc; border-radius: 4px; overflow: hidden;">
                    <span style="background: #eee; padding: 5px 10px; color: #666; font-weight: bold; border-right: 1px solid #ccc; font-size: 0.9rem;">R$</span>
                    <input type="number" step="0.01" class="form-control" style="border: none; font-weight: bold; text-align: right; box-shadow: none; border-radius: 0; height: 30px; font-size: 0.95rem; padding: 0 8px;" value="${item.valor.toFixed(2)}" onchange="atualizarLinhaPorValor(${index}, this)" onkeyup="atalhoTabela(event, ${index})">
                </div>
            </td>
            <td style="padding: 6px 15px; vertical-align: middle;">
                <div style="display: flex; align-items: center; border: 1px solid #ccc; border-radius: 4px; overflow: hidden;">
                    <input type="number" step="0.01" class="form-control" style="border: none; font-weight: bold; text-align: right; box-shadow: none; border-radius: 0; height: 30px; font-size: 0.95rem; padding: 0 8px;" value="${item.percentual.toFixed(2)}" onchange="atualizarLinhaPorPercentual(${index}, this)" onkeyup="atalhoTabela(event, ${index})">
                    <span style="background: #eee; padding: 5px 10px; color: #666; font-weight: bold; border-left: 1px solid #ccc; font-size: 0.9rem;">%</span>
                </div>
            </td>
            <td style="padding: 6px 15px; vertical-align: middle; text-align: center;">
                <button onclick="removerItemRateio(${index})" class="btn-trash" style="color: #dc3545; background: none; border: none; font-size: 1.1rem; cursor: pointer; transition: 0.2s;" title="Remover (-)"><i class="fas fa-trash-alt"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });

    document.getElementById('calc-soma-valores').innerText = somaValores.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    document.getElementById('calc-soma-percentuais').innerText = somaPercentuais.toFixed(2) + '%';

    const diferenca = totalNota - somaValores;
    const divDiferenca = document.getElementById('calc-diferenca');
    
    divDiferenca.innerText = diferenca.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
    
    if (diferenca >= -0.01 && diferenca <= 0.01 && totalNota > 0) {
        divDiferenca.style.color = '#28a745'; 
    } else if (diferenca < 0) {
        divDiferenca.style.color = '#dc3545'; 
    } else {
        divDiferenca.style.color = '#ffc107'; 
    }
}

// =============================================================================
// GESTÃO DO MODAL E ATALHOS
// =============================================================================

function atualizarValorRestanteModal() {
    const totalNota = parseFloat(document.getElementById('calc-total-nota').value) || 0;
    const somaValores = itensRateio.reduce((acc, item) => acc + item.valor, 0);
    const diferenca = totalNota - somaValores;
    
    const divRestante = document.getElementById('modal-valor-restante');
    if (divRestante) {
        if (!isTotalManual || totalNota === 0) {
            divRestante.innerText = "Livre (Soma Auto)";
            divRestante.style.color = '#666';
        } else {
            divRestante.innerText = diferenca.toLocaleString('pt-BR', {style: 'currency', currency: 'BRL'});
            if (diferenca > 0) {
                divRestante.style.color = '#28a745'; // Verde
            } else if (diferenca < 0) {
                divRestante.style.color = '#dc3545'; // Vermelho
            } else {
                divRestante.style.color = '#555'; // Exato (Zero)
            }
        }
    }
}