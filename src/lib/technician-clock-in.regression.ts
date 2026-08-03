import { runTechnicianClockIn } from './technician-clock-in';

void runTechnicianClockInRegressions();

export async function runTechnicianClockInRegressions() {
    await deviceRegistrationFailureCannotBlockClockIn();
    await clockInFailureStopsDeviceRegistration();
    await successfulClockInRegistersTheDeviceAfterward();
}

async function deviceRegistrationFailureCannotBlockClockIn() {
    const events: string[] = [];
    const deviceError = new Error('Device registration unavailable.');
    const result = await runTechnicianClockIn({
        clockIn: async () => {
            events.push('clocked-in');
        },
        registerDevice: async () => {
            events.push('device-attempted');
            throw deviceError;
        },
    });

    assert(events.join('|') === 'clocked-in|device-attempted', 'Clock-in should happen before optional device registration.');
    assert(!result.deviceRegistered, 'A failed device registration should be reported as optional degradation.');
    assert(result.deviceRegistrationError === deviceError, 'The optional device error should remain available for diagnostics.');
}

async function clockInFailureStopsDeviceRegistration() {
    let deviceAttempted = false;
    let rejected = false;

    try {
        await runTechnicianClockIn({
            clockIn: async () => {
                throw new Error('Clock-in failed.');
            },
            registerDevice: async () => {
                deviceAttempted = true;
            },
        });
    } catch {
        rejected = true;
    }

    assert(rejected, 'A core clock-in failure should still reject the action.');
    assert(!deviceAttempted, 'Device registration should not run when the core clock-in fails.');
}

async function successfulClockInRegistersTheDeviceAfterward() {
    const result = await runTechnicianClockIn({
        clockIn: async () => undefined,
        registerDevice: async () => undefined,
    });

    assert(result.deviceRegistered, 'A successful optional registration should be recorded.');
    assert(result.deviceRegistrationError === null, 'A successful registration should not report an error.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
