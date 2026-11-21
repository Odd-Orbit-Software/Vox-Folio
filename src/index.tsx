import {createRoot} from 'react-dom/client';

import App from './App/App';
import './styles/global.css';
import './styles/screens.css';

const appElement = <App />;

/* The UI is laid out at 1920×1080. The TV's web viewport is 1280×720 CSS px (on a 4K panel too), so
   scale the stage to fit, as Polaris does. Transforms keep Spotlight's geometry correct. */
function fitStage (root: HTMLElement) {
	const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
	root.style.transform = Math.abs(scale - 1) < 0.001 ? '' : 'scale(' + scale + ')';
}

if (typeof window !== 'undefined') {
	const root = document.getElementById('root')!;
	root.style.transformOrigin = '0 0';
	fitStage(root);
	window.addEventListener('resize', () => fitStage(root));
	createRoot(root).render(appElement);
}

export default appElement;
