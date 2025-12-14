import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const storageKey = 'piapav-theme';

const ThemeContext = createContext({
  theme: 'light',
  setTheme: () => {},
  toggleTheme: () => {},
});

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState('light');
  const hasUserPreference = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');

    if (stored === 'light' || stored === 'dark') {
      setThemeState(stored);
      hasUserPreference.current = true;
    } else {
      setThemeState(mediaQuery.matches ? 'dark' : 'light');
    }

    const handleSystemChange = (event) => {
      if (hasUserPreference.current) return;
      setThemeState(event.matches ? 'dark' : 'light');
    };

    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleSystemChange);
      return () => mediaQuery.removeEventListener('change', handleSystemChange);
    }

    mediaQuery.addListener(handleSystemChange);
    return () => mediaQuery.removeListener(handleSystemChange);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.body.dataset.theme = theme;
  }, [theme]);

  const applyTheme = useCallback((nextTheme) => {
    hasUserPreference.current = true;
    setThemeState(nextTheme);
    localStorage.setItem(storageKey, nextTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((current) => {
      const next = current === 'dark' ? 'light' : 'dark';
      hasUserPreference.current = true;
      localStorage.setItem(storageKey, next);
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      theme,
      setTheme: applyTheme,
      toggleTheme,
    }),
    [applyTheme, theme, toggleTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
