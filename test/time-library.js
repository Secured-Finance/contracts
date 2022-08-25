const BokkyPooBahsDateTimeContract = artifacts.require(
  'BokkyPooBahsDateTimeContract',
);

const { should } = require('chai');
const moment = require('moment');

should();

contract('BokkyPooBahsDateTimeContract', async (accounts) => {
  let timeLibrary;
  let now;
  let date;
  let time;

  before('deploy Mock contract', async () => {
    timeLibrary = await BokkyPooBahsDateTimeContract.new();
  });

  beforeEach(async () => {
    ({ timestamp: now } = await ethers.provider.getBlock());
    date = moment(now * 1000);
    time = await timeLibrary._now();
  });

  describe('Test functions library functions', async () => {
    describe('Test basic read time functions', async () => {
      it('timestampToDate', async () => {
        time.toString().should.be.equal(now.toString());

        let dateTime = await timeLibrary.timestampToDate(now);
        dateTime.year.toString().should.be.equal(date.utc().year().toString());
        dateTime.month
          .toString()
          .should.be.equal((date.utc().month() + 1).toString());
        dateTime.day.toString().should.be.equal(date.utc().date().toString());
      });

      it('getDaysInMonth', async () => {
        let days = await timeLibrary.getDaysInMonth(now);
        days.toString().should.be.equal(date.daysInMonth().toString());

        days = await timeLibrary._getDaysInMonth('2016', '12');
        days
          .toString()
          .should.be.equal(
            moment('2016-12', 'YYYY-MM').daysInMonth().toString(),
          );
      });

      it('getDayOfWeek', async () => {
        let day = await timeLibrary.getDayOfWeek(now);
        // moment and timeLibrary have different day of week numbers
        // moment: 0->6 (SUN->SAT)
        // timeLibrary: 1->7 (MON->SUN)
        day.toString().should.be.equal((date.utc().days() || 7).toString());
      });

      it('getYear', async () => {
        let year = await timeLibrary.getYear(now);
        year.toString().should.be.equal(date.utc().year().toString());
      });

      it('getMonth', async () => {
        let month = await timeLibrary.getMonth(now);
        month.toString().should.be.equal((date.utc().month() + 1).toString());
      });

      it('getDay', async () => {
        let day = await timeLibrary.getDay(now);
        day.toString().should.be.equal(date.utc().date().toString());
      });

      it('getHour', async () => {
        let hour = await timeLibrary.getHour(now);
        hour.toString().should.be.equal(date.utc().hour().toString());
      });

      it('getMinute', async () => {
        let minute = await timeLibrary.getMinute(now);
        minute.toString().should.be.equal(date.utc().minute().toString());
      });
    });

    describe('Test basic time addition functions', async () => {
      it('addedYears', async () => {
        let addedYears = await timeLibrary.addYears(time, 1);
        let year = await timeLibrary.getYear(addedYears);
        year
          .toString()
          .should.be.equal(date.utc().add(1, 'y').year().toString());
      });

      it('addMonths', async () => {
        let addedMonths = await timeLibrary.addMonths(time, 2);
        let months = await timeLibrary.getMonth(addedMonths);
        months
          .toString()
          .should.be.equal((date.utc().add(2, 'M').month() + 1).toString());
      });

      it('addDays', async () => {
        let addedDays = await timeLibrary.addDays(time, 15);
        let days = await timeLibrary.getDay(addedDays);
        days
          .toString()
          .should.be.equal(date.utc().add(15, 'd').date().toString());
      });

      it('addHours', async () => {
        let addedHours = await timeLibrary.addHours(time, 6);
        let hours = await timeLibrary.getHour(addedHours);
        hours
          .toString()
          .should.be.equal(date.utc().add(6, 'h').hour().toString());
      });

      it('addMinutes', async () => {
        let addedMinutes = await timeLibrary.addMinutes(time, 37);
        let minutes = await timeLibrary.getMinute(addedMinutes);
        minutes
          .toString()
          .should.be.equal(date.utc().add(37, 'm').minute().toString());
      });
    });

    describe('Test basic time subtraction functions', async () => {
      it('subYears', async () => {
        let subYears = await timeLibrary.subYears(time, 1);
        let year = await timeLibrary.getYear(subYears);
        year
          .toString()
          .should.be.equal(date.utc().subtract(1, 'y').year().toString());
      });

      it('subMonths', async () => {
        let subMonths = await timeLibrary.subMonths(time, 2);
        let months = await timeLibrary.getMonth(subMonths);
        months
          .toString()
          .should.be.equal(
            (date.utc().subtract(2, 'M').month() + 1).toString(),
          );
      });

      it('subDays', async () => {
        let subDays = await timeLibrary.subDays(time, 15);
        let days = await timeLibrary.getDay(subDays);
        days
          .toString()
          .should.be.equal(date.utc().subtract(15, 'd').date().toString());
      });

      it('subHours', async () => {
        let subHours = await timeLibrary.subHours(time, 6);
        let hours = await timeLibrary.getHour(subHours);
        hours
          .toString()
          .should.be.equal(date.utc().subtract(6, 'h').hour().toString());
      });

      it('subMinutes', async () => {
        let subMinutes = await timeLibrary.subMinutes(time, 37);
        let minutes = await timeLibrary.getMinute(subMinutes);
        minutes
          .toString()
          .should.be.equal(date.utc().subtract(37, 'm').minute().toString());
      });
    });

    describe('Test basic time difference functions', async () => {
      let dateNow;

      beforeEach('deploy Mock contract', async () => {
        dateNow = date;
      });

      it('diffYears', async () => {
        let shiftedTime = date.add(1, 'y');
        let diffYears = await timeLibrary.diffYears(
          dateNow.format('X'),
          shiftedTime.format('X'),
        );
        diffYears
          .toString()
          .should.be.equal(shiftedTime.diff(dateNow, 'years').toString());
      });

      it('diffMonths', async () => {
        let shiftedTime = date.add(2, 'M');
        let diffMonths = await timeLibrary.diffMonths(
          dateNow.format('X'),
          shiftedTime.format('X'),
        );
        diffMonths
          .toString()
          .should.be.equal(shiftedTime.diff(dateNow, 'months').toString());
      });

      it('diffDays', async () => {
        let shiftedTime = date.add(20, 'd');
        let diffDays = await timeLibrary.diffDays(
          dateNow.format('X'),
          shiftedTime.format('X'),
        );
        diffDays
          .toString()
          .should.be.equal(shiftedTime.diff(dateNow, 'days').toString());
      });

      it('diffHours', async () => {
        let shiftedTime = date.add(3, 'h');
        let diffHours = await timeLibrary.diffHours(
          dateNow.format('X'),
          shiftedTime.format('X'),
        );
        diffHours
          .toString()
          .should.be.equal(shiftedTime.diff(dateNow, 'hours', true).toString());
      });

      it('diffMinutes', async () => {
        let shiftedTime = date.add(37, 'm');
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
});
