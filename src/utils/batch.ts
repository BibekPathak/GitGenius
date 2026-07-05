export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export async function asyncBatch<T, R>(
  items: T[],
  batchSize: number,
  fn: (batch: T[], index: number) => Promise<R>
): Promise<R[]> {
  const batches = chunkArray(items, batchSize);
  const results: R[] = [];

  for (let i = 0; i < batches.length; i++) {
    const result = await fn(batches[i], i);
    results.push(result);
  }

  return results;
}
