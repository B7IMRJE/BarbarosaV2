import { buildStarterPriceTierProposal, getCompanyPriceTierAmount, isCompanyPriceTierProposal } from './companyPriceTiers';

const proposal = buildStarterPriceTierProposal({ marketLow: 350, recommendedPrice: 525, marketHigh: 800 });

if (!isCompanyPriceTierProposal(proposal)) throw new Error('Starter tier proposal should validate.');
if (getCompanyPriceTierAmount(proposal, 'normal') !== 350) throw new Error('Normal tier should use the market-low proposal.');
if (getCompanyPriceTierAmount(proposal, 'mid') !== 525) throw new Error('Mid tier should use the recommended proposal.');
if (getCompanyPriceTierAmount(proposal, 'high') !== 800) throw new Error('High tier should use the market-high proposal.');
if (proposal.approved) throw new Error('Starter proposals must remain unapproved until management review.');

console.log('company price tier regression passed');
