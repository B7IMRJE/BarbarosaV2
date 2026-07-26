import { createContext, useContext, type ReactNode } from 'react';
import { orbitalGlassPalette, type GlassPalette } from './glassPalette';

const GlassPaletteContext = createContext<GlassPalette>(orbitalGlassPalette);

export function GlassPaletteProvider({
    children,
    palette,
}: {
    children: ReactNode;
    palette?: GlassPalette | null;
}) {
    return (
        <GlassPaletteContext.Provider value={palette || orbitalGlassPalette}>
            {children}
        </GlassPaletteContext.Provider>
    );
}

export function useGlassPalette() {
    return useContext(GlassPaletteContext);
}
