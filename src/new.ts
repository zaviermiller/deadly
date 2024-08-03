import fs from 'fs';
import path, { resolve } from 'path';
import { parse } from 'acorn-loose';
import * as walk from 'acorn-walk';

type ExportInfo = { dependencies: Set<string> } & (
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
  dependencies: Set<string>;
};

const DEFAULT_EXPORT_NAME = '1__default';

interface FileNode {
  exports: Record<string, ExportInfo>;
  imports: Record<string, ImportInfo>;
  functions: Record<string, FunctionInfo>;
}

function getAst(content: string) {
  return parse(content, {
    ecmaVersion: 'latest',
    sourceType: 'module',
    allowReserved: true,
    allowReturnOutsideFunction: true,
    allowImportExportEverywhere: true,
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
  } else {
    const fullPath = path.resolve(dirName, modulePath);
    if (fs.existsSync(fullPath)) {
      return fullPath;
    }
  }
}

function strictResolveModulePath(filePath: string, modulePath: string) {
  const resolvedPath = resolveModulePath(filePath, modulePath);

  if (!resolvedPath) {
    throw new Error(
      `Could not resolve module path: ${path.dirname(filePath)}/${modulePath}`
    );
  }

  return resolvedPath;
}

function resolveExports(
  fileInfo: FileNode,
  ast: ReturnType<typeof getAst>,
  filePath: string,
  exportAllPaths: Set<string>
) {
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
              dependencies: new Set<string>(),
            };
          });
        } else if (node.declaration.type === 'FunctionDeclaration') {
          fileInfo.exports[node.declaration.id.name] = {
            local: true,
            name: node.declaration.id.name,
            dependencies: new Set<string>(),
          };

          walk.simple(node.declaration, {
            Identifier(subNode) {
              if (subNode.name in fileInfo.imports) {
                // @ts-ignore
                fileInfo.exports[node.declaration.id.name].dependencies.add(
                  subNode.name
                );
              }
            },
          });
        }
      }
      if (node.specifiers) {
        node.specifiers.forEach((specifier) => {
          if (!node.source) {
            // no source? try and resolve from imports or functions
            // @ts-ignore
            if (specifier.local.name in fileInfo.imports) {
              // @ts-ignore
              const importInfo = fileInfo.imports[specifier.local.name];
              // @ts-ignore
              fileInfo.exports[specifier.exported.name] = {
                local: false,
                // @ts-ignore
                localName: specifier.local.name,
                // @ts-ignore
                exportedName: specifier.exported.name,
                path: importInfo.path,
                dependencies: new Set<string>(),
              };
              return;
            }
          }
          // @ts-ignore
          fileInfo.exports[specifier.exported.name] = {
            local: false,
            // @ts-ignore
            localName: specifier.local.name,
            // @ts-ignore
            exportedName: specifier.exported.name,
            path: strictResolveModulePath(
              filePath,
              node.source!.value as string
            ),
            dependencies: new Set<string>(),
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
          dependencies: new Set<string>(),
        };

        walk.simple(node.declaration, {
          Identifier(subNode) {
            if (subNode.name in fileInfo.imports) {
              // @ts-ignore
              fileInfo.exports[node.declaration.id.name].dependencies.add(
                subNode.name
              );
            }
          },
        });
      } else if (node.declaration.type === 'Identifier') {
        if (node.declaration.name in fileInfo.imports) {
          fileInfo.exports[DEFAULT_EXPORT_NAME] = {
            local: false,
            localName: node.declaration.name,
            exportedName: DEFAULT_EXPORT_NAME,
            path: fileInfo.imports[node.declaration.name].path,
            dependencies: new Set<string>(),
          };
          console.log(fileInfo.exports[DEFAULT_EXPORT_NAME]);
        } else {
          fileInfo.exports[DEFAULT_EXPORT_NAME] = {
            local: true,
            // @ts-ignore
            name: node.declaration.name,
            dependencies:
              fileInfo.functions[node.declaration.name].dependencies ||
              new Set<string>(),
          };
        }
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
                dependencies: new Set<string>(),
              };
            }
          });
        } else if (node.right.type === 'Identifier') {
          fileInfo.exports[node.right.name] = {
            local: true,
            name: node.right.name,
            dependencies: new Set<string>(),
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
          dependencies: new Set<string>(),
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
        dependencies: new Set<string>(),
      };

      walk.simple(node, {
        Identifier(subNode) {
          if (subNode.name in fileInfo.imports) {
            // @ts-ignore
            fileInfo.functions[node.id.name].dependencies.add(subNode.name);
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
        const modulePath = resolveModulePath(
          filePath,
          node.source.value as string
        );
        if (!modulePath) {
          return;
        }
        if (specifier.type === 'ImportSpecifier') {
          // @ts-ignore
          fileInfo.imports[specifier.imported.name] = {
            default: false,
            // @ts-ignore
            name: specifier.imported.name,
            path: modulePath,
          };
        } else if (specifier.type === 'ImportDefaultSpecifier') {
          fileInfo.imports[specifier.local.name] = {
            default: true,
            path: modulePath,
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
        const modulePath = resolveModulePath(filePath, source);
        if (!modulePath) {
          return;
        }
        if (node.id.type === 'Identifier') {
          // const module = require('module')
          fileInfo.imports[node.id.name] = {
            default: true,
            path: modulePath,
          };
        } else if (node.id.type === 'ObjectPattern') {
          // const { a, b } = require('module')
          node.id.properties.forEach((prop) => {
            // @ts-ignore
            fileInfo.imports[prop.value.name] = {
              default: false,
              // @ts-ignore
              name: prop.key.name,
              path: modulePath,
            };
          });
        }
      } else if (node.init && node.init.type === 'ImportExpression') {
        const modulePath = resolveModulePath(
          filePath,
          // @ts-ignore
          node.init.source.value as string
        );
        if (!modulePath) {
          return;
        }
        // @ts-ignore
        fileInfo.imports[node.id.name] = {
          default: true,
          // @ts-ignore
          path: modulePath,
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
      const exportPath = strictResolveModulePath(
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
          dependencies: new Set<string>(),
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
        } else if (exportInfo.dependencies.size > 0) {
          // This is a local export, check its dependencies
          // markUsed(filePath, new Set(exportInfo.dependencies));
          for (const dep of exportInfo.dependencies) {
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
