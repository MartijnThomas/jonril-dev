import React, { forwardRef, useEffect, useImperativeHandle, useState } from 'react'

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

const MentionList = forwardRef((props, ref) => {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const hasItems = props.items.length > 0

  const selectItem = index => {
    const item = props.items[index]

    if (item) {
      props.command({ id: item, label: item })
    }
  }

  const upHandler = () => {
    if (!hasItems) return
    setSelectedIndex((selectedIndex + props.items.length - 1) % props.items.length)
  }

  const downHandler = () => {
    if (!hasItems) return
    setSelectedIndex((selectedIndex + 1) % props.items.length)
  }

  const enterHandler = () => {
    if (!hasItems) return
    selectItem(selectedIndex)
  }

  useEffect(() => {
    setSelectedIndex(0)
  }, [props.items])

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowUp') {
        upHandler()
        return true
      }

      if (event.key === 'ArrowDown') {
        downHandler()
        return true
      }

      if (event.key === 'Enter') {
        enterHandler()
        return true
      }

      return false
    },
  }))

  return (
    <Command className="w-56 rounded-md border bg-popover text-popover-foreground shadow-md">
      <CommandList>
        <CommandEmpty>No result</CommandEmpty>
        <CommandGroup heading="Mentions">
          {props.items.map((item, index) => (
            <CommandItem
              key={`${item}-${index}`}
              value={item}
              onSelect={() => selectItem(index)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={index === selectedIndex ? 'bg-accent text-accent-foreground' : ''}
            >
              @{item}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
})

MentionList.displayName = 'MentionList'

export default MentionList
