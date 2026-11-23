import {wheelStep} from './pointer';
import {Keys} from './webos';

test('the wheel steps once per notch, not faster than the throttle', () => {
	expect(wheelStep(10, 1000)).toBeNull();
	expect(wheelStep(100, 1000)).toBe(Keys.DOWN);
	expect(wheelStep(-100, 1000)).toBe(Keys.UP);
	expect(wheelStep(100, 50)).toBeNull();
});
