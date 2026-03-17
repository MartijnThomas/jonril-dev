import { BookOpen, Check, ChevronsUpDown } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type NoteLocationOption = {
    id: string;
    title: string;
    path?: string | null;
    parent_id?: string | null;
    is_journal?: boolean;
};

type NoteLocationComboboxProps = {
    value: string;
    onChange: (id: string) => void;
    options: NoteLocationOption[];
    placeholder: string;
    searchPlaceholder: string;
    emptyText: string;
    disabled?: boolean;
};

export function NoteLocationCombobox({
    value,
    onChange,
    options,
    placeholder,
    searchPlaceholder,
    emptyText,
    disabled = false,
}: NoteLocationComboboxProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');

    const selected = useMemo(
        () => options.find((option) => option.id === value) ?? null,
        [options, value],
    );

    const filteredOptions = useMemo(() => {
        const normalizedQuery = query.trim().toLowerCase();
        if (normalizedQuery === '') {
            return options;
        }

        return options.filter((option) => {
            const haystack = `${option.path ?? ''} ${option.title}`.toLowerCase();
            return haystack.includes(normalizedQuery);
        });
    }, [options, query]);

    return (
        <Popover
            open={open}
            onOpenChange={(nextOpen) => {
                setOpen(nextOpen);
                if (!nextOpen) {
                    setQuery('');
                }
            }}
        >
            <PopoverTrigger asChild>
                <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={open}
                    className="w-full justify-between font-normal"
                    disabled={disabled}
                >
                    <span className="truncate text-left">
                        {selected ? (
                            selected.title
                        ) : (
                            <span className="text-muted-foreground">{placeholder}</span>
                        )}
                    </span>
                    <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
                <Command shouldFilter={false}>
                    <CommandInput
                        value={query}
                        onValueChange={setQuery}
                        placeholder={searchPlaceholder}
                    />
                    <CommandList>
                        <CommandEmpty>{emptyText}</CommandEmpty>
                        <CommandGroup>
                            {filteredOptions.map((option) => (
                                <CommandItem
                                    key={option.id}
                                    value={`${option.path ?? ''} ${option.title}`}
                                    onSelect={() => {
                                        onChange(option.id);
                                        setOpen(false);
                                        setQuery('');
                                    }}
                                >
                                    <Check
                                        className={cn(
                                            'mr-2 size-4 shrink-0',
                                            value === option.id ? 'opacity-100' : 'opacity-0',
                                        )}
                                    />
                                    {option.is_journal ? (
                                        <BookOpen className="mr-1.5 size-3.5 shrink-0 text-muted-foreground" />
                                    ) : null}
                                    <span className="flex min-w-0 flex-col">
                                        <span className="truncate">{option.title}</span>
                                        {option.path?.trim() ? (
                                            <span className="truncate text-xs text-muted-foreground/70">
                                                {option.path}
                                            </span>
                                        ) : !option.is_journal ? (
                                            <span className="text-xs text-muted-foreground/40">Root</span>
                                        ) : null}
                                    </span>
                                </CommandItem>
                            ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}
