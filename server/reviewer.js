// Comunicação com a API da Anthropic (somente no servidor).
// A chave é lida da variável de ambiente ANTHROPIC_API_KEY pelo SDK;
// ela nunca é enviada ao navegador.

import Anthropic from '@anthropic-ai/sdk';
import { SYSTEM_PROMPT, buildUserMessage, buildSchemaInstruction } from './prompt.js';
import { REVIEW_SCHEMA, validateReview } from './schema.js';
import { toModelText } from './document-parser.js';

export class ReviewError extends Error {
  constructor(message, status = 502) {
    super(message);
    this.name = 'ReviewError';
    this.status = status;
  }
}

let client;
function getClient() {
  client ??= new Anthropic({ maxRetries: 2, timeout: 30 * 60 * 1000 });
  return client;
}

export function config() {
  return {
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    effort: process.env.REVIEW_EFFORT || 'high',
    maxTokens: Number(process.env.REVIEW_MAX_TOKENS || 64000),
    structuredOutput: process.env.STRUCTURED_OUTPUT !== 'false',
    fallback: process.env.REFUSAL_FALLBACK !== 'false',
  };
}

// onProgress({ phase, chars }) é chamado durante o streaming.
export async function reviewDocument(parsed, { onProgress = () => {}, signal } = {}) {
  const cfg = config();
  const documentText = toModelText(parsed.blocks);
  const userMessage = buildUserMessage({ fileName: parsed.fileName, documentText });

  let text;
  try {
    text = await callModel(cfg, userMessage, cfg.structuredOutput, onProgress, signal);
  } catch (err) {
    // Se o schema não for aceito pela API, repete descrevendo o formato no prompt.
    if (cfg.structuredOutput && err instanceof Anthropic.BadRequestError && /schema|output_config|format/i.test(err.message)) {
      console.warn('[revisao] structured outputs recusado pela API; repetindo com schema no prompt.');
      onProgress({ phase: 'retry', chars: 0 });
      try {
        text = await callModel(cfg, userMessage, false, onProgress, signal);
      } catch (retryErr) {
        throw translateError(retryErr);
      }
    } else throw translateError(err);
  }

  const raw = parseJson(text);
  const result = validateReview(raw, parsed.blocks);
  if (!result.ok) {
    console.warn(`[revisao] resposta com ${result.errors.length} erros de formato.`);
    throw new ReviewError('A resposta da IA não seguiu o formato esperado. Tente novamente.');
  }
  if (result.errors.length) console.warn(`[revisao] ${result.errors.length} campo(s) corrigido(s) na validação.`);
  return {
    review: result.review,
    ajustesValidacao: [...result.errors, ...result.warnings.filter((w) => !/ausente/.test(w))],
    modelo: cfg.model,
  };
}

async function callModel(cfg, userMessage, structured, onProgress, signal) {
  const params = {
    model: cfg.model,
    max_tokens: cfg.maxTokens,
    thinking: { type: 'adaptive' },
    output_config: { effort: cfg.effort },
    system: structured ? SYSTEM_PROMPT : SYSTEM_PROMPT + buildSchemaInstruction(JSON.stringify(REVIEW_SCHEMA)),
    messages: [{ role: 'user', content: userMessage }],
  };
  if (structured) params.output_config.format = { type: 'json_schema', schema: REVIEW_SCHEMA };
  if (cfg.fallback) {
    // Se o modelo recusar a solicitação, a API reexecuta em um modelo alternativo.
    params.betas = ['server-side-fallback-2026-07-01'];
    params.fallbacks = 'default';
  }

  const stream = getClient().beta.messages.stream(params, { signal });
  let chars = 0;
  let lastChars = -Infinity;
  let lastThinking = 0;
  stream.on('text', (delta) => {
    chars += delta.length;
    if (chars - lastChars > 1500) {
      lastChars = chars;
      onProgress({ phase: 'writing', chars });
    }
  });
  stream.on('thinking', () => {
    if (chars === 0 && Date.now() - lastThinking > 3000) {
      lastThinking = Date.now();
      onProgress({ phase: 'thinking', chars: 0 });
    }
  });

  const message = await stream.finalMessage();
  console.info(
    `[revisao] modelo=${message.model} stop=${message.stop_reason} tokens_entrada=${message.usage?.input_tokens} tokens_saida=${message.usage?.output_tokens}`,
  );
  if (message.stop_reason === 'refusal') {
    throw new ReviewError('O modelo recusou a solicitação para este documento. Revise o conteúdo enviado e tente novamente.');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new ReviewError(
      'A revisão excedeu o limite de tamanho de resposta. Divida a política em partes menores ou aumente REVIEW_MAX_TOKENS.',
    );
  }
  return message.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('');
}

function parseJson(text) {
  if (!text?.trim()) throw new ReviewError('A IA não retornou conteúdo.');
  try {
    return JSON.parse(text);
  } catch {
    // Sem structured outputs, o modelo pode envolver o JSON em texto ou cercas de código.
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(text.slice(start, end + 1));
      } catch {
        /* segue para o erro */
      }
    }
    throw new ReviewError('A resposta da IA não é um JSON válido. Tente novamente.');
  }
}

function translateError(err) {
  if (err instanceof ReviewError) return err;
  if (err instanceof Anthropic.APIUserAbortError) return new ReviewError('Revisão cancelada.', 499);
  if (err instanceof Anthropic.AuthenticationError) {
    return new ReviewError('Chave da API inválida ou ausente. Verifique a variável ANTHROPIC_API_KEY no servidor.', 500);
  }
  if (err instanceof Anthropic.PermissionDeniedError) {
    return new ReviewError('A chave da API não tem permissão para usar o modelo configurado.', 500);
  }
  if (err instanceof Anthropic.NotFoundError) {
    return new ReviewError('Modelo não encontrado. Verifique a variável ANTHROPIC_MODEL.', 500);
  }
  if (err instanceof Anthropic.RateLimitError) {
    return new ReviewError('Limite de uso da API atingido. Aguarde alguns minutos e tente novamente.', 429);
  }
  if (err instanceof Anthropic.BadRequestError) {
    if (/prompt is too long|too many tokens|context/i.test(err.message)) {
      return new ReviewError('O documento é grande demais para ser revisado de uma só vez. Divida-o em partes.', 413);
    }
    return new ReviewError('A API recusou a requisição (requisição inválida). Verifique a configuração do servidor.', 502);
  }
  if (err instanceof Anthropic.InternalServerError || err instanceof Anthropic.APIConnectionError) {
    return new ReviewError('Serviço de IA indisponível no momento. Tente novamente em instantes.', 503);
  }
  if (err instanceof Anthropic.APIError) return new ReviewError(`Erro na API de IA (${err.status ?? 'sem status'}).`, 502);
  console.error('[revisao] erro inesperado:', err?.name, err?.message?.slice(0, 200));
  return new ReviewError('Erro inesperado durante a revisão.', 500);
}
