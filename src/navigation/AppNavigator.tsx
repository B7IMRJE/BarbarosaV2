import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { NavigationContainer } from "@react-navigation/native";

import { Text, View } from "react-native";

const Tab = createBottomTabNavigator();

function HomeScreen() {
    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text>Home</Text>
        </View>
    );
}

function HealthScreen() {
    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text>Health</Text>
        </View>
    );
}

function EquipmentScreen() {
    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text>Equipment</Text>
        </View>
    );
}

function DocumentsScreen() {
    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text>Documents</Text>
        </View>
    );
}

function HOAScreen() {
    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text>HOA</Text>
        </View>
    );
}

function SettingsScreen() {
    return (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
            <Text>Settings</Text>
        </View>
    );
}

export default function AppNavigator() {
    return (
        <NavigationContainer>
            <Tab.Navigator>
                <Tab.Screen name="Home" component={HomeScreen} />
                <Tab.Screen name="Health" component={HealthScreen} />
                <Tab.Screen name="Equipment" component={EquipmentScreen} />
                <Tab.Screen name="Documents" component={DocumentsScreen} />
                <Tab.Screen name="HOA" component={HOAScreen} />
                <Tab.Screen name="Settings" component={SettingsScreen} />
            </Tab.Navigator>
        </NavigationContainer>
    );
}