/**
 * ExoBrain embedding client
 *
 * Supports any OpenAI-compatible embedding endpoint:
 *   - llama.cpp server  (recommended: lightweight, no daemon)
 *   - Ollama            (auto-detected if already running)
 *   - OpenAI / cloud    (fallback)
 *
 * Config (via .env):
 *   EMBEDDING_BASE_URL   default: auto-detected
 *   EMBEDDING_MODEL      default: nomic-embed-text
 *   EMBEDDING_API_KEY    default: (empty for local)
 *   EMBEDDING_CHUNK_TOKENS  default: 400 (entries longer than this are chunked)
 *   EMBEDDING_CHUNK_OVERLAP default: 80  (token overlap between chunks)
 */

// ── Config ─────────────────────────────────────────────────────────────────

export const EMBED_MODEL   = process.env.EMBEDDING_MODEL          ?? "nomic-embed-text";
export const EMBED_API_KEY = process.env.EMBEDDING_API_KEY        ?? "";
export const CHUNK_TOKENS  = parseInt(process.env.EMBEDDING_CHUNK_TOKENS  ?? "400", 10);
export const CHUNK_OVERLAP = parseInt(process.env.EMBEDDING_CHUNK_OVERLAP ?? "80",  10);

// Rough chars-per-token for English + code (conservative estimate)
const CHARS_PER_TOKEN = 4;

// ── Backend auto-detection ──────────────────────────────────────────────────

type EmbedBackend = "llamacpp" | "ollama" | "configured";

async function probe(url: string, timeoutMs = 1500): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    return res.ok || res.status < 500;
  } catch {
    return false;
  }
}

let _baseUrl: string | null = null;
let _detectedBackend: EmbedBackend | null = null;

async function hasEmbeddingModel(baseUrl: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2000);
    const res = await fetch(`${baseUrl}/models`, {
      signal: ctrl.signal,
      headers: EMBED_API_KEY ? { Authorization: `Bearer ${EMBED_API_KEY}` } : {},
    });
    clearTimeout(t);
    if (!res.ok) return false;
    const data = await res.json() as { data?: { id: string }[] };
    return data.data?.some(m => m.id.includes("embed") || m.id.includes("nomic")) ?? false;
  } catch {
    return false;
  }
}

export async function detectEmbeddingBackend(): Promise<{
  baseUrl: string;
  backend: EmbedBackend;
  available: boolean;
}> {
  // Explicit config always wins
  if (process.env.EMBEDDING_BASE_URL) {
    return { baseUrl: process.env.EMBEDDING_BASE_URL, backend: "configured", available: true };
  }

  // llama.cpp server (port 8080 default) — verify it serves an embedding model
  if (await probe("http://localhost:8080/health") && await hasEmbeddingModel("http://localhost:8080/v1")) {
    return { baseUrl: "http://localhost:8080/v1", backend: "llamacpp", available: true };
  }

  // Ollama OpenAI-compatible endpoint (port 11434)
  if (await probe("http://localhost:11434/api/tags") && await hasEmbeddingModel("http://localhost:11434/v1")) {
    return { baseUrl: "http://localhost:11434/v1", backend: "ollama", available: true };
  }

  return { baseUrl: "", backend: "configured", available: false };
}

async function getBaseUrl(): Promise<string> {
  if (_baseUrl !== null) return _baseUrl;
  const { baseUrl } = await detectEmbeddingBackend();
  _baseUrl = baseUrl;
  return _baseUrl;
}

// ── Embedding call ─────────────────────────────────────────────────────────

export async function embed(texts: string[]): Promise<number[][]> {
  const baseUrl = await getBaseUrl();
  if (!baseUrl) throw new Error("No embedding backend available. Start llama.cpp server or Ollama, or set EMBEDDING_BASE_URL.");

  const res = await fetch(`${baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(EMBED_API_KEY ? { "Authorization": `Bearer ${EMBED_API_KEY}` } : {}),
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embedding API error (${res.status}): ${text}`);
  }

  const data = await res.json() as { data: { embedding: number[]; index: number }[] };
  // Sort by index to ensure order matches input
  return data.data.sort((a, b) => a.index - b.index).map(d => d.embedding);
}

// ── Chunking ───────────────────────────────────────────────────────────────

export interface Chunk {
  content: string;
  tokenEst: number;
  index: number;
}

/** Rough token count estimate */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Split text into overlapping chunks at sentence/paragraph boundaries.
 * Returns a single chunk (the full text) if under the token threshold.
 */
export function chunkText(text: string): Chunk[] {
  const totalTokens = estimateTokens(text);
  if (totalTokens <= CHUNK_TOKENS) {
    return [{ content: text, tokenEst: totalTokens, index: 0 }];
  }

  // Split on paragraph breaks first, then sentence boundaries
  const paragraphs = text.split(/\n\n+/);
  const chunks: Chunk[] = [];
  let current: string[] = [];
  let currentTokens = 0;
  let chunkIndex = 0;

  function flush() {
    if (current.length === 0) return;
    const content = current.join("\n\n").trim();
    if (content) {
      chunks.push({ content, tokenEst: estimateTokens(content), index: chunkIndex++ });
    }
  }

  for (const para of paragraphs) {
    const paraTokens = estimateTokens(para);

    if (currentTokens + paraTokens > CHUNK_TOKENS && current.length > 0) {
      flush();
      // Overlap: carry last paragraph(s) into next chunk
      const overlapParas: string[] = [];
      let overlapTokens = 0;
      for (let i = current.length - 1; i >= 0; i--) {
        const t = estimateTokens(current[i]);
        if (overlapTokens + t > CHUNK_OVERLAP) break;
        overlapParas.unshift(current[i]);
        overlapTokens += t;
      }
      current = overlapParas;
      currentTokens = overlapTokens;
    }

    // Paragraph itself is too long — split by sentences
    if (paraTokens > CHUNK_TOKENS) {
      const sentences = para.match(/[^.!?]+[.!?]+/g) ?? [para];
      for (const sent of sentences) {
        const st = estimateTokens(sent);
        if (currentTokens + st > CHUNK_TOKENS && current.length > 0) {
          flush();
          current = [];
          currentTokens = 0;
        }
        current.push(sent);
        currentTokens += st;
      }
    } else {
      current.push(para);
      currentTokens += paraTokens;
    }
  }

  flush();
  return chunks.length > 0 ? chunks : [{ content: text, tokenEst: totalTokens, index: 0 }];
}

// ── High-level: embed an entry ──────────────────────────────────────────────

export interface EntryEmbedding {
  /** Single vector for short entries; null if chunked */
  entryEmbedding: number[] | null;
  chunks: Array<{ index: number; content: string; tokenEst: number; embedding: number[] }>;
  model: string;
}

export async function embedEntry(content: string, summary?: string | null): Promise<EntryEmbedding> {
  const chunks = chunkText(content);

  if (chunks.length === 1) {
    // Short entry — embed directly (use summary if available to enrich context)
    const text = summary ? `${summary}\n\n${content}` : content;
    const [vec] = await embed([text]);
    return { entryEmbedding: vec, chunks: [], model: EMBED_MODEL };
  }

  // Long entry — embed each chunk; entry embedding = embed of summary or first chunk
  const chunkTexts = chunks.map(c => c.content);
  const summaryText = summary ?? chunks[0].content;

  const allTexts = [summaryText, ...chunkTexts];
  const allVecs  = await embed(allTexts);

  const [entryVec, ...chunkVecs] = allVecs;

  return {
    entryEmbedding: entryVec,
    chunks: chunks.map((c, i) => ({
      index: c.index,
      content: c.content,
      tokenEst: c.tokenEst,
      embedding: chunkVecs[i],
    })),
    model: EMBED_MODEL,
  };
}
