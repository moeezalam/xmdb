import { createRoot } from 'react-dom/client'
import App from './App.tsx'

// No StrictMode: it double-invokes effects, which would start two rAF loops and
// two WebGL contexts in development and make the animation timing lie.
createRoot(document.getElementById('root')!).render(<App />)
