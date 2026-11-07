import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, IBMPlexSans_700Bold } from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexSansCondensed_700Bold } from '@expo-google-fonts/ibm-plex-sans-condensed';
import { PTSerif_700Bold } from '@expo-google-fonts/pt-serif';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { useEffect } from 'react';

import { useColorScheme } from 'react-native';

import AppTabs from '@/components/app-tabs';
import { Onboarding } from '@/components/onboarding';
import { Colors, type Surface } from '@/constants/theme';
import { DATABASE_NAME, migrate } from '@/db/database';
import { PaletteContext, SurfaceContext } from '@/hooks/use-theme';
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
  const c = Colors[profile.colorTheme][surface];
  const navigationTheme = {
    ...DefaultTheme,
    dark: surface === 'steel',
    colors: { ...DefaultTheme.colors, background: c.background, card: c.background, text: c.text, primary: c.accent, border: c.backgroundElement },
  };
  return (
    <SurfaceContext.Provider value={surface}>
      <PaletteContext.Provider value={c}>
        <LanguageContext.Provider value={language}>
          <ThemeProvider value={navigationTheme}>{profile.confirmed ? <AppTabs /> : <Onboarding />}</ThemeProvider>
        </LanguageContext.Provider>
      </PaletteContext.Provider>
    </SurfaceContext.Provider>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSans_700Bold,
    IBMPlexSansCondensed_700Bold,
    PTSerif_700Bold,
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
