"""
Insere os 3 links de menu novos (Revisar Questões de usuários, Reportes de
Questões, Feedbacks) em TODOS os arquivos .html dentro da pasta admin/,
logo antes da linha '<div class="section-label">Conta</div>'.

Não mexe em mais nada no arquivo — só insere essas 3 linhas, e só nos
arquivos que ainda não têm (não duplica se rodar de novo por engano).

Uso:
    1. Coloca esse arquivo dentro da pasta que CONTÉM a pasta admin/
       (ou ajusta a variável PASTA_ADMIN abaixo pro caminho certo).
    2. Roda: python inserir_links_admin.py
"""

import os
import glob

PASTA_ADMIN = "."  # ajuste se sua pasta admin tiver outro caminho

LINKS_NOVOS = (
    '        <a href="revisar-questoes-usuario.html" class="nav-link"><i class="bi bi-patch-question"></i> Revisar Questões (usuários)</a>\n'
    '        <a href="revisar-reportes.html" class="nav-link"><i class="bi bi-flag"></i> Reportes de Questões</a>\n'
    '        <a href="feedbacks.html" class="nav-link"><i class="bi bi-chat-square-dots"></i> Feedbacks</a>\n'
)

LINK_TOPICOS = '        <a href="topicos.html" class="nav-link"><i class="bi bi-list-nested"></i> Tópicos</a>\n'
ANCORA_MATERIAS = '<a href="materias.html" class="nav-link"><i class="bi bi-diagram-3"></i> Matérias</a>'

LINK_GUIAS = '        <a href="guias.html" class="nav-link"><i class="bi bi-journal-bookmark"></i> Guias de Estudo</a>\n'
ANCORA_TOPICOS = '<a href="topicos.html" class="nav-link"><i class="bi bi-list-nested"></i> Tópicos</a>'

LINK_FINANCEIRO = '        <a href="financeiro.html" class="nav-link"><i class="bi bi-graph-up"></i> Financeiro</a>\n'
ANCORA_PRECOS = '<a href="precos.html" class="nav-link"><i class="bi bi-cash-coin"></i> Preços</a>'

LINK_FIDELIDADE = '        <a href="fidelidade.html" class="nav-link"><i class="bi bi-gift"></i> Programa de Fidelidade</a>\n'
ANCORA_FINANCEIRO = '<a href="financeiro.html" class="nav-link"><i class="bi bi-graph-up"></i> Financeiro</a>'

LINK_QUESTOES = '        <a href="questoes.html" class="nav-link"><i class="bi bi-patch-question"></i> Questões</a>\n'
PLACEHOLDER_QUESTOES = '<span class="nav-link disabled"><i class="bi bi-patch-question"></i> Questões (em breve)</span>'

ANCORA = '<div class="section-label">Conta</div>'

def processar_arquivo(caminho):
    with open(caminho, "r", encoding="utf-8") as f:
        conteudo = f.read()

    mudou = False

    if "topicos.html" not in conteudo and ANCORA_MATERIAS in conteudo:
        conteudo = conteudo.replace(ANCORA_MATERIAS, ANCORA_MATERIAS + "\n" + LINK_TOPICOS.rstrip("\n"), 1)
        mudou = True

    # Se a âncora de Tópicos não existia antes desse replace mas foi inserida agora,
    # ainda vale conferir "guias.html" separadamente (pode já existir Tópicos sem Guias).
    if "guias.html" not in conteudo:
        if ANCORA_TOPICOS in conteudo:
            conteudo = conteudo.replace(ANCORA_TOPICOS, ANCORA_TOPICOS + "\n" + LINK_GUIAS.rstrip("\n"), 1)
            mudou = True
        elif ANCORA_MATERIAS in conteudo:
            # sem Tópicos ainda (não deveria acontecer, mas por garantia): põe Guias logo após Matérias
            conteudo = conteudo.replace(ANCORA_MATERIAS, ANCORA_MATERIAS + "\n" + LINK_GUIAS.rstrip("\n"), 1)
            mudou = True

    if "financeiro.html" not in conteudo and ANCORA_PRECOS in conteudo:
        conteudo = conteudo.replace(ANCORA_PRECOS, ANCORA_PRECOS + "\n" + LINK_FINANCEIRO.rstrip("\n"), 1)
        mudou = True

    if "fidelidade.html" not in conteudo:
        if ANCORA_FINANCEIRO in conteudo:
            conteudo = conteudo.replace(ANCORA_FINANCEIRO, ANCORA_FINANCEIRO + "\n" + LINK_FIDELIDADE.rstrip("\n"), 1)
            mudou = True
        elif ANCORA_PRECOS in conteudo:
            conteudo = conteudo.replace(ANCORA_PRECOS, ANCORA_PRECOS + "\n" + LINK_FIDELIDADE.rstrip("\n"), 1)
            mudou = True

    if "questoes.html" not in conteudo:
        if PLACEHOLDER_QUESTOES in conteudo:
            conteudo = conteudo.replace(PLACEHOLDER_QUESTOES, LINK_QUESTOES.strip(), 1)
            mudou = True
        elif ANCORA_TOPICOS in conteudo:
            conteudo = conteudo.replace(ANCORA_TOPICOS, ANCORA_TOPICOS + "\n" + LINK_QUESTOES.rstrip("\n"), 1)
            mudou = True

    if "revisar-questoes-usuario.html" not in conteudo:
        if ANCORA not in conteudo:
            print(f"AVISO: não achei a âncora 'Conta' em {caminho} — não mexi nessa parte, confere manualmente.")
        else:
            conteudo = conteudo.replace(ANCORA, LINKS_NOVOS + "        " + ANCORA, 1)
            mudou = True

    if not mudou:
        print(f"pulado (já tem tudo): {caminho}")
        return

    with open(caminho, "w", encoding="utf-8") as f:
        f.write(conteudo)
    print(f"atualizado: {caminho}")


def main():
    arquivos = glob.glob(os.path.join(PASTA_ADMIN, "*.html"))
    if not arquivos:
        print(f"Nenhum .html encontrado em '{PASTA_ADMIN}/'. Ajuste a variável PASTA_ADMIN no topo do script.")
        return
    for caminho in arquivos:
        processar_arquivo(caminho)


if __name__ == "__main__":
    main()
