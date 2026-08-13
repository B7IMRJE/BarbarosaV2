import {
    PROFESSIONAL_CONTACT_FIELDS,
    buildProfessionalVCard,
    cleanSharedFields,
} from './staffProfessionalContactFormatting.ts';

function assert(condition: unknown, message: string) {
    if (!condition) throw new Error(message);
}

assert(cleanSharedFields([...PROFESSIONAL_CONTACT_FIELDS, 'private_phone']).length === PROFESSIONAL_CONTACT_FIELDS.length, 'Private fields must not be shareable.');

const vCard = buildProfessionalVCard({
    displayName: 'Alex Rivera',
    companyName: 'Example Plumbing',
    contact: {
        professional_title: 'Service Technician',
        professional_phone: '555-0100',
        professional_email: 'alex@example.com',
        shared_fields: ['professional_title', 'professional_phone'],
    },
});

assert(vCard.includes('TITLE:Service Technician'), 'Professional title should be included when shared.');
assert(vCard.includes('TEL;TYPE=WORK,VOICE:555-0100'), 'Professional phone should be included when shared.');
assert(!vCard.includes('alex@example.com'), 'Unshared professional email should be excluded.');
assert(!vCard.toLowerCase().includes('private'), 'Private data should never be encoded.');

console.log('staff professional contact regression checks passed');
