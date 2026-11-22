import {AbsClient, AbsError, normaliseServerUrl} from './client';
import type {Credentials} from './client';

const creds: Credentials = {serverUrl: 'https://abs.test', userId: 'u', username: 'me', accessToken: 'a1', refreshToken: 'r1'};

// jsdom has no Response, so fake the few members the client uses.
function reply (status: number, body: string, type = 'application/json') {
	return Promise.resolve({
		status,
		ok: status >= 200 && status < 300,
		headers: {get: (name: string) => (name.toLowerCase() === 'content-type' ? type : null)},
		text: () => Promise.resolve(body),
		json: () => Promise.resolve(JSON.parse(body))
	});
}

afterEach(() => {
	(global as unknown as {fetch?: unknown}).fetch = undefined;
});

describe('normaliseServerUrl', () => {
	it('adds https and drops trailing slashes', () => {
		expect(normaliseServerUrl(' abs.example.com/ ')).toBe('https://abs.example.com');
		expect(normaliseServerUrl('http://10.0.0.5:13378//')).toBe('http://10.0.0.5:13378');
		expect(normaliseServerUrl('https://example.com/audiobookshelf/')).toBe('https://example.com/audiobookshelf');
	});
});

describe('AbsClient', () => {
	it('accepts the plain-text OK that session sync returns', async () => {
		global.fetch = jest.fn(() => reply(200, 'OK', 'text/plain; charset=utf-8')) as unknown as typeof fetch;
		const client = new AbsClient(creds, () => undefined);
		await expect(client.syncSession('s', {currentTime: 1, timeListened: 1, duration: 2})).resolves.toBeNull();
	});

	it('refreshes once on 401, saves the rotated tokens and retries', async () => {
		const saved: Credentials[] = [];
		const calls: string[] = [];
		global.fetch = jest.fn((url: string, init: RequestInit) => {
			calls.push(url + ' ' + (init.headers as Record<string, string>).Authorization);
			if (url.endsWith('/auth/refresh')) return reply(200, JSON.stringify({user: {accessToken: 'a2', refreshToken: 'r2'}}));
			if ((init.headers as Record<string, string>).Authorization === 'Bearer a1') return reply(401, 'Unauthorized', 'text/plain');
			return reply(200, JSON.stringify({id: 'x'}));
		}) as unknown as typeof fetch;
		const client = new AbsClient(creds, (c) => saved.push(c));
		const item = await client.getItem('x');
		expect(item).toEqual({id: 'x'});
		expect(saved).toEqual([{...creds, accessToken: 'a2', refreshToken: 'r2'}]);
		expect(calls[calls.length - 1]).toBe('https://abs.test/api/items/x?expanded=1 Bearer a2');
	});

	it('shares one refresh between concurrent requests (refresh tokens rotate)', async () => {
		let refreshes = 0;
		global.fetch = jest.fn((url: string, init: RequestInit) => {
			if (url.endsWith('/auth/refresh')) {
				refreshes += 1;
				return reply(200, JSON.stringify({user: {accessToken: 'a2', refreshToken: 'r2'}}));
			}
			if ((init.headers as Record<string, string>).Authorization === 'Bearer a1') return reply(401, '', 'text/plain');
			return reply(200, '{}');
		}) as unknown as typeof fetch;
		const client = new AbsClient(creds, () => undefined);
		await Promise.all([client.getItem('a'), client.getItem('b'), client.getItem('c')]);
		expect(refreshes).toBe(1);
	});

	it('reports a missing book as notFound and missing progress as null', async () => {
		global.fetch = jest.fn(() => reply(404, 'Not Found', 'text/plain')) as unknown as typeof fetch;
		const client = new AbsClient(creds, () => undefined);
		await expect(client.getItem('nope')).rejects.toMatchObject({kind: 'notFound'});
		await expect(client.getProgress('nope')).resolves.toBeNull();
	});

	it('reports an unreachable server as a network error', async () => {
		global.fetch = jest.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
		const client = new AbsClient(creds, () => undefined);
		const err = await client.getItem('x').catch((e: unknown) => e);
		expect(err).toBeInstanceOf(AbsError);
		expect((err as AbsError).kind).toBe('network');
	});

	it('lists only the bookmarks in this book, in book order', async () => {
		global.fetch = jest.fn(() => reply(200, JSON.stringify({bookmarks: [
			{libraryItemId: 'a', time: 500, title: 'later', createdAt: 2},
			{libraryItemId: 'b', time: 10, title: 'other book', createdAt: 1},
			{libraryItemId: 'a', time: 20, title: 'earlier', createdAt: 3}
		]}))) as unknown as typeof fetch;
		const client = new AbsClient(creds, () => undefined);
		const list = await client.bookmarks('a');
		expect(list.map((b) => b.title)).toEqual(['earlier', 'later']);
	});

	it('adds and removes bookmarks at the right addresses', async () => {
		const calls: string[] = [];
		global.fetch = jest.fn((url: string, init: RequestInit) => {
			calls.push(init.method + ' ' + url.replace('https://abs.test', '') + (init.body ? ' ' + init.body : ''));
			return reply(200, '{"libraryItemId":"a","time":42,"title":"t","createdAt":1}');
		}) as unknown as typeof fetch;
		const client = new AbsClient(creds, () => undefined);
		await client.addBookmark('a', 42, 't');
		await client.removeBookmark('a', 42);
		expect(calls).toEqual(['POST /api/me/item/a/bookmark {"time":42,"title":"t"}', 'DELETE /api/me/item/a/bookmark/42']);
	});

	it('sends listening time as timeListened, the field the server records', async () => {
		let body = '';
		global.fetch = jest.fn((_url: string, init: RequestInit) => {
			body = String(init.body);
			return reply(200, 'OK', 'text/plain');
		}) as unknown as typeof fetch;
		const client = new AbsClient(creds, () => undefined);
		await client.syncSession('s', {currentTime: 120, timeListened: 15, duration: 3000});
		expect(JSON.parse(body)).toEqual({currentTime: 120, timeListened: 15, duration: 3000});
		await client.closeSession('s', {currentTime: 125, timeListened: 5, duration: 3000});
		expect(JSON.parse(body).timeListened).toBe(5);
	});
});
