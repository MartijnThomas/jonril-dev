import { createInertiaApp } from '@inertiajs/react';
import { resolvePageComponent } from 'laravel-vite-plugin/inertia-helpers';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster } from '@/components/ui/sonner';
import '../css/app.css';
import { initializeTheme } from '@/hooks/use-appearance';
import { PREFETCH_CACHE_FOR, PREFETCH_HOVER_DELAY_MS } from '@/lib/prefetch';

const appName = import.meta.env.VITE_APP_NAME || 'Laravel';

createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    resolve: (name) =>
        resolvePageComponent(
            `./pages/${name}.tsx`,
            import.meta.glob('./pages/**/*.tsx'),
        ),
    setup({ el, App, props }) {
        const root = createRoot(el);

        root.render(
            <StrictMode>
                <App {...props} />
                <Toaster position="bottom-right" />
            </StrictMode>,
        );
    },
    progress: {
        color: '#4B5563',
    },
    defaults: {
        prefetch: {
            cacheFor: PREFETCH_CACHE_FOR,
            hoverDelay: PREFETCH_HOVER_DELAY_MS,
        },
    },
});

// This will set light / dark mode on load...
initializeTheme();

const detectedTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

if (typeof detectedTimeZone === 'string' && detectedTimeZone.trim() !== '') {
    const oneYearInSeconds = 60 * 60 * 24 * 365;
    document.cookie = `user_tz=${encodeURIComponent(detectedTimeZone)}; Path=/; Max-Age=${oneYearInSeconds}; SameSite=Lax`;
}
