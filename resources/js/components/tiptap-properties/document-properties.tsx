import {
    ChevronDown,
    ChevronRight,
    GripVertical,
    Plus,
    Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

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
import { cn } from '@/lib/utils';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

export type DocumentPropertiesValue = Record<string, string>;

type DocumentPropertiesProps = {
    value: DocumentPropertiesValue;
    onChange: (value: DocumentPropertiesValue) => void;
    options?: string[];
    defaultCollapsed?: boolean;
};

const DEFAULT_PROPERTY_OPTIONS = [
    'type',
    'title',
    'context',
    'project',
] as const;

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

export function DocumentProperties({
    value,
    onChange,
    options = [...DEFAULT_PROPERTY_OPTIONS],
    defaultCollapsed = true,
}: DocumentPropertiesProps) {
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

    const keyInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const valueInputRefs = useRef<Record<string, HTMLInputElement | null>>({});
    const existingValueInputRefs = useRef<
        Record<string, HTMLInputElement | null>
    >({});

    const entries = useMemo(() => Object.entries(value), [value]);

    const availableOptions = useMemo(() => {
        const existing = new Set([
            ...Object.keys(value),
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
        onChange(next);
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
        const search = searchByRow[rowId] ?? draftValue;

        const existingKeys = new Set(Object.keys(value));
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
        <div className="mb-4">
            <div className="flex items-center justify-between border-b pb-1">
                <button
                    type="button"
                    onClick={() => setCollapsed((current) => !current)}
                    className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                >
                    {collapsed ? (
                        <ChevronRight className="h-3.5 w-3.5" />
                    ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                    )}
                    <span>
                        Properties ({entries.length + draftRows.length})
                    </span>
                </button>

                <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 rounded-sm text-muted-foreground"
                    onClick={addEmptyRow}
                >
                    <Plus className="h-3.5 w-3.5" />
                </Button>
            </div>

            {!collapsed && (
                <div className="pt-2">
                    <div className="grid grid-cols-[18px_minmax(120px,180px)_minmax(0,1fr)_20px] items-center gap-3 px-1 pb-1 text-xs text-muted-foreground">
                        <div />
                        <div>Key</div>
                        <div>Value</div>
                        <div />
                    </div>

                    <div className="space-y-px">
                        {entries.map(([key, propertyValue]) => {
                            const rowId = `existing:${key}`;
                            const keyDraft = existingKeyDrafts[key] ?? key;

                            return (
                                <div
                                    key={key}
                                    className="group grid grid-cols-[18px_minmax(120px,180px)_minmax(0,1fr)_20px] items-center gap-3 rounded-sm px-1 py-px"
                                >
                                    <div className="flex items-center justify-center text-muted-foreground/50">
                                        <GripVertical className="h-3 w-3" />
                                    </div>

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
                                        <PopoverTrigger asChild>
                                            <Input
                                                value={keyDraft}
                                                onFocus={() => {
                                                    setOpenRowId(rowId);
                                                    setSearchByRow(
                                                        (current) => ({
                                                            ...current,
                                                            [rowId]: keyDraft,
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
                                                    if (event.key === 'Enter') {
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
                                                className="h-8 border-0 bg-transparent px-2 text-left text-sm shadow-none focus:bg-muted/60 focus-visible:ring-0"
                                            />
                                        </PopoverTrigger>

                                        {renderExistingKeyPopoverContent(
                                            key,
                                            rowId,
                                        )}
                                    </Popover>

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
                                                (event.metaKey || event.ctrlKey)
                                            ) {
                                                event.preventDefault();
                                                addEmptyRow();
                                            }
                                        }}
                                        placeholder="Value"
                                        className="h-8 border-0 bg-transparent px-2 text-left text-sm shadow-none focus:bg-muted/60 focus-visible:ring-0"
                                    />

                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-5 w-5 rounded-sm text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                                        onClick={() => removeProperty(key)}
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            );
                        })}

                        {draftRows.map((row) => (
                            <div
                                key={row.id}
                                className="group grid grid-cols-[18px_minmax(120px,180px)_minmax(0,1fr)_20px] items-center gap-3 rounded-sm px-1 py-px"
                            >
                                <div className="flex items-center justify-center text-muted-foreground/50">
                                    <GripVertical className="h-3 w-3" />
                                </div>

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
                                            className="h-8 border-0 bg-transparent px-2 text-left text-sm shadow-none focus:bg-muted/60 focus-visible:ring-0"
                                        />
                                    </PopoverTrigger>

                                    {renderDraftKeyPopoverContent(row.id)}
                                </Popover>

                                <div>
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
                                                                  .target.value,
                                                          }
                                                        : draftRow,
                                                ),
                                            )
                                        }
                                        onBlur={() => {
                                            const currentRow = draftRows.find(
                                                (draftRow) =>
                                                    draftRow.id === row.id,
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
                                        }}
                                        onKeyDown={(event) => {
                                            if (
                                                event.key === 'Enter' &&
                                                (event.metaKey || event.ctrlKey)
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
                                        className="h-8 border-0 bg-transparent px-2 text-left text-sm shadow-none focus:bg-muted/60 focus-visible:ring-0"
                                    />
                                </div>

                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 rounded-sm text-muted-foreground opacity-100"
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
                        ))}

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
                </div>
            )}
        </div>
    );
}
