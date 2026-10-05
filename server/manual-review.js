// Modo sem API: a revisão é feita pela própria pessoa em uma conversa no
// claude.ai. A ferramenta monta o pedido (regras, formato da resposta e
// política numerada em blocos) e depois valida a resposta colada de volta.
// Usado pelo servidor e pela versão em arquivo único.

import { buildManualPrompt } from './prompt.js';
import { REVIEW_SCHEMA, validateReview } from './schema.js';
import { toModelText } from './document-parser.js';
import { parseJson, ReviewError } from './reviewer.js';

export const MANUAL_MODEL_LABEL = 'Claude (claude.ai · modo sem API)';

export function buildManualRequest(parsed) {
  return buildManualPrompt({
    fileName: parsed.fileName,
    documentText: toModelText(parsed.blocks),
    schemaJson: JSON.stringify(REVIEW_SCHEMA),
  });
}

export function importManualResponse(text, parsed) {
  if (!String(text ?? '').trim()) throw new ReviewError('Cole a resposta do Claude no campo indicado.', 400);
  let raw;
  try {
    raw = parseJson(text);
  } catch {
    throw new ReviewError(
      'Não foi possível ler a resposta colada. Copie a resposta inteira do Claude (o bloco JSON completo, do primeiro "{" ao último "}") e tente novamente.',
      400,
    );
  }
  // Um JSON qualquer (sem os campos da revisão) não deve virar uma revisão vazia.
  const expected = Object.keys(REVIEW_SCHEMA.properties);
  const present = raw && typeof raw === 'object' ? expected.filter((k) => k in raw).length : 0;
  const result = present * 2 >= expected.length ? validateReview(raw, parsed.blocks) : { ok: false };
  if (!result.ok) {
    throw new ReviewError(
      'A resposta colada não segue o formato esperado da revisão. Confira se foi usado o pedido gerado para esta política e se a resposta veio completa.',
      400,
    );
  }
  return {
    review: result.review,
    ajustesValidacao: [...result.errors, ...result.warnings.filter((w) => !/ausente/.test(w))],
    modelo: MANUAL_MODEL_LABEL,
  };
}
