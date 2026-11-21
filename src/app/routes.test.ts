import {entry, pop, push, reset} from './routes';

test('push remembers where you were, pop goes back to it', () => {
	let stack = reset({name: 'library'});
	stack = push(stack, {name: 'details', itemId: 'a'}, 'book:a');
	expect(stack.map((e) => e.route.name)).toEqual(['library', 'details']);
	expect(stack[0].focusKey).toBe('book:a');
	stack = pop(stack);
	expect(stack).toEqual([{route: {name: 'library'}, focusKey: 'book:a'}]);
});

test('pop never empties the stack', () => {
	expect(pop([entry({name: 'home'})])).toEqual([entry({name: 'home'})]);
});
