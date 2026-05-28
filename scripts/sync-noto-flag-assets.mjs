import fs from 'node:fs';
import path from 'node:path';

const workspaceRoot = process.cwd();
const sourceDir =
  process.argv[2] ||
  'C:\\tmp\\noto-emoji-check\\third_party\\region-flags\\png';
const aliasesPath =
  process.argv[3] || 'C:\\tmp\\noto-emoji-check\\unknown_flag_aliases.txt';
const targetDir =
  process.argv[4] ||
  path.join(workspaceRoot, 'public', 'emoji', 'noto', 'png', '128');

const ensureDirectory = dirPath => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

const toRegionalIndicator = letter =>
  (0x1f1e6 + letter.charCodeAt(0) - 0x41).toString(16);

const toTagCodePoint = character => {
  const codePoint = character.codePointAt(0);

  if (codePoint === undefined) {
    throw new Error(`Unable to convert tag character: ${character}`);
  }

  return `e${codePoint.toString(16).padStart(4, '0')}`;
};

const toEmojiFileName = code => {
  const normalizedCode = path.parse(code).name.toUpperCase();

  if (/^[A-Z]{2}$/.test(normalizedCode)) {
    return `emoji_u${toRegionalIndicator(normalizedCode[0])}_${toRegionalIndicator(normalizedCode[1])}.png`;
  }

  if (/^[A-Z]{2}-[A-Z0-9]{2,3}$/.test(normalizedCode)) {
    const tagSequence = normalizedCode
      .replace('-', '')
      .toLowerCase()
      .split('')
      .map(toTagCodePoint);

    return `emoji_u${['1f3f4', ...tagSequence, 'e007f'].join('_')}.png`;
  }

  return null;
};

const copyIfMissing = (fromPath, toPath) => {
  if (fs.existsSync(toPath)) {
    return false;
  }

  fs.copyFileSync(fromPath, toPath);
  return true;
};

const parseAliasMappings = filePath => {
  if (!fs.existsSync(filePath)) {
    return [];
  }

  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/u)
    .map(line => line.split('#')[0].trim())
    .filter(Boolean)
    .map(line => {
      const [fromSequence, toSequence] = line
        .split(';')
        .map(part => part.trim());

      if (!fromSequence || !toSequence) {
        return null;
      }

      return {
        fromFileName: `emoji_u${fromSequence}.png`,
        toFileName: `emoji_u${toSequence}.png`
      };
    })
    .filter(Boolean);
};

ensureDirectory(targetDir);

const sourceFiles = fs
  .readdirSync(sourceDir, { withFileTypes: true })
  .filter(
    entry => entry.isFile() && path.extname(entry.name).toLowerCase() === '.png'
  )
  .map(entry => entry.name);

const createdFiles = [];
const skippedFiles = [];
const unsupportedCodes = [];

for (const sourceFileName of sourceFiles) {
  const targetFileName = toEmojiFileName(sourceFileName);

  if (!targetFileName) {
    unsupportedCodes.push(sourceFileName);
    continue;
  }

  const created = copyIfMissing(
    path.join(sourceDir, sourceFileName),
    path.join(targetDir, targetFileName)
  );

  if (created) {
    createdFiles.push(targetFileName);
  } else {
    skippedFiles.push(targetFileName);
  }
}

const aliasMappings = parseAliasMappings(aliasesPath);
const createdAliases = [];
const skippedAliases = [];
const missingAliasSources = [];

for (const alias of aliasMappings) {
  const aliasSourcePath = path.join(targetDir, alias.toFileName);
  const aliasTargetPath = path.join(targetDir, alias.fromFileName);

  if (!fs.existsSync(aliasSourcePath)) {
    missingAliasSources.push(alias.toFileName);
    continue;
  }

  const created = copyIfMissing(aliasSourcePath, aliasTargetPath);

  if (created) {
    createdAliases.push(alias.fromFileName);
  } else {
    skippedAliases.push(alias.fromFileName);
  }
}

const summary = {
  sourceDir,
  targetDir,
  totalSourceFlags: sourceFiles.length,
  createdFiles: createdFiles.length,
  skippedFiles: skippedFiles.length,
  createdAliases: createdAliases.length,
  skippedAliases: skippedAliases.length,
  unsupportedCodes,
  missingAliasSources,
  sampleCreatedFiles: createdFiles.slice(0, 20),
  sampleCreatedAliases: createdAliases.slice(0, 20)
};

console.log(JSON.stringify(summary, null, 2));
