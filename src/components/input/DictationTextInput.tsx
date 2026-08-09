import { forwardRef, useId, useRef } from 'react';
import {
    ActivityIndicator,
    StyleSheet,
    Text,
    TextInput,
    type TextInputProps,
    TouchableOpacity,
    View,
    type StyleProp,
    type ViewStyle,
} from 'react-native';
import { appendDictation, supportsDictationInput } from '../../lib/dictation';
import { useDictation } from './DictationProvider';

export type DictationTextInputProps = TextInputProps & {
    dictationEnabled?: boolean;
    dictationFieldLabel?: string;
    dictationContainerStyle?: StyleProp<ViewStyle>;
};

const DictationTextInput = forwardRef<TextInput, DictationTextInputProps>(function DictationTextInput(
    {
        dictationEnabled = true,
        dictationFieldLabel,
        dictationContainerStyle,
        style,
        ...props
    },
    ref,
) {
    const generatedId = useId();
    const valueRef = useRef(typeof props.value === 'string' ? props.value : '');
    const { activeFieldId, phase, toggleDictation } = useDictation();
    const showDictation = supportsDictationInput(props, dictationEnabled);

    valueRef.current = typeof props.value === 'string' ? props.value : '';

    if (!showDictation) {
        return <TextInput {...props} ref={ref} style={style} />;
    }

    const fieldId = `dictation-${generatedId}`;
    const isActive = activeFieldId === fieldId;
    const isRecording = isActive && phase === 'recording';
    const isTranscribing = isActive && phase === 'transcribing';
    const label = dictationFieldLabel || props.accessibilityLabel || props.placeholder || 'text field';
    const flattenedStyle = StyleSheet.flatten(style) || {};
    const wrapperLayout = pickWrapperLayout(flattenedStyle);

    return (
        <View style={[styles.wrapper, wrapperLayout, dictationContainerStyle]}>
            <TextInput
                {...props}
                ref={ref}
                style={[style, styles.inputWithButton]}
            />
            <TouchableOpacity
                accessibilityHint={isRecording ? 'Stops recording and transcribes your speech' : 'Starts recording speech for this field'}
                accessibilityLabel={isRecording ? `Stop dictating ${label}` : `Dictate ${label}`}
                accessibilityRole="button"
                disabled={phase === 'transcribing' || (Boolean(activeFieldId) && !isActive)}
                onPress={() => void toggleDictation({
                    fieldId,
                    fieldLabel: String(label),
                    onTranscript: (transcript) => props.onChangeText?.(appendDictation(valueRef.current, transcript)),
                })}
                style={[
                    styles.button,
                    props.multiline && styles.multilineButton,
                    isRecording && styles.recordingButton,
                    (phase === 'transcribing' || (Boolean(activeFieldId) && !isActive)) && styles.disabledButton,
                ]}
            >
                {isTranscribing ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                    <Text style={styles.buttonText}>{isRecording ? '■' : '🎙'}</Text>
                )}
            </TouchableOpacity>
        </View>
    );
});

export default DictationTextInput;

function pickWrapperLayout(style: object): ViewStyle {
    const styleRecord = style as Record<string, unknown>;
    const keys: (keyof ViewStyle)[] = [
        'alignSelf',
        'flex',
        'flexBasis',
        'flexGrow',
        'flexShrink',
        'maxWidth',
        'minWidth',
        'width',
    ];

    return keys.reduce<ViewStyle>((layout, key) => {
        const value = styleRecord[key as string];

        if (value !== undefined) (layout as Record<string, unknown>)[key] = value;
        return layout;
    }, {});
}

const styles = StyleSheet.create({
    wrapper: {
        position: 'relative',
    },
    inputWithButton: {
        alignSelf: 'stretch',
        flexBasis: 'auto',
        flexGrow: 0,
        flexShrink: 0,
        paddingRight: 48,
        width: '100%',
    },
    button: {
        alignItems: 'center',
        backgroundColor: '#176B5B',
        borderRadius: 18,
        height: 36,
        justifyContent: 'center',
        position: 'absolute',
        right: 6,
        top: '50%',
        transform: [{ translateY: -18 }],
        width: 36,
    },
    multilineButton: {
        top: 8,
        transform: [],
    },
    recordingButton: {
        backgroundColor: '#B42318',
    },
    disabledButton: {
        opacity: 0.45,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 17,
        lineHeight: 20,
    },
});
