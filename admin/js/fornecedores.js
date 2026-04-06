let listaFornecedoresTelaGlobal = [];
let contatosGlobaisForn = [];
let fornecedorSujo = false;
let dadosOriginaisForn = null;
let isReadonlyFornGlobal = false;

const arvoreSistemasForn = {
    "Motor": [], "Transmissão": [], "Freios": [], "Suspensão": [], 
    "Direção": [], "Elétrica": [], "Rodas": [], "Cabine/Carroceria": [], 
    "Filtros e Fluidos": [], "Outros": []
};

window.inicializarFornecedores = async function() {
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Fornecedores e Oficinas';

    const container = document.getElementById('container-filtros-forn-tela');
    if (container) {
        container.innerHTML = '';
        window.adicionarFiltroFornTela();
    }

    const form = document.getElementById('form-fornecedor');
    if(form) {
        form.addEventListener('input', () => fornecedorSujo = true);
        form.addEventListener('change', () => fornecedorSujo = true);
    }

    await window.listarFornecedores();
}

window.listarFornecedores = async function() {
    const loading = document.getElementById('loading-fornecedores');
    if(loading) loading.style.display = 'flex';

    try {
        const { data, error } = await clienteSupabase.from('manutencao_fornecedores').select('*').order('nome');
        if (error) throw error;
        listaFornecedoresTelaGlobal = data || [];
        window.aplicarFiltrosFornTela();
    } catch (e) {
        mostrarToast("Erro ao carregar fornecedores.", "error");
    } finally {
        if(loading) loading.style.display = 'none';
    }
}

window.renderizarTabelaFornecedores = function(lista) {
    const tbody = document.getElementById('tbody-fornecedores');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    document.getElementById('lbl-contagem-forn').innerText = `Exibindo ${lista.length} registro(s)`;

    if (lista.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-muted">Nenhum fornecedor encontrado.</td></tr>';
        return;
    }

    lista.forEach(f => {
        let badgeTipo = '';
        if(f.tipo_fornecimento === 'Peças') badgeTipo = '<span class="badge" style="background:#6c757d; color:white;">Peças</span>';
        else if(f.tipo_fornecimento === 'Serviços') badgeTipo = '<span class="badge" style="background:#17a2b8; color:white;">Serviços</span>';
        else badgeTipo = '<span class="badge" style="background:#003399; color:white;">Ambos</span>';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="vertical-align:middle; white-space: nowrap;">
                <div style="font-weight: bold; color: var(--cor-primaria);">${f.nome}</div>
                ${f.razao_social ? `<div style="font-size: 0.75rem; color: #888; max-width: 250px; overflow: hidden; text-overflow: ellipsis;" title="${f.razao_social}">${f.razao_social}</div>` : ''}
            </td>
            <td style="font-size: 0.85rem; vertical-align:middle; white-space: nowrap;">${f.cnpj || '-'}</td>
            <td style="vertical-align:middle; white-space: nowrap;">${badgeTipo}</td>
            <td style="font-size: 0.85rem; vertical-align:middle; white-space: nowrap;">${f.cidade || '-'}/${f.uf || '-'}</td>
            <td style="font-size: 0.8rem; color: #666; max-width: 250px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; vertical-align:middle;" title="${f.sistemas_atendidos || 'Todos'}">${f.sistemas_atendidos || 'Todos'}</td>
            <td style="text-align: center; white-space: nowrap; vertical-align:middle;">
                <button class="btn-icon-action icon-view" onclick="window.abrirModalFornecedorTela('${f.id}', true)" title="Visualizar"><i class="fas fa-eye"></i></button>
                <button class="btn-icon-action icon-hist" onclick="abrirModalLogsGlobal('manutencao_fornecedores', '${f.id}', 'Histórico do Fornecedor')" title="Histórico"><i class="fas fa-history"></i></button>
                <button class="btn-icon-action icon-edit" onclick="window.abrirModalFornecedorTela('${f.id}')" title="Editar"><i class="fas fa-edit"></i></button>
                <button class="btn-icon-action icon-del" onclick="window.confirmarExclusaoForn('${f.id}')" title="Excluir"><i class="fas fa-trash"></i></button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// FILTROS
window.adicionarFiltroFornTela = function() {
    const container = document.getElementById('container-filtros-forn-tela');
    const id = Date.now();
    const div = document.createElement('div');
    div.className = 'filter-row-forn';
    div.id = `filter-f-${id}`;
    div.style.cssText = 'display: flex; gap: 10px; align-items: center; margin-bottom: 8px;';

    div.innerHTML = `
        <select class="form-control" style="width: 160px;" onchange="window.configurarInputFiltroFornTela(this, ${id})">
            <option value="">Filtrar por...</option>
            <option value="nome">Nome/Razão</option>
            <option value="cnpj">CPF/CNPJ</option>
            <option value="tipo">Tipo (Peça/Serviço)</option>
            <option value="sistema">Sistema Atendido</option>
        </select>
        <div id="wrapper-f-${id}" style="width: 260px; display: flex;">
            <input type="text" class="form-control input-filtro-forn" disabled placeholder="Selecione..." style="width: 100%;">
        </div>
        <button onclick="window.removerFiltroFornTela(${id})" style="border:none; background:none; color:#dc3545; cursor:pointer; padding: 0 5px;"><i class="fas fa-times"></i></button>
    `;
    container.appendChild(div);
}

window.removerFiltroFornTela = function(id) {
    document.getElementById(`filter-f-${id}`)?.remove();
    window.aplicarFiltrosFornTela();
}

window.configurarInputFiltroFornTela = function(sel, id) {
    const wrapper = document.getElementById(`wrapper-f-${id}`);
    const tipo = sel.value;
    wrapper.innerHTML = '';
    
    if (tipo === 'sistema') {
        const select = document.createElement('select');
        select.className = 'form-control input-filtro-forn';
        select.style.width = '100%';
        select.innerHTML = '<option value="">Todos</option>';
        Object.keys(arvoreSistemasForn).sort().forEach(s => select.innerHTML += `<option value="${s}">${s}</option>`);
        select.onchange = window.aplicarFiltrosFornTela;
        wrapper.appendChild(select);
    } else if (tipo === 'tipo') {
        const select = document.createElement('select');
        select.className = 'form-control input-filtro-forn';
        select.style.width = '100%';
        select.innerHTML = '<option value="">Todos</option><option value="Ambos">Ambos</option><option value="Peças">Peças</option><option value="Serviços">Serviços</option>';
        select.onchange = window.aplicarFiltrosFornTela;
        wrapper.appendChild(select);
    } else {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.className = 'form-control input-filtro-forn';
        inp.style.width = '100%';
        inp.placeholder = tipo === 'cnpj' ? 'Digite CNPJ/CPF...' : 'Digite nome...';
        if (tipo === 'cnpj') inp.oninput = function() { window.mascaraCpfCnpjForn(this); };
        inp.onkeyup = window.aplicarFiltrosFornTela;
        wrapper.appendChild(inp);
    }
    window.aplicarFiltrosFornTela();
}

window.aplicarFiltrosFornTela = function() {
    const container = document.getElementById('container-filtros-forn-tela');
    let dados = [...listaFornecedoresTelaGlobal];
    let descricoes = [];

    if (container) {
        container.querySelectorAll('.filter-row-forn').forEach(linha => {
            const tipo = linha.querySelector('select').value;
            const input = linha.querySelector('.input-filtro-forn');
            if (!tipo || !input || !input.value) return;

            const valor = input.value.toLowerCase();
            const labelTipo = linha.querySelector('select').options[linha.querySelector('select').selectedIndex].text;
            
            let valorDisplay = valor;
            if (input.tagName === 'SELECT') valorDisplay = input.options[input.selectedIndex].text;
            
            if (valor === 'todos' || valor === '') return;
            descricoes.push(`<b>${labelTipo}:</b> ${valorDisplay}`);

            dados = dados.filter(f => {
                if (tipo === 'nome') return (f.nome || '').toLowerCase().includes(valor) || (f.razao_social || '').toLowerCase().includes(valor);
                if (tipo === 'cnpj') return (f.cnpj || '').includes(valor);
                if (tipo === 'sistema') return (f.sistemas_atendidos || '').toLowerCase().includes(valor);
                if (tipo === 'tipo') return (f.tipo_fornecimento || '').toLowerCase().includes(valor);
                return true;
            });
        });
    }

    const lbl = document.getElementById('lbl-filtros-ativos-forn');
    if (lbl) {
        lbl.innerHTML = descricoes.length > 0 ? `<i class="fas fa-filter" style="color:#003399;"></i> ${descricoes.join(' | ')}` : '<i>Todos os registros</i>';
    }
    window.renderizarTabelaFornecedores(dados);
}

// MODAL AÇÕES E MÁSCARAS
window.alternarAbaForn = function(aba) {
    ['geral', 'end', 'contatos'].forEach(a => {
        document.getElementById(`content-forn-${a}`).style.display = 'none';
        const btn = document.getElementById(`tab-forn-${a}`);
        btn.style.borderBottomColor = 'transparent';
        btn.style.color = '#666';
        btn.style.fontWeight = 'normal';
    });

    document.getElementById(`content-forn-${aba}`).style.display = 'block';
    const btnAtivo = document.getElementById(`tab-forn-${aba}`);
    btnAtivo.style.borderBottomColor = 'var(--cor-primaria)';
    btnAtivo.style.color = 'var(--cor-primaria)';
    btnAtivo.style.fontWeight = 'bold';
}

window.abrirModalFornecedorTela = function(id = null, readonly = false) {
    const form = document.getElementById('form-fornecedor');
    form.reset();
    fornecedorSujo = false;
    dadosOriginaisForn = null;
    contatosGlobaisForn = [];
    isReadonlyFornGlobal = readonly;

    document.getElementById('forn-tela-id').value = id || '';
    document.getElementById('titulo-modal-forn').innerText = id ? (readonly ? 'Visualizar Fornecedor' : 'Editar Fornecedor') : 'Novo Fornecedor';
    
    window.alternarAbaForn('geral');

    const contSis = document.getElementById('container-check-sistemas-tela');
    contSis.innerHTML = '';
    Object.keys(arvoreSistemasForn).sort().forEach(sis => {
        contSis.innerHTML += `<label style="font-size:0.85rem; cursor:pointer;"><input type="checkbox" value="${sis}" class="chk-sis-tela"> ${sis}</label>`;
    });

    form.querySelectorAll('input, select, textarea, button').forEach(el => el.disabled = false);

    if (id) {
        const f = listaFornecedoresTelaGlobal.find(x => x.id === id);
        if (f) {
            document.getElementById('forn-tela-nome').value = f.nome || '';
            document.getElementById('forn-tela-razao').value = f.razao_social || '';
            document.getElementById('forn-tela-cnpj').value = f.cnpj || '';
            document.getElementById('forn-tela-tipo').value = f.tipo_fornecimento || 'Ambos';
            
            document.getElementById('forn-tela-cep').value = f.cep || '';
            document.getElementById('forn-tela-end').value = f.endereco || '';
            document.getElementById('forn-tela-num').value = f.numero || '';
            document.getElementById('forn-tela-bairro').value = f.bairro || '';
            document.getElementById('forn-tela-cidade').value = f.cidade || '';
            document.getElementById('forn-tela-uf').value = f.uf || '';
            document.getElementById('forn-tela-lat').value = f.latitude || '';
            document.getElementById('forn-tela-lng').value = f.longitude || '';
            
            if (f.sistemas_atendidos) {
                const sisArr = f.sistemas_atendidos.split(',').map(s => s.trim());
                document.querySelectorAll('.chk-sis-tela').forEach(chk => {
                    if (sisArr.includes(chk.value)) chk.checked = true;
                });
            }

            if (f.contatos_json && Array.isArray(f.contatos_json) && f.contatos_json.length > 0) {
                contatosGlobaisForn = JSON.parse(JSON.stringify(f.contatos_json));
            } else if (f.telefone) {
                contatosGlobaisForn.push({ nome: 'Principal', telefone: f.telefone, email: '' });
            }
        }
    } else {
        contatosGlobaisForn.push({ nome: '', telefone: '', email: '' });
    }

    window.renderizarListaContatos();

    const btnCep = document.getElementById('btn-cep-forn');
    const btnGeo = document.getElementById('btn-geo-forn');

    if (readonly) {
        form.querySelectorAll('input, select, textarea').forEach(el => el.disabled = true);
        document.getElementById('btn-salvar-forn-tela').style.display = 'none';
        document.getElementById('btn-novo-contato').style.display = 'none';
        document.querySelector('.btn-cancel').disabled = false; 
        
        if(btnCep) {
            btnCep.disabled = false;
            btnCep.innerHTML = '<i class="fas fa-copy"></i>';
            btnCep.title = "Copiar Endereço Completo";
            btnCep.classList.replace('btn-primary', 'btn-cancel');
        }
        if(btnGeo) {
            btnGeo.disabled = false;
            btnGeo.innerHTML = '<i class="fas fa-copy"></i>';
            btnGeo.title = "Copiar Coordenadas GPS";
            btnGeo.classList.replace('btn-cancel', 'btn-primary');
        }
    } else {
        document.getElementById('btn-salvar-forn-tela').style.display = 'block';
        document.getElementById('btn-novo-contato').style.display = 'inline-block';
        
        if(btnCep) {
            btnCep.innerHTML = '<i class="fas fa-search"></i>';
            btnCep.title = "Buscar Endereço";
            btnCep.classList.replace('btn-cancel', 'btn-primary');
        }
        if(btnGeo) {
            btnGeo.innerHTML = '<i class="fas fa-map-marker-alt" style="color: #dc3545;"></i>';
            btnGeo.title = "Capturar minha localização";
            btnGeo.classList.replace('btn-primary', 'btn-cancel');
        }

        setTimeout(() => { dadosOriginaisForn = JSON.stringify(window.getPayloadForn()); }, 100);
    }

    document.getElementById('modal-fornecedor-tela').classList.add('active');
}

window.acaoBotaoCep = function() {
    if (isReadonlyFornGlobal) {
        const end = document.getElementById('forn-tela-end').value || '';
        const num = document.getElementById('forn-tela-num').value || 'S/N';
        const bairro = document.getElementById('forn-tela-bairro').value || '';
        const cidade = document.getElementById('forn-tela-cidade').value || '';
        const uf = document.getElementById('forn-tela-uf').value || '';
        const cep = document.getElementById('forn-tela-cep').value || '';
        
        const textoCopiar = `${end}, ${num} - ${bairro}, ${cidade}/${uf} - CEP: ${cep}`.replace(/^[,\s]+|[,\s]+$/g, '');
        if(textoCopiar.length > 10) {
            navigator.clipboard.writeText(textoCopiar);
            mostrarToast("Endereço copiado!", "success");
        } else {
            mostrarToast("Endereço incompleto.", "warning");
        }
    } else {
        window.buscarCEPForn();
    }
}

window.acaoBotaoGeo = function() {
    if (isReadonlyFornGlobal) {
        const lat = document.getElementById('forn-tela-lat').value || '';
        const lng = document.getElementById('forn-tela-lng').value || '';
        if (lat && lng) {
            navigator.clipboard.writeText(`${lat}, ${lng}`);
            mostrarToast("Coordenadas copiadas!", "success");
        } else {
            mostrarToast("Nenhuma coordenada registrada.", "warning");
        }
    } else {
        window.capturarLocalizacaoForn();
    }
}

window.fecharModalFornecedorTela = function(forcar = false) {
    if (!forcar && fornecedorSujo) {
        window.solicitarConfirmacao(() => { window.executarFechamentoForn(); });
        return;
    }
    window.executarFechamentoForn();
}

window.executarFechamentoForn = function() {
    fornecedorSujo = false;
    dadosOriginaisForn = null;
    document.getElementById('modal-fornecedor-tela').classList.remove('active');
}

// LISTA DE CONTATOS
window.adicionarLinhaContato = function() {
    contatosGlobaisForn.push({ nome: '', telefone: '', email: '' });
    fornecedorSujo = true;
    window.renderizarListaContatos();
}

window.removerContato = function(index) {
    contatosGlobaisForn.splice(index, 1);
    fornecedorSujo = true;
    window.renderizarListaContatos();
}

window.atualizarContato = function(index, campo, valor) {
    contatosGlobaisForn[index][campo] = valor;
    fornecedorSujo = true;
}

window.renderizarListaContatos = function() {
    const tbody = document.getElementById('tbody-contatos-forn');
    tbody.innerHTML = '';

    if (contatosGlobaisForn.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center p-3 text-muted">Nenhum contato adicionado.</td></tr>';
        return;
    }

    contatosGlobaisForn.forEach((c, index) => {
        const btnLixeira = isReadonlyFornGlobal ? '' : `<button type="button" class="btn-icon-action icon-del" onclick="window.removerContato(${index})" title="Remover"><i class="fas fa-trash"></i></button>`;
        const disableAttr = isReadonlyFornGlobal ? 'disabled' : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" class="form-control" style="height: 38px; font-size: 0.8rem;" value="${c.nome || ''}" onchange="window.atualizarContato(${index}, 'nome', this.value)" placeholder="Nome / Setor" ${disableAttr}></td>
            <td><input type="text" class="form-control" style="height: 38px; font-size: 0.8rem;" value="${c.telefone || ''}" oninput="window.mascaraTelefoneForn(this); window.atualizarContato(${index}, 'telefone', this.value)" placeholder="(00) 00000-0000" ${disableAttr}></td>
            <td><input type="email" class="form-control" style="height: 38px; font-size: 0.8rem;" value="${c.email || ''}" onchange="window.atualizarContato(${index}, 'email', this.value)" placeholder="exemplo@email.com" ${disableAttr}></td>
            <td style="text-align: center; vertical-align: middle;">${btnLixeira}</td>
        `;
        tbody.appendChild(tr);
    });
}

// SALVAMENTO E EXCLUSÃO
window.getPayloadForn = function() {
    const chks = document.querySelectorAll('.chk-sis-tela:checked');
    const contatosLimpos = contatosGlobaisForn.filter(c => c.nome.trim() !== '' || c.telefone.trim() !== '' || c.email.trim() !== '');

    return {
        nome: document.getElementById('forn-tela-nome').value.trim(),
        razao_social: document.getElementById('forn-tela-razao').value.trim(),
        cnpj: document.getElementById('forn-tela-cnpj').value.trim(),
        tipo_fornecimento: document.getElementById('forn-tela-tipo').value,
        cep: document.getElementById('forn-tela-cep').value.trim(),
        endereco: document.getElementById('forn-tela-end').value.trim(),
        numero: document.getElementById('forn-tela-num').value.trim(),
        bairro: document.getElementById('forn-tela-bairro').value.trim(),
        cidade: document.getElementById('forn-tela-cidade').value.trim(),
        uf: document.getElementById('forn-tela-uf').value.trim(),
        latitude: document.getElementById('forn-tela-lat').value.trim(),
        longitude: document.getElementById('forn-tela-lng').value.trim(),
        sistemas_atendidos: Array.from(chks).map(c => c.value).join(', '),
        contatos_json: contatosLimpos
    };
}

window.salvarFornecedorTela = async function(e) {
    e.preventDefault();
    const id = document.getElementById('forn-tela-id').value;
    const payload = window.getPayloadForn();

    if (id && dadosOriginaisForn) {
        if (JSON.stringify(payload) === dadosOriginaisForn) {
            mostrarToast("Nenhuma alteração detectada.", "info");
            return;
        }
    }

    const btn = document.getElementById('btn-salvar-forn-tela');
    const txtOriginal = btn.innerText;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
    btn.disabled = true;

    try {
        if (payload.cnpj) {
            let queryCnpj = clienteSupabase.from('manutencao_fornecedores').select('id').eq('cnpj', payload.cnpj);
            if (id) queryCnpj = queryCnpj.neq('id', id);
            const { data: existente } = await queryCnpj;
            if (existente && existente.length > 0) {
                mostrarToast("Este CNPJ/CPF já está cadastrado em outro fornecedor.", "warning");
                window.alternarAbaForn('geral');
                document.getElementById('forn-tela-cnpj').focus();
                btn.innerHTML = txtOriginal;
                btn.disabled = false;
                return;
            }
        }

        let acao = id ? 'UPDATE' : 'INSERT';
        let idReg = id;

        if (id) {
            const { error } = await clienteSupabase.from('manutencao_fornecedores').update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { data, error } = await clienteSupabase.from('manutencao_fornecedores').insert([payload]).select();
            if (error) throw error;
            idReg = data[0].id;
        }

        const { data: { user } } = await clienteSupabase.auth.getUser();
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'manutencao_fornecedores',
            id_registro_afetado: String(idReg),
            acao: acao,
            usuario_id: user.id,
            dados_antigos: id ? dadosOriginaisForn : JSON.stringify({ info: "Novo fornecedor" }),
            dados_novos: JSON.stringify(payload),
            data_hora: new Date().toISOString()
        });

        mostrarToast("Fornecedor salvo com sucesso!", "success");
        window.fecharModalFornecedorTela(true); 
        window.listarFornecedores();

    } catch (err) {
        mostrarToast("Erro ao salvar fornecedor.", "error");
    } finally {
        btn.innerHTML = txtOriginal;
        btn.disabled = false;
    }
};

window.confirmarExclusaoForn = function(id) {
    const f = listaFornecedoresTelaGlobal.find(x => String(x.id) === String(id));
    if(!f) return;
    document.getElementById('excluir-forn-id').value = id;
    document.getElementById('excluir-detalhe-nome').innerText = f.nome;
    document.getElementById('excluir-detalhe-cnpj').innerText = f.cnpj ? `CNPJ/CPF: ${f.cnpj}` : 'Sem documento registrado';
    document.getElementById('modal-confirmar-exclusao-forn').classList.add('active');
}

window.executarExclusaoDefinitivaForn = async function() {
    const id = document.getElementById('excluir-forn-id').value;
    // Busca o botão pela classe dentro do modal de exclusão
    const btn = document.querySelector('#modal-confirmar-exclusao-forn .btn-primary'); 
    
    if (!id) return;
    
    if (btn) {
        btn.innerText = 'Limpando...';
        btn.disabled = true;
    }

    try {
        const f = listaFornecedoresTelaGlobal.find(x => String(x.id) === String(id));
        const { error } = await clienteSupabase.from('manutencao_fornecedores').delete().eq('id', id);
        if (error) throw error;

        await clienteSupabase.from('logs_auditoria').delete().eq('tabela_afetada', 'manutencao_fornecedores').eq('id_registro_afetado', String(id));

        const { data: { user } } = await clienteSupabase.auth.getUser();
        await clienteSupabase.from('logs_auditoria').insert({
            tabela_afetada: 'manutencao_fornecedores',
            id_registro_afetado: String(id), 
            acao: 'DELETE',
            usuario_id: user.id,
            dados_antigos: JSON.stringify(f),
            dados_novos: JSON.stringify({ status: "Deletado" }),
            data_hora: new Date().toISOString()
        });

        mostrarToast("Fornecedor excluído permanentemente.", "success");
        document.getElementById('modal-confirmar-exclusao-forn').classList.remove('active');
        window.listarFornecedores();

    } catch (e) {
        mostrarToast("Erro ao excluir fornecedor. Verifique as dependências.", "error");
    } finally {
        if (btn) {
            btn.innerText = 'Sim, Excluir';
            btn.disabled = false;
        }
    }
}

window.mascaraCpfCnpjForn = function(i) {
    let v = i.value.replace(/\D/g,"");
    if (v.length <= 11) {
        v = v.replace(/(\d{3})(\d)/,"$1.$2"); v = v.replace(/(\d{3})(\d)/,"$1.$2"); v = v.replace(/(\d{3})(\d{1,2})$/,"$1-$2");
    } else {
        v = v.replace(/^(\d{2})(\d)/,"$1.$2"); v = v.replace(/^(\d{2})\.(\d{3})(\d)/,"$1.$2.$3");
        v = v.replace(/\.(\d{3})(\d)/,".$1/$2"); v = v.replace(/(\d{4})(\d)/,"$1-$2");
    }
    i.value = v;
}
window.mascaraTelefoneForn = function(i) {
    let v = i.value.replace(/\D/g,"");
    v = v.replace(/^(\d{2})(\d)/g,"($1) $2"); v = v.replace(/(\d)(\d{4})$/,"$1-$2");
    i.value = v;
}
window.mascaraCEPForn = function(i) {
    let v = i.value.replace(/\D/g,"");
    v = v.replace(/^(\d{5})(\d)/,"$1-$2");
    i.value = v;
}
window.buscarCEPForn = async function() {
    const i = document.getElementById('forn-tela-cep');
    let v = i.value.replace(/\D/g,"");
    if (v.length === 8) {
        try {
            mostrarToast("Buscando endereço...", "info");
            const resp = await fetch(`https://viacep.com.br/ws/${v}/json/`);
            const data = await resp.json();
            if (!data.erro) {
                document.getElementById('forn-tela-end').value = data.logradouro;
                document.getElementById('forn-tela-bairro').value = data.bairro;
                document.getElementById('forn-tela-cidade').value = data.localidade;
                document.getElementById('forn-tela-uf').value = data.uf;
                fornecedorSujo = true;
            } else { mostrarToast("CEP não encontrado.", "warning"); }
        } catch (e) { mostrarToast("Erro ao conectar na API de CEP.", "error"); }
    }
}
window.capturarLocalizacaoForn = function() {
    if (navigator.geolocation) {
        mostrarToast("Aguarde, capturando GPS...", "info");
        navigator.geolocation.getCurrentPosition((pos) => {
            document.getElementById('forn-tela-lat').value = pos.coords.latitude.toFixed(6);
            document.getElementById('forn-tela-lng').value = pos.coords.longitude.toFixed(6);
            fornecedorSujo = true;
            mostrarToast("Localização capturada!", "success");
        });
    }
}