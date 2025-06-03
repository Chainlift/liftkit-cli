import React, {useState, useEffect} from 'react';
import {Text} from 'ink';
import lib from './lib.js';

const App = () => {
	const [counter, setCounter] = useState(0);

	useEffect(() => {
		const timer = setInterval(() => {
			setCounter(previousCounter => {
				const newCounter = previousCounter + 1;

				lib.save('test', `${newCounter}`);

				return newCounter;
			});
		}, 100);

		return () => {
			clearInterval(timer);
		};
	}, []);

	return <Text color="green">{counter} tests passed</Text>;
};

export default App;
