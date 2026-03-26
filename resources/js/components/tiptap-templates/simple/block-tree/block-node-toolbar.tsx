import { getMarkRange } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
    Bold,
    ChevronDown,
    Code2,
    Highlighter,
    IndentDecrease,
    IndentIncrease,
    Italic,
    Link2,
    Strikethrough,
    Subscript,
    Superscript,
    Underline,
} from 'lucide-react';
import { useState } from 'react';
import { getCurrentBlockNode } from '@/components/tiptap-templates/simple/block-tree/block-tree-model';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

const BLOCK_MARK_OPTIONS = [
    { value: 'bold', label: 'Bold', icon: Bold },
    { value: 'italic', label: 'Italic', icon: Italic },
    { value: 'underline', label: 'Underline', icon: Underline },
    { value: 'strike', label: 'Strikethrough', icon: Strikethrough },
    { value: 'code', label: 'Inline code', icon: Code2 },
    { value: 'superscript', label: 'Superscript', icon: Superscript },
    { value: 'subscript', label: 'Subscript', icon: Subscript },
] as const;

const DEFAULT_HIGHLIGHT_COLOR = 'var(--tt-color-highlight-yellow)';

const HIGHLIGHT_COLOR_OPTIONS = [
    { value: 'var(--tt-color-highlight-yellow)', label: 'Yellow' },
    { value: 'var(--tt-color-highlight-green)', label: 'Green' },
    { value: 'var(--tt-color-highlight-blue)', label: 'Blue' },
    { value: 'var(--tt-color-highlight-purple)', label: 'Purple' },
    { value: 'var(--tt-color-highlight-red)', label: 'Red' },
    { value: 'var(--tt-color-highlight-orange)', label: 'Orange' },
    { value: 'var(--tt-color-highlight-pink)', label: 'Pink' },
    { value: 'var(--tt-color-highlight-gray)', label: 'Gray' },
    { value: 'var(--tt-color-highlight-brown)', label: 'Brown' },
] as const;

function canToggleMark(editor: Editor, mark: BlockMarkType): boolean {
    return editor.isEditable && editor.can().toggleMark(mark);
}

function getCurrentMarkState(editor: Editor): CurrentMarkState {
    return {
        bold: editor.isActive('bold'),
        code: editor.isActive('code'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike'),
        highlight: editor.isActive('highlight'),
        superscript: editor.isActive('superscript'),
        subscript: editor.isActive('subscript'),
    };
}

function getCurrentHighlightColor(editor: Editor): string | null {
    const color = editor.getAttributes('highlight').color;
    if (typeof color !== 'string' || color.trim() === '') {
        return null;
    }

    return color.trim();
}

type BlockMarkType = (typeof BLOCK_MARK_OPTIONS)[number]['value'];
type CurrentMarkState = Record<BlockMarkType, boolean> & {
    highlight: boolean;
};

type BlockNodeToolbarProps = {
    editor: Editor;
    mode: 'mobile' | 'bubble';
    visible?: boolean;
    keyboardInset?: number;
};

export function BlockNodeToolbar({
    editor,
    mode,
    visible = true,
    keyboardInset = 0,
}: BlockNodeToolbarProps) {
    const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
    const [linkInputValue, setLinkInputValue] = useState('');
    const [linkTextValue, setLinkTextValue] = useState('');

    const { currentMarks, currentHighlightColor } = useEditorState({
        editor,
        selector: (ctx) => ({
            currentMarks: getCurrentMarkState(ctx.editor),
            currentHighlightColor: getCurrentHighlightColor(ctx.editor),
        }),
    });

    const isLinkActive = editor.isActive('link');
    const currentLinkHref = String(editor.getAttributes('link').href ?? '').trim();

    const getCurrentLinkText = (): string => {
        const { state } = editor;
        const { from, to, empty } = state.selection;

        if (!empty) {
            return state.doc.textBetween(from, to, '');
        }

        const linkMark = state.schema.marks.link;
        const range = getMarkRange(state.selection.$from, linkMark);

        if (!range) {
            return '';
        }

        return state.doc.textBetween(range.from, range.to, '');
    };

    const handleMarkToggle = (mark: BlockMarkType) => {
        editor.chain().focus().toggleMark(mark).run();
    };

    const canHighlight = editor.isEditable && editor.can().toggleHighlight();

    const handleToggleDefaultHighlight = () => {
        editor
            .chain()
            .focus()
            .toggleHighlight({ color: DEFAULT_HIGHLIGHT_COLOR })
            .run();
    };

    const handleApplyHighlightColor = (color: string) => {
        editor.chain().focus().setHighlight({ color }).run();
    };

    const handleIndent = () => {
        editor.commands.indentBlockParagraph();
    };

    const handleDedent = () => {
        editor.commands.dedentBlockParagraph();
    };

    const normalizeLinkHref = (value: string): string => {
        const trimmed = value.trim();
        if (trimmed === '') {
            return '';
        }

        if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed)) {
            return `mailto:${trimmed}`;
        }

        if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/iu.test(trimmed)) {
            return trimmed;
        }

        return `https://${trimmed}`;
    };

    const handleLinkAction = () => {
        const href = normalizeLinkHref(linkInputValue);
        const { state } = editor;
        const { from, to, empty } = state.selection;

        if (href === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            setLinkPopoverOpen(false);
            return;
        }

        const normalizedText = linkTextValue.trim();
        const selectedText = state.doc.textBetween(from, to, '');

        if (empty) {
            const linkMark = state.schema.marks.link;
            const range = getMarkRange(state.selection.$from, linkMark);

            if (range) {
                const existingText = state.doc.textBetween(range.from, range.to, '');
                const finalText = normalizedText !== '' ? normalizedText : (existingText || href);

                editor
                    .chain()
                    .focus()
                    .insertContentAt({ from: range.from, to: range.to }, finalText)
                    .setTextSelection({ from: range.from, to: range.from + finalText.length })
                    .setLink({ href })
                    .setTextSelection(range.from + finalText.length)
                    .run();

                setLinkPopoverOpen(false);
                return;
            }

            const finalText = normalizedText !== '' ? normalizedText : href;

            editor
                .chain()
                .focus()
                .insertContentAt(from, [
                    {
                        type: 'text',
                        text: finalText,
                        marks: [
                            {
                                type: 'link',
                                attrs: { href },
                            },
                        ],
                    },
                    {
                        type: 'text',
                        text: ' ',
                    },
                ])
                .setTextSelection(from + finalText.length + 1)
                .run();

            setLinkPopoverOpen(false);
            return;
        }

        const finalText = normalizedText !== '' ? normalizedText : (selectedText || href);

        editor
            .chain()
            .focus()
            .insertContentAt({ from, to }, finalText)
            .setTextSelection({ from, to: from + finalText.length })
            .setLink({ href })
            .setTextSelection(from + finalText.length)
            .run();

        setLinkPopoverOpen(false);
    };

    const handleRemoveLink = () => {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        setLinkPopoverOpen(false);
    };

    const currentBlock = getCurrentBlockNode(editor);
    const isParagraphBlock = currentBlock?.type === 'paragraph';
    const squareButtonBaseClass = 'size-7 rounded-lg p-0 [&>svg]:size-3.5';
    const subtleActiveSquareButtonClass = `${squareButtonBaseClass} border border-violet-200/70 bg-violet-50 text-violet-600 shadow-none dark:border-violet-400/40 dark:bg-violet-500/20 dark:text-violet-200`;
    const activeSquareButtonHoverClass = `${subtleActiveSquareButtonClass} hover:bg-violet-100/70 dark:hover:bg-violet-500/30`;
    const inactiveSquareButtonClass = `${squareButtonBaseClass} border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground`;
    const preserveEditorSelectionOnToolbarMouseDown = (event: React.MouseEvent) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }

        if (target.closest('button') !== null) {
            event.preventDefault();
        }
    };

    const toolbarControls = (
        <>
            <div className="flex items-center gap-2">
                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={inactiveSquareButtonClass}
                    onClick={handleIndent}
                    aria-label="Indent block"
                    title="Indent block"
                    disabled={!isParagraphBlock}
                >
                    <IndentIncrease className="size-4" />
                    <span className="sr-only">Indent block</span>
                </Button>

                <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className={inactiveSquareButtonClass}
                    onClick={handleDedent}
                    aria-label="Dedent block"
                    title="Dedent block"
                    disabled={!isParagraphBlock}
                >
                    <IndentDecrease className="size-4" />
                    <span className="sr-only">Dedent block</span>
                </Button>
            </div>

            <div className="h-6 w-px bg-border/60" />

            <div className="flex items-center gap-2">
                {BLOCK_MARK_OPTIONS.map((option) => {
                    const isActive = currentMarks[option.value];
                    const isDisabled = !canToggleMark(editor, option.value);
                    const Icon = option.icon;

                    return (
                        <Button
                            key={option.value}
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={
                                isActive
                                    ? activeSquareButtonHoverClass
                                    : inactiveSquareButtonClass
                            }
                            onClick={() => handleMarkToggle(option.value)}
                            aria-pressed={isActive}
                            aria-label={option.label}
                            title={option.label}
                            disabled={isDisabled}
                        >
                            <Icon className="size-4" />
                            <span className="sr-only">{option.label}</span>
                        </Button>
                    );
                })}

                <div className="flex items-center">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className={
                                    currentMarks.highlight
                                        ? 'h-7 gap-0.5 rounded-lg border border-violet-200/70 bg-violet-50 px-1.5 text-foreground shadow-none hover:bg-violet-100/70 dark:border-violet-400/40 dark:bg-violet-500/20 dark:text-violet-100 dark:hover:bg-violet-500/30'
                                        : 'h-7 gap-0.5 rounded-lg border border-transparent px-1.5 text-muted-foreground shadow-none hover:bg-muted hover:text-foreground'
                                }
                                onPointerDown={(event) => {
                                    const target = event.target as HTMLElement | null;
                                    const isPickerZone = target?.closest('[data-highlight-picker="true"]') !== null;
                                    if (!isPickerZone) {
                                        event.preventDefault();
                                    }
                                }}
                                onClick={(event) => {
                                    const target = event.target as HTMLElement | null;
                                    const isPickerZone = target?.closest('[data-highlight-picker="true"]') !== null;
                                    if (!isPickerZone) {
                                        handleToggleDefaultHighlight();
                                    }
                                }}
                                aria-pressed={currentMarks.highlight}
                                aria-label="Toggle default highlight or pick color"
                                title="Toggle default highlight or pick color"
                                disabled={!canHighlight}
                            >
                                <Highlighter
                                    className={
                                        currentMarks.highlight
                                            ? 'size-3.5 text-violet-600 dark:text-violet-200'
                                            : 'size-3.5'
                                    }
                                />
                                <span data-highlight-picker="true" className="inline-flex items-center gap-0.5">
                                    <span
                                        aria-hidden
                                        className="inline-block size-2 rounded-full border border-border/50"
                                        style={{
                                            backgroundColor:
                                                currentHighlightColor ??
                                                DEFAULT_HIGHLIGHT_COLOR,
                                        }}
                                    />
                                    <ChevronDown className="size-2.5 text-muted-foreground" />
                                </span>
                                <span className="sr-only">Toggle default highlight or pick color</span>
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="start" className="px-2 py-1.5">
                            <div className="flex items-center gap-1.5">
                                {HIGHLIGHT_COLOR_OPTIONS.map((option) => {
                                    const isActiveColor = currentHighlightColor === option.value;

                                    return (
                                        <button
                                            key={option.value}
                                            type="button"
                                            onClick={() => handleApplyHighlightColor(option.value)}
                                            className={`inline-flex size-5 items-center justify-center rounded-full border ${
                                                isActiveColor
                                                    ? 'border-foreground/70'
                                                    : 'border-border/60'
                                            }`}
                                            aria-label={option.label}
                                            title={option.label}
                                        >
                                            <span
                                                aria-hidden
                                                className="inline-block size-3 rounded-full border border-black/10"
                                                style={{ backgroundColor: option.value }}
                                            />
                                        </button>
                                    );
                                })}
                            </div>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <Popover
                    open={linkPopoverOpen}
                    onOpenChange={(open) => {
                        setLinkPopoverOpen(open);
                        if (open) {
                            setLinkInputValue(currentLinkHref);
                            setLinkTextValue(getCurrentLinkText());
                        }
                    }}
                >
                    <PopoverTrigger asChild>
                        <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className={
                                isLinkActive
                                    ? activeSquareButtonHoverClass
                                    : inactiveSquareButtonClass
                            }
                            aria-pressed={isLinkActive}
                            aria-label="Insert or edit link"
                            title="Insert or edit link"
                        >
                            <Link2 className="size-4" />
                            <span className="sr-only">Insert or edit link</span>
                        </Button>
                    </PopoverTrigger>
                    <PopoverContent align="start" className="w-[19rem] p-2.5">
                        <div className="space-y-2">
                            <div className="space-y-1">
                                <label className="block text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                    Address
                                </label>
                                <input
                                    type="url"
                                    value={linkInputValue}
                                    onChange={(event) => setLinkInputValue(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            handleLinkAction();
                                        }
                                    }}
                                    placeholder="https://example.com"
                                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="block text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
                                    Display text
                                </label>
                                <input
                                    type="text"
                                    value={linkTextValue}
                                    onChange={(event) => setLinkTextValue(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter') {
                                            event.preventDefault();
                                            handleLinkAction();
                                        }
                                    }}
                                    placeholder="Visible title (optional)"
                                    className="h-8 w-full rounded-md border border-border bg-background px-2 text-sm focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:outline-none"
                                />
                            </div>
                            <div className="flex items-center justify-end gap-1.5">
                                {(isLinkActive || linkInputValue.trim() !== '') ? (
                                    <button
                                        type="button"
                                        onClick={handleRemoveLink}
                                        className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                                    >
                                        Remove
                                    </button>
                                ) : null}
                                <button
                                    type="button"
                                    onClick={handleLinkAction}
                                    className="rounded-md bg-muted px-2 py-1 text-xs text-foreground hover:bg-muted/80"
                                >
                                    Apply
                                </button>
                            </div>
                        </div>
                    </PopoverContent>
                </Popover>
            </div>
        </>
    );

    if (mode === 'bubble') {
        return (
            <BubbleMenu
                editor={editor}
                options={{ placement: 'top' }}
                shouldShow={({ editor: bubbleEditor, state }) => {
                    if (!visible || !bubbleEditor.isEditable) {
                        return false;
                    }

                    const { from, to } = state.selection;
                    if (from === to || bubbleEditor.isActive('image')) {
                        return false;
                    }

                    return true;
                }}
                className="relative z-[90] rounded-lg border border-border bg-background/95 p-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/80"
            >
                <div
                    data-bt-editor-toolbar="true"
                    className="flex items-center gap-2"
                    onMouseDownCapture={preserveEditorSelectionOnToolbarMouseDown}
                >
                    {toolbarControls}
                </div>
            </BubbleMenu>
        );
    }

    return (
        <div
            data-bt-editor-toolbar="true"
            className={`fixed inset-x-0 z-[95] px-3 md:hidden ${visible ? '' : 'hidden'}`}
            style={{
                bottom: `calc(${Math.max(8, keyboardInset + 8)}px + env(safe-area-inset-bottom, 0px))`,
            }}
        >
            <div className="mx-auto w-fit max-w-[calc(100vw-1.5rem)] overflow-x-auto rounded-xl border border-border/70 bg-background/95 p-1 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/85">
                <div
                    className="flex items-center gap-2"
                    onMouseDownCapture={preserveEditorSelectionOnToolbarMouseDown}
                >
                    {toolbarControls}
                </div>
            </div>
        </div>
    );
}
