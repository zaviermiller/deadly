#!/usr/bin/env node

import { Command } from 'commander';

const program = new Command();

program.name('deadly');

program.argument('<directory>', 'The project directory to analyze');

program.option(
  '-e, --entry-point <entryPoint>',
  'The entry point of the project',
  'src/main.js'
);

program
  .command('report')
  .description('Generate a report of unused files')
  .option('-f, --format <format>', 'The format of the report', 'json');

program
  .command('dependents')
  .description('List all dependents of a file')
  .argument('<file>', 'The file to analyze');

export default program;
