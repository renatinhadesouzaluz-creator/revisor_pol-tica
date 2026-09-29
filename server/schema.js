// Schema (JSON Schema) do retorno estruturado da IA + validação/normalização.
// O mesmo schema é enviado à API (structured outputs) e usado para validar
// a resposta antes de apresentá-la ao usuário.

import {
  CATEGORIAS,
  TIPOS_AJUSTE,
  TIPOS_RESPONSABILIDADE,
  TIPOS_CONCEITO_FALTANTE,
  TEMAS_GOVERNANCA,
  TIPOS_GOVERNANCA,
  SECOES_OBRIGATORIAS,
  RESPOSTA_PERGUNTA,
} from '../public/shared/labels.js';

const str = (description) => ({ type: 'string', description });
const bool = (description) => ({ type: 'boolean', description });
const strList = (description) => ({ type: 'array', items: { type: 'string' }, description });
const enumOf = (values, description) => ({ type: 'string', enum: values, description });
const obj = (properties) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
});
const list = (itemProperties, description) => ({ type: 'array', items: obj(itemProperties), description });

const rastreio = {
  id: str('Identificador único do apontamento (ex.: A1, D1, Q1).'),
  blocoId: str('ID do bloco do documento (ex.: B12 ou B20.r2c1). Vazio se o apontamento for geral.'),
  item: str('Número do item/seção da política (ex.: 4.3). Use "Geral" se não houver.'),
};

export const REVIEW_SCHEMA = obj({
  resumoExecutivo: obj({
    visaoGeral: str('Parágrafo objetivo e gerencial sobre a política e o resultado da revisão.'),
    principaisMelhorias: strList('Principais melhorias sugeridas.'),
    principaisAmbiguidades: strList('Principais ambiguidades.'),
    principaisDuplicidades: strList('Principais duplicidades.'),
    conceitosSemUtilizacao: strList('Conceitos definidos e não utilizados.'),
    possiveisConceitosFaltantes: strList('Possíveis conceitos faltantes.'),
    lacunasResponsabilidades: strList('Lacunas de responsabilidades.'),
    riscosInterpretacao: strList('Principais riscos de interpretação.'),
    pontosGovernanca: strList('Pontos de Governança.'),
    pontosControlesInternos: strList('Pontos de Controles Internos.'),
  }),
  estrutura: obj({
    secoes: list(
      {
        secao: enumOf(Object.keys(SECOES_OBRIGATORIAS), 'Seção mínima esperada.'),
        presente: enumOf(['sim', 'parcial', 'nao'], 'Se a seção existe no documento.'),
        localizacao: str('Item/título onde a seção se encontra, ou vazio.'),
        observacao: str('Lacuna ou comentário sobre a seção.'),
      },
      'Uma entrada para cada uma das 5 seções mínimas.',
    ),
    perguntasEssenciais: list(
      {
        pergunta: str('Pergunta essencial.'),
        resposta: enumOf(Object.keys(RESPOSTA_PERGUNTA), 'Se o documento responde à pergunta.'),
        comentario: str('Justificativa objetiva.'),
      },
      'Uma entrada para cada uma das 5 perguntas essenciais.',
    ),
    analiseObjetivo: obj({
      adequado: enumOf(['sim', 'parcial', 'nao'], 'Se o Objetivo está adequado.'),
      comentario: str('Avaliação do item Objetivo.'),
    }),
  }),
  alteracoes: list(
    {
      ...rastreio,
      secao: str('Título da seção da política.'),
      categoria: enumOf(CATEGORIAS, 'Categoria da alteração.'),
      tipoAjuste: enumOf(Object.keys(TIPOS_AJUSTE), 'editorial = não muda significado; requer_validacao = pode alterar regra.'),
      textoAtual: str('DE – trecho atual, transcrito literalmente.'),
      sugestao: str('PARA – redação sugerida.'),
      justificativa: str('Justificativa vinculada a clareza, consistência, padronização, ambiguidade, duplicidade, responsabilidade, governança, controles internos ou risco de interpretação.'),
    },
    'Tabela DE/PARA.',
  ),
  blocosRevisados: list(
    {
      blocoId: str('ID do bloco alterado (operacao=alterar) ou do bloco após o qual o novo texto é incluído (operacao=incluir_apos).'),
      operacao: enumOf(['alterar', 'incluir_apos'], 'Tipo de operação.'),
      tipoBloco: enumOf(['paragrafo', 'titulo', 'item_lista', 'celula'], 'Tipo do bloco resultante.'),
      textoRevisado: str('Texto integral revisado do bloco, sem a numeração automática.'),
      requerValidacao: bool('true se a alteração puder modificar obrigação, responsabilidade, prazo, aprovação, alçada, processo, critério ou exceção.'),
      alteracaoIds: strList('IDs das alterações do DE/PARA aplicadas neste bloco.'),
    },
    'Somente blocos alterados ou incluídos. Blocos não listados permanecem iguais.',
  ),
  duplicidades: list(
    {
      id: rastreio.id,
      blocoId1: str('ID do bloco do trecho 1.'),
      item1: str('Item do trecho 1.'),
      trecho1: str('Trecho 1 literal.'),
      blocoId2: str('ID do bloco do trecho 2.'),
      item2: str('Item do trecho 2.'),
      trecho2: str('Trecho 2 literal.'),
      motivo: str('Motivo da possível duplicidade.'),
      sugestao: str('Sugestão de tratamento.'),
      redacaoConsolidada: str('Redação consolidada sugerida, ou vazio se não aplicável.'),
      localRecomendado: str('Local recomendado para manutenção da regra.'),
      requerValidacao: bool('true se a consolidação puder alterar regra.'),
    },
    'Possíveis duplicidades.',
  ),
  conceitos: obj({
    secaoConceitosExiste: bool('Se existe seção de Conceitos/Definições.'),
    naoUtilizados: list(
      {
        ...rastreio,
        termo: str('Termo definido.'),
        definicao: str('Definição atual.'),
        observacao: str('Evidência de que não é utilizado no restante do documento.'),
        recomendacao: str('Recomendação para validação.'),
      },
      'Conceito existente sem utilização.',
    ),
    possiveisFaltantes: list(
      {
        ...rastreio,
        termo: str('Termo, sigla, sistema ou documento.'),
        tipo: enumOf(Object.keys(TIPOS_CONCEITO_FALTANTE), 'Natureza do termo.'),
        ondeAparece: str('Itens onde o termo aparece.'),
        recomendacao: str('Recomendação para validação (sem inventar a definição).'),
      },
      'Possível conceito faltante.',
    ),
    divergencias: list(
      {
        ...rastreio,
        termo: str('Termo.'),
        definicao: str('Definição em Conceitos.'),
        usoDivergente: str('Uso divergente encontrado.'),
        recomendacao: str('Recomendação.'),
      },
      'Divergência entre definição e uso.',
    ),
  }),
  responsabilidades: list(
    {
      ...rastreio,
      tipo: enumOf(Object.keys(TIPOS_RESPONSABILIDADE), 'Classificação do apontamento.'),
      area: str('Área, cargo ou função envolvida, com o nome exatamente como no documento.'),
      trecho: str('Trecho literal que sustenta o apontamento.'),
      descricao: str('Descrição objetiva da lacuna.'),
      recomendacao: str('Recomendação ou questionamento, sem atribuir responsabilidade.'),
    },
    'Análise cruzada de Papéis e Responsabilidades.',
  ),
  ambiguidades: list(
    {
      ...rastreio,
      expressao: str('Expressão ambígua (ex.: "quando necessário").'),
      trecho: str('Trecho literal.'),
      criterioNoDocumento: enumOf(['inexistente', 'parcial'], 'Se há critério objetivo no documento.'),
      avaliacao: str('Por que permite mais de uma interpretação.'),
      sugestao: str('Sugestão ou questionamento.'),
    },
    'Ambiguidades sem critério objetivo suficiente.',
  ),
  riscos: list(
    {
      ...rastreio,
      trecho: str('Trecho literal.'),
      risco: str('Risco de interpretação ou de aplicação inadequada.'),
      impacto: str('Possível consequência.'),
      recomendacao: str('Recomendação.'),
      requerValidacao: bool('true se o tratamento depender de decisão da área.'),
    },
    'Riscos de interpretação, contradições e regras não executáveis.',
  ),
  questionamentos: list(
    {
      ...rastreio,
      tema: str('Tema (ex.: Responsabilidade, Prazo, Aprovação, Conceito).'),
      questionamento: str('Questionamento específico e não genérico.'),
      motivo: str('Motivo do questionamento.'),
    },
    'Questionamentos para validação da área.',
  ),
  governanca: list(
    {
      ...rastreio,
      tipo: enumOf(Object.keys(TIPOS_GOVERNANCA), 'Forma de apresentação.'),
      tema: enumOf(Object.keys(TEMAS_GOVERNANCA), 'Tema de governança/controle.'),
      descricao: str('Descrição do ponto.'),
      recomendacao: str('Recomendação ou questionamento, sem criar regra.'),
    },
    'Pontos de Governança e Controles Internos.',
  ),
});

// ---------------------------------------------------------------------------
// Validação e normalização
// ---------------------------------------------------------------------------

// Percorre o valor conforme o schema. Campos ausentes recebem valor padrão
// (string vazia, lista vazia, false) e geram aviso; tipos errados e valores
// fora da enumeração geram erro. Propriedades não previstas são descartadas.
function coerce(schema, value, path, report) {
  if (schema.type === 'object') {
    if (value === undefined || value === null) {
      report.warnings.push(`${path}: ausente (preenchido com valores vazios)`);
      value = {};
    }
    if (typeof value !== 'object' || Array.isArray(value)) {
      report.errors.push(`${path}: esperado objeto`);
      return null;
    }
    const out = {};
    for (const [key, sub] of Object.entries(schema.properties)) {
      out[key] = coerce(sub, value[key], `${path}.${key}`, report);
    }
    return out;
  }
  if (schema.type === 'array') {
    if (value === undefined || value === null) {
      report.warnings.push(`${path}: ausente (lista vazia)`);
      return [];
    }
    if (!Array.isArray(value)) {
      report.errors.push(`${path}: esperado lista`);
      return [];
    }
    return value.map((v, i) => coerce(schema.items, v, `${path}[${i}]`, report)).filter((v) => v !== null);
  }
  if (schema.type === 'boolean') {
    if (value === undefined || value === null) return false;
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === 'false') return value === 'true';
    report.errors.push(`${path}: esperado booleano`);
    return false;
  }
  // string
  if (value === undefined || value === null) {
    if (schema.enum) {
      report.errors.push(`${path}: valor obrigatório ausente`);
      return schema.enum[0];
    }
    return '';
  }
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string') {
    report.errors.push(`${path}: esperado texto`);
    return '';
  }
  if (schema.enum && !schema.enum.includes(value)) {
    const match = schema.enum.find((opt) => normalizeKey(opt) === normalizeKey(value));
    if (match) return match;
    report.errors.push(`${path}: valor "${value}" fora das opções permitidas`);
    return schema.enum[0];
  }
  return value;
}

function normalizeKey(s) {
  return String(s)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

// Valida a revisão e confere referências aos blocos do documento.
export function validateReview(raw, blocks) {
  const report = { errors: [], warnings: [] };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['A resposta da IA não é um objeto JSON.'], warnings: [] };
  }
  const review = coerce(REVIEW_SCHEMA, raw, 'revisao', report);

  const validIds = collectBlockIds(blocks);
  const before = review.blocosRevisados.length;
  review.blocosRevisados = review.blocosRevisados.filter((b) => {
    const ok = validIds.has(b.blocoId) && !(b.operacao === 'incluir_apos' && b.blocoId.includes('.r'));
    if (!ok) report.warnings.push(`blocosRevisados: bloco "${b.blocoId}" inexistente ou inválido – ignorado`);
    return ok;
  });
  if (before !== review.blocosRevisados.length) {
    report.warnings.push('Parte das alterações não pôde ser posicionada na política revisada; consulte o DE/PARA.');
  }
  // Referências inválidas em apontamentos são apenas limpas (o item textual é mantido).
  const clean = (obj, key) => {
    if (obj[key] && !validIds.has(obj[key])) obj[key] = '';
  };
  for (const listName of ['alteracoes', 'responsabilidades', 'ambiguidades', 'riscos', 'questionamentos', 'governanca']) {
    review[listName].forEach((f) => clean(f, 'blocoId'));
  }
  for (const listName of ['naoUtilizados', 'possiveisFaltantes', 'divergencias']) {
    review.conceitos[listName].forEach((f) => clean(f, 'blocoId'));
  }
  review.duplicidades.forEach((d) => {
    clean(d, 'blocoId1');
    clean(d, 'blocoId2');
  });
  ensureIds(review);

  // Erros de tipo/enumeração são corrigidos com valor padrão e informados ao
  // usuário. A revisão só é rejeitada se a maior parte da estrutura for inválida.
  const ok = report.errors.length <= 25;
  return { ok, review, errors: report.errors, warnings: report.warnings };
}

function collectBlockIds(blocks) {
  const ids = new Set();
  for (const b of blocks ?? []) {
    ids.add(b.id);
    for (const row of b.rows ?? []) for (const cell of row) ids.add(cell.id);
  }
  return ids;
}

// Garante IDs únicos por lista (a IA às vezes repete ou omite).
function ensureIds(review) {
  const lists = [
    ['alteracoes', 'A'],
    ['duplicidades', 'D'],
    ['responsabilidades', 'R'],
    ['ambiguidades', 'AM'],
    ['riscos', 'RI'],
    ['questionamentos', 'Q'],
    ['governanca', 'G'],
  ];
  const fix = (arr, prefix) => {
    const seen = new Set();
    arr.forEach((f, i) => {
      if (!f.id || seen.has(f.id)) f.id = `${prefix}${i + 1}`;
      seen.add(f.id);
    });
  };
  for (const [name, prefix] of lists) fix(review[name], prefix);
  fix(review.conceitos.naoUtilizados, 'CN');
  fix(review.conceitos.possiveisFaltantes, 'CF');
  fix(review.conceitos.divergencias, 'CD');
}
