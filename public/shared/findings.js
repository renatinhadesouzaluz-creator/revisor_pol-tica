// Consolidação dos apontamentos da revisão em uma lista única,
// com contadores, índice de seções e filtros. Usado pela interface e pelos
// relatórios exportados.

import {
  TIPOS_APONTAMENTO,
  TIPOS_RESPONSABILIDADE,
  TIPOS_CONCEITO_FALTANTE,
  TEMAS_GOVERNANCA,
  TIPOS_GOVERNANCA,
} from './labels.js';

const cleanNumber = (n) => String(n ?? '').replace(/\.$/, '').trim();

// Mapeia cada bloco (e célula) para a seção de primeiro nível em que está.
export function buildSectionIndex(blocks) {
  const headings = blocks.filter((b) => b.type === 'heading');
  let candidates = headings;
  if (headings[0] && blocks[0] === headings[0] && !headings[0].number && headings.slice(1).some((h) => h.number)) {
    candidates = headings.slice(1); // primeiro título sem número = nome do documento
  }
  const topLevel = candidates.length ? Math.min(...candidates.map((h) => h.level)) : 1;
  const sections = [];
  const byBlock = new Map();
  const headingByBlock = new Map();
  let current = null;
  let currentHeading = null;
  for (const b of blocks) {
    if (b.type === 'heading' && candidates.includes(b)) {
      if (b.level === topLevel) {
        current = { key: b.id, number: cleanNumber(b.number), label: [cleanNumber(b.number), b.text].filter(Boolean).join(' ') };
        sections.push(current);
      }
      currentHeading = { number: cleanNumber(b.number), label: [cleanNumber(b.number), b.text].filter(Boolean).join(' ') };
    }
    byBlock.set(b.id, current);
    headingByBlock.set(b.id, currentHeading);
    for (const row of b.rows ?? []) {
      for (const cell of row) {
        byBlock.set(cell.id, current);
        headingByBlock.set(cell.id, currentHeading);
      }
    }
  }
  return {
    sections,
    sectionOf(blocoId, item) {
      if (blocoId && byBlock.get(blocoId)) return byBlock.get(blocoId);
      const first = cleanNumber(item).split('.')[0];
      if (first) return sections.find((s) => s.number && s.number.split('.')[0] === first) ?? null;
      return null;
    },
    headingOf(blocoId) {
      return headingByBlock.get(blocoId) ?? null;
    },
  };
}

// Lista unificada: { id, tipo, tipoLabel, categoria, subtipo, item, blocoIds,
//   titulo, trecho, descricao, sugestao, requerValidacao, raw }
export function unifyFindings(review) {
  const out = [];
  const push = (f) => out.push({ trecho: '', descricao: '', sugestao: '', subtipo: '', ...f, tipoLabel: TIPOS_APONTAMENTO[f.tipo] });

  for (const a of review.alteracoes ?? []) {
    push({
      id: a.id, tipo: 'alteracao', categoria: a.categoria, item: a.item, blocoIds: [a.blocoId],
      titulo: a.categoria, trecho: a.textoAtual, sugestao: a.sugestao, descricao: a.justificativa,
      requerValidacao: a.tipoAjuste === 'requer_validacao', raw: a,
    });
  }
  for (const d of review.duplicidades ?? []) {
    push({
      id: d.id, tipo: 'duplicidade', categoria: 'Duplicidade', item: [d.item1, d.item2].filter(Boolean).join(' × '),
      blocoIds: [d.blocoId1, d.blocoId2], titulo: 'Possível duplicidade', trecho: `${d.trecho1}\n${d.trecho2}`,
      descricao: d.motivo, sugestao: d.redacaoConsolidada || d.sugestao, requerValidacao: d.requerValidacao, raw: d,
    });
  }
  const c = review.conceitos ?? {};
  for (const x of c.naoUtilizados ?? []) {
    push({
      id: x.id, tipo: 'conceito', subtipo: 'naoUtilizado', categoria: 'Conceito', item: x.item, blocoIds: [x.blocoId],
      titulo: `Conceito existente sem utilização: ${x.termo}`, trecho: x.definicao, descricao: x.observacao,
      sugestao: x.recomendacao, requerValidacao: true, raw: x,
    });
  }
  for (const x of c.possiveisFaltantes ?? []) {
    push({
      id: x.id, tipo: 'conceito', subtipo: 'faltante', categoria: 'Conceito', item: x.item, blocoIds: [x.blocoId],
      titulo: `Possível conceito faltante: ${x.termo} (${TIPOS_CONCEITO_FALTANTE[x.tipo] ?? x.tipo})`,
      trecho: x.ondeAparece, descricao: '', sugestao: x.recomendacao, requerValidacao: true, raw: x,
    });
  }
  for (const x of c.divergencias ?? []) {
    push({
      id: x.id, tipo: 'conceito', subtipo: 'divergencia', categoria: 'Conceito', item: x.item, blocoIds: [x.blocoId],
      titulo: `Divergência entre definição e uso: ${x.termo}`, trecho: x.definicao, descricao: x.usoDivergente,
      sugestao: x.recomendacao, requerValidacao: true, raw: x,
    });
  }
  for (const r of review.responsabilidades ?? []) {
    push({
      id: r.id, tipo: 'responsabilidade', subtipo: r.tipo, categoria: 'Responsabilidade', item: r.item, blocoIds: [r.blocoId],
      titulo: TIPOS_RESPONSABILIDADE[r.tipo] ?? r.tipo, trecho: r.trecho, descricao: [r.area, r.descricao].filter(Boolean).join(' – '),
      sugestao: r.recomendacao, requerValidacao: true, raw: r,
    });
  }
  for (const a of review.ambiguidades ?? []) {
    push({
      id: a.id, tipo: 'ambiguidade', categoria: 'Ambiguidade', item: a.item, blocoIds: [a.blocoId],
      titulo: `“${a.expressao}”` + (a.criterioNoDocumento === 'inexistente' ? ' – Potencial risco de interpretação' : ' – Critério parcial'),
      trecho: a.trecho, descricao: a.avaliacao, sugestao: a.sugestao, requerValidacao: true, raw: a,
    });
  }
  for (const r of review.riscos ?? []) {
    push({
      id: r.id, tipo: 'risco', categoria: 'Risco de interpretação', item: r.item, blocoIds: [r.blocoId],
      titulo: r.risco, trecho: r.trecho, descricao: r.impacto, sugestao: r.recomendacao, requerValidacao: r.requerValidacao, raw: r,
    });
  }
  for (const q of review.questionamentos ?? []) {
    push({
      id: q.id, tipo: 'questionamento', categoria: q.tema, item: q.item, blocoIds: [q.blocoId],
      titulo: q.tema, trecho: '', descricao: q.questionamento, sugestao: q.motivo, requerValidacao: true, raw: q,
    });
  }
  for (const g of review.governanca ?? []) {
    push({
      id: g.id, tipo: 'governanca', subtipo: g.tipo, categoria: TEMAS_GOVERNANCA[g.tema] ?? g.tema, item: g.item, blocoIds: [g.blocoId],
      titulo: `${TIPOS_GOVERNANCA[g.tipo] ?? g.tipo} – ${TEMAS_GOVERNANCA[g.tema] ?? g.tema}`,
      descricao: g.descricao, sugestao: g.recomendacao, requerValidacao: true, raw: g,
    });
  }
  for (const f of out) f.blocoIds = (f.blocoIds ?? []).filter(Boolean);
  return out;
}

export function countFindings(review, unified = unifyFindings(review)) {
  const c = review.conceitos ?? {};
  return {
    total: unified.length,
    clareza: (review.alteracoes ?? []).filter((a) => a.categoria === 'Clareza').length,
    ambiguidades: (review.ambiguidades ?? []).length,
    duplicidades: (review.duplicidades ?? []).length,
    conceitos: (c.naoUtilizados ?? []).length + (c.possiveisFaltantes ?? []).length + (c.divergencias ?? []).length,
    responsabilidades: (review.responsabilidades ?? []).length,
    riscos: (review.riscos ?? []).length,
    questionamentos: (review.questionamentos ?? []).length,
    alteracoes: (review.alteracoes ?? []).length,
    editoriais: (review.alteracoes ?? []).filter((a) => a.tipoAjuste === 'editorial').length,
    requerValidacao: (review.alteracoes ?? []).filter((a) => a.tipoAjuste === 'requer_validacao').length,
    governanca: (review.governanca ?? []).length,
  };
}

// filters: { busca, secao, classificacao: ''|'editorial'|'validacao', categoria, tipo }
export function matchesFilters(f, filters, sectionIndex) {
  if (filters.tipo && f.tipo !== filters.tipo) return false;
  if (filters.categoria && f.categoria !== filters.categoria) return false;
  if (filters.classificacao === 'editorial' && f.requerValidacao) return false;
  if (filters.classificacao === 'validacao' && !f.requerValidacao) return false;
  if (filters.secao) {
    const keys = f.blocoIds.length
      ? f.blocoIds.map((id) => sectionIndex.sectionOf(id)?.key)
      : [sectionIndex.sectionOf('', f.item)?.key];
    if (!keys.includes(filters.secao)) return false;
  }
  if (filters.busca) {
    const needle = normalize(filters.busca);
    const hay = normalize([f.id, f.item, f.titulo, f.trecho, f.descricao, f.sugestao, f.categoria, ...Object.values(f.raw ?? {})].join(' '));
    if (!hay.includes(needle)) return false;
  }
  return true;
}

export function normalize(s) {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

// Monta a política revisada: lista de blocos com texto original, revisado e status.
// status: 'inalterado' | 'alterado' | 'validacao' | 'incluido'
export function buildRevisedPolicy(blocks, review) {
  const changes = new Map();
  const inclusions = new Map();
  for (const r of review.blocosRevisados ?? []) {
    if (r.operacao === 'incluir_apos') {
      if (!inclusions.has(r.blocoId)) inclusions.set(r.blocoId, []);
      inclusions.get(r.blocoId).push(r);
    } else changes.set(r.blocoId, r);
  }
  const statusOf = (orig, change) => {
    if (!change || change.textoRevisado.trim() === String(orig).trim()) return 'inalterado';
    return change.requerValidacao ? 'validacao' : 'alterado';
  };
  const out = [];
  for (const b of blocks) {
    if (b.type === 'table') {
      const rows = b.rows.map((row) =>
        row.map((cell) => {
          const ch = changes.get(cell.id);
          const status = statusOf(cell.text, ch);
          return { ...cell, original: cell.text, revised: status === 'inalterado' ? cell.text : ch.textoRevisado, status, alteracaoIds: ch?.alteracaoIds ?? [] };
        }),
      );
      const status = rows.flat().some((c) => c.status === 'validacao') ? 'validacao' : rows.flat().some((c) => c.status !== 'inalterado') ? 'alterado' : 'inalterado';
      out.push({ ...b, rows, status, alteracaoIds: [] });
    } else {
      const ch = changes.get(b.id);
      const status = statusOf(b.text, ch);
      out.push({ ...b, original: b.text, revised: status === 'inalterado' ? b.text : ch.textoRevisado, status, alteracaoIds: ch?.alteracaoIds ?? [] });
    }
    for (const inc of inclusions.get(b.id) ?? []) {
      const type = inc.tipoBloco === 'titulo' ? 'heading' : inc.tipoBloco === 'item_lista' ? 'list' : 'paragraph';
      out.push({
        id: `${b.id}+`, type, level: type === 'heading' ? b.level || 2 : type === 'list' ? b.level ?? 0 : 0,
        number: type === 'list' ? '•' : '', text: inc.textoRevisado, original: '', revised: inc.textoRevisado,
        status: 'incluido', requerValidacao: inc.requerValidacao, alteracaoIds: inc.alteracaoIds ?? [],
      });
    }
  }
  return out;
}
