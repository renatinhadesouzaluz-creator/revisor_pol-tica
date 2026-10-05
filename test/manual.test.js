// Modo sem API: pedido para o claude.ai e leitura da resposta colada de volta.
// Execução: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDocument } from '../server/document-parser.js';
import { demoReview } from '../server/demo-reviewer.js';
import { buildManualRequest, importManualResponse, MANUAL_MODEL_LABEL } from '../server/manual-review.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sample = (f) => fs.readFileSync(path.join(root, 'test', 'fixtures', f));

test('pedido traz regras, formato da resposta e política numerada em blocos', async () => {
  const doc = await parseDocument(sample('politica-gestao-acessos.docx'), 'gestao-acessos.docx');
  const pedido = buildManualRequest(doc);
  assert.match(pedido, /REGRAS CRÍTICAS/);
  assert.match(pedido, /FORMATO OBRIGATÓRIO DA RESPOSTA/);
  assert.match(pedido, /"alteracoes"/);
  assert.match(pedido, /```json/);
  assert.match(pedido, /Arquivo: gestao-acessos\.docx/);
  assert.match(pedido, /\[B1\] /);
  assert.match(pedido, /\[B\d+\.r3c3\] Periodicamente/);
});

test('resposta colada com texto e bloco ```json vira revisão validada', async () => {
  const doc = await parseDocument(sample('politica-simples.txt'), 'p.txt');
  const { review } = await demoReview(doc);
  const colada = `Segue a revisão:\n\n\`\`\`json\n${JSON.stringify(review, null, 2)}\n\`\`\`\n`;
  const result = importManualResponse(colada, doc);
  assert.equal(result.modelo, MANUAL_MODEL_LABEL);
  assert.equal(result.review.alteracoes.length, review.alteracoes.length);
  assert.equal(result.review.questionamentos.length, review.questionamentos.length);
});

test('resposta vazia, incompleta ou de outro formato é recusada com mensagem clara', async () => {
  const doc = await parseDocument(sample('politica-simples.txt'), 'p.txt');
  const { review } = await demoReview(doc);
  const json = JSON.stringify(review);
  assert.throws(() => importManualResponse('   ', doc), /Cole a resposta/);
  assert.throws(() => importManualResponse(json.slice(0, json.length / 2), doc), /Não foi possível ler/);
  assert.throws(() => importManualResponse('{"resposta": "ok"}', doc), /não segue o formato/);
});
