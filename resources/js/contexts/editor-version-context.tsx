import { createContext, useContext } from 'react';

export type EditorVersion = { hashUrl: string; contentHash: string } | null;

type EditorVersionContextType = {
    version: EditorVersion;
    setVersion: (version: EditorVersion) => void;
};

export const EditorVersionContext = createContext<EditorVersionContextType>({
    version: null,
    setVersion: () => {},
});

export function useEditorVersion(): EditorVersionContextType {
    return useContext(EditorVersionContext);
}
