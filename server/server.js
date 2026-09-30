// Servidor do Revisor Inteligente de Políticas.
// - Serve a interface (pasta public/).
// - Faz a leitura dos documentos e a chamada à IA (a chave fica apenas aqui).
// - Não grava documentos em disco nem registra seu conteúdo em log.

import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

// Carrega o arquivo .env (se existir) antes de ler as configurações.
try {
  process.loadEnvFile(path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '.env'));
} catch {
  /* .env é opcional */
}

const { parseDocument, DocumentError, SUPPORTED_FORMATS } = await import('./document-parser.js');
const { reviewDocument, ReviewError, config: reviewConfig } = await import('./reviewer.js');
const { demoReview } = await import('./demo-reviewer.js');
const { buildRevisedDocx } = await import('./docx-exporter.js');
const { validateReview } = await import('./schema.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(ROOT, 'public');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '127.0.0.1';
const MAX_UPLOAD_MB = Number(process.env.MAX_UPLOAD_MB || 10);
const MAX_DOC_CHARS = Number(process.env.MAX_DOC_CHARS || 300_000);
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT_REVIEWS || 3);
const DEMO = process.argv.includes('--demo') || process.env.DEMO_MODE === 'true';
const API_CONFIGURED = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const AUTH_USER = process.env.APP_USER || '';
const AUTH_PASSWORD = process.env.APP_PASSWORD || '';

let activeReviews = 0;

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

const SECURITY_HEADERS = {
  'Content-Security-Policy':
    "default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });

async function readJson(req, limitBytes) {
  if (!/application\/json/.test(req.headers['content-type'] ?? '')) throw new HttpError(415, 'Envie os dados em JSON.');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limitBytes) throw new HttpError(413, `Arquivo acima do limite de ${MAX_UPLOAD_MB} MB.`);
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Requisição inválida.');
  }
}

function checkAuth(req) {
  if (!AUTH_USER || !AUTH_PASSWORD) return true;
  const [scheme, value] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Basic' || !value) return false;
  const [user, ...rest] = Buffer.from(value, 'base64').toString('utf8').split(':');
  const pass = rest.join(':');
  const eq = (a, b) => {
    const ha = crypto.createHash('sha256').update(a).digest();
    const hb = crypto.createHash('sha256').update(b).digest();
    return crypto.timingSafeEqual(ha, hb);
  };
  return eq(user, AUTH_USER) & eq(pass, AUTH_PASSWORD);
}

// ---------------------------------------------------------------------------
// Validação do documento estruturado recebido do navegador
// ---------------------------------------------------------------------------
function sanitizeDocument(doc) {
  if (!doc || typeof doc !== 'object' || !Array.isArray(doc.blocks)) throw new HttpError(400, 'Documento ausente ou inválido.');
  if (doc.blocks.length > 5000) throw new HttpError(413, 'Documento com blocos demais.');
  const str = (v, max = 20000) => String(v ?? '').slice(0, max);
  const blocks = doc.blocks.map((b, i) => {
    const type = ['heading', 'paragraph', 'list', 'table'].includes(b?.type) ? b.type : 'paragraph';
    const id = `B${i + 1}`;
    const out = { id, type, level: Number.isInteger(b.level) ? Math.max(0, Math.min(b.level, 8)) : 0, number: str(b.number, 30), text: str(b.text) };
    if (type === 'list') out.ordered = Boolean(b.ordered);
    if (type === 'table') {
      if (!Array.isArray(b.rows)) throw new HttpError(400, 'Tabela inválida no documento.');
      out.rows = b.rows.slice(0, 500).map((row, r) =>
        (Array.isArray(row) ? row : []).slice(0, 50).map((c, k) => ({ id: `${id}.r${r + 1}c${k + 1}`, text: str(c?.text) })),
      );
    }
    return out;
  });
  const chars = blocks.reduce((n, b) => n + b.text.length + (b.rows ? JSON.stringify(b.rows).length : 0), 0);
  if (chars > MAX_DOC_CHARS) {
    throw new HttpError(413, `O documento tem ${chars.toLocaleString('pt-BR')} caracteres, acima do limite de ${MAX_DOC_CHARS.toLocaleString('pt-BR')}. Divida a política em partes.`);
  }
  const format = SUPPORTED_FORMATS.includes(doc.format) ? doc.format : 'txt';
  return { fileName: str(doc.fileName, 255) || 'documento', format, blocks };
}

// ---------------------------------------------------------------------------
// Rotas da API
// ---------------------------------------------------------------------------
async function handleParse(req, res) {
  const body = await readJson(req, Math.ceil(MAX_UPLOAD_MB * 1024 * 1024 * 1.4) + 4096);
  const fileName = String(body.fileName ?? '').slice(0, 255);
  if (!fileName || typeof body.contentBase64 !== 'string') throw new HttpError(400, 'Arquivo não enviado.');
  const buffer = Buffer.from(body.contentBase64, 'base64');
  if (buffer.length > MAX_UPLOAD_MB * 1024 * 1024) throw new HttpError(413, `Arquivo acima do limite de ${MAX_UPLOAD_MB} MB.`);
  const started = Date.now();
  const parsed = await parseDocument(buffer, fileName);
  console.info(`[leitura] formato=${parsed.format} tamanho=${buffer.length}B blocos=${parsed.stats.blocos} tempo=${Date.now() - started}ms`);
  if (parsed.stats.caracteres > MAX_DOC_CHARS) {
    parsed.warnings.push(`O documento é extenso (${parsed.stats.caracteres.toLocaleString('pt-BR')} caracteres) e excede o limite de revisão. Divida a política em partes.`);
  }
  sendJson(res, 200, { document: parsed });
}

async function handleReview(req, res) {
  const body = await readJson(req, 20 * 1024 * 1024);
  const doc = sanitizeDocument(body.document);
  if (!DEMO && !API_CONFIGURED) {
    throw new HttpError(503, 'A chave da API não está configurada no servidor (ANTHROPIC_API_KEY). Consulte o README ou execute em modo demonstração.');
  }
  if (activeReviews >= MAX_CONCURRENT) throw new HttpError(429, 'Há muitas revisões em andamento. Aguarde alguns minutos e tente novamente.');

  activeReviews++;
  const controller = new AbortController();
  let finished = false;
  res.on('close', () => {
    if (!finished) controller.abort();
  });
  res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': 'application/x-ndjson; charset=utf-8', 'X-Accel-Buffering': 'no' });
  const emit = (obj) => res.writableEnded || res.write(JSON.stringify(obj) + '\n');
  const heartbeat = setInterval(() => emit({ type: 'heartbeat' }), 10_000);
  const started = Date.now();
  emit({ type: 'progress', phase: 'start', chars: 0 });
  try {
    const run = DEMO ? demoReview : reviewDocument;
    const result = await run(doc, { onProgress: (p) => emit({ type: 'progress', ...p }), signal: controller.signal });
    console.info(`[revisao] concluída em ${Math.round((Date.now() - started) / 1000)}s blocos=${doc.blocks.length}`);
    emit({
      type: 'result',
      review: result.review,
      meta: { modelo: result.modelo, demo: DEMO, date: new Date().toISOString(), ajustesValidacao: result.ajustesValidacao },
    });
  } catch (err) {
    const known = err instanceof ReviewError || err instanceof HttpError;
    if (!known) console.error('[revisao] falha:', err?.name, String(err?.message ?? '').slice(0, 200));
    emit({ type: 'error', message: known ? err.message : 'Erro inesperado durante a revisão.' });
  } finally {
    finished = true;
    clearInterval(heartbeat);
    activeReviews--;
    res.end();
  }
}

async function handleExportDocx(req, res) {
  const body = await readJson(req, 30 * 1024 * 1024);
  const doc = sanitizeDocument(body.document);
  const { review, ok } = validateReview(body.review, doc.blocks);
  if (!ok) throw new HttpError(400, 'Revisão inválida para exportação.');
  const meta = { demo: Boolean(body.meta?.demo), date: body.meta?.date };
  const buffer = await buildRevisedDocx({ document: doc, review, meta });
  const base = doc.fileName.replace(/\.[^.]+$/, '').replace(/[^\p{L}\p{N}_-]+/gu, '-').slice(0, 80) || 'politica';
  send(res, 200, buffer, {
    'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'Content-Disposition': `attachment; filename="politica-revisada.docx"; filename*=UTF-8''${encodeURIComponent(`${base}-revisada.docx`)}`,
  });
}

function handleStatus(res) {
  const cfg = reviewConfig();
  sendJson(res, 200, {
    demo: DEMO,
    apiConfigurada: API_CONFIGURED,
    modelo: DEMO ? 'demonstração (sem IA)' : cfg.model,
    limiteUploadMb: MAX_UPLOAD_MB,
    formatos: SUPPORTED_FORMATS,
  });
}

async function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.resolve(PUBLIC_DIR, rel);
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !CONTENT_TYPES[path.extname(file)]) {
    return send(res, 404, 'Não encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
  try {
    const data = await fs.readFile(file);
    send(res, 200, req.method === 'HEAD' ? undefined : data, { 'Content-Type': CONTENT_TYPES[path.extname(file)] });
  } catch {
    send(res, 404, 'Não encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (!checkAuth(req)) {
      return send(res, 401, 'Autenticação necessária', { 'WWW-Authenticate': 'Basic realm="Revisor de Politicas", charset="UTF-8"', 'Content-Type': 'text/plain; charset=utf-8' });
    }
    const { pathname } = new URL(req.url, 'http://localhost');
    if (pathname.startsWith('/api/')) {
      if (req.method === 'GET' && pathname === '/api/status') return handleStatus(res);
      if (req.method !== 'POST') throw new HttpError(405, 'Método não permitido.');
      if (pathname === '/api/parse') return await handleParse(req, res);
      if (pathname === '/api/review') return await handleReview(req, res);
      if (pathname === '/api/export/docx') return await handleExportDocx(req, res);
      throw new HttpError(404, 'Rota não encontrada.');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Método não permitido.');
    return await serveStatic(req, res, pathname);
  } catch (err) {
    const status = err instanceof HttpError ? err.status : err instanceof DocumentError ? 422 : 500;
    if (status === 500) console.error('[servidor] erro:', err?.name, String(err?.message ?? '').slice(0, 200));
    if (res.headersSent) return res.end();
    sendJson(res, status, { erro: status === 500 ? 'Erro interno no servidor.' : err.message });
  }
});

// Revisões podem levar vários minutos: sem timeout de requisição.
server.requestTimeout = 0;
server.timeout = 0;

server.listen(PORT, HOST, () => {
  console.info(`Revisor Inteligente de Políticas em http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  if (DEMO) console.info('MODO DEMONSTRAÇÃO ativo: revisões simuladas, sem IA.');
  else if (!API_CONFIGURED) console.warn('ATENÇÃO: ANTHROPIC_API_KEY não configurada. Crie o arquivo .env (veja .env.example).');
  else console.info(`Modelo: ${reviewConfig().model} · esforço: ${reviewConfig().effort}`);
  if (HOST === '0.0.0.0' && !(AUTH_USER && AUTH_PASSWORD)) {
    console.warn('ATENÇÃO: servidor exposto na rede sem senha. Considere definir APP_USER e APP_PASSWORD.');
  }
});
