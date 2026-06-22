import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@r21_theme';

export const themes = {
  dark: {
    mode: 'dark',
    background: '#0D0D0D',
    surface: '#1A1A1A',
    surfaceLight: '#262626',
    border: '#2D2D2D',
    primary: '#00BCD4',
    text: '#FFFFFF',
    textSecondary: '#888888',
    textMuted: '#555555',
    danger: '#EF5350',
    success: '#66BB6A',
    warning: '#F9A825',
    warningText: '#FFE082',
    accent: '#00BCD4',
    cardTag: '#2D2D2D',
    cardTagText: '#AAAAAA',
    overlay: 'rgba(0,0,0,0.8)',
    headerBg: '#1A1A1A',
    inputBg: '#0D0D0D',
    tabInactive: '#555555',
    tabActiveBg: '#00BCD4',
    tabActiveText: '#0D0D0D',
    totalCardText: '#FFFFFF',
    badgeText: '#0D0D0D',
    drawerBackground: '#1A1A1A',
  },
  light: {
    mode: 'light',
    background: '#F5F5F5',
    surface: '#FFFFFF',
    surfaceLight: '#EEEEEE',
    border: '#E0E0E0',
    primary: '#00838F',
    text: '#1A1A1A',
    textSecondary: '#666666',
    textMuted: '#999999',
    danger: '#D32F2F',
    success: '#388E3C',
    warning: '#F57F17',
    warningText: '#E65100',
    accent: '#00838F',
    cardTag: '#EEEEEE',
    cardTagText: '#666666',
    overlay: 'rgba(0,0,0,0.4)',
    headerBg: '#FFFFFF',
    inputBg: '#FFFFFF',
    tabInactive: '#999999',
    tabActiveBg: '#00838F',
    tabActiveText: '#FFFFFF',
    totalCardText: '#FFFFFF',
    badgeText: '#FFFFFF',
    drawerBackground: '#FFFFFF',
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
