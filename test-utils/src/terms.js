const termDays = [90,180,1825,365,1095,730];
const termsNumPayments = [1,1,5,1,3,2];
const termsDfFracs = [2500, 5000, 10000, 10000, 10000, 10000];
const termsSchedules = [
    ['90'],
    ['180'],
    ['365', '730', '1095', '1460', '1825'],
    ['365'],
    ['365', '730', '1095'],
    ['365', '730']
];

const sortedTermDays = [90,180,365,730,1095,1825];
const sortedTermsNumPayments = [1,1,1,2,3,5];
const sortedTermsDfFracs = [2500, 5000, 10000, 10000, 10000, 10000];
const sortedTermsSchedules = [
    ['90'],
    ['180'],
    ['365'],
    ['365', '730'],
    ['365', '730', '1095'],
    ['365', '730', '1095', '1460', '1825']
];


module.exports = {
    termDays,
    termsNumPayments,
    termsDfFracs,
    termsSchedules,
    sortedTermDays,
    sortedTermsNumPayments,
    sortedTermsDfFracs,
    sortedTermsSchedules,
}
