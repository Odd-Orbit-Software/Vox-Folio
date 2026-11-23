/* Encrypted storage for sign-in tokens.

   Profiles hold each account's access and refresh tokens. Rather than leave them readable in the app's
   localStorage files, they live in one encrypted entry (AES-256-GCM). The key is generated on the TV,
   created non-extractable (no script can read its raw value, including this one), and kept in the
   app's IndexedDB. Everything else (settings, caches) stays in plain localStorage.

   The vault is unlocked once before the app renders, so reads afterwards are synchronous from memory.
   Writes update memory at once and are encrypted and saved in order in the background.

   LG's Keymanager3 would hold the key in the TV's secure hardware, but it needs webOS TV 24 or later.
   Web Crypto works on every TV this app supports. If a device lacks it, the vault falls back to plain
   storage rather than signing everyone out, and Diagnostics says so. */

/** localStorage keys that hold secrets: they're moved into the vault. */
export const SECRET_KEYS = ['voxfolio.profiles.v1', 'voxfolio.credentials.v1'];

const VAULT_KEY = 'voxfolio.vault.v1';
const DB_NAME = 'voxfolio-keys';
const DB_STORE = 'keys';
const KEY_ID = 'vault-v1';

export type VaultMode = 'locked' | 'encrypted' | 'plain';

interface Sealed {
	v: 1;
	iv: string;
	data: string;
}

let mode: VaultMode = 'locked';
let values: Record<string, string> = {};
let key: CryptoKey | null = null;
let subtleApi: SubtleCrypto | null = null;
let writing: Promise<void> = Promise.resolve();

function toBase64 (bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return window.btoa(s);
}

function fromBase64 (b64: string): Uint8Array<ArrayBuffer> {
	const s = window.atob(b64);
	const out = new Uint8Array(new ArrayBuffer(s.length));
	for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
	return out;
}

/** Encrypt a JSON value with a fresh 96-bit IV. */
export async function seal (subtle: SubtleCrypto, k: CryptoKey, value: unknown, random: (b: Uint8Array<ArrayBuffer>) => void): Promise<Sealed> {
	const iv = new Uint8Array(new ArrayBuffer(12));
	random(iv);
	const plain = new TextEncoder().encode(JSON.stringify(value));
	const data = new Uint8Array(await subtle.encrypt({name: 'AES-GCM', iv}, k, plain));
	return {v: 1, iv: toBase64(iv), data: toBase64(data)};
}

/** Decrypt what `seal` produced. Throws if the key is wrong or the data was altered. */
export async function unseal<T> (subtle: SubtleCrypto, k: CryptoKey, sealed: Sealed): Promise<T> {
	const plain = await subtle.decrypt({name: 'AES-GCM', iv: fromBase64(sealed.iv)}, k, fromBase64(sealed.data));
	return JSON.parse(new TextDecoder().decode(new Uint8Array(plain))) as T;
}

function openDb (): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = window.indexedDB.open(DB_NAME, 1);
		req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function idb<T> (db: IDBDatabase, run: (store: IDBObjectStore) => IDBRequest, write: boolean): Promise<T> {
	return new Promise((resolve, reject) => {
		const req = run(db.transaction(DB_STORE, write ? 'readwrite' : 'readonly').objectStore(DB_STORE));
		req.onsuccess = () => resolve(req.result as T);
		req.onerror = () => reject(req.error);
	});
}

/** This TV's vault key: read from IndexedDB, or generated (non-extractable) the first time. */
async function loadOrCreateKey (subtle: SubtleCrypto): Promise<{key: CryptoKey; created: boolean}> {
	const db = await openDb();
	try {
		const found = await idb<CryptoKey | undefined>(db, (s) => s.get(KEY_ID), false);
		if (found) return {key: found, created: false};
		const made = await subtle.generateKey({name: 'AES-GCM', length: 256}, false, ['encrypt', 'decrypt']);
		await idb(db, (s) => s.put(made, KEY_ID), true);
		return {key: made, created: true};
	} finally {
		db.close();
	}
}

function persist (): void {
	const snapshot = {...values};
	writing = writing.then(async () => {
		if (!subtleApi || !key) return;
		const sealed = await seal(subtleApi, key, snapshot, (b) => window.crypto.getRandomValues(b));
		window.localStorage.setItem(VAULT_KEY, JSON.stringify(sealed));
	}).catch(() => undefined);
}

/** Open the vault before the app starts. Moves any plaintext secrets into it. Never throws. */
export async function unlockVault (): Promise<VaultMode> {
	try {
		const subtle = window.crypto && window.crypto.subtle;
		if (!subtle || !window.indexedDB) throw new Error('Web Crypto or IndexedDB unavailable');
		const {key: k} = await loadOrCreateKey(subtle);
		subtleApi = subtle;
		key = k;
		const raw = window.localStorage.getItem(VAULT_KEY);
		try {
			values = raw ? await unseal<Record<string, string>>(subtle, k, JSON.parse(raw) as Sealed) : {};
		} catch {
			// A vault this key can't open (the key store was cleared): start afresh. People sign in again.
			values = {};
		}
		mode = 'encrypted';
		// Move plaintext secrets in, then remove the plaintext once the encrypted copy is written.
		const plain = SECRET_KEYS.filter((k2) => window.localStorage.getItem(k2) !== null);
		if (plain.length) {
			plain.forEach((k2) => {
				if (values[k2] === undefined) values[k2] = window.localStorage.getItem(k2) as string;
			});
			persist();
			await writing;
			if (window.localStorage.getItem(VAULT_KEY)) plain.forEach((k2) => window.localStorage.removeItem(k2));
		}
	} catch {
		mode = 'plain';
	}
	return mode;
}

/** Read a secret. Before unlocking (unit tests) or without Web Crypto, this is plain localStorage. */
export function vaultGet (name: string): string | null {
	if (mode !== 'encrypted') {
		try {
			return window.localStorage.getItem(name);
		} catch {
			return null;
		}
	}
	return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : null;
}

/** Store (or with null, delete) a secret. */
export function vaultSet (name: string, value: string | null): void {
	if (mode !== 'encrypted') {
		try {
			if (value === null) window.localStorage.removeItem(name);
			else window.localStorage.setItem(name, value);
		} catch {
			// Storage unavailable: the change still applies for this run.
		}
		return;
	}
	if (value === null) delete values[name];
	else values[name] = value;
	persist();
}

/** Whether sign-ins are encrypted on this device (shown in Diagnostics). */
export function vaultMode (): VaultMode {
	return mode;
}

/** Wait for pending encrypted writes (before the app closes). */
export function vaultFlush (): Promise<void> {
	return writing;
}
