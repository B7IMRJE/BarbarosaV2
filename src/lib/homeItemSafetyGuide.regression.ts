import {
    homeItemSafetyGuideKind,
    isCompleteHomeItemSafetyGuide,
    readHomeItemSafetyGuide,
} from './homeItemSafetyGuide';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}

assert(
    homeItemSafetyGuideKind({
        name: 'Main Water Shutoff',
        category: 'Water Service',
        item_slug: 'garage-main-water-shutoff',
    }) === 'water_main_shutoff',
    'A water-main shutoff card should support the emergency guide.'
);

assert(
    homeItemSafetyGuideKind({
        name: 'Water Heater Shutoff',
        category: 'Water Heater',
        item_slug: 'garage-water-heater-shutoff',
    }) === null,
    'A water-heater valve must not be mistaken for the whole-home water-main shutoff.'
);

assert(
    homeItemSafetyGuideKind({ name: 'Kitchen Faucet', category: 'Fixture' }) === null,
    'Ordinary HomeOS cards must not show an emergency shutoff guide.'
);

assert(
    !isCompleteHomeItemSafetyGuide({
        active: true,
        location_description: 'Left side of the garage.',
        operation_instructions: 'Turn clockwise.',
        photo_storage_path: 'users/a/photo.jpg',
        video_storage_path: '',
    }),
    'The homeowner guide must stay hidden until its video is present.'
);

const complete = readHomeItemSafetyGuide({
    id: 'guide-1',
    property_id: 'property-1',
    home_item_id: 'item-1',
    guide_kind: 'water_main_shutoff',
    location_description: 'From the front door, walk to the left side gate.',
    operation_instructions: 'Turn the blue handle clockwise until it stops.',
    safety_warning: 'Do not touch exposed wiring.',
    storage_bucket: 'item-files',
    photo_storage_path: 'users/a/photo.jpg',
    video_storage_path: 'users/a/video.mp4',
    active: true,
    created_at: '2026-08-05T00:00:00Z',
    updated_at: '2026-08-05T00:00:00Z',
});

assert(complete && isCompleteHomeItemSafetyGuide(complete), 'A complete guide should be readable and visible.');

console.log('homeItemSafetyGuide regression checks passed');
