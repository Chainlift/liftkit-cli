import fs from 'fs';
import path from 'path';

export const save = (filename: string, content: string): void => {
	fs.writeFileSync(path.join(process.cwd(), filename), content, 'utf8');
};

export const fetchJson = async (url: string): Promise<any> => {
	const res = await fetch(url);

	if (!res.ok) {
		throw new Error(`Failed to fetch ${url}: ${res.status} ${res.statusText}`);
	}

	const data = await res.json();
	return data;
};

export default {
	save,
	fetchJson,
};
