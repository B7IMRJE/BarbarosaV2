import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { supabase } from './supabase';

export async function registerHomeOSPushNotifications() {
    if (Platform.OS === 'web') {
        throw new Error('Native push registration is available in the installed iPhone or Android app.');
    }
    if (!Device.isDevice) {
        throw new Error('Push notifications require a physical device.');
    }

    const Notifications = await import('expo-notifications');
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('homeos-updates', {
            name: 'HomeOS updates',
            importance: Notifications.AndroidImportance.DEFAULT,
            vibrationPattern: [0, 250, 250, 250],
        });
    }

    const current = await Notifications.getPermissionsAsync();
    const permission = current.status === 'granted'
        ? current
        : await Notifications.requestPermissionsAsync();
    if (permission.status !== 'granted') {
        throw new Error('Notification permission was not granted. You can still receive updates inside HomeOS.');
    }

    const projectId = Constants.expoConfig?.extra?.eas?.projectId || Constants.easConfig?.projectId;
    if (!projectId) throw new Error('HomeOS push project configuration is missing.');

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    const result = await supabase.rpc('register_communication_push_device', {
        p_expo_push_token: token,
        p_platform: Platform.OS,
        p_device_label: Device.modelName || 'HomeOS device',
    });
    if (result.error) throw result.error;
    return token;
}
