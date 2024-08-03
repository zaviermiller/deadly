# Test cases:

## `simpleExport`

This is a simple case where two files each export a single function. The entrypoint, `entrypoint.js`, imports only of the functions. The expected output is that `test2.js` is a dead file.

## `simpleRequire`

This is a case where `require` is used to import a file. The entrypoint, `entrypoint.js`, imports the exported function from `test.js`. The expected output is that `test2.js` is a dead file.

## `dynamicImport`

## `defaultExport`

## `aliasedImport`

## `namespaceImport`

## `indexExportAll`

This is a common pattern in JavaScript projects where an index file exports everything from other files in a folder, and then you import from that folder itself. This is a simple case where the index file exports everything from two other files in the `test` folder. The entrypoint, `entrypoint.js` imports from the index file. The expected output is that `test2.js` is a dead file.

## `indexModuleExportAll`

This is a common pattern in JavaScript projects where an index file exports everything from other files in a folder, and then you import from that folder itself. This is a simple case where the index file exports everything from two other files in the `test` folder. The entrypoint, `entrypoint.js` imports from the index file. The expected output is that `test2.js` is a dead file. Using commonjs modules.

## `namedExportAll`

## `namedExport`

## `importedUsedInExported`

This is a case where a file is imported and used in an exported function. The file `test.js` exports a function that uses a function from `test2.js`. The entrypoint, `entrypoint.js` imports the exported function from `test.js`. The expected output is that `test2.js` is not a dead file.

## `importedUnused`

This is a case where a file is imported but not used. The file `test.js` imports from `test2.js` and `test3.js`, but only uses the import from `test3.js`. The entrypoint, `entrypoint.js` imports the exported function from `test.js`. The expected output is that `test2.js` is a dead file.
