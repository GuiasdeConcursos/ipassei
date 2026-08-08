// assets/menu-toggle.js
// Cria o botão de abrir/fechar a sidebar e controla o comportamento:
// - No celular (<=900px): a sidebar nasce escondida (como já era antes), e esse
//   botão é o único jeito de abrir — sem ele, não tinha como acessar o menu.
// - No computador: o botão esconde/mostra a sidebar sob pedido, e lembra a
//   preferência (localStorage) pra próxima vez que a pessoa abrir o site.

(function () {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inicializar);
    } else {
        inicializar();
    }

    function inicializar() {
        const sidebar = document.querySelector('.sidebar');
        const mainWrap = document.querySelector('.main-wrap');
        const topbar = document.querySelector('.topbar');
        if (!sidebar || !mainWrap || !topbar) return;
        if (document.querySelector('.menu-toggle')) return; // evita duplicar se o script rodar 2x

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'menu-toggle';
        btn.innerHTML = '<i class="bi bi-list"></i>';
        btn.setAttribute('aria-label', 'Abrir ou fechar o menu');
        topbar.insertBefore(btn, topbar.firstChild);

        const overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay';
        document.body.appendChild(overlay);

        function ehMobile() {
            return window.innerWidth <= 900;
        }

        function aplicarPreferenciaSalva() {
            if (ehMobile()) return; // no celular sempre nasce fechado, não usa preferência salva
            const escondidoSalvo = localStorage.getItem('ipassei_menu_escondido') === '1';
            if (escondidoSalvo) {
                sidebar.classList.add('menu-fechado');
                mainWrap.classList.add('menu-fechado-wrap');
            }
        }
        aplicarPreferenciaSalva();

        function alternar() {
            if (ehMobile()) {
                const abrindo = !sidebar.classList.contains('menu-aberto-mobile');
                sidebar.classList.toggle('menu-aberto-mobile', abrindo);
                overlay.classList.toggle('ativo', abrindo);
            } else {
                const escondendo = !sidebar.classList.contains('menu-fechado');
                sidebar.classList.toggle('menu-fechado', escondendo);
                mainWrap.classList.toggle('menu-fechado-wrap', escondendo);
                localStorage.setItem('ipassei_menu_escondido', escondendo ? '1' : '0');
            }
        }

        btn.addEventListener('click', alternar);

        overlay.addEventListener('click', () => {
            sidebar.classList.remove('menu-aberto-mobile');
            overlay.classList.remove('ativo');
        });

        sidebar.querySelectorAll('a.nav-link').forEach(a => {
            a.addEventListener('click', () => {
                if (ehMobile()) {
                    sidebar.classList.remove('menu-aberto-mobile');
                    overlay.classList.remove('ativo');
                }
            });
        });

        window.addEventListener('resize', () => {
            if (ehMobile()) {
                sidebar.classList.remove('menu-fechado');
                mainWrap.classList.remove('menu-fechado-wrap');
            } else {
                sidebar.classList.remove('menu-aberto-mobile');
                overlay.classList.remove('ativo');
                aplicarPreferenciaSalva();
            }
        });
    }
})();
