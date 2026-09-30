// Gera as políticas usadas pelos testes automatizados (test/fixtures).
// Uso: node test/fixtures/generate-fixtures.js

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType,
  LevelFormat, AlignmentType,
} from 'docx';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = here;
fs.mkdirSync(outDir, { recursive: true });

// Política completa com problemas propositais (tempo verbal, ambiguidades,
// duplicidades, conceitos sem uso, siglas sem definição, lacunas de responsabilidade).
const politica = [
  ['h1', 'Objetivo'],
  ['p', 'Esta Política estabelece as diretrizes para a concessão, revisão e revogação de acessos aos sistemas corporativos da Companhia, bem como define as responsabilidades da área de Compras na homologação de fornecedores.'],
  ['h1', 'Abrangência'],
  ['p', 'Esta Política aplica-se a todos os colaboradores, estagiários e prestadores de serviços que utilizam os sistemas corporativos.'],
  ['h1', 'Conceitos'],
  ['bullet', 'Acesso privilegiado: perfil que permite alterar configurações críticas dos sistemas;'],
  ['bullet', 'Gestor imediato: responsável hierárquico direto pelo colaborador;'],
  ['bullet', 'Recertificação: processo de revisão periódica dos acessos concedidos.'],
  ['bullet', 'Token físico: dispositivo utilizado para autenticação em dois fatores'],
  ['h1', 'Regras e Procedimentos'],
  ['h2', 'Solicitação de acesso'],
  ['p', 'Toda solicitação de acesso deverá ser registrada no ServiceNow e será aprovada antes da concessão.'],
  ['p', 'Os acessos privilegiados deverão ser concedidos somente quando necessário e pelo prazo adequado.'],
  ['h2', 'Revisão de acessos'],
  ['p', 'A recertificação dos acessos será realizada periodicamente pelo gestor imediato, que deverá formalizar a revisão no SGA.'],
  ['p', 'Os gestores devem revisar os acessos de suas equipes de tempos em tempos, registrando o resultado no SGA.'],
  ['h2', 'Revogação de acessos'],
  ['p', 'Em caso de desligamento, a área de RH deverá comunicar a TI em tempo hábil para a revogação dos acessos.'],
  ['p', 'Exceções poderão ser aceitas em casos específicos, conforme análise do CSI.'],
  ['h2', 'Matriz de perfis'],
  ['table', [
    ['Perfil', 'Aprovador', 'Periodicidade de revisão'],
    ['Usuário padrão', 'Gestor imediato', 'Anual'],
    ['Acesso privilegiado', 'Gestor imediato e Segurança da Informação', 'Periodicamente'],
  ]],
  ['h1', 'Papéis e Responsabilidades'],
  ['h2', 'Gestor imediato'],
  ['bullet', 'Aprovar as solicitações de acesso da sua equipe;'],
  ['bullet', 'Realizar a recertificação dos acessos.'],
  ['h2', 'Tecnologia da Informação'],
  ['bullet', 'Conceder e revogar os acessos;'],
  ['bullet', 'Apoiar as demais áreas quando aplicável.'],
  ['h2', 'Segurança da Informação'],
  ['bullet', 'Zelar pelo cumprimento desta Política.'],
];

function buildDocx(content, title) {
  const children = [new Paragraph({ text: title, heading: HeadingLevel.TITLE })];
  for (const [kind, value] of content) {
    if (kind === 'h1') children.push(new Paragraph({ text: value, heading: HeadingLevel.HEADING_1, numbering: { reference: 'sec', level: 0 } }));
    else if (kind === 'h2') children.push(new Paragraph({ text: value, heading: HeadingLevel.HEADING_2, numbering: { reference: 'sec', level: 1 } }));
    else if (kind === 'bullet') children.push(new Paragraph({ text: value, bullet: { level: 0 } }));
    else if (kind === 'table') {
      children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: value.map((row, i) => new TableRow({
          children: row.map((cell) => new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: cell, bold: i === 0 })] })] })),
        })),
      }));
    } else children.push(new Paragraph({ text: value }));
  }
  return new Document({
    numbering: {
      config: [{
        reference: 'sec',
        levels: [
          { level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT },
          { level: 1, format: LevelFormat.DECIMAL, text: '%1.%2.', alignment: AlignmentType.LEFT },
        ],
      }],
    },
    sections: [{ children }],
  });
}

const doc = buildDocx(politica, 'Política de Gestão de Acessos');
fs.writeFileSync(path.join(outDir, 'politica-gestao-acessos.docx'), await Packer.toBuffer(doc));

// Markdown sem Conceitos e sem Papéis e Responsabilidades.
fs.writeFileSync(path.join(outDir, 'politica-sem-conceitos-e-papeis.md'), `# Política de Viagens Corporativas

## 1. Objetivo

Estabelecer as regras para solicitação e prestação de contas de viagens corporativas.

## 2. Abrangência

Aplica-se a todos os colaboradores da Companhia.

## 3. Regras

3.1 As viagens deverão ser solicitadas com antecedência adequada no portal Concur.

3.2 Adiantamentos serão aprovados pela Controladoria, preferencialmente em até 5 dias úteis.

3.3 A prestação de contas deverá ocorrer em tempo hábil após o retorno.

- Os comprovantes devem ser anexados ao relatório
- As despesas sem comprovante não serão reembolsadas;
- Exceções serão tratadas caso a caso.

3.4 Toda viagem internacional deve ser aprovada pelo diretor da área.

3.5 As viagens internacionais precisam de aprovação do diretor responsável.
`);

// Texto simples com duplicidades e ambiguidades.
fs.writeFileSync(path.join(outDir, 'politica-simples.txt'), `POLÍTICA DE BRINDES E PRESENTES

1. Objetivo
Definir regras para recebimento e oferta de brindes.

2. Abrangência
Aplica-se a todos os colaboradores.

3. Conceitos
Brinde: item sem valor comercial significativo, com a marca da empresa ofertante.
Hospitalidade: convite para eventos, refeições ou viagens.

4. Regras
4.1 Os colaboradores poderão receber brindes de até R$ 100,00.
4.2 Presentes acima do limite deverão ser devolvidos quando possível.
4.3 Brindes com valor superior a R$ 100,00 não podem ser aceitos pelos colaboradores.
4.4 Casos específicos serão avaliados pelo Compliance.

5. Papéis e Responsabilidades
5.1 Compliance: avaliar as exceções e manter o registro dos brindes recebidos.
`);

console.log('Exemplos gerados em', outDir);
