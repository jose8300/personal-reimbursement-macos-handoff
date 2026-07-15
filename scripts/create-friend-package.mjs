import { copyFile, cp, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
const releaseDir = join(root, 'release');

export const packageName = 'personal-reimbursement-macos-handoff';

const stagingDir = join(releaseDir, packageName);
const zipPath = join(releaseDir, `${packageName}.zip`);

export const sourceFiles = [
  '.env.local.example',
  '.gitignore',
  'AGENTS.md',
  'MEMORY.md',
  'PROJECT_CONTEXT.md',
  'README.md',
  'eslint.config.js',
  'index.html',
  'package-lock.json',
  'package.json',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.node.json',
  'vite.config.ts',
];

const sourceDirectories = [
  'sample-data',
  'scripts',
  'server',
  'src',
];

const publicFiles = [
  'public/favicon.svg',
  'public/icons.svg',
];

export const friendFileAliases = [
  ['模型部署交接说明.md', 'START_HERE_AI.md'],
  ['给朋友使用说明.md', 'USER_GUIDE.md'],
  ['打不开时看这里.md', 'IF_CANNOT_OPEN.md'],
  ['启动个人报销系统.command', 'start.command'],
];

const forbiddenNames = [
  '.env.local',
  '.git',
  'node_modules',
  'dist',
  'release',
  'public/real-samples',
  'public/reimbursement-results',
];

export const requiredPackagePaths = [
  '.env.local.example',
  'AGENTS.md',
  'MEMORY.md',
  'PROJECT_CONTEXT.md',
  'README.md',
  'START_HERE_AI.md',
  'USER_GUIDE.md',
  'IF_CANNOT_OPEN.md',
  'start.command',
  'package.json',
  'package-lock.json',
  'src/App.tsx',
  'server/feishuServer.ts',
  'sample-data/wechat-sample.csv',
  'sample-data/alipay-sample.csv',
  'sample-data/bank-card-sample.csv',
  'public/real-samples/.gitkeep',
  'public/reimbursement-results/.gitkeep',
];

const privateDirectoryPlaceholders = new Set([
  'public/real-samples/.gitkeep',
  'public/reimbursement-results/.gitkeep',
]);

async function copyFileIfExists(relativePath) {
  const source = join(root, relativePath);
  if (!existsSync(source)) return;

  const target = join(stagingDir, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(source, target);
}

async function copyDirIfExists(relativePath) {
  const source = join(root, relativePath);
  if (!existsSync(source)) return;

  const target = join(stagingDir, relativePath);
  await cp(source, target, {
    recursive: true,
    filter: (sourcePath) => !isForbidden(normalizeRelative(sourcePath)),
  });
}

function normalizeRelative(path) {
  return relative(root, path).split(sep).filter(Boolean).join('/');
}

function normalizePackageEntry(entry) {
  let normalized = entry
    .replaceAll('\\', '/')
    .replace(/^\.\/+/, '')
    .replace(/\/+$/, '');

  if (normalized === packageName) return '';
  if (normalized.startsWith(`${packageName}/`)) {
    normalized = normalized.slice(packageName.length + 1);
  }

  return normalized;
}

export function isForbidden(relativePath) {
  const normalized = normalizePackageEntry(relativePath);
  return forbiddenNames.some((forbidden) => {
    return normalized === forbidden || normalized.startsWith(`${forbidden}/`);
  });
}

export function getPackageViolations(entries) {
  return entries
    .map(normalizePackageEntry)
    .filter(Boolean)
    .filter((entry) => {
      if (privateDirectoryPlaceholders.has(entry)) return false;
      if (isForbidden(entry)) return true;
      if (/\.(xlsx|xls)$/i.test(entry)) return true;
      if (entry.startsWith('public/real-samples/') && !privateDirectoryPlaceholders.has(entry)) {
        return true;
      }
      if (
        entry.startsWith('public/reimbursement-results/')
        && !privateDirectoryPlaceholders.has(entry)
      ) {
        return true;
      }
      return !entry.includes('/') && /\.(png|jpe?g)$/i.test(entry);
    });
}

async function listRelativeFiles(directory, prefix = '') {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...await listRelativeFiles(join(directory, entry.name), relativePath));
    } else {
      files.push(relativePath);
    }
  }

  return files;
}

async function assertStagingPackageIsSafe() {
  const entries = await listRelativeFiles(stagingDir);
  const missing = requiredPackagePaths.filter((path) => !entries.includes(path));
  const violations = getPackageViolations(entries);

  if (missing.length > 0) {
    throw new Error(`交接包缺少必需文件：${missing.join(', ')}`);
  }

  if (violations.length > 0) {
    throw new Error(`交接包包含禁止内容：${violations.join(', ')}`);
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || root,
    stdio: 'inherit',
    env: {
      ...process.env,
      COPYFILE_DISABLE: '1',
    },
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed`);
  }
}

async function main() {
  await rm(stagingDir, { recursive: true, force: true });
  await rm(zipPath, { force: true });
  await mkdir(stagingDir, { recursive: true });

  for (const file of sourceFiles) {
    await copyFileIfExists(file);
  }

  for (const directory of sourceDirectories) {
    await copyDirIfExists(directory);
  }

  for (const file of publicFiles) {
    await copyFileIfExists(file);
  }

  for (const [source, target] of friendFileAliases) {
    if (!existsSync(join(root, source))) continue;
    await copyFile(join(root, source), join(stagingDir, target));
  }

  await mkdir(join(stagingDir, 'public', 'reimbursement-results'), { recursive: true });
  await writeFile(
    join(stagingDir, 'public', 'reimbursement-results', '.gitkeep'),
    '交接包默认不包含历史报销结果。可以在页面上传用户自己的历史导出文件。\n',
  );

  await mkdir(join(stagingDir, 'public', 'real-samples'), { recursive: true });
  await writeFile(
    join(stagingDir, 'public', 'real-samples', '.gitkeep'),
    '交接包默认不包含真实账单样本。请使用 sample-data 或上传用户自己的账单。\n',
  );

  await assertStagingPackageIsSafe();
  run('chmod', ['+x', join(stagingDir, 'start.command')]);
  run('xattr', ['-cr', stagingDir]);
  run('ditto', ['-c', '-k', '--noextattr', '--norsrc', '--keepParent', packageName, `${packageName}.zip`], {
    cwd: releaseDir,
  });

  await rm(stagingDir, { recursive: true, force: true });

  console.log('');
  console.log(`已生成 macOS 源码交接包：${zipPath}`);
  console.log('');
  console.log('已排除：');
  for (const name of forbiddenNames) {
    console.log(`- ${name}`);
  }
}

const isDirectExecution = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectExecution) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
