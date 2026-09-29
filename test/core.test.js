// Testes automatizados: leitura de documentos, validação do retorno da IA,
// política revisada, exportações e segurança do frontend.
// Execução: npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseDocument, toModelText, DocumentError } from '../server/document-parser.js';
import { validateReview, REVIEW_SCHEMA } from '../server/schema.js';
import { demoReview } from '../server/demo-reviewer.js';
import { buildRevisedDocx } from '../server/docx-exporter.js';
import { buildHtmlReport } from '../public/shared/html-exporter.js';
import { buildRevisedPolicy, unifyFindings, countFindings, buildSectionIndex, matchesFilters } from '../public/shared/findings.js';
import { diffWords } from '../public/shared/text-diff.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sample = (f) => fs.readFileSync(path.join(root, 'samples', f));

test('lê .docx preservando numeração automática, listas e tabelas', async () => {
  const doc = await parseDocument(sample('politica-gestao-acessos.docx'), 'p.docx');
  const h = doc.blocks.filter((b) => b.type === 'heading');
  assert.equal(h.find((b) => b.text === 'Regras e Procedimentos').number, '4.');
  assert.equal(h.find((b) => b.text === 'Revogação de acessos').number, '4.3.');
  assert.ok(doc.blocks.some((b) => b.type === 'list' && b.number === '•'));
  const table = doc.blocks.find((b) => b.type === 'table');
  assert.equal(table.rows[2][2].text, 'Periodicamente');
  assert.match(toModelText(doc.blocks), /\[B\d+\.r3c3\] Periodicamente/);
});

test('lê .md e .txt identificando títulos e itens numerados', async () => {
  const md = await parseDocument(sample('politica-sem-conceitos-e-papeis.md'), 'p.md');
  assert.ok(md.blocks.some((b) => b.type === 'heading' && b.number === '3' && b.text === 'Regras'));
  assert.ok(md.blocks.some((b) => b.number === '3.5'));
  const txt = await parseDocument(sample('politica-simples.txt'), 'p.txt');
  assert.ok(txt.blocks.some((b) => b.type === 'heading' && b.text === 'Conceitos'));
});

test('rejeita formatos inválidos, arquivos vazios e docx corrompido', async () => {
  await assert.rejects(parseDocument(Buffer.from('x'), 'a.exe'), DocumentError);
  await assert.rejects(parseDocument(Buffer.alloc(0), 'a.txt'), DocumentError);
  await assert.rejects(parseDocument(Buffer.from('não é zip'), 'a.docx'), /não é um \.docx válido/);
  await assert.rejects(parseDocument(Buffer.from('%PDF-1.4 lixo'), 'a.pdf'), DocumentError);
});

test('diff palavra a palavra identifica remoções e inclusões', () => {
  const ops = diffWords('Os documentos deverão ser enviados.', 'Os documentos devem ser enviados.');
  assert.deepEqual(ops.filter((o) => o.type !== 'eq').map((o) => o.text), ['deverão', 'devem']);
  assert.deepEqual(diffWords('igual', 'igual'), [{ type: 'eq', text: 'igual' }]);
});

test('schema é compatível com structured outputs (objetos fechados, sem restrições numéricas)', () => {
  const walk = (s) => {
    if (s.type === 'object') {
      assert.equal(s.additionalProperties, false);
      assert.deepEqual([...s.required].sort(), Object.keys(s.properties).sort());
      Object.values(s.properties).forEach(walk);
    }
    if (s.type === 'array') walk(s.items);
    for (const k of ['minimum', 'maximum', 'minLength', 'maxLength']) assert.ok(!(k in s));
  };
  walk(REVIEW_SCHEMA);
});

test('validação normaliza campos ausentes, enumerações e referências inválidas', async () => {
  const doc = await parseDocument(sample('politica-simples.txt'), 'p.txt');
  const { ok, review, errors } = validateReview(
    {
      alteracoes: [{ id: 'A1', blocoId: 'B999', item: '4.1', categoria: 'tempo verbal', tipoAjuste: 'editorial', textoAtual: 'a', sugestao: 'b', justificativa: 'c', extra: 1 }],
      blocosRevisados: [{ blocoId: 'B999', operacao: 'alterar', tipoBloco: 'paragrafo', textoRevisado: 'x', requerValidacao: false, alteracaoIds: [] }],
    },
    doc.blocks,
  );
  assert.ok(ok);
  assert.ok(errors.every((e) => /ausente/.test(e)), errors.join('; '));
  assert.equal(review.alteracoes[0].categoria, 'Tempo verbal'); // corrigido sem acento/caixa
  assert.equal(review.alteracoes[0].blocoId, ''); // referência inexistente limpa
  assert.equal('extra' in review.alteracoes[0], false);
  assert.equal(review.blocosRevisados.length, 0);
  assert.deepEqual(review.questionamentos, []);
  assert.equal(validateReview('texto', doc.blocks).ok, false);
});

test('política sem Conceitos e sem Papéis gera lacunas estruturais', async () => {
  const doc = await parseDocument(sample('politica-sem-conceitos-e-papeis.md'), 'p.md');
  const { review } = await demoReview(doc);
  const sec = Object.fromEntries(review.estrutura.secoes.map((s) => [s.secao, s.presente]));
  assert.equal(sec.conceitos, 'nao');
  assert.equal(sec.papeis, 'nao');
  assert.equal(review.conceitos.secaoConceitosExiste, false);
  assert.ok(review.responsabilidades.every((r) => r.tipo === 'area_ausente_item5'));
  assert.ok(review.duplicidades.length >= 1, 'deve detectar 3.4 × 3.5');
  assert.ok(review.ambiguidades.some((a) => a.expressao === 'em tempo hábil'));
});

test('política revisada preserva estrutura e marca alterações', async () => {
  const doc = await parseDocument(sample('politica-gestao-acessos.docx'), 'p.docx');
  const { review } = await demoReview(doc);
  review.blocosRevisados.push({ blocoId: 'B20', operacao: 'incluir_apos', tipoBloco: 'paragrafo', textoRevisado: 'Novo', requerValidacao: true, alteracaoIds: [] });
  review.blocosRevisados.push({ blocoId: 'B22.r3c3', operacao: 'alterar', tipoBloco: 'celula', textoRevisado: 'Semestral', requerValidacao: true, alteracaoIds: [] });
  const revised = buildRevisedPolicy(doc.blocks, review);
  assert.equal(revised.filter((b) => b.status !== 'incluido').length, doc.blocks.length);
  assert.equal(revised.find((b) => b.id === 'B20+').status, 'incluido');
  assert.equal(revised.find((b) => b.type === 'table').rows[2][2].status, 'validacao');
  assert.ok(revised.some((b) => b.status === 'alterado'));
  assert.deepEqual(revised.map((b) => b.number).filter(Boolean).slice(0, 3), ['1.', '2.', '3.']);
});

test('filtros por seção, classificação e busca', async () => {
  const doc = await parseDocument(sample('politica-gestao-acessos.docx'), 'p.docx');
  const { review } = await demoReview(doc);
  const unified = unifyFindings(review);
  const idx = buildSectionIndex(doc.blocks);
  assert.deepEqual(idx.sections.map((s) => s.number), ['1', '2', '3', '4', '5']);
  const regras = idx.sections.find((s) => s.number === '4').key;
  const inRegras = unified.filter((f) => matchesFilters(f, { secao: regras }, idx));
  assert.ok(inRegras.length > 0 && inRegras.length < unified.length);
  const editoriais = unified.filter((f) => matchesFilters(f, { classificacao: 'editorial' }, idx));
  assert.ok(editoriais.every((f) => !f.requerValidacao));
  assert.ok(unified.filter((f) => matchesFilters(f, { busca: 'SERVICENOW' }, idx)).length > 0);
  assert.equal(countFindings(review, unified).total, unified.length);
});

test('relatório HTML é autocontido e escapa conteúdo', async () => {
  const doc = await parseDocument(Buffer.from('1. Objetivo\nTexto com <script>alert(1)</script> que deverá ser tratado.'), 'x.txt');
  const { review } = await demoReview(doc);
  const html = buildHtmlReport({ document: doc, review, meta: { modelo: 'teste', demo: true } });
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(html.includes('<style>'));
  assert.ok(!/<script/i.test(html), 'não deve conter scripts');
  assert.ok(!/<link\s/i.test(html) && !/src=["']http/i.test(html), 'não deve depender de arquivos externos');
  assert.ok(html.includes('&lt;script&gt;'));
  for (const s of ['Resumo executivo', 'Política revisada', 'Tabela DE/PARA', 'Duplicidades', 'Análise de conceitos', 'Papéis e Responsabilidades', 'Ambiguidades', 'Riscos de interpretação', 'Questionamentos para validação da área', 'Governança e Controles Internos']) {
    assert.ok(html.includes(s), `seção ausente: ${s}`);
  }
});

test('exporta .docx válido e reabrível', async () => {
  const doc = await parseDocument(sample('politica-gestao-acessos.docx'), 'p.docx');
  const { review } = await demoReview(doc);
  const buf = await buildRevisedDocx({ document: doc, review, meta: { demo: true } });
  const reread = await parseDocument(buf, 'rev.docx');
  const text = toModelText(reread.blocks);
  assert.match(text, /Anexo I – Tabela DE\/PARA/);
  assert.match(text, /não utiliza o recurso "Controlar Alterações"/);
});

test('nenhuma chave ou segredo no código enviado ao navegador', () => {
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
  for (const file of walk(path.join(root, 'public'))) {
    const src = fs.readFileSync(file, 'utf8');
    assert.ok(!/sk-ant-/i.test(src), file);
    assert.ok(!/ANTHROPIC_API_KEY|x-api-key|apiKey\s*[:=]/i.test(src), file);
    assert.ok(!/api\.anthropic\.com/i.test(src), file);
  }
});
