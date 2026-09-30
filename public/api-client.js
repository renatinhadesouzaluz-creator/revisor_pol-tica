// Comunicação da interface com o servidor da ferramenta.
// (A versão em arquivo único substitui este módulo por standalone/api-local.js.)

export async function getStatus() {
  const res = await fetch('api/status');
  return res.json();
}

export async function parseFile(file, contentBase64) {
  const res = await fetch('api/parse', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fileName: file.name, contentBase64 }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.erro || 'Falha na leitura do documento.');
  return data.document;
}

export async function runReview(document, { onProgress, signal }) {
  const res = await fetch('api/review', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ document }),
    signal,
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.erro || `Falha na revisão (HTTP ${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      const evt = JSON.parse(line);
      if (evt.type === 'progress') onProgress(evt);
      else if (evt.type === 'result') return { review: evt.review, meta: evt.meta };
      else if (evt.type === 'error') throw new Error(evt.message);
    }
    if (done) break;
  }
  throw new Error('A conexão foi encerrada antes do fim da revisão. Tente novamente.');
}

export async function exportDocx(payload) {
  const res = await fetch('api/export/docx', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.erro || 'Falha ao gerar o .docx.');
  }
  return res.blob();
}

export function setApiKey() {}
