import { useCallback, useMemo, useRef, useState } from 'react';
import {
    PanResponder,
    Text,
    TouchableOpacity,
    View,
    type LayoutChangeEvent,
    type ViewStyle,
} from 'react-native';

type SignaturePoint = {
    x: number;
    y: number;
    startsStroke?: boolean;
};

type SignaturePadProps = {
    label: string;
    value: string;
    disabled?: boolean;
    onChange: (value: string) => void;
};

export default function SignaturePad({ label, value, disabled, onChange }: SignaturePadProps) {
    const [size, setSize] = useState({ width: 1, height: 1 });
    const points = useMemo(() => parseSignature(value), [value]);
    const pointsRef = useRef(points);
    pointsRef.current = points;

    const appendPoint = useCallback((x: number, y: number, startsStroke: boolean) => {
        if (disabled || size.width <= 1 || size.height <= 1) return;

        const nextPoint: SignaturePoint = {
            x: clamp(x / size.width),
            y: clamp(y / size.height),
            startsStroke,
        };
        const nextPoints = [...pointsRef.current, nextPoint].slice(-1200);

        pointsRef.current = nextPoints;
        onChange(JSON.stringify({ version: 1, points: nextPoints }));
    }, [disabled, onChange, size.height, size.width]);

    const responder = useMemo(() => PanResponder.create({
        onStartShouldSetPanResponder: () => !disabled,
        onMoveShouldSetPanResponder: () => !disabled,
        onPanResponderGrant: (event) => appendPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, true),
        onPanResponderMove: (event) => appendPoint(event.nativeEvent.locationX, event.nativeEvent.locationY, false),
    }), [appendPoint, disabled]);

    function handleLayout(event: LayoutChangeEvent) {
        const { width, height } = event.nativeEvent.layout;

        setSize({ width: Math.max(width, 1), height: Math.max(height, 1) });
    }

    const segments = points.flatMap((point, index) => {
        if (index === 0 || point.startsStroke) return [];

        const previous = points[index - 1];
        const x1 = previous.x * size.width;
        const y1 = previous.y * size.height;
        const x2 = point.x * size.width;
        const y2 = point.y * size.height;
        const length = Math.hypot(x2 - x1, y2 - y1);
        const angle = Math.atan2(y2 - y1, x2 - x1);

        if (length < 0.4) return [];

        return [{
            key: `${index}-${point.x}-${point.y}`,
            style: {
                position: 'absolute',
                left: x1,
                top: y1 - 1.5,
                width: length,
                height: 3,
                borderRadius: 999,
                backgroundColor: '#071924',
                transformOrigin: 'left center',
                transform: [{ rotate: `${angle}rad` }],
            } satisfies ViewStyle,
        }];
    });

    return (
        <View style={shellStyle}>
            <View style={labelRowStyle}>
                <Text style={labelStyle}>{label}</Text>
                <Text style={statusStyle}>{isDrawnSignature(value) ? 'Signature captured ✓' : 'Not signed'}</Text>
            </View>
            <View
                accessibilityLabel={label}
                accessibilityHint="Draw your signature with a finger, stylus, or mouse."
                onLayout={handleLayout}
                style={[padStyle, disabled && disabledStyle]}
                {...responder.panHandlers}
            >
                <Text style={watermarkStyle}>Sign here</Text>
                <View style={baselineStyle} />
                {segments.map((segment) => <View key={segment.key} style={segment.style} />)}
            </View>
            <View style={footerStyle}>
                <Text style={helpStyle}>Use a finger, stylus, or mouse.</Text>
                <TouchableOpacity
                    accessibilityLabel={`Clear ${label}`}
                    disabled={disabled || points.length === 0}
                    onPress={() => onChange('')}
                    style={[clearButtonStyle, (disabled || points.length === 0) && disabledStyle]}
                >
                    <Text style={clearButtonTextStyle}>Clear</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

export function isDrawnSignature(value: string) {
    return parseSignature(value).length >= 5;
}

function parseSignature(value: string): SignaturePoint[] {
    if (!value) return [];

    try {
        const parsed = JSON.parse(value) as { points?: unknown };

        if (!Array.isArray(parsed.points)) return [];

        return parsed.points.filter((point): point is SignaturePoint => {
            if (!point || typeof point !== 'object') return false;
            const candidate = point as SignaturePoint;
            return Number.isFinite(candidate.x)
                && Number.isFinite(candidate.y)
                && candidate.x >= 0
                && candidate.x <= 1
                && candidate.y >= 0
                && candidate.y <= 1;
        });
    } catch {
        return [];
    }
}

function clamp(value: number) {
    return Math.max(0, Math.min(1, value));
}

const shellStyle = { gap: 7 } as const;
const labelRowStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 } as const;
const labelStyle = { color: '#bdd2dc', fontSize: 13, fontWeight: '700' } as const;
const statusStyle = { color: '#52e0a4', fontSize: 12, fontWeight: '800' } as const;
const padStyle = {
    height: 180,
    overflow: 'hidden',
    borderColor: '#5b7887',
    borderWidth: 1,
    borderRadius: 12,
    backgroundColor: '#f8fbfc',
    position: 'relative',
    touchAction: 'none',
} as const;
const watermarkStyle = { position: 'absolute', alignSelf: 'center', top: 70, color: '#b6c4ca', fontSize: 22, fontWeight: '700' } as const;
const baselineStyle = { position: 'absolute', left: 24, right: 24, bottom: 35, height: 1, backgroundColor: '#afc0c7' } as const;
const footerStyle = { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 } as const;
const helpStyle = { color: '#93adba', fontSize: 12 } as const;
const clearButtonStyle = { borderColor: '#3b7188', borderWidth: 1, borderRadius: 9, paddingVertical: 7, paddingHorizontal: 14 } as const;
const clearButtonTextStyle = { color: '#d8f8ff', fontSize: 12, fontWeight: '800' } as const;
const disabledStyle = { opacity: 0.45 } as const;
