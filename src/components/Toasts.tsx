export interface Toast {
	id: number;
	text: string;
}

/** Short status messages, bottom-left, never focusable. */
export function Toasts ({toasts}: {toasts: Toast[]}) {
	if (!toasts.length) return null;
	return (
		<div className="vf-toasts" role="status" aria-live="polite">
			{toasts.map((t) => <div key={t.id} className="vf-toast">{t.text}</div>)}
		</div>
	);
}
