// Gera o relatório completo em HTML autocontido (CSS incorporado, sem
// JavaScript nem arquivos externos). Pode ser aberto em qualquer navegador
// e enviado por e-mail.

import { unifyFindings, countFindings, buildRevisedPolicy } from './findings.js';
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
} from './render.js';

export function buildHtmlReport({ document: doc, review, meta = {} }) {
  const unified = unifyFindings(review);
  const counts = countFindings(review, unified);
  const by = (tipo) => unified.filter((f) => f.tipo === tipo);
  const revised = buildRevisedPolicy(doc.blocks, review);
  const date = meta.date ? new Date(meta.date) : new Date();
  const dataFmt = date.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

  const sections = [
    ['resumo', '1. Resumo executivo', renderResumo(review, counts)],
    ['politica', '2. Política revisada', renderLegend() + renderRevisedPolicy(revised)],
    ['depara', '3. Tabela DE/PARA', renderDePara(by('alteracao'))],
    ['duplicidades', '4. Duplicidades', renderDuplicidades(by('duplicidade'))],
    ['conceitos', '5. Análise de conceitos', renderConceitos(by('conceito'), review.conceitos.secaoConceitosExiste)],
    ['responsabilidades', '6. Papéis e Responsabilidades', renderResponsabilidades(by('responsabilidade'))],
    ['ambiguidades', '7. Ambiguidades', renderAmbiguidades(by('ambiguidade'))],
    ['riscos', '8. Riscos de interpretação', renderRiscos(by('risco'))],
    ['questionamentos', '9. Questionamentos para validação da área', renderQuestionamentos(by('questionamento'))],
    ['governanca', '10. Governança e Controles Internos', renderGovernanca(by('governanca'))],
  ];

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Relatório de revisão – ${esc(doc.fileName)}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
<header class="report-header">
  <div class="report-kicker">Revisor Inteligente de Políticas · Relatório de revisão</div>
  <h1>${esc(doc.fileName)}</h1>
  <div class="report-meta">
    <span><strong>Data da análise:</strong> ${esc(dataFmt)}</span>
    <span><strong>Formato:</strong> .${esc(doc.format)}</span>
    <span><strong>Revisão:</strong> ${esc(meta.modelo ?? '')}</span>
  </div>
  ${meta.demo ? '<div class="notice notice-alert">MODO DEMONSTRAÇÃO – resultado simulado por regras simples, sem IA. Não utilize como revisão oficial.</div>' : ''}
  <div class="notice">Este relatório apresenta sugestões e apontamentos para apoio à revisão. Itens marcados como <strong>“Requer validação da área”</strong> dependem de decisão da área responsável e não devem ser aplicados sem essa validação. A tabela DE/PARA é a trilha formal das alterações.</div>
</header>
<main>
${renderCards(counts)}
<nav class="toc"><strong>Sumário</strong><ol>${sections.map(([id, title]) => `<li><a href="#${id}">${esc(title)}</a></li>`).join('')}</ol></nav>
${sections.map(([id, title, html]) => `<section id="${id}" class="report-section"><h2>${esc(title)}</h2>${html}</section>`).join('\n')}
</main>
<footer class="report-footer">Gerado em ${esc(dataFmt)} pelo Revisor Inteligente de Políticas.</footer>
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
:root{--ink:#1f2933;--muted:#616e7c;--line:#d9dee4;--bg:#f5f7f9;--panel:#fff;--brand:#1f3a5f;
--ok:#2f7d4f;--ok-bg:#e7f4ec;--warn:#9a6700;--warn-bg:#fff4d6;--alert:#b42318;--alert-bg:#fdecea;--neutral-bg:#eef2f6}
*{box-sizing:border-box}
body{margin:0;font-family:"Segoe UI",Calibri,Arial,sans-serif;color:var(--ink);background:var(--bg);line-height:1.5;font-size:15px}
.report-header{background:var(--brand);color:#fff;padding:28px 40px}
.report-header h1{margin:4px 0 10px;font-size:26px;word-break:break-word}
.report-kicker{text-transform:uppercase;letter-spacing:.08em;font-size:12px;opacity:.85}
.report-meta{display:flex;flex-wrap:wrap;gap:8px 24px;font-size:14px;margin-bottom:12px}
.report-header .notice{background:rgba(255,255,255,.12);border-color:rgba(255,255,255,.25);color:#fff}
.report-header .notice-alert{background:#fdecea;color:var(--alert);border-color:#f5b5ae}
main{max-width:1200px;margin:0 auto;padding:24px 40px 40px}
.report-section{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:20px 24px;margin:20px 0;page-break-inside:auto}
.report-section>h2{margin:0 0 16px;color:var(--brand);font-size:20px;border-bottom:2px solid var(--line);padding-bottom:8px}
h3{font-size:16px;margin:18px 0 8px;color:var(--brand)} h4{font-size:14px;margin:16px 0 6px}
.toc{background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:14px 24px;margin:20px 0}
.toc ol{columns:2;margin:6px 0 0;padding-left:20px} .toc a{color:var(--brand)}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px}
.card{background:var(--panel);border:1px solid var(--line);border-left:4px solid #9aa5b1;border-radius:8px;padding:12px}
.card-warn{border-left-color:var(--warn)} .card-alert{border-left-color:var(--alert)}
.card-num{font-size:26px;font-weight:700} .card-label{font-size:12px;color:var(--muted)}
.panel{border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:12px 0;background:#fff}
.panel h3{margin-top:0}
.grid-2{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px}
.bullets{margin:0;padding-left:20px}
.kpi-line{color:var(--muted);font-size:14px}
.tbl-wrap{overflow-x:auto}
.tbl{width:100%;border-collapse:collapse;font-size:14px;margin:8px 0}
.tbl th{background:var(--neutral-bg);text-align:left;font-weight:600}
.tbl th,.tbl td{border:1px solid var(--line);padding:8px;vertical-align:top}
.depara td.de{background:#fafafa;min-width:180px} .depara td.para{min-width:180px}
.row-warn td:first-child{border-left:4px solid var(--warn)}
.muted{color:var(--muted);font-size:12px}
.badge{display:inline-block;padding:1px 8px;border-radius:10px;font-size:12px;font-weight:600;white-space:nowrap;background:var(--neutral-bg);color:var(--ink)}
.badge-ok{background:var(--ok-bg);color:var(--ok)} .badge-warn{background:var(--warn-bg);color:var(--warn)} .badge-alert{background:var(--alert-bg);color:var(--alert)}
.item-ref{font-size:12px;color:var(--muted);font-weight:600}
.finding{border:1px solid var(--line);border-left:4px solid #9aa5b1;border-radius:6px;padding:10px 14px;margin:10px 0;page-break-inside:avoid}
.finding-alert{border-left-color:var(--alert)}
.finding header{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:6px}
.fid{font-size:12px;color:var(--muted);font-weight:600}
.finding dl{margin:6px 0 0} .finding dt{font-weight:600;font-size:13px;color:var(--muted);margin-top:6px} .finding dd{margin:0}
.lbl{font-size:13px;font-weight:600}
blockquote{margin:6px 0;padding:6px 12px;border-left:3px solid var(--line);background:#fafafa;color:#3e4c59}
.count{background:var(--neutral-bg);border-radius:10px;padding:0 8px;font-size:12px;color:var(--muted)}
.empty{color:var(--muted);font-style:italic}
.notice{border:1px solid var(--line);background:var(--neutral-bg);border-radius:6px;padding:10px 14px;margin:10px 0;font-size:14px}
.notice-warn{background:var(--warn-bg);border-color:#f0d58c}
.legend{display:flex;flex-wrap:wrap;gap:12px;font-size:13px;margin-bottom:12px;padding:8px 12px;border:1px dashed var(--line);border-radius:6px}
.legend-chip{padding:2px 8px;border-radius:4px}
.doc{font-family:Calibri,"Segoe UI",Arial,sans-serif}
.doc p{margin:4px 0}
.rb{padding:2px 8px;border-radius:4px;margin:2px 0}
.rb-alterado{background:#f3faf5}
.rb-validacao{background:var(--warn-bg);border-left:3px solid var(--warn)}
.rb-incluido{background:#e8f1fb;border-left:3px solid #2f6db3}
.rb-h{margin:14px 0 4px;color:var(--brand)} h2.rb-h{font-size:19px} h3.rb-h{font-size:17px} h4.rb-h,h5.rb-h,h6.rb-h{font-size:15px}
.rb-num{font-weight:700;margin-right:4px}
.rb-li{display:flex;gap:8px;margin-left:1rem}.rb-lvl-1{margin-left:2.5rem}.rb-lvl-2{margin-left:4rem}.rb-lvl-3{margin-left:5.5rem}.rb-lvl-4,.rb-lvl-5{margin-left:7rem} .rb-marker{min-width:1.2rem;font-weight:600}
.rb-refs{font-size:11px;color:var(--muted);margin-left:6px}
.doc-tbl td{min-width:80px}
.cell-alterado{background:#f3faf5} .cell-validacao{background:var(--warn-bg)}
del.chg-del{color:var(--alert);text-decoration:line-through;background:#fdecea}
ins.chg-ins{color:#14532d;text-decoration:none;background:#d7f0de;border-bottom:1px solid var(--ok)}
.rb-validacao ins.chg-ins,.cell-validacao ins.chg-ins{background:#ffe7a3;color:#5c3d00;border-bottom-color:var(--warn)}
.para ins.chg-ins{background:#d7f0de}
.report-footer{text-align:center;color:var(--muted);font-size:12px;padding:20px}
@media (max-width:700px){.report-header,main{padding-left:16px;padding-right:16px}.toc ol{columns:1}}
@media print{body{background:#fff;font-size:12px}.report-header{background:#fff;color:var(--ink);border-bottom:2px solid var(--brand)}
.report-header .notice{color:var(--ink);background:var(--neutral-bg)}.report-section{border:none;padding:0;margin:16px 0}
.report-section>h2{page-break-before:always}#resumo>h2{page-break-before:auto}.toc{display:none}}
`;
