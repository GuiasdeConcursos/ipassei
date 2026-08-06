# ipassei — Mapa do Projeto

> Documento de referência independente de qualquer conversa. Se você iniciar um chat novo (com Claude ou outra IA), cole este arquivo inteiro no início pra recuperar o contexto completo do sistema.

**Última atualização:** conteúdo reflete tudo construído até a Fase 16 (vínculo automático de matérias por cargo em editais).

---

## 1. O que é o ipassei

Plataforma web de estudos para concursos públicos brasileiros. Usuário estuda por matéria, por concurso específico ou por pontos fracos; gera questões novas via IA ou reaproveita um banco de questões já existente (gratuito ou mais barato); paga por créditos via PIX. Tem um banco de **~69 mil questões reais importadas** de uma base externa, mais um banco de **33 mil tópicos/assuntos** hierárquicos.

**Domínio:** `guiasdeconcursos.github.io/ipassei/` (site do usuário) e `guiasdeconcursos.github.io/ipassei/admin/` (painel administrativo, login separado).

---

## 2. Arquitetura geral

```
┌─────────────────────┐      ┌──────────────────────────┐      ┌─────────────────┐
│  GitHub Pages        │      │  Supabase                │      │  APIs externas   │
│  (site estático)      │◄────►│  - Postgres (banco)      │◄────►│  - Gemini/Groq   │
│  HTML + JS puro,      │      │  - Auth (login)          │      │    (geração IA)  │
│  Bootstrap 5 via CDN   │      │  - Edge Functions (Deno) │      │  - Asaas (PIX)   │
└─────────────────────┘      └──────────────────────────┘      └─────────────────┘
```

- **Sem framework** — cada página é um `.html` autocontido com `<script>` inline, chamando o Supabase direto via `supabase-js` (CDN).
- **Sem build step** — o que está no GitHub é exatamente o que roda.
- **Toda lógica sensível** (créditos, chamadas de IA, pagamento) fica em **Edge Functions**, nunca no front-end.

---

## 3. Estrutura de pastas no GitHub

```
/ (raiz do site do usuário)
├── index.html, login.html, dashboard.html, perfil.html
├── creditos.html          — comprar créditos via PIX
├── gerar.html             — gerar questões (árvore de tópicos livre)
├── estudar-concurso.html  — gerar questões por concurso + cargo
├── edital.html            — ver edital destrinchado por concurso
├── revisao.html           — repetir questões já respondidas (sem IA)
├── pontos-fracos.html     — ranking de erros + gerar questões desses assuntos
├── filtros.html           — filtros de estudo salvos
├── historico.html         — histórico de tentativas
├── desempenho.html        — desempenho por matéria/banca/concurso
├── assets/
│   ├── style.css          — tema visual (cores Mariner/Mystic/River Bed/Fountain Blue)
│   ├── supabase-config.js — conexão + exigirLogin() + fazerLogout()
│   └── img/logo.png       — logo "ipassei" (fundo transparente)
│
└── admin/                 — ÁREA ADMINISTRATIVA, login e acesso SEPARADOS do site
    ├── login.html          — login exclusivo (email/senha, checa role admin/moderador)
    ├── concursos.html      — vincula matérias/cargos a cada concurso
    ├── bancas.html         — CRUD de bancas + prompt de estilo de questão/redação
    ├── materias.html       — editar a árvore de 33 mil tópicos (add/renomear/apagar)
    ├── usuarios.html       — gestão de usuários (role, bloqueio, créditos)
    ├── precos.html         — editar config_precos e pacotes_creditos
    ├── provedores.html     — qual motor de IA está ativo (só 1 por vez)
    ├── testar-ia.html      — testa se um provedor de IA está respondendo
    ├── creditos.html       — relatório financeiro (créditos por ação/usuário/data)
    ├── importar-pdf.html   — extrai questões de PDF de provas antigas
    ├── revisar-migracao.html — resolve pendências da migração de questões externas
    ├── resolver-gabaritos.html — IA resolve gabarito de questões importadas sem resposta
    ├── editais.html        — cola o JSON de edital processado (ver seção 9)
    └── assets/
        └── admin-config.js — conexão + exigirAdmin() + fazerLogoutAdmin()
```

---

## 4. Banco de dados — tabelas principais (schema `public`)

| Tabela | Papel |
|---|---|
| `usuarios_perfil` | Perfil complementar ao `auth.users`. Tem `role` (usuario/moderador/admin), `saldo_creditos`, `bloqueado`, `cpf_cnpj`, `asaas_customer_id` |
| `provedores_ia` | Motores de IA cadastrados. `tipo_api` (`gemini` ou `openai_compatible`), `api_base_url`, `nome_secret_api_key` (nome do secret no Supabase), `ativo` (só 1 por vez) |
| `perfis_banca` | Bancas (FGV, Cesgranrio, AOCP, FCC + ~236 importadas). `prompt_estilo_questao` guia a IA |
| `questoes` | Banco de questões. `origem` = `ia_comunidade` / `ia_admin` / `pdf_extraido` / `manual` / `importado_externo`. `resposta_correta` pode ser NULL (aguardando IA resolver). `ativa=false` esconde do usuário |
| `tentativas` | Histórico de respostas do usuário, com `tempo_gasto_segundos` |
| `explicacoes_geradas` / `materias_explicativas` | Cache: 1 registro por questão (gerado 1x, nunca de novo) |
| `acessos_pagos` | Controla quem já pagou por qual conteúdo extra (1x por usuário) |
| `config_precos` | Preço em créditos de cada ação (`acao` é chave única) |
| `transacoes_creditos` | Todo movimento de crédito, com `acao` pra saber qual funcionalidade gastou |
| `pagamentos_pix` / `pacotes_creditos` | PIX via Asaas |
| `concursos` | Concursos reais (Dataprev, CESAMA, Petrobras, etc.) |
| `concurso_cargos` | **Cargos dentro de um concurso** (nome, nivel_ensino, vagas, salário, requisitos) |
| `concurso_topicos` | Vínculo matéria↔concurso, com `relevancia` (baixa/média/alta) e `cargo_id` **opcional** (null = vale pra todos os cargos; preenchido = só daquele cargo) |
| `concurso_edital` | Edital destrinchado por IA: `informacoes` (jsonb) com resumo, cargos (cada um com seu próprio `conteudo_programatico`), cronograma |
| `filtros_salvos` | Combinações de filtro que o usuário salvou pra reusar |

### Schema separado: `concursos.disciplinas_topicos`
Árvore de **~33.845 tópicos** com autorrelacionamento (`topico_pai_id`), importada de um CSV do usuário. Hierarquia sem limite de níveis (matéria → assunto → sub-assunto...). Mora num schema separado por decisão do usuário (não mexer, funciona bem).

### Tabelas de staging (migração de questões externas — ver seção 8)
`staging_questoes_raw`, `staging_banca_mapeamento`, `staging_topico_mapeamento` — usadas só durante a importação em massa, podem ser truncadas depois de confirmar que os dados foram bem transformados.

---

## 5. Funções e views importantes (Postgres)

| Nome | Pra que serve |
|---|---|
| `arvore_filhos(pai_id)` | Lista filhos de um nó da árvore (navegação) |
| `buscar_topicos(termo, materia_id_filtro)` | Busca fuzzy por nome na árvore |
| `caminho_topico(id)` | Devolve "Matéria > Assunto > Sub-assunto" |
| `materia_raiz(id)` | Acha a matéria-raiz de qualquer tópico |
| `folhas_de(id)` | Expande um nó (matéria inteira) em todos os assuntos-folha |
| `concursos_do_topico(id)` | Dado um tópico, acha a quais concursos ele pertence (sobe a árvore) |
| `buscar_melhor_topico(termo, contexto)` | Casamento automático (exato → similaridade) usado na migração e no vínculo de edital |
| `eh_admin_ou_moderador()` | Função SECURITY DEFINER usada em política RLS de `usuarios_perfil` — **nunca reference `usuarios_perfil` direto dentro de uma política da própria tabela, causa recursão infinita** (já quebrou o site 1x, ver seção 10) |
| `admin_listar_usuarios / admin_atualizar_usuario / admin_adicionar_creditos` | RPCs admin-only (checam role internamente) |
| `vw_desempenho_por_materia/banca/concurso` | Views de desempenho do usuário |
| `vw_ranking_erros_usuario` / `vw_ranking_erros_por_concurso` | Ranking de pontos fracos |
| `vw_historico_usuario` | Alimenta a tela de histórico |

---

## 6. Edge Functions (Deno, em `supabase/functions/`)

| Função | Faz o quê | Verify JWT |
|---|---|---|
| `gerar-questao` | Gera 1 questão (modo existente ou inédita) | ON |
| `gerar-questoes-lote` | Gera várias, com **distribuição em rodízio justa** entre matérias selecionadas | ON |
| `obter-conteudo-extra` | Explicação detalhada / matéria explicativa, com cache | ON |
| `revisar-questoes` | Repete questões já existentes, **nunca chama IA**. Aceita `apenas_historico` (true=só o que o usuário já respondeu, false=banco inteiro) | ON |
| `gerar-cobranca-pix` | Cria cobrança no Asaas | ON |
| `webhook-asaas` | Recebe confirmação de pagamento do Asaas | **OFF** (chamada pelo Asaas, não pelo usuário) |
| `testar-ia` | Testa se um provedor responde, sem gastar crédito | ON |
| `extrair-questoes-pdf` | Admin sobe PDF de prova antiga, IA separa em questões candidatas | ON |
| `resolver-gabaritos` | IA resolve gabarito de questões importadas sem resposta (lotes de até 20) | ON |
| `processar-edital` | **Parcialmente substituída** por script local (ver seção 9), ainda existe mas raramente usada — tem risco de estourar o timeout de 150s do Supabase em editais grandes |

### Padrão comum a todas que chamam IA
Toda Edge Function que fala com IA tem uma função `chamarIA(provedor, prompt, exigirJSON)` **duplicada em cada arquivo** (não há import compartilhado entre Edge Functions nesse setup) que sabe falar tanto o formato Gemini quanto o formato compatível-OpenAI (Groq), decidindo pelo campo `provedor.tipo_api`. Isso é o que permite trocar de motor de IA (Admin → Provedores IA) sem mexer em código.

---

## 7. Sistema de créditos

- Usuário compra créditos via PIX (Asaas) → `pagamentos_pix` + `webhook-asaas` credita automaticamente.
- Cada ação tem um preço em `config_precos` (editável em Admin → Preços): `gerar_questao_inedita`, `responder_existente`, `ver_explicacao`, `ver_materia`, `revisar_questao_respondida`.
- **Regra de reaproveitamento**: gerar questão inédita cobra o preço cheio; responder uma que já existe no banco cobra menos (ou não gera nada novo, sempre que possível — só cai pra IA se não achar nada existente).
- **Regra de conteúdo extra (explicação/matéria)**: gerado 1x por questão (cache), mas **cada usuário paga sua própria primeira vez**, mesmo que o conteúdo já exista.
- Toda transação vai pra `transacoes_creditos` com um campo `acao` que alimenta o relatório financeiro do admin.

---

## 8. Migração de banco de questões externo (~1,4 milhão de questões numa base separada)

Processo feito em etapas (arquivos `migracao_etapa*.sql`, `fase_*` no histórico):

1. Exportação via `psql` (banco externo → CSV → `staging_questoes_raw` no Supabase, usando `\copy`)
2. Casamento automático de bancas (por nome) e tópicos (nome exato → similaridade `pg_trgm`)
3. Cadastro automático de bancas com 50+ questões (~236 bancas reais, cobrindo 97% do volume)
4. Revisão manual do que sobrou (`admin/revisar-migracao.html`)
5. Transformação final: `jqst->'opcoes'` (JSON) → `alternativas`; `jqst->'corpo'` (HTML) → `enunciado` limpo; `nivel`/`ensino` → `dificuldade`/`nivel_ensino`
6. **Resultado do 1º lote (200 mil linhas testadas):** 69.182 questões com gabarito confiável importadas ativas; ~82.525 sem gabarito importadas **inativas**, aguardando `admin/resolver-gabaritos.html`

**Limite real:** plano gratuito do Supabase tem 500 MB — ainda não se sabe quantas questões cabem no total das 1,4 milhão. Verificar `Settings → Database` antes de trazer mais lotes.

---

## 9. Editais — processamento e vínculo automático

**Por que mudou de arquitetura:** processar um edital inteiro (às vezes 100+ páginas) via Edge Function estourava o limite de **150 segundos** do Supabase. Solução: mover o processamento pesado pra um **script Python local**, sem limite de tempo.

**Fluxo atual:**
1. Admin roda `processar_edital.py caminho/do/edital.pdf` no próprio computador (usa `pypdf` pra extrair texto + chama a API do Gemini direto, mesmo schema/prompt da Edge Function)
2. Gera um `..._resultado.json`
3. Admin cola esse JSON em `admin/editais.html` → **botão "Pré-visualizar" mostra tudo antes de salvar** (nada grava até confirmar)
4. Confirma → grava em `concurso_edital`
5. Botão "Criar cargos" → cria `concurso_cargos` a partir do array `cargos[]` (infere `nivel_ensino` por palavra-chave nos requisitos)
6. **Automaticamente**, tenta vincular o `conteudo_programatico` de cada cargo à árvore de tópicos (via `buscar_melhor_topico`), criando `concurso_topicos` já com o `cargo_id` certo
7. O que não casar sozinho vira uma lista de revisão manual, na própria tela

**Descoberta importante:** conteúdo programático **muda por cargo** dentro do mesmo edital (nível médio ≠ nível superior) — por isso o schema tem `cargos[].conteudo_programatico`, não uma lista única pro edital inteiro.

**Limitação conhecida:** alguns editais (ex: o da CESAMA testado) têm os Anexos (requisitos, conteúdo programático, cronograma) publicados como **arquivos separados**, não inclusos no PDF principal — é preciso achar e processar esses anexos à parte.

---

## 10. Armadilhas já resolvidas (não repetir)

| Problema | Causa | Solução |
|---|---|---|
| Site inteiro caiu (erro 500 em `usuarios_perfil`) | Política RLS referenciando a própria tabela dentro dela mesma = recursão infinita | Sempre usar função `security definer` (ex: `eh_admin_ou_moderador()`) pra políticas que checam role, nunca subquery direta na mesma tabela |
| Edge Function trava com "non-2xx status code" | Timeout de **150s** do Supabase (fixo, não dá pra aumentar) | Processos pesados (edital grande) devem rodar fora do Supabase (script local) |
| Login com Google redireciona pra `localhost:3000` | Site URL desatualizada no Supabase Auth | `Authentication → URL Configuration → Site URL` precisa ser a URL real do GitHub Pages |
| CORS ao chamar Edge Function do navegador | Falta tratar `OPTIONS` e mandar `Access-Control-Allow-*` | Todo Edge Function tem bloco `corsHeaders` + `if (req.method === "OPTIONS") return ...` |
| `pdf.js` versão 4+ não carrega como `<script>` comum | A partir da v4, só distribuído como módulo ES (`.mjs`) | Usar versão **3.11.174** (última clássica) |
| Emails de confirmação não chegam / limite baixo | Servidor de email padrão do Supabase é bem restrito | Configurar SMTP próprio (Gmail com senha de app funcionou, mas conta **muito nova** pode ser bloqueada por segurança do Google — conta mais antiga resolveu) |
| Modelo Gemini retorna 404 | Google aposenta modelos com frequência | Trocar `identificador_modelo` em Admin → Provedores IA (não precisa mexer em código) |
| Erro "structure of query does not match function result type" | Tipo `varchar` vs `text` incompatível em função `RETURNS TABLE` | Sempre dar cast explícito (`::text`) em colunas de `auth.users` |
| `CREATE POLICY IF NOT EXISTS` | Não existe essa sintaxe no Postgres | Usar `DROP POLICY IF EXISTS` + `CREATE POLICY` |

---

## 11. Configuração / credenciais (nomes, não valores — nunca colar segredo real aqui)

**Secrets no Supabase (Edge Functions → Manage secrets):**
`GEMINI_API_KEY`, `GROQ_API_KEY` (se configurado), `ASAAS_API_KEY`, `ASAAS_API_URL`, `ASAAS_WEBHOOK_TOKEN`

**Supabase:**
- URL do projeto: `https://rgfgdbdlghsbgspepudc.supabase.co`
- Schema exposto: `public` (não expôs `concursos` na API — tudo acessa via RPC que já lida com isso internamente)

**Pagamento:** Asaas em modo sandbox até decidir ir pra produção.

---

## 12. O que ainda falta (roadmap conhecido)

- Módulo de **redação** (schema já existe: `temas_redacao`, `redacoes_usuario`, `correcoes_redacao`, `perfis_banca.prompt_estilo_redacao` — nunca implementado o fluxo/telas)
- **Ranking** da comunidade (view já existe: `vw_ranking_contribuicao` — falta tela)
- **Gestão de questões** no admin (ver/editar/apagar questões existentes — item "em breve" no menu)
- Processar mais lotes da base externa de 1,4 milhão de questões (verificar espaço em disco antes)
- Resolver os ~82 mil gabaritos pendentes (processo contínuo, em lotes manuais)
- Achar e processar os anexos de conteúdo programático de editais que vieram incompletos

---

## 13. Como retomar numa conversa nova

1. Cole este arquivo inteiro na primeira mensagem
2. Diga o que quer fazer (ex: "quero continuar o módulo de redação do ipassei")
3. Se precisar, também vale colar os arquivos `.sql` mais recentes que ainda não rodou, ou o HTML da tela que quer alterar — isso poupa tempo de eu reconstruir do zero
