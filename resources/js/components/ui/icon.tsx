import type { ComponentType } from 'react';

interface IconProps {
    iconNode?: ComponentType<{ className?: string }> | null;
    className?: string;
}

export function Icon({ iconNode: IconComponent, className }: IconProps) {
    if (!IconComponent) {
        return null;
    }

    return <IconComponent className={className} />;
}
