// Gera o relatório completo em HTML autocontido: CSS incorporado, sem
// JavaScript nem arquivos externos. Pode ser aberto em qualquer navegador e
// enviado por e-mail. A navegação é por menu lateral (um tema por tela),
// feita apenas com CSS (âncoras + :target); na impressão, todos os temas
// saem em sequência.

import { unifyFindings, countFindings, buildRevisedPolicy } from './findings.js';
import { THEMES } from './themes.js';
import {
  esc,
  renderCards,
  renderResumo,
  renderLegend,
  renderRevisedPolicy,
  renderDePara,
  renderDuplicidades,
  renderConceitos,
  renderResponsabilidades,
  renderAmbiguidades,
  renderRiscos,
  renderQuestionamentos,
  renderGovernanca,
  renderConsolidated,
} from './render.js';

export function buildHtmlReport({ document: doc, review, meta = {} }) {
  const unified = unifyFindings(review);
  const counts = countFindings(review, unified);
  const itemsOf = (tipos) => (tipos === null ? unified : unified.filter((f) => tipos.includes(f.tipo)));
  const revised = buildRevisedPolicy(doc.blocks, review);
  const date = meta.date ? new Date(meta.date) : new Date();
  const dataFmt = date.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
  const logo = typeof meta.logo === 'string' && /^data:image\/(png|jpeg|webp|svg\+xml);base64,/.test(meta.logo) ? meta.logo : '';

  const body = {
    resumo: () => renderCards(counts) + renderResumo(review, counts),
    politica: () => renderLegend() + `<div class="paper">${renderRevisedPolicy(revised)}</div>`,
    depara: (items) => renderDePara(items),
    duplicidades: (items) => renderDuplicidades(items),
    conceitos: (items) => renderConceitos(items, review.conceitos.secaoConceitosExiste),
    responsabilidades: (items) => renderResponsabilidades(items),
    ambiguidades: (items) => renderAmbiguidades(items),
    riscos: (items) => renderRiscos(items),
    questionamentos: (items) => renderQuestionamentos(items),
    governanca: (items) => renderGovernanca(items),
    todos: (items) => renderConsolidated(items),
  };

  // O Resumo fica por último no HTML para ser a tela padrão (sem âncora):
  // ele é ocultado quando qualquer outro tema anterior está selecionado.
  const ordered = [...THEMES.filter((t) => t.id !== 'resumo'), THEMES.find((t) => t.id === 'resumo')];
  const sections = ordered
    .map((t) => {
      const items = t.tipos === undefined ? [] : itemsOf(t.tipos);
      return `<section id="${t.id}" class="theme">
  <h2 class="view-title">${esc(t.label)}</h2>
  <p class="view-intro">${esc(t.intro)}</p>
  ${body[t.id](items)}
</section>`;
    })
    .join('\n');

  const menu = THEMES.map((t) => {
    const n = t.tipos === undefined ? '' : `<span class="menu-count">${itemsOf(t.tipos).length}</span>`;
    return `<a class="menu-item" href="#${t.id}"><span class="menu-label">${esc(t.label)}</span>${n}</a>`;
  }).join('');

  // Destaque do item ativo no menu (navegadores com suporte a :has).
  const activeCss = THEMES.map((t) => `body:has(#${t.id}:target) .menu-item[href="#${t.id}"]`).join(',\n') +
    `,\nbody:not(:has(.theme:target)) .menu-item[href="#resumo"]{background:var(--cimed-yellow-soft);border-left-color:var(--cimed-yellow-strong);font-weight:700}`;

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de revisão – ${esc(doc.fileName)}</title>
<style>${REPORT_CSS}
${activeCss}</style>
</head>
<body>
<header class="topbar">
  <div class="brand">
    ${logo ? `<img class="brand-logo" src="${esc(logo)}" alt="Cimed">` : '<span class="brand-wordmark">Cimed</span>'}
    <span class="brand-divider"></span>
    <div><div class="brand-title">Relatório de Revisão de Política</div><div class="brand-sub">Revisor Inteligente de Políticas · Controles Internos</div></div>
  </div>
</header>
<div class="layout">
  <aside class="sidebar">
    <div class="doc-card">
      <div class="doc-label">Documento analisado</div>
      <div class="doc-name">${esc(doc.fileName)}</div>
      <div class="doc-meta">Análise: ${esc(dataFmt)}</div>
      <div class="doc-meta">Revisão: ${esc(meta.modelo ?? '')}</div>
    </div>
    <nav aria-label="Temas do relatório">
      <div class="menu-heading">Temas</div>
      ${menu}
    </nav>
  </aside>
  <main class="content">
    ${meta.demo ? '<div class="alert alert-error">MODO DE TESTE – resultado simulado por regras simples, sem IA. Não utilize como revisão oficial.</div>' : ''}
    <div class="notice">Itens marcados como <strong>“Requer validação da área”</strong> dependem de decisão da área responsável e não devem ser aplicados sem essa validação. A tabela DE/PARA é a trilha formal das alterações.</div>
    <div class="themes">
${sections}
    </div>
    <footer class="report-footer">Gerado em ${esc(dataFmt)} pelo Revisor Inteligente de Políticas.</footer>
  </main>
</div>
</body>
</html>`;
}

export function reportFileName(fileName, ext = 'html') {
  const base = String(fileName).replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80);
  const d = new Date();
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
  return `revisao-${base}-${stamp}.${ext}`;
}

const REPORT_CSS = `
:root{--cimed-yellow:#FFD100;--cimed-yellow-strong:#F2B700;--cimed-yellow-soft:#FFF7D1;--cimed-navy:#0B2545;--cimed-navy-2:#16407A;
--ink:#1d2733;--muted:#5f6b78;--line:#e2e2dc;--bg:#f7f7f3;--ok:#1e7a46;--ok-bg:#e5f4ea;--warn:#b45309;--warn-bg:#ffedd5;--alert:#b42318;--alert-bg:#fdecea;--neutral-bg:#f0f1ee;--radius:10px}
*{box-sizing:border-box}
html{scroll-padding-top:90px}
body{margin:0;font-family:"Segoe UI","Helvetica Neue",Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5;font-size:15px}
.topbar{position:sticky;top:0;z-index:5;height:68px;background:var(--cimed-yellow);color:var(--cimed-navy);display:flex;align-items:center;padding:0 24px;box-shadow:0 1px 0 rgba(11,37,69,.12)}
.brand{display:flex;align-items:center;gap:14px;min-width:0}
.brand-logo{height:38px;width:auto}
.brand-wordmark{font-size:28px;font-weight:800;letter-spacing:-.02em;text-transform:lowercase;line-height:1}
.brand-divider{width:1px;height:34px;background:rgba(11,37,69,.35)}
.brand-title{font-size:17px;font-weight:700}.brand-sub{font-size:12px;opacity:.8}
.layout{display:flex;min-height:calc(100vh - 68px)}
.sidebar{width:290px;flex:none;background:#fff;border-right:1px solid var(--line);position:sticky;top:68px;height:calc(100vh - 68px);overflow-y:auto;padding:18px 12px 24px}
.doc-card{background:var(--cimed-yellow-soft);border:1px solid #efd97a;border-radius:10px;padding:12px 14px;margin:0 0 18px}
.doc-label{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.doc-name{font-weight:700;color:var(--cimed-navy);word-break:break-word;margin:2px 0 4px}
.doc-meta{font-size:12px;color:var(--muted)}
.menu-heading{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);padding:0 12px 6px}
.menu-item{display:flex;align-items:center;gap:10px;text-decoration:none;font-size:14px;color:var(--cimed-navy);padding:9px 12px;border-left:4px solid transparent;border-radius:0 8px 8px 0;margin:1px 0}
.menu-item:hover{background:var(--neutral-bg)}
.menu-label{flex:1}
.menu-count{background:var(--neutral-bg);border-radius:10px;padding:0 8px;font-size:12px;font-weight:700;min-width:26px;text-align:center}
.content{flex:1;min-width:0;padding:24px 36px 40px}
.theme{display:none;max-width:1200px}
.theme:target{display:block}
#resumo{display:block}
.theme:target~#resumo{display:none}
.view-title{font-size:26px;margin:8px 0 6px;color:var(--cimed-navy);position:relative;padding-bottom:10px}
.view-title::after{content:"";position:absolute;left:0;bottom:0;width:56px;height:4px;border-radius:2px;background:var(--cimed-yellow)}
.view-intro{color:var(--muted);margin:10px 0 20px;max-width:820px}
h3{font-size:16px;margin:18px 0 8px;color:var(--cimed-navy)}h4{font-size:14px;margin:16px 0 6px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:16px}
.card{background:#fff;border:1px solid var(--line);border-top:4px solid var(--cimed-yellow);border-radius:var(--radius);padding:12px 14px}
.card-warn{border-top-color:var(--warn)}.card-alert{border-top-color:var(--alert)}
.card-num{font-size:28px;font-weight:800;line-height:1.2;color:var(--cimed-navy)}.card-label{font-size:12px;color:var(--muted)}
.panel{border:1px solid var(--line);border-radius:var(--radius);padding:14px 18px;margin:12px 0;background:#fff}.panel h3{margin-top:0}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px}
.bullets{margin:0;padding-left:20px}.kpi-line{color:var(--muted);font-size:14px}
.tbl-wrap{overflow-x:auto;background:#fff;border-radius:var(--radius)}
.tbl{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0;background:#fff}
.tbl th{background:var(--cimed-navy);color:#fff;text-align:left;font-weight:600}
.tbl th,.tbl td{border:1px solid var(--line);padding:8px 10px;vertical-align:top}
.tbl tbody tr:nth-child(even) td{background:#fbfbf8}
.depara td.de{background:#f7f7f4!important;min-width:180px}.depara td.para{min-width:180px}
.row-warn td:first-child{border-left:4px solid var(--warn)}
.muted{color:var(--muted);font-size:12px}
.badge{display:inline-block;padding:1px 9px;border-radius:10px;font-size:12px;font-weight:700;white-space:nowrap;background:var(--neutral-bg);color:var(--ink)}
.badge-ok{background:var(--ok-bg);color:var(--ok)}.badge-warn{background:var(--warn-bg);color:var(--warn)}.badge-alert{background:var(--alert-bg);color:var(--alert)}
.item-ref{font-size:12px;color:var(--muted);font-weight:700}
.finding{background:#fff;border:1px solid var(--line);border-left:4px solid #b8bdb3;border-radius:8px;padding:12px 16px;margin:10px 0;page-break-inside:avoid}
.finding-alert{border-left-color:var(--alert)}
.finding header{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}
.fid{font-size:12px;color:var(--muted);font-weight:700}
.finding dl{margin:6px 0 0}.finding dt{font-weight:700;font-size:13px;color:var(--muted);margin-top:6px}.finding dd{margin:0}
.lbl{font-size:13px;font-weight:700}
blockquote{margin:6px 0;padding:6px 12px;border-left:3px solid var(--cimed-yellow);background:#fbfbf6;color:#3e4c59}
.count{background:var(--neutral-bg);border-radius:10px;padding:0 8px;font-size:12px;color:var(--muted)}
.empty{color:var(--muted);font-style:italic}
.notice{border:1px solid var(--line);background:#fff;border-left:4px solid var(--cimed-yellow);border-radius:8px;padding:10px 14px;margin:0 0 10px;font-size:14px}
.notice-warn{background:var(--warn-bg);border-color:#fdba74}
.alert{border-radius:var(--radius);padding:12px 16px;margin:0 0 12px;border:1px solid #f5b5ae;background:var(--alert-bg);color:var(--alert);font-size:14px}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:13px;margin-bottom:12px;padding:8px 12px;border:1px dashed #cfd2cb;border-radius:8px;background:#fff}
.legend-chip{padding:2px 8px;border-radius:4px}
.paper{background:#fff;border:1px solid var(--line);border-radius:var(--radius);padding:24px 32px}
.doc{font-family:Calibri,"Segoe UI",Arial,sans-serif}.doc p{margin:4px 0}
.rb{padding:2px 8px;border-radius:4px;margin:2px 0}
.rb-alterado{background:#f1f9f4}
.rb-validacao{background:var(--warn-bg);border-left:3px solid var(--warn)}
.rb-incluido{background:#e8f1fb;border-left:3px solid #2f6db3}
.rb-h{margin:14px 0 4px;color:var(--cimed-navy)}h2.rb-h{font-size:19px}h3.rb-h{font-size:17px}h4.rb-h,h5.rb-h,h6.rb-h{font-size:15px}
.rb-num{font-weight:700;margin-right:4px}
.rb-li{display:flex;gap:8px;margin-left:1rem}.rb-lvl-1{margin-left:2.5rem}.rb-lvl-2{margin-left:4rem}.rb-lvl-3{margin-left:5.5rem}.rb-lvl-4,.rb-lvl-5{margin-left:7rem}
.rb-marker{min-width:1.2rem;font-weight:700}.rb-refs{font-size:11px;color:var(--muted);margin-left:6px}
.doc-tbl th{background:var(--neutral-bg);color:var(--ink)}.doc-tbl td{min-width:80px}
.cell-alterado{background:#f1f9f4!important}.cell-validacao{background:var(--warn-bg)!important}
del.chg-del{color:var(--alert);text-decoration:line-through;background:var(--alert-bg)}
ins.chg-ins{color:#14532d;text-decoration:none;background:#d7f0de;border-bottom:1px solid var(--ok)}
.rb-validacao ins.chg-ins,.cell-validacao ins.chg-ins{background:#fed7aa;color:#7c2d12;border-bottom-color:var(--warn)}
.report-footer{color:var(--muted);font-size:12px;padding:24px 0 0}
@media (max-width:900px){.layout{display:block}.sidebar{position:static;width:auto;height:auto;border-right:none;border-bottom:1px solid var(--line)}
.sidebar nav{display:flex;flex-wrap:wrap;gap:4px}.sidebar .menu-heading{width:100%}.menu-item{border:1px solid var(--line);border-radius:8px;padding:6px 10px}
.content{padding:18px 16px 32px}.brand-sub,.brand-divider{display:none}.paper{padding:14px}}
@media print{body{background:#fff;font-size:12px}.topbar{position:static;box-shadow:none}.sidebar{display:none}.layout{display:block}
.content{padding:0}.themes{display:flex;flex-direction:column}.theme{display:block!important;page-break-before:always}#resumo{order:-1;page-break-before:auto}.view-title{margin-top:0}}
`;
