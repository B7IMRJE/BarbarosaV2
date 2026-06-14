import { useContext } from 'react';
import { ThemeContext } from './index';

export function useTheme() {
    return useContext(ThemeContext);
}
