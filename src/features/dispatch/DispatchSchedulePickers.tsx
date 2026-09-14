import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useTheme } from '../../theme/useTheme';
import { DISPATCH_TIME_OPTIONS } from './scheduleTime';

type Anchor = { x: number; y: number; width: number; height: number };
const ROW_HEIGHT = 40;
const pad = (value: number) => String(value).padStart(2, '0');
const dateText = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

function PickerPopup({ anchor, title, onClose, children }: { anchor: Anchor; title: string; onClose: () => void; children: ReactNode }) {
    const { width, height } = useWindowDimensions();
    useEffect(() => {
        if (Platform.OS !== 'web' || typeof document === 'undefined') return;
        // Let the top modal handle keyup without Dispatch's window keydown closing the job.
        const stopParentEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') event.stopPropagation(); };
        document.addEventListener('keydown', stopParentEscape, true);
        return () => document.removeEventListener('keydown', stopParentEscape, true);
    }, []);
    const { theme } = useTheme();
    const popupWidth = Math.min(352, width - 24);
    const popupHeight = Math.min(470, height - 24);
    const left = width < 600 ? (width - popupWidth) / 2 : Math.max(12, Math.min(anchor.x, width - popupWidth - 12));
    const top = width < 600 ? Math.max(12, (height - popupHeight) / 2) : Math.max(12, Math.min(anchor.y + anchor.height + 6, height - popupHeight - 12));
    return (
        <Modal transparent visible animationType="fade" onRequestClose={onClose}>
            <View style={{ flex: 1 }}>
                <Pressable accessibilityRole="button" accessibilityLabel={`Dismiss ${title}`} onPress={onClose} style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(10,25,40,0.18)' }} />
                <View accessibilityViewIsModal style={{ position: 'absolute', left, top, width: popupWidth, maxHeight: popupHeight, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.border, backgroundColor: theme.colors.surface, boxShadow: '0 8px 30px rgba(0,0,0,0.22)', padding: 12 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <Text accessibilityRole="header" style={{ color: theme.colors.text, fontSize: 16, fontWeight: '800' }}>{title}</Text>
                        <Pressable accessibilityRole="button" accessibilityLabel={`Close ${title}`} onPress={onClose} style={{ padding: 8 }}><Text style={{ color: theme.colors.primary }}>Close</Text></Pressable>
                    </View>
                    <ScrollView keyboardShouldPersistTaps="handled" style={{ flexShrink: 1 }}>{children}</ScrollView>
                </View>
            </View>
        </Modal>
    );
}

function PickerTrigger({ label, value, hint, onOpen }: { label: string; value: string; hint?: string; onOpen: (anchor: Anchor) => void }) {
    const { theme } = useTheme();
    const trigger = useRef<View>(null);
    return (
        <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: theme.colors.mutedText, fontSize: 12, marginBottom: 5 }}>{label}</Text>
            <Pressable ref={trigger} accessibilityRole="button" accessibilityLabel={`${label}: ${value}. Open picker`} onPress={() => trigger.current?.measureInWindow((x, y, width, height) => onOpen({ x, y, width, height }))} style={{ minHeight: 44, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderRadius: 10, borderColor: theme.colors.border, backgroundColor: theme.colors.background, justifyContent: 'center' }}>
                <Text numberOfLines={1} style={{ color: theme.colors.text, fontSize: 14, fontWeight: '700' }}>{value || 'Select time'} ▾</Text>
                {!!hint && <Text style={{ color: theme.colors.mutedText, fontSize: 11 }}>{hint}</Text>}
            </Pressable>
        </View>
    );
}

export function DispatchDatePicker({ selectedDate, calendarMonth, onSelectDate, onChangeMonth }: { selectedDate: string; calendarMonth: string; onSelectDate: (date: string) => void; onChangeMonth: (month: string) => void }) {
    const { theme } = useTheme();
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const month = new Date(`${calendarMonth || selectedDate.slice(0, 7)}-01T12:00:00`);
    const validMonth = Number.isNaN(month.getTime()) ? new Date() : month;
    const start = new Date(validMonth.getFullYear(), validMonth.getMonth(), 1, 12);
    start.setDate(start.getDate() - start.getDay());
    const days = Array.from({ length: 42 }, (_, i) => { const day = new Date(start); day.setDate(start.getDate() + i); return day; });
    const selected = new Date(`${selectedDate}T12:00:00`);
    const label = Number.isNaN(selected.getTime()) ? 'Select date' : selected.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
    const changeMonth = (offset: number) => { const next = new Date(validMonth.getFullYear(), validMonth.getMonth() + offset, 1, 12); onChangeMonth(`${next.getFullYear()}-${pad(next.getMonth() + 1)}`); };
    return (
        <>
            <PickerTrigger label="Date" value={label} onOpen={setAnchor} />
            {anchor && <PickerPopup anchor={anchor} title="Scheduled date" onClose={() => setAnchor(null)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Previous month" onPress={() => changeMonth(-1)} style={{ padding: 10 }}><Text style={{ color: theme.colors.primary }}>‹</Text></Pressable>
                    <Text style={{ flex: 1, textAlign: 'center', color: theme.colors.text, fontWeight: '700' }}>{validMonth.toLocaleDateString([], { month: 'long', year: 'numeric' })}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Next month" onPress={() => changeMonth(1)} style={{ padding: 10 }}><Text style={{ color: theme.colors.primary }}>›</Text></Pressable>
                </View>
                <View style={{ flexDirection: 'row' }}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => <Text key={day} style={{ flex: 1, textAlign: 'center', fontSize: 12, color: theme.colors.mutedText }}>{day}</Text>)}</View>
                {Array.from({ length: 6 }, (_, week) => <View key={week} style={{ flexDirection: 'row' }}>
                    {days.slice(week * 7, week * 7 + 7).map(day => {
                        const value = dateText(day);
                        return <Pressable key={value} accessibilityRole="button" accessibilityLabel={value} accessibilityState={{ selected: value === selectedDate }} onPress={() => { onSelectDate(value); setAnchor(null); }} style={{ flex: 1, aspectRatio: 1, margin: 2, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: value === selectedDate ? theme.colors.primary : theme.colors.background }}>
                            <Text numberOfLines={1} style={{ fontSize: 14, color: value === selectedDate ? theme.colors.primaryText : day.getMonth() === validMonth.getMonth() ? theme.colors.text : theme.colors.mutedText }}>{day.getDate()}</Text>
                        </Pressable>;
                    })}
                </View>)}
            </PickerPopup>}
        </>
    );
}

export function DispatchTimePicker({ value, onSelect, label = 'Start Time', hint }: { value: string; onSelect: (time: string) => void; label?: string; hint?: string }) {
    const [anchor, setAnchor] = useState<Anchor | null>(null);
    const formatted = DISPATCH_TIME_OPTIONS.find(option => option.value === value)?.label || value;
    return <>
        <PickerTrigger label={label} value={formatted} hint={hint} onOpen={setAnchor} />
        {anchor && <PickerPopup anchor={anchor} title={label} onClose={() => setAnchor(null)}>
            {label === 'End Time' && <Text style={{ fontSize: 12, marginBottom: 8 }}>An end at or before the start means the next day.</Text>}
            <TimeWheel value={value} label={label} onSelect={(time) => { onSelect(time); setAnchor(null); }} />
        </PickerPopup>}
    </>;
}

function TimeWheel({ value, label, onSelect }: { value: string; label: string; onSelect: (time: string) => void }) {
    const { theme } = useTheme();
    const [hour, minute] = value.split(':').map(Number);
    const initialIndex = Number.isFinite(hour + minute) ? Math.max(0, Math.min(47, Math.round((hour * 60 + minute) / 30))) : 0;
    const [index, setIndex] = useState(initialIndex);
    const wheel = useRef<ScrollView>(null);
    const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (settleTimer.current) clearTimeout(settleTimer.current); }, []);
    const move = (next: number) => { const clamped = Math.max(0, Math.min(47, next)); setIndex(clamped); wheel.current?.scrollTo({ y: clamped * ROW_HEIGHT, animated: false }); };
    const keyboardProps = Platform.OS === 'web' ? { onKeyDown: (event: { key: string; preventDefault: () => void }) => {
        const change = { ArrowDown: 1, ArrowUp: -1, PageDown: 6, PageUp: -6 }[event.key];
        if (change !== undefined) { event.preventDefault(); move(index + change); }
        else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); move(event.key === 'Home' ? 0 : 47); }
        else if (event.key === 'Enter') { event.preventDefault(); onSelect(DISPATCH_TIME_OPTIONS[index].value); }
    } } : {};
    return <View>
        <Text style={{ fontSize: 12, color: theme.colors.mutedText, marginBottom: 8 }}>Scroll to choose · 30-minute steps</Text>
        <View style={{ height: ROW_HEIGHT * 5 }}>
            <View pointerEvents="none" style={{ position: 'absolute', top: ROW_HEIGHT * 2, left: 0, right: 0, height: ROW_HEIGHT, borderRadius: 8, backgroundColor: theme.colors.secondaryButton }} />
            <ScrollView ref={wheel} accessibilityLabel={`${label} wheel`} {...keyboardProps} onLayout={() => wheel.current?.scrollTo({ y: initialIndex * ROW_HEIGHT, animated: false })} style={{ height: ROW_HEIGHT * 5 }} contentContainerStyle={{ paddingVertical: ROW_HEIGHT * 2 }} snapToInterval={ROW_HEIGHT} decelerationRate="fast" scrollEventThrottle={16} onScroll={event => {
                const next = Math.max(0, Math.min(47, Math.round(event.nativeEvent.contentOffset.y / ROW_HEIGHT)));
                setIndex(next);
                if (settleTimer.current) clearTimeout(settleTimer.current);
                settleTimer.current = setTimeout(() => wheel.current?.scrollTo({ y: next * ROW_HEIGHT, animated: false }), 180);
            }}>
                {DISPATCH_TIME_OPTIONS.map((option, optionIndex) => <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.label} accessibilityState={{ selected: index === optionIndex }} onPress={() => move(optionIndex)} style={{ height: ROW_HEIGHT, justifyContent: 'center', alignItems: 'center' }}>
                    <Text style={{ color: index === optionIndex ? theme.colors.primary : theme.colors.mutedText, fontWeight: index === optionIndex ? '800' : '400', fontSize: index === optionIndex ? 20 : 15 }}>{option.label}</Text>
                </Pressable>)}
            </ScrollView>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Use ${DISPATCH_TIME_OPTIONS[index].label}`} onPress={() => onSelect(DISPATCH_TIME_OPTIONS[index].value)} style={{ minHeight: 44, padding: 12, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center', marginTop: 10 }}><Text style={{ color: theme.colors.primaryText, fontWeight: '700' }}>Use {DISPATCH_TIME_OPTIONS[index].label}</Text></Pressable>
    </View>;
}
