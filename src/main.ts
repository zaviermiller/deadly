#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import DependencyGraph from './dependency-graph';
import { parseImports, resolveImportPath } from './parse';
import program from './cli';

function findClosestSrcDir(filePath: string) {
  let dir = path.dirname(filePath);
  while (dir !== path.parse(dir).root) {
    const srcDir = path.join(dir, 'src');
    if (fs.existsSync(srcDir) && fs.statSync(srcDir).isDirectory()) {
      return srcDir;
    }
    dir = path.dirname(dir);
  }
  return null;
}

function getAllFiles(dir: string): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(getAllFiles(file));
    } else {
      const ext = path.extname(file).toLowerCase();
      const basename = path.basename(file).toLowerCase();
      if (
        ['.js', '.vue'].includes(ext) &&
        !basename.endsWith('.spec.js') &&
        !basename.endsWith('.unit.js')
      ) {
        results.push(path.resolve(file));
      }
    }
  });
  return results;
}

function buildDependencyGraph(entryPoint: string) {
  const graph = new DependencyGraph();
  const srcDir = findClosestSrcDir(entryPoint);
  const queue = [entryPoint];
  const processed = new Set();

  while (queue.length > 0) {
    const currentFile = queue.shift();
    if (processed.has(currentFile) || !currentFile) continue;
    processed.add(currentFile);

    const imports = parseImports(currentFile);
    const baseDir = path.dirname(currentFile);

    for (const importPath of imports) {
      if (importPath.startsWith('.') || importPath.startsWith('@')) {
        let resolvedPath;
        if (importPath.startsWith('@/') && srcDir) {
          resolvedPath = resolveImportPath(srcDir, importPath.slice(2));
        } else {
          resolvedPath = resolveImportPath(baseDir, importPath);
        }

        if (resolvedPath) {
          graph.addEdge(currentFile, resolvedPath);
          if (!processed.has(resolvedPath)) {
            queue.push(resolvedPath);
          }
        }
      }
    }
  }

  return graph;
}

// does not need to be in this class
function findUnusedFiles(
  graph: DependencyGraph,
  entryPoint: string,
  projectDir: string
) {
  const allFiles = getAllFiles(projectDir);
  const unusedFiles = [];

  for (const file of allFiles) {
    if (!graph.hasPathToEntryPoint(file, entryPoint, new Set())) {
      unusedFiles.push(file);
    }
  }

  return unusedFiles;
}

program.parse();

const args = program.args;
const projectDir = path.resolve(args[args.length - 1]);
const entryPoint = path.resolve(program.opts().entryPoint);

const graph = buildDependencyGraph(entryPoint);

if (args[0] === 'report') {
  const unusedFiles = findUnusedFiles(graph, entryPoint, projectDir);
  unusedFiles.forEach((file) => console.log(file));
}
