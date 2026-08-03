export type TechnicianClockInResult = {
    deviceRegistered: boolean;
    deviceRegistrationError: unknown | null;
};

export async function runTechnicianClockIn(input: {
    clockIn: () => Promise<unknown>;
    registerDevice: () => Promise<unknown>;
}): Promise<TechnicianClockInResult> {
    await input.clockIn();

    try {
        await input.registerDevice();
        return { deviceRegistered: true, deviceRegistrationError: null };
    } catch (error) {
        return { deviceRegistered: false, deviceRegistrationError: error };
    }
}
