// Componentes de renderização (HTML em texto) compartilhados entre a
// interface e o relatório HTML exportado. Todo conteúdo vindo do documento ou
// da IA passa por esc() antes de entrar no HTML.

import { diffWords } from './text-diff.js';
import {
  TIPOS_RESPONSABILIDADE,
  SECOES_OBRIGATORIAS,
  RESPOSTA_PERGUNTA,
  TIPOS_GOVERNANCA,
} from './labels.js';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
const nl2br = (s) => esc(s).replace(/\n/g, '<br>');

export function diffHtml(before, after) {
  return diffWords(before, after)
    .map((op) =>
      op.type === 'eq' ? nl2br(op.text) : op.type === 'del' ? `<del class="chg-del">${nl2br(op.text)}</del>` : `<ins class="chg-ins">${nl2br(op.text)}</ins>`,
    )
    .join('');
}

const badge = (text, kind) => `<span class="badge badge-${kind}">${esc(text)}</span>`;
export const validacaoBadge = (requer) =>
  requer ? badge('Requer validação da área', 'warn') : badge('Ajuste editorial', 'ok');
const itemRef = (item) => (item ? `<span class="item-ref">Item ${esc(item)}</span>` : '');
const blockLink = (ids, linkable) =>
  linkable && ids?.length
    ? ids.map((id) => `<button type="button" class="link-btn" data-goto="${esc(id)}" title="Ver na política revisada">${esc(id)}</button>`).join(' ')
    : '';
const empty = (msg) => `<p class="empty">${esc(msg)}</p>`;
const bullets = (arr) => (arr?.length ? `<ul class="bullets">${arr.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : empty('Nenhum ponto identificado.'));

// ---------------------------------------------------------------------------
// Cards de resumo
// ---------------------------------------------------------------------------
export function renderCards(counts) {
  const cards = [
    ['Total de apontamentos', counts.total, 'neutral'],
    ['Ajustes de clareza', counts.clareza, 'neutral'],
    ['Ambiguidades', counts.ambiguidades, 'alert'],
    ['Duplicidades', counts.duplicidades, 'neutral'],
    ['Conceitos', counts.conceitos, 'neutral'],
    ['Responsabilidades', counts.responsabilidades, 'warn'],
    ['Riscos de interpretação', counts.riscos, 'alert'],
    ['Questionamentos para a área', counts.questionamentos, 'warn'],
  ];
  return `<div class="cards">${cards
    .map(([label, n, kind]) => `<div class="card card-${kind}"><div class="card-num">${n}</div><div class="card-label">${esc(label)}</div></div>`)
    .join('')}</div>`;
}

// ---------------------------------------------------------------------------
// Resumo executivo e estrutura
// ---------------------------------------------------------------------------
export function renderResumo(review, counts) {
  const r = review.resumoExecutivo;
  const blocos = [
    ['Principais melhorias sugeridas', r.principaisMelhorias],
    ['Principais ambiguidades', r.principaisAmbiguidades],
    ['Principais duplicidades', r.principaisDuplicidades],
    ['Conceitos sem utilização', r.conceitosSemUtilizacao],
    ['Possíveis conceitos faltantes', r.possiveisConceitosFaltantes],
    ['Lacunas de responsabilidades', r.lacunasResponsabilidades],
    ['Riscos de interpretação', r.riscosInterpretacao],
    ['Pontos de Governança', r.pontosGovernanca],
    ['Pontos de Controles Internos', r.pontosControlesInternos],
  ];
  return `
    <div class="panel"><h3>Visão geral</h3><p>${nl2br(r.visaoGeral)}</p>
      <p class="kpi-line"><strong>${counts.questionamentos}</strong> questionamento(s) para validação da área ·
      <strong>${counts.alteracoes}</strong> alteração(ões) no DE/PARA (${counts.editoriais} editorial(is), ${counts.requerValidacao} que requer(em) validação)</p>
    </div>
    <div class="grid-2">${blocos.map(([t, arr]) => `<div class="panel"><h3>${esc(t)}</h3>${bullets(arr)}</div>`).join('')}</div>
    ${renderEstrutura(review.estrutura)}`;
}

export function renderEstrutura(e) {
  const statusLabel = { sim: 'Presente', parcial: 'Parcial', nao: 'Ausente' };
  const kind = { sim: 'ok', parcial: 'warn', nao: 'alert' };
  const objetivoLabel = { sim: 'Adequado', parcial: 'Parcialmente adequado', nao: 'Requer ajuste' };
  return `
    <div class="panel"><h3>Validação da estrutura mínima</h3>
      <table class="tbl"><thead><tr><th>Seção</th><th>Situação</th><th>Localização</th><th>Observação</th></tr></thead><tbody>
      ${e.secoes
        .map((s) => `<tr><td>${esc(SECOES_OBRIGATORIAS[s.secao] ?? s.secao)}</td><td>${badge(statusLabel[s.presente] ?? s.presente, kind[s.presente] ?? 'neutral')}</td><td>${esc(s.localizacao)}</td><td>${esc(s.observacao)}</td></tr>`)
        .join('')}
      </tbody></table>
      <h4>É possível compreender a política a partir dessas seções?</h4>
      <table class="tbl"><thead><tr><th>Pergunta</th><th>Resposta</th><th>Comentário</th></tr></thead><tbody>
      ${e.perguntasEssenciais
        .map((p) => `<tr><td>${esc(p.pergunta)}</td><td>${badge(RESPOSTA_PERGUNTA[p.resposta] ?? p.resposta, kind[p.resposta] ?? 'neutral')}</td><td>${esc(p.comentario)}</td></tr>`)
        .join('')}
      </tbody></table>
      <h4>Análise do Objetivo</h4>
      <p>${badge(objetivoLabel[e.analiseObjetivo.adequado] ?? e.analiseObjetivo.adequado, kind[e.analiseObjetivo.adequado] ?? 'neutral')} ${esc(e.analiseObjetivo.comentario)}</p>
    </div>`;
}

// ---------------------------------------------------------------------------
// Política revisada
// ---------------------------------------------------------------------------
export function renderLegend() {
  return `<div class="legend">
    <span><del class="chg-del">texto removido</del></span>
    <span><ins class="chg-ins">texto alterado</ins></span>
    <span class="rb-validacao legend-chip"><ins class="chg-ins">ponto que requer validação</ins></span>
    <span class="rb-incluido legend-chip">texto incluído</span>
  </div>`;
}

export function renderRevisedPolicy(revised, { linkable = false } = {}) {
  let html = '';
  for (const b of revised) {
    const statusClass = `rb rb-${b.status}`;
    const refs = b.alteracaoIds?.length ? `<span class="rb-refs">DE/PARA: ${b.alteracaoIds.map(esc).join(', ')}</span>` : '';
    const flag =
      b.status === 'validacao' ? badge('Requer validação da área', 'warn')
      : b.status === 'incluido' ? badge(b.requerValidacao ? 'Texto incluído – requer validação' : 'Texto incluído', b.requerValidacao ? 'warn' : 'ok')
      : '';
    const body = b.status === 'incluido' ? `<ins class="chg-ins">${nl2br(b.revised)}</ins>` : b.status === 'inalterado' ? nl2br(b.revised) : diffHtml(b.original, b.revised);
    const anchor = linkable ? ` id="blk-${esc(b.id)}"` : '';
    const num = b.number && b.number !== '•' ? `<span class="rb-num">${esc(b.number)}</span> ` : '';

    if (b.type === 'heading') {
      const lvl = Math.min(Math.max(b.level, 1), 5) + 1;
      html += `<div class="${statusClass}"${anchor}><h${lvl} class="rb-h">${num}${body}</h${lvl}>${flag}${refs}</div>`;
    } else if (b.type === 'list') {
      const marker = b.number === '•' || !b.number ? '•' : esc(b.number);
      html += `<div class="${statusClass} rb-li rb-lvl-${Math.min(b.level || 0, 5)}"${anchor}><span class="rb-marker">${marker}</span><div class="rb-li-body">${body} ${flag}${refs}</div></div>`;
    } else if (b.type === 'table') {
      html += `<div class="${statusClass} rb-table"${anchor}><table class="tbl doc-tbl"><tbody>${b.rows
        .map(
          (row) =>
            `<tr>${row
              .map((c) => {
                const content = c.status === 'inalterado' ? nl2br(c.revised) : diffHtml(c.original, c.revised);
                const cflag = c.status === 'validacao' ? ` ${badge('Requer validação', 'warn')}` : '';
                const cref = c.alteracaoIds?.length ? ` <span class="rb-refs">${c.alteracaoIds.map(esc).join(', ')}</span>` : '';
                return `<td class="cell-${c.status}"${linkable ? ` id="blk-${esc(c.id)}"` : ''}>${content}${cflag}${cref}</td>`;
              })
              .join('')}</tr>`,
        )
        .join('')}</tbody></table></div>`;
    } else {
      html += `<div class="${statusClass}"${anchor}><p>${num}${body}</p>${flag}${refs}</div>`;
    }
  }
  return `<div class="doc">${html}</div>`;
}

// ---------------------------------------------------------------------------
// Tabelas e listas de apontamentos
// ---------------------------------------------------------------------------
export function renderDePara(items, { linkable = false } = {}) {
  if (!items.length) return empty('Nenhuma alteração corresponde aos filtros.');
  return `<div class="tbl-wrap"><table class="tbl depara"><thead><tr>
    <th>Item</th><th>Categoria</th><th>DE – Texto atual</th><th>PARA – Sugestão</th><th>Justificativa</th><th>Classificação</th></tr></thead><tbody>
    ${items
      .map((f) => {
        const a = f.raw;
        return `<tr class="${f.requerValidacao ? 'row-warn' : ''}">
          <td><strong>${esc(a.item)}</strong><div class="muted">${esc(a.id)} ${blockLink(f.blocoIds, linkable)}</div><div class="muted">${esc(a.secao)}</div></td>
          <td>${esc(a.categoria)}</td>
          <td class="de">${nl2br(a.textoAtual)}</td>
          <td class="para">${diffHtml(a.textoAtual, a.sugestao)}</td>
          <td>${nl2br(a.justificativa)}</td>
          <td>${validacaoBadge(f.requerValidacao)}</td></tr>`;
      })
      .join('')}
    </tbody></table></div>`;
}

export function renderDuplicidades(items, { linkable = false } = {}) {
  if (!items.length) return empty('Nenhuma duplicidade corresponde aos filtros.');
  return items
    .map((f) => {
      const d = f.raw;
      return `<article class="finding">
        <header><span class="fid">${esc(d.id)}</span> Possível duplicidade ${validacaoBadge(d.requerValidacao)} ${blockLink(f.blocoIds, linkable)}</header>
        <div class="grid-2">
          <div><div class="lbl">Trecho 1 ${itemRef(d.item1)}</div><blockquote>${nl2br(d.trecho1)}</blockquote></div>
          <div><div class="lbl">Trecho 2 ${itemRef(d.item2)}</div><blockquote>${nl2br(d.trecho2)}</blockquote></div>
        </div>
        <dl>
          <dt>Motivo da possível duplicidade</dt><dd>${nl2br(d.motivo)}</dd>
          <dt>Sugestão</dt><dd>${nl2br(d.sugestao)}</dd>
          ${d.redacaoConsolidada ? `<dt>Redação consolidada sugerida</dt><dd class="para">${nl2br(d.redacaoConsolidada)}</dd>` : ''}
          <dt>Local recomendado para manutenção da regra</dt><dd>${nl2br(d.localRecomendado)}</dd>
        </dl></article>`;
    })
    .join('');
}

export function renderConceitos(items, secaoExiste, { linkable = false } = {}) {
  const groups = [
    ['naoUtilizado', 'Conceito existente sem utilização'],
    ['faltante', 'Possível conceito faltante'],
    ['divergencia', 'Divergência entre definição e uso'],
  ];
  const aviso = secaoExiste ? '' : `<div class="notice notice-warn">A política não possui seção de Conceitos identificada.</div>`;
  return (
    aviso +
    groups
      .map(([sub, title]) => {
        const list = items.filter((f) => f.subtipo === sub);
        return `<h3>${esc(title)} <span class="count">${list.length}</span></h3>${
          list.length
            ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Item</th><th>Termo</th><th>${sub === 'faltante' ? 'Onde aparece' : 'Definição atual'}</th><th>${sub === 'divergencia' ? 'Uso divergente' : 'Observação'}</th><th>Recomendação para validação</th></tr></thead><tbody>${list
                .map((f) => {
                  const x = f.raw;
                  return `<tr><td>${esc(x.item)} <div class="muted">${esc(x.id)} ${blockLink(f.blocoIds, linkable)}</div></td><td><strong>${esc(x.termo)}</strong></td><td>${nl2br(sub === 'faltante' ? x.ondeAparece : x.definicao)}</td><td>${nl2br(sub === 'divergencia' ? x.usoDivergente : sub === 'faltante' ? '' : x.observacao)}</td><td>${nl2br(x.recomendacao)}</td></tr>`;
                })
                .join('')}</tbody></table></div>`
            : empty('Nenhum item.')
        }`;
      })
      .join('')
  );
}

export function renderResponsabilidades(items, { linkable = false } = {}) {
  if (!items.length) return empty('Nenhum apontamento de responsabilidade corresponde aos filtros.');
  return Object.entries(TIPOS_RESPONSABILIDADE)
    .map(([tipo, title]) => {
      const list = items.filter((f) => f.subtipo === tipo);
      if (!list.length) return '';
      return `<h3>${esc(title)} <span class="count">${list.length}</span></h3>${list
        .map((f) => {
          const r = f.raw;
          return `<article class="finding"><header><span class="fid">${esc(r.id)}</span> ${r.area ? `<strong>${esc(r.area)}</strong>` : ''} ${itemRef(r.item)} ${blockLink(f.blocoIds, linkable)}</header>
            ${r.trecho ? `<blockquote>${nl2br(r.trecho)}</blockquote>` : ''}
            <dl><dt>Descrição</dt><dd>${nl2br(r.descricao)}</dd><dt>Recomendação</dt><dd>${nl2br(r.recomendacao)}</dd></dl></article>`;
        })
        .join('')}`;
    })
    .join('');
}

export function renderAmbiguidades(items, { linkable = false } = {}) {
  if (!items.length) return empty('Nenhuma ambiguidade corresponde aos filtros.');
  return items
    .map((f) => {
      const a = f.raw;
      const cls = a.criterioNoDocumento === 'inexistente' ? badge('Potencial risco de interpretação', 'alert') : badge('Critério parcial', 'warn');
      return `<article class="finding finding-alert"><header><span class="fid">${esc(a.id)}</span> <strong>“${esc(a.expressao)}”</strong> ${cls} ${itemRef(a.item)} ${blockLink(f.blocoIds, linkable)}</header>
        <blockquote>${nl2br(a.trecho)}</blockquote>
        <dl><dt>Avaliação</dt><dd>${nl2br(a.avaliacao)}</dd><dt>Sugestão / questionamento</dt><dd>${nl2br(a.sugestao)}</dd></dl></article>`;
    })
    .join('');
}

export function renderRiscos(items, { linkable = false } = {}) {
  if (!items.length) return empty('Nenhum risco de interpretação corresponde aos filtros.');
  return items
    .map((f) => {
      const r = f.raw;
      return `<article class="finding finding-alert"><header><span class="fid">${esc(r.id)}</span> ${badge('Possível risco', 'alert')} ${validacaoBadge(r.requerValidacao)} ${itemRef(r.item)} ${blockLink(f.blocoIds, linkable)}</header>
        ${r.trecho ? `<blockquote>${nl2br(r.trecho)}</blockquote>` : ''}
        <dl><dt>Risco</dt><dd>${nl2br(r.risco)}</dd><dt>Possível impacto</dt><dd>${nl2br(r.impacto)}</dd><dt>Recomendação</dt><dd>${nl2br(r.recomendacao)}</dd></dl></article>`;
    })
    .join('');
}

export function renderQuestionamentos(items, { linkable = false } = {}) {
  if (!items.length) return empty('Nenhum questionamento corresponde aos filtros.');
  return `<div class="tbl-wrap"><table class="tbl questions"><thead><tr><th>#</th><th>Item da política</th><th>Tema</th><th>Questionamento</th><th>Motivo do questionamento</th></tr></thead><tbody>
    ${items
      .map((f) => {
        const q = f.raw;
        return `<tr><td class="muted">${esc(q.id)}</td><td><strong>${esc(q.item)}</strong> ${blockLink(f.blocoIds, linkable)}</td><td>${esc(q.tema)}</td><td>${nl2br(q.questionamento)}</td><td>${nl2br(q.motivo)}</td></tr>`;
      })
      .join('')}
    </tbody></table></div>`;
}

export function renderGovernanca(items, { linkable = false } = {}) {
  if (!items.length) return empty('Nenhum ponto de Governança/Controle Interno corresponde aos filtros.');
  return items
    .map((f) => {
      const g = f.raw;
      const kind = g.tipo === 'questionamento' ? 'warn' : 'neutral';
      return `<article class="finding"><header><span class="fid">${esc(g.id)}</span> ${badge(TIPOS_GOVERNANCA[g.tipo] ?? g.tipo, kind)} <strong>${esc(f.categoria)}</strong> ${itemRef(g.item)} ${blockLink(f.blocoIds, linkable)}</header>
        <dl><dt>Descrição</dt><dd>${nl2br(g.descricao)}</dd><dt>Recomendação</dt><dd>${nl2br(g.recomendacao)}</dd></dl></article>`;
    })
    .join('');
}

export function renderConsolidated(items, { linkable = false } = {}) {
  if (!items.length) return empty('Nenhum apontamento corresponde aos filtros.');
  return `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>#</th><th>Tipo</th><th>Item</th><th>Apontamento</th><th>Trecho</th><th>Sugestão / recomendação</th><th>Classificação</th></tr></thead><tbody>
    ${items
      .map(
        (f) => `<tr><td class="muted">${esc(f.id)}</td><td>${esc(f.tipoLabel)}<div class="muted">${esc(f.categoria)}</div></td><td>${esc(f.item)} ${blockLink(f.blocoIds, linkable)}</td>
          <td><strong>${esc(f.titulo)}</strong><div>${nl2br(f.descricao)}</div></td><td class="de">${nl2br(f.trecho)}</td><td>${nl2br(f.sugestao)}</td>
          <td>${f.tipo === 'alteracao' ? validacaoBadge(f.requerValidacao) : f.requerValidacao ? badge('Requer validação da área', 'warn') : badge('Informativo', 'neutral')}</td></tr>`,
      )
      .join('')}
    </tbody></table></div>`;
}

