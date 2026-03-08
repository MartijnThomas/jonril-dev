import type { useEditor } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import { Search } from 'lucide-react';
import type React from 'react';

import { ArrowLeftIcon } from '@/components/tiptap-icons/arrow-left-icon';
import { HighlighterIcon } from '@/components/tiptap-icons/highlighter-icon';
import { LinkIcon } from '@/components/tiptap-icons/link-icon';
import { ThemeToggle } from '@/components/tiptap-templates/simple/theme-toggle';
import { BlockquoteButton } from '@/components/tiptap-ui/blockquote-button';
import { CodeBlockButton } from '@/components/tiptap-ui/code-block-button';
import {
    ColorHighlightPopover,
    ColorHighlightPopoverButton,
    ColorHighlightPopoverContent,
} from '@/components/tiptap-ui/color-highlight-popover';
import { HeadingDropdownMenu } from '@/components/tiptap-ui/heading-dropdown-menu';
import { ImageUploadButton } from '@/components/tiptap-ui/image-upload-button';
import {
    LinkPopover,
    LinkContent,
    LinkButton,
} from '@/components/tiptap-ui/link-popover';
import { ListDropdownMenu } from '@/components/tiptap-ui/list-dropdown-menu';
import { MarkButton } from '@/components/tiptap-ui/mark-button';
import { TextAlignButton } from '@/components/tiptap-ui/text-align-button';
import { UndoRedoButton } from '@/components/tiptap-ui/undo-redo-button';

import { Button } from '@/components/tiptap-ui-primitive/button';
import { Spacer } from '@/components/tiptap-ui-primitive/spacer';
import {
    Toolbar,
    ToolbarGroup,
    ToolbarSeparator,
} from '@/components/tiptap-ui-primitive/toolbar';

type MainToolbarContentProps = {
    onHighlighterClick: () => void;
    onLinkClick: () => void;
    onCommandPaletteClick?: () => void;
    isMobile: boolean;
    compact?: boolean;
};

export function MainToolbarContent({
    onHighlighterClick,
    onLinkClick,
    onCommandPaletteClick,
    isMobile,
    compact,
}: MainToolbarContentProps) {
    const showAdvanced = !compact;

    return (
        <>
            {showAdvanced && isMobile && onCommandPaletteClick && (
                <>
                    <ToolbarGroup>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={onCommandPaletteClick}
                            aria-label="Open command palette"
                        >
                            <Search className="tiptap-button-icon" />
                        </Button>
                    </ToolbarGroup>

                    <ToolbarSeparator />
                </>
            )}

            {!compact && !isMobile && <Spacer />}

            {showAdvanced && (
                <>
                    <ToolbarGroup>
                        <UndoRedoButton action="undo" />
                        <UndoRedoButton action="redo" />
                    </ToolbarGroup>

                    <ToolbarSeparator />
                </>
            )}

            <ToolbarGroup>
                <HeadingDropdownMenu levels={[1, 2, 3, 4]} portal={isMobile} />
                <ListDropdownMenu
                    types={['bulletList', 'orderedList', 'taskList']}
                    portal={isMobile}
                />
                <BlockquoteButton />
                <CodeBlockButton />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <MarkButton type="bold" />
                <MarkButton type="italic" />
                <MarkButton type="strike" />
                <MarkButton type="code" />
                <MarkButton type="underline" />
                {!isMobile ? (
                    <ColorHighlightPopover />
                ) : (
                    <ColorHighlightPopoverButton onClick={onHighlighterClick} />
                )}
                {!isMobile ? (
                    <LinkPopover />
                ) : (
                    <LinkButton onClick={onLinkClick} />
                )}
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <MarkButton type="superscript" />
                <MarkButton type="subscript" />
            </ToolbarGroup>

            <ToolbarSeparator />

            <ToolbarGroup>
                <TextAlignButton align="left" />
                <TextAlignButton align="center" />
                <TextAlignButton align="right" />
                <TextAlignButton align="justify" />
            </ToolbarGroup>

            {showAdvanced && <ToolbarSeparator />}

            {showAdvanced && (
                <ToolbarGroup>
                    <ImageUploadButton text="Add" />
                </ToolbarGroup>
            )}

            {!compact && !isMobile && <Spacer />}
            {!compact && isMobile && <ToolbarSeparator />}

            {showAdvanced && (
                <ToolbarGroup>
                    <ThemeToggle />
                </ToolbarGroup>
            )}
        </>
    );
}

type MobileToolbarContentProps = {
    type: 'highlighter' | 'link';
    onBack: () => void;
};

export function MobileToolbarContent({
    type,
    onBack,
}: MobileToolbarContentProps) {
    return (
        <>
            <ToolbarGroup>
                <Button variant="ghost" onClick={onBack}>
                    <ArrowLeftIcon className="tiptap-button-icon" />
                    {type === 'highlighter' ? (
                        <HighlighterIcon className="tiptap-button-icon" />
                    ) : (
                        <LinkIcon className="tiptap-button-icon" />
                    )}
                </Button>
            </ToolbarGroup>

            <ToolbarSeparator />

            {type === 'highlighter' ? (
                <ColorHighlightPopoverContent />
            ) : (
                <LinkContent />
            )}
        </>
    );
}

type EditorBubbleToolbarProps = {
    editor: NonNullable<ReturnType<typeof useEditor>>;
};

export function EditorBubbleToolbar({ editor }: EditorBubbleToolbarProps) {
    return (
        <BubbleMenu
            editor={editor}
            options={{
                placement: 'top',
            }}
            shouldShow={({ editor, state }) => {
                const { from, to } = state.selection;

                if (editor.isMobile) return false;
                if (from === to) return false;
                if (editor.isActive('image')) return false;

                return editor.isEditable;
            }}
            className="rounded-lg border border-border bg-background/95 p-1 shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/80"
        >
            <Toolbar>
                <MainToolbarContent
                    onHighlighterClick={() => {}}
                    onLinkClick={() => {}}
                    isMobile={false}
                    compact
                />
            </Toolbar>
        </BubbleMenu>
    );
}

type MobileEditorToolbarProps = {
    mobileView: 'main' | 'highlighter' | 'link';
    onBack: () => void;
    onHighlighterClick: () => void;
    onLinkClick: () => void;
    onCommandPaletteClick: () => void;
    toolbarRef: React.RefObject<HTMLDivElement | null>;
};

export function MobileEditorToolbar({
    mobileView,
    onBack,
    onHighlighterClick,
    onLinkClick,
    onCommandPaletteClick,
    toolbarRef,
}: MobileEditorToolbarProps) {
    return (
        <Toolbar
            ref={toolbarRef}
            style={{
                bottom: 0,
            }}
        >
            {mobileView === 'main' ? (
                <MainToolbarContent
                    onHighlighterClick={onHighlighterClick}
                    onLinkClick={onLinkClick}
                    onCommandPaletteClick={onCommandPaletteClick}
                    isMobile
                />
            ) : (
                <MobileToolbarContent
                    type={mobileView === 'highlighter' ? 'highlighter' : 'link'}
                    onBack={onBack}
                />
            )}
        </Toolbar>
    );
}
