// Interface do Revisor Inteligente de Políticas.
// Nenhuma chave de API existe aqui: toda chamada à IA passa pelo servidor.

import { CATEGORIAS, TIPOS_APONTAMENTO } from './shared/labels.js';
import { unifyFindings, countFindings, buildSectionIndex, matchesFilters, buildRevisedPolicy } from './shared/findings.js';
import {
  esc, renderCards, renderResumo, renderLegend, renderRevisedPolicy, renderDePara, renderDuplicidades, renderConceitos,
  renderResponsabilidades, renderAmbiguidades, renderRiscos, renderQuestionamentos, renderGovernanca, renderConsolidated,
} from './shared/render.js';
import { buildHtmlReport, reportFileName } from './shared/html-exporter.js';

const $ = (id) => document.getElementById(id);
const ACCEPTED = ['docx', 'txt', 'md', 'pdf'];

const state = {
  server: { limiteUploadMb: 10 },
  document: null,
  review: null,
  meta: null,
  unified: [],
  sectionIndex: null,
  activeTab: 'resumo',
  onlyChanged: false,
  filters: { busca: '', secao: '', classificacao: '', categoria: '', tipo: '' },
  controller: null,
};

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
init();

async function init() {
  bindUpload();
  bindResults();
  try {
    const res = await fetch('api/status');
    state.server = await res.json();
    const pill = $('server-status');
    pill.hidden = false;
    if (state.server.demo) {
      pill.textContent = 'Modo demonstração';
      pill.className = 'status-pill status-demo';
    } else if (!state.server.apiConfigurada) {
      pill.textContent = 'IA não configurada';
      pill.className = 'status-pill status-error';
      showError('A chave da API não está configurada no servidor. Consulte o README (seção “Configurar a API”) ou execute em modo demonstração.');
    } else {
      pill.textContent = `IA: ${state.server.modelo}`;
      pill.className = 'status-pill';
    }
    $('format-hint').textContent = `Formatos aceitos: .docx (recomendado), .txt, .md e .pdf · até ${state.server.limiteUploadMb} MB`;
  } catch {
    showError('Não foi possível conectar ao servidor da ferramenta.');
  }
  window.addEventListener('beforeunload', (e) => {
    if (state.review || state.controller) e.preventDefault();
  });
}

function showStep(step) {
  for (const s of ['upload', 'review', 'results']) $(`step-${s}`).hidden = s !== step;
  const order = ['upload', 'review', 'results'];
  document.querySelectorAll('.stepper li').forEach((li) => {
    const i = order.indexOf(li.dataset.step);
    li.classList.toggle('active', li.dataset.step === step);
    li.classList.toggle('done', i < order.indexOf(step));
  });
  window.scrollTo({ top: 0 });
}

function showError(message) {
  const el = $('global-error');
  el.textContent = message;
  el.hidden = !message;
}

// ---------------------------------------------------------------------------
// Etapa 1 – Upload e leitura
// ---------------------------------------------------------------------------
function bindUpload() {
  const input = $('file-input');
  const zone = $('dropzone');
  input.addEventListener('change', () => input.files[0] && loadFile(input.files[0]));
  $('btn-replace').addEventListener('click', () => {
    input.value = '';
    input.click();
  });
  ['dragenter', 'dragover'].forEach((ev) =>
    zone.addEventListener(ev, (e) => {
      e.preventDefault();
      zone.classList.add('drag');
    }),
  );
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, () => zone.classList.remove('drag')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) loadFile(file);
  });
  $('btn-start').addEventListener('click', startReview);
  $('btn-cancel').addEventListener('click', () => state.controller?.abort());
}

function setFileStatus(text, kind) {
  const el = $('file-status');
  el.textContent = text;
  el.className = `st-${kind}`;
}

async function loadFile(file) {
  showError('');
  state.document = null;
  $('btn-start').disabled = true;
  $('preview').hidden = true;
  $('file-warnings').hidden = true;
  const ext = file.name.toLowerCase().split('.').pop();
  $('file-card').hidden = false;
  $('file-name').textContent = file.name;
  $('file-format').textContent = `.${ext}`;
  $('file-format-icon').textContent = ext.toUpperCase().slice(0, 4);
  $('file-stats').textContent = `${(file.size / 1024).toFixed(0)} KB`;

  if (!ACCEPTED.includes(ext)) {
    setFileStatus('Formato não suportado', 'error');
    return showError(`O formato ".${ext}" não é aceito. Envie um arquivo .docx, .txt, .md ou .pdf.`);
  }
  if (file.size > state.server.limiteUploadMb * 1024 * 1024) {
    setFileStatus('Arquivo muito grande', 'error');
    return showError(`O arquivo tem ${(file.size / 1048576).toFixed(1)} MB e excede o limite de ${state.server.limiteUploadMb} MB.`);
  }
  if (file.size === 0) {
    setFileStatus('Arquivo vazio', 'error');
    return showError('O arquivo selecionado está vazio.');
  }

  setFileStatus('Lendo documento…', 'busy');
  try {
    const contentBase64 = await toBase64(file);
    const res = await fetch('api/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName: file.name, contentBase64 }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.erro || 'Falha na leitura do documento.');
    state.document = data.document;
    const s = data.document.stats;
    setFileStatus('Lido com sucesso', 'ok');
    $('file-stats').textContent = `${(file.size / 1024).toFixed(0)} KB · ${s.titulos} títulos · ${s.paragrafos} parágrafos · ${s.itensLista} itens de lista · ${s.tabelas} tabelas · ${s.caracteres.toLocaleString('pt-BR')} caracteres`;
    const warnings = data.document.warnings ?? [];
    $('file-warnings').innerHTML = warnings.map((w) => `<li>${esc(w)}</li>`).join('');
    $('file-warnings').hidden = !warnings.length;
    $('preview-body').innerHTML = renderRevisedPolicy(buildRevisedPolicy(data.document.blocks, { blocosRevisados: [] }));
    $('preview').hidden = false;
    $('btn-start').disabled = false;
  } catch (err) {
    setFileStatus('Erro na leitura', 'error');
    showError(err.message);
  }
}

function toBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo no navegador.'));
    reader.readAsDataURL(file);
  });
}

// ---------------------------------------------------------------------------
// Etapa 2 – Revisão (streaming de progresso)
// ---------------------------------------------------------------------------
const PHASES = {
  start: 'Documento enviado. A IA está lendo a política…',
  thinking: 'Analisando estrutura, conceitos, regras e responsabilidades…',
  writing: 'Redigindo os apontamentos e a política revisada…',
  retry: 'Ajustando o formato da resposta e repetindo a análise…',
};

async function startReview() {
  if (!state.document) return;
  showError('');
  showStep('review');
  $('progress-phase').textContent = 'Enviando documento para análise…';
  $('progress-chars').textContent = 'aguardando retorno';
  const started = Date.now();
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    $('progress-elapsed').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);
  state.controller = new AbortController();

  try {
    const res = await fetch('api/review', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: state.document }),
      signal: state.controller.signal,
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.erro || `Falha na revisão (HTTP ${res.status}).`);
    }
    const result = await readNdjson(res.body);
    state.review = result.review;
    state.meta = result.meta;
    renderResults();
    showStep('results');
  } catch (err) {
    showStep('upload');
    showError(err.name === 'AbortError' ? 'Revisão cancelada.' : err.message);
  } finally {
    clearInterval(timer);
    state.controller = null;
  }
}

async function readNdjson(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const evt = JSON.parse(line);
      if (evt.type === 'progress') {
        $('progress-phase').textContent = PHASES[evt.phase] ?? PHASES.thinking;
        if (evt.chars) $('progress-chars').textContent = `${evt.chars.toLocaleString('pt-BR')} caracteres recebidos`;
      } else if (evt.type === 'result') return evt;
      else if (evt.type === 'error') throw new Error(evt.message);
    }
    if (done) break;
  }
  throw new Error('A conexão foi encerrada antes do fim da revisão. Tente novamente.');
}

// ---------------------------------------------------------------------------
// Etapa 3 – Resultados
// ---------------------------------------------------------------------------
const TABS = [
  ['resumo', 'Resumo Executivo'],
  ['politica', 'Política Revisada'],
  ['depara', 'DE/PARA', 'alteracao'],
  ['duplicidades', 'Duplicidades', 'duplicidade'],
  ['conceitos', 'Conceitos', 'conceito'],
  ['responsabilidades', 'Papéis e Responsabilidades', 'responsabilidade'],
  ['ambiguidades', 'Ambiguidades e Riscos', ['ambiguidade', 'risco']],
  ['questionamentos', 'Questionamentos para a Área', 'questionamento'],
  ['governanca', 'Governança e Controles Internos', 'governanca'],
  ['todos', 'Todos os apontamentos', null],
];

function bindResults() {
  const f = state.filters;
  $('f-busca').addEventListener('input', (e) => {
    f.busca = e.target.value.trim();
    renderTab();
  });
  for (const key of ['secao', 'classificacao', 'categoria', 'tipo']) {
    $(`f-${key}`).addEventListener('change', (e) => {
      f[key] = e.target.value;
      renderTab();
    });
  }
  $('btn-clear').addEventListener('click', () => {
    Object.assign(f, { busca: '', secao: '', classificacao: '', categoria: '', tipo: '' });
    for (const key of ['busca', 'secao', 'classificacao', 'categoria', 'tipo']) $(`f-${key}`).value = '';
    renderTab();
  });
  $('f-categoria').innerHTML += CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join('');
  $('f-tipo').innerHTML += Object.entries(TIPOS_APONTAMENTO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');

  $('tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (btn) selectTab(btn.dataset.tab);
  });
  $('tabs').addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowLeft'].includes(e.key)) return;
    const i = TABS.findIndex(([id]) => id === state.activeTab);
    const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][0];
    selectTab(next);
    $('tabs').querySelector(`[data-tab="${next}"]`)?.focus();
  });
  $('tab-panel').addEventListener('click', (e) => {
    const go = e.target.closest('[data-goto]');
    if (go) gotoBlock(go.dataset.goto);
  });
  $('tab-panel').addEventListener('change', (e) => {
    if (e.target.id === 'only-changed') {
      state.onlyChanged = e.target.checked;
      renderTab();
    }
  });

  $('btn-html').addEventListener('click', downloadHtml);
  $('btn-docx').addEventListener('click', downloadDocx);
  $('btn-new').addEventListener('click', () => {
    if (!confirm('Iniciar nova revisão? Os resultados atuais serão descartados (baixe o relatório antes, se necessário).')) return;
    state.review = null;
    state.meta = null;
    showStep('upload');
  });
}

function renderResults() {
  const { review, meta, document: doc } = state;
  state.unified = unifyFindings(review);
  state.sectionIndex = buildSectionIndex(doc.blocks);
  const counts = countFindings(review, state.unified);

  $('results-title').textContent = doc.fileName;
  $('results-meta').textContent = `Análise de ${new Date(meta.date).toLocaleString('pt-BR')} · ${meta.modelo}`;
  $('demo-banner').hidden = !meta.demo;
  const adj = meta.ajustesValidacao ?? [];
  $('validation-notice').hidden = !adj.length;
  $('validation-notice').textContent = adj.length
    ? `A resposta da IA teve ${adj.length} ajuste(s) de formato na validação automática. Os apontamentos afetados podem estar incompletos; confira-os no DE/PARA.`
    : '';
  $('cards').innerHTML = renderCards(counts);
  $('f-secao').innerHTML =
    '<option value="">Todas as seções</option>' + state.sectionIndex.sections.map((s) => `<option value="${esc(s.key)}">${esc(s.label)}</option>`).join('');
  state.filters.secao = '';
  state.activeTab = 'resumo';
  renderTab();
}

function selectTab(id) {
  state.activeTab = id;
  renderTab();
}

function filtered(tipos) {
  const list = tipos === null ? state.unified : state.unified.filter((f) => [].concat(tipos).includes(f.tipo));
  return list.filter((f) => matchesFilters(f, state.filters, state.sectionIndex));
}

function renderTab() {
  const tab = state.activeTab;
  // Contagens das abas (respeitando filtros)
  $('tabs').innerHTML = TABS.map(([id, label, tipos]) => {
    const n = tipos === undefined ? '' : `<span class="tab-count">${filtered(tipos).length}</span>`;
    return `<button type="button" role="tab" data-tab="${id}" aria-selected="${id === tab}" tabindex="${id === tab ? 0 : -1}" class="tab${id === tab ? ' active' : ''}">${esc(label)}${n}</button>`;
  }).join('');

  const showFor = (el, tabs) => ($(el).hidden = !tabs.includes(tab));
  showFor('f-categoria', ['depara', 'todos']);
  showFor('f-tipo', ['todos']);
  const filterable = !['resumo', 'politica'].includes(tab);
  document.querySelector('.filters').classList.toggle('filters-disabled', !filterable);

  const opts = { linkable: true };
  const current = TABS.find(([id]) => id === tab);
  const items = current[2] === undefined ? [] : filtered(current[2]);
  const total = current[2] === undefined ? 0 : current[2] === null ? state.unified.length : state.unified.filter((f) => [].concat(current[2]).includes(f.tipo)).length;
  $('filter-count').textContent = filterable ? `${items.length} de ${total} apontamento(s)` : 'Filtros aplicáveis às abas de apontamentos';

  let html = '';
  const r = state.review;
  switch (tab) {
    case 'resumo':
      html = renderResumo(r, countFindings(r, state.unified));
      break;
    case 'politica': {
      let revised = buildRevisedPolicy(state.document.blocks, r);
      if (state.onlyChanged) revised = revised.filter((b) => b.status !== 'inalterado' || b.type === 'heading');
      html = `<div class="policy-tools"><label><input type="checkbox" id="only-changed" ${state.onlyChanged ? 'checked' : ''}> Mostrar somente trechos alterados (com títulos)</label></div>${renderLegend()}${renderRevisedPolicy(revised, opts)}`;
      break;
    }
    case 'depara':
      html = renderDePara(items, opts);
      break;
    case 'duplicidades':
      html = renderDuplicidades(items, opts);
      break;
    case 'conceitos':
      html = renderConceitos(items, r.conceitos.secaoConceitosExiste, opts);
      break;
    case 'responsabilidades':
      html = renderResponsabilidades(items, opts);
      break;
    case 'ambiguidades':
      html = `<h3>Ambiguidades</h3>${renderAmbiguidades(items.filter((f) => f.tipo === 'ambiguidade'), opts)}<h3>Riscos de interpretação</h3>${renderRiscos(items.filter((f) => f.tipo === 'risco'), opts)}`;
      break;
    case 'questionamentos':
      html = `<h2 class="panel-title">Questionamentos para validação da área</h2>${renderQuestionamentos(items, opts)}`;
      break;
    case 'governanca':
      html = renderGovernanca(items, opts);
      break;
    case 'todos':
      html = renderConsolidated(items, opts);
      break;
  }
  $('tab-panel').innerHTML = html;
}

function gotoBlock(blockId) {
  state.onlyChanged = false;
  selectTab('politica');
  const el = document.getElementById(`blk-${blockId}`);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 2200);
}

// ---------------------------------------------------------------------------
// Exportações
// ---------------------------------------------------------------------------
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function downloadHtml() {
  // Gerado inteiramente no navegador: o relatório não passa pelo servidor.
  const html = buildHtmlReport({ document: state.document, review: state.review, meta: state.meta });
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), reportFileName(state.document.fileName, 'html'));
}

async function downloadDocx() {
  const btn = $('btn-docx');
  btn.disabled = true;
  const label = btn.textContent;
  btn.textContent = 'Gerando .docx…';
  try {
    const res = await fetch('api/export/docx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ document: state.document, review: state.review, meta: state.meta }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.erro || 'Falha ao gerar o .docx.');
    }
    downloadBlob(await res.blob(), reportFileName(state.document.fileName, 'docx').replace('revisao-', 'politica-revisada-'));
  } catch (err) {
    showError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
