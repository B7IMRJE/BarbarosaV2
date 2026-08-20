import { homeOSStarterPresentationRole } from './homeosStarterPresentation';

runHomeOSStarterCatalogRegressions();

export function runHomeOSStarterCatalogRegressions() {
    assert(homeOSStarterPresentationRole('container') === 'container', 'Container metadata must survive Deck parsing.');
    assert(homeOSStarterPresentationRole('component') === 'component', 'Component metadata must survive Deck parsing.');
    assert(homeOSStarterPresentationRole('fixture') === undefined, 'Unknown presentation roles must fail closed instead of becoming containers.');
    assert(homeOSStarterPresentationRole(null) === undefined, 'Pre-migration Deck responses must remain compatible.');
    console.log('HomeOS starter catalog metadata regression checks passed.');
}

function assert(condition: unknown, message: string): asserts condition {
    if (!condition) throw new Error(message);
}
