import moment from 'moment';

const getBasisDate = (input?: moment.MomentInput): number => {
  const now = moment(input);
  const month = now.month() + 1;
  const year = now.year();
  const newDate = moment(`${year}-${month}-01 00:00:00`, 'YYYY-MM-DD hh:mm:ss');
  newDate.subtract(month % 3, 'M');

  return newDate.unix();
};

export { getBasisDate };
