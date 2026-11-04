import type { Sport } from '@/domain/sports';

export function sessionTabIcon(sport: Sport | undefined): number {
  switch (sport) {
    case 'boxing':
      return require('@/assets/images/tabIcons/session_mma.png');
    case 'muay_thai':
      return require('@/assets/images/tabIcons/session_martial_arts.png');
    case 'wrestling':
      return require('@/assets/images/tabIcons/session_kabaddi.png');
    default:
      return require('@/assets/images/tabIcons/session.png');
  }
}
