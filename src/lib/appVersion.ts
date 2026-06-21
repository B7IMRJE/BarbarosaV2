import { GENERATED_BUILD_DATE, GENERATED_GIT_SHA } from '../generated/buildInfo';

const BUILD_LABEL = 'Build';

export const BUILD_DATE = GENERATED_BUILD_DATE;
export const BUILD_GIT_SHA = GENERATED_GIT_SHA;
export const BUILD_DISPLAY = `${BUILD_LABEL} ${BUILD_DATE} \u00b7 ${BUILD_GIT_SHA}`;
