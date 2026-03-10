import { Extension } from "@tiptap/core"
import { Plugin, PluginKey } from "@tiptap/pm/state"
import { Decoration, DecorationSet } from "@tiptap/pm/view"

import { inlineCommands } from "./inline-commands"

const InlineCommandsPluginKey = new PluginKey("inline-commands")

type ActiveCommandMatch = {
  from: number
  to: number
  query: string
  commandName: string | null
  suffix: string | null
  isExact: boolean
}

function findBestCommand(query: string) {
  const lower = query.toLowerCase()

  return (
    inlineCommands.find(command => command.name.startsWith(lower)) ??
    inlineCommands.find(command =>
      (command.aliases ?? []).some(alias => alias.startsWith(lower))
    ) ??
    null
  )
}

function getActiveCommandMatch(state: any): ActiveCommandMatch | null {
  const { from, empty } = state.selection
  if (!empty) return null

  const $from = state.doc.resolve(from)
  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc")

  const match = textBefore.match(/(?:^|\s)\/([a-z]*)$/i)
  if (!match) return null

  const query = match[1] ?? ""
  const slashText = `/${query}`
  const start = from - slashText.length

  const best = findBestCommand(query)
  if (!best) return null

  const commandName = best.name
  const isExact = commandName.toLowerCase() === query.toLowerCase()
  const suffix = isExact ? null : commandName.slice(query.length)

  return {
    from: start,
    to: from,
    query,
    commandName,
    suffix,
    isExact,
  }
}

export const InlineCommands = Extension.create({
  name: "inlineCommands",

  addProseMirrorPlugins() {
    const editor = this.editor

    return [
      new Plugin({
        key: InlineCommandsPluginKey,

        props: {
          decorations(state) {
            const match = getActiveCommandMatch(state)

            if (!match || !match.suffix) {
              return null
            }

            return DecorationSet.create(state.doc, [
              Decoration.widget(match.to, () => {
                const span = document.createElement("span")
                span.className = "inline-command-ghost"
                span.textContent = match.suffix
                span.contentEditable = "false"
                return span
              }),
            ])
          },

          handleKeyDown(view, event) {
            const match = getActiveCommandMatch(view.state)
            if (!match || !match.commandName) return false

            const command = inlineCommands.find(c => c.name === match.commandName)
            if (!command) return false

            if (event.key === "Tab" || event.key === "Enter") {
              event.preventDefault()

              return command.run(editor, {
                from: match.from,
                to: match.to,
              })
            }

            if (event.key === " " && match.isExact) {
              event.preventDefault()

              return command.run(editor, {
                from: match.from,
                to: match.to,
              })
            }

            return false
          },
        },
      }),
    ]
  },
})
