// Interface do Revisor Inteligente de Políticas.
// Nenhuma chave de API existe aqui: toda chamada à IA passa pelo servidor.

import { CATEGORIAS, TIPOS_APONTAMENTO } from './shared/labels.js';
import { THEMES } from './shared/themes.js';
import { unifyFindings, countFindings, buildSectionIndex, matchesFilters, buildRevisedPolicy } from './shared/findings.js';
import {
  esc, renderCards, renderResumo, renderLegend, renderRevisedPolicy, renderDePara, renderDuplicidades, renderConceitos,
  renderResponsabilidades, renderAmbiguidades, renderRiscos, renderQuestionamentos, renderGovernanca, renderConsolidated,
} from './shared/render.js';
import { buildHtmlReport, reportFileName } from './shared/html-exporter.js';

const $ = (id) => document.getElementById(id);
const ACCEPTED = ['docx', 'txt', 'md', 'pdf'];
const LOGO_CANDIDATES = ['brand/logo.svg', 'brand/logo.png', 'brand/logo.jpg', 'brand/logo.webp'];

const state = {
  server: { limiteUploadMb: 10 },
  logo: null, // { src, dataUrl } quando existir logotipo em public/brand/
  document: null,
  review: null,
  meta: null,
  unified: [],
  sectionIndex: null,
  view: 'enviar',
  theme: 'resumo',
  onlyChanged: false,
  filters: { busca: '', secao: '', classificacao: '', categoria: '', tipo: '' },
  controller: null,
};

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------
init();

async function init() {
  bindMenu();
  bindUpload();
  bindFilters();
  loadLogo();
  renderMenu();
  try {
    const res = await fetch('api/status');
    state.server = await res.json();
    const pill = $('server-status');
    pill.hidden = false;
    if (state.server.demo) {
      pill.textContent = 'Modo de teste (sem IA)';
      pill.className = 'status-pill status-error';
    } else if (!state.server.apiConfigurada) {
      pill.textContent = 'IA não configurada';
      pill.className = 'status-pill status-error';
      showError('A chave da API não está configurada no servidor. Consulte o README (seção “Configurar a API”).');
    } else {
      pill.textContent = `IA ativa · ${state.server.modelo}`;
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

// Logotipo oficial opcional: coloque o arquivo em public/brand/logo.svg (ou .png).
async function loadLogo() {
  for (const src of LOGO_CANDIDATES) {
    try {
      const res = await fetch(src, { cache: 'no-store' });
      if (!res.ok || !/^image\//.test(res.headers.get('content-type') ?? '')) continue;
      const blob = await res.blob();
      const dataUrl = await new Promise((resolve) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.readAsDataURL(blob);
      });
      state.logo = { src, dataUrl };
      $('brand-logo').src = dataUrl;
      $('brand-logo').hidden = false;
      $('brand-wordmark').hidden = true;
      return;
    } catch {
      /* tenta o próximo */
    }
  }
}

function showError(message) {
  const el = $('global-error');
  el.textContent = message;
  el.hidden = !message;
}

// ---------------------------------------------------------------------------
// Menu lateral: cada tema tem sua própria tela
// ---------------------------------------------------------------------------
function bindMenu() {
  $('sidebar').addEventListener('click', (e) => {
    const item = e.target.closest('[data-view], [data-theme]');
    if (!item || item.disabled) return;
    if (item.dataset.view === 'enviar') {
      if (state.controller) return;
      go('enviar');
    } else if (item.dataset.theme) {
      state.theme = item.dataset.theme;
      go('resultado');
    }
    closeMobileMenu();
  });
  $('menu-toggle').addEventListener('click', () => {
    const open = !document.body.classList.contains('menu-open');
    document.body.classList.toggle('menu-open', open);
    $('menu-toggle').setAttribute('aria-expanded', String(open));
    $('scrim').hidden = !open;
  });
  $('scrim').addEventListener('click', closeMobileMenu);
  $('btn-html').addEventListener('click', downloadHtml);
  $('btn-docx').addEventListener('click', downloadDocx);
  $('theme-body').addEventListener('click', (e) => {
    const goBtn = e.target.closest('[data-goto]');
    if (goBtn) gotoBlock(goBtn.dataset.goto);
  });
  $('theme-body').addEventListener('change', (e) => {
    if (e.target.id === 'only-changed') {
      state.onlyChanged = e.target.checked;
      renderTheme();
    }
  });
}

function closeMobileMenu() {
  document.body.classList.remove('menu-open');
  $('menu-toggle').setAttribute('aria-expanded', 'false');
  $('scrim').hidden = true;
}

function go(view) {
  state.view = view;
  $('view-enviar').hidden = view !== 'enviar';
  $('view-progresso').hidden = view !== 'progresso';
  $('view-resultado').hidden = view !== 'resultado';
  if (view === 'resultado') renderTheme();
  renderMenu();
  window.scrollTo({ top: 0 });
  $('content').scrollTop = 0;
}

function renderMenu() {
  const hasResult = Boolean(state.review);
  $('menu-empty').hidden = hasResult;
  $('menu-exportar').hidden = !hasResult;
  document.querySelector('[data-view="enviar"]').classList.toggle('active', state.view === 'enviar' || state.view === 'progresso');
  if (!hasResult) {
    $('menu-results').innerHTML = '';
    return;
  }
  $('menu-results').innerHTML = THEMES.map((t) => {
    const n = t.tipos === undefined ? '' : `<span class="menu-count">${countTheme(t)}</span>`;
    const active = state.view === 'resultado' && state.theme === t.id;
    return `<button type="button" class="menu-item${active ? ' active' : ''}" data-theme="${t.id}"${active ? ' aria-current="page"' : ''}><span class="menu-label">${esc(t.label)}</span>${n}</button>`;
  }).join('');
}

function itemsOf(tipos) {
  return tipos === null ? state.unified : state.unified.filter((f) => tipos.includes(f.tipo));
}
const countTheme = (t) => itemsOf(t.tipos).length;

// ---------------------------------------------------------------------------
// Enviar política – upload e leitura
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
  if (state.review && !confirm('Enviar uma nova política? O resultado atual será descartado (baixe o relatório antes, se necessário).')) return;
  showError('');
  state.document = null;
  clearResult();
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

function clearResult() {
  state.review = null;
  state.meta = null;
  state.unified = [];
  renderMenu();
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
// Revisão (streaming de progresso)
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
  $('progress-file').textContent = state.document.fileName;
  $('progress-phase').textContent = 'Enviando documento para análise…';
  $('progress-chars').textContent = 'aguardando retorno';
  $('progress-elapsed').textContent = '0:00';
  state.controller = new AbortController();
  go('progresso');
  const started = Date.now();
  const timer = setInterval(() => {
    const s = Math.floor((Date.now() - started) / 1000);
    $('progress-elapsed').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }, 1000);

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
    prepareResult();
    state.theme = 'resumo';
    state.controller = null;
    go('resultado');
  } catch (err) {
    state.controller = null;
    go('enviar');
    showError(err.name === 'AbortError' ? 'Revisão cancelada.' : err.message);
  } finally {
    clearInterval(timer);
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
// Resultado: um tema por tela
// ---------------------------------------------------------------------------
function bindFilters() {
  const f = state.filters;
  $('f-busca').addEventListener('input', (e) => {
    f.busca = e.target.value.trim();
    renderTheme();
    renderMenu();
  });
  for (const key of ['secao', 'classificacao', 'categoria', 'tipo']) {
    $(`f-${key}`).addEventListener('change', (e) => {
      f[key] = e.target.value;
      renderTheme();
    });
  }
  $('btn-clear').addEventListener('click', () => {
    resetFilters();
    renderTheme();
  });
  $('f-categoria').innerHTML += CATEGORIAS.map((c) => `<option>${esc(c)}</option>`).join('');
  $('f-tipo').innerHTML += Object.entries(TIPOS_APONTAMENTO).map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join('');
}

function resetFilters() {
  Object.assign(state.filters, { busca: '', secao: '', classificacao: '', categoria: '', tipo: '' });
  for (const key of ['busca', 'secao', 'classificacao', 'categoria', 'tipo']) $(`f-${key}`).value = '';
}

function prepareResult() {
  const { review, meta, document: doc } = state;
  state.unified = unifyFindings(review);
  state.sectionIndex = buildSectionIndex(doc.blocks);
  $('results-title').textContent = doc.fileName;
  $('results-meta').textContent = `Análise de ${new Date(meta.date).toLocaleString('pt-BR')} · ${meta.modelo}`;
  const adj = meta.ajustesValidacao ?? [];
  $('validation-notice').hidden = !adj.length;
  $('validation-notice').textContent = adj.length
    ? `A resposta da IA teve ${adj.length} ajuste(s) de formato na validação automática. Os apontamentos afetados podem estar incompletos; confira-os no DE/PARA.`
    : '';
  $('f-secao').innerHTML =
    '<option value="">Todas as seções</option>' + state.sectionIndex.sections.map((s) => `<option value="${esc(s.key)}">${esc(s.label)}</option>`).join('');
  resetFilters();
}

function renderTheme() {
  if (!state.review) return;
  const theme = THEMES.find((t) => t.id === state.theme) ?? THEMES[0];
  const r = state.review;
  const filterable = theme.tipos !== undefined;
  $('theme-title').textContent = theme.label;
  $('theme-intro').textContent = theme.intro;
  $('filters').hidden = !filterable;
  $('f-categoria').hidden = !['depara', 'todos'].includes(theme.id);
  $('f-tipo').hidden = theme.id !== 'todos';

  const all = filterable ? itemsOf(theme.tipos) : [];
  const items = all.filter((f) => matchesFilters(f, state.filters, state.sectionIndex));
  $('filter-count').textContent = filterable ? `${items.length} de ${all.length} apontamento(s)` : '';

  const opts = { linkable: true };
  let html = '';
  switch (theme.id) {
    case 'resumo':
      html = renderCards(countFindings(r, state.unified)) + renderResumo(r, countFindings(r, state.unified));
      break;
    case 'politica': {
      let revised = buildRevisedPolicy(state.document.blocks, r);
      if (state.onlyChanged) revised = revised.filter((b) => b.status !== 'inalterado' || b.type === 'heading');
      html = `<div class="policy-tools"><label><input type="checkbox" id="only-changed" ${state.onlyChanged ? 'checked' : ''}> Mostrar somente trechos alterados (com títulos)</label></div>${renderLegend()}<div class="paper">${renderRevisedPolicy(revised, opts)}</div>`;
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
      html = renderAmbiguidades(items, opts);
      break;
    case 'riscos':
      html = renderRiscos(items, opts);
      break;
    case 'questionamentos':
      html = renderQuestionamentos(items, opts);
      break;
    case 'governanca':
      html = renderGovernanca(items, opts);
      break;
    case 'todos':
      html = renderConsolidated(items, opts);
      break;
  }
  $('theme-body').innerHTML = html;
}

function gotoBlock(blockId) {
  state.onlyChanged = false;
  state.theme = 'politica';
  go('resultado');
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
  const html = buildHtmlReport({
    document: state.document,
    review: state.review,
    meta: { ...state.meta, logo: state.logo?.dataUrl },
  });
  downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), reportFileName(state.document.fileName, 'html'));
}

async function downloadDocx() {
  const btn = $('btn-docx');
  btn.disabled = true;
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
  }
}
