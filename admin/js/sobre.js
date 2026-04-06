function inicializarSobre() {
    const titulo = document.getElementById('titulo-pagina');
    if (titulo) titulo.innerText = 'Sobre o Sistema';

    // Chama a função que exibe a versão e a data do último deploy
    carregarVersao();
    
    // Inicia sempre na aba principal (Aplicação)
    alternarAbaSobre('app');
}

// =====================================================================
// VERSÃO MANUAL COM DATA AUTOMÁTICA DE DEPLOY (PUSH)
// =====================================================================
function carregarVersao() {
    const infoText = document.getElementById('app-versao-info');
    if (!infoText) return;

    // 1. ALTERE A VERSÃO MANUALMENTE AQUI QUANDO DESEJAR (ex: "1.4.2", "1.5.0")
    const versaoManual = "1.6.0"; 

    // 2. DATA AUTOMÁTICA DO DEPLOY
    // O navegador lê a data em que o arquivo foi modificado no servidor pelo Vercel
    let dataFmt = "19/03/2026";
    let horaFmt = "19:22";

    try {
        const dataDeploy = new Date(document.lastModified);
        
        // Verifica se a data é válida e não é uma data "zerada" padrão do servidor
        if (!isNaN(dataDeploy.getTime()) && dataDeploy.getFullYear() > 2000) {
            dataFmt = dataDeploy.toLocaleDateString('pt-BR');
            horaFmt = dataDeploy.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        }
    } catch (e) {
        console.warn("Não foi possível capturar a data automática do servidor, usando data base.");
    }

    infoText.innerHTML = `Versão: <b style="color:var(--cor-primaria);">${versaoManual}</b> &bull; Atualizado em: <b>${dataFmt} às ${horaFmt}</b>`;
}

// =====================================================================
// CONTROLE DAS ABAS
// =====================================================================
window.alternarAbaSobre = function(aba) {
    const btnApp = document.getElementById('tab-btn-app');
    const btnDb = document.getElementById('tab-btn-db');
    const abaApp = document.getElementById('aba-sobre-app');
    const abaDb = document.getElementById('aba-sobre-db');

    if (!btnApp || !btnDb || !abaApp || !abaDb) return;

    if (aba === 'app') {
        btnApp.style.borderBottom = '3px solid var(--cor-primaria)';
        btnApp.style.color = 'var(--cor-primaria)';
        btnApp.style.fontWeight = 'bold';
        
        btnDb.style.borderBottom = '3px solid transparent';
        btnDb.style.color = '#666';
        btnDb.style.fontWeight = 'normal';
        
        abaApp.style.display = 'block';
        abaDb.style.display = 'none';
    } else {
        btnDb.style.borderBottom = '3px solid var(--cor-primaria)';
        btnDb.style.color = 'var(--cor-primaria)';
        btnDb.style.fontWeight = 'bold';
        
        btnApp.style.borderBottom = '3px solid transparent';
        btnApp.style.color = '#666';
        btnApp.style.fontWeight = 'normal';
        
        abaApp.style.display = 'none';
        abaDb.style.display = 'block';
        
        // Dispara a varredura do banco apenas quando o usuário clica na aba
        carregarStatusBanco(); 
    }
};

// =====================================================================
// SITUAÇÃO DO STORAGE (ARQUIVOS FÍSICOS - VARREDURA PROFUNDA)
// =====================================================================
async function carregarStatusBanco() {
    const loading = document.getElementById('db-status-loading');
    const content = document.getElementById('db-status-content');
    
    if (!loading || !content) return;

    loading.style.display = 'block';
    content.style.display = 'none';

    try {
        let totalFiles = 0;
        let totalBytes = 0;
        const stats = [];

        // Tamanho de 1GB em Bytes (Free Tier Supabase)
        const LIMITE_BYTES = 1073741824; 

        // Tenta buscar TODOS os buckets criados no seu banco dinamicamente
        let bucketsToScan = ['jornada', 'comprovantes', 'checklists', 'inspecoes'];
        try {
            const { data: bucketList } = await clienteSupabase.storage.listBuckets();
            if (bucketList && bucketList.length > 0) {
                bucketsToScan = bucketList.map(b => b.name);
            }
        } catch(e) { 
            console.warn("ListBuckets falhou. Usando array padrão de buckets."); 
        }

        // --- FUNÇÃO RECURSIVA PARA ENTRAR NAS PASTAS E SUBPASTAS ---
        async function varrerPasta(bucketName, currentPath = '') {
            let pathFiles = [];
            const { data, error } = await clienteSupabase.storage.from(bucketName).list(currentPath, { limit: 1000 });
            
            if (!data || error) return [];

            for (const item of data) {
                // Ignora o arquivo fantasma que o Supabase cria para segurar pastas vazias
                if (item.name === '.emptyFolderPlaceholder') continue;
                
                // No Supabase, se não tem ID, significa que é uma Pasta/Subpasta
                if (!item.id && !item.metadata) {
                    const folderPath = currentPath ? `${currentPath}/${item.name}` : item.name;
                    // Entra na subpasta e busca (Recursão)
                    const subFiles = await varrerPasta(bucketName, folderPath);
                    pathFiles = pathFiles.concat(subFiles);
                } else {
                    // É um arquivo real (Imagem, PDF, etc)
                    pathFiles.push(item);
                }
            }
            return pathFiles;
        }

        // Faz a varredura em todos os buckets encontrados
        for (const bucket of bucketsToScan) {
            const files = await varrerPasta(bucket);
            
            if (files.length > 0) {
                let countPdf = 0;
                let countImg = 0;
                let size = 0;

                files.forEach(f => {
                    size += (f.metadata?.size || 0);
                    
                    const nameLower = f.name.toLowerCase();
                    // Classifica o tipo do arquivo pela extensão
                    if (nameLower.endsWith('.pdf')) {
                        countPdf++;
                    } else if (nameLower.match(/\.(jpg|jpeg|png|webp|gif|bmp)$/)) {
                        countImg++;
                    }
                });
                
                totalFiles += files.length;
                totalBytes += size;

                stats.push({
                    bucket: bucket.toUpperCase(),
                    count: files.length,
                    pdfs: countPdf,
                    imgs: countImg,
                    size: size
                });
            }
        }

        // Formatação Visual de Bytes
        const formatSize = (bytes) => {
            if (bytes === 0) return '0 B';
            const k = 1024;
            const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(k));
            return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
        };

        // Cálculos do Limite do Storage
        const limiteTxt = '1 GB';
        const bytesRestantes = LIMITE_BYTES - totalBytes;
        const textoRestante = bytesRestantes > 0 ? formatSize(bytesRestantes) : 'Limite Excedido';
        const porcentagemUso = ((totalBytes / LIMITE_BYTES) * 100).toFixed(1);

        // Define a cor da barra de progresso com base na lotação
        let corBarra = '#28a745'; // Verde
        if (porcentagemUso > 75) corBarra = '#ffc107'; // Amarelo
        if (porcentagemUso > 90) corBarra = '#dc3545'; // Vermelho

        // Injeta os Cards Estatísticos
        document.getElementById('db-cards-resumo').innerHTML = `
            <div style="background: #e3f2fd; padding: 25px; border-radius: 8px; border-left: 5px solid #0d47a1; text-align: center; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="font-size: 0.9rem; color: #0d47a1; font-weight: bold; text-transform: uppercase; margin-bottom: 8px;">Total de Arquivos (PDFs/Imagens)</div>
                <div style="font-size: 2.5rem; font-weight: 900; color: #0d47a1;">${totalFiles}</div>
            </div>
            
            <div style="background: #f4f6f9; padding: 25px; border-radius: 8px; border-left: 5px solid #495057; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
                <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 8px;">
                    <span style="font-size: 0.9rem; color: #495057; font-weight: bold; text-transform: uppercase;">Armazenamento</span>
                    <span style="font-size: 0.85rem; color: #666; font-weight: bold;">${porcentagemUso}%</span>
                </div>
                
                <div style="display:flex; align-items: baseline; gap: 8px; margin-bottom: 12px;">
                    <div style="font-size: 2rem; font-weight: 900; color: #495057; line-height: 1;">${formatSize(totalBytes)}</div>
                    <div style="font-size: 0.9rem; color: #999;">de ${limiteTxt}</div>
                </div>

                <div style="height: 10px; background: #e9ecef; border-radius: 5px; overflow: hidden; margin-bottom: 10px;">
                    <div style="height: 100%; background: ${corBarra}; width: ${porcentagemUso}%; transition: width 1s ease;"></div>
                </div>
                
                <div style="font-size: 0.85rem; color: #28a745; text-align: right; font-weight: 600;">
                    <i class="fas fa-hdd"></i> Espaço Restante: ${textoRestante}
                </div>
            </div>
        `;

        // Monta a tabela discriminando o peso de cada bucket
        let htmlTable = '';
        
        stats.sort((a,b) => b.size - a.size).forEach(s => {
            htmlTable += `<tr>
                <td style="padding: 15px; border-bottom: 1px solid #eee;">
                    <b><i class="fas fa-folder-open" style="color:var(--cor-primaria); margin-right:5px;"></i> ${s.bucket}</b>
                </td>
                <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: center; font-weight: bold; font-size: 1.1rem; color: #333;">
                    ${s.count}
                </td>
                <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: center; color: #dc3545; font-weight: 600;">
                    ${s.pdfs > 0 ? s.pdfs : '-'}
                </td>
                <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: center; color: #28a745; font-weight: 600;">
                    ${s.imgs > 0 ? s.imgs : '-'}
                </td>
                <td style="padding: 15px; border-bottom: 1px solid #eee; text-align: right; color:#555; font-weight: bold;">
                    ${formatSize(s.size)}
                </td>
            </tr>`;
        });

        if (htmlTable === '') {
            htmlTable = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">Nenhum arquivo localizado no servidor.</td></tr>';
        }

        document.getElementById('tbody-db-status').innerHTML = htmlTable;

        loading.style.display = 'none';
        content.style.display = 'block';

    } catch (err) {
        console.error(err);
        loading.innerHTML = '<span style="color:#dc3545;"><i class="fas fa-exclamation-triangle"></i> Falha ao varrer diretórios no Supabase.</span>';
    }
}