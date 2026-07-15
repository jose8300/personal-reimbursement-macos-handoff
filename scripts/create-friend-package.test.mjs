import assert from 'node:assert/strict';
import test from 'node:test';

import {
  friendFileAliases,
  getPackageViolations,
  isForbidden,
  packageName,
  requiredPackagePaths,
  sourceFiles,
} from './create-friend-package.mjs';

test('defines the macOS model and friend handoff contract', () => {
  assert.equal(packageName, 'personal-reimbursement-macos-handoff');
  assert.ok(sourceFiles.includes('AGENTS.md'));
  assert.ok(sourceFiles.includes('MEMORY.md'));
  assert.ok(sourceFiles.includes('PROJECT_CONTEXT.md'));
  assert.ok(
    friendFileAliases.some(
      ([source, target]) => source === '模型部署交接说明.md' && target === 'START_HERE_AI.md',
    ),
  );
  assert.ok(
    friendFileAliases.some(
      ([source, target]) => source === '给朋友使用说明.md' && target === 'USER_GUIDE.md',
    ),
  );
  assert.ok(requiredPackagePaths.includes('start.command'));
});

test('rejects private and generated source paths', () => {
  for (const path of [
    '.env.local',
    'node_modules/react/index.js',
    'dist/index.html',
    'release/old.zip',
    '.git/config',
    'public/real-samples/private.xlsx',
    'public/reimbursement-results/private.xlsx',
  ]) {
    assert.equal(isForbidden(path), true, path);
  }

  assert.equal(isForbidden('.env.local.example'), false);
  assert.equal(isForbidden('sample-data/wechat-sample.csv'), false);
});

test('reports unsafe archive entries while allowing application assets', () => {
  assert.deepEqual(
    getPackageViolations([
      'START_HERE_AI.md',
      'src/assets/hero.png',
      'sample-data/wechat-sample.csv',
      'public/real-samples/.gitkeep',
      'public/reimbursement-results/.gitkeep',
    ]),
    [],
  );

  assert.deepEqual(
    getPackageViolations([
      '.env.local',
      'private.xlsx',
      'public/real-samples/private.csv',
      'verification.png',
    ]),
    [
      '.env.local',
      'private.xlsx',
      'public/real-samples/private.csv',
      'verification.png',
    ],
  );
});
