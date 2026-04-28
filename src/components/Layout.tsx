import { Outlet } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import { useEffect } from 'react';
import { useSettingsStore, applyTheme } from '@/store/settingsStore';

export default function Layout() {
  const { theme } = useSettingsStore();

  useEffect(() => {
    applyTheme(theme);
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (theme === 'system') applyTheme('system');
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  return (
    <div className="grid min-h-screen" style={{ gridTemplateRows: 'auto 1fr auto' }}>
      <Header />
      <main className="min-h-0">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
