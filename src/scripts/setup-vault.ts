import fs from 'fs';
import path from 'path';
import { encryptBuffer, packAndEncryptDir, secureWipeDir } from '../core/security/vault.ts';
import { askPassword } from '../shared/utils/cli.ts';

async function main() {
  console.log('--- DeepsProxy Security Vault Setup ---');
  console.log('This will encrypt your local data and delete the plaintext versions.');
  
  const password = await askPassword('Enter a strong Master Password: ');
  
  if (!password || password.length < 4) {
    console.error('\nPassword must be at least 4 characters long.');
    process.exit(1);
  }
  
  console.log('\n\nEncrypting .env...');
  const envPath = path.resolve('.env');
  const envEncPath = path.resolve('.env.enc');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath);
    const encryptedEnv = encryptBuffer(envContent, password);
    fs.writeFileSync(envEncPath, encryptedEnv);
    fs.unlinkSync(envPath);
    console.log('✅ .env encrypted and removed.');
  } else {
    console.log('ℹ️ .env not found, skipping.');
  }
  
  const cwdFiles = fs.readdirSync(process.cwd());
  for (const file of cwdFiles) {
    if (file.endsWith('_profile') && fs.statSync(file).isDirectory()) {
      console.log(`Encrypting profile: ${file}...`);
      await packAndEncryptDir(file, `${file}.enc`, password);
      secureWipeDir(file);
      console.log(`✅ ${file} encrypted to ${file}.enc and wiped.`);
    }
  }
  
  console.log('\nVault setup complete! You must provide the Master Password on next startup.');
  process.exit(0);
}

main().catch(console.error);
