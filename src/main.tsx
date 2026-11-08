import React from 'react';
import ReactDOM from 'react-dom/client';
import {PwaUpdate} from './pwa';
import App from './App';
import './style.scss';

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/><PwaUpdate/></React.StrictMode>);
