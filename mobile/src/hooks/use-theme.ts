import { createContext, useContext } from 'react';

import { Colors, type Palette, type Surface } from '@/constants/theme';

export const SurfaceContext = createContext<Surface>('chalk');

export function useSurface(): Surface {
  return useContext(SurfaceContext);
}

export function useTheme(): Palette {
  return Colors[useContext(SurfaceContext)];
}
