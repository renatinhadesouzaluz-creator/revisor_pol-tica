// Comparação palavra a palavra entre texto original e revisado.
// Usado para destacar alterações na Política Revisada, no HTML e no .docx.

const TOKEN_RE = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]/gu;
const MAX_CELLS = 4_000_000; // limite da matriz LCS para evitar travar o navegador

export function tokenize(text) {
  return String(text ?? '').match(TOKEN_RE) ?? [];
}

// Retorna [{ type: 'eq' | 'del' | 'ins', text }]
export function diffWords(before, after) {
  const a = tokenize(before);
  const b = tokenize(after);
  if (a.join('') === b.join('')) return a.length ? [{ type: 'eq', text: a.join('') }] : [];

  // Remove prefixo e sufixo comuns para reduzir a matriz.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  const ops = [];
  if (start > 0) ops.push({ type: 'eq', text: a.slice(0, start).join('') });

  if ((midA.length + 1) * (midB.length + 1) > MAX_CELLS) {
    if (midA.length) ops.push({ type: 'del', text: midA.join('') });
    if (midB.length) ops.push({ type: 'ins', text: midB.join('') });
  } else {
    ops.push(...lcsDiff(midA, midB));
  }

  if (endA < a.length) ops.push({ type: 'eq', text: a.slice(endA).join('') });
  return mergeOps(absorbWhitespace(mergeOps(ops)));
}

function lcsDiff(a, b) {
  const n = a.length;
  const m = b.length;
  const width = m + 1;
  const table = new Uint32Array((n + 1) * width);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      table[i * width + j] =
        a[i] === b[j]
          ? table[(i + 1) * width + j + 1] + 1
          : Math.max(table[(i + 1) * width + j], table[i * width + j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ type: 'eq', text: a[i] });
      i++;
      j++;
    } else if (table[(i + 1) * width + j] >= table[i * width + j + 1]) {
      ops.push({ type: 'del', text: a[i++] });
    } else {
      ops.push({ type: 'ins', text: b[j++] });
    }
  }
  while (i < n) ops.push({ type: 'del', text: a[i++] });
  while (j < m) ops.push({ type: 'ins', text: b[j++] });
  return ops;
}

function mergeOps(ops) {
  const out = [];
  for (const op of ops) {
    if (!op.text) continue;
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else out.push({ ...op });
  }
  return out;
}

// Um espaço "igual" isolado entre duas alterações vira parte delas,
// deixando o destaque mais legível ("~~deverão ser~~ devem ser").
function absorbWhitespace(ops) {
  const out = [];
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    const prev = ops[k - 1];
    const next = ops[k + 1];
    if (op.type === 'eq' && /^\s+$/.test(op.text) && prev && next && prev.type !== 'eq' && next.type !== 'eq') {
      out.push({ type: 'del', text: op.text }, { type: 'ins', text: op.text });
    } else {
      out.push(op);
    }
  }
  // Reordena: todas as remoções antes das inclusões em cada trecho alterado.
  const result = [];
  let dels = [];
  let ins = [];
  const flush = () => {
    result.push(...dels, ...ins);
    dels = [];
    ins = [];
  };
  for (const op of out) {
    if (op.type === 'eq') {
      flush();
      result.push(op);
    } else if (op.type === 'del') dels.push(op);
    else ins.push(op);
  }
  flush();
  return result;
}
