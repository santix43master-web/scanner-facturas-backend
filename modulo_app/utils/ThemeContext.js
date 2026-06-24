import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@r21_theme';

export const themes = {
  dark: {
    mode: 'dark',
    background: '#0A1628',
    surface: '#182A42',
    surfaceLight: '#1F3550',
    border: '#2A4A6A',
    primary: '#00E5FF',
    primaryDark: '#00B8D4',
    accent: '#FFD54F',
    text: '#FFFFFF',
    textSecondary: '#B0C4DE',
    textMuted: '#6B8CAA',
    danger: '#FF5252',
    success: '#69F0AE',
    warning: '#FFD740',
    warningBg: '#3A2A00',
    warningText: '#FFD740',
    cardTag: '#1F3550',
    cardTagText: '#8AB4D6',
    overlay: 'rgba(0,0,0,0.7)',
    headerBg: '#0D1E34',
    inputBg: '#0A1628',
    tabInactive: '#5A7A9A',
    tabActiveBg: 'rgba(0,229,255,0.15)',
    tabActiveText: '#00E5FF',
    totalCardText: '#0A1628',
    badgeText: '#0A1628',
    drawerBg: '#0D1E34',
    shadow: '#00E5FF',
  },
  light: {
    mode: 'light',
    background: '#F0F4F8',
    surface: '#FFFFFF',
    surfaceLight: '#F8FAFC',
    border: '#DDE3EA',
    primary: '#0288D1',
    primaryDark: '#01579B',
    accent: '#F57C00',
    text: '#1A2332',
    textSecondary: '#546E7A',
    textMuted: '#90A4AE',
    danger: '#D32F2F',
    success: '#2E7D32',
    warning: '#F57F17',
    warningBg: '#FFF8E1',
    warningText: '#E65100',
    cardTag: '#F0F4F8',
    cardTagText: '#546E7A',
    overlay: 'rgba(0,0,0,0.4)',
    headerBg: '#FFFFFF',
    inputBg: '#FFFFFF',
    tabInactive: '#90A4AE',
    tabActiveBg: 'rgba(2,136,209,0.1)',
    tabActiveText: '#0288D1',
    totalCardText: '#FFFFFF',
    badgeText: '#FFFFFF',
    drawerBg: '#FFFFFF',
    shadow: '#0288D1',
  },
};

const ThemeContext = createContext();

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true);

  useEffect(() => {
    (async () => {
      const saved = await AsyncStorage.getItem(THEME_KEY);
      if (saved !== null) setIsDark(saved === 'dark');
    })();
  }, []);

  const toggleTheme = async () => {
    const next = !isDark;
    setIsDark(next);
    await AsyncStorage.setItem(THEME_KEY, next ? 'dark' : 'light');
  };

  return (
    <ThemeContext.Provider value={{ theme: isDark ? themes.dark : themes.light, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
