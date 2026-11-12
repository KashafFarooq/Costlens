import './style.css';
import { renderApp } from './ui/app.js';

renderApp(document.querySelector('#app'));
window.addEventListener('error', () => {
  const notice = document.querySelector('[data-testid="notice"]');
  if (notice) notice.textContent = 'Something went wrong. Your current in-memory data is still available.';
});
window.addEventListener('unhandledrejection', () => {
  const notice = document.querySelector('[data-testid="notice"]');
  if (notice) notice.textContent = 'Something went wrong. Please retry the operation.';
});
