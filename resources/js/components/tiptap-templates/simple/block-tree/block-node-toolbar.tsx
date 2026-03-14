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
    ListOrdered,
    Link2,
    NotebookText,
    Pilcrow,
    Quote,
    Strikethrough,
    Underline,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
    convertCurrentHeadingToParagraph,
    getCurrentBlockNode,
    normalizeParagraphAttrs,
    setCurrentHeadingLevel,
    setCurrentParagraphStyle,
} from '@/components/tiptap-templates/simple/block-tree/block-tree-model';
import { Button } from '@/components/ui/button';

const BLOCK_NODE_OPTIONS = [
    { value: 'paragraph', label: 'Paragraph', icon: Pilcrow },
    { value: 'bullet', label: 'Bullet list item', icon: List },
    { value: 'ordered', label: 'Ordered list item', icon: ListOrdered },
    { value: 'quote', label: 'Block quote', icon: Quote },
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
    { value: 'highlight', label: 'Highlight', icon: Highlighter },
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

    const attrs = normalizeParagraphAttrs(currentBlock.node.attrs);

    return attrs.blockStyle;
}

function canToggleMark(editor: Editor, mark: BlockMarkType): boolean {
    return editor.isEditable && editor.can().chain().focus().toggleMark(mark).run();
}

function getCurrentMarkState(editor: Editor): Record<BlockMarkType, boolean> {
    return {
        bold: editor.isActive('bold'),
        code: editor.isActive('code'),
        italic: editor.isActive('italic'),
        underline: editor.isActive('underline'),
        strike: editor.isActive('strike'),
        highlight: editor.isActive('highlight'),
    };
}

type BlockMarkType = (typeof BLOCK_MARK_OPTIONS)[number]['value'];

type BlockNodeToolbarProps = {
    editor: Editor;
};

export function BlockNodeToolbar({
    editor,
}: BlockNodeToolbarProps) {
    const [currentValue, setCurrentValue] = useState(() =>
        getCurrentBlockValue(editor),
    );
    const [currentMarks, setCurrentMarks] = useState<Record<BlockMarkType, boolean>>(() =>
        getCurrentMarkState(editor),
    );

    useEffect(() => {
        const updateValue = () => {
            setCurrentValue(getCurrentBlockValue(editor));
            setCurrentMarks(getCurrentMarkState(editor));
        };

        updateValue();
        editor.on('selectionUpdate', updateValue);
        editor.on('update', updateValue);

        return () => {
            editor.off('selectionUpdate', updateValue);
            editor.off('update', updateValue);
        };
    }, [editor]);

    const handleValueChange = (value: string) => {
        const currentBlock = getCurrentBlockNode(editor);
        const currentValue = getCurrentBlockValue(editor);

        if (value === 'paragraph') {
            if (currentBlock?.type === 'paragraph') {
                setCurrentParagraphStyle(editor, 'paragraph');
                return;
            }

            editor.chain().focus().setNode('paragraph', normalizeParagraphAttrs({})).run();
            return;
        }

        if (value === 'bullet' || value === 'ordered' || value === 'quote') {
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

    return (
        <div className="sticky top-16 z-30 w-full border-y border-border/60 bg-background/95 shadow-xs backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <div className="w-full px-2 py-1.5 md:px-4">
                <div className="overflow-x-auto">
                    <div className="mx-auto flex w-max min-w-max items-center gap-2.5">
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
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
