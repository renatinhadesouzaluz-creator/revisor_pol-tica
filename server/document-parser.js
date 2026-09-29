// Extração e estruturação de documentos (.docx, .txt, .md, .pdf) em blocos.
//
// Bloco: { id, type: 'heading'|'paragraph'|'list'|'table', level, number, text,
//          ordered?, rows? }   (rows: [[{ id, text }]] para tabelas)
//
// Todo o processamento é feito em memória: nenhum arquivo é gravado em disco.

import { unzipSync, strFromU8 } from 'fflate';
import { DOMParser } from '@xmldom/xmldom';

export const SUPPORTED_FORMATS = ['docx', 'txt', 'md', 'pdf'];

export class DocumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DocumentError';
  }
}

export async function parseDocument(buffer, fileName) {
  const ext = String(fileName).toLowerCase().split('.').pop();
  if (!SUPPORTED_FORMATS.includes(ext)) {
    throw new DocumentError(`Formato ".${ext}" não suportado. Envie um arquivo .docx, .txt, .md ou .pdf.`);
  }
  if (!buffer?.length) throw new DocumentError('O arquivo está vazio.');

  let blocks;
  const warnings = [];
  if (ext === 'docx') {
    if (buffer[0] !== 0x50 || buffer[1] !== 0x4b) {
      throw new DocumentError('O arquivo não é um .docx válido. Se for um .doc antigo, salve-o como .docx no Word.');
    }
    blocks = parseDocx(buffer, warnings);
  } else if (ext === 'pdf') {
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new DocumentError('O arquivo não é um PDF válido.');
    }
    blocks = await parsePdf(buffer, warnings);
  } else {
    const text = decodeText(buffer);
    blocks = ext === 'md' ? parseMarkdown(text) : parsePlainText(text);
  }

  blocks = blocks.filter((b) => b.type === 'table' || b.text.trim() || b.number);
  assignIds(blocks);
  if (!blocks.length) throw new DocumentError('Não foi possível identificar conteúdo de texto no documento.');

  const stats = {
    blocos: blocks.length,
    titulos: blocks.filter((b) => b.type === 'heading').length,
    paragrafos: blocks.filter((b) => b.type === 'paragraph').length,
    itensLista: blocks.filter((b) => b.type === 'list').length,
    tabelas: blocks.filter((b) => b.type === 'table').length,
    caracteres: blocks.reduce((n, b) => n + blockPlainText(b).length, 0),
  };
  if (!stats.titulos) {
    warnings.push('Nenhum título foi identificado. A análise de estrutura pode ficar limitada.');
  }
  return { fileName, format: ext, blocks, stats, warnings };
}

function assignIds(blocks) {
  blocks.forEach((b, i) => {
    b.id = `B${i + 1}`;
    if (b.rows) {
      b.rows.forEach((row, r) =>
        row.forEach((cell, c) => {
          cell.id = `${b.id}.r${r + 1}c${c + 1}`;
        }),
      );
    }
  });
}

export function blockPlainText(b) {
  if (b.type === 'table') return b.rows.map((r) => r.map((c) => c.text).join(' | ')).join('\n');
  return b.text;
}

function decodeText(buffer) {
  const utf8 = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  // Muitos .txt corporativos ainda estão em Windows-1252.
  if (utf8.includes('�')) return new TextDecoder('windows-1252').decode(buffer);
  return utf8.replace(/^﻿/, '');
}

// ---------------------------------------------------------------------------
// Representação textual enviada à IA
// ---------------------------------------------------------------------------

export function toModelText(blocks) {
  const lines = [];
  for (const b of blocks) {
    const num = b.number ? ` | nº ${b.number}` : '';
    if (b.type === 'heading') lines.push(`[${b.id}] TÍTULO nível ${b.level}${num} | ${b.text}`);
    else if (b.type === 'list') {
      lines.push(`[${b.id}] ITEM DE LISTA ${b.ordered ? 'numerado' : 'com marcador'} nível ${b.level + 1}${num} | ${b.text}`);
    } else if (b.type === 'table') {
      lines.push(`[${b.id}] TABELA (${b.rows.length} linhas)`);
      for (const row of b.rows) lines.push('  ' + row.map((c) => `[${c.id}] ${c.text.replace(/\n/g, ' / ')}`).join(' || '));
    } else lines.push(`[${b.id}] PARÁGRAFO${num} | ${b.text}`);
  }
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// DOCX
// ---------------------------------------------------------------------------

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

function parseDocx(buffer, warnings) {
  let files;
  try {
    files = unzipSync(new Uint8Array(buffer), {
      filter: (f) => /^word\/(document|numbering|styles)\.xml$/.test(f.name),
    });
  } catch {
    throw new DocumentError('Não foi possível abrir o .docx (arquivo corrompido ou protegido por senha).');
  }
  if (!files['word/document.xml']) throw new DocumentError('O .docx não contém o corpo do documento.');

  const parse = (name) =>
    files[name] ? new DOMParser({ onError: () => {} }).parseFromString(strFromU8(files[name]), 'text/xml') : null;
  const doc = parse('word/document.xml');
  const styles = readStyles(parse('word/styles.xml'));
  const numbering = new Numbering(parse('word/numbering.xml'));

  const body = doc.getElementsByTagNameNS(W_NS, 'body')[0];
  if (!body) throw new DocumentError('O .docx não contém o corpo do documento.');

  const blocks = [];
  const walk = (parent) => {
    for (const node of children(parent)) {
      if (node.localName === 'p') {
        const block = paragraphToBlock(node, styles, numbering);
        if (block) blocks.push(block);
      } else if (node.localName === 'tbl') {
        blocks.push(tableToBlock(node));
      } else if (node.localName === 'sdt') {
        const content = child(node, 'sdtContent');
        if (content) walk(content);
      }
    }
  };
  walk(body);
  if (!blocks.length) warnings.push('O .docx não possui parágrafos com texto.');
  return blocks;
}

function children(node) {
  const out = [];
  for (let n = node.firstChild; n; n = n.nextSibling) if (n.nodeType === 1) out.push(n);
  return out;
}
function child(node, name) {
  return children(node).find((n) => n.localName === name) ?? null;
}
function attr(node, name) {
  return node?.getAttributeNS(W_NS, name) || node?.getAttribute(`w:${name}`) || '';
}

function readStyles(stylesDoc) {
  const map = new Map();
  if (!stylesDoc) return map;
  for (const s of Array.from(stylesDoc.getElementsByTagNameNS(W_NS, 'style'))) {
    if (attr(s, 'type') !== 'paragraph') continue;
    const id = attr(s, 'styleId');
    const pPr = child(s, 'pPr');
    const numPr = pPr && child(pPr, 'numPr');
    const outline = pPr && child(pPr, 'outlineLvl');
    map.set(id, {
      name: attr(child(s, 'name'), 'val') || id,
      basedOn: attr(child(s, 'basedOn'), 'val'),
      numId: numPr ? attr(child(numPr, 'numId'), 'val') : '',
      ilvl: numPr && child(numPr, 'ilvl') ? Number(attr(child(numPr, 'ilvl'), 'val')) : null,
      outlineLvl: outline ? Number(attr(outline, 'val')) : null,
    });
  }
  return map;
}

// Resolve propriedades do estilo considerando herança (basedOn).
function resolveStyle(styles, styleId) {
  const result = { name: '', numId: '', ilvl: null, outlineLvl: null };
  const seen = new Set();
  let id = styleId;
  while (id && styles.has(id) && !seen.has(id)) {
    seen.add(id);
    const s = styles.get(id);
    if (!result.name) result.name = s.name;
    if (!result.numId && s.numId) result.numId = s.numId;
    if (result.ilvl === null && s.ilvl !== null) result.ilvl = s.ilvl;
    if (result.outlineLvl === null && s.outlineLvl !== null) result.outlineLvl = s.outlineLvl;
    id = s.basedOn;
  }
  if (!result.name) result.name = styleId || '';
  return result;
}

function headingLevel(styleId, style, pOutline) {
  const name = `${styleId} ${style.name}`.toLowerCase();
  const m = name.match(/(?:heading|t[ií]tulo|titulo)\s*(\d)/);
  if (m) return Math.min(Number(m[1]), 6);
  if (/^title$|\btitle\b/.test(name)) return 1;
  const lvl = pOutline ?? style.outlineLvl;
  if (lvl !== null && lvl !== undefined && lvl < 9) return lvl + 1;
  return 0;
}

function runText(p) {
  let text = '';
  const visit = (node) => {
    for (const n of children(node)) {
      switch (n.localName) {
        case 't':
          text += n.textContent;
          break;
        case 'tab':
          text += '\t';
          break;
        case 'br':
        case 'cr':
          text += '\n';
          break;
        case 'noBreakHyphen':
          text += '-';
          break;
        case 'del': // texto excluído em controle de alterações não entra
        case 'pPr':
        case 'rPr':
        case 'instrText':
        case 'fldData':
        case 'footnoteReference':
        case 'commentReference':
          break;
        default:
          visit(n);
      }
    }
  };
  visit(p);
  return text.replace(/[  ]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

function paragraphToBlock(p, styles, numbering) {
  const pPr = child(p, 'pPr');
  const styleId = attr(pPr && child(pPr, 'pStyle'), 'val');
  const style = resolveStyle(styles, styleId);
  const numPr = pPr && child(pPr, 'numPr');
  const pOutline = pPr && child(pPr, 'outlineLvl') ? Number(attr(child(pPr, 'outlineLvl'), 'val')) : null;

  let numId = numPr && child(numPr, 'numId') ? attr(child(numPr, 'numId'), 'val') : style.numId;
  let ilvl = numPr && child(numPr, 'ilvl') ? Number(attr(child(numPr, 'ilvl'), 'val')) : style.ilvl ?? 0;
  if (numId === '0') numId = '';

  const text = runText(p);
  const level = headingLevel(styleId, style, pOutline);
  const label = numId ? numbering.next(numId, ilvl) : null;
  if (!text && !label?.text) return null;

  const listStyle = /list|lista|bullet|marcador/i.test(`${styleId} ${style.name}`);
  if (level) {
    if (label?.text) return { type: 'heading', level, number: label.text, text };
    return { type: 'heading', level, ...splitManualNumber(text, true) };
  }
  if (label) {
    return {
      type: 'list',
      level: ilvl,
      ordered: !label.bullet,
      number: label.bullet ? '•' : label.text,
      text,
    };
  }
  if (listStyle) return { type: 'list', level: 0, ordered: false, number: '•', text };
  return { type: 'paragraph', level: 0, ...splitManualNumber(text, false) };
}

// Numeração digitada manualmente ("4.3 Aprovação") vira o campo number.
function splitManualNumber(text, isHeading) {
  const re = isHeading ? /^((?:\d{1,2}\.)*\d{1,2})\.?\s+(\S.*)$/s : /^(\d{1,2}(?:\.\d{1,2})+)\.?\s+(\S.*)$/s;
  const m = text.match(re);
  return m ? { number: m[1], text: m[2] } : { number: '', text };
}

function tableToBlock(tbl) {
  const rows = [];
  for (const tr of children(tbl).filter((n) => n.localName === 'tr')) {
    const row = [];
    for (const tc of children(tr).filter((n) => n.localName === 'tc')) {
      const parts = [];
      const collect = (node) => {
        for (const n of children(node)) {
          if (n.localName === 'p') {
            const t = runText(n);
            if (t) parts.push(t);
          } else if (n.localName === 'tbl') {
            // tabela aninhada: achata em texto
            parts.push(blockPlainText(tableToBlock(n)));
          } else if (n.localName === 'sdt') collect(child(n, 'sdtContent') ?? n);
        }
      };
      collect(tc);
      row.push({ text: parts.join('\n') });
    }
    if (row.length) rows.push(row);
  }
  return { type: 'table', level: 0, number: '', text: '', rows };
}

// Numeração automática do Word (numbering.xml).
class Numbering {
  constructor(doc) {
    this.nums = new Map(); // numId -> { abstractId, overrides: Map<ilvl, start> }
    this.abstracts = new Map(); // abstractId -> Map<ilvl, { start, fmt, text }>
    this.counters = new Map(); // abstractId -> number[]
    this.used = new Set();
    if (!doc) return;
    for (const a of Array.from(doc.getElementsByTagNameNS(W_NS, 'abstractNum'))) {
      const levels = new Map();
      for (const lvl of children(a).filter((n) => n.localName === 'lvl')) {
        levels.set(Number(attr(lvl, 'ilvl')), {
          start: Number(attr(child(lvl, 'start'), 'val') || 1),
          fmt: attr(child(lvl, 'numFmt'), 'val') || 'decimal',
          text: attr(child(lvl, 'lvlText'), 'val'),
        });
      }
      this.abstracts.set(attr(a, 'abstractNumId'), levels);
    }
    for (const n of Array.from(doc.getElementsByTagNameNS(W_NS, 'num'))) {
      const overrides = new Map();
      for (const o of children(n).filter((x) => x.localName === 'lvlOverride')) {
        const so = child(o, 'startOverride');
        if (so) overrides.set(Number(attr(o, 'ilvl')), Number(attr(so, 'val')));
      }
      this.nums.set(attr(n, 'numId'), { abstractId: attr(child(n, 'abstractNumId'), 'val'), overrides });
    }
  }

  next(numId, ilvl) {
    const num = this.nums.get(numId);
    if (!num) return null;
    const levels = this.abstracts.get(num.abstractId);
    if (!levels) return null;
    const def = levels.get(ilvl) ?? { start: 1, fmt: 'decimal', text: `%${ilvl + 1}.` };

    let counters = this.counters.get(num.abstractId);
    if (!counters) {
      counters = [];
      this.counters.set(num.abstractId, counters);
    }
    // Primeira utilização de um numId com startOverride reinicia a lista.
    if (!this.used.has(numId)) {
      this.used.add(numId);
      for (const [lvl, start] of num.overrides) counters[lvl] = start - 1;
    }
    for (let l = 0; l < ilvl; l++) {
      if (counters[l] === undefined) counters[l] = (levels.get(l)?.start ?? 1);
    }
    counters[ilvl] = counters[ilvl] === undefined ? def.start : counters[ilvl] + 1;
    counters.length = ilvl + 1; // reinicia níveis inferiores

    if (def.fmt === 'bullet' || def.fmt === 'none') return { bullet: true, text: '' };
    const text = (def.text || `%${ilvl + 1}.`).replace(/%(\d)/g, (_, d) => {
      const l = Number(d) - 1;
      const lv = levels.get(l) ?? def;
      const lvlFmt = l === ilvl ? def.fmt : lv.fmt;
      return formatNumber(counters[l] ?? lv.start ?? 1, lvlFmt);
    });
    return { bullet: false, text: text.trim() };
  }
}

function formatNumber(n, fmt) {
  switch (fmt) {
    case 'lowerLetter':
      return toLetters(n).toLowerCase();
    case 'upperLetter':
      return toLetters(n);
    case 'lowerRoman':
      return toRoman(n).toLowerCase();
    case 'upperRoman':
      return toRoman(n);
    case 'decimalZero':
      return String(n).padStart(2, '0');
    default:
      return String(n);
  }
}
function toLetters(n) {
  let s = '';
  while (n > 0) {
    n--;
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26);
  }
  return s || 'A';
}
function toRoman(n) {
  const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let out = '';
  for (const [v, s] of map) while (n >= v) {
    out += s;
    n -= v;
  }
  return out;
}

// ---------------------------------------------------------------------------
// TXT / MD / PDF (heurísticas de estrutura)
// ---------------------------------------------------------------------------

const NUMBERED_HEADING = /^((?:\d{1,2}\.)+\d{0,2}|\d{1,2})[.)]?\s+(.{2,})$/;
const BULLET = /^\s*([-*•●▪◦–])\s+(.*)$/;
const ORDERED_ITEM = /^\s*([a-z]|[ivx]{1,4}|\d{1,2})[.)]\s+(.*)$/i;

function classifyLine(line) {
  const trimmed = line.trim();
  const bullet = trimmed.match(BULLET);
  if (bullet) return { type: 'list', level: indentLevel(line), ordered: false, number: '•', text: bullet[2].trim() };

  const heading = trimmed.match(NUMBERED_HEADING);
  // Título numerado: curto, sem ponto final e começando com maiúscula.
  if (heading && heading[2].length <= 120 && !/[.;:,]$/.test(heading[2]) && /^[\p{Lu}]/u.test(heading[2])) {
    const number = heading[1].replace(/\.$/, '');
    return { type: 'heading', level: Math.min(number.split('.').filter(Boolean).length, 6), number, text: heading[2].trim() };
  }
  if (heading) {
    const number = heading[1].replace(/\.$/, '');
    return { type: 'paragraph', level: 0, number, text: heading[2].trim() };
  }
  const ordered = trimmed.match(ORDERED_ITEM);
  if (ordered) return { type: 'list', level: indentLevel(line), ordered: true, number: `${ordered[1]})`, text: ordered[2].trim() };

  // Linha curta toda em maiúsculas = título.
  if (trimmed.length <= 80 && /\p{L}/u.test(trimmed) && trimmed === trimmed.toUpperCase() && !/[.;]$/.test(trimmed)) {
    return { type: 'heading', level: 1, number: '', text: trimmed };
  }
  return { type: 'paragraph', level: 0, number: '', text: trimmed };
}

function indentLevel(line) {
  const spaces = line.match(/^\s*/)[0].replace(/\t/g, '    ').length;
  return Math.min(Math.floor(spaces / 2), 5);
}

// Junta linhas quebradas de um mesmo parágrafo (comum em PDF e .txt).
function linesToBlocks(lines) {
  const blocks = [];
  let current = null;
  const flush = () => {
    if (current) blocks.push(current);
    current = null;
  };
  for (const raw of lines) {
    if (!raw.trim()) {
      flush();
      continue;
    }
    const cls = classifyLine(raw);
    const continuation =
      current &&
      cls.type === 'paragraph' &&
      !cls.number &&
      current.type !== 'heading' &&
      !/[.;:!?]$/.test(current.text) &&
      /^[\p{Ll}(“"]/u.test(cls.text);
    if (continuation) {
      current.text += ' ' + cls.text;
      continue;
    }
    flush();
    current = cls;
    if (cls.type === 'heading') flush();
  }
  flush();
  return blocks;
}

function parsePlainText(text) {
  return linesToBlocks(text.replace(/\r\n?/g, '\n').split('\n'));
}

function parseMarkdown(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let pending = [];
  let table = null;
  const flushText = () => {
    if (pending.length) blocks.push(...linesToBlocks(pending));
    pending = [];
  };
  const flushTable = () => {
    if (table) blocks.push({ type: 'table', level: 0, number: '', text: '', rows: table });
    table = null;
  };
  for (const line of lines) {
    const t = line.trim();
    if (/^\|.*\|$/.test(t)) {
      flushText();
      if (/^\|[\s:|-]+\|$/.test(t)) continue; // separador de cabeçalho
      table ??= [];
      table.push(t.slice(1, -1).split('|').map((c) => ({ text: stripMd(c.trim()) })));
      continue;
    }
    flushTable();
    const h = t.match(/^(#{1,6})\s+(.*)$/);
    if (h) {
      flushText();
      const inner = stripMd(h[2]);
      const num = inner.match(/^((?:\d{1,2}\.)*\d{1,2})\.?\s+(.*)$/);
      blocks.push({
        type: 'heading',
        level: h[1].length,
        number: num ? num[1] : '',
        text: num ? num[2] : inner,
      });
      continue;
    }
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(t)) {
      flushText();
      continue;
    }
    pending.push(stripMd(line));
  }
  flushTable();
  flushText();
  return blocks;
}

function stripMd(s) {
  return s
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}

async function parsePdf(buffer, warnings) {
  let pages;
  try {
    const { extractText, getDocumentProxy } = await import('unpdf');
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    ({ text: pages } = await extractText(pdf, { mergePages: false }));
  } catch (err) {
    if (/password/i.test(err?.message ?? '')) throw new DocumentError('O PDF está protegido por senha.');
    throw new DocumentError('Não foi possível ler o PDF.');
  }
  const text = pages.join('\n\n');
  if (text.replace(/\s/g, '').length < 50) {
    throw new DocumentError('O PDF não possui texto selecionável (provavelmente é digitalizado). Envie a versão .docx.');
  }
  warnings.push('PDF: a estrutura (títulos, listas e tabelas) é reconstruída por aproximação. Prefira .docx sempre que possível.');
  return linesToBlocks(text.split('\n'));
}
