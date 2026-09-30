# Revisor Inteligente de Políticas · Cimed

Ferramenta web para o time de **Controles Internos / GRC** revisar políticas corporativas com apoio de inteligência artificial.

O usuário envia a política, a IA faz uma revisão crítica (clareza, tempo verbal, duplicidades, conceitos, papéis e responsabilidades, ambiguidades, riscos de interpretação, governança e controles internos) e o resultado aparece organizado em abas, com filtros, DE/PARA, política revisada com destaques e questionamentos para a área. A interface segue a identidade visual da Cimed (amarelo institucional com azul-marinho de apoio) e cada tema da revisão tem **seu próprio item de menu e sua própria tela**. O resultado pode ser baixado como **relatório HTML** (abre em qualquer navegador) e como **política revisada em .docx**.

> A IA **não cria regras, responsabilidades, alçadas, prazos ou aprovações** que não estejam no documento. Quando falta informação, ela registra um **questionamento para validação da área**. Alterações que podem mudar o sentido de uma regra aparecem marcadas como **“Requer validação da área”**.

---

## Sumário

1. [Requisitos](#1-requisitos)
2. [Instalação](#2-instalação)
3. [Configurar a API](#3-configurar-a-api)
4. [Executar](#4-executar)
5. [Como usar](#5-como-usar)
6. [Formatos aceitos](#6-formatos-aceitos)
7. [Relatório HTML e política revisada (.docx)](#7-relatório-html-e-política-revisada-docx)
8. [Como atualizar o prompt (regras de revisão)](#8-como-atualizar-o-prompt-regras-de-revisão)
9. [Disponibilizar para outros usuários](#9-disponibilizar-para-outros-usuários)
10. [Segurança e confidencialidade](#10-segurança-e-confidencialidade)
11. [Estrutura do projeto](#11-estrutura-do-projeto)
12. [Testes](#12-testes)
13. [Limitações](#13-limitações)
14. [Solução de problemas](#14-solução-de-problemas)

---

## 1. Requisitos

- **Node.js 20.12 ou superior** (recomendado: versão LTS mais recente). Baixe em <https://nodejs.org>.
- Uma **chave da API da Anthropic** (obtida no Console da Anthropic pelo responsável pela conta da empresa).
- Navegador atualizado (Chrome, Edge ou Firefox).

Para conferir a versão do Node.js, abra o terminal e execute:

```bash
node -v
```

## 2. Instalação

No terminal, dentro da pasta do projeto:

```bash
npm install
```

Esse comando baixa as bibliotecas necessárias (pasta `node_modules/`). Só é preciso repeti-lo quando o `package.json` mudar.

## 3. Configurar a API

1. Copie o arquivo `.env.example` para um novo arquivo chamado `.env`:
   - Windows (PowerShell): `Copy-Item .env.example .env`
   - macOS/Linux: `cp .env.example .env`
2. Abra o `.env` e preencha a chave:

   ```
   ANTHROPIC_API_KEY=sua-chave-aqui
   ```

3. Salve o arquivo e (re)inicie o servidor.

Regras importantes:

- A chave fica **somente no servidor**, no arquivo `.env` ou em variável de ambiente. Ela **nunca** é enviada ao navegador nem aparece no HTML/JavaScript.
- **Nunca** coloque a chave no código (`const apiKey = "..."`) nem envie o arquivo `.env` para o Git (ele já está no `.gitignore`).

Configurações opcionais (todas no `.env`, veja comentários em `.env.example`):

| Variável | Padrão | Para que serve |
|---|---|---|
| `ANTHROPIC_MODEL` | `claude-opus-5-5` | Modelo utilizado na revisão. |
| `REVIEW_EFFORT` | `high` | Profundidade da análise (`low`, `medium`, `high`, `xhigh`, `max`). |
| `REVIEW_MAX_TOKENS` | `64000` | Tamanho máximo da resposta da IA. |
| `PORT` / `HOST` | `3000` / `127.0.0.1` | Porta e endereço do servidor. |
| `APP_USER` / `APP_PASSWORD` | – | Exige usuário e senha para acessar a ferramenta. |
| `MAX_UPLOAD_MB` | `10` | Tamanho máximo do arquivo enviado. |
| `MAX_DOC_CHARS` | `300000` | Tamanho máximo do texto da política. |
| `MAX_CONCURRENT_REVIEWS` | `3` | Revisões simultâneas permitidas. |

## 4. Executar

```bash
npm start
```

Abra o navegador em **<http://localhost:3000>**.

Para parar o servidor, pressione `Ctrl + C` no terminal.

A ferramenta abre vazia, pronta para receber a sua política — não há documentos de exemplo.

## 5. Como usar

A navegação é feita pelo **menu lateral** (no celular, pelo botão ☰ no topo). Cada tema abre em uma tela própria.

1. **Enviar política** – arraste o arquivo para a área “Envie a política que deseja revisar” ou clique para selecionar. A ferramenta mostra nome, formato, status da leitura e a estrutura identificada (títulos, numeração, listas e tabelas). Use **Substituir arquivo** para trocar.
2. **Iniciar revisão** – a análise costuma levar alguns minutos. Mantenha a página aberta; é possível cancelar.
3. **Resultado da revisão** – ao final, o menu passa a exibir um item para cada tema, com a quantidade de apontamentos:
   - Resumo Executivo (cards com os totais e validação da estrutura mínima — sem “nota” da política);
   - Política Revisada;
   - DE/PARA;
   - Duplicidades;
   - Conceitos;
   - Papéis e Responsabilidades;
   - Ambiguidades;
   - Riscos de Interpretação;
   - Questionamentos para a Área;
   - Governança e Controles Internos;
   - Todos os Apontamentos (visão consolidada).
4. Em cada tema há **filtros**: pesquisa textual, seção da política, classificação (ajuste editorial / requer validação), categoria (DE/PARA) e tipo de apontamento (Todos os Apontamentos). Os botões com o código do bloco (ex.: `B12`) levam direto ao trecho na Política Revisada.
5. **Exportar** (no menu): Baixar Relatório em HTML e Baixar Política Revisada (.docx).

Cores funcionais: **cinza** = informação · **laranja** = requer validação da área · **vermelho** = possível risco · **verde** = ajuste editorial. O amarelo é reservado à marca, para não ser confundido com alertas.

> Os resultados não são salvos pela ferramenta. Baixe o relatório antes de fechar a página ou enviar outra política.

### Identidade visual e logotipo

- As cores da marca ficam no início de `public/styles.css` (`--cimed-yellow`, `--cimed-navy` etc.) e no início do CSS do relatório em `public/shared/html-exporter.js`. Ajuste os códigos conforme o manual de marca oficial, se necessário.
- **Logotipo oficial:** coloque o arquivo em `public/brand/logo.svg` (ou `logo.png`). Ele aparece automaticamente no cabeçalho e é incorporado ao relatório HTML. Sem o arquivo, é exibido o nome “Cimed” em texto. Use apenas o arquivo fornecido por Marketing/Comunicação.

## 6. Formatos aceitos

| Formato | Suporte |
|---|---|
| `.docx` | **Recomendado.** Preserva títulos, subtítulos, numeração automática do Word (ex.: 4.3), listas, marcadores e tabelas. Textos excluídos em “Controlar Alterações” são ignorados; inclusões pendentes são consideradas. |
| `.md` | Títulos (`#`), listas, itens numerados e tabelas. |
| `.txt` | Estrutura inferida por numeração (`1.`, `4.3`), marcadores (`-`, `•`) e linhas em caixa alta. UTF-8 ou Windows-1252. |
| `.pdf` | Apenas PDF com texto selecionável. A estrutura é reconstruída por aproximação (listas e tabelas podem se perder). PDF digitalizado (imagem) não é suportado. |

Arquivos `.doc` (Word antigo) devem ser salvos como `.docx` antes do envio.

## 7. Relatório HTML e política revisada (.docx)

**Baixar Relatório em HTML** gera um arquivo único, com CSS incorporado e **sem JavaScript ou arquivos externos**. Ele pode ser enviado por e-mail e aberto em qualquer navegador, em outro computador, sem instalar nada. O relatório tem o mesmo **menu lateral por tema** da ferramenta: ao abrir, aparece o Resumo Executivo; cada item do menu mostra somente aquele tema. Temas: Resumo Executivo (identificação do documento, data, totais e estrutura mínima), Política Revisada, DE/PARA, Duplicidades, Conceitos, Papéis e Responsabilidades, Ambiguidades, Riscos de Interpretação, Questionamentos para a Área, Governança e Controles Internos e Todos os Apontamentos. Ao **imprimir** (ou “Salvar como PDF”), todos os temas saem em sequência, cada um em nova página.

**Baixar Política Revisada (.docx)** gera a política com a estrutura original e as alterações **destacadas por formatação**:

- texto removido: vermelho tachado;
- texto alterado (ajuste editorial): verde sublinhado;
- alteração que requer validação: realce amarelo + marcação “[Requer validação da área]”;
- texto incluído: azul sublinhado + marcação “[Texto incluído]”.

Ao final do arquivo seguem o **Anexo I – Tabela DE/PARA** (trilha formal das alterações) e o **Anexo II – Questionamentos para validação da área**.

> **Importante:** o .docx **não usa o recurso “Controlar Alterações” nativo do Word**. Esse recurso não é gerado porque não seria possível produzi-lo de forma confiável a partir de sugestões por trecho; por isso as alterações são indicadas por formatação e o DE/PARA é a trilha formal. A numeração automática do Word é gravada como texto no arquivo revisado.

## 8. Como atualizar o prompt (regras de revisão)

As regras de negócio ficam separadas do código:

| Arquivo | O que contém | Quando alterar |
|---|---|---|
| `server/prompt.js` | **Todas as instruções de revisão** (papel da IA, regras críticas, tempo verbal, marcadores, conceitos, responsabilidades, duplicidades, ambiguidades, governança, questionamentos etc.). | Para mudar critérios, incluir novas expressões ambíguas, ajustar exemplos, mudar o tom. |
| `public/shared/labels.js` | Listas de categorias do DE/PARA, tipos de responsabilidade, temas de governança e seções mínimas. | Para incluir/renomear categorias. Reflete automaticamente no schema, nos filtros e nos relatórios. |
| `server/schema.js` | Formato (campos) do JSON que a IA deve devolver e a validação. | Apenas se for preciso um campo novo (exige ajuste também na interface). |

Passo a passo:

1. Edite o texto dentro de `SYSTEM_PROMPT` em `server/prompt.js` (é texto comum, em português).
2. Salve e reinicie o servidor (`Ctrl + C` e `npm start`).
3. Teste com uma política conhecida e compare o resultado com uma revisão anterior.
4. Registre a mudança no Git com uma descrição do que foi alterado e por quê.

Dica: prefira descrever **o que avaliar e por quê**, e mantenha as “Regras críticas” (não inventar regras, responsáveis, prazos, alçadas).

## 9. Disponibilizar para outros usuários

Opção simples (rede interna):

1. Instale a ferramenta em um computador ou servidor sempre ligado.
2. No `.env`, defina:

   ```
   HOST=0.0.0.0
   PORT=3000
   APP_USER=grc
   APP_PASSWORD=uma-senha-forte
   ```

3. Execute `npm start` e compartilhe o endereço `http://NOME-OU-IP-DO-SERVIDOR:3000` com o time.

Recomendações para uso contínuo:

- Coloque a aplicação atrás de um **proxy HTTPS** corporativo (IIS, Nginx, Apache ou o balanceador da empresa) e, se possível, com o login corporativo (SSO).
- Use um gerenciador de processos para manter o serviço ativo (ex.: serviço do Windows via NSSM, `systemd` no Linux ou `pm2`).
- Armazene a chave no cofre de segredos ou nas variáveis de ambiente do servidor, e não em arquivo compartilhado.
- Alinhe com Segurança da Informação e Privacidade o uso do serviço de IA para documentos internos.

## 10. Segurança e confidencialidade

- **Chave da API** apenas no servidor (variável `ANTHROPIC_API_KEY`); nenhuma chave no HTML/JavaScript (há um teste automatizado que verifica isso).
- **Sem armazenamento**: o arquivo é lido **em memória**, não é gravado em disco e não há banco de dados. Não existem arquivos temporários a remover.
- **Envio a serviço externo**: o texto da política é enviado à API da Anthropic somente quando o usuário clica em “Iniciar revisão” (a tela informa isso). O relatório HTML é gerado no navegador; a geração do .docx ocorre no servidor da própria ferramenta, em memória.
- **Logs sem conteúdo**: o servidor registra apenas metadados (formato, tamanho, quantidade de blocos, duração, tokens), nunca o texto da política.
- **Proteções HTTP**: Content-Security-Policy restritiva, `nosniff`, `no-referrer`, bloqueio de iframe e `Cache-Control: no-store`. Apenas os arquivos da pasta `public/` são servidos.
- **Validação de upload**: extensão, assinatura do arquivo (docx/pdf), tamanho máximo e limite de caracteres.
- **Autenticação opcional** (`APP_USER`/`APP_PASSWORD`) para uso em rede.
- Se a IA recusar a solicitação, a API pode reexecutar automaticamente em um modelo alternativo (`REFUSAL_FALLBACK=true`, parâmetro `fallbacks: "default"`). Para desativar, use `REFUSAL_FALLBACK=false`.

## 11. Estrutura do projeto

```text
├── public/                     # Interface (servida ao navegador)
│   ├── index.html              # Estrutura: cabeçalho, menu lateral e telas
│   ├── styles.css              # Visual (identidade Cimed)
│   ├── app.js                  # Fluxo: upload, revisão, menu por tema, filtros, downloads
│   ├── favicon.svg
│   ├── brand/                  # Coloque aqui o logotipo oficial (logo.svg / logo.png)
│   └── shared/                 # Módulos usados pelo navegador E pelo servidor
│       ├── labels.js           # Categorias e rótulos (regras de negócio configuráveis)
│       ├── themes.js           # Temas do menu (nome, ordem e descrição)
│       ├── findings.js         # Consolidação de apontamentos, filtros, política revisada
│       ├── render.js           # Componentes visuais (abas e relatório)
│       ├── text-diff.js        # Comparação palavra a palavra (destaques)
│       └── html-exporter.js    # Relatório HTML autocontido
├── server/                     # Backend (Node.js) – nunca enviado ao navegador
│   ├── server.js               # Servidor HTTP, rotas, limites, segurança
│   ├── prompt.js               # PROMPT DO REVISOR (regras de revisão)
│   ├── schema.js               # Schema JSON do retorno da IA + validação
│   ├── reviewer.js             # Chamada à API da Anthropic (streaming)
│   ├── demo-reviewer.js        # Revisão simulada usada apenas nos testes (DEMO_MODE=true)
│   ├── document-parser.js      # Leitura de .docx, .txt, .md e .pdf
│   └── docx-exporter.js        # Geração da política revisada em .docx
├── test/                       # Testes automatizados (npm test)
│   └── fixtures/               # Documentos usados somente pelos testes
├── .env.example                # Modelo de configuração
├── package.json
└── README.md
```

Em relação à estrutura sugerida, os arquivos da interface foram colocados em `public/` para que o servidor publique **somente** essa pasta (evitando expor `.env` ou código do servidor), e os utilitários usados também pelo navegador ficam em `public/shared/`.

Rotas do servidor:

| Rota | Função |
|---|---|
| `GET /api/status` | Informa se a IA está configurada, modelo e limites (sem segredos). |
| `POST /api/parse` | Recebe o arquivo e devolve a estrutura do documento. |
| `POST /api/review` | Executa a revisão; devolve progresso e resultado em streaming (NDJSON). |
| `POST /api/export/docx` | Gera a política revisada em .docx. |

## 12. Testes

```bash
npm test
```

Cobre: leitura de .docx (numeração, listas, tabelas), .md e .txt; erros de upload (formato inválido, arquivo vazio, .docx/.pdf corrompido); diff; compatibilidade do schema; validação e correção do retorno da IA; política sem Conceitos e sem Papéis e Responsabilidades; duplicidades e ambiguidades; política revisada; filtros; relatório HTML autocontido (sem scripts nem arquivos externos, conteúdo escapado); .docx exportado; ausência de chaves no frontend; e o caminho real de chamada à IA contra uma **API falsa local** (requisição, structured outputs, recusa, resposta truncada e nova tentativa sem schema).

## 13. Limitações

- A qualidade da revisão depende do modelo de IA e deve **sempre** ser validada por um revisor humano e pela área responsável.
- Políticas muito extensas (acima de `MAX_DOC_CHARS`) precisam ser divididas em partes; a resposta da IA também tem limite de tamanho (`REVIEW_MAX_TOKENS`).
- A revisão leva alguns minutos e tem custo por uso da API.
- `.docx`: imagens, caixas de texto, cabeçalhos/rodapés, notas de rodapé e comentários não são analisados. A numeração automática é reproduzida de forma aproximada em casos complexos (listas reiniciadas manualmente, estilos incomuns).
- `.pdf`: estrutura aproximada; PDFs digitalizados não são lidos (não há OCR).
- O .docx revisado **não** usa o “Controlar Alterações” nativo do Word; a formatação original (fontes, cores, cabeçalho, logotipo) não é copiada, apenas a estrutura e o texto.
- Os resultados não ficam salvos na ferramenta (por decisão de confidencialidade).

## 14. Solução de problemas

| Situação | O que fazer |
|---|---|
| “IA não configurada” no topo | Crie o `.env` com `ANTHROPIC_API_KEY` e reinicie o servidor. |
| “Chave da API inválida ou ausente” | Confira a chave no `.env` (sem espaços ou aspas extras). |
| “Limite de uso da API atingido” | Aguarde alguns minutos e tente novamente. |
| “Documento grande demais” | Divida a política em partes e revise separadamente. |
| “O arquivo não é um .docx válido” | Abra no Word e salve novamente como `.docx`. |
| “PDF não possui texto selecionável” | Use a versão .docx da política. |
| `node` não é reconhecido | Instale o Node.js e abra um novo terminal. |
| Porta 3000 em uso | Defina outra porta no `.env` (ex.: `PORT=3001`). |
