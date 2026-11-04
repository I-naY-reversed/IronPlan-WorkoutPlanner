import { Archivo_400Regular, Archivo_500Medium, Archivo_600SemiBold, Archivo_700Bold } from '@expo-google-fonts/archivo';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import { SofiaSans_400Regular, SofiaSans_500Medium, SofiaSans_600SemiBold, SofiaSans_700Bold } from '@expo-google-fonts/sofia-sans';
import { SofiaSansExtraCondensed_700Bold } from '@expo-google-fonts/sofia-sans-extra-condensed';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect } from 'react';

import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { Onboarding } from '@/components/onboarding';
import { Colors, type Surface } from '@/constants/theme';
import { DATABASE_NAME, migrate } from '@/db/database';
import { SurfaceContext } from '@/hooks/use-theme';
import { deviceLanguage, LanguageContext, setActiveLanguage } from '@/i18n';
import { ProfileProvider, useProfile } from '@/state/profile-context';

SplashScreen.preventAutoHideAsync();

function Gate() {
  const { profile } = useProfile();
  const scheme = useColorScheme();
  if (!profile) return null;
  const language = profile.language ?? deviceLanguage();
  setActiveLanguage(language);
  const surface: Surface =
    profile.appearance === 'dark' || (profile.appearance === 'system' && scheme === 'dark') ? 'steel' : 'chalk';
  const c = Colors[surface];
  const navigationTheme = {
    ...DefaultTheme,
    dark: surface === 'steel',
    colors: { ...DefaultTheme.colors, background: c.background, card: c.background, text: c.text, primary: c.accent, border: c.backgroundElement },
  };
  return (
    <SurfaceContext.Provider value={surface}>
      <LanguageContext.Provider value={language}>
        <ThemeProvider value={navigationTheme}>{profile.confirmed ? <AppTabs /> : <Onboarding />}</ThemeProvider>
      </LanguageContext.Provider>
    </SurfaceContext.Provider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    Archivo_400Regular,
    Archivo_500Medium,
    Archivo_600SemiBold,
    Archivo_700Bold,
    'ArchivoCompressed-Bold': require('@/assets/fonts/ArchivoCompressed-Bold.ttf'),
    SofiaSans_400Regular,
    SofiaSans_500Medium,
    SofiaSans_600SemiBold,
    SofiaSans_700Bold,
    SofiaSansExtraCondensed_700Bold,
  });

  useEffect(() => {
    if (loaded || error) SplashScreen.hideAsync();
  }, [loaded, error]);

  if (!loaded && !error) return null;

  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate}>
      <ProfileProvider>
        <Gate />
      </ProfileProvider>
    </SQLiteProvider>
  );
}
