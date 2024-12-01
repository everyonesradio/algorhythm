interface RetryOptions {
  retries: number;
  backoff?: boolean;
  delay?: number;
}

export function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions
): () => Promise<T> {
  return async () => {
    let lastError: Error;
    for (let i = 0; i < options.retries; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        if (i < options.retries - 1) {
          const delay = options.backoff
            ? options.delay! * Math.pow(2, i)
            : options.delay;
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError!;
  };
}
