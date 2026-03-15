import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import MobileApp from './mobile/MobileApp';
import { isMobile } from './mobile/hooks/usePlatform';
import './styles/index.css';

const RootApp = isMobile() ? MobileApp : App;

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <RootApp />
  </React.StrictMode>
);

// Register tile cache service worker
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./tile-sw.js').catch(() => {});
}
