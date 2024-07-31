import type DependencyGraph from './dependency-graph';

import fs from 'fs';
import path from 'path';
import acorn from 'acorn-loose';
import walk from 'acorn-walk';

// function showFileDependencies(
//   graph: DependencyGraph,
//   filePath: string
// ): string {
//   if (!graph.nodes.has(filePath)) {
//     return `File not found in dependency graph: ${filePath}`;
//   }

//   const dependencies = graph.getDependencies(filePath);

//   if (dependencies.size === 0) {
//     return `No dependencies found for ${filePath}`;
//   }

//   const formattedDependencies = Array.from(dependencies)
//     .map((dep) => `  - ${dep}`)
//     .join('\n');

//   return `Dependencies for ${filePath}:\n${formattedDependencies}`;
// }

function extractScriptContent(content: string): string {
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return scriptMatch ? scriptMatch[1] : content;
}

type Import = string;

export function parseImports(filePath: string): Import[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const fileExtension = path.extname(filePath).toLowerCase();

  let scriptContent;
  if (fileExtension === '.vue') {
    scriptContent = extractScriptContent(content);
  } else {
    scriptContent = content;
  }

  const ast = acorn.parse(scriptContent, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowReserved: true,
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
  });

  const imports: Import[] = [];

  walk.simple(ast, {
    ImportDeclaration(node) {
      if (typeof node.source.value === 'string') {
        imports.push(node.source.value);
      }
    },
    ExportAllDeclaration(node) {
      if (node.source && typeof node.source.value === 'string') {
        imports.push(node.source.value);
      }
    },
    ExportNamedDeclaration(node) {
      if (node.source && typeof node.source.value === 'string') {
        imports.push(node.source.value);
      }
    },
    CallExpression(node) {
      // @ts-ignore
      if (node.callee.name === 'require' && node.arguments.length > 0) {
        const arg = node.arguments[0];
        if (arg.type === 'Literal' && typeof arg.value === 'string') {
          imports.push(arg.value);
        }
        // @ts-ignore
      } else if (node.callee.type === 'Import' && node.arguments.length > 0) {
        // Handle dynamic import()
        const arg = node.arguments[0];
        if (arg.type === 'Literal' && typeof arg.value === 'string') {
          imports.push(arg.value);
        } else if (arg.type === 'TemplateLiteral' && arg.quasis.length === 1) {
          // Handle simple template literals like `./path/to/file`
          imports.push(arg.quasis[0].value.raw);
        }
      }
    },
    ImportExpression(node) {
      // Alternative way to catch dynamic imports
      if (
        node.source.type === 'Literal' &&
        typeof node.source.value === 'string'
      ) {
        imports.push(node.source.value);
      } else if (
        node.source.type === 'TemplateLiteral' &&
        node.source.quasis.length === 1
      ) {
        // Handle simple template literals like `./path/to/file`
        imports.push(node.source.quasis[0].value.raw);
      }
    },
  });

  return imports;
}

export function resolveImportPath(basePath: string, importPath: string) {
  const fullPath = path.resolve(basePath, importPath);

  const extensions = ['.js', '.vue', ''];
  for (const ext of extensions) {
    const pathWithExt = fullPath + ext;
    if (fs.existsSync(pathWithExt)) {
      const stats = fs.statSync(pathWithExt);
      if (stats.isFile()) {
        return pathWithExt;
      }
    }
  }

  // Check for index files
  const indexPath = path.join(fullPath, 'index');
  for (const ext of extensions) {
    const indexWithExt = indexPath + ext;
    if (fs.existsSync(indexWithExt)) {
      return indexWithExt;
    }
  }

  return null;
}
