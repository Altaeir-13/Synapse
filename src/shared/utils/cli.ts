import { Buffer } from 'buffer';

/**
 * Prompts the user for hidden input (e.g. passwords) by reading raw bytes directly
 * from stdin to a Buffer, avoiding String allocation in the V8 heap.
 * @param query The prompt to display
 * @returns The user's input as a secure Buffer
 */
export function askPassword(query: string): Promise<Buffer> {
  return new Promise((resolve) => {
    process.stdout.write(query);

    const stdin = process.stdin;
    if (!stdin.isTTY) {
      // Fallback if not running in a true terminal
      stdin.once('data', (data: Buffer) => {
        resolve(Buffer.from(data.toString().trim(), 'utf8'));
      });
      return;
    }

    stdin.setRawMode(true);
    stdin.resume();

    // Pre-allocate a 1024-byte buffer to avoid dynamic memory allocation during typing
    let passwordBuffer = Buffer.alloc(1024);
    let length = 0;

    const onData = (chunk: Buffer) => {
      for (let i = 0; i < chunk.length; i++) {
        const byte = chunk[i];
        
        // Enter key (CR or LF)
        if (byte === 13 || byte === 10) {
          cleanup();
          const finalBuffer = Buffer.alloc(length);
          passwordBuffer.copy(finalBuffer, 0, 0, length);
          passwordBuffer.fill(0); // Wipe temporary buffer
          process.stdout.write('\n');
          resolve(finalBuffer);
          return;
        }
        
        // Ctrl+C (ETX)
        if (byte === 3) {
          cleanup();
          process.exit(0);
        }

        // Backspace (DEL or BS)
        if (byte === 127 || byte === 8) {
          if (length > 0) {
            length--;
            passwordBuffer[length] = 0; // Wipe the removed character from RAM
            process.stdout.write('\b \b'); // Erase asterisk from terminal
          }
          continue;
        }

        // Store character
        if (length < passwordBuffer.length) {
          passwordBuffer[length++] = byte;
          process.stdout.write('*');
        }
      }
    };

    const cleanup = () => {
      stdin.removeListener('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
    };

    stdin.on('data', onData);
  });
}
