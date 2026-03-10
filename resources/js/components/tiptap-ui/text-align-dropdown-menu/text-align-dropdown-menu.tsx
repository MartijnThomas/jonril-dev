import type { Editor } from "@tiptap/react"
import { useCallback, useMemo, useState } from "react"

import { ChevronDownIcon } from "@/components/tiptap-icons/chevron-down-icon"
import {
  canSetTextAlign,
  textAlignIcons,
  textAlignLabels,
  TextAlignButton,
  type TextAlign,
} from "@/components/tiptap-ui/text-align-button"
import type { ButtonProps } from "@/components/tiptap-ui-primitive/button"
import { Button, ButtonGroup } from "@/components/tiptap-ui-primitive/button"
import { Card, CardBody } from "@/components/tiptap-ui-primitive/card"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/tiptap-ui-primitive/dropdown-menu"
import { useTiptapEditor } from "@/hooks/use-tiptap-editor"

export interface TextAlignDropdownMenuProps extends Omit<ButtonProps, "type"> {
  editor?: Editor
  alignments?: TextAlign[]
  hideWhenUnavailable?: boolean
  onOpenChange?: (isOpen: boolean) => void
  portal?: boolean
}

export function TextAlignDropdownMenu({
  editor: providedEditor,
  alignments = ["left", "center", "right", "justify"],
  hideWhenUnavailable = false,
  onOpenChange,
  portal = false,
  ...props
}: TextAlignDropdownMenuProps) {
  const { editor } = useTiptapEditor(providedEditor)
  const [isOpen, setIsOpen] = useState(false)

  const availableAlignments = useMemo(
    () => alignments.filter((alignment) => canSetTextAlign(editor, alignment)),
    [alignments, editor]
  )
  const isVisible = Boolean(
    editor?.isEditable && (!hideWhenUnavailable || availableAlignments.length > 0)
  )
  const canToggle = availableAlignments.length > 0
  const activeAlignment =
    alignments.find((alignment) => editor?.isActive({ textAlign: alignment })) ??
    "left"
  const Icon = textAlignIcons[activeAlignment]

  const handleOnOpenChange = useCallback(
    (open: boolean) => {
      setIsOpen(open)
      onOpenChange?.(open)
    },
    [onOpenChange]
  )

  if (!isVisible) {
    return null
  }

  const items = hideWhenUnavailable ? availableAlignments : alignments

  return (
    <DropdownMenu open={isOpen} onOpenChange={handleOnOpenChange}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          data-active-state={activeAlignment !== "left" ? "on" : "off"}
          role="button"
          tabIndex={-1}
          disabled={!canToggle}
          data-disabled={!canToggle}
          aria-label="Alignment options"
          tooltip="Alignment"
          {...props}
        >
          <Icon className="tiptap-button-icon" />
          <ChevronDownIcon className="tiptap-button-dropdown-small" />
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="start" portal={portal}>
        <Card>
          <CardBody>
            <ButtonGroup>
              {items.map((alignment) => (
                <DropdownMenuItem key={alignment} asChild>
                  <TextAlignButton
                    editor={editor}
                    align={alignment}
                    text={textAlignLabels[alignment]}
                    showTooltip={false}
                  />
                </DropdownMenuItem>
              ))}
            </ButtonGroup>
          </CardBody>
        </Card>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default TextAlignDropdownMenu
