// Testa o caminho real de chamada à IA contra uma API falsa local
// (sem custo e sem enviar dados para fora da máquina).

import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

const requests = [];
let mode = 'ok';

const validReview = {
  resumoExecutivo: { visaoGeral: 'Resumo', principaisMelhorias: ['x'], principaisAmbiguidades: [], principaisDuplicidades: [], conceitosSemUtilizacao: [], possiveisConceitosFaltantes: [], lacunasResponsabilidades: [], riscosInterpretacao: [], pontosGovernanca: [], pontosControlesInternos: [] },
  estrutura: { secoes: [], perguntasEssenciais: [], analiseObjetivo: { adequado: 'sim', comentario: '' } },
  alteracoes: [{ id: 'A1', blocoId: 'B2', item: '1', secao: 'Objetivo', categoria: 'Tempo verbal', tipoAjuste: 'editorial', textoAtual: 'deverão', sugestao: 'devem', justificativa: 'Presente' }],
  blocosRevisados: [{ blocoId: 'B2', operacao: 'alterar', tipoBloco: 'paragrafo', textoRevisado: 'Os documentos devem ser enviados.', requerValidacao: false, alteracaoIds: ['A1'] }],
  duplicidades: [], conceitos: { secaoConceitosExiste: false, naoUtilizados: [], possiveisFaltantes: [], divergencias: [] },
  responsabilidades: [], ambiguidades: [], riscos: [],
  questionamentos: [{ id: 'Q1', blocoId: 'B2', item: '1', tema: 'Responsabilidade', questionamento: 'Quem envia?', motivo: 'Definir responsável.' }],
  governanca: [],
};

function sse(res, text, stopReason = 'end_turn') {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev('message_start', { message: { id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 1 } } });
  ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  for (let i = 0; i < text.length; i += 500) ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text: text.slice(i, i + 500) } });
  ev('content_block_stop', { index: 0 });
  ev('message_delta', { delta: { stop_reason: stopReason, stop_sequence: null }, usage: { output_tokens: 100 } });
  ev('message_stop', {});
  res.end();
}

const fake = http.createServer(async (req, res) => {
  let body = '';
  for await (const c of req) body += c;
  const json = JSON.parse(body);
  requests.push({ headers: req.headers, body: json });
  if (mode === 'schema-400' && json.output_config?.format) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ type: 'error', error: { type: 'invalid_request_error', message: 'output_config.format: schema is too complex' } }));
  }
  if (mode === 'refusal') return sse(res, '', 'refusal');
  if (mode === 'max_tokens') return sse(res, '{"resumo', 'max_tokens');
  const text = mode === 'schema-400' ? 'Segue:\n```json\n' + JSON.stringify(validReview) + '\n```' : JSON.stringify(validReview);
  sse(res, text);
});
await new Promise((r) => fake.listen(0, '127.0.0.1', r));
process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
process.env.ANTHROPIC_API_KEY = 'chave-de-teste';
after(() => fake.close());

const { reviewDocument } = await import('../server/reviewer.js');
const { parseDocument } = await import('../server/document-parser.js');
const doc = await parseDocument(Buffer.from('1. Objetivo\nOs documentos deverão ser enviados.'), 'p.txt');

test('envia requisição correta e valida a resposta estruturada', async () => {
  mode = 'ok';
  const progress = [];
  const { review } = await reviewDocument(doc, { onProgress: (p) => progress.push(p) });
  const req = requests.at(-1);
  assert.equal(req.body.model, 'claude-opus-5-5');
  assert.deepEqual(req.body.thinking, { type: 'adaptive' });
  assert.equal(req.body.output_config.format.type, 'json_schema');
  assert.equal(req.body.output_config.effort, 'high');
  assert.equal(req.body.fallbacks, 'default');
  assert.match(req.headers['anthropic-beta'], /server-side-fallback-2026-07-01/);
  assert.match(req.body.system, /Não invente regras/);
  assert.match(req.body.messages[0].content, /\[B2\] PARÁGRAFO \| Os documentos deverão ser enviados\./);
  assert.equal(req.headers['x-api-key'], 'chave-de-teste');
  assert.equal(review.alteracoes[0].sugestao, 'devem');
  assert.equal(review.questionamentos.length, 1);
  assert.ok(progress.length > 0);
});

test('se structured outputs for recusado, repete com o schema no prompt', async () => {
  mode = 'schema-400';
  const before = requests.length;
  const { review } = await reviewDocument(doc);
  const [first, second] = requests.slice(before);
  assert.ok(first.body.output_config.format);
  assert.equal(second.body.output_config.format, undefined);
  assert.match(second.body.system, /FORMATO OBRIGATÓRIO DA RESPOSTA/);
  assert.equal(review.alteracoes.length, 1);
});

test('trata recusa e resposta truncada com mensagens claras', async () => {
  mode = 'refusal';
  await assert.rejects(reviewDocument(doc), /recusou/);
  mode = 'max_tokens';
  await assert.rejects(reviewDocument(doc), /limite de tamanho/);
});
