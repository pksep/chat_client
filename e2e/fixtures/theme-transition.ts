import { createPinia } from 'pinia';
import { useThemeStore } from '../../src/stores/theme';

const theme = useThemeStore(createPinia());
theme.initTheme();
Object.assign(window, { theme });
