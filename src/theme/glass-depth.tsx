import { createContext, useContext, type ReactNode } from 'react';

const CompanyGlassDepthContext = createContext<number | null>(null);

export function CompanyGlassDepthProvider({
    children,
    value,
}: {
    children: ReactNode;
    value?: number | null;
}) {
    const normalized = value == null ? null : Math.max(1, Math.min(100, Number(value) || 70));
    return (
        <CompanyGlassDepthContext.Provider value={normalized}>
            {children}
        </CompanyGlassDepthContext.Provider>
    );
}

export function useCompanyGlassDepth() {
    return useContext(CompanyGlassDepthContext);
}
