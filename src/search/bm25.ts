export interface Bm25Document {
  id: string;
  text: string;
}

export class Bm25Index {
  private docs: Bm25Document[] = [];
  private docLengths: number[] = [];
  private avgDocLength = 0;
  private termDocFreq = new Map<string, number>();
  private docTerms: Map<string, number>[] = [];
  private k1 = 1.2;
  private b = 0.75;

  add(doc: Bm25Document): void {
    const idx = this.docs.length;
    this.docs.push(doc);
    const tokens = tokenize(doc.text);
    this.docLengths.push(tokens.length);

    const termFreq = new Map<string, number>();
    for (const token of tokens) {
      termFreq.set(token, (termFreq.get(token) ?? 0) + 1);
    }
    this.docTerms.push(termFreq);

    for (const term of termFreq.keys()) {
      this.termDocFreq.set(term, (this.termDocFreq.get(term) ?? 0) + 1);
    }

    this.avgDocLength = this.docLengths.reduce((a, b) => a + b, 0) / this.docs.length;
  }

  addAll(docs: Bm25Document[]): void {
    for (const doc of docs) {
      this.add(doc);
    }
  }

  search(query: string): Map<string, { score: number; docId: string }> {
    const queryTerms = tokenize(query);
    if (queryTerms.length === 0) return new Map();

    const n = this.docs.length;
    const scores = new Map<string, { score: number; docId: string }>();

    for (let i = 0; i < n; i++) {
      const docLen = this.docLengths[i]!;
      const termFreqs = this.docTerms[i]!;
      let score = 0;

      for (const term of queryTerms) {
        const tf = termFreqs.get(term) ?? 0;
        if (tf === 0) continue;

        const df = this.termDocFreq.get(term) ?? 0;
        const idf = Math.log((n - df + 0.5) / (df + 0.5) + 1);

        const numerator = tf * (this.k1 + 1);
        const denominator = tf + this.k1 * (1 - this.b + this.b * (docLen / this.avgDocLength));
        score += idf * (numerator / denominator);
      }

      if (score > 0) {
        scores.set(this.docs[i]!.id, { score, docId: this.docs[i]!.id });
      }
    }

    return scores;
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 0);
}
