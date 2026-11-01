import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import './styles.css';

class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) return <main className="p-8 text-rose-300"><h1>Simulator could not start</h1><pre className="whitespace-pre-wrap">{this.state.error.message}</pre><button onClick={() => window.location.reload()}>Reload simulator</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')).render(<ErrorBoundary><App /></ErrorBoundary>);
