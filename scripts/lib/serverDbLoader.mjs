import { pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..', '..');

export async function resolve(specifier, context, nextResolve) {
  const bare = specifier.replace(/\\/g, '/');
  if (
    bare === '../dataClient'
    || bare.endsWith('/dataClient')
    || bare.endsWith('/src/dataClient')
    || bare.endsWith('/src/dataClient.js')
  ) {
    return { url: pathToFileURL(join(root, 'scripts/lib/serverDataClientShim.js')).href, shortCircuit: true };
  }
  if (
    bare === '../dbSchema'
    || bare.endsWith('/dbSchema')
    || bare.endsWith('/src/dbSchema')
    || bare.endsWith('/src/dbSchema.js')
  ) {
    return { url: pathToFileURL(join(root, 'scripts/lib/serverDbSchemaShim.js')).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
