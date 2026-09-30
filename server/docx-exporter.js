// Exporta a política revisada em .docx com as alterações DESTACADAS.
//
// Importante: este arquivo NÃO usa o "Controlar Alterações" nativo do Word.
// As alterações são indicadas por formatação (tachado, sublinhado e realce)
// e a tabela DE/PARA anexada é a trilha formal das alterações.

import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
  ShadingType, BorderStyle,
} from 'docx';
import { buildRevisedPolicy, unifyFindings } from '../public/shared/findings.js';
import { diffWords } from '../public/shared/text-diff.js';
import { TIPOS_AJUSTE } from '../public/shared/labels.js';

const HEADINGS = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6];

const STYLE = {
  del: { strike: true, color: 'B42318' },
  ins: { underline: {}, color: '2F7D4F' },
  insValidacao: { underline: {}, color: '7A4F00', highlight: 'yellow' },
  incluido: { underline: {}, color: '1F4E8C' },
  flag: { bold: true, color: '7A4F00', highlight: 'yellow', size: 18 },
  flagIncluido: { bold: true, color: '1F4E8C', size: 18 },
  ref: { color: '616E7C', size: 16 },
};

// Converte texto em TextRuns preservando quebras de linha.
function runs(text, style = {}) {
  const parts = String(text ?? '').split('\n');
  return parts.map((p, i) => new TextRun({ text: p, ...style, ...(i > 0 ? { break: 1 } : {}) }));
}

function diffRuns(block, baseStyle = {}) {
  if (block.status === 'inalterado') return runs(block.revised, baseStyle);
  if (block.status === 'incluido') return runs(block.revised, { ...baseStyle, ...STYLE.incluido });
  const insStyle = block.status === 'validacao' ? STYLE.insValidacao : STYLE.ins;
  return diffWords(block.original, block.revised).flatMap((op) =>
    runs(op.text, { ...baseStyle, ...(op.type === 'del' ? STYLE.del : op.type === 'ins' ? insStyle : {}) }),
  );
}

function flagRuns(block) {
  const out = [];
  if (block.status === 'validacao') out.push(new TextRun({ text: '  [Requer validação da área]', ...STYLE.flag }));
  if (block.status === 'incluido') {
    out.push(new TextRun({ text: block.requerValidacao ? '  [Texto incluído – requer validação da área]' : '  [Texto incluído]', ...(block.requerValidacao ? STYLE.flag : STYLE.flagIncluido) }));
  }
  if (block.alteracaoIds?.length) out.push(new TextRun({ text: `  (DE/PARA: ${block.alteracaoIds.join(', ')})`, ...STYLE.ref }));
  return out;
}

const cell = (children, opts = {}) =>
  new TableCell({ children: Array.isArray(children) ? children : [children], ...opts });
const textCell = (text, opts = {}) => cell(new Paragraph({ children: runs(text, opts.run ?? {}) }), opts.cell ?? {});
const headerCell = (text) =>
  cell(new Paragraph({ children: [new TextRun({ text, bold: true })] }), { shading: { type: ShadingType.CLEAR, fill: 'EEF2F6', color: 'auto' } });

function policyBody(revised) {
  const out = [];
  for (const b of revised) {
    if (b.type === 'heading') {
      const num = b.number ? [new TextRun({ text: `${b.number} ` })] : [];
      out.push(new Paragraph({ heading: HEADINGS[Math.min(Math.max(b.level, 1), 6) - 1], children: [...num, ...diffRuns(b), ...flagRuns(b)] }));
    } else if (b.type === 'list') {
      const level = Math.min(b.level || 0, 8);
      if (!b.number || b.number === '•') {
        out.push(new Paragraph({ bullet: { level }, children: [...diffRuns(b), ...flagRuns(b)] }));
      } else {
        out.push(new Paragraph({
          indent: { left: 720 + level * 360, hanging: 360 },
          children: [new TextRun({ text: `${b.number}\t` }), ...diffRuns(b), ...flagRuns(b)],
        }));
      }
    } else if (b.type === 'table') {
      out.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: b.rows.map((row) => new TableRow({
          children: row.map((c) => cell(new Paragraph({ children: [...diffRuns(c), ...flagRuns(c)] }), c.status === 'validacao' ? { shading: { type: ShadingType.CLEAR, fill: 'FFF4D6', color: 'auto' } } : {})),
        })),
      }));
      out.push(new Paragraph({ children: [] }));
    } else {
      const num = b.number ? [new TextRun({ text: `${b.number} ` })] : [];
      out.push(new Paragraph({ spacing: { after: 120 }, children: [...num, ...diffRuns(b), ...flagRuns(b)] }));
    }
  }
  return out;
}

function legend() {
  return [
    new Paragraph({ children: [new TextRun({ text: 'Legenda: ', bold: true }),
      new TextRun({ text: 'texto removido', ...STYLE.del }), new TextRun({ text: ' · ' }),
      new TextRun({ text: 'texto alterado (ajuste editorial)', ...STYLE.ins }), new TextRun({ text: ' · ' }),
      new TextRun({ text: 'alteração que requer validação da área', ...STYLE.insValidacao }), new TextRun({ text: ' · ' }),
      new TextRun({ text: 'texto incluído', ...STYLE.incluido })] }),
  ];
}

// Monta o documento Word (usado pelo servidor e pela versão em arquivo único).
export function buildRevisedDocument({ document: doc, review, meta = {} }) {
  const revised = buildRevisedPolicy(doc.blocks, review);
  const unified = unifyFindings(review);
  const dateFmt = new Date(meta.date ?? Date.now()).toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });

  const intro = [
    new Paragraph({
      shading: { type: ShadingType.CLEAR, fill: 'EEF2F6', color: 'auto' },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: 'FFD100', space: 6 } },
      children: [
        new TextRun({ text: 'Versão revisada com alterações destacadas', bold: true, break: 0 }),
        new TextRun({ text: `Documento: ${doc.fileName} · Revisão gerada em ${dateFmt} pelo Revisor Inteligente de Políticas.`, break: 1 }),
        new TextRun({ text: 'Este arquivo não utiliza o recurso "Controlar Alterações" do Word: as alterações estão indicadas por formatação. A Tabela DE/PARA (anexo) é a trilha formal das alterações. Itens marcados como "Requer validação da área" não devem ser aplicados sem a validação da área responsável.', break: 1 }),
        ...(meta.demo ? [new TextRun({ text: 'MODO DEMONSTRAÇÃO – resultado simulado, sem IA.', bold: true, color: 'B42318', break: 1 })] : []),
      ],
    }),
    ...legend(),
    new Paragraph({ children: [] }),
  ];

  const alteracoes = unified.filter((f) => f.tipo === 'alteracao');
  const depara = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('Anexo I – Tabela DE/PARA')] }),
    alteracoes.length
      ? new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: ['Item', 'Categoria', 'DE – Texto atual', 'PARA – Sugestão', 'Justificativa', 'Classificação'].map(headerCell) }),
            ...alteracoes.map(({ raw: a }) => new TableRow({
              children: [
                textCell(`${a.item}\n(${a.id})`),
                textCell(a.categoria),
                textCell(a.textoAtual),
                textCell(a.sugestao),
                textCell(a.justificativa),
                textCell(TIPOS_AJUSTE[a.tipoAjuste], { run: a.tipoAjuste === 'requer_validacao' ? { bold: true, color: '7A4F00' } : { color: '2F7D4F' } }),
              ],
            })),
          ],
        })
      : new Paragraph({ children: [new TextRun({ text: 'Nenhuma alteração registrada.', italics: true })] }),
  ];

  const questoes = unified.filter((f) => f.tipo === 'questionamento');
  const questionamentos = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun('Anexo II – Questionamentos para validação da área')] }),
    questoes.length
      ? new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({ tableHeader: true, children: ['Item da política', 'Tema', 'Questionamento', 'Motivo do questionamento'].map(headerCell) }),
            ...questoes.map(({ raw: q }) => new TableRow({ children: [textCell(q.item), textCell(q.tema), textCell(q.questionamento), textCell(q.motivo)] })),
          ],
        })
      : new Paragraph({ children: [new TextRun({ text: 'Nenhum questionamento registrado.', italics: true })] }),
  ];

  const document = new Document({
    creator: 'Revisor Inteligente de Políticas',
    title: `Política revisada – ${doc.fileName}`,
    styles: { default: { document: { run: { font: 'Calibri', size: 22 } } } },
    sections: [{
      properties: { page: { margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } },
      children: [...intro, ...policyBody(revised), ...depara, ...questionamentos],
    }],
  });
  return document;
}

export async function buildRevisedDocx(args) {
  return Packer.toBuffer(buildRevisedDocument(args));
}

