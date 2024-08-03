import process from 'process';
import { findUnusedFiles } from './new';
import path from 'path';

if (process.argv.length < 4) {
  console.error('Usage: find-unused-files <entrypoint> <projectDir>');
  process.exit(1);
}

const entrypoint = path.resolve(process.argv[2]);
const projectDir = path.resolve(process.argv[3]);

const unused = findUnusedFiles(entrypoint, projectDir);

console.log(unused);
