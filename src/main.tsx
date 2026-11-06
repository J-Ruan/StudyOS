import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App, { ErrorBoundary } from './App';
import './style.css';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <a
        className="skip-link"
        href="#main-content"
        onClick={(e) => {
          e.preventDefault();
          document.getElementById('main-content')?.focus();
          document.getElementById('main-content')?.scrollIntoView();
        }}
      >
        跳到内容
      </a>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
