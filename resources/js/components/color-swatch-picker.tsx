export const COLOR_SWATCH_OPTIONS = [
    'black',
    'slate',
    'zinc',
    'stone',
    'red',
    'orange',
    'amber',
    'yellow',
    'lime',
    'green',
    'emerald',
    'teal',
    'cyan',
    'sky',
    'blue',
    'indigo',
    'violet',
    'purple',
    'fuchsia',
    'pink',
    'rose',
] as const;

type ColorOption = (typeof COLOR_SWATCH_OPTIONS)[number];
export type ColorSwatchValue = ColorOption | 'default';

export const COLOR_SWATCH_BG_CLASS: Record<ColorOption, string> = {
    black: 'bg-black',
    slate: 'bg-slate-600',
    zinc: 'bg-zinc-600',
    stone: 'bg-stone-600',
    red: 'bg-red-600',
    orange: 'bg-orange-600',
    amber: 'bg-amber-600',
    yellow: 'bg-yellow-500',
    lime: 'bg-lime-600',
    green: 'bg-green-600',
    emerald: 'bg-emerald-600',
    teal: 'bg-teal-600',
    cyan: 'bg-cyan-600',
    sky: 'bg-sky-600',
    blue: 'bg-blue-600',
    indigo: 'bg-indigo-600',
    violet: 'bg-violet-600',
    purple: 'bg-purple-600',
    fuchsia: 'bg-fuchsia-600',
    pink: 'bg-pink-600',
    rose: 'bg-rose-600',
};

export const COLOR_SWATCH_DARK_BG_CLASS: Record<ColorOption, string> = {
    black: 'bg-zinc-200',
    slate: 'bg-slate-400',
    zinc: 'bg-zinc-400',
    stone: 'bg-stone-400',
    red: 'bg-red-400',
    orange: 'bg-orange-400',
    amber: 'bg-amber-400',
    yellow: 'bg-yellow-400',
    lime: 'bg-lime-400',
    green: 'bg-green-400',
    emerald: 'bg-emerald-400',
    teal: 'bg-teal-400',
    cyan: 'bg-cyan-400',
    sky: 'bg-sky-400',
    blue: 'bg-blue-400',
    indigo: 'bg-indigo-400',
    violet: 'bg-violet-400',
    purple: 'bg-purple-400',
    fuchsia: 'bg-fuchsia-400',
    pink: 'bg-pink-400',
    rose: 'bg-rose-400',
};

export const COLOR_SWATCH_THEME_BG_CLASS: Record<ColorOption, string> = {
    black: 'bg-black dark:bg-zinc-200',
    slate: 'bg-slate-600 dark:bg-slate-400',
    zinc: 'bg-zinc-600 dark:bg-zinc-400',
    stone: 'bg-stone-600 dark:bg-stone-400',
    red: 'bg-red-600 dark:bg-red-400',
    orange: 'bg-orange-600 dark:bg-orange-400',
    amber: 'bg-amber-600 dark:bg-amber-400',
    yellow: 'bg-yellow-500 dark:bg-yellow-400',
    lime: 'bg-lime-600 dark:bg-lime-400',
    green: 'bg-green-600 dark:bg-green-400',
    emerald: 'bg-emerald-600 dark:bg-emerald-400',
    teal: 'bg-teal-600 dark:bg-teal-400',
    cyan: 'bg-cyan-600 dark:bg-cyan-400',
    sky: 'bg-sky-600 dark:bg-sky-400',
    blue: 'bg-blue-600 dark:bg-blue-400',
    indigo: 'bg-indigo-600 dark:bg-indigo-400',
    violet: 'bg-violet-600 dark:bg-violet-400',
    purple: 'bg-purple-600 dark:bg-purple-400',
    fuchsia: 'bg-fuchsia-600 dark:bg-fuchsia-400',
    pink: 'bg-pink-600 dark:bg-pink-400',
    rose: 'bg-rose-600 dark:bg-rose-400',
};

export const COLOR_SWATCH_THEME_BORDER_CLASS: Record<ColorOption, string> = {
    black: 'border-black dark:border-zinc-200',
    slate: 'border-slate-600 dark:border-slate-400',
    zinc: 'border-zinc-600 dark:border-zinc-400',
    stone: 'border-stone-600 dark:border-stone-400',
    red: 'border-red-600 dark:border-red-400',
    orange: 'border-orange-600 dark:border-orange-400',
    amber: 'border-amber-600 dark:border-amber-400',
    yellow: 'border-yellow-500 dark:border-yellow-400',
    lime: 'border-lime-600 dark:border-lime-400',
    green: 'border-green-600 dark:border-green-400',
    emerald: 'border-emerald-600 dark:border-emerald-400',
    teal: 'border-teal-600 dark:border-teal-400',
    cyan: 'border-cyan-600 dark:border-cyan-400',
    sky: 'border-sky-600 dark:border-sky-400',
    blue: 'border-blue-600 dark:border-blue-400',
    indigo: 'border-indigo-600 dark:border-indigo-400',
    violet: 'border-violet-600 dark:border-violet-400',
    purple: 'border-purple-600 dark:border-purple-400',
    fuchsia: 'border-fuchsia-600 dark:border-fuchsia-400',
    pink: 'border-pink-600 dark:border-pink-400',
    rose: 'border-rose-600 dark:border-rose-400',
};

export const COLOR_SWATCH_TEXT_CLASS: Record<ColorOption, string> = {
    black: 'text-black dark:text-zinc-300',
    slate: 'text-slate-600 dark:text-slate-400',
    zinc: 'text-zinc-600 dark:text-zinc-400',
    stone: 'text-stone-600 dark:text-stone-400',
    red: 'text-red-600 dark:text-red-400',
    orange: 'text-orange-600 dark:text-orange-400',
    amber: 'text-amber-600 dark:text-amber-400',
    yellow: 'text-yellow-500 dark:text-yellow-400',
    lime: 'text-lime-600 dark:text-lime-400',
    green: 'text-green-600 dark:text-green-400',
    emerald: 'text-emerald-600 dark:text-emerald-400',
    teal: 'text-teal-600 dark:text-teal-400',
    cyan: 'text-cyan-600 dark:text-cyan-400',
    sky: 'text-sky-600 dark:text-sky-400',
    blue: 'text-blue-600 dark:text-blue-400',
    indigo: 'text-indigo-600 dark:text-indigo-400',
    violet: 'text-violet-600 dark:text-violet-400',
    purple: 'text-purple-600 dark:text-purple-400',
    fuchsia: 'text-fuchsia-600 dark:text-fuchsia-400',
    pink: 'text-pink-600 dark:text-pink-400',
    rose: 'text-rose-600 dark:text-rose-400',
};

type ColorSwatchPickerProps = {
    value: string | null | undefined;
    onValueChange: (value: string) => void;
    options?: readonly ColorOption[];
    includeDefault?: boolean;
    defaultValue?: string;
    defaultLabel?: string;
};

export function getColorSwatchPreviewClasses(value: string | null | undefined): {
    light: string;
    dark: string;
} {
    const normalized = (value ?? 'default') as ColorSwatchValue;
    if (normalized === 'default' || !COLOR_SWATCH_BG_CLASS[normalized as ColorOption]) {
        return {
            light: 'bg-zinc-600',
            dark: 'bg-zinc-200',
        };
    }

    const color = normalized as ColorOption;

    return {
        light: COLOR_SWATCH_BG_CLASS[color],
        dark: COLOR_SWATCH_DARK_BG_CLASS[color],
    };
}

export function ColorSwatchPicker({
    value,
    onValueChange,
    options = COLOR_SWATCH_OPTIONS,
    includeDefault = false,
    defaultValue = 'default',
    defaultLabel = 'Template',
}: ColorSwatchPickerProps) {
    const selectedValue = (value ?? defaultValue) as ColorSwatchValue;

    const renderSwatch = (lightClass: string, darkClass: string) => (
        <span className="absolute inset-[2px] grid grid-cols-2 overflow-hidden rounded-full">
            <span className={lightClass} />
            <span className={darkClass} />
        </span>
    );

    return (
        <div className="flex flex-wrap gap-2">
            {includeDefault ? (
                <button
                    type="button"
                    className={`relative h-7 w-7 rounded-full border border-border/70 transition ${
                        selectedValue === defaultValue
                            ? 'border-foreground'
                            : 'hover:border-foreground/40'
                    }`}
                    aria-label={defaultLabel}
                    title={defaultLabel}
                    onClick={() => onValueChange(defaultValue)}
                >
                    {renderSwatch('bg-zinc-600', 'bg-zinc-200')}
                </button>
            ) : null}

            {options.map((color) => (
                <button
                    key={color}
                    type="button"
                    className={`relative h-7 w-7 rounded-full border border-border/70 transition ${
                        selectedValue === color
                            ? 'border-foreground'
                            : 'hover:border-foreground/40'
                    } ${
                        selectedValue === color
                            ? 'after:pointer-events-none after:absolute after:inset-[2px] after:rounded-full after:border after:border-white after:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)] after:content-[\'\']'
                            : ''
                    }`}
                    aria-label={`Set color to ${color}`}
                    onClick={() => onValueChange(color)}
                >
                    {renderSwatch(
                        COLOR_SWATCH_BG_CLASS[color],
                        COLOR_SWATCH_DARK_BG_CLASS[color],
                    )}
                </button>
            ))}
        </div>
    );
}

export function getColorTextClass(value: string | null | undefined): string {
    if (!value || value === 'default') {
        return 'text-muted-foreground dark:text-zinc-400';
    }

    return (
        COLOR_SWATCH_TEXT_CLASS[value as ColorOption] ?? COLOR_SWATCH_TEXT_CLASS.black
    );
}

export function getColorBgClass(value: string | null | undefined): string {
    if (!value || value === 'default') {
        return '';
    }

    return COLOR_SWATCH_BG_CLASS[value as ColorOption] ?? '';
}

export function getColorThemeBgClass(value: string | null | undefined): string {
    const normalized = (value ?? 'default') as ColorSwatchValue;
    if (normalized === 'default' || !COLOR_SWATCH_THEME_BG_CLASS[normalized as ColorOption]) {
        return 'bg-slate-600 dark:bg-slate-400';
    }

    const color = normalized as ColorOption;

    return COLOR_SWATCH_THEME_BG_CLASS[color];
}
