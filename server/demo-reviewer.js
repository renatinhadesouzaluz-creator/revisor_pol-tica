// MODO DEMONSTRAÇÃO – revisão simulada, sem IA.
// Aplica regras simples (tempo verbal, expressões ambíguas, marcadores,
// siglas, conceitos, duplicidades) para permitir testar a interface e as
// exportações sem chave de API. O resultado NÃO substitui a revisão por IA.

import { validateReview } from './schema.js';
import { PERGUNTAS_ESSENCIAIS } from '../public/shared/labels.js';
import { normalize } from '../public/shared/findings.js';

const W = (word) => new RegExp(`(?<!\\p{L})${word}(?!\\p{L})`, 'gu');
const FUTURO = [
  ['deverá', 'deve'], ['deverão', 'devem'], ['Deverá', 'Deve'], ['Deverão', 'Devem'],
  ['poderá', 'pode'], ['poderão', 'podem'], ['Poderá', 'Pode'], ['Poderão', 'Podem'],
  ['será', 'é'], ['serão', 'são'], ['Será', 'É'], ['Serão', 'São'],
].map(([from, to]) => [W(from), to]);

const AMBIGUAS = [
  'quando necessário', 'quando aplicável', 'periodicamente', 'sempre que possível', 'quando possível',
  'preferencialmente', 'adequadamente', 'adequado', 'adequada', 'em tempo hábil', 'eventualmente',
  'casos específicos', 'demais situações', 'conforme necessidade', 'quando pertinente', 'caso a caso',
  'de tempos em tempos',
];

const AREAS = [
  'Compliance', 'Controladoria', 'Jurídico', 'Compras', 'Segurança da Informação', 'Auditoria Interna',
  'RH', 'Recursos Humanos', 'TI', 'Tecnologia da Informação', 'Financeiro', 'Diretoria', 'gestor imediato',
  'diretor da área', 'diretor responsável', 'Comitê',
];

const STOP = new Set('a o os as de da do das dos e em no na nos nas para por pelo pela com que um uma ao aos se sua seu suas seus deve devem ser é são não ou'.split(' '));

export async function demoReview(parsed, { onProgress = () => {} } = {}) {
  const blocks = parsed.blocks;
  onProgress({ phase: 'thinking', chars: 0 });
  await new Promise((r) => setTimeout(r, 600));

  const r = {
    alteracoes: [], blocosRevisados: [], duplicidades: [],
    conceitos: { secaoConceitosExiste: false, naoUtilizados: [], possiveisFaltantes: [], divergencias: [] },
    responsabilidades: [], ambiguidades: [], riscos: [], questionamentos: [], governanca: [],
  };
  const heading = headingTracker(blocks);
  const revised = new Map();
  const addChange = (blocoId, text, alteracaoId, validacao = false) => {
    const cur = revised.get(blocoId) ?? { blocoId, operacao: 'alterar', tipoBloco: 'paragrafo', textoRevisado: text, requerValidacao: false, alteracaoIds: [] };
    cur.textoRevisado = text;
    cur.alteracaoIds.push(alteracaoId);
    cur.requerValidacao ||= validacao;
    revised.set(blocoId, cur);
  };
  const units = textUnits(blocks);
  const currentText = (u) => revised.get(u.id)?.textoRevisado ?? u.text;

  // Tempo verbal
  for (const u of units) {
    let t = currentText(u);
    const fixed = FUTURO.reduce((acc, [re, rep]) => acc.replace(re, rep), t);
    if (fixed !== t) {
      const id = `A${r.alteracoes.length + 1}`;
      r.alteracoes.push({
        id, blocoId: u.id, item: heading.item(u.id), secao: heading.secao(u.id), categoria: 'Tempo verbal', tipoAjuste: 'editorial',
        textoAtual: t, sugestao: fixed, justificativa: 'Padronização do tempo verbal no presente, sem alteração do significado da regra.',
      });
      addChange(u.id, fixed, id);
    }
  }

  // Marcadores: ponto e vírgula nos intermediários e ponto final no último
  for (const seq of listSequences(blocks)) {
    seq.forEach((b, i) => {
      const t = currentText(b);
      const last = i === seq.length - 1;
      const expected = t.replace(/[.;,:]?\s*$/, last ? '.' : ';');
      if (expected !== t) {
        const id = `A${r.alteracoes.length + 1}`;
        r.alteracoes.push({
          id, blocoId: b.id, item: heading.item(b.id), secao: heading.secao(b.id), categoria: 'Padronização', tipoAjuste: 'editorial',
          textoAtual: t, sugestao: expected,
          justificativa: 'Padrão de marcadores: ponto e vírgula nos itens intermediários e ponto final no último item.',
        });
        addChange(b.id, expected, id);
      }
    });
  }

  // Ambiguidades
  for (const u of units) {
    const norm = normalize(u.text);
    for (const exp of AMBIGUAS) {
      if (!new RegExp(`\\b${normalize(exp)}\\b`).test(norm)) continue;
      const n = r.ambiguidades.length + 1;
      r.ambiguidades.push({
        id: `AM${n}`, blocoId: u.id, item: heading.item(u.id), expressao: exp, trecho: u.text, criterioNoDocumento: 'inexistente',
        avaliacao: `O documento não define critério objetivo para "${exp}", o que permite interpretações diferentes na aplicação da regra.`,
        sugestao: 'Definir critério objetivo com a área responsável.',
      });
      r.questionamentos.push({
        id: `Q${r.questionamentos.length + 1}`, blocoId: u.id, item: heading.item(u.id), tema: 'Critério',
        questionamento: `O trecho utiliza a expressão "${exp}" sem critério objetivo. Confirmar qual critério (prazo, periodicidade, condição ou responsável) deve ser aplicado.`,
        motivo: 'Reduzir o risco de interpretação e de aplicação inadequada da regra.',
      });
      if (/tempo hábil|periodicamente|tempos em tempos/.test(exp)) {
        r.riscos.push({
          id: `RI${r.riscos.length + 1}`, blocoId: u.id, item: heading.item(u.id), trecho: u.text,
          risco: `Prazo/periodicidade indefinido ("${exp}").`, impacto: 'Execução fora do tempo esperado e dificuldade de comprovar o cumprimento da regra.',
          recomendacao: 'Validar com a área o prazo ou a periodicidade aplicável.', requerValidacao: true,
        });
      }
    }
  }

  // Estrutura / seções
  const find = (re) => blocks.find((b) => b.type === 'heading' && re.test(normalize(b.text)));
  const secs = {
    objetivo: find(/objetivo|finalidade/),
    abrangencia: find(/abrangencia|aplicabilidade|escopo/),
    conceitos: find(/conceito|definic|glossario/),
    regras: find(/regra|procediment|diretriz/),
    papeis: find(/papeis|responsabilidade/),
  };
  const sectionBlocks = (h) => {
    if (!h) return [];
    const start = blocks.indexOf(h);
    const out = [];
    for (let i = start + 1; i < blocks.length; i++) {
      if (blocks[i].type === 'heading' && blocks[i].level <= h.level) break;
      out.push(blocks[i]);
    }
    return out;
  };

  // Conceitos
  const conceitoBlocks = sectionBlocks(secs.conceitos);
  r.conceitos.secaoConceitosExiste = Boolean(secs.conceitos);
  const outside = normalize(units.filter((u) => !conceitoBlocks.some((b) => u.id.split('.')[0] === b.id)).map((u) => u.text).join(' '));
  const termos = [];
  for (const b of conceitoBlocks) {
    const m = b.text?.match(/^([^:–-]{2,60})\s*[:–-]\s*(.+)$/);
    if (!m) continue;
    const termo = m[1].trim();
    termos.push(normalize(termo));
    if (!outside.includes(normalize(termo))) {
      r.conceitos.naoUtilizados.push({
        id: `CN${r.conceitos.naoUtilizados.length + 1}`, blocoId: b.id, item: heading.item(b.id), termo, definicao: m[2].trim(),
        observacao: 'O termo não foi localizado no restante da política.',
        recomendacao: 'Confirmar com a área se o conceito ainda é necessário ou se deve ser removido.',
      });
    }
  }
  const siglas = new Map();
  for (const u of units) {
    for (const s of u.text.match(/\b[A-Z]{2,6}\b/g) ?? []) {
      if (!siglas.has(s)) siglas.set(s, u);
    }
  }
  for (const [sigla, u] of siglas) {
    if (termos.some((t) => t.includes(normalize(sigla)))) continue;
    if (/^(RH|TI)$/.test(sigla) && secs.papeis) continue;
    if (u.text === u.text.toUpperCase()) continue; // título em caixa alta
    r.conceitos.possiveisFaltantes.push({
      id: `CF${r.conceitos.possiveisFaltantes.length + 1}`, blocoId: u.id, item: heading.item(u.id), termo: sigla, tipo: 'sigla',
      ondeAparece: heading.item(u.id), recomendacao: 'Avaliar a inclusão da sigla em Conceitos, com definição validada pela área.',
    });
  }
  for (const u of units) {
    for (const m of u.text.matchAll(/\b(?:no|na|pelo|pela|do|da)\s+(?:portal|sistema)?\s*([A-Z][A-Za-z]+[A-Z][A-Za-z]*|Concur|ServiceNow|SAP)\b/g)) {
      const termo = m[1];
      if (termos.some((t) => t.includes(normalize(termo))) || r.conceitos.possiveisFaltantes.some((c) => c.termo === termo)) continue;
      r.conceitos.possiveisFaltantes.push({
        id: `CF${r.conceitos.possiveisFaltantes.length + 1}`, blocoId: u.id, item: heading.item(u.id), termo, tipo: 'sistema',
        ondeAparece: heading.item(u.id), recomendacao: 'Avaliar a inclusão do sistema em Conceitos.',
      });
    }
  }

  // Papéis e responsabilidades
  const papeisText = normalize(sectionBlocks(secs.papeis).map((b) => [b.text, ...(b.rows ?? []).flat().map((c) => c.text)].join(' ')).join(' ') + ' ' + sectionBlocks(secs.papeis).length);
  const papeisTitulos = normalize(sectionBlocks(secs.papeis).filter((b) => b.type === 'heading').map((b) => b.text).join(' '));
  const mentioned = new Map();
  for (const u of units) {
    if (sectionBlocks(secs.papeis).some((b) => b.id === u.id)) continue;
    for (const area of AREAS) {
      if (new RegExp(`\\b${area}\\b`, 'i').test(u.text) && !mentioned.has(area.toLowerCase())) mentioned.set(area.toLowerCase(), { area, u });
    }
  }
  for (const { area, u } of mentioned.values()) {
    const n = normalize(area);
    if (papeisText.includes(n) || papeisTitulos.includes(n)) continue;
    const id = `R${r.responsabilidades.length + 1}`;
    r.responsabilidades.push({
      id, blocoId: u.id, item: heading.item(u.id), tipo: 'area_ausente_item5', area, trecho: u.text,
      descricao: secs.papeis ? 'A área é mencionada na política, mas não consta em Papéis e Responsabilidades.' : 'A política não possui seção de Papéis e Responsabilidades.',
      recomendacao: 'Confirmar com a área se as atribuições devem constar em Papéis e Responsabilidades.',
    });
    r.questionamentos.push({
      id: `Q${r.questionamentos.length + 1}`, blocoId: u.id, item: heading.item(u.id), tema: 'Responsabilidade',
      questionamento: `A área "${area}" possui atribuição no texto, mas não está descrita em Papéis e Responsabilidades. Confirmar se a responsabilidade deve ser formalizada nessa seção.`,
      motivo: 'Garantir coerência entre as regras e as responsabilidades formalizadas.',
    });
  }
  for (const u of units) {
    if (/\b(aprovad[oa]s?|autorizad[oa]s?)\b/i.test(u.text) && !/\b(pel[oa]s?|por)\b/i.test(u.text)) {
      r.responsabilidades.push({
        id: `R${r.responsabilidades.length + 1}`, blocoId: u.id, item: heading.item(u.id), tipo: 'atividade_sem_responsavel', area: '',
        trecho: u.text, descricao: 'A regra exige aprovação, mas não identifica quem aprova.',
        recomendacao: 'Informação não identificada no documento – requer validação da área.',
      });
      r.questionamentos.push({
        id: `Q${r.questionamentos.length + 1}`, blocoId: u.id, item: heading.item(u.id), tema: 'Aprovação',
        questionamento: 'O texto informa que deve haver aprovação, porém não identifica o responsável pela aprovação. Confirmar qual área ou cargo possui essa responsabilidade.',
        motivo: 'Evitar indefinição sobre a alçada de aprovação.',
      });
      r.governanca.push({
        id: `G${r.governanca.length + 1}`, blocoId: u.id, item: heading.item(u.id), tipo: 'questionamento', tema: 'aprovacoes',
        descricao: 'Aprovação sem aprovador definido impede verificar a segregação de funções e a alçada aplicada.',
        recomendacao: 'Validar com a área o aprovador e a forma de evidenciar a aprovação.',
      });
    }
    if (/exce[cç](ão|ões)/i.test(u.text)) {
      r.governanca.push({
        id: `G${r.governanca.length + 1}`, blocoId: u.id, item: heading.item(u.id), tipo: 'ponto_atencao', tema: 'tratamento_excecoes',
        descricao: 'O tratamento de exceções não define critérios, aprovador e forma de registro.',
        recomendacao: 'Avaliar com a área a formalização do fluxo de exceções e da evidência de aprovação.',
      });
    }
  }

  // Duplicidades (similaridade de palavras)
  const paras = units.filter((u) => u.text.split(/\s+/).length >= 6 && !conceitoBlocks.some((b) => b.id === u.id));
  for (let i = 0; i < paras.length; i++) {
    for (let j = i + 1; j < paras.length; j++) {
      const sim = similarity(paras[i].text, paras[j].text);
      if (sim < 0.3) continue;
      r.duplicidades.push({
        id: `D${r.duplicidades.length + 1}`, blocoId1: paras[i].id, item1: heading.item(paras[i].id), trecho1: paras[i].text,
        blocoId2: paras[j].id, item2: heading.item(paras[j].id), trecho2: paras[j].text,
        motivo: 'Os trechos tratam do mesmo tema com redação semelhante.',
        sugestao: 'Avaliar a consolidação em um único trecho.', redacaoConsolidada: '',
        localRecomendado: heading.item(paras[i].id) || 'Seção de Regras', requerValidacao: true,
      });
    }
  }

  const secaoEntries = Object.entries(secs).map(([secao, h]) => ({
    secao, presente: h ? 'sim' : 'nao', localizacao: h ? [h.number, h.text].filter(Boolean).join(' ') : '',
    observacao: h ? '' : 'Seção não identificada no documento.',
  }));
  const tem = (k) => (secs[k] ? 'sim' : 'nao');
  r.estrutura = {
    secoes: secaoEntries,
    perguntasEssenciais: PERGUNTAS_ESSENCIAIS.map((pergunta, i) => ({
      pergunta,
      resposta: [tem('objetivo'), tem('abrangencia'), tem('conceitos'), tem('regras'), r.responsabilidades.length ? 'parcial' : tem('papeis')][i],
      comentario: 'Avaliação simulada com base na presença das seções.',
    })),
    analiseObjetivo: { adequado: secs.objetivo ? 'parcial' : 'nao', comentario: secs.objetivo ? 'Avaliação detalhada disponível apenas na revisão por IA.' : 'A política não possui item Objetivo.' },
  };
  r.blocosRevisados = [...revised.values()].map((b) => ({ ...b, tipoBloco: b.blocoId.includes('.r') ? 'celula' : 'paragrafo' }));
  r.resumoExecutivo = {
    visaoGeral: `MODO DEMONSTRAÇÃO: resultado gerado por regras simples, sem IA, para teste da ferramenta. Foram identificados ${r.alteracoes.length} ajustes no DE/PARA, ${r.ambiguidades.length} ambiguidades e ${r.questionamentos.length} questionamentos para a área.`,
    principaisMelhorias: r.alteracoes.length ? ['Padronização do tempo verbal no presente.', 'Padronização da pontuação dos marcadores.'] : [],
    principaisAmbiguidades: r.ambiguidades.slice(0, 5).map((a) => `Item ${a.item}: "${a.expressao}"`),
    principaisDuplicidades: r.duplicidades.slice(0, 5).map((d) => `Itens ${d.item1} e ${d.item2}`),
    conceitosSemUtilizacao: r.conceitos.naoUtilizados.map((c) => c.termo),
    possiveisConceitosFaltantes: r.conceitos.possiveisFaltantes.map((c) => c.termo),
    lacunasResponsabilidades: r.responsabilidades.slice(0, 5).map((x) => `${x.area || 'Aprovação sem responsável'} (item ${x.item})`),
    riscosInterpretacao: r.riscos.map((x) => `Item ${x.item}: ${x.risco}`),
    pontosGovernanca: r.governanca.filter((g) => g.tema === 'aprovacoes').map((g) => `Item ${g.item}: aprovação sem aprovador definido`),
    pontosControlesInternos: r.governanca.filter((g) => g.tema !== 'aprovacoes').map((g) => `Item ${g.item}: ${g.descricao}`),
  };
  const faltando = secaoEntries.filter((s) => s.presente === 'nao');
  if (faltando.length) r.resumoExecutivo.principaisMelhorias.push(`Incluir seções ausentes: ${faltando.map((s) => s.secao).join(', ')} (validar com a área).`);

  onProgress({ phase: 'writing', chars: JSON.stringify(r).length });
  const result = validateReview(r, blocks);
  return { review: result.review, ajustesValidacao: result.errors, modelo: 'demonstração (sem IA)' };
}

function textUnits(blocks) {
  const out = [];
  for (const b of blocks) {
    if (b.type === 'table') b.rows.forEach((row) => row.forEach((c) => c.text && out.push({ id: c.id, text: c.text })));
    else if (b.type !== 'heading') out.push({ id: b.id, text: b.text });
  }
  return out;
}

function listSequences(blocks) {
  const seqs = [];
  let cur = [];
  for (const b of blocks) {
    if (b.type === 'list' && !b.ordered && b.level === 0) cur.push(b);
    else {
      if (cur.length > 1) seqs.push(cur);
      cur = [];
    }
  }
  if (cur.length > 1) seqs.push(cur);
  // Só sequências de frases/regras (não listas de palavras soltas)
  return seqs.filter((s) => s.every((b) => b.text.split(/\s+/).length >= 3));
}

function headingTracker(blocks) {
  const map = new Map();
  let cur = null;
  let top = null;
  for (const b of blocks) {
    if (b.type === 'heading') {
      cur = b;
      if (b.number && !b.number.includes('.', 0) || /^\d+\.?$/.test(b.number)) top = b;
    }
    const info = {
      item: b.number && b.type !== 'list' ? b.number.replace(/\.$/, '') : cur?.number?.replace(/\.$/, '') || 'Geral',
      secao: [cur?.number?.replace(/\.$/, ''), cur?.text].filter(Boolean).join(' '),
    };
    map.set(b.id, info);
    for (const row of b.rows ?? []) for (const c of row) map.set(c.id, info);
  }
  return {
    item: (id) => map.get(id)?.item ?? 'Geral',
    secao: (id) => map.get(id)?.secao ?? '',
  };
}

function similarity(a, b) {
  const words = (s) => new Set(normalize(s).match(/[a-z0-9]+/g)?.filter((w) => w.length > 2 && !STOP.has(w)).map((w) => w.slice(0, 5)) ?? []);
  const A = words(a);
  const B = words(b);
  const inter = [...A].filter((w) => B.has(w)).length;
  return inter / (A.size + B.size - inter || 1);
}
