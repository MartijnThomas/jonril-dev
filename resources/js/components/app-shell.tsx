import { usePage } from '@inertiajs/react';
import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { SidebarProvider } from '@/components/ui/sidebar';

type Props = {
    children: ReactNode;
    variant?: 'header' | 'sidebar';
};

export function AppShell({ children, variant = 'header' }: Props) {
    const isOpen = usePage().props.sidebarOpen;
    const cookieOpen = useMemo(() => {
        if (typeof document === 'undefined') {
            return null;
        }

        const value = document.cookie
            .split('; ')
            .find((part) => part.startsWith('sidebar_state='))
            ?.split('=')[1];

        if (value === 'true') return true;
        if (value === 'false') return false;

        return null;
    }, []);
    const [leftSidebarOpen, setLeftSidebarOpen] = useState<boolean>(
        cookieOpen ?? isOpen,
    );

    if (variant === 'header') {
        return (
            <div className="flex min-h-screen w-full flex-col">{children}</div>
        );
    }

    return (
        <SidebarProvider open={leftSidebarOpen} onOpenChange={setLeftSidebarOpen}>
            {children}
        </SidebarProvider>
    );
}
