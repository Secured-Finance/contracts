const BokkyPooBahsDateTimeContract = artifacts.require(
  'BokkyPooBahsDateTimeContract',
);

const { emitted, reverted, equal } = require('../test-utils').assert;
const { should } = require('chai');
const {
  ONE_MINUTE,
  ONE_DAY,
  ONE_YEAR,
  NOTICE_GAP,
  SETTLE_GAP,
  advanceTimeAndBlock,
  getLatestTimestamp,
} = require('../test-utils').time;
const moment = require('moment');

should();

const expectRevert = reverted;

contract('BokkyPooBahsDateTimeContract', async (accounts) => {
  const [owner, alice, bob, carol] = accounts;

  let timeLibrary;

  before('deploy Mock contract', async () => {
    timeLibrary = await BokkyPooBahsDateTimeContract.new();
  });

  describe('Test functions library functions', async () => {
    it('Test basic read time functions', async () => {
      let now = await getLatestTimestamp();
      let date = moment();

      let time = await timeLibrary._now();
      time.toString().should.be.equal(now.toString());

      let dateTime = await timeLibrary.timestampToDate(now);
      dateTime.year.toString().should.be.equal(date.utc().year().toString());
      dateTime.month.toString().should.be.equal(date.utc().month().toString());
      dateTime.day.toString().should.be.equal(date.utc().date().toString());

      let days = await timeLibrary.getDaysInMonth(now);
      days.toString().should.be.equal(date.daysInMonth().toString());

      days = await timeLibrary._getDaysInMonth('2016', '12');
      days
        .toString()
        .should.be.equal(date.daysInMonth('2016-12', 'YYYY-MM').toString());

      let day = await timeLibrary.getDayOfWeek(now);
      day.toString().should.be.equal(date.utc().days().toString());

      let year = await timeLibrary.getYear(now);
      year.toString().should.be.equal(date.utc().year().toString());

      let month = await timeLibrary.getMonth(now);
      month.toString().should.be.equal(date.utc().month().toString());

      day = await timeLibrary.getDay(now);
      day.toString().should.be.equal(date.utc().date().toString());

      let hour = await timeLibrary.getHour(now);
      hour.toString().should.be.equal(date.utc().hour().toString());

      let minute = await timeLibrary.getMinute(now);
      minute.toString().should.be.equal(date.utc().minute().toString());
    });

    it('Test basic time addition functions', async () => {
      let now = await getLatestTimestamp();
      let date = moment();

      let time = await timeLibrary._now();
      time.toString().should.be.equal(now.toString());

      let addedYears = await timeLibrary.addYears(time, 1);
      let year = await timeLibrary.getYear(addedYears);
      year.toString().should.be.equal(date.utc().add(1, 'y').year().toString());

      let addedMonths = await timeLibrary.addMonths(time, 2);
      let months = await timeLibrary.getMonth(addedMonths);
      months
        .toString()
        .should.be.equal(date.utc().add(2, 'M').month().toString());

      let addedDays = await timeLibrary.addDays(time, 15);
      let days = await timeLibrary.getDay(addedDays);
      days
        .toString()
        .should.be.equal(date.utc().add(15, 'd').date().toString());

      let addedHours = await timeLibrary.addHours(time, 6);
      let hours = await timeLibrary.getHour(addedHours);
      hours
        .toString()
        .should.be.equal(date.utc().add(6, 'h').hour().toString());

      let addedMinutes = await timeLibrary.addMinutes(time, 37);
      let minutes = await timeLibrary.getMinute(addedMinutes);
      minutes
        .toString()
        .should.be.equal(date.utc().add(37, 'm').minute().toString());
    });

    it('Test basic time substraction functions', async () => {
      let now = await getLatestTimestamp();
      let date = moment();

      let time = await timeLibrary._now();
      time.toString().should.be.equal(now.toString());

      let subYears = await timeLibrary.subYears(time, 1);
      let year = await timeLibrary.getYear(subYears);
      year
        .toString()
        .should.be.equal(date.utc().subtract(1, 'y').year().toString());

      let subMonths = await timeLibrary.subMonths(time, 2);
      let months = await timeLibrary.getMonth(subMonths);
      months
        .toString()
        .should.be.equal(date.utc().subtract(2, 'M').month().toString());

      let subDays = await timeLibrary.subDays(time, 15);
      let days = await timeLibrary.getDay(subDays);
      days
        .toString()
        .should.be.equal(date.utc().subtract(15, 'd').date().toString());

      let subHours = await timeLibrary.subHours(time, 6);
      let hours = await timeLibrary.getHour(subHours);
      hours
        .toString()
        .should.be.equal(date.utc().subtract(6, 'h').hour().toString());

      let subMinutes = await timeLibrary.subMinutes(time, 37);
      let minutes = await timeLibrary.getMinute(subMinutes);
      minutes
        .toString()
        .should.be.equal(date.utc().subtract(37, 'm').minute().toString());
    });

    it('Test basic time difference functions', async () => {
      let now = await getLatestTimestamp();
      let date = moment();
      let dateNow = moment();

      let time = await timeLibrary._now();
      time.toString().should.be.equal(now.toString());

      let shiftedTime = date.add(1, 'y');
      let diffYears = await timeLibrary.diffYears(
        dateNow.format('X'),
        shiftedTime.format('X'),
      );
      diffYears
        .toString()
        .should.be.equal(shiftedTime.diff(dateNow, 'years').toString());

      shiftedTime = date.add(2, 'M');
      let diffMonths = await timeLibrary.diffMonths(
        dateNow.format('X'),
        shiftedTime.format('X'),
      );
      diffMonths
        .toString()
        .should.be.equal(shiftedTime.diff(dateNow, 'months').toString());

      shiftedTime = date.add(20, 'd');
      let diffDays = await timeLibrary.diffDays(
        dateNow.format('X'),
        shiftedTime.format('X'),
      );
      diffDays
        .toString()
        .should.be.equal(shiftedTime.diff(dateNow, 'days').toString());

      shiftedTime = date.add(3, 'h');
      let diffHours = await timeLibrary.diffHours(
        dateNow.format('X'),
        shiftedTime.format('X'),
      );
      diffHours
        .toString()
        .should.be.equal(shiftedTime.diff(dateNow, 'hours', true).toString());

      shiftedTime = date.add(37, 'm');
      let diffMinutes = await timeLibrary.diffMinutes(
        dateNow.format('X'),
        shiftedTime.format('X'),
      );
      diffMinutes
        .toString()
        .should.be.equal(shiftedTime.diff(dateNow, 'minutes').toString());
    });
  });
});
