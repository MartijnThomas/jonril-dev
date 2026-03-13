import { OrderedList, TaskList } from '@tiptap/extension-list';
import type { Extensions } from '@tiptap/react';
import { BulletListDashInputExtension } from '@/components/tiptap-extension/bullet-list-dash-input-extension';
import { CheckItem } from '@/components/tiptap-extension/check-item-extension';
import { CheckList } from '@/components/tiptap-extension/check-list-extension';
import { CheckListPlusInputExtension } from '@/components/tiptap-extension/check-list-plus-input-extension';
import { ListItemPriorityExtension } from '@/components/tiptap-extension/list-item-priority-extension';
import { ListItemWithPriority } from '@/components/tiptap-extension/list-item-with-priority-extension';
import { TaskItemWithDates } from '@/components/tiptap-extension/task-item-dates-extension';
import { TaskItemStatusExtension } from '@/components/tiptap-extension/task-item-status-extension';
import { TaskListAsteriskInputExtension } from '@/components/tiptap-extension/task-list-asterisk-input-extension';

export function createLegacyListBehaviorExtensions(
    displayLocale: string,
): Extensions {
    return [
        BulletListDashInputExtension,
        OrderedList,
        ListItemWithPriority.configure({}),
        CheckList,
        CheckItem.configure({ nested: true }),
        CheckListPlusInputExtension,
        TaskList,
        TaskListAsteriskInputExtension,
        TaskItemWithDates.configure({ nested: true, displayLocale }),
        ListItemPriorityExtension,
        TaskItemStatusExtension,
    ];
}
