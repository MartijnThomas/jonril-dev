import { getMarkRange } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import {
    AtSign,
    Bold,
    ChevronDown,
    Code2,
    Hash,
    Heading1,
    Heading2,
    Heading3,
    Heading4,
    Heading5,
    Heading6,
    Highlighter,
    Italic,
    IndentDecrease,
    IndentIncrease,
    List,
    ListChecks,
    ListOrdered,
    Link2,
    ImagePlus,
    CalendarDays,
    Minus,
    NotebookText,
    SendToBack,
    Pilcrow,
    Quote,
    SquareCode,
    Strikethrough,
    Subscript,
    Superscript,
    Underline,
} from 'lucide-react';
import { useState } from 'react';
import {
    convertCurrentHeadingToParagraph,
    getCurrentBlockNode,
    normalizeParagraphAttrs,
    setCurrentHeadingLevel,
    setCurrentParagraphStyle,
} from '@/components/tiptap-templates/simple/block-tree/block-tree-model';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from '@/components/ui/popover';

const BLOCK_NODE_OPTIONS = [
    { value: 'paragraph', label: 'Paragraph', icon: Pilcrow },
    { value: 'quote', label: 'Block quote', icon: Quote },
    { value: 'bullet', label: 'Bullet list item', icon: List },
    { value: 'checklist', label: 'Checklist item', icon: ListChecks },
    { value: 'ordered', label: 'Ordered list item', icon: ListOrdered },
    { value: 'code-block', label: 'Code block', icon: SquareCode },
] as const;

const HEADING_OPTIONS = [
    { value: 'heading-1', label: 'Heading 1', icon: Heading1 },
    { value: 'heading-2', label: 'Heading 2', icon: Heading2 },
    { value: 'heading-3', label: 'Heading 3', icon: Heading3 },
    { value: 'heading-4', label: 'Heading 4', icon: Heading4 },
    { value: 'heading-5', label: 'Heading 5', icon: Heading5 },
    { value: 'heading-6', label: 'Heading 6', icon: Heading6 },
] as const;

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

const BLOCK_INSERT_OPTIONS = [
    { value: 'mention', label: 'Insert mention', icon: AtSign, token: '@' },
    { value: 'hashtag', label: 'Insert hashtag', icon: Hash, token: '#' },
    { value: 'wikilink', label: 'Insert wiki-link', icon: NotebookText, token: '[[' },
] as const;

function getCurrentBlockValue(editor: Editor): string {
    const currentBlock = getCurrentBlockNode(editor);

    if (!currentBlock) {
        return 'paragraph';
    }

    if (currentBlock.type === 'heading') {
        const level = Number(currentBlock.node.attrs.level ?? 1);

        return `heading-${Math.min(6, Math.max(1, level))}`;
    }

    if (currentBlock.type === 'codeBlock') {
        return 'code-block';
    }

    const attrs = normalizeParagraphAttrs(currentBlock.node.attrs);

    return attrs.blockStyle;
}

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
    hasMeetingNotes?: boolean;
    showMeetingNotes?: boolean;
    meetingNotesCount?: number;
    onToggleMeetingNotes?: () => void;
};

export function BlockNodeToolbar({
    editor,
    hasMeetingNotes = false,
    showMeetingNotes = false,
    meetingNotesCount = 0,
    onToggleMeetingNotes,
}: BlockNodeToolbarProps) {
    const [linkPopoverOpen, setLinkPopoverOpen] = useState(false);
    const [linkInputValue, setLinkInputValue] = useState('');
    const [linkTextValue, setLinkTextValue] = useState('');

    const { currentValue, currentMarks, currentHighlightColor } = useEditorState({
        editor,
        selector: (ctx) => ({
            currentValue: getCurrentBlockValue(ctx.editor),
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

    const handleValueChange = (value: string) => {
        const currentBlock = getCurrentBlockNode(editor);
        const currentValue = getCurrentBlockValue(editor);

        if (value === 'paragraph') {
            if (currentBlock?.type === 'heading') {
                convertCurrentHeadingToParagraph(editor);
                return;
            }

            if (currentBlock?.type === 'paragraph') {
                setCurrentParagraphStyle(editor, 'paragraph');
                return;
            }

            editor.chain().focus().setNode('paragraph', normalizeParagraphAttrs({})).run();
            return;
        }

        if (value === 'code-block') {
            if (currentValue === 'code-block') {
                editor.chain().focus().setNode('paragraph', normalizeParagraphAttrs({})).run();
                return;
            }

            editor.chain().focus().setNode('codeBlock').run();
            return;
        }

        if (value === 'bullet' || value === 'checklist' || value === 'ordered' || value === 'quote') {
            if (currentValue === value) {
                setCurrentParagraphStyle(editor, 'paragraph');
                return;
            }

            if (currentBlock?.type === 'paragraph') {
                const attrs = normalizeParagraphAttrs(currentBlock.node.attrs);

                setCurrentParagraphStyle(editor, value, {
                    order: value === 'ordered' ? Number(attrs.order ?? 1) : 1,
                });
                return;
            }

            editor.chain().focus().setNode('paragraph', normalizeParagraphAttrs({
                blockStyle: value,
            })).run();

            return;
        }

        const level = Number(value.replace('heading-', ''));

        if (currentValue === value) {
            convertCurrentHeadingToParagraph(editor);
            return;
        }

        setCurrentHeadingLevel(editor, level);
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

    const handleInsertToken = (token: string) => {
        const { state } = editor;
        const { from } = state.selection;
        const $from = state.selection.$from;
        const parentOffset = $from.parentOffset;
        const parentText = $from.parent.textContent ?? '';
        const previousCharacter =
            parentOffset > 0 ? parentText.charAt(parentOffset - 1) : '';
        const needsLeadingSpace =
            parentOffset > 0 && previousCharacter !== '' && !/\s/u.test(previousCharacter);

        editor
            .chain()
            .focus()
            .insertContentAt(from, `${needsLeadingSpace ? ' ' : ''}${token}`)
            .run();
    };

    const openTaskMigratePicker = () => {
        const current = getCurrentBlockNode(editor);
        if (!current || current.type !== 'paragraph') {
            return;
        }

        const attrs = normalizeParagraphAttrs(current.node.attrs);
        if (attrs.blockStyle !== 'task') {
            return;
        }

        const blockId =
            typeof attrs.id === 'string' && attrs.id.trim() !== ''
                ? attrs.id.trim()
                : null;
        let position: number | null = null;

        let counter = 0;
        editor.state.doc.descendants((node, pos) => {
            if (node.type.name !== 'paragraph') {
                return true;
            }

            const nodeAttrs = normalizeParagraphAttrs(node.attrs);
            if (nodeAttrs.blockStyle !== 'task') {
                return true;
            }

            counter += 1;

            if (pos === current.pos) {
                position = counter;
                return false;
            }

            return true;
        });

        const anchorPoint = (() => {
            try {
                const coords = editor.view.coordsAtPos(editor.state.selection.from);
                if (
                    typeof coords?.left === 'number' &&
                    typeof coords?.bottom === 'number'
                ) {
                    return {
                        x: coords.left,
                        y: coords.bottom,
                    };
                }
            } catch {
                return null;
            }

            return null;
        })();

        if (typeof window !== 'undefined') {
            window.dispatchEvent(
                new CustomEvent('task-migrate:open', {
                    detail: {
                        blockId,
                        position,
                        anchorPoint,
                    },
                }),
            );
        }
    };

    const handleInsertImageUpload = () => {
        const insertedViaCommand = editor
            .chain()
            .focus()
            .setImageUploadNode({
                accept: 'image/*',
                limit: 3,
                maxSize: 10 * 1024 * 1024,
            })
            .run();

        if (insertedViaCommand) {
            return;
        }

        const currentBlock = getCurrentBlockNode(editor);
        if (currentBlock) {
            const insertPos = currentBlock.pos + currentBlock.node.nodeSize;
            const insertedAtBlockBoundary = editor
                .chain()
                .focus()
                .insertContentAt(insertPos, {
                    type: 'imageUpload',
                    attrs: {
                        accept: 'image/*',
                        limit: 3,
                        maxSize: 10 * 1024 * 1024,
                    },
                })
                .run();

            if (insertedAtBlockBoundary) {
                return;
            }
        }

        editor
            .chain()
            .focus()
            .insertContent({
                type: 'imageUpload',
                attrs: {
                    accept: 'image/*',
                    limit: 3,
                    maxSize: 10 * 1024 * 1024,
                },
            })
            .run();
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
    const squareButtonBaseClass =
        'size-7 rounded-lg p-0 [&>svg]:size-3.5';
    const subtleActiveSquareButtonClass = `${squareButtonBaseClass} border border-violet-200/70 bg-violet-50 text-violet-600 shadow-none dark:border-violet-400/40 dark:bg-violet-500/20 dark:text-violet-200`;
    const activeSquareButtonHoverClass =
        `${subtleActiveSquareButtonClass} hover:bg-violet-100/70 dark:hover:bg-violet-500/30`;
    const inactiveSquareButtonClass = `${squareButtonBaseClass} border border-transparent text-muted-foreground hover:bg-muted hover:text-foreground`;
    const currentHeadingOption = HEADING_OPTIONS.find((option) => option.value === currentValue) ?? null;
    const HeadingIcon = currentHeadingOption?.icon ?? Heading1;
    const headingButtonLabel = currentHeadingOption?.label ?? 'Headings';
    const isHeadingActive = currentHeadingOption !== null;
    const paragraphOption = BLOCK_NODE_OPTIONS.find((option) => option.value === 'paragraph') ?? BLOCK_NODE_OPTIONS[0];
    const nonParagraphBlockOptions = BLOCK_NODE_OPTIONS.filter((option) => option.value !== 'paragraph');

    const hasMeetingToggle = hasMeetingNotes && !showMeetingNotes;

    return (
        <div className="sticky top-0 z-30 w-full overflow-hidden border-b border-border/60 bg-background/95 shadow-xs backdrop-blur supports-backdrop-filter:bg-background/85">
            <div className={`mx-auto w-full overflow-x-auto overflow-y-hidden px-2 py-1.5 md:px-4 ${hasMeetingToggle ? 'pr-20!' : ''}`}>
                <div className="mx-auto flex w-max min-w-full items-center justify-center gap-2.5">
                        <div className="flex items-center gap-2">
                        <Button
                            key={paragraphOption.value}
                            type="button"
                            size="sm"
                            variant={currentValue === paragraphOption.value ? 'default' : 'ghost'}
                            className={
                                currentValue === paragraphOption.value
                                    ? activeSquareButtonHoverClass
                                    : inactiveSquareButtonClass
                            }
                            onClick={() => handleValueChange(paragraphOption.value)}
                            aria-pressed={currentValue === paragraphOption.value}
                            aria-label={paragraphOption.label}
                            title={paragraphOption.label}
                        >
                            <Pilcrow className="size-4" />
                            <span className="sr-only">{paragraphOption.label}</span>
                        </Button>
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className={
                                        isHeadingActive
                                            ? `${activeSquareButtonHoverClass} w-auto gap-1 px-2`
                                            : `${inactiveSquareButtonClass} w-auto gap-1 px-2`
                                    }
                                    aria-pressed={isHeadingActive}
                                    aria-label="Headings"
                                    title="Headings"
                                >
                                    <HeadingIcon className="size-3.5" />
                                    <ChevronDown className="size-3 text-muted-foreground" />
                                    <span className="sr-only">{headingButtonLabel}</span>
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start">
                                {HEADING_OPTIONS.map((option) => {
                                    const Icon = option.icon;

                                    return (
                                        <DropdownMenuItem
                                            key={option.value}
                                            onSelect={() => handleValueChange(option.value)}
                                            className="gap-2"
                                        >
                                            <Icon className="size-3.5" />
                                            <span className="text-xs text-muted-foreground">{option.label}</span>
                                        </DropdownMenuItem>
                                    );
                                })}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        {nonParagraphBlockOptions.map((option) => {
                            const isActive = currentValue === option.value;
                            const Icon = option.icon;

                            return (
                                <Button
                                    key={option.value}
                                    type="button"
                                    size="sm"
                                    variant={isActive ? 'default' : 'ghost'}
                                    className={
                                        isActive
                                            ? activeSquareButtonHoverClass
                                            : inactiveSquareButtonClass
                                    }
                                    onClick={() => handleValueChange(option.value)}
                                    aria-pressed={isActive}
                                    aria-label={option.label}
                                    title={option.label}
                                >
                                    <Icon className="size-4" />
                                    <span className="sr-only">{option.label}</span>
                                </Button>
                            );
                        })}
                        </div>

                        <div className="h-6 w-px bg-border/60" />

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
                                            <span
                                                data-highlight-picker="true"
                                                className="inline-flex items-center gap-0.5"
                                            >
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
                                                const isActiveColor =
                                                    currentHighlightColor === option.value;

                                                return (
                                                    <button
                                                        key={option.value}
                                                        type="button"
                                                        onClick={() =>
                                                            handleApplyHighlightColor(option.value)
                                                        }
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

                        <div className="h-6 w-px bg-border/60" />

                        <div className="flex items-center gap-2">
                            {BLOCK_INSERT_OPTIONS.map((option) => {
                                const Icon = option.icon;

                                return (
                                    <Button
                                        key={option.value}
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className={inactiveSquareButtonClass}
                                        onClick={() => handleInsertToken(option.token)}
                                        aria-label={option.label}
                                        title={option.label}
                                    >
                                        <Icon className="size-4" />
                                        <span className="sr-only">{option.label}</span>
                                    </Button>
                                );
                            })}

                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className={inactiveSquareButtonClass}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={handleInsertImageUpload}
                                aria-label="Insert image"
                                title="Insert image"
                            >
                                <ImagePlus className="size-4" />
                                <span className="sr-only">Insert image</span>
                            </Button>

                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className={inactiveSquareButtonClass}
                                onClick={() => editor.chain().focus().setHorizontalRule().run()}
                                aria-label="Insert horizontal rule"
                                title="Insert horizontal rule"
                            >
                                <Minus className="size-4" />
                                <span className="sr-only">Insert horizontal rule</span>
                            </Button>

                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className={inactiveSquareButtonClass}
                                onClick={openTaskMigratePicker}
                                aria-label="Migrate task"
                                title="Migrate task"
                                disabled={
                                    !isParagraphBlock ||
                                    normalizeParagraphAttrs(currentBlock?.node.attrs ?? {}).blockStyle !== 'task'
                                }
                            >
                                <SendToBack className="size-4" />
                                <span className="sr-only">Migrate task</span>
                            </Button>
                        </div>
                </div>
            </div>
            {hasMeetingToggle ? (
                <button
                    type="button"
                    onClick={onToggleMeetingNotes}
                    aria-label="Toggle meeting notes"
                    aria-pressed={showMeetingNotes}
                    className={`absolute inset-y-0 right-0 flex items-center gap-1.5 pl-3 pr-2.5 rounded-l-full border-l border-y border-sidebar-border/60 bg-sidebar transition-colors hover:text-foreground ${showMeetingNotes ? 'text-foreground' : 'text-muted-foreground'}`}
                >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-sidebar-border/60 bg-sidebar-accent text-[0.68rem] font-medium tabular-nums">
                        {meetingNotesCount}
                    </span>
                    <CalendarDays className="size-4" />
                </button>
            ) : null}
        </div>
    );
}
