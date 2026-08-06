#!/usr/bin/env python3
"""
processar_edital.py — ipassei

Extrai texto de um ou mais PDFs de edital (principal + anexos separados),
manda para a API do Gemini processar em JSON estruturado, e salva o
resultado pronto para colar em admin/editais.html.

Suporta os DOIS provedores de IA que o sistema já usa em admin/provedores.html
(mesmo padrão do chamarIA() das Edge Functions: tipo_api "gemini" ou
"openai_compatible"):

    --provedor gemini   -> Google Gemini (padrão)
    --provedor groq     -> Groq (Llama), API compatível com OpenAI

USO:
    python processar_edital.py edital.pdf
    python processar_edital.py edital.pdf requisitos.pdf conteudo.pdf --provedor groq
    python processar_edital.py *.pdf --saida cesama_resultado.json

Requisitos:
    pip install pypdf google-generativeai requests --break-system-packages

Configuração (defina a chave do provedor escolhido):
    Gemini:  export GEMINI_API_KEY="sua_chave_aqui"
    Groq:    export GROQ_API_KEY="sua_chave_aqui"

    Windows (PowerShell):  $env:GEMINI_API_KEY = "sua_chave_aqui"

    Ou passe --api-key na linha de comando.
"""

import argparse
import json
import os
import re
import sys

try:
    from pypdf import PdfReader
except ImportError:
    sys.exit("Falta instalar: pip install pypdf --break-system-packages")


# ---------- Extração de texto ----------

def extrair_texto_pdf(caminho: str) -> str:
    """Extrai texto de um PDF, página por página."""
    reader = PdfReader(caminho)
    partes = []
    for i, page in enumerate(reader.pages):
        texto = page.extract_text() or ""
        partes.append(f"\n--- página {i + 1} ---\n{texto}")
    return "".join(partes)


def montar_texto_completo(caminhos: list[str]) -> str:
    """
    Concatena o texto de vários PDFs, rotulando cada um pelo nome do
    arquivo. Isso ajuda a IA a entender que, por exemplo, requisitos.pdf
    é o Anexo I e conteudo.pdf é o Anexo II do mesmo edital.
    """
    blocos = []
    for caminho in caminhos:
        nome = os.path.basename(caminho)
        print(f"Lendo {nome}...", file=sys.stderr)
        texto = extrair_texto_pdf(caminho)
        blocos.append(f"\n\n===== ARQUIVO: {nome} =====\n{texto}")
    return "".join(blocos)


# ---------- Prompt / schema ----------

PROMPT_SISTEMA = """Você é um extrator de dados de editais de concurso público brasileiro.

Você vai receber o texto (extraído de PDF, pode ter ruído de OCR/quebras de linha)
de um edital completo — às vezes o edital principal e seus anexos (requisitos,
conteúdo programático, cronograma) vêm em arquivos separados, junte tudo em uma
única estrutura coerente.

Devolva SOMENTE um JSON válido (sem markdown, sem ```json, sem texto antes ou depois),
seguindo EXATAMENTE este schema (é o schema que admin/editais.html espera receber colado):

{
  "resumo_geral": "string - resumo em 3-5 frases: o que é o concurso, quantas vagas totais, níveis de escolaridade envolvidos, nota mínima de aprovação etc",
  "orgao_responsavel": "string - nome da instituição/órgão que abriu o concurso",
  "banca_organizadora": "string - nome da banca organizadora",
  "taxa_inscricao": "string - valor(es) da taxa de inscrição, com a escolaridade a que se referem se houver mais de um valor",
  "salario_geral": "string - faixa salarial geral do concurso, texto livre (ex: 'R$ 1.895,80 a R$ 9.065,06')",
  "cargos": [
    {
      "nome": "string - nome completo do cargo/emprego",
      "vagas": 0,
      "salario": "string - salário desse cargo específico",
      "requisitos": "string - requisitos de escolaridade/habilitação do Anexo de requisitos. IMPORTANTE: mencione explicitamente o nível de ensino (fundamental / médio / técnico / superior) dentro desse texto, porque é dele que o nível é inferido automaticamente",
      "conteudo_programatico": [
        {
          "materia": "string - nome da disciplina",
          "importancia": "baixa | media | alta - ver regra de importância abaixo",
          "topicos": ["tópico 1", "tópico 2", "..."]
        }
      ]
    }
  ],
  "cronograma": [
    {"evento": "string", "data": "string ou intervalo, no formato encontrado no edital"}
  ],
  "conteudo_programatico_geral": [
    {
      "materia": "string - nome da disciplina",
      "importancia": "baixa | media | alta - ver regra de importância abaixo",
      "topicos": ["tópico 1", "tópico 2", "..."]
    }
  ],
  "informacoes_adicionais": "string - qualquer coisa relevante fora do padrão (anexos publicados separadamente, particularidades do concurso etc)"
}

REGRA DE IMPORTÂNCIA ("importancia" de cada matéria):
- Baseie-se no peso REAL daquela matéria dentro da prova DAQUELE cargo, não em achismo. Priorize, nesta ordem:
  1. Se o edital tiver uma tabela de composição da prova (número de questões × pontos por questão × valor
     total por matéria, tipo as tabelas do item 10 de editais AOCP/FGV/Cesgranrio), calcule a proporção de
     pontos que cada matéria representa no total da prova objetiva daquele cargo. Proporção alta (a matéria
     concentra muito mais pontos que as outras) = "alta". Proporção mediana = "media". Proporção pequena
     (poucas questões, poucos pontos, matéria "coadjuvante") = "baixa".
  2. Na ausência de tabela de pontuação, use menções explícitas do edital tipo "maior incidência",
     "principal foco", "caráter eliminatório e classificatório para X" etc.
  3. Se não houver nenhuma base objetiva pra diferenciar as matérias daquele cargo, use "media" pra todas
     (não invente diferença que o edital não sustenta).
- Line de base útil: "Conhecimentos Específicos" quase sempre tem mais questões/pontos que "Noções de
  Informática" ou "Conhecimentos Gerais" — isso normalmente já justifica "alta" pra específicos e "baixa"
  pras genéricas, quando a tabela confirmar essa diferença de peso.

REGRAS IMPORTANTES:
- "conteudo_programatico_geral" é para disciplinas idênticas e compartilhadas por TODOS os cargos do
  edital (ex: Língua Portuguesa igual pra todo mundo). Coloque aí SOMENTE o que é 100% igual pra todos.
- "conteudo_programatico" (dentro de cada cargo) é para as disciplinas próprias/específicas daquele
  cargo, OU para disciplinas comuns que não se repetem em todos (ex: Raciocínio Lógico que só existe
  pra alguns níveis). Na dúvida, prefira colocar dentro do cargo em vez de no bloco geral — é mais
  seguro do que generalizar errado.
- Cada "topicos" deve ser uma lista com um item por número/ponto do edital, não um bloco de texto
  único. Isso é usado depois para casar cada tópico com a árvore de assuntos do banco de dados.
- "vagas" deve ser number. Se não encontrar, use 0.
- Se não houver informação para um campo string, use "" (nunca omita a chave). Listas vazias como [].
- Não invente informação que não está no texto.
"""


def chamar_gemini(texto_edital: str, api_key: str, modelo: str) -> dict:
    try:
        import google.generativeai as genai
    except ImportError:
        sys.exit("Falta instalar: pip install google-generativeai --break-system-packages")

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name=modelo,
        generation_config={"response_mime_type": "application/json"},
    )
    resposta = model.generate_content([PROMPT_SISTEMA, texto_edital])
    bruto = resposta.text.strip()
    bruto = _limpar_cercas_codigo(bruto)
    return json.loads(bruto)


def chamar_groq(texto_edital: str, api_key: str, modelo: str) -> dict:
    try:
        import requests
    except ImportError:
        sys.exit("Falta instalar: pip install requests --break-system-packages")

    resp = requests.post(
        "https://api.groq.com/openai/v1/chat/completions",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        json={
            "model": modelo,
            "messages": [
                {"role": "system", "content": PROMPT_SISTEMA},
                {"role": "user", "content": texto_edital},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0.2,
        },
        timeout=180,
    )
    resp.raise_for_status()
    bruto = resp.json()["choices"][0]["message"]["content"].strip()
    bruto = _limpar_cercas_codigo(bruto)
    return json.loads(bruto)


def _limpar_cercas_codigo(texto: str) -> str:
    """Remove ```json / ``` caso o modelo insista em mandar markdown."""
    return re.sub(r"^```(json)?|```$", "", texto, flags=re.MULTILINE).strip()


# ---------- Main ----------

def main():
    parser = argparse.ArgumentParser(description="Processa edital(is) PDF via IA e gera JSON estruturado.")
    parser.add_argument("pdfs", nargs="+", help="Caminho de um ou mais arquivos PDF (edital + anexos)")
    parser.add_argument("--saida", default=None, help="Nome do arquivo JSON de saída (default: <primeiro_pdf>_resultado.json)")
    parser.add_argument("--provedor", choices=["gemini", "groq"], default="gemini", help="Qual IA usar (default: gemini)")
    parser.add_argument("--api-key", default=None, help="Chave da API (default: lê GEMINI_API_KEY ou GROQ_API_KEY conforme --provedor)")
    parser.add_argument("--modelo", default=None, help="Nome do modelo (default: gemini-2.0-flash ou llama-3.3-70b-versatile)")
    args = parser.parse_args()

    if args.provedor == "gemini":
        api_key = args.api_key or os.environ.get("GEMINI_API_KEY")
        modelo = args.modelo or "gemini-2.0-flash"
        chamar_ia = chamar_gemini
        var_esperada = "GEMINI_API_KEY"
    else:
        api_key = args.api_key or os.environ.get("GROQ_API_KEY")
        modelo = args.modelo or "llama-3.3-70b-versatile"
        chamar_ia = chamar_groq
        var_esperada = "GROQ_API_KEY"

    if not api_key:
        sys.exit(f"Defina {var_esperada} no ambiente ou passe --api-key SUACHAVE")

    for caminho in args.pdfs:
        if not os.path.isfile(caminho):
            sys.exit(f"Arquivo não encontrado: {caminho}")

    texto_completo = montar_texto_completo(args.pdfs)
    print(f"Texto extraído: {len(texto_completo)} caracteres. Enviando para {args.provedor} ({modelo})...", file=sys.stderr)

    resultado = chamar_ia(texto_completo, api_key, modelo)

    saida = args.saida or (os.path.splitext(os.path.basename(args.pdfs[0]))[0] + "_resultado.json")
    with open(saida, "w", encoding="utf-8") as f:
        json.dump(resultado, f, ensure_ascii=False, indent=2)

    n_cargos = len(resultado.get("cargos", []))
    print(f"\nPronto! {n_cargos} cargo(s) extraído(s).", file=sys.stderr)
    print(f"Arquivo salvo em: {saida}", file=sys.stderr)
    print("Cole o conteúdo em admin/editais.html e clique em 'Pré-visualizar'.", file=sys.stderr)


if __name__ == "__main__":
    main()
