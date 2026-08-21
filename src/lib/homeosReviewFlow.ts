export type HomeOSReviewScope = 'interior' | 'exterior';

export type HomeOSReviewCard = {
    key: string;
    title: string;
    kind: 'area' | 'equipment';
    detail?: string;
    accessibilityLabel: string;
};

export type HomeOSReviewState =
    | { level: 'landing' }
    | { level: 'home' }
    | { level: 'section'; scope: HomeOSReviewScope }
    | { level: 'detail'; scope: HomeOSReviewScope; cardKey: string };

export type HomeOSReviewAction =
    | { type: 'open_home' }
    | { type: 'open_section'; scope: HomeOSReviewScope }
    | { type: 'open_detail'; scope: HomeOSReviewScope; cardKey: string }
    | { type: 'back' };

export const homeOSReviewInteriorCards: readonly HomeOSReviewCard[] = [
    card('kitchen', 'Kitchen', 'area'),
    card('bathroom', 'Bathroom', 'area'),
    card('bathroom-vanity', 'Bathroom Vanity', 'equipment', 'Fixture'),
    card('refrigerator', 'Refrigerator', 'equipment', 'Kitchen equipment'),
    card('stove-range', 'Stove / Range', 'equipment', 'Kitchen equipment'),
] as const;

export const homeOSReviewExteriorCards: readonly HomeOSReviewCard[] = [
    card('front-yard', 'Front Yard', 'area'),
    card('backyard', 'Backyard', 'area'),
    card('patio', 'Patio', 'area'),
    card('roof', 'Roof', 'area'),
] as const;

export const homeOSReviewWorkflowCards = [
    {
        key: 'emergency',
        title: 'Emergency Center',
        description: 'Data-free preview only — live emergency updates require a signed-in property.',
        fallbackIcon: '🚨',
    },
    {
        key: 'requests',
        title: 'Service Requests',
        description: 'Data-free preview only — regular requests, leads, and jobs require sign-in.',
        fallbackIcon: '📝',
    },
    {
        key: 'maintenance',
        title: 'Maintenance Center',
        description: 'Data-free preview only — maintenance history and reminders require sign-in.',
        fallbackIcon: '🧰',
    },
    {
        key: 'connections',
        title: 'Company Connections',
        description: 'Data-free preview only — connected-company access requires sign-in.',
        fallbackIcon: '🔗',
    },
] as const;

export const HOME_OS_REVIEW_INITIAL_STATE: HomeOSReviewState = { level: 'landing' };

export function transitionHomeOSReview(
    state: HomeOSReviewState,
    action: HomeOSReviewAction,
): HomeOSReviewState {
    if (action.type === 'back') {
        if (state.level === 'detail') return { level: 'section', scope: state.scope };
        if (state.level === 'section') return { level: 'home' };
        if (state.level === 'home') return HOME_OS_REVIEW_INITIAL_STATE;
        return state;
    }

    if (action.type === 'open_home') {
        return state.level === 'landing' ? { level: 'home' } : state;
    }

    if (action.type === 'open_section') {
        return state.level === 'home' ? { level: 'section', scope: action.scope } : state;
    }

    if (action.type === 'open_detail' && state.level === 'section' && state.scope === action.scope) {
        return cardsForHomeOSReviewScope(action.scope).some((entry) => entry.key === action.cardKey)
            ? { level: 'detail', scope: action.scope, cardKey: action.cardKey }
            : state;
    }

    return state;
}

export function cardsForHomeOSReviewScope(scope: HomeOSReviewScope) {
    return scope === 'interior' ? homeOSReviewInteriorCards : homeOSReviewExteriorCards;
}

export function selectedHomeOSReviewCard(state: HomeOSReviewState) {
    if (state.level !== 'detail') return null;
    return cardsForHomeOSReviewScope(state.scope).find((entry) => entry.key === state.cardKey) || null;
}

export function homeOSReviewBackLabel(state: HomeOSReviewState) {
    if (state.level === 'detail') return `Back to ${state.scope === 'interior' ? 'Interior' : 'Exterior'}`;
    if (state.level === 'section') return 'Back to My Home';
    if (state.level === 'home') return 'Back to Property';
    return '';
}

function card(key: string, title: string, kind: HomeOSReviewCard['kind'], detail?: string): HomeOSReviewCard {
    return {
        key,
        title,
        kind,
        detail,
        accessibilityLabel: `Open ${title} review detail`,
    };
}
