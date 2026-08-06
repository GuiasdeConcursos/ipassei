// assets/referencias-widget.js
// Componente reaproveitável pra gerenciar referências pessoais (links +
// descrição) que o próprio usuário cadastra por tópico. Totalmente
// privado — cada usuário só vê e mexe nas próprias.
// Renderiza tudo inline no container passado (sem modal/caixa flutuante,
// já que o conteúdo é curto: link + descrição).
// Depende de `supabaseClient` já estar definido globalmente (supabase-config.js).

window.ReferenciasWidget = (function () {
    function escapeHtmlLocal(str) {
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    function normalizarUrl(url) {
        url = url.trim();
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
        return url;
    }

    async function obterUsuarioId() {
        const { data } = await supabaseClient.auth.getUser();
        return data?.user?.id || null;
    }

    // Renderiza o painel completo (form de adicionar + lista) dentro de containerEl.
    async function renderPainel(topicoId, containerEl) {
        containerEl.innerHTML = '<div class="small text-secondary">Carregando...</div>';
        const userId = await obterUsuarioId();
        if (!userId) {
            containerEl.innerHTML = '<div class="text-danger small">Você precisa estar logado pra usar isso.</div>';
            return;
        }
        containerEl.innerHTML = '';

        const formWrap = document.createElement('div');
        formWrap.className = 'card-soft mb-2';
        formWrap.innerHTML = `
            <label class="form-label small fw-semibold mb-1">Adicionar referência</label>
            <input type="text" class="form-control form-control-sm mb-2 rw-input-url" placeholder="Cola o link aqui (ex: youtube.com/... ou um artigo)">
            <input type="text" class="form-control form-control-sm mb-2 rw-input-descricao" placeholder="Descrição (opcional) — ex: &quot;Vídeo que explicou bem esse assunto&quot;">
            <button type="button" class="btn btn-navy btn-sm rw-btn-adicionar">Adicionar</button>
            <div class="small mt-2 rw-msg"></div>
        `;
        containerEl.appendChild(formWrap);

        const listaEl = document.createElement('div');
        listaEl.className = 'd-flex flex-column gap-2';
        containerEl.appendChild(listaEl);

        async function carregarLista() {
            listaEl.innerHTML = '<div class="small text-secondary">Carregando referências...</div>';

            const { data: refs, error } = await supabaseClient
                .from('referencias_usuario')
                .select('*')
                .eq('usuario_id', userId)
                .eq('topico_id', topicoId)
                .order('criado_em', { ascending: false });

            listaEl.innerHTML = '';

            if (error) {
                listaEl.innerHTML = `<div class="text-danger small">${error.message}</div>`;
                return;
            }
            if (!refs || refs.length === 0) {
                listaEl.innerHTML = '<div class="text-secondary small">Você ainda não salvou nenhuma referência pra esse assunto.</div>';
                return;
            }
            refs.forEach(r => listaEl.appendChild(criarItemReferencia(r, carregarLista)));
        }

        const btnAdicionar = formWrap.querySelector('.rw-btn-adicionar');
        const msgEl = formWrap.querySelector('.rw-msg');
        const inputUrl = formWrap.querySelector('.rw-input-url');
        const inputDescricao = formWrap.querySelector('.rw-input-descricao');

        btnAdicionar.addEventListener('click', async () => {
            if (!btnAdicionar || !msgEl || !inputUrl) return; // proteção — nunca deveria disparar, mas evita quebrar a tela
            const urlDigitada = inputUrl.value.trim();
            const descricao = inputDescricao.value.trim() || null;

            if (!urlDigitada) {
                msgEl.className = 'small mt-2 text-danger';
                msgEl.textContent = 'Cola um link antes de adicionar.';
                return;
            }

            btnAdicionar.disabled = true;
            btnAdicionar.textContent = 'Salvando...';

            const { error } = await supabaseClient.from('referencias_usuario').insert({
                usuario_id: userId, topico_id: topicoId, url: normalizarUrl(urlDigitada), descricao,
            });

            btnAdicionar.disabled = false;
            btnAdicionar.textContent = 'Adicionar';

            if (error) {
                msgEl.className = 'small mt-2 text-danger';
                msgEl.textContent = 'Erro: ' + error.message;
                return;
            }

            msgEl.className = 'small mt-2 text-success';
            msgEl.textContent = 'Adicionada ✓';
            inputUrl.value = '';
            inputDescricao.value = '';
            await carregarLista();
        });

        await carregarLista();
    }

    function criarItemReferencia(ref, recarregar) {
        const item = document.createElement('div');
        item.className = 'border rounded p-2';
        item.style.background = '#fff';
        item.innerHTML = `
            <div class="d-flex justify-content-between align-items-start gap-2">
                <div class="flex-fill" style="min-width:0;">
                    <div class="small fw-semibold">${ref.descricao ? escapeHtmlLocal(ref.descricao) : '<span class="text-secondary fst-italic">(sem descrição)</span>'}</div>
                    <a href="${escapeHtmlLocal(ref.url)}" target="_blank" rel="noopener noreferrer" class="small d-block text-truncate">${escapeHtmlLocal(ref.url)}</a>
                </div>
                <div class="d-flex gap-1 flex-shrink-0">
                    <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2 rw-btn-editar" title="Editar"><i class="bi bi-pencil"></i></button>
                    <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 rw-btn-excluir" title="Excluir"><i class="bi bi-trash"></i></button>
                </div>
            </div>
            <div class="mt-2 d-none rw-bloco-editar">
                <input type="text" class="form-control form-control-sm mb-1 rw-edit-url" value="${escapeHtmlLocal(ref.url)}">
                <input type="text" class="form-control form-control-sm mb-2 rw-edit-descricao" value="${ref.descricao ? escapeHtmlLocal(ref.descricao) : ''}" placeholder="Descrição (opcional)">
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-navy btn-sm rw-btn-salvar-edicao">Salvar</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm rw-btn-cancelar-edicao">Cancelar</button>
                </div>
                <div class="small mt-1 rw-msg-editar"></div>
            </div>
        `;

        const blocoEditar = item.querySelector('.rw-bloco-editar');
        item.querySelector('.rw-btn-editar').addEventListener('click', () => {
            blocoEditar.classList.toggle('d-none');
        });
        item.querySelector('.rw-btn-cancelar-edicao').addEventListener('click', () => {
            blocoEditar.classList.add('d-none');
        });

        item.querySelector('.rw-btn-salvar-edicao').addEventListener('click', async () => {
            const btn = item.querySelector('.rw-btn-salvar-edicao');
            const msgEl = item.querySelector('.rw-msg-editar');
            const novaUrlDigitada = item.querySelector('.rw-edit-url').value.trim();
            const novaDescricao = item.querySelector('.rw-edit-descricao').value.trim() || null;

            if (!novaUrlDigitada) {
                msgEl.className = 'small mt-1 text-danger';
                msgEl.textContent = 'O link não pode ficar vazio.';
                return;
            }

            btn.disabled = true;
            const { error } = await supabaseClient
                .from('referencias_usuario')
                .update({ url: normalizarUrl(novaUrlDigitada), descricao: novaDescricao })
                .eq('id', ref.id);
            btn.disabled = false;

            if (error) {
                msgEl.className = 'small mt-1 text-danger';
                msgEl.textContent = 'Erro: ' + error.message;
                return;
            }
            await recarregar();
        });

        item.querySelector('.rw-btn-excluir').addEventListener('click', async () => {
            if (!confirm('Excluir essa referência? Não dá pra desfazer.')) return;
            const { error } = await supabaseClient.from('referencias_usuario').delete().eq('id', ref.id);
            if (error) { alert('Erro ao excluir: ' + error.message); return; }
            await recarregar();
        });

        return item;
    }

    return { renderPainel };
})();
