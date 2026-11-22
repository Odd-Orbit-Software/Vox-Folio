/* Focusable building blocks. Spotlight gives real DOM focus to `.spottable` nodes, so `:focus` styles
   the focus state (Chromium 79 has no :focus-visible). */

import Spotlight from '@enact/spotlight';
import Spottable from '@enact/spotlight/Spottable';
import type {SpottableProps} from '@enact/spotlight/Spottable';
import type {ButtonHTMLAttributes, ComponentType, HTMLAttributes, KeyboardEvent, ReactNode} from 'react';
import {useRef, useState} from 'react';

import {Keys} from '../platform/webos';

// Enact's typings drop the wrapped element's own props for string tags, so restore them.
const SpottableButton = Spottable('button') as unknown as ComponentType<ButtonHTMLAttributes<HTMLButtonElement> & SpottableProps>;
const SpottableDiv = Spottable('div') as unknown as ComponentType<HTMLAttributes<HTMLDivElement> & SpottableProps & {'data-default-focus'?: boolean; 'data-focus-key'?: string}>;

type Variant = 'primary' | 'secondary' | 'icon' | 'chip';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
	variant?: Variant;
	children?: ReactNode;
	spotlightId?: string;
	spotlightDisabled?: boolean;
	'data-spotlight-id'?: string;
}

export function Button ({variant = 'secondary', className = '', ...rest}: ButtonProps) {
	return <SpottableButton {...rest} className={'vf-btn vf-btn--' + variant + ' ' + className} />;
}

interface TileProps extends HTMLAttributes<HTMLDivElement> {
	children?: ReactNode;
	spotlightId?: string;
}

/** A focusable block (cover tiles, list rows). OK on the remote fires onClick. */
export function Tile ({className = '', ...rest}: TileProps) {
	return <SpottableDiv {...rest} className={'vf-tile ' + className} />;
}

interface TextFieldProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	onSubmit?: () => void;
	type?: 'text' | 'password' | 'url';
	placeholder?: string;
	spotlightId?: string;
	autoComplete?: string;
	/** Land here when the screen opens. */
	defaultFocus?: boolean;
}

/** A field you move onto with the D-pad and press OK to type in, so the TV keyboard doesn't pop up
    every time focus passes over it. Up/Down or Enter on the TV keyboard hands focus back to Spotlight. */
export function TextField ({label, value, onChange, onSubmit, type = 'text', placeholder, spotlightId, autoComplete, defaultFocus}: TextFieldProps) {
	const input = useRef<HTMLInputElement>(null);
	const [editing, setEditing] = useState(false);

	const startEditing = () => {
		setEditing(true);
		Spotlight.pause();
		if (input.current) input.current.focus();
	};

	const stopEditing = () => {
		setEditing(false);
		Spotlight.resume();
	};

	const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		const code = e.keyCode;
		if (code === Keys.ENTER || code === Keys.UP || code === Keys.DOWN || code === Keys.BACK) {
			e.preventDefault();
			e.stopPropagation();
			if (input.current) input.current.blur();
			stopEditing();
			if (spotlightId) Spotlight.focus(spotlightId);
			if (code === Keys.ENTER && onSubmit) onSubmit();
			else if (code === Keys.DOWN) Spotlight.move('down');
			else if (code === Keys.UP) Spotlight.move('up');
		}
	};

	return (
		<SpottableDiv
			className={'vf-field' + (editing ? ' vf-field--editing' : '')}
			spotlightId={spotlightId}
			data-default-focus={defaultFocus || undefined}
			onClick={startEditing}
		>
			<span className="vf-field__label">{label}</span>
			<input
				ref={input}
				className="vf-field__input"
				type={type === 'url' ? 'text' : type}
				inputMode={type === 'url' ? 'url' : undefined}
				value={value}
				placeholder={placeholder}
				tabIndex={-1}
				autoComplete={autoComplete}
				autoCapitalize="off"
				spellCheck={false}
				onChange={(e) => onChange(e.target.value)}
				onKeyDown={onInputKeyDown}
				onBlur={stopEditing}
			/>
		</SpottableDiv>
	);
}

interface CoverProps {
	url: string;
	title: string;
	author?: string;
	size: number;
	className?: string;
	/** Portrait style: the placeholder shows initials rather than a book cover. */
	round?: boolean;
}

function initials (name: string): string {
	const words = name.replace(/[^\p{L}\s-]/gu, ' ').split(/[\s-]+/).filter(Boolean);
	if (!words.length) return '';
	return (words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[words.length - 1][0]).toUpperCase();
}

const COVER_TINTS = ['#1F4E5A', '#8A3B2A', '#4F5A2E', '#4A2F4F', '#2E3F66', '#7A5518', '#3B4A4F', '#5E2B33'];

function tintFor (title: string): string {
	let h = 0;
	for (let i = 0; i < title.length; i++) h = (h * 31 + title.charCodeAt(i)) >>> 0;
	return COVER_TINTS[h % COVER_TINTS.length];
}

/** Book cover, falling back to a typographic placeholder when there's no image or it fails to load. */
export function Cover ({url, title, author, size, className = '', round}: CoverProps) {
	const [failed, setFailed] = useState(false);
	const [loaded, setLoaded] = useState(false);
	const style = {width: size + 'px', height: size + 'px'};
	if (url && !failed) {
		// Fades in once loaded rather than popping in line by line.
		return (
			<div className={'vf-cover ' + className} style={style}>
				<img src={url} alt="" className={loaded ? 'is-loaded' : ''} onLoad={() => setLoaded(true)} onError={() => setFailed(true)} />
			</div>
		);
	}
	if (round) {
		return (
			<div className={'vf-cover vf-cover--initials ' + className} style={{...style, background: tintFor(title), fontSize: Math.round(size * 0.34) + 'px'}}>
				<span aria-hidden="true">{initials(title)}</span>
			</div>
		);
	}
	return (
		<div className={'vf-cover vf-cover--placeholder ' + className} style={{...style, background: tintFor(title)}}>
			<div className="vf-cover__frame">
				<span className="vf-cover__author" style={{fontSize: Math.max(11, size * 0.055) + 'px'}}>{author}</span>
				<span className="vf-cover__title" style={{fontSize: Math.max(16, size * 0.12) + 'px'}}>{title}</span>
			</div>
		</div>
	);
}

/** Inline stroke icons (24×24 grid). */
export function Icon ({name, size = 30}: {name: IconName; size?: number}) {
	const common = {width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': true} as const;
	const stroke = {fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round'} as const;
	switch (name) {
		case 'podcast': return <svg {...common}><g {...stroke}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M9 21h6" /></g></svg>;
		case 'bookmark': return <svg {...common}><path {...stroke} d="M6 3h12v18l-6-4-6 4z" /></svg>;
		case 'close': return <svg {...common}><path {...stroke} d="M6 6l12 12M18 6L6 18" /></svg>;
		case 'queue': return <svg {...common}><path {...stroke} d="M4 6h12M4 11h12M4 16h7M16 14v6l5-3z" /></svg>;
		case 'filter': return <svg {...common}><path {...stroke} d="M4 5h16l-6 7.5V19l-4-2v-4.5z" /></svg>;
		case 'search': return <svg {...common}><g {...stroke}><circle cx="11" cy="11" r="7" /><path d="M20 20l-4-4" /></g></svg>;
		case 'authors': return <svg {...common}><g {...stroke}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></g></svg>;
		case 'settings': return <svg {...common}><g {...stroke}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9L7 7M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" /></g></svg>;
		case 'chevronRight': return <svg {...common}><path {...stroke} d="M9 6l6 6-6 6" /></svg>;
		case 'moon': return <svg {...common}><path {...stroke} d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>;
		case 'home': return <svg {...common}><path {...stroke} d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z" /></svg>;
		case 'library': return <svg {...common}><path {...stroke} d="M4 4h4v16H4zM10 4h4v16h-4zM16.5 5.5l3-0.8 3 14.5-3 0.8z" /></svg>;
		case 'series': return <svg {...common}><g {...stroke}><rect x="3" y="8" width="13" height="13" rx="2" /><path d="M7 4h12a2 2 0 0 1 2 2v12" /></g></svg>;
		case 'chapters': return <svg {...common}><g {...stroke}><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></g></svg>;
		case 'autoplay': return <svg {...common}><g {...stroke}><path d="M4 12h12" /><path d="M12 6l6 6-6 6" /><path d="M21 5v14" /></g></svg>;
		case 'play': return <svg {...common}><path d="M7 4l13 8-13 8z" fill="currentColor" /></svg>;
		case 'pause': return <svg {...common}><path d="M7 4h3.5v16H7zM13.5 4H17v16h-3.5z" fill="currentColor" /></svg>;
		case 'back30': return <svg {...common}><g {...stroke} strokeWidth={1.6}><path d="M4 12a8 8 0 1 0 2.3-5.7" /><path d="M4 3.5V8h4.5" /></g></svg>;
		case 'fwd30': return <svg {...common}><g {...stroke} strokeWidth={1.6}><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 3.5V8h-4.5" /></g></svg>;
		case 'prevChapter': return <svg {...common}><g {...stroke}><path d="M6 5v14" /><path d="M19 5L9 12l10 7z" /></g></svg>;
		case 'nextChapter': return <svg {...common}><g {...stroke}><path d="M18 5v14" /><path d="M5 5l10 7-10 7z" /></g></svg>;
		case 'chevronDown': return <svg {...common}><path {...stroke} d="M6 9l6 6 6-6" /></svg>;
		case 'back': return <svg {...common}><path {...stroke} d="M15 5l-7 7 7 7" /></svg>;
		case 'cloud': return <svg {...common}><g {...stroke}><path d="M7 18h10a4 4 0 0 0 .6-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z" /><path d="M9.5 13.5l2 2 3.5-4" /></g></svg>;
		case 'cloudOff': return <svg {...common}><g {...stroke}><path d="M7 18h10a4 4 0 0 0 1.5-7.7M15 6.4A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18" /><path d="M3 3l18 18" /></g></svg>;
		case 'check': return <svg {...common}><path {...stroke} strokeWidth={2.5} d="M5 12l5 5 9-10" /></svg>;
		case 'info': return <svg {...common}><g {...stroke}><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.5" /></g></svg>;
		case 'alert': return <svg {...common}><g {...stroke} strokeWidth={1.6}><path d="M4 4h4v16H4zM10 4h4v16h-4z" /><path d="M16.5 5.5l3-0.8 1.2 5.8" /><path d="M18 15l4 4M22 15l-4 4" /></g></svg>;
		default: return null;
	}
}

export type IconName = 'queue' | 'filter' | 'podcast' | 'bookmark' | 'close' | 'search' | 'authors' | 'settings' | 'chevronRight' | 'moon' | 'home' | 'library' | 'series' | 'chapters' | 'autoplay' | 'play' | 'pause' | 'back30' | 'fwd30' | 'prevChapter' | 'nextChapter' | 'chevronDown' | 'back' | 'cloud' | 'cloudOff' | 'check' | 'info' | 'alert';
