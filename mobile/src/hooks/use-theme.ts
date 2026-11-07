import { createContext, useContext } from 'react';

import { Colors, type Palette, type Surface } from '@/constants/theme';

export const SurfaceContext = createContext<Surface>('chalk');
export const PaletteContext = createContext<Palette>(Colors.plate.chalk);

export function useSurface(): Surface {
  return useContext(SurfaceContext);
}

export function useTheme(): Palette {
  return useContext(PaletteContext);
}
