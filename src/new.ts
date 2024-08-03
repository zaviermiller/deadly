import fs from 'fs';
import path from 'path';
import { parse } from 'acorn-loose';
import * as walk from 'acorn-walk';

type ExportInfo = { dependencies: string[] } & (
  | {
      local: false;
      path: string;
      exportedName: string;
      localName: string;
    }
  | {
      local: true;
      name: string;
    }
);

type ImportInfo = {
  path: string;
} & (
  | {
      default: false;
      name: string;
    }
  | {
      default: true;
    }
);

type FunctionInfo = {
  dependencies: string[];
};

const DEFAULT_EXPORT_NAME = '1__default';

interface FileNode {
  exports: Record<string, ExportInfo>;
  imports: Record<string, ImportInfo>;
  functions: Record<string, FunctionInfo>;
}

function getAst(content: string) {
  return parse(content, {
    ecmaVersion: 2020,
    sourceType: 'module',
  });
}

function resolveModulePath(filePath: string, modulePath: string) {
  const dirName = path.dirname(filePath);
  if (path.extname(modulePath) === '') {
    // try different extensions
    const extensions = ['.js', '.ts', '.vue'];
    for (const ext of extensions) {
      const fullPath = path.resolve(dirName, modulePath + ext);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    // try index.[extensions]
    const indexExtensions = ['.js', '.ts'];

    for (const ext of indexExtensions) {
      const fullPath = path.resolve(dirName, modulePath, `index${ext}`);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    throw new Error(
      `File does not exist: ${modulePath}. Tried ${extensions} and index/${indexExtensions}`
    );
  } else {
    const fullPath = path.resolve(dirName, modulePath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    } else {
      throw new Error(`File does not exist: ${fullPath}`);
    }
  }
}

function resolveExports(
  fileInfo: FileNode,
  ast: ReturnType<typeof getAst>,
  filePath: string,
  exportAllPaths: Set<string>
) {
  const fileDir = path.dirname(filePath);
  walk.simple(ast, {
    ExportNamedDeclaration(node) {
      if (node.declaration) {
        if (node.declaration.type === 'VariableDeclaration') {
          node.declaration.declarations.forEach((decl) => {
            //@ts-ignore
            fileInfo.exports[decl.id.name] = {
              local: true,
              // @ts-ignore
              name: decl.id.name,
              dependencies: [],
            };
          });
        } else if (node.declaration.type === 'FunctionDeclaration') {
          fileInfo.exports[node.declaration.id.name] = {
            local: true,
            name: node.declaration.id.name,
            dependencies: [],
          };

          walk.simple(node.declaration, {
            Identifier(subNode) {
              if (subNode.name in fileInfo.imports) {
                // @ts-ignore
                fileInfo.exports[node.declaration.id.name].dependencies.push(
                  subNode.name
                );
              }
            },
          });
        }
      }
      if (node.specifiers) {
        node.specifiers.forEach((specifier) => {
          // @ts-ignore
          fileInfo.exports[specifier.exported.name] = {
            local: false,
            // @ts-ignore
            localName: specifier.local.name,
            // @ts-ignore
            exportedName: specifier.exported.name,
            path: path.resolve(fileDir, node.source!.value as string),
            dependencies: [],
          };
        });
      }
    },
    ExportDefaultDeclaration(node) {
      if (node.declaration.type === 'FunctionDeclaration') {
        // @ts-ignore
        fileInfo.exports[DEFAULT_EXPORT_NAME] = {
          local: true,
          // @ts-ignore
          name: node.declaration.id.name,
          dependencies: [],
        };

        walk.simple(node.declaration, {
          Identifier(subNode) {
            if (subNode.name in fileInfo.imports) {
              // @ts-ignore
              fileInfo.exports[node.declaration.id.name].dependencies.push(
                subNode.name
              );
            }
          },
        });
      } else if (node.declaration.type === 'Identifier') {
        fileInfo.exports[DEFAULT_EXPORT_NAME] = {
          local: true,
          // @ts-ignore
          name: node.declaration.name,
          dependencies: fileInfo.functions[node.declaration.name].dependencies,
        };
      }
    },
    ExportAllDeclaration() {
      exportAllPaths.add(path.resolve(filePath));
    },
    AssignmentExpression(node) {
      if (
        node.left.type === 'MemberExpression' &&
        // @ts-ignore
        node.left.object.name === 'module' &&
        // @ts-ignore
        node.left.property.name === 'exports'
      ) {
        if (node.right.type === 'ObjectExpression') {
          node.right.properties.forEach((prop) => {
            if (prop.type === 'Property') {
              // @ts-ignore
              fileInfo.exports[prop.key.name] = {
                local: true,
                // @ts-ignore
                name: prop.key.name,
                dependencies: [],
              };
            }
          });
        } else if (node.right.type === 'Identifier') {
          fileInfo.exports[node.right.name] = {
            local: true,
            name: node.right.name,
            dependencies: [],
          };
        }
      }
    },
    MemberExpression(node) {
      // @ts-ignore
      if (
        node.object.type === 'MemberExpression' &&
        // @ts-ignore
        node.object.object.name === 'module' &&
        // @ts-ignore
        node.object.property.name === 'exports'
      ) {
        // @ts-ignore
        fileInfo.exports[node.property.name] = {
          local: true,
          // @ts-ignore
          name: node.property.name,
          dependencies: [],
        };
      }
    },
  });
}

function resolveFunctions(fileInfo: FileNode, ast: ReturnType<typeof getAst>) {
  walk.simple(ast, {
    FunctionDeclaration(node) {
      // @ts-ignore
      fileInfo.functions[node.id.name] = {
        dependencies: [],
      };

      walk.simple(node, {
        Identifier(subNode) {
          if (subNode.name in fileInfo.imports) {
            // @ts-ignore
            fileInfo.functions[node.id.name].dependencies.push(subNode.name);
          }
        },
      });
    },
  });
}

function resolveImports(
  fileInfo: FileNode,
  ast: ReturnType<typeof getAst>,
  filePath: string
) {
  walk.simple(ast, {
    ImportDeclaration(node) {
      // console.dir(node, { depth: null });
      node.specifiers.forEach((specifier) => {
        if (specifier.type === 'ImportSpecifier') {
          // @ts-ignore
          fileInfo.imports[specifier.imported.name] = {
            default: false,
            // @ts-ignore
            name: specifier.imported.name,
            path: resolveModulePath(filePath, node.source.value as string),
          };
        } else if (specifier.type === 'ImportDefaultSpecifier') {
          fileInfo.imports[specifier.local.name] = {
            default: true,
            path: resolveModulePath(filePath, node.source.value as string),
          };
        }
      });
    },
    VariableDeclarator(node) {
      if (
        node.init &&
        node.init.type === 'CallExpression' &&
        // @ts-ignore
        node.init.callee.name === 'require'
      ) {
        // @ts-ignore
        const source = node.init.arguments[0].value;
        if (node.id.type === 'Identifier') {
          // const module = require('module')
          fileInfo.imports[node.id.name] = {
            default: true,
            path: resolveModulePath(filePath, source),
          };
        } else if (node.id.type === 'ObjectPattern') {
          // const { a, b } = require('module')
          node.id.properties.forEach((prop) => {
            // @ts-ignore
            fileInfo.imports[prop.value.name] = {
              default: false,
              // @ts-ignore
              name: prop.key.name,
              path: resolveModulePath(filePath, source),
            };
          });
        }
      } else if (node.init && node.init.type === 'ImportExpression') {
        // @ts-ignore
        fileInfo.imports[node.id.name] = {
          default: true,
          // @ts-ignore
          path: resolveModulePath(filePath, node.init.source.value as string),
        };
      }
    },
  });
}

function analyzeFile(
  filePath: string,
  content: string,
  exportAllPaths: Set<string>
) {
  const ast = getAst(content);

  const fileInfo: FileNode = {
    exports: {},
    imports: {},
    functions: {},
  };

  resolveImports(fileInfo, ast, filePath);
  resolveFunctions(fileInfo, ast);
  resolveExports(fileInfo, ast, filePath, exportAllPaths);

  return fileInfo;
}

function handleExportAlls(filePath: string, files: Record<string, FileNode>) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const ast = getAst(content);
  const file = files[filePath];

  walk.simple(ast, {
    ExportAllDeclaration(node) {
      const exportPath = resolveModulePath(
        filePath,
        node.source.value as string
      );
      const exportFileExports = files[exportPath].exports;
      for (const exportName in exportFileExports) {
        if (exportName in file.exports) {
          throw new Error(
            `Export name conflict: ${exportName} in ${filePath} and ${exportPath}`
          );
        }

        file.exports[exportName] = {
          local: false,
          localName: exportName,
          exportedName: exportName,
          path: exportPath,
          dependencies: [],
        };
      }
    },
  });

  files[filePath] = file;
}

function extractVueScriptContent(content: string): string {
  const scriptMatch = content.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  return scriptMatch ? scriptMatch[1] : content;
}

function processFile(filePath: string, exportAllPaths: Set<string>) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`File does not exist: ${filePath}`);
  }

  let content;
  if (path.extname(filePath) === '.vue') {
    content = extractVueScriptContent(fs.readFileSync(filePath, 'utf-8'));
  } else {
    content = fs.readFileSync(filePath, 'utf-8');
  }

  return analyzeFile(filePath, content, exportAllPaths);
}

function processDirectory(
  dirPath: string,
  files: Record<string, FileNode> = {}
) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const exportAllPaths = new Set<string>();

  for (const entry of entries) {
    const entryPath = path.resolve(path.join(dirPath, entry.name));

    if (entry.isDirectory()) {
      processDirectory(entryPath, files);
    } else if (entry.isFile() && path.extname(entry.name) === '.js') {
      files[entryPath] = processFile(entryPath, exportAllPaths);
    }
  }

  for (const exportAllPath of exportAllPaths) {
    handleExportAlls(exportAllPath, files);
  }
}

export function findUnusedFiles(entryPath: string, srcDir: string) {
  const files: Record<string, FileNode> = {};
  processDirectory(srcDir, files);

  const entrypoint = files[path.resolve(entryPath)];
  const unusedFiles = new Set(Object.keys(files));

  function markUsed(filePath: string, exportsToCheck: Set<string>) {
    if (unusedFiles.has(filePath)) {
      unusedFiles.delete(filePath);
    }

    const fileInfo = files[filePath];

    for (const exportName of exportsToCheck) {
      const exportInfo = fileInfo.exports[exportName];
      if (exportInfo) {
        if (!exportInfo.local) {
          // This is a re-export, recurse into the source file
          markUsed(exportInfo.path, new Set([exportInfo.localName]));
        } else if (exportInfo.dependencies.length > 0) {
          // This is a local export, check its dependencies
          // markUsed(filePath, new Set(exportInfo.dependencies));
          for (const dep of exportInfo.dependencies) {
            console.log(fileInfo.imports[dep]);
            markUsed(fileInfo.imports[dep].path, new Set([dep]));
          }
        }
      }
    }
    if (filePath === path.resolve(entryPath)) {
      // Check all imports of this file
      for (const importName in fileInfo.imports) {
        const importInfo = fileInfo.imports[importName];
        if (importInfo.default) {
          markUsed(importInfo.path, new Set([DEFAULT_EXPORT_NAME]));
        } else {
          markUsed(importInfo.path, new Set([importName]));
        }
      }
    }
  }

  // Start with the entrypoint
  markUsed(path.resolve(entryPath), new Set(Object.keys(entrypoint.imports)));

  return unusedFiles;
}

// const testCase = 'dynamicImport';

// const entrypoint = path.resolve(`test/${testCase}/entrypoint.js`);

// const unused = findUnusedFiles(entrypoint, `test/${testCase}`);

// console.log(unused);

// const entrypoint = path.resolve('../resaleai/apps/frontend/src/main.js');

// const unused = findUnusedFiles(entrypoint, '../resaleai/apps/frontend/src');

// console.log(unused);
