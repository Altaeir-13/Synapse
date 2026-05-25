import readline from 'readline';

/**
 * Prompts the user for hidden input (e.g. passwords)
 * @param query The prompt to display
 * @returns The user's input
 */
export function askPassword(query: string): Promise<string> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    let hidden = false;
    rl.question(query, (password) => {
      hidden = false;
      rl.close();
      resolve(password);
    });
    hidden = true;
    (rl as any)._writeToOutput = function _writeToOutput(stringToWrite: string) {
      if (!hidden) {
        (rl as any).output.write(stringToWrite);
      } else {
        (rl as any).output.write(stringToWrite.replace(/./g, '*'));
      }
    };
  });
}
