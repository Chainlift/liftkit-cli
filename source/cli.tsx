#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

const cli = meow(
	`
	Usage
	  $ lifty [command] [options]

	Commands
	  add <component>  Download a component from the registry

	Options
	  --name  Your name

	Examples
	  $ lifty --name=Jane
	  Hello, Jane

	  $ lifty add button
	  Downloads the button component

	  $ lifty add modal
	  Downloads the modal component
`,
	{
		importMeta: import.meta,
		flags: {
			name: {
				type: 'string',
			},
		},
	},
);

render(<App name={cli.flags.name} />);
