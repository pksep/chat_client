import fs from 'fs';
import path from 'path';

function findProjectRoot(startDir: string): string {
  let currentDir: string = startDir;
  while (currentDir !== path.parse(currentDir).root) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  throw new Error(
    'Could not find project root (package.json) from script location.'
  );
}

const scriptDir: string = path.dirname(new URL(import.meta.url).pathname);
const projectRoot: string = findProjectRoot(scriptDir);

const sourceDir: string = path.join(
  projectRoot,
  'node_modules/@openim/wasm-client-sdk/assets'
);
const targetDir: string = path.join(projectRoot, 'public');

console.log(`Project root detected: ${projectRoot}`);
if (!fs.existsSync(sourceDir)) {
  console.error(
    `Error: Source directory not found - ${sourceDir}. Ensure @openim/wasm-client-sdk is installed in ${projectRoot}.`
  );
  process.exit(1);
}

const filesToCopy: string[] = ['openIM.wasm', 'sql-wasm.wasm', 'wasm_exec.js'];

console.log('Copying OpenIM WASM files...');

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
  console.log(`Created directory: ${targetDir}`);
}

filesToCopy.forEach((fileName: string) => {
  const sourcePath: string = path.join(sourceDir, fileName);
  const targetPath: string = path.join(targetDir, fileName);

  if (!fs.existsSync(sourcePath)) {
    console.error(
      `Error: File not found - ${sourcePath}. Ensure @openim/wasm-client-sdk is installed.`
    );
    return;
  }

  try {
    fs.copyFileSync(sourcePath, targetPath);
    console.log(`Copied: ${fileName} -> ${targetPath}`);
  } catch (error: unknown) {
    const err = error as Error;
    console.error(`Error copying ${fileName}:`, err.message);
  }
});

console.log(
  'Copy process completed. Remember to add <script src="/wasm_exec.js"></script> to your index.html before using the SDK.'
);
