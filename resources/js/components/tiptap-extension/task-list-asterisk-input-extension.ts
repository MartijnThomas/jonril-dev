import { Extension, wrappingInputRule } from '@tiptap/core';

const ASTERISK_TASK_INPUT_REGEX = /^\s*(\*)\s$/;

export const TaskListAsteriskInputExtension = Extension.create({
    name: 'taskListAsteriskInput',

    addInputRules() {
        const taskListType = this.editor.schema.nodes.taskList;
        if (!taskListType) {
            return [];
        }

        return [
            wrappingInputRule({
                find: ASTERISK_TASK_INPUT_REGEX,
                type: taskListType,
            }),
        ];
    },
});
