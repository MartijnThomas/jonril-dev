import type { LucideIcon } from 'lucide-react';
import * as LucideIcons from 'lucide-react';
import { Check, ChevronsUpDown } from 'lucide-react';
import {
    BookOpen,
    Briefcase,
    Building2,
    Calendar1,
    CalendarDays,
    CalendarRange,
    CalendarSync,
    FileText,
    Folder,
    KanbanSquare,
    Layers,
    Lightbulb,
    NotebookPen,
    Rocket,
    Star,
    Wrench,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Input } from '@/components/ui/input';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export const WORKSPACE_ICON_OPTIONS = [
    { value: 'calendar_days', label: 'Calendar Days', icon: CalendarDays },
    { value: 'calendar_range', label: 'Calendar Range', icon: CalendarRange },
    { value: 'calendar_sync', label: 'Calendar Sync', icon: CalendarSync },
    { value: 'calendar_1', label: 'Calendar 1', icon: Calendar1 },
    { value: 'briefcase', label: 'Briefcase', icon: Briefcase },
    { value: 'building', label: 'Building', icon: Building2 },
    { value: 'folder', label: 'Folder', icon: Folder },
    { value: 'file', label: 'File', icon: FileText },
    { value: 'book', label: 'Book', icon: BookOpen },
    { value: 'notebook', label: 'Notebook', icon: NotebookPen },
    { value: 'layers', label: 'Layers', icon: Layers },
    { value: 'kanban', label: 'Kanban', icon: KanbanSquare },
    { value: 'star', label: 'Star', icon: Star },
    { value: 'rocket', label: 'Rocket', icon: Rocket },
    { value: 'idea', label: 'Idea', icon: Lightbulb },
    { value: 'tools', label: 'Tools', icon: Wrench },
] as const;

export type WorkspaceIconName = (typeof WORKSPACE_ICON_OPTIONS)[number]['value'];

export const DEFAULT_WORKSPACE_ICON: WorkspaceIconName = 'briefcase';

const ICON_BY_NAME: Record<WorkspaceIconName, LucideIcon> = WORKSPACE_ICON_OPTIONS.reduce(
    (carry, option) => {
        carry[option.value] = option.icon;
        return carry;
    },
    {} as Record<WorkspaceIconName, LucideIcon>,
);

export function getWorkspaceIconComponent(iconName: string | null | undefined): LucideIcon {
    if (!iconName) {
        return ICON_BY_NAME[DEFAULT_WORKSPACE_ICON];
    }

    return (
        ICON_BY_NAME[iconName as WorkspaceIconName] ??
        resolveLucideIconByRawName(iconName) ??
        ICON_BY_NAME[DEFAULT_WORKSPACE_ICON]
    );
}

function normalizeIconInput(iconName: string): string {
    return iconName.trim().toLowerCase().replaceAll('-', '_');
}

function resolveLucideIconByRawName(iconName: string): LucideIcon | null {
    const normalized = normalizeIconInput(iconName);
    if (!normalized || !/^[a-z][a-z0-9_]*$/.test(normalized)) {
        return null;
    }

    const pascalName = normalized
        .split('_')
        .filter(Boolean)
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1))
        .join('');

    const candidate = (LucideIcons as Record<string, unknown>)[pascalName];
    if (
        !candidate ||
        (typeof candidate !== 'function' && typeof candidate !== 'object')
    ) {
        return null;
    }

    return candidate as LucideIcon;
}

export function getLucideIconComponent(
    iconName: string | null | undefined,
    fallbackIcon: LucideIcon,
): LucideIcon {
    if (!iconName) {
        return fallbackIcon;
    }

    const predefined = ICON_BY_NAME[iconName as WorkspaceIconName];
    if (predefined) {
        return predefined;
    }

    return resolveLucideIconByRawName(iconName) ?? fallbackIcon;
}

type IconPickerProps = {
    value: string | null | undefined;
    onValueChange: (value: string) => void;
    disabled?: boolean;
    className?: string;
    fallbackValue?: string;
};

export function IconPicker({
    value,
    onValueChange,
    disabled,
    className,
    fallbackValue,
}: IconPickerProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const hasExplicitValue = typeof value === 'string' && value.trim() !== '';
    const effectiveValue = hasExplicitValue
        ? value
        : (fallbackValue ?? DEFAULT_WORKSPACE_ICON);

    const selected = useMemo(() => {
        const predefined = WORKSPACE_ICON_OPTIONS.find(
            (option) => option.value === effectiveValue,
        );
        if (predefined) {
            return predefined;
        }

        const customValue = normalizeIconInput(effectiveValue ?? '');
        const customIcon = customValue ? resolveLucideIconByRawName(customValue) : null;
        if (customIcon) {
            return {
                value: customValue as WorkspaceIconName,
                label: customValue,
                icon: customIcon,
            };
        }

        return WORKSPACE_ICON_OPTIONS.find(
            (option) => option.value === DEFAULT_WORKSPACE_ICON,
        )!;
    }, [effectiveValue]);

    const SelectedIcon = selected?.icon ?? getWorkspaceIconComponent(DEFAULT_WORKSPACE_ICON);
    const normalizedQuery = normalizeIconInput(query);
    const filteredOptions = WORKSPACE_ICON_OPTIONS.filter((option) => {
        const haystack = `${option.label} ${option.value}`.toLowerCase();
        return haystack.includes(normalizedQuery);
    });
    const canUseCustomQuery =
        normalizedQuery.length > 0 &&
        /^[a-z][a-z0-9_]*$/.test(normalizedQuery) &&
        Boolean(resolveLucideIconByRawName(normalizedQuery)) &&
        !WORKSPACE_ICON_OPTIONS.some((option) => option.value === normalizedQuery);

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <Button
                    type="button"
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    disabled={disabled}
                    className={cn('w-full justify-between', className)}
                >
                    <span className="flex items-center gap-2">
                        <Icon iconNode={SelectedIcon} className="size-4" />
                        <span className={cn(!selected && 'text-muted-foreground')}>
                            {selected?.label ?? 'Select icon'}
                        </span>
                    </span>
                    <ChevronsUpDown className="size-4 opacity-60" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-60 overflow-hidden p-0" align="start">
                <div className="border-b p-2">
                    <Input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search icons or type snake_case..."
                        className="h-9"
                    />
                </div>
                <div
                    className="max-h-56 overflow-y-auto overscroll-contain p-1 [touch-action:pan-y]"
                    style={{ WebkitOverflowScrolling: 'touch' }}
                    onWheelCapture={(event) => event.stopPropagation()}
                    onTouchMoveCapture={(event) => event.stopPropagation()}
                >
                    {canUseCustomQuery && (
                        <button
                            type="button"
                            className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                            onClick={() => {
                                onValueChange(normalizedQuery);
                                setOpen(false);
                            }}
                        >
                            <span className="text-muted-foreground">Use custom:</span>
                            <span className="font-medium">{normalizedQuery}</span>
                        </button>
                    )}

                    {filteredOptions.map((option) => {
                        const Icon = option.icon;
                        const isSelected = selected?.value === option.value;

                        return (
                            <button
                                key={option.value}
                                type="button"
                                className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
                                onClick={() => {
                                    onValueChange(option.value);
                                    setOpen(false);
                                }}
                            >
                                <Icon className="size-4" />
                                <span>{option.label}</span>
                                <Check
                                    className={cn(
                                        'ml-auto size-4',
                                        isSelected ? 'opacity-100' : 'opacity-0',
                                    )}
                                />
                            </button>
                        );
                    })}

                    {filteredOptions.length === 0 && !canUseCustomQuery && (
                        <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                            No icon found.
                        </p>
                    )}
                </div>
            </PopoverContent>
        </Popover>
    );
}
