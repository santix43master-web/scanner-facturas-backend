import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const THEME_KEY = '@r21_theme';

export const themes = {
  dark: {
    mode: 'dark',
    background: '#0D1B2A',
    surface: '#1B2838',
    surfaceLight: '#0D1B2A',
    border: '#2A3F4F',
    primary: '#00BCD4',
    text: '#FFFFFF',
    textSecondary: '#78909C',
    textMuted: '#546E7A',
    danger: '#EF5350',
    success: '#66BB6A',
    warning: '#F9A825',
    warningText: '#FFE082',
    accent: '#00897B',
    cardTag: '#2A3F4F',
    cardTagText: '#B0BEC5',
    overlay: 'rgba(0,0,0,0.7)',
    headerBg: '#1B2838',
    inputBg: '#0D1B2A',
    tabInactive: '#78909C',
    tabActiveBg: '#00BCD4',
    tabActiveText: '#0D1B2A',
    totalCardText: '#0D1B2A',
    badgeText: '#0D1B2A',
    drawerBackground: '#1B2838',
  },
  light: {
    mode: 'light',
    background: '#F5F5F5',
    surface: '#FFFFFF',
    surfaceLight: '#E0E0E0',
    border: '#BDBDBD',
    primary: '#00838F',
    text: '#212121',
    textSecondary: '#616161',
    textMuted: '#9E9E9E',
    danger: '#D32F2F',
    success: '#388E3C',
    warning: '#F57F17',
    warningText: '#E65100',
    accent: '#00695C',
    cardTag: '#E0E0E0',
    cardTagText: '#616161',
    overlay: 'rgba(0,0,0,0.5)',
    headerBg: '#FFFFFF',
    inputBg: '#FFFFFF',
    tabInactive: '#9E9E9E',
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
  const theme = isDark ? themes.dark : themes.light;

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
    <ThemeContext.Provider value={{ theme, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
