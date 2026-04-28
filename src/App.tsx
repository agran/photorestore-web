import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Suspense } from 'react';
import Layout from './components/Layout';
import Home from './routes/Home';
import Editor from './routes/Editor';
import About from './routes/About';
import { Toaster } from './components/ui/toaster';

function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<div className="flex h-screen items-center justify-center">Loading…</div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<Home />} />
            <Route path="/editor" element={<Editor />} />
            <Route path="/about" element={<About />} />
          </Route>
        </Routes>
      </Suspense>
      <Toaster />
    </BrowserRouter>
  );
}

export default App;
