export type DispatchWallLayout = {
    compactHeight: boolean;
    compactWidth: boolean;
    stacked: boolean;
};

export function resolveDispatchWallLayout(
    width: number,
    height: number,
): DispatchWallLayout {
    const stacked = width < 560;

    return {
        compactHeight: height <= 820,
        compactWidth: !stacked && width < 1280,
        stacked,
    };
}
