import { spawn } from 'node:child_process';

const commands = [
  ['feishu-api', 'npx', ['tsx', 'server/feishuServer.ts']],
  ['vite', 'npx', ['vite', '--host', '127.0.0.1']],
];

const children = commands.map(([name, command, args]) => {
  const child = spawn(command, args, {
    stdio: 'inherit',
  });
  child.on('exit', (code) => {
    if (code) console.error(`${name} exited with code ${code}`);
  });
  return child;
});

function shutdown() {
  children.forEach((child) => child.kill('SIGTERM'));
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
