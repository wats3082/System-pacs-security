import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { loadConfig } from './config';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root')!);

loadConfig()
  .then((config) => {
    root.render(
      <React.StrictMode>
        <App config={config} />
      </React.StrictMode>,
    );
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Configuration failed';
    root.render(
      <div className="config-error" role="alert">
        <strong>Platform configuration unavailable</strong>
        <p>{message}</p>
        <p>The application will not substitute mock data. Contact the platform administrator.</p>
      </div>,
    );
  });
