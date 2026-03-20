import { useEditorState } from '@tiptap/react';
import type { Editor } from '@tiptap/react';
import {
    AtSign,
    Bold,
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
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const BLOCK_NODE_OPTIONS = [
    { value: 'paragraph', label: 'Paragraph', icon: Pilcrow },
    { value: 'bullet', label: 'Bullet list item', icon: List },
    { value: 'checklist', label: 'Checklist item', icon: ListChecks },
    { value: 'ordered', label: 'Ordered list item', icon: ListOrdered },
    { value: 'quote', label: 'Block quote', icon: Quote },
    { value: 'code-block', label: 'Code block', icon: SquareCode },
    { value: 'heading-1', label: 'H1', icon: Heading1 },
    { value: 'heading-2', label: 'H2', icon: Heading2 },
    { value: 'heading-3', label: 'H3', icon: Heading3 },
    { value: 'heading-4', label: 'H4', icon: Heading4 },
    { value: 'heading-5', label: 'H5', icon: Heading5 },
    { value: 'heading-6', label: 'H6', icon: Heading6 },
] as const;

const BLOCK_MARK_OPTIONS = [
    { value: 'bold', label: 'Bold', icon: Bold },
    { value: 'code', label: 'Inline code', icon: Code2 },
    { value: 'italic', label: 'Italic', icon: Italic },
    { value: 'underline', label: 'Underline', icon: Underline },
    { value: 'strike', label: 'Strikethrough', icon: Strikethrough },
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
    const { currentValue, currentMarks, currentHighlightColor } = useEditorState({
        editor,
        selector: (ctx) => ({
            currentValue: getCurrentBlockValue(ctx.editor),
            currentMarks: getCurrentMarkState(ctx.editor),
            currentHighlightColor: getCurrentHighlightColor(ctx.editor),
        }),
    });

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
        const currentHref = String(editor.getAttributes('link').href ?? '');
        const input = window.prompt(
            'Enter URL (leave empty to remove link)',
            currentHref || 'https://',
        );

        if (input === null) {
            return;
        }

        const href = normalizeLinkHref(input);
        const { from, empty } = editor.state.selection;

        if (href === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }

        if (empty) {
            editor
                .chain()
                .focus()
                .insertContentAt(from, [
                    {
                        type: 'text',
                        text: href,
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
                .setTextSelection(from + href.length + 1)
                .run();

            return;
        }

        editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
    };

    const currentBlock = getCurrentBlockNode(editor);
    const isParagraphBlock = currentBlock?.type === 'paragraph';
    const squareButtonBaseClass =
        'size-8 rounded-md p-0 [&>svg]:size-4';
    const activeSquareButtonClass = `${squareButtonBaseClass} border border-border/80 bg-background text-foreground shadow-xs`;
    const activeSquareButtonHoverClass =
        `${activeSquareButtonClass} hover:border-border hover:bg-accent/40 hover:text-foreground`;
    const inactiveSquareButtonClass = `${squareButtonBaseClass} border border-transparent text-muted-foreground hover:border-border/60 hover:bg-background/70 hover:text-foreground`;

    const hasMeetingToggle = hasMeetingNotes && !showMeetingNotes;

    return (
        <div className="sticky top-0 z-30 w-full overflow-hidden border-b border-border/60 bg-background/95 shadow-xs backdrop-blur supports-backdrop-filter:bg-background/85">
            <div className={`mx-auto w-full overflow-x-auto overflow-y-hidden px-2 py-1.5 md:px-4 ${hasMeetingToggle ? 'pr-20!' : ''}`}>
                <div className="mx-auto inline-flex min-w-max items-center gap-2.5">
                        <div className="flex items-center gap-2">
                        {BLOCK_NODE_OPTIONS.map((option) => {
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
                                        variant={isActive ? 'default' : 'ghost'}
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
                                <div className="relative">
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant={currentMarks.highlight ? 'default' : 'ghost'}
                                        className={
                                            currentMarks.highlight
                                                ? `${activeSquareButtonHoverClass} pr-8`
                                                : `${inactiveSquareButtonClass} pr-8`
                                        }
                                        onClick={handleToggleDefaultHighlight}
                                        aria-pressed={currentMarks.highlight}
                                        aria-label="Toggle default highlight"
                                        title="Toggle default highlight"
                                        disabled={!canHighlight}
                                    >
                                        <Highlighter className="size-4" />
                                        <span className="sr-only">Toggle default highlight</span>
                                    </Button>
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <button
                                                type="button"
                                                className="absolute inset-y-0 right-0 z-10 flex w-6 items-center justify-center rounded-r-md border-l border-border/60 bg-transparent hover:bg-accent/40"
                                                aria-label="Pick highlight color"
                                                title="Pick highlight color"
                                                disabled={!canHighlight}
                                            >
                                                <span
                                                    aria-hidden
                                                    className="inline-block size-3 rounded-[3px] border border-border/60"
                                                    style={{
                                                        backgroundColor:
                                                            currentHighlightColor ??
                                                            DEFAULT_HIGHLIGHT_COLOR,
                                                    }}
                                                />
                                                <span className="sr-only">Pick highlight color</span>
                                            </button>
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
                                                            className={`inline-flex size-5 items-center justify-center rounded-[4px] border ${
                                                                isActiveColor
                                                                    ? 'border-foreground/70'
                                                                    : 'border-border/60'
                                                            }`}
                                                            aria-label={option.label}
                                                            title={option.label}
                                                        >
                                                            <span
                                                                aria-hidden
                                                                className="inline-block size-3 rounded-[3px] border border-black/10"
                                                                style={{ backgroundColor: option.value }}
                                                            />
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        </DropdownMenuContent>
                                    </DropdownMenu>
                                </div>
                            </div>

                            <Button
                                type="button"
                                size="sm"
                                variant={editor.isActive('link') ? 'default' : 'ghost'}
                                className={
                                    editor.isActive('link')
                                        ? activeSquareButtonHoverClass
                                        : inactiveSquareButtonClass
                                }
                                onClick={handleLinkAction}
                                aria-pressed={editor.isActive('link')}
                                aria-label="Insert or edit link"
                                title="Insert or edit link"
                            >
                                <Link2 className="size-4" />
                                <span className="sr-only">Insert or edit link</span>
                            </Button>
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
