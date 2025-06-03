import React, {useState, useEffect} from 'react';
import {render, Box, Text, useApp} from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import fs from 'fs/promises';
import path from 'path';
import https from 'https';
import {IncomingMessage} from 'http';

// Type definitions
interface ComponentRegistry {
	[key: string]: string;
}

interface FileDownloaderProps {
	componentName: string;
	targetDir?: string;
}

interface AppProps {
	name?: string;
}

type ProgressCallback = (percent: number) => void;

// Component registry - maps component names to their download URLs
const COMPONENT_REGISTRY: ComponentRegistry = {
	button:
		'https://raw.githubusercontent.com/example/components/main/button.jsx',
	input: 'https://raw.githubusercontent.com/example/components/main/input.jsx',
	modal: 'https://raw.githubusercontent.com/example/components/main/modal.jsx',
	spinner:
		'https://raw.githubusercontent.com/example/components/main/spinner.jsx',
	card: 'https://raw.githubusercontent.com/example/components/main/card.jsx',
};

enum DownloadStatus {
	IDLE = 'idle',
	DOWNLOADING = 'downloading',
	SUCCESS = 'success',
	ERROR = 'error',
}

const FileDownloader: React.FC<FileDownloaderProps> = ({
	componentName,
	targetDir = './components',
}) => {
	const [status, setStatus] = useState<DownloadStatus>(DownloadStatus.IDLE);
	const [progress, setProgress] = useState<number>(0);
	const [error, setError] = useState<string | null>(null);
	const [downloadedFile, setDownloadedFile] = useState<string | null>(null);
	const {exit} = useApp();

	useEffect(() => {
		downloadComponent();
	}, [componentName]);

	const downloadComponent = async (): Promise<void> => {
		if (!componentName) {
			setError('No component name provided');
			setStatus(DownloadStatus.ERROR);
			return;
		}

		const url = COMPONENT_REGISTRY[componentName.toLowerCase()];
		if (!url) {
			setError(`Component "${componentName}" not found in registry`);
			setStatus(DownloadStatus.ERROR);
			return;
		}

		setStatus(DownloadStatus.DOWNLOADING);

		try {
			await fs.mkdir(targetDir, {recursive: true});

			const fileName = `${componentName}.jsx`;
			const filePath = path.join(targetDir, fileName);

			await downloadFile(url, filePath, setProgress);

			setDownloadedFile(filePath);
			setStatus(DownloadStatus.SUCCESS);

			setTimeout(() => exit(), 2000);
		} catch (err) {
			const errorMessage =
				err instanceof Error ? err.message : 'Unknown error occurred';
			setError(errorMessage);
			setStatus(DownloadStatus.ERROR);
		}
	};

	const downloadFile = (
		url: string,
		filePath: string,
		onProgress: ProgressCallback,
	): Promise<void> => {
		return new Promise((resolve, reject) => {
			https
				.get(url, (response: IncomingMessage) => {
					if (response.statusCode !== 200) {
						reject(
							new Error(
								`HTTP ${response.statusCode}: ${response.statusMessage}`,
							),
						);
						return;
					}

					const totalSize = parseInt(
						response.headers['content-length'] || '0',
						10,
					);
					let downloadedSize = 0;
					let fileContent = '';

					response.on('data', (chunk: Buffer) => {
						downloadedSize += chunk.length;
						fileContent += chunk.toString();
						if (totalSize > 0) {
							const percent = Math.round((downloadedSize / totalSize) * 100);
							onProgress(percent);
						}
					});

					response.on('end', async () => {
						try {
							await fs.writeFile(filePath, fileContent);
							resolve();
						} catch (err) {
							reject(err);
						}
					});

					response.on('error', reject);
				})
				.on('error', reject);
		});
	};

	const renderProgressBar = (percent: number): string => {
		const width = 20;
		const filled = Math.round((percent / 100) * width);
		const empty = width - filled;
		return '█'.repeat(filled) + '░'.repeat(empty);
	};

	return (
		<Box flexDirection="column" padding={1}>
			<Box marginBottom={1}>
				<Text bold>🚀 Lifty Component Downloader</Text>
			</Box>

			{status === DownloadStatus.IDLE && <Text>Initializing download...</Text>}

			{status === DownloadStatus.DOWNLOADING && (
				<Box flexDirection="column">
					<Text>
						📥 Downloading <Text color="cyan">{componentName}</Text>{' '}
						component...
					</Text>
					<Box marginTop={1}>
						<Text>
							Progress: [{renderProgressBar(progress)}] {progress}%
						</Text>
					</Box>
				</Box>
			)}

			{status === DownloadStatus.SUCCESS && (
				<Box flexDirection="column">
					<Text color="green">✅ Successfully downloaded!</Text>
					<Text>
						📁 Saved to: <Text color="yellow">{downloadedFile}</Text>
					</Text>
					<Text dimColor>Exiting in 2 seconds...</Text>
				</Box>
			)}

			{status === DownloadStatus.ERROR && (
				<Box flexDirection="column">
					<Text color="red">❌ Download failed!</Text>
					<Text color="red">Error: {error}</Text>
					<Box marginTop={1}>
						<Text dimColor>Available components:</Text>
						{Object.keys(COMPONENT_REGISTRY).map((name: string) => (
							<Text key={name} color="cyan">
								{' '}
								• {name}
							</Text>
						))}
					</Box>
				</Box>
			)}
		</Box>
	);
};

interface ComponentSelectorProps {
	onSelect: (name: string) => void;
}

const ComponentSelector: React.FC<ComponentSelectorProps> = ({onSelect}) => {
	const [components, setComponents] = useState<
		{label: string; value: string}[]
	>([]);
	const [manualMode, setManualMode] = useState(false);
	const [manualName, setManualName] = useState('');

	useEffect(() => {
		const checkInstalled = async () => {
			const entries = await Promise.all(
				Object.keys(COMPONENT_REGISTRY).map(async name => {
					const filePath = path.join('./components', `${name}.jsx`);
					const exists = await fs
						.access(filePath)
						.then(() => true)
						.catch(() => false);

					return {
						label: `${exists ? '✅ ' : ''}${name}`,
						value: name,
					};
				}),
			);

			entries.push({label: '➕ Other / Manual entry', value: '__manual__'});
			setComponents(entries);
		};

		checkInstalled();
	}, []);

	if (manualMode) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>✏️ Enter component name manually:</Text>
				<TextInput
					value={manualName}
					onChange={setManualName}
					onSubmit={value => onSelect(value.trim())}
				/>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>Select a component to download:</Text>
			<SelectInput
				items={components}
				onSelect={item => {
					if (item.value === '__manual__') {
						setManualMode(true);
					} else {
						onSelect(item.value);
					}
				}}
			/>
		</Box>
	);
};

// App component
const App: React.FC<AppProps> = ({name}) => {
	const args = process.argv.slice(2);
	const command = args.find(arg => !arg.startsWith('--'));
	const componentName = args[args.indexOf(command!) + 1];
	const [selectedComponent, setSelectedComponent] = useState<string | null>(
		null,
	);

	if (command === 'add' && componentName) {
		return <FileDownloader componentName={componentName} />;
	}

	if (command === 'add' && !componentName && !selectedComponent) {
		return <ComponentSelector onSelect={setSelectedComponent} />;
	}

	if (selectedComponent) {
		return <FileDownloader componentName={selectedComponent} />;
	}

	if (name) {
		return (
			<Box flexDirection="column" padding={1}>
				<Text>
					Hello, <Text color="green">{name}</Text>!
				</Text>
				<Box marginTop={1}>
					<Text dimColor>Commands:</Text>
					<Text>
						{' '}
						<Text color="cyan">lifty add &lt;component-name&gt;</Text> -
						Download a component
					</Text>
				</Box>
			</Box>
		);
	}

	return (
		<Box flexDirection="column" padding={1}>
			<Text bold>🚀 Lifty CLI</Text>
			<Box marginTop={1}>
				<Text dimColor>Usage:</Text>
				<Text>
					{' '}
					<Text color="cyan">lifty --name=Jane</Text> - Greet user
				</Text>
				<Text>
					{' '}
					<Text color="cyan">lifty add &lt;component-name&gt;</Text> - Download
					a component
				</Text>
			</Box>
			<Box marginTop={1}>
				<Text dimColor>Available components:</Text>
				{Object.keys(COMPONENT_REGISTRY).map((name: string) => (
					<Text key={name} color="cyan">
						{' '}
						• {name}
					</Text>
				))}
			</Box>
		</Box>
	);
};

export default App;
