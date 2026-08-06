// assets/guias-widget.js
// Componente reaproveitável pra listar guias de estudo de um tópico
// (ordenadas por nota) e permitir avaliar com estrelas de 1 a 5.
// A lista sempre renderiza inline (dentro do container que a página passar).
// "Ler guia" abre uma caixa flutuante própria (injetada por esse script,
// não depende de nenhum modal já existir na página), com botão de
// maximizar/restaurar.
// Depende de `supabaseClient` já estar definido globalmente (supabase-config.js).

window.GuiasWidget = (function () {
    function escapeHtmlLocal(str) {
        return String(str).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
    }

    function renderEstrelasReadonly(nota) {
        const cheias = Math.round(Number(nota) || 0);
        return '★'.repeat(cheias) + '☆'.repeat(5 - cheias);
    }

    // ---------- CSS injetado uma vez só ----------
    let estilosInjetados = false;
    function garantirEstilos() {
        if (estilosInjetados) return;
        estilosInjetados = true;
        const style = document.createElement('style');
        style.textContent = `
            .guias-widget-overlay {
                position: fixed; inset: 0; background: rgba(0,0,0,0.55);
                display: flex; align-items: center; justify-content: center;
                z-index: 2000; padding: 1rem;
            }
            .guias-widget-caixa {
                background: #fff; border-radius: 10px; width: 100%; max-width: 700px;
                max-height: 85vh; display: flex; flex-direction: column; overflow: hidden;
                box-shadow: 0 10px 40px rgba(0,0,0,0.25);
            }
            .guias-widget-caixa.maximizada {
                max-width: 96vw; width: 96vw; max-height: 96vh; height: 96vh;
            }
            .guias-widget-caixa-header {
                display: flex; justify-content: space-between; align-items: flex-start; gap: 0.75rem;
                padding: 0.85rem 1rem; border-bottom: 1px solid #eee; flex-shrink: 0;
            }
            .guias-widget-caixa-titulo { font-weight: 600; }
            .guias-widget-caixa-corpo { padding: 1rem; overflow-y: auto; flex: 1; }
            .guias-widget-caixa-conteudo { white-space: pre-wrap; line-height: 1.55; }
        `;
        document.head.appendChild(style);
    }

    // ---------- Caixa flutuante de leitura (injetada uma vez, reaproveitada) ----------
    let overlayEl = null;
    function garantirModalLeitura() {
        if (overlayEl) return overlayEl;
        garantirEstilos();

        overlayEl = document.createElement('div');
        overlayEl.className = 'guias-widget-overlay d-none';
        overlayEl.innerHTML = `
            <div class="guias-widget-caixa">
                <div class="guias-widget-caixa-header">
                    <div class="guias-widget-caixa-titulo"></div>
                    <div class="d-flex gap-2 flex-shrink-0">
                        <button type="button" class="btn btn-outline-secondary btn-sm gw-btn-maximizar" title="Maximizar"><i class="bi bi-arrows-fullscreen"></i></button>
                        <button type="button" class="btn btn-outline-secondary btn-sm gw-btn-fechar" title="Fechar"><i class="bi bi-x-lg"></i></button>
                    </div>
                </div>
                <div class="guias-widget-caixa-corpo">
                    <div class="guias-widget-caixa-conteudo"></div>
                    <div class="mt-3 border-top pt-3">
                        <div class="small fw-semibold mb-1">O que você achou dessa guia?</div>
                        <div class="estrelas-input gw-estrelas"></div>
                        <div class="small text-secondary mt-1 gw-msg-avaliacao"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(overlayEl);

        const caixa = overlayEl.querySelector('.guias-widget-caixa');

        overlayEl.querySelector('.gw-btn-fechar').addEventListener('click', fecharModalLeitura);
        overlayEl.addEventListener('click', (e) => { if (e.target === overlayEl) fecharModalLeitura(); });

        overlayEl.querySelector('.gw-btn-maximizar').addEventListener('click', () => {
            caixa.classList.toggle('maximizada');
            const btn = overlayEl.querySelector('.gw-btn-maximizar');
            const maximizada = caixa.classList.contains('maximizada');
            btn.innerHTML = maximizada ? '<i class="bi bi-fullscreen-exit"></i>' : '<i class="bi bi-arrows-fullscreen"></i>';
            btn.title = maximizada ? 'Restaurar' : 'Maximizar';
        });

        return overlayEl;
    }

    function fecharModalLeitura() {
        if (!overlayEl) return;
        overlayEl.classList.add('d-none');
        overlayEl.querySelector('.guias-widget-caixa').classList.remove('maximizada');
        const btnMax = overlayEl.querySelector('.gw-btn-maximizar');
        btnMax.innerHTML = '<i class="bi bi-arrows-fullscreen"></i>';
        btnMax.title = 'Maximizar';
    }

    // Abre a caixa de leitura pra uma guia específica. `atualizarResumoNaLista`
    // é chamado depois de avaliar, pra sincronizar a nota mostrada no card da lista.
    function abrirModalLeitura(guia, atualizarResumoNaLista) {
        const modal = garantirModalLeitura();
        modal.querySelector('.guias-widget-caixa-titulo').textContent = guia.titulo;
        modal.querySelector('.guias-widget-caixa-conteudo').textContent = guia.conteudo;

        const estrelasWrap = modal.querySelector('.gw-estrelas');
        const msgAvaliacao = modal.querySelector('.gw-msg-avaliacao');
        estrelasWrap.innerHTML = [1, 2, 3, 4, 5].map(n => `<span class="estrela" data-valor="${n}">★</span>`).join('');
        msgAvaliacao.className = 'small text-secondary mt-1 gw-msg-avaliacao';
        msgAvaliacao.textContent = '';

        const estrelasEls = Array.from(estrelasWrap.querySelectorAll('.estrela'));
        let jaAvaliou = false;

        function pintarAte(n) {
            estrelasEls.forEach(el => el.classList.toggle('ativa', parseInt(el.dataset.valor, 10) <= n));
        }

        estrelasEls.forEach(el => {
            el.onmouseenter = () => { if (!jaAvaliou) pintarAte(parseInt(el.dataset.valor, 10)); };
            el.onmouseleave = () => { if (!jaAvaliou) pintarAte(0); };
            el.onclick = async () => {
                if (jaAvaliou) return;
                const nota = parseInt(el.dataset.valor, 10);
                jaAvaliou = true;
                pintarAte(nota);

                const { error: erroAvaliar } = await supabaseClient.rpc('avaliar_guia', { guia_id_param: guia.id, nota_param: nota });
                if (erroAvaliar) {
                    msgAvaliacao.className = 'small text-danger mt-1 gw-msg-avaliacao';
                    msgAvaliacao.textContent = 'Erro ao avaliar: ' + erroAvaliar.message;
                    jaAvaliou = false;
                    return;
                }

                msgAvaliacao.className = 'small text-success mt-1 gw-msg-avaliacao';
                msgAvaliacao.textContent = 'Obrigado pela avaliação!';

                guia.total_avaliacoes = Number(guia.total_avaliacoes) + 1;
                guia.soma_avaliacoes = Number(guia.soma_avaliacoes || 0) + nota;
                guia.nota_media = Math.round((guia.soma_avaliacoes / guia.total_avaliacoes) * 100) / 100;
                if (atualizarResumoNaLista) atualizarResumoNaLista(guia);
            };
        });

        modal.classList.remove('d-none');
    }

    // ---------- Lista inline ----------
    // Busca e renderiza as guias ATIVAS de um tópico, ordenadas da melhor nota pra pior.
    // Sempre inline no container passado — nunca abre modal sozinha (só "Ler guia" abre).
    async function renderListaGuias(topicoId, containerEl, vazioEl) {
        containerEl.innerHTML = '<div class="small text-secondary">Carregando...</div>';

        const { data: guias, error } = await supabaseClient
            .from('guias_estudo')
            .select('*')
            .eq('topico_id', topicoId)
            .eq('ativa', true)
            .order('nota_media', { ascending: false })
            .order('total_avaliacoes', { ascending: false });

        containerEl.innerHTML = '';

        if (error) {
            containerEl.innerHTML = `<div class="text-danger small">${error.message}</div>`;
            return;
        }

        if (!guias || guias.length === 0) {
            if (vazioEl) vazioEl.classList.remove('d-none');
            return;
        }
        if (vazioEl) vazioEl.classList.add('d-none');

        guias.forEach(g => containerEl.appendChild(criarCardGuia(g)));
    }

    function criarCardGuia(guia) {
        const card = document.createElement('div');
        card.className = 'card-soft';
        card.innerHTML = `
            <div class="d-flex justify-content-between align-items-center gap-2">
                <div class="fw-semibold">${escapeHtmlLocal(guia.titulo)}</div>
                <div class="text-end text-nowrap small">
                    <span class="estrelas-readonly">${renderEstrelasReadonly(guia.nota_media)}</span>
                    <span class="text-secondary txt-resumo-nota">${guia.nota_media} (${guia.total_avaliacoes})</span>
                </div>
            </div>
            <button type="button" class="btn btn-outline-secondary btn-sm btn-ver-guia mt-2">
                <i class="bi bi-arrows-fullscreen"></i> Ler guia
            </button>
        `;

        function atualizarResumo(guiaAtualizada) {
            card.querySelector('.estrelas-readonly').textContent = renderEstrelasReadonly(guiaAtualizada.nota_media);
            card.querySelector('.txt-resumo-nota').textContent = `${guiaAtualizada.nota_media} (${guiaAtualizada.total_avaliacoes})`;
        }

        card.querySelector('.btn-ver-guia').addEventListener('click', () => {
            abrirModalLeitura(guia, atualizarResumo);
        });

        return card;
    }

    return { renderListaGuias };
})();
