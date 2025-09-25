#!/usr/bin/env node
import { execSync } from 'node:child_process';

function hasPnpm() {
  try {
    execSync('pnpm --version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

if (hasPnpm()) {
  console.log('pnpm detected.');
  process.exit(0);
}

console.log('pnpm not found. Trying to enable via Corepack...');
try {
  execSync('corepack enable pnpm', { stdio: 'inherit' });
  if (hasPnpm()) {
    console.log('pnpm installed via Corepack.');
    process.exit(0);
  }
} catch (error) {
  console.warn('Corepack enable failed:', error instanceof Error ? error.message : error);
}

console.log('Falling back to npm global install of pnpm...');
try {
  execSync('npm install -g pnpm', { stdio: 'inherit' });
  if (hasPnpm()) {
    console.log('pnpm installed globally.');
    process.exit(0);
  }
} catch (error) {
  console.error('Unable to install pnpm automatically:', error instanceof Error ? error.message : error);
  process.exit(1);
}

console.error('pnpm installation failed for unknown reasons.');
process.exit(1);
