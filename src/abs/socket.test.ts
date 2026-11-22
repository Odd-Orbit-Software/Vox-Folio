import {parsePacket, socketUrl} from './socket';

describe('live socket packets', () => {
	test('decodes the packets we use', () => {
		expect(parsePacket('0{"sid":"x","pingInterval":25000}').kind).toBe('open');
		expect(parsePacket('2').kind).toBe('ping');
		expect(parsePacket('40{"sid":"y"}').kind).toBe('connect');
		expect(parsePacket('41').kind).toBe('disconnect');
		const e = parsePacket('42["user_item_progress_updated",{"id":"p","data":{"currentTime":5}}]');
		expect(e.kind).toBe('event');
		expect(e.event).toBe('user_item_progress_updated');
		expect((e.data as {id: string}).id).toBe('p');
		expect(parsePacket('42not json').kind).toBe('other');
	});

	test('builds the socket address, keeping a subpath', () => {
		expect(socketUrl('https://abs.example.com')).toBe('wss://abs.example.com/socket.io/?EIO=4&transport=websocket');
		expect(socketUrl('http://10.0.0.5:13378/audiobookshelf/')).toBe('ws://10.0.0.5:13378/audiobookshelf/socket.io/?EIO=4&transport=websocket');
	});
});
