// Versão em arquivo único: tudo roda no navegador, sem servidor.
// - A leitura do documento e a geração do .docx acontecem localmente.
// - A revisão é enviada diretamente do navegador para a API da Anthropic,
//   com a chave digitada pelo usuário na tela. A chave fica apenas na memória
//   da página (não é gravada no arquivo nem no navegador) e some ao fechá-la.

import Anthropic from '@anthropic-ai/sdk';
import { Packer } from 'docx';
import { parseDocument } from '../server/document-parser.js';
import { reviewDocument, config } from '../server/reviewer.js';
import { buildRevisedDocument } from '../server/docx-exporter.js';

const MAX_UPLOAD_MB = 10;
const MAX_DOC_CHARS = 300_000;
let apiKey = '';

export function setApiKey(key) {
  apiKey = String(key ?? '').trim();
}

export async function getStatus() {
  return {
    standalone: true,
    demo: false,
    apiConfigurada: false,
    modelo: config().model,
    limiteUploadMb: MAX_UPLOAD_MB,
    formatos: ['docx', 'txt', 'md'],
  };
}

export async function parseFile(file) {
  if (/\.pdf$/i.test(file.name)) {
    throw new Error('Nesta versão em arquivo único, envie a política em .docx, .txt ou .md (PDF só é aceito na versão com servidor).');
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const doc = await parseDocument(bytes, file.name);
  if (doc.stats.caracteres > MAX_DOC_CHARS) {
    doc.warnings.push(`O documento é extenso (${doc.stats.caracteres.toLocaleString('pt-BR')} caracteres). Considere dividir a política em partes.`);
  }
  return doc;
}

export async function runReview(document, { onProgress, signal }) {
  if (!apiKey) throw new Error('Informe a chave da API da Anthropic para iniciar a revisão.');
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 30 * 60 * 1000 });
  onProgress({ phase: 'start', chars: 0 });
  const result = await reviewDocument(document, { onProgress, signal, client });
  return {
    review: result.review,
    meta: { modelo: result.modelo, demo: false, date: new Date().toISOString(), ajustesValidacao: result.ajustesValidacao },
  };
}

export async function exportDocx(payload) {
  return Packer.toBlob(buildRevisedDocument(payload));
}
