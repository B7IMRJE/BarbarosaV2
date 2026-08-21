import {
    HOME_OS_REVIEW_INITIAL_STATE,
    cardsForHomeOSReviewScope,
    homeOSReviewBackLabel,
    homeOSReviewExteriorCards,
    homeOSReviewInteriorCards,
    homeOSReviewWorkflowCards,
    selectedHomeOSReviewCard,
    transitionHomeOSReview,
    type HomeOSReviewScope,
    type HomeOSReviewState,
} from './homeosReviewFlow';
import { resolveHomeOSSemanticVisual } from '../components/homeos/homeos-visual-assets';

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(`HomeOS review flow regression failed: ${message}`);
}

assert(HOME_OS_REVIEW_INITIAL_STATE.level === 'landing', 'The review must start on the property landing.');
const home = transitionHomeOSReview(HOME_OS_REVIEW_INITIAL_STATE, { type: 'open_home' });
assert(home.level === 'home', 'The single My Home card must open the chooser.');
assert(homeOSReviewBackLabel(home) === 'Back to Property', 'The chooser must return to the property landing.');
assert(
    transitionHomeOSReview(home, { type: 'back' }).level === 'landing',
    'Back from the chooser must restore the property landing.',
);

verifyScope('interior', homeOSReviewInteriorCards, ['Kitchen', 'Bathroom', 'Bathroom Vanity', 'Refrigerator', 'Stove / Range']);
verifyScope('exterior', homeOSReviewExteriorCards, ['Front Yard', 'Backyard', 'Patio', 'Roof']);

const reviewSemanticVisuals = [
    ...['My Home', 'Interior', 'Exterior'].map((label) => resolveHomeOSSemanticVisual(label, 'area')),
    ...[...homeOSReviewInteriorCards, ...homeOSReviewExteriorCards].map((card) =>
        resolveHomeOSSemanticVisual(card.title, card.kind)
    ),
];

assert(
    reviewSemanticVisuals.every((visual) => Boolean(visual?.asset.source)),
    'Every recognized review card must use the central bundled semantic illustration resolver.',
);
assert(
    new Set(reviewSemanticVisuals.map((visual) => visual?.key)).size === reviewSemanticVisuals.length,
    'Every review concept must retain a distinct semantic visual identity.',
);

assert(
    homeOSReviewWorkflowCards.every((entry) => entry.description.startsWith('Data-free preview only')),
    'Every noninteractive workflow card must explicitly identify itself as preview-only.',
);
assert(
    new Set([...homeOSReviewInteriorCards, ...homeOSReviewExteriorCards].map((entry) => entry.accessibilityLabel)).size ===
        homeOSReviewInteriorCards.length + homeOSReviewExteriorCards.length,
    'Every clickable area and equipment card must have a unique accessibility label.',
);
assert(
    transitionHomeOSReview(HOME_OS_REVIEW_INITIAL_STATE, { type: 'open_section', scope: 'interior' }).level === 'landing',
    'Area decks must not be reachable before My Home opens.',
);

function verifyScope(scope: HomeOSReviewScope, cards: readonly { key: string; title: string }[], expectedTitles: string[]) {
    const chooser = transitionHomeOSReview(HOME_OS_REVIEW_INITIAL_STATE, { type: 'open_home' });
    const section = transitionHomeOSReview(chooser, { type: 'open_section', scope });
    assert(section.level === 'section' && section.scope === scope, `${scope} must open from the My Home chooser.`);
    assert(
        cardsForHomeOSReviewScope(scope).map((entry) => entry.title).join('|') === expectedTitles.join('|'),
        `${scope} must expose the complete approved review deck.`,
    );

    cards.forEach((card) => {
        const detail = transitionHomeOSReview(section, { type: 'open_detail', scope, cardKey: card.key });
        assert(detail.level === 'detail', `${card.title} must open a detail state.`);
        assert(selectedHomeOSReviewCard(detail)?.key === card.key, `${card.title} detail must preserve card identity.`);
        assert(homeOSReviewBackLabel(detail) === `Back to ${scope === 'interior' ? 'Interior' : 'Exterior'}`, `${card.title} must have a section Back control.`);
        const returnedSection = transitionHomeOSReview(detail, { type: 'back' });
        assert(returnedSection.level === 'section' && returnedSection.scope === scope, `${card.title} Back must return to ${scope}.`);
    });

    const returnedChooser = transitionHomeOSReview(section, { type: 'back' });
    assert(returnedChooser.level === 'home', `Back from ${scope} must return to My Home.`);
    const returnedLanding: HomeOSReviewState = transitionHomeOSReview(returnedChooser, { type: 'back' });
    assert(returnedLanding.level === 'landing', `Back from the chooser after ${scope} must return to the landing.`);
}
