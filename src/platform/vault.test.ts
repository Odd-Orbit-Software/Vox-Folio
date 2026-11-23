import {webcrypto} from 'crypto';
import {TextDecoder, TextEncoder} from 'util';
import {seal, unseal, vaultGet, vaultMode, vaultSet} from './vault';

// jsdom lacks these; the TV's Chromium has them.
Object.assign(globalThis, {TextEncoder, TextDecoder});

const subtle = webcrypto.subtle as unknown as SubtleCrypto;
const random = (b: Uint8Array<ArrayBuffer>) => {
	webcrypto.getRandomValues(b);
};
const makeKey = () => subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']) as Promise<CryptoKey>;

describe('vault encryption', () => {
	test('a sealed value opens with the same key, and its text is unreadable', async () => {
		const key = await makeKey();
		const secret = {'voxfolio.profiles.v1': '{"refreshToken":"r-secret-123"}'};
		const sealed = await seal(subtle, key, secret, random);
		expect(JSON.stringify(sealed)).not.toContain('r-secret-123');
		expect(await unseal(subtle, key, sealed)).toEqual(secret);
	});

	test('each seal uses a fresh IV', async () => {
		const key = await makeKey();
		const a = await seal(subtle, key, {x: 1}, random);
		const b = await seal(subtle, key, {x: 1}, random);
		expect(a.iv).not.toBe(b.iv);
		expect(a.data).not.toBe(b.data);
	});

	test('altered data or another key is refused', async () => {
		const key = await makeKey();
		const sealed = await seal(subtle, key, {x: 1}, random);
		const bytes = Buffer.from(sealed.data, 'base64');
		bytes[0] ^= 0xff;
		await expect(unseal(subtle, key, {...sealed, data: bytes.toString('base64')})).rejects.toBeTruthy();
		await expect(unseal(subtle, await makeKey(), sealed)).rejects.toBeTruthy();
	});
});

test('before unlocking, reads and writes go to plain storage', () => {
	expect(vaultMode()).toBe('locked');
	vaultSet('voxfolio.test', 'v');
	expect(window.localStorage.getItem('voxfolio.test')).toBe('v');
	expect(vaultGet('voxfolio.test')).toBe('v');
	vaultSet('voxfolio.test', null);
	expect(vaultGet('voxfolio.test')).toBeNull();
});
