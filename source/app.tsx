import React, {useState, useEffect} from 'react';
import {Text} from 'ink';
import lib from './lib.js';

const App = () => {
	const [message, setMessage] = useState('');
	const config = lib.getConfig('./config.json');
	const [color, setColor] = useState('green');
	const posArgs = lib.cli.input;
	useEffect(() => {
		if (posArgs[0] == 'init') {
			// Handle async operations properly - save both or neither
			const initializeFiles = async () => {
				try {
					// Fetch and save both files, get the output strings
					const downloadOutputs = await Promise.all([
						lib
							.fetch(`${config.templaterepo}/components.json`)
							.file('./components.json'),
						lib
							.fetch(`${config.templaterepo}/tailwind.config.ts`)
							.file('./tailwind.config.ts'),
					]);

					// Set the combined output as message
					setMessage(
						'Upon downloading files... \n' + downloadOutputs.join('\n'),
					);
				} catch (error) {
					setMessage('Error initializing files');
					setColor('red');
				}
			};

			initializeFiles();
		}

		if (
			posArgs.length === 2 &&
			posArgs[0] === 'add' &&
			typeof posArgs[1] === 'string'
		) {
			if (lib.isValidUrl(posArgs[1])) {
				lib.runNpxAndExit(['shadcn', 'add', posArgs[1]]);
			}
		}
	}, []); // Add empty dependency array to run only once

	return <Text color={color}>{message}</Text>;
};
export default App;
