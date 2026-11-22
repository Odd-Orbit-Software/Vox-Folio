import type {AbsError} from '../abs/client';
import {Button} from './controls';

/** One short line for an error, the same on every screen. */
export function errorTitle (error: AbsError): string {
	if (error.kind === 'network' || error.kind === 'timeout') return "Can't reach your server";
	if (error.kind === 'auth') return 'Please sign in again';
	if (error.kind === 'notFound') return 'Not found';
	return 'Something went wrong';
}

/** The browse screens' error state: a short title and Retry. */
export function ErrorPanel ({error, onRetry, className = ''}: {error: AbsError; onRetry: () => void; className?: string}) {
	return (
		<div className={'vf-errorpanel ' + className} data-vrow role="alert">
			<h2 className="vf-errorpanel__title">{errorTitle(error)}</h2>
			<Button variant="primary" data-default-focus onClick={onRetry}>Retry</Button>
		</div>
	);
}
