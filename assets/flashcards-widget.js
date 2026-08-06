// assets/flashcards-widget.js
// Componente reaproveitável pra gerenciar flashcards pessoais (frente/verso
// + dica/exemplo opcionais) que o usuário cria por tópico, manual ou via IA.
// Totalmente privado — cada usuário só vê/mexe nos próprios.
// Depende de `supabaseClient` já estar definido globalmente (supabase-config.js).

window.FlashcardsWidget = (function () {
    function escapeHtmlLocal(str) {
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    async function obterUsuarioId() {
        const { data } = await supabaseClient.auth.getUser();
        return data?.user?.id || null;
    }

    // ---------- CSS do modo estudo, injetado uma vez só ----------
    let estilosInjetados = false;
    function garantirEstilos() {
        if (estilosInjetados) return;
        estilosInjetados = true;
        const style = document.createElement('style');
        style.textContent = `
            .fw-estudo-overlay {
                position: fixed; inset: 0; background: rgba(15, 15, 30, 0.75);
                display: flex; align-items: center; justify-content: center;
                z-index: 2100; padding: 1.5rem;
            }
            .fw-estudo-caixa {
                width: 100%; max-width: 480px; display: flex; flex-direction: column; align-items: center; gap: 1rem;
            }
            .fw-estudo-topo { width: 100%; display: flex; justify-content: space-between; align-items: center; color: #fff; }
            .fw-estudo-progresso { font-size: 0.85rem; opacity: 0.85; }
            .fw-estudo-fechar { background: none; border: none; color: #fff; font-size: 1.4rem; line-height: 1; cursor: pointer; opacity: 0.8; }
            .fw-estudo-fechar:hover { opacity: 1; }
            .fw-estudo-barra { width: 100%; height: 4px; border-radius: 4px; background: rgba(255,255,255,0.2); overflow: hidden; }
            .fw-estudo-barra-preenchida { height: 100%; background: linear-gradient(90deg, #6f42c1, #a78bfa); transition: width 0.25s ease; }
            .fw-estudo-cena { width: 100%; height: 340px; perspective: 1400px; cursor: pointer; }
            .fw-estudo-cartao {
                position: relative; width: 100%; height: 100%;
                transform-style: preserve-3d; transition: transform 0.5s cubic-bezier(.4,.2,.2,1);
            }
            .fw-estudo-cartao.virado { transform: rotateY(180deg); }
            .fw-estudo-face {
                position: absolute; inset: 0; backface-visibility: hidden;
                border-radius: 18px; padding: 1.5rem; display: flex; flex-direction: column;
                justify-content: center; align-items: center; text-align: center; gap: 0.6rem;
                box-shadow: 0 20px 50px rgba(0,0,0,0.35);
                overflow-y: auto; overflow-x: hidden;
            }
            .fw-estudo-face-frente { background: linear-gradient(145deg, #4c3fc9, #6f42c1); color: #fff; }
            .fw-estudo-face-verso { background: linear-gradient(145deg, #16a37a, #0d8f6b); color: #fff; transform: rotateY(180deg); }
            .fw-estudo-rotulo { font-size: 0.7rem; letter-spacing: 1.5px; text-transform: uppercase; opacity: 0.75; flex-shrink: 0; }
            .fw-estudo-texto-principal {
                font-size: 1.4rem; font-weight: 700; line-height: 1.35;
                width: 100%; max-width: 100%;
                word-break: break-word; overflow-wrap: break-word; hyphens: auto;
            }
            .fw-estudo-dica, .fw-estudo-exemplo {
                font-size: 0.85rem; opacity: 0.9; width: 100%; max-width: 100%;
                word-break: break-word; overflow-wrap: break-word;
            }
            .fw-estudo-dica { background: rgba(255,255,255,0.15); border-radius: 8px; padding: 0.5rem 0.75rem; }
            .fw-estudo-dica-icone { margin-right: 0.25rem; }
            .fw-estudo-dica-final { font-size: 0.8rem; color: rgba(255,255,255,0.7); flex-shrink: 0; }
            .fw-estudo-nav { display: flex; gap: 1rem; align-items: center; }
            .fw-estudo-nav button {
                width: 44px; height: 44px; border-radius: 50%; border: none;
                background: rgba(255,255,255,0.15); color: #fff; font-size: 1.1rem;
                display: flex; align-items: center; justify-content: center; cursor: pointer;
                transition: background 0.15s;
            }
            .fw-estudo-nav button:hover { background: rgba(255,255,255,0.3); }
            .fw-estudo-nav button:disabled { opacity: 0.35; cursor: default; }
        `;
        document.head.appendChild(style);
    }

    async function renderPainel(topicoId, containerEl) {
        containerEl.innerHTML = '<div class="small text-secondary">Carregando...</div>';
        const userId = await obterUsuarioId();
        if (!userId) {
            containerEl.innerHTML = '<div class="text-danger small">Você precisa estar logado pra usar isso.</div>';
            return;
        }
        containerEl.innerHTML = '';
        garantirEstilos();

        const acoesWrap = document.createElement('div');
        acoesWrap.className = 'd-flex gap-2 mb-2 flex-wrap';
        acoesWrap.innerHTML = `
            <button type="button" class="btn btn-primary btn-sm fw-btn-estudar"><i class="bi bi-play-fill"></i> Modo estudo</button>
            <button type="button" class="btn btn-outline-secondary btn-sm fw-btn-manual"><i class="bi bi-plus-lg"></i> Criar manual</button>
            <button type="button" class="btn btn-outline-primary btn-sm fw-btn-ia"><i class="bi bi-stars"></i> Gerar com IA</button>
        `;
        containerEl.appendChild(acoesWrap);

        const msgAcoes = document.createElement('div');
        msgAcoes.className = 'small mb-2';
        containerEl.appendChild(msgAcoes);

        const formManual = document.createElement('div');
        formManual.className = 'card-soft mb-2 d-none';
        formManual.innerHTML = `
            <label class="form-label small fw-semibold mb-1">Frente</label>
            <input type="text" class="form-control form-control-sm mb-2 fw-input-frente" placeholder="Termo ou pergunta">
            <label class="form-label small fw-semibold mb-1">Verso</label>
            <input type="text" class="form-control form-control-sm mb-2 fw-input-verso" placeholder="Resposta">
            <label class="form-label small fw-semibold mb-1">Dica pra prova <span class="text-secondary fw-normal">(opcional)</span></label>
            <input type="text" class="form-control form-control-sm mb-2 fw-input-dica">
            <label class="form-label small fw-semibold mb-1">Exemplo <span class="text-secondary fw-normal">(opcional)</span></label>
            <input type="text" class="form-control form-control-sm mb-2 fw-input-exemplo">
            <div class="d-flex gap-2">
                <button type="button" class="btn btn-navy btn-sm fw-btn-salvar-manual">Salvar</button>
                <button type="button" class="btn btn-outline-secondary btn-sm fw-btn-cancelar-manual">Cancelar</button>
            </div>
            <div class="small mt-2 fw-msg-manual"></div>
        `;
        containerEl.appendChild(formManual);

        const listaEl = document.createElement('div');
        listaEl.className = 'd-flex flex-column gap-2';
        containerEl.appendChild(listaEl);

        async function carregarLista() {
            listaEl.innerHTML = '<div class="small text-secondary">Carregando flashcards...</div>';
            const { data: cards, error } = await supabaseClient
                .from('flashcards_usuario')
                .select('*')
                .eq('usuario_id', userId)
                .eq('topico_id', topicoId)
                .order('criado_em', { ascending: false });

            listaEl.innerHTML = '';
            if (error) { listaEl.innerHTML = `<div class="text-danger small">${error.message}</div>`; return; }
            if (!cards || cards.length === 0) {
                listaEl.innerHTML = '<div class="text-secondary small">Você ainda não tem flashcard pra esse assunto.</div>';
                return;
            }
            cards.forEach(c => listaEl.appendChild(criarCard(c, carregarLista)));
        }

        acoesWrap.querySelector('.fw-btn-estudar').addEventListener('click', async () => {
            const { data: cards, error } = await supabaseClient
                .from('flashcards_usuario')
                .select('*')
                .eq('usuario_id', userId)
                .eq('topico_id', topicoId)
                .order('criado_em', { ascending: false });

            if (error) { alert('Erro: ' + error.message); return; }
            if (!cards || cards.length === 0) { alert('Você ainda não tem flashcard pra esse assunto.'); return; }

            abrirModoEstudo(cards);
        });

        acoesWrap.querySelector('.fw-btn-manual').addEventListener('click', () => {
            formManual.classList.toggle('d-none');
        });
        formManual.querySelector('.fw-btn-cancelar-manual').addEventListener('click', () => {
            formManual.classList.add('d-none');
            formManual.querySelectorAll('input').forEach(i => i.value = '');
            formManual.querySelector('.fw-msg-manual').textContent = '';
        });
        formManual.querySelector('.fw-btn-salvar-manual').addEventListener('click', async () => {
            const btn = formManual.querySelector('.fw-btn-salvar-manual');
            const msgEl = formManual.querySelector('.fw-msg-manual');
            const frente = formManual.querySelector('.fw-input-frente').value.trim();
            const verso = formManual.querySelector('.fw-input-verso').value.trim();
            const dica = formManual.querySelector('.fw-input-dica').value.trim() || null;
            const exemplo = formManual.querySelector('.fw-input-exemplo').value.trim() || null;

            if (!frente || !verso) {
                msgEl.className = 'small mt-2 text-danger fw-msg-manual';
                msgEl.textContent = 'Preencha frente e verso.';
                return;
            }

            btn.disabled = true;
            const { error } = await supabaseClient.from('flashcards_usuario').insert({
                usuario_id: userId, topico_id: topicoId, frente, verso, dica, exemplo, origem: 'manual',
            });
            btn.disabled = false;

            if (error) {
                msgEl.className = 'small mt-2 text-danger fw-msg-manual';
                msgEl.textContent = 'Erro: ' + error.message;
                return;
            }

            formManual.classList.add('d-none');
            formManual.querySelectorAll('input').forEach(i => i.value = '');
            msgEl.textContent = '';
            await carregarLista();
        });

        acoesWrap.querySelector('.fw-btn-ia').addEventListener('click', async () => {
            const btn = acoesWrap.querySelector('.fw-btn-ia');
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Gerando...';
            msgAcoes.textContent = '';

            const { data, error } = await supabaseClient.functions.invoke('gerar-flashcard', {
                body: { topico_id: topicoId }
            });

            btn.disabled = false;
            btn.innerHTML = '<i class="bi bi-stars"></i> Gerar com IA';

            if (error || data?.error) {
                msgAcoes.className = 'small mb-2 text-danger';
                msgAcoes.textContent = data?.error || error.message;
                return;
            }

            msgAcoes.className = 'small mb-2 text-success';
            msgAcoes.textContent = 'Flashcard gerado ✓';
            await carregarLista();
        });

        await carregarLista();
    }

    // ---------- Modo estudo: um cartão grande por vez, vira e avança ----------
    function abrirModoEstudo(cards) {
        garantirEstilos();

        const overlay = document.createElement('div');
        overlay.className = 'fw-estudo-overlay';
        overlay.innerHTML = `
            <div class="fw-estudo-caixa">
                <div class="fw-estudo-topo">
                    <span class="fw-estudo-progresso"></span>
                    <button type="button" class="fw-estudo-fechar" title="Fechar">&times;</button>
                </div>
                <div class="fw-estudo-barra"><div class="fw-estudo-barra-preenchida"></div></div>

                <div class="fw-estudo-cena">
                    <div class="fw-estudo-cartao">
                        <div class="fw-estudo-face fw-estudo-face-frente">
                            <span class="fw-estudo-rotulo">Frente</span>
                            <div class="fw-estudo-texto-principal fw-texto-frente"></div>
                            <span class="fw-estudo-dica-final">Clique pra virar</span>
                        </div>
                        <div class="fw-estudo-face fw-estudo-face-verso">
                            <span class="fw-estudo-rotulo">Verso</span>
                            <div class="fw-estudo-texto-principal fw-texto-verso"></div>
                            <div class="fw-estudo-dica fw-texto-dica d-none"></div>
                            <div class="fw-estudo-exemplo fw-texto-exemplo d-none"></div>
                            <span class="fw-estudo-dica-final">Clique pra ir pro próximo</span>
                        </div>
                    </div>
                </div>

                <div class="fw-estudo-nav">
                    <button type="button" class="fw-estudo-anterior" title="Anterior"><i class="bi bi-chevron-left"></i></button>
                    <button type="button" class="fw-estudo-embaralhar" title="Embaralhar"><i class="bi bi-shuffle"></i></button>
                    <button type="button" class="fw-estudo-proximo" title="Próximo"><i class="bi bi-chevron-right"></i></button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        let ordem = cards.map((_, i) => i);
        let indice = 0;
        let virado = false;

        const cartaoEl = overlay.querySelector('.fw-estudo-cartao');
        const cenaEl = overlay.querySelector('.fw-estudo-cena');
        const progressoEl = overlay.querySelector('.fw-estudo-progresso');
        const barraEl = overlay.querySelector('.fw-estudo-barra-preenchida');

        function renderCartaoAtual() {
            const card = cards[ordem[indice]];
            overlay.querySelector('.fw-texto-frente').textContent = card.frente;
            overlay.querySelector('.fw-texto-verso').textContent = card.verso;

            const dicaEl = overlay.querySelector('.fw-texto-dica');
            if (card.dica) {
                dicaEl.innerHTML = '<i class="bi bi-lightbulb fw-estudo-dica-icone"></i>' + escapeHtmlLocal(card.dica);
                dicaEl.classList.remove('d-none');
            } else {
                dicaEl.classList.add('d-none');
            }

            const exemploEl = overlay.querySelector('.fw-texto-exemplo');
            if (card.exemplo) {
                exemploEl.textContent = card.exemplo;
                exemploEl.classList.remove('d-none');
            } else {
                exemploEl.classList.add('d-none');
            }

            progressoEl.textContent = `${indice + 1} de ${cards.length}`;
            barraEl.style.width = `${((indice + 1) / cards.length) * 100}%`;

            virado = false;
            cartaoEl.classList.remove('virado');
        }

        function proximoCartao() {
            indice = (indice + 1) % cards.length;
            renderCartaoAtual();
        }

        function cartaoAnterior() {
            indice = (indice - 1 + cards.length) % cards.length;
            renderCartaoAtual();
        }

        cenaEl.addEventListener('click', () => {
            if (!virado) {
                virado = true;
                cartaoEl.classList.add('virado');
            } else {
                proximoCartao();
            }
        });

        overlay.querySelector('.fw-estudo-proximo').addEventListener('click', (e) => { e.stopPropagation(); proximoCartao(); });
        overlay.querySelector('.fw-estudo-anterior').addEventListener('click', (e) => { e.stopPropagation(); cartaoAnterior(); });
        overlay.querySelector('.fw-estudo-embaralhar').addEventListener('click', (e) => {
            e.stopPropagation();
            for (let i = ordem.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [ordem[i], ordem[j]] = [ordem[j], ordem[i]];
            }
            indice = 0;
            renderCartaoAtual();
        });
        overlay.querySelector('.fw-estudo-fechar').addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        renderCartaoAtual();
    }

    function criarCard(card, recarregar) {
        const wrap = document.createElement('div');
        wrap.className = 'border rounded p-3';
        wrap.style.background = '#fff';
        wrap.style.cursor = 'pointer';

        let virado = false;

        function render() {
            const ladoTexto = virado ? card.verso : card.frente;
            const rotulo = virado ? 'VERSO' : 'FRENTE';
            let extra = '';
            if (virado) {
                if (card.dica) extra += `<div class="small text-warning-emphasis mt-2"><i class="bi bi-lightbulb"></i> ${escapeHtmlLocal(card.dica)}</div>`;
                if (card.exemplo) extra += `<div class="small text-secondary mt-1"><i class="bi bi-quote"></i> ${escapeHtmlLocal(card.exemplo)}</div>`;
            }
            wrap.innerHTML = `
                <div class="d-flex justify-content-between align-items-start">
                    <span class="badge text-bg-light border small">${rotulo}${card.origem === 'ia' ? ' · IA' : ''}</span>
                    <div class="d-flex gap-1 fw-acoes" onclick="event.stopPropagation()">
                        <button type="button" class="btn btn-outline-secondary btn-sm py-0 px-2 fw-btn-editar" title="Editar"><i class="bi bi-pencil"></i></button>
                        <button type="button" class="btn btn-outline-danger btn-sm py-0 px-2 fw-btn-excluir" title="Excluir"><i class="bi bi-trash"></i></button>
                    </div>
                </div>
                <div class="fw-semibold mt-2" style="font-size:1.05rem;">${escapeHtmlLocal(ladoTexto)}</div>
                ${extra}
                <div class="text-secondary small mt-2"><i class="bi bi-arrow-repeat"></i> Clique pra virar</div>
                <div class="mt-2 d-none fw-bloco-editar"></div>
            `;

            wrap.querySelector('.fw-btn-editar').addEventListener('click', () => abrirEdicao());
            wrap.querySelector('.fw-btn-excluir').addEventListener('click', async () => {
                if (!confirm('Excluir esse flashcard? Não dá pra desfazer.')) return;
                const { error } = await supabaseClient.from('flashcards_usuario').delete().eq('id', card.id);
                if (error) { alert('Erro: ' + error.message); return; }
                await recarregar();
            });
        }

        function abrirEdicao() {
            const bloco = wrap.querySelector('.fw-bloco-editar');
            bloco.classList.remove('d-none');
            bloco.innerHTML = `
                <label class="form-label small fw-semibold mb-1">Frente</label>
                <input type="text" class="form-control form-control-sm mb-1 fw-edit-frente" value="${escapeHtmlLocal(card.frente)}">
                <label class="form-label small fw-semibold mb-1">Verso</label>
                <input type="text" class="form-control form-control-sm mb-1 fw-edit-verso" value="${escapeHtmlLocal(card.verso)}">
                <label class="form-label small fw-semibold mb-1">Dica</label>
                <input type="text" class="form-control form-control-sm mb-1 fw-edit-dica" value="${card.dica ? escapeHtmlLocal(card.dica) : ''}">
                <label class="form-label small fw-semibold mb-1">Exemplo</label>
                <input type="text" class="form-control form-control-sm mb-2 fw-edit-exemplo" value="${card.exemplo ? escapeHtmlLocal(card.exemplo) : ''}">
                <div class="d-flex gap-2">
                    <button type="button" class="btn btn-navy btn-sm fw-btn-salvar-edicao">Salvar</button>
                    <button type="button" class="btn btn-outline-secondary btn-sm fw-btn-cancelar-edicao">Cancelar</button>
                </div>
                <div class="small mt-1 fw-msg-edicao"></div>
            `;
            bloco.addEventListener('click', (e) => e.stopPropagation());

            bloco.querySelector('.fw-btn-cancelar-edicao').addEventListener('click', () => bloco.classList.add('d-none'));
            bloco.querySelector('.fw-btn-salvar-edicao').addEventListener('click', async () => {
                const msgEl = bloco.querySelector('.fw-msg-edicao');
                const novaFrente = bloco.querySelector('.fw-edit-frente').value.trim();
                const novoVerso = bloco.querySelector('.fw-edit-verso').value.trim();
                const novaDica = bloco.querySelector('.fw-edit-dica').value.trim() || null;
                const novoExemplo = bloco.querySelector('.fw-edit-exemplo').value.trim() || null;

                if (!novaFrente || !novoVerso) {
                    msgEl.className = 'small mt-1 text-danger fw-msg-edicao';
                    msgEl.textContent = 'Frente e verso não podem ficar vazios.';
                    return;
                }

                const { error } = await supabaseClient.from('flashcards_usuario')
                    .update({ frente: novaFrente, verso: novoVerso, dica: novaDica, exemplo: novoExemplo })
                    .eq('id', card.id);

                if (error) {
                    msgEl.className = 'small mt-1 text-danger fw-msg-edicao';
                    msgEl.textContent = 'Erro: ' + error.message;
                    return;
                }
                await recarregar();
            });
        }

        wrap.addEventListener('click', () => { virado = !virado; render(); });
        render();
        return wrap;
    }

    // Busca os flashcards do usuário pra um tópico e já abre o modo estudo direto —
    // usado no botão "errou a questão" das telas de resolução, sem precisar montar
    // o painel completo (lista + form) primeiro.
    async function abrirEstudoPorTopico(topicoId) {
        const userId = await obterUsuarioId();
        if (!userId) return;

        const { data: cards, error } = await supabaseClient
            .from('flashcards_usuario')
            .select('*')
            .eq('usuario_id', userId)
            .eq('topico_id', topicoId)
            .order('criado_em', { ascending: false });

        if (error || !cards || cards.length === 0) return;
        abrirModoEstudo(cards);
    }

    // Só conta quantos flashcards o usuário tem pra um tópico — usado pra decidir
    // se mostra o botão de "estudar" depois de errar uma questão.
    async function contarFlashcardsDoTopico(topicoId) {
        const userId = await obterUsuarioId();
        if (!userId) return 0;
        const { count } = await supabaseClient
            .from('flashcards_usuario').select('id', { count: 'exact', head: true })
            .eq('usuario_id', userId).eq('topico_id', topicoId);
        return count || 0;
    }

    return { renderPainel, abrirEstudoPorTopico, contarFlashcardsDoTopico };
})();
