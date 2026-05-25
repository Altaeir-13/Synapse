/**
 * A simple Mutex (Mutual Exclusion) implementation.
 * Used to synchronize asynchronous operations and ensure that only one
 * operation accesses a shared resource at a time.
 */
export class Mutex {
  private queue: Array<() => void> = [];
  private locked = false;

  /**
   * Acquires the lock. If the lock is already held, this waits until it is released.
   * 
   * @returns A promise that resolves with a `release` function. The caller MUST call `release()` when done.
   */
  async acquire(): Promise<() => void> {
    return new Promise(resolve => {
      const release = () => {
        if (this.queue.length > 0) {
          const next = this.queue.shift();
          if (next) next();
        } else {
          this.locked = false;
        }
      };

      if (this.locked) {
        this.queue.push(() => resolve(release));
      } else {
        this.locked = true;
        resolve(release);
      }
    });
  }
}
