import Spotlight from '@enact/spotlight';
import SpotlightContainerDecorator from '@enact/spotlight/SpotlightContainerDecorator';
import type {ComponentType, HTMLAttributes, ReactNode} from 'react';
import {useEffect} from 'react';

type ContainerProps = HTMLAttributes<HTMLDivElement> & {spotlightId?: string; spotlightRestrict?: string};

const Container = SpotlightContainerDecorator(
	{enterTo: 'default-element', defaultElement: '[data-default-focus]', restrict: 'self-first'},
	'div'
) as unknown as ComponentType<ContainerProps>;

const PanelContainer = SpotlightContainerDecorator(
	{enterTo: 'default-element', defaultElement: '[data-default-focus]', restrict: 'self-only'},
	'div'
) as unknown as ComponentType<ContainerProps>;

/** Focus the element with `data-focus-key=key`, else the container's default element. */
export function focusWithin (containerId: string, key?: string | null): void {
	// Target nodes directly: Spotlight.focus(containerId) is a no-op when focus is already inside it.
	const scope = '[data-spotlight-id="' + containerId + '"] ';
	const candidates = [
		key ? document.querySelector(scope + '[data-focus-key="' + key + '"]') : null,
		document.querySelector(scope + '[data-default-focus]')
	];
	for (const node of candidates) {
		if (node && Spotlight.focus(node as unknown as string)) return;
	}
	Spotlight.focus(containerId);
}

interface ScreenProps {
	id: string;
	className?: string;
	/** Restore focus to this item on mount (Back returns to the item you left). */
	restoreKey?: string | null;
	/** Re-run the initial focus when this changes, e.g. once data has loaded. */
	focusDeps?: unknown[];
	children: ReactNode;
}

/** One screen. Focus lands on `[data-default-focus]` (or `restoreKey`) when it opens. */
export function ScreenContainer ({id, className = '', restoreKey, focusDeps = [], children}: ScreenProps) {
	useEffect(() => {
		const t = window.setTimeout(() => focusWithin(id, restoreKey), 0);
		return () => window.clearTimeout(t);
	}, focusDeps); // eslint-disable-line react-hooks/exhaustive-deps

	return (
		<Container spotlightId={id} className={'vf-screen ' + className}>
			{children}
		</Container>
	);
}

/** A panel over a screen: focus stays inside it until it closes. */
export function PanelScope ({id, className = '', children}: {id: string; className?: string; children: ReactNode}) {
	useEffect(() => {
		const t = window.setTimeout(() => Spotlight.focus(id), 0);
		return () => window.clearTimeout(t);
	}, [id]);
	return <PanelContainer spotlightId={id} className={className}>{children}</PanelContainer>;
}
