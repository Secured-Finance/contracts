import moment from 'moment';

const getAdjustedGenesisDate = (): number =>
  Number(process.env.INITIAL_MARKET_OPENING_DATE) ||
  (Number(process.env.MARKET_BASE_PERIOD) === 0
    ? moment().unix()
    : getGenesisDate());

// Returns 1st of Mar, Jun, Sep, or Dec.
const getGenesisDate = (input?: moment.MomentInput): number => {
  const now = moment(input);
  const year = now.year();
  const month = now.month() + 1;
  const newDate = moment(`${year}-${month}-01`, 'YYYY-MM-DD').subtract(
    month % 3,
    'M',
  );

  let lastFriday = getLastFriday(newDate);

  if (lastFriday.isAfter(now)) {
    lastFriday = getLastFriday(newDate.subtract(3, 'M'));
  }

  return lastFriday.unix();
};

const getLastFriday = (input: moment.Moment): moment.Moment => {
  let lastFriday = moment(input.endOf('month').format('YYYY-MM-DD'));

  // Check if last day of month is a Friday
  if (lastFriday.day() !== 5) {
    // Subtract the days until the last Friday of the month is reached
    const daysUntilFriday = (lastFriday.day() - 5 + 7) % 7;
    lastFriday = lastFriday.subtract(daysUntilFriday, 'days');
  }

  return lastFriday;
};

export { getAdjustedGenesisDate, getGenesisDate };
