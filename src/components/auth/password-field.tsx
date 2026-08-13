import { useState } from 'react';
import {
    Pressable,
    Text,
    TextInput,
    View,
    type TextInputProps,
} from 'react-native';

type PasswordFieldProps = Omit<TextInputProps, 'secureTextEntry'>;

export default function PasswordField({ style, ...props }: PasswordFieldProps) {
    const [visible, setVisible] = useState(false);

    return (
        <View style={{ minWidth: 0, position: 'relative', width: '100%' }}>
            <TextInput
                {...props}
                secureTextEntry={!visible}
                style={[style, { minWidth: 0, paddingRight: 58, width: '100%' }]}
            />
            <Pressable
                accessibilityRole="button"
                accessibilityLabel={visible ? 'Hide password' : 'Show password'}
                accessibilityState={{ expanded: visible }}
                hitSlop={8}
                onPress={() => setVisible((current) => !current)}
                style={({ pressed }) => ({
                    alignItems: 'center',
                    borderRadius: 999,
                    height: 40,
                    justifyContent: 'center',
                    opacity: pressed ? 0.6 : 1,
                    position: 'absolute',
                    right: 8,
                    top: 8,
                    width: 40,
                })}
            >
                <Text style={{ fontSize: 19 }} aria-hidden>
                    {visible ? '🙈' : '👁️'}
                </Text>
            </Pressable>
        </View>
    );
}
