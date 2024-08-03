import path from 'path';
import { findUnusedFiles } from '../src/new';
import { describe, expect, it } from 'vitest';

const testCase = 'indexExportAll';

const dir = path.resolve(__dirname, testCase);

describe(testCase, () => {
  it('should work', () => {
    const unusedFiles = findUnusedFiles(
      path.resolve(dir, 'entrypoint.js'),
      dir
    );
    expect(unusedFiles).toEqual(new Set([path.resolve(dir, 'test/test2.js')]));
  });
});
