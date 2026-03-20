import {
    Check,
    ChevronDown,
    ChevronRight,
    Eye,
    EyeOff,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { IconPicker } from '@/components/icon-picker';
import { Button } from '@/components/ui/button';
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
} from '@/components/ui/command';
import { Input } from '@/components/ui/input';
import {
    PopoverAnchor,
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';
import { useI18n } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type DocumentPropertiesValue = Record<string, string>;
type WorkspaceSuggestions = {
    mentions: string[];
    hashtags: string[];
};

type DocumentPropertiesProps = {
    value: DocumentPropertiesValue;
    onChange: (value: DocumentPropertiesValue) => void;
    onPersistRequested?: () => void;
    options?: string[];
    defaultCollapsed?: boolean;
    workspaceSuggestions?: WorkspaceSuggestions;
};

const DEFAULT_PROPERTY_OPTIONS = [
    'title',
    'icon',
    'icon-color',
    'icon-bg',
    'context',
    'participants',
    'tags',
    'project',
] as const;
const PROPERTY_VISIBILITY_META_PREFIX = '__visible:';

type DraftRow = {
    id: string;
    key: string;
    value: string;
};

function createId() {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `prop_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`
    );
}

function createDraftRow(): DraftRow {
    return {
        id: createId(),
        key: '',
        value: '',
    };
}

const propertyVisibilityMetaKey = (key: string) =>
    `${PROPERTY_VISIBILITY_META_PREFIX}${key}`;

const isPropertyVisibilityMetaKey = (key: string) =>
    key.startsWith(PROPERTY_VISIBILITY_META_PREFIX);

const isDefaultVisibleProperty = (key: string) => {
    const normalized = key.trim().toLowerCase();
    return normalized === 'context' || normalized === 'participants' || normalized === 'tags';
};

const normalizeTokenValue = (value: string) =>
    value.trim().replace(/^[@#]/, '').trim();

const isValidTokenValue = (value: string) => {
    if (value === '' || /\s/u.test(value)) {
        return false;
    }

    return Array.from(value).every((char) => {
        if (char === '_' || char === '-') {
            return true;
        }

        if (/[0-9]/.test(char)) {
            return true;
        }

        return char.toLowerCase() !== char.toUpperCase();
    });
};

const splitTags = (value: string) =>
    value
        .split(',')
        .map((part) => normalizeTokenValue(part))
        .filter(Boolean);

type TokenPropertyInputProps = {
    mode: 'context' | 'participants' | 'tags';
    value: string;
    onChange: (next: string) => void;
    onPersist: (kind: 'mention' | 'hashtag', value: string) => Promise<string[]>;
    options: string[];
    className?: string;
    placeholder?: string;
    inputRef?: (element: HTMLInputElement | null) => void;
    onBlur?: () => void;
    onKeyDown?: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
};

function TokenPropertyInput({
    mode,
    value,
    onChange,
    onPersist,
    options,
    className,
    placeholder,
    inputRef,
    onBlur,
    onKeyDown,
}: TokenPropertyInputProps) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const isTags = mode === 'tags';
    const isParticipants = mode === 'participants';
    const isMultiToken = isTags || isParticipants;
    const char = isTags ? '#' : '@';

    const selectedTokens = useMemo(() => {
        if (isMultiToken) {
            return splitTags(value);
        }

        const normalized = normalizeTokenValue(value);
        return normalized ? [normalized] : [];
    }, [isMultiToken, value]);

    const currentQuery = normalizeTokenValue(query);

    const filteredOptions = useMemo(() => {
        const selected = new Set(selectedTokens.map((item) => item.toLowerCase()));
        const queryLower = currentQuery.toLowerCase();

        return options
            .filter((option) =>
                option.toLowerCase().includes(queryLower),
            )
            .filter((option) => !selected.has(option.toLowerCase()));
    }, [currentQuery, options, selectedTokens]);

    const canCreate =
        isValidTokenValue(currentQuery) &&
        !options.some(
            (option) => option.toLowerCase() === currentQuery.toLowerCase(),
        );

    const applyValue = (token: string) => {
        if (!isMultiToken) {
            onChange(token);
            setQuery('');
            setOpen(false);
            return;
        }

        const base = selectedTokens;
        const alreadyExists = base.some(
            (item) => item.toLowerCase() === token.toLowerCase(),
        );
        const next = alreadyExists ? base : [...base, token];
        onChange(next.join(', '));
        setQuery('');
        setOpen(true);
    };

    const persistAndApply = async (token: string) => {
        const kind = isTags ? 'hashtag' : 'mention';
        const updated = await onPersist(kind, token);
        const canonical =
            updated.find(
                (item) => item.toLowerCase() === token.toLowerCase(),
            ) ?? token;
        applyValue(canonical);
    };

    const handleBlur = () => {
        if (currentQuery && isValidTokenValue(currentQuery)) {
            void persistAndApply(currentQuery);
        } else if (isMultiToken) {
            onChange(selectedTokens.join(', '));
        }

        window.setTimeout(() => {
            setOpen(false);
            onBlur?.();
        }, 100);
    };

    const removeToken = (token: string) => {
        if (!isMultiToken) {
            onChange('');
            return;
        }

        const next = selectedTokens.filter(
            (item) => item.toLowerCase() !== token.toLowerCase(),
        );
        onChange(next.join(', '));
    };

    return (
        <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
                <div
                    className={cn(
                        'flex h-8 w-full items-center gap-1 rounded-none border-0 bg-transparent px-2 text-left text-sm shadow-none focus-within:bg-white md:text-xs',
                        className,
                    )}
                >
                    {selectedTokens.map((token) => (
                        <span
                            key={token}
                            className={cn(
                                'inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-xs',
                                isTags
                                    ? 'bg-blue-400/10 text-blue-600'
                                    : isParticipants
                                        ? 'bg-muted text-muted-foreground'
                                        : 'bg-purple-400/10 text-purple-600',
                            )}
                        >
                            {char}
                            {token}
                            <button
                                type="button"
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => removeToken(token)}
                                className="opacity-70 hover:opacity-100"
                                aria-label={`Remove ${char}${token}`}
                            >
                                <X className="h-3 w-3" />
                            </button>
                        </span>
                    ))}

                    <input
                        ref={inputRef}
                        value={query}
                        onFocus={() => setOpen(true)}
                        onBlur={handleBlur}
                        onChange={(event) => {
                            setQuery(event.target.value);
                            setOpen(true);
                        }}
                        onKeyDown={async (event) => {
                            if (
                                event.key === 'Enter' &&
                                (event.metaKey || event.ctrlKey)
                            ) {
                                onKeyDown?.(event);
                                return;
                            }

                            if (event.key === 'Enter') {
                                event.preventDefault();
                                if (filteredOptions.length > 0) {
                                    applyValue(filteredOptions[0]);
                                    return;
                                }
                                if (canCreate) {
                                    await persistAndApply(currentQuery);
                                }
                                return;
                            }

                            if (event.key === 'Tab' && filteredOptions.length > 0) {
                                event.preventDefault();
                                applyValue(filteredOptions[0]);
                                return;
                            }

                            if (
                                event.key === 'Backspace' &&
                                query === '' &&
                                selectedTokens.length > 0 &&
                                isMultiToken
                            ) {
                                removeToken(selectedTokens[selectedTokens.length - 1]);
                                return;
                            }

                            onKeyDown?.(event);
                        }}
                        placeholder={selectedTokens.length === 0 ? placeholder : ''}
                        className="min-w-[6rem] flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground md:text-sm"
                    />
                </div>
            </PopoverTrigger>
            <PopoverContent
                align="start"
                className="w-72 p-0"
                onOpenAutoFocus={(event) => {
                    event.preventDefault();
                }}
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                }}
            >
                <Command shouldFilter={false}>
                    <CommandList>
                        <CommandEmpty className="px-3 py-2 text-xs text-muted-foreground">
                            {isTags
                                ? 'Type a hashtag and press Enter to create.'
                                : 'Type a mention and press Enter to create.'}
                        </CommandEmpty>
                        <CommandGroup heading={isTags ? 'Hashtags' : 'Mentions'}>
                            {filteredOptions.map((option) => (
                                <CommandItem
                                    key={option}
                                    value={option}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onSelect={() => applyValue(option)}
                                >
                                    <Check className="h-3.5 w-3.5 opacity-40" />
                                    {char}
                                    {option}
                                </CommandItem>
                            ))}
                            {canCreate && (
                                <CommandItem
                                    value={`create-${currentQuery}`}
                                    onMouseDown={(event) => event.preventDefault()}
                                    onSelect={() => {
                                        void persistAndApply(currentQuery);
                                    }}
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    Create {char}
                                    {currentQuery}
                                </CommandItem>
                            )}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        </Popover>
    );
}

export function DocumentProperties({
    value,
    onChange,
    onPersistRequested,
    options = [...DEFAULT_PROPERTY_OPTIONS],
    defaultCollapsed = true,
    workspaceSuggestions,
}: DocumentPropertiesProps) {
    const { t } = useI18n();
    const [collapsed, setCollapsed] = useState(defaultCollapsed);
    const [searchByRow, setSearchByRow] = useState<Record<string, string>>({});
    const [openRowId, setOpenRowId] = useState<string | null>(null);
    const [draftRows, setDraftRows] = useState<DraftRow[]>([]);
    const [existingKeyDrafts, setExistingKeyDrafts] = useState<
        Record<string, string>
    >({});
    const [pendingFocusRowId, setPendingFocusRowId] = useState<string | null>(
        null,
    );
    const [pendingExistingValueFocusKey, setPendingExistingValueFocusKey] =
        useState<string | null>(null);
    const [mentionOptions, setMentionOptions] = useState<string[]>(
        workspaceSuggestions?.mentions ?? [],
    );
    const [hashtagOptions, setHashtagOptions] = useState<string[]>(
        workspaceSuggestions?.hashtags ?? [],
    );

    const keyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const valueInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const existingValueInputRefs = useRef<
        Record<string, HTMLInputElement | null>
    >({});

    const entries = useMemo(
        () =>
            Object.entries(value).filter(
                ([key]) => !isPropertyVisibilityMetaKey(key),
            ),
        [value],
    );

    const isPropertyVisible = (key: string) => {
        const metaValue = value[propertyVisibilityMetaKey(key)];
        if (metaValue === '1') {
            return true;
        }
        if (metaValue === '0') {
            return false;
        }

        return isDefaultVisibleProperty(key);
    };

    const visibleEntries = entries.filter(([key]) => isPropertyVisible(key));

    useEffect(() => {
        setMentionOptions(workspaceSuggestions?.mentions ?? []);
        setHashtagOptions(workspaceSuggestions?.hashtags ?? []);
    }, [workspaceSuggestions]);

    const getCookie = (name: string): string | null => {
        const match = document.cookie
            .split('; ')
            .find((part) => part.startsWith(`${name}=`));

        if (!match) {
            return null;
        }

        return decodeURIComponent(match.split('=').slice(1).join('='));
    };

    const persistWorkspaceToken = async (
        kind: 'mention' | 'hashtag',
        rawValue: string,
    ): Promise<string[]> => {
        const normalized = normalizeTokenValue(rawValue);
        if (!isValidTokenValue(normalized)) {
            return kind === 'mention' ? mentionOptions : hashtagOptions;
        }

        const xsrfToken = getCookie('XSRF-TOKEN');
        const response = await fetch('/workspaces/suggestions', {
            method: 'POST',
            credentials: 'same-origin',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-Requested-With': 'XMLHttpRequest',
                ...(xsrfToken ? { 'X-XSRF-TOKEN': xsrfToken } : {}),
            },
            body: JSON.stringify({
                kind,
                value: normalized,
            }),
        });

        if (!response.ok) {
            return kind === 'mention' ? mentionOptions : hashtagOptions;
        }

        const payload = (await response.json()) as { items?: string[] };
        const items = Array.isArray(payload.items) ? payload.items : [];

        if (kind === 'mention') {
            setMentionOptions(items);
        } else {
            setHashtagOptions(items);
        }

        return items;
    };

    const availableOptions = useMemo(() => {
        const existing = new Set([
            ...Object.keys(value).filter((key) => !isPropertyVisibilityMetaKey(key)),
            ...draftRows.map((row) => row.key).filter(Boolean),
        ]);

        return options.filter((option) => !existing.has(option));
    }, [options, value, draftRows]);

    const addEmptyRow = () => {
        const row = createDraftRow();
        const rowPopoverId = `draft:${row.id}`;

        setCollapsed(false);
        setDraftRows((current) => [...current, row]);
        setPendingFocusRowId(row.id);
        setOpenRowId(rowPopoverId);
    };

    const commitDraftRow = (
        rowId: string,
        nextKey: string,
        nextValue: string,
        keepDraftIfInvalid = true,
    ) => {
        const trimmed = nextKey.trim();

        if (!trimmed) {
            if (!keepDraftIfInvalid) {
                setDraftRows((current) =>
                    current.filter((row) => row.id !== rowId),
                );
            }
            return;
        }

        if (Object.prototype.hasOwnProperty.call(value, trimmed)) {
            return;
        }

        onChange({
            ...value,
            [trimmed]: nextValue,
        });
        onPersistRequested?.();

        setDraftRows((current) => current.filter((row) => row.id !== rowId));
        setSearchByRow((current) => {
            const next = { ...current };
            delete next[rowId];
            return next;
        });
        setOpenRowId((current) => (current === rowId ? null : current));
        setPendingFocusRowId(null);
    };

    const renameProperty = (oldKey: string, newKey: string) => {
        const trimmed = newKey.trim();

        if (!trimmed || trimmed === oldKey) {
            return;
        }

        if (Object.prototype.hasOwnProperty.call(value, trimmed)) {
            return;
        }

        const next: DocumentPropertiesValue = {};

        Object.entries(value).forEach(([key, propertyValue]) => {
            if (key === oldKey) {
                next[trimmed] = propertyValue;
            } else if (key === propertyVisibilityMetaKey(oldKey)) {
                next[propertyVisibilityMetaKey(trimmed)] = propertyValue;
            } else {
                next[key] = propertyValue;
            }
        });

        onChange(next);
    };

    const commitExistingKeyRename = (oldKey: string, nextKey: string) => {
        const trimmed = nextKey.trim();

        if (!trimmed || trimmed === oldKey) {
            setExistingKeyDrafts((current) => {
                const next = { ...current };
                delete next[oldKey];
                return next;
            });
            return;
        }

        if (Object.prototype.hasOwnProperty.call(value, trimmed)) {
            return;
        }

        renameProperty(oldKey, trimmed);
        setExistingKeyDrafts((current) => {
            const next = { ...current };
            delete next[oldKey];
            return next;
        });
        setPendingExistingValueFocusKey(trimmed);
        onPersistRequested?.();
    };

    const updatePropertyValue = (key: string, nextValue: string) => {
        onChange({
            ...value,
            [key]: nextValue,
        });
    };

    const removeProperty = (key: string) => {
        const next = { ...value };
        delete next[key];
        delete next[propertyVisibilityMetaKey(key)];
        onChange(next);
        onPersistRequested?.();
    };

    const togglePropertyVisibility = (key: string) => {
        const nextVisible = !isPropertyVisible(key);
        onChange({
            ...value,
            [propertyVisibilityMetaKey(key)]: nextVisible ? '1' : '0',
        });
        onPersistRequested?.();
    };

    useEffect(() => {
        if (!pendingFocusRowId) {
            return;
        }

        const frame = requestAnimationFrame(() => {
            keyInputRefs.current[pendingFocusRowId]?.focus();
        });

        return () => cancelAnimationFrame(frame);
    }, [pendingFocusRowId, draftRows]);

    useEffect(() => {
        if (!pendingExistingValueFocusKey) {
            return;
        }

        const frame = requestAnimationFrame(() => {
            const input =
                existingValueInputRefs.current[pendingExistingValueFocusKey];
            if (input) {
                input.focus();
                setPendingExistingValueFocusKey(null);
            }
        });

        return () => cancelAnimationFrame(frame);
    }, [pendingExistingValueFocusKey, entries]);

    const focusDraftValueInput = (rowId: string) => {
        requestAnimationFrame(() => {
            const keyInput = keyInputRefs.current[rowId];
            if (keyInput) {
                keyInput.scrollLeft = 0;
                keyInput.blur();
            }
            valueInputRefs.current[rowId]?.focus();
        });
    };

    const valueFieldMode = (
        key: string,
    ): 'default' | 'context' | 'participants' | 'tags' | 'icon' => {
        const normalized = key.trim().toLowerCase();
        if (normalized === 'context') {
            return 'context';
        }
        if (normalized === 'participants') {
            return 'participants';
        }
        if (normalized === 'tags') {
            return 'tags';
        }
        if (normalized === 'icon') {
            return 'icon';
        }

        return 'default';
    };

    const renderDraftKeyPopoverContent = (rowId: string) => {
        const search = searchByRow[rowId] ?? '';

        return (
            <PopoverContent
                align="start"
                className="w-64 p-0"
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                }}
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Property key..."
                        value={search}
                        onValueChange={(nextValue) =>
                            setSearchByRow((current) => ({
                                ...current,
                                [rowId]: nextValue,
                            }))
                        }
                    />
                    <CommandList>
                        <CommandEmpty>
                            <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm"
                                onClick={() => {
                                    const row = draftRows.find(
                                        (draftRow) => draftRow.id === rowId,
                                    );

                                    if (!row) {
                                        return;
                                    }

                                    setDraftRows((current) =>
                                        current.map((draftRow) =>
                                            draftRow.id === rowId
                                                ? {
                                                      ...draftRow,
                                                      key: search.trim(),
                                                  }
                                                : draftRow,
                                        ),
                                    );

                                    setOpenRowId(null);
                                    focusDraftValueInput(rowId);
                                }}
                            >
                                Use “{search.trim() || 'property'}”
                            </button>
                        </CommandEmpty>

                        <CommandGroup heading="Suggested">
                            {availableOptions
                                .filter((option) =>
                                    option
                                        .toLowerCase()
                                        .includes(search.toLowerCase()),
                                )
                                .map((option) => (
                                    <CommandItem
                                        key={option}
                                        value={option}
                                        onSelect={() => {
                                            setDraftRows((current) =>
                                                current.map((draftRow) =>
                                                    draftRow.id === rowId
                                                        ? {
                                                              ...draftRow,
                                                              key: option,
                                                          }
                                                        : draftRow,
                                                ),
                                            );
                                            setOpenRowId(null);
                                            focusDraftValueInput(rowId);
                                        }}
                                    >
                                        {option}
                                    </CommandItem>
                                ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        );
    };

    const renderExistingKeyPopoverContent = (oldKey: string, rowId: string) => {
        const draftValue = existingKeyDrafts[oldKey] ?? oldKey;
        const search = searchByRow[rowId] ?? '';
        const selectedKey = draftValue.trim().toLowerCase();

        const existingKeys = new Set(
            Object.keys(value).filter((key) => !isPropertyVisibilityMetaKey(key)),
        );
        existingKeys.delete(oldKey);

        const suggestedOptions = options.filter(
            (option) => !existingKeys.has(option),
        );

        return (
            <PopoverContent
                align="start"
                className="w-64 p-0"
                onCloseAutoFocus={(event) => {
                    event.preventDefault();
                }}
            >
                <Command shouldFilter={false}>
                    <CommandInput
                        placeholder="Property key..."
                        value={search}
                        onValueChange={(nextValue) =>
                            setSearchByRow((current) => ({
                                ...current,
                                [rowId]: nextValue,
                            }))
                        }
                    />
                    <CommandList>
                        <CommandEmpty>
                            <button
                                type="button"
                                className="w-full px-3 py-2 text-left text-sm"
                                onClick={() => {
                                    setExistingKeyDrafts((current) => ({
                                        ...current,
                                        [oldKey]: search.trim(),
                                    }));
                                    setOpenRowId(null);
                                    commitExistingKeyRename(oldKey, search);
                                }}
                            >
                                Use “{search.trim() || 'property'}”
                            </button>
                        </CommandEmpty>

                        <CommandGroup heading="Suggested">
                            {suggestedOptions
                                .filter((option) =>
                                    option
                                        .toLowerCase()
                                        .includes(search.toLowerCase()),
                                )
                                .map((option) => (
                                    <CommandItem
                                        key={option}
                                        value={option}
                                        onSelect={() => {
                                            setExistingKeyDrafts((current) => ({
                                                ...current,
                                                [oldKey]: option,
                                            }));
                                            setOpenRowId(null);
                                            commitExistingKeyRename(
                                                oldKey,
                                                option,
                                            );
                                        }}
                                    >
                                        <Check
                                            className={cn(
                                                'h-3.5 w-3.5',
                                                option.toLowerCase() ===
                                                    selectedKey
                                                    ? 'opacity-100'
                                                    : 'opacity-0',
                                            )}
                                        />
                                        {option}
                                    </CommandItem>
                                ))}
                        </CommandGroup>
                    </CommandList>
                </Command>
            </PopoverContent>
        );
    };

    return (
        <div className="editor-ui-font mb-0 md:mb-4">
            <div
                className={cn(
                    'rounded-md px-8 pt-4 pb-2 transition-colors duration-200 md:px-2 md:py-2',
                    collapsed ? 'bg-transparent' : 'bg-muted/30',
                )}
            >
                <div className="flex items-center">
                    <button
                        type="button"
                        onClick={() => setCollapsed((current) => !current)}
                        className="flex items-center gap-1.5 text-[0.78em] font-bold tracking-wide text-muted-foreground uppercase md:font-semibold"
                    >
                        {collapsed ? (
                            <ChevronRight className="h-3.5 w-3.5" />
                        ) : (
                            <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        <span>
                            {t('note_actions.properties', 'Note properties')} ({entries.length + draftRows.length})
                        </span>
                    </button>
                </div>

                {collapsed && visibleEntries.length > 0 ? (
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 px-5 pb-1 text-[0.78em] text-muted-foreground">
                        {visibleEntries.map(([key, propertyValue]) => (
                            <span key={key} className="truncate">
                                <span className="text-[0.66em] tracking-[0.08em] text-muted-foreground/75 uppercase">
                                    {key.replaceAll('-', ' ')}
                                </span>{' '}
                                <span className="font-normal text-muted-foreground">
                                    {propertyValue}
                                </span>
                            </span>
                        ))}
                    </div>
                ) : null}

                {!collapsed && (
                    <div className="pt-2">
                        {entries.length + draftRows.length > 0 && (
                            <div className="hidden grid-cols-[minmax(120px,180px)_minmax(0,1fr)_20px_20px] items-center gap-3 border-b border-muted-foreground/40 px-1 pb-1 text-[0.78em] tracking-wide text-muted-foreground uppercase md:grid">
                                <div className="pr-2 text-right">Key</div>
                                <div className="pl-2">Value</div>
                                <div />
                                <div />
                            </div>
                        )}

                        <div className="[&>*+*]:border-t [&>*+*]:border-border/60 md:[&>*+*]:border-muted-foreground/45 md:[&>*+*]:[border-top-style:dashed]">
                            {entries.map(([key, propertyValue]) => {
                            const rowId = `existing:${key}`;
                            const keyDraft = existingKeyDrafts[key] ?? key;
                            const fieldMode = valueFieldMode(key);

                            return (
                                <div
                                    key={key}
                                    className="group grid grid-cols-[minmax(78px,112px)_minmax(0,1fr)_24px_24px] items-center gap-2 px-1 py-2 md:grid-cols-[minmax(120px,180px)_minmax(0,1fr)_20px_20px] md:gap-3 md:py-1"
                                >
                                    <Popover
                                        open={openRowId === rowId}
                                        onOpenChange={(nextOpen) => {
                                            setOpenRowId(
                                                nextOpen ? rowId : null,
                                            );
                                            if (!nextOpen) {
                                                setSearchByRow((current) => {
                                                    const next = { ...current };
                                                    delete next[rowId];
                                                    return next;
                                                });
                                                commitExistingKeyRename(
                                                    key,
                                                    existingKeyDrafts[key] ??
                                                        key,
                                                );
                                            }
                                        }}
                                    >
                                        <PopoverAnchor asChild>
                                            <div>
                                                <Input
                                                    value={keyDraft}
                                                    onFocus={() => {
                                                        setOpenRowId(rowId);
                                                        setSearchByRow(
                                                            (current) => ({
                                                                ...current,
                                                                [rowId]: '',
                                                            }),
                                                        );
                                                    }}
                                                    onChange={(event) => {
                                                        const nextValue =
                                                            event.target.value;

                                                        setExistingKeyDrafts(
                                                            (current) => ({
                                                                ...current,
                                                                [key]: nextValue,
                                                            }),
                                                        );
                                                        setSearchByRow(
                                                            (current) => ({
                                                                ...current,
                                                                [rowId]: nextValue,
                                                            }),
                                                        );
                                                        setOpenRowId(rowId);
                                                    }}
                                                    onKeyDown={(event) => {
                                                        if (
                                                            event.key === 'Enter'
                                                        ) {
                                                            event.preventDefault();
                                                            setOpenRowId(null);
                                                            commitExistingKeyRename(
                                                                key,
                                                                existingKeyDrafts[
                                                                    key
                                                                ] ?? key,
                                                            );
                                                        }
                                                    }}
                                                    placeholder="Key"
                                                    className="h-10 rounded-md border border-border/60 bg-background px-2 text-left text-sm shadow-none focus:bg-white focus-visible:ring-0 md:h-8 md:rounded-none md:border-0 md:border-r md:border-muted-foreground/45 md:[border-right-style:dashed] md:bg-transparent md:text-right md:text-xs"
                                                />
                                            </div>
                                        </PopoverAnchor>

                                        {renderExistingKeyPopoverContent(
                                            key,
                                            rowId,
                                        )}
                                    </Popover>

                                    {fieldMode === 'default' ? (
                                        <Input
                                            ref={(element) => {
                                                existingValueInputRefs.current[
                                                    key
                                                ] = element;
                                            }}
                                            value={propertyValue}
                                            onChange={(event) =>
                                                updatePropertyValue(
                                                    key,
                                                    event.target.value,
                                                )
                                            }
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === 'Enter' &&
                                                    (event.metaKey ||
                                                        event.ctrlKey)
                                                ) {
                                                    event.preventDefault();
                                                    addEmptyRow();
                                                }
                                            }}
                                            onBlur={() => {
                                                onPersistRequested?.();
                                            }}
                                            placeholder="Value"
                                            className="h-10 rounded-md border border-border/60 bg-background px-2 text-left text-sm shadow-none focus:bg-white focus-visible:ring-0 md:h-8 md:rounded-none md:border-0 md:border-r md:border-muted-foreground/45 md:[border-right-style:dashed] md:bg-transparent md:text-xs"
                                        />
                                    ) : fieldMode === 'icon' ? (
                                        <IconPicker
                                            value={propertyValue}
                                            onValueChange={(nextValue) => {
                                                updatePropertyValue(
                                                    key,
                                                    nextValue,
                                                );
                                                onPersistRequested?.();
                                            }}
                                            className="h-10 rounded-md border border-border/60 bg-background px-2 text-left text-sm shadow-none focus-within:bg-white focus-visible:ring-0 md:h-8 md:rounded-none md:border-0 md:border-r md:border-muted-foreground/45 md:[border-right-style:dashed] md:bg-transparent md:text-xs"
                                        />
                                    ) : (
                                        <TokenPropertyInput
                                            mode={fieldMode}
                                            inputRef={(element) => {
                                                existingValueInputRefs.current[
                                                    key
                                                ] = element;
                                            }}
                                            value={propertyValue}
                                            onChange={(nextValue) =>
                                                updatePropertyValue(
                                                    key,
                                                    nextValue,
                                                )
                                            }
                                            onPersist={persistWorkspaceToken}
                                            options={
                                                fieldMode ===
                                                'context' ||
                                                fieldMode ===
                                                'participants'
                                                    ? mentionOptions
                                                    : hashtagOptions
                                            }
                                            placeholder={
                                                fieldMode ===
                                                'context'
                                                    ? '@mention'
                                                    : fieldMode ===
                                                    'participants'
                                                        ? '@participant1, @participant2'
                                                    : '#tag1, #tag2'
                                            }
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === 'Enter' &&
                                                    (event.metaKey ||
                                                        event.ctrlKey)
                                                ) {
                                                    event.preventDefault();
                                                    addEmptyRow();
                                                }
                                            }}
                                            onBlur={() => {
                                                onPersistRequested?.();
                                            }}
                                            className="h-10 rounded-md border border-border/60 bg-background px-2 text-left text-sm shadow-none focus:bg-white focus-visible:ring-0 md:h-8 md:rounded-none md:border-0 md:border-r md:border-muted-foreground/45 md:[border-right-style:dashed] md:bg-transparent md:text-xs"
                                        />
                                    )}

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-sm text-muted-foreground/80 md:h-5 md:w-5"
                                        onClick={() =>
                                            togglePropertyVisibility(key)
                                        }
                                        title={
                                            isPropertyVisible(key)
                                                ? 'Hide in collapsed view'
                                                : 'Show in collapsed view'
                                        }
                                    >
                                        {isPropertyVisible(key) ? (
                                            <Eye className="h-3 w-3" />
                                        ) : (
                                            <EyeOff className="h-3 w-3" />
                                        )}
                                    </Button>

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 rounded-sm text-muted-foreground opacity-100 transition-opacity md:h-5 md:w-5 md:opacity-0 md:group-hover:opacity-100"
                                        onClick={() => removeProperty(key)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            );
                        })}

                        {draftRows.map((row) => {
                            const fieldMode = valueFieldMode(row.key);

                            return (
                            <div
                                key={row.id}
                                className="group grid grid-cols-[minmax(78px,112px)_minmax(0,1fr)_24px_24px] items-center gap-2 px-1 py-2 md:grid-cols-[minmax(120px,180px)_minmax(0,1fr)_20px_20px] md:gap-3 md:py-1"
                            >
                                <Popover
                                    open={openRowId === `draft:${row.id}`}
                                    onOpenChange={(nextOpen) => {
                                        setOpenRowId(
                                            nextOpen ? `draft:${row.id}` : null,
                                        );
                                        if (!nextOpen) {
                                            setSearchByRow((current) => {
                                                const next = { ...current };
                                                delete next[row.id];
                                                return next;
                                            });
                                        }
                                    }}
                                >
                                    <PopoverTrigger asChild>
                                        <Input
                                            ref={(element) => {
                                                keyInputRefs.current[row.id] =
                                                    element;
                                                if (
                                                    pendingFocusRowId ===
                                                        row.id &&
                                                    element
                                                ) {
                                                    element.focus();
                                                    setPendingFocusRowId(null);
                                                }
                                            }}
                                            value={row.key}
                                            onFocus={() =>
                                                setOpenRowId(`draft:${row.id}`)
                                            }
                                            onChange={(event) => {
                                                const nextValue =
                                                    event.target.value;

                                                setDraftRows((current) =>
                                                    current.map((draftRow) =>
                                                        draftRow.id === row.id
                                                            ? {
                                                                  ...draftRow,
                                                                  key: nextValue,
                                                              }
                                                            : draftRow,
                                                    ),
                                                );

                                                setSearchByRow((current) => ({
                                                    ...current,
                                                    [row.id]: nextValue,
                                                }));
                                                setOpenRowId(`draft:${row.id}`);
                                            }}
                                            onBlur={() => {
                                                const currentRow =
                                                    draftRows.find(
                                                        (draftRow) =>
                                                            draftRow.id ===
                                                            row.id,
                                                    );

                                                if (!currentRow) {
                                                    return;
                                                }

                                                if (!currentRow.key.trim()) {
                                                    return;
                                                }

                                                focusDraftValueInput(row.id);
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    const currentRow =
                                                        draftRows.find(
                                                            (draftRow) =>
                                                                draftRow.id ===
                                                                row.id,
                                                        );

                                                    if (!currentRow) {
                                                        return;
                                                    }

                                                    setOpenRowId(null);

                                                    focusDraftValueInput(
                                                        row.id,
                                                    );
                                                }
                                            }}
                                            placeholder="Key"
                                            className="h-10 rounded-md border border-border/60 bg-background px-2 text-left text-sm shadow-none focus:bg-white focus-visible:ring-0 md:h-8 md:rounded-none md:border-0 md:border-r md:border-muted-foreground/45 md:[border-right-style:dashed] md:bg-transparent md:text-right md:text-xs"
                                        />
                                    </PopoverTrigger>

                                    {renderDraftKeyPopoverContent(row.id)}
                                </Popover>

                                <div>
                                    {fieldMode === 'default' ? (
                                        <Input
                                            data-value-input="true"
                                            ref={(element) => {
                                                valueInputRefs.current[row.id] =
                                                    element;
                                            }}
                                            value={row.value}
                                            onChange={(event) =>
                                                setDraftRows((current) =>
                                                    current.map((draftRow) =>
                                                        draftRow.id === row.id
                                                            ? {
                                                                  ...draftRow,
                                                                  value: event
                                                                      .target
                                                                      .value,
                                                              }
                                                            : draftRow,
                                                    ),
                                                )
                                            }
                                            onBlur={() => {
                                                const currentRow =
                                                    draftRows.find(
                                                        (draftRow) =>
                                                            draftRow.id ===
                                                            row.id,
                                                    );

                                                if (!currentRow) {
                                                    return;
                                                }

                                                if (currentRow.key.trim()) {
                                                    commitDraftRow(
                                                        row.id,
                                                        currentRow.key,
                                                        currentRow.value,
                                                    );
                                                }

                                                onPersistRequested?.();
                                            }}
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === 'Enter' &&
                                                    (event.metaKey ||
                                                        event.ctrlKey)
                                                ) {
                                                    event.preventDefault();
                                                    const currentRow =
                                                        draftRows.find(
                                                            (draftRow) =>
                                                                draftRow.id ===
                                                                row.id,
                                                        );

                                                    if (!currentRow) {
                                                        return;
                                                    }

                                                    commitDraftRow(
                                                        row.id,
                                                        currentRow.key,
                                                        currentRow.value,
                                                    );
                                                    addEmptyRow();
                                                }

                                                if (
                                                    event.key === 'Enter' &&
                                                    !(
                                                        event.metaKey ||
                                                        event.ctrlKey
                                                    )
                                                ) {
                                                    event.preventDefault();
                                                    const currentRow =
                                                        draftRows.find(
                                                            (draftRow) =>
                                                                draftRow.id ===
                                                                row.id,
                                                        );

                                                    if (!currentRow) {
                                                        return;
                                                    }

                                                    commitDraftRow(
                                                        row.id,
                                                        currentRow.key,
                                                        currentRow.value,
                                                    );
                                                }
                                            }}
                                            placeholder="Value"
                                            className="h-10 rounded-md border border-border/60 bg-background px-2 text-left text-sm shadow-none focus:bg-white focus-visible:ring-0 md:h-8 md:rounded-none md:border-0 md:border-r md:border-muted-foreground/45 md:[border-right-style:dashed] md:bg-transparent md:text-xs"
                                        />
                                    ) : fieldMode === 'icon' ? (
                                        <IconPicker
                                            value={row.value}
                                            onValueChange={(nextValue) => {
                                                const currentRow =
                                                    draftRows.find(
                                                        (draftRow) =>
                                                            draftRow.id ===
                                                            row.id,
                                                    );

                                                if (!currentRow) {
                                                    return;
                                                }

                                                if (currentRow.key.trim()) {
                                                    commitDraftRow(
                                                        row.id,
                                                        currentRow.key,
                                                        nextValue,
                                                    );
                                                    return;
                                                }

                                                setDraftRows((current) =>
                                                    current.map((draftRow) =>
                                                        draftRow.id === row.id
                                                            ? {
                                                                  ...draftRow,
                                                                  value: nextValue,
                                                              }
                                                            : draftRow,
                                                    ),
                                                );
                                            }}
                                            className="h-10 rounded-md border border-border/60 bg-background px-2 text-left text-sm shadow-none focus-within:bg-white focus-visible:ring-0 md:h-8 md:rounded-none md:border-0 md:border-r md:border-muted-foreground/45 md:[border-right-style:dashed] md:bg-transparent md:text-xs"
                                        />
                                    ) : (
                                        <TokenPropertyInput
                                            mode={fieldMode}
                                            inputRef={(element) => {
                                                valueInputRefs.current[row.id] =
                                                    element;
                                            }}
                                            value={row.value}
                                            onChange={(nextValue) =>
                                                setDraftRows((current) =>
                                                    current.map((draftRow) =>
                                                        draftRow.id === row.id
                                                            ? {
                                                                  ...draftRow,
                                                                  value: nextValue,
                                                              }
                                                            : draftRow,
                                                    ),
                                                )
                                            }
                                            onPersist={persistWorkspaceToken}
                                            options={
                                                fieldMode ===
                                                'context' ||
                                                fieldMode ===
                                                'participants'
                                                    ? mentionOptions
                                                    : hashtagOptions
                                            }
                                            onBlur={() => {
                                                const currentRow =
                                                    draftRows.find(
                                                        (draftRow) =>
                                                            draftRow.id ===
                                                            row.id,
                                                    );

                                                if (!currentRow) {
                                                    return;
                                                }

                                                if (currentRow.key.trim()) {
                                                    commitDraftRow(
                                                        row.id,
                                                        currentRow.key,
                                                        currentRow.value,
                                                    );
                                                }

                                                onPersistRequested?.();
                                            }}
                                            onKeyDown={(event) => {
                                                if (
                                                    event.key === 'Enter' &&
                                                    (event.metaKey ||
                                                        event.ctrlKey)
                                                ) {
                                                    event.preventDefault();
                                                    const currentRow =
                                                        draftRows.find(
                                                            (draftRow) =>
                                                                draftRow.id ===
                                                                row.id,
                                                        );

                                                    if (!currentRow) {
                                                        return;
                                                    }

                                                    commitDraftRow(
                                                        row.id,
                                                        currentRow.key,
                                                        currentRow.value,
                                                    );
                                                    addEmptyRow();
                                                }

                                                if (
                                                    event.key === 'Enter' &&
                                                    !(
                                                        event.metaKey ||
                                                        event.ctrlKey
                                                    )
                                                ) {
                                                    event.preventDefault();
                                                    const currentRow =
                                                        draftRows.find(
                                                            (draftRow) =>
                                                                draftRow.id ===
                                                                row.id,
                                                        );

                                                    if (!currentRow) {
                                                        return;
                                                    }

                                                    commitDraftRow(
                                                        row.id,
                                                        currentRow.key,
                                                        currentRow.value,
                                                    );
                                                }
                                            }}
                                            placeholder={
                                                fieldMode ===
                                                'context'
                                                    ? '@mention'
                                                    : fieldMode ===
                                                    'participants'
                                                        ? '@participant1, @participant2'
                                                    : '#tag1, #tag2'
                                            }
                                            className="h-10 rounded-md border border-border/60 bg-background px-2 text-left text-sm shadow-none focus:bg-white focus-visible:ring-0 md:h-8 md:rounded-none md:border-0 md:border-r md:border-muted-foreground/45 md:[border-right-style:dashed] md:bg-transparent md:text-xs"
                                        />
                                    )}
                                </div>

                                <div />

                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 rounded-sm text-muted-foreground opacity-100 md:h-5 md:w-5"
                                    onClick={() =>
                                        setDraftRows((current) =>
                                            current.filter(
                                                (draftRow) =>
                                                    draftRow.id !== row.id,
                                            ),
                                        )
                                    }
                                >
                                    <Trash2 className="h-3 w-3" />
                                </Button>
                            </div>
                            );
                        })}

                        </div>

                        <button
                            type="button"
                            className={cn(
                                'mt-1 flex items-center gap-1.5 px-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground',
                            )}
                            onClick={addEmptyRow}
                        >
                            <Plus className="h-3.5 w-3.5" />
                            <span>Add property</span>
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
