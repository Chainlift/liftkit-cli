#!/usr/bin/env node
import {Command} from 'commander';
import {initCommand, addCommand} from './app.js';

const program = new Command();

program
	.name('liftkit')
	.description(
		'A CLI tool to simplify component management and configuration for your Next.js project',
	)
	.version('0.0.3');

program
	.command('init')
	.description('Downloads essential files')
	.action(initCommand);

program
	.command('add <component>')
	.description('Download a component from the registry')
	.action(addCommand);

program.parseAsync();
