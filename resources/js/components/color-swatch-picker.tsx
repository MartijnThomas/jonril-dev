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

export const COLOR_SWATCH_TEXT_CLASS: Record<ColorOption, string> = {
    black: 'text-black',
    slate: 'text-slate-600',
    zinc: 'text-zinc-600',
    stone: 'text-stone-600',
    red: 'text-red-600',
    orange: 'text-orange-600',
    amber: 'text-amber-600',
    yellow: 'text-yellow-500',
    lime: 'text-lime-600',
    green: 'text-green-600',
    emerald: 'text-emerald-600',
    teal: 'text-teal-600',
    cyan: 'text-cyan-600',
    sky: 'text-sky-600',
    blue: 'text-blue-600',
    indigo: 'text-indigo-600',
    violet: 'text-violet-600',
    purple: 'text-purple-600',
    fuchsia: 'text-fuchsia-600',
    pink: 'text-pink-600',
    rose: 'text-rose-600',
};

type ColorSwatchPickerProps = {
    value: string | null | undefined;
    onValueChange: (value: string) => void;
    options?: readonly ColorOption[];
    includeDefault?: boolean;
    defaultValue?: string;
    defaultLabel?: string;
};

export function ColorSwatchPicker({
    value,
    onValueChange,
    options = COLOR_SWATCH_OPTIONS,
    includeDefault = false,
    defaultValue = 'default',
    defaultLabel = 'Default',
}: ColorSwatchPickerProps) {
    return (
        <div className="flex flex-wrap gap-2">
            {includeDefault ? (
                <button
                    type="button"
                    className={`relative h-7 w-7 rounded-full border border-border/70 bg-background text-[10px] font-medium text-muted-foreground transition ${
                        (value ?? defaultValue) === defaultValue
                            ? 'border-foreground'
                            : 'hover:border-foreground/40'
                    }`}
                    aria-label={defaultLabel}
                    title={defaultLabel}
                    onClick={() => onValueChange(defaultValue)}
                >
                    D
                </button>
            ) : null}

            {options.map((color) => (
                <button
                    key={color}
                    type="button"
                    className={`relative h-7 w-7 rounded-full border border-border/70 p-[2px] transition ${
                        COLOR_SWATCH_BG_CLASS[color]
                    } after:absolute after:inset-[2px] after:rounded-full after:content-[''] ${
                        value === color
                            ? 'border-foreground'
                            : 'hover:border-foreground/40'
                    } ${
                        value === color
                            ? 'after:border after:border-white after:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.85)]'
                            : ''
                    }`}
                    aria-label={`Set color to ${color}`}
                    onClick={() => onValueChange(color)}
                />
            ))}
        </div>
    );
}

export function getColorTextClass(value: string | null | undefined): string {
    if (!value || value === 'default') {
        return COLOR_SWATCH_TEXT_CLASS.black;
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
