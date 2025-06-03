import React, {useState, useEffect} from 'react';
import {Text} from 'ink';
import lib from './lib.js';

const config = lib.getConfig('./config.json');

if (lib.cli.input[0] == 'init') {
	lib.fetch(`${config.templaterepo}/components.json`).file('./components.json');
	lib
		.fetch(`${config.templaterepo}/tailwind.config.ts`)
		.file('./tailwind.config.ts');
}

const App = () => {
	const [counter, setCounter] = useState(0);

	useEffect(() => {
		let count = 0; // track how many times it ran

		const timer = setInterval(() => {
			setCounter(previousCounter => {
				const newCounter = previousCounter + 1;

				count++;

				if (count >= 3) {
					clearInterval(timer); // stop after 3 runs
				}

				return newCounter;
			});
		}, 500); // or your preferred interval time
	}, []);

	return <Text color="green">{counter} tests passed</Text>;
};

export default App;
