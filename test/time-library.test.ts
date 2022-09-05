import { expect } from 'chai';
import { artifacts, ethers } from 'hardhat';
import moment from 'moment';

const BokkyPooBahsDateTimeContract = artifacts.require(
  'BokkyPooBahsDateTimeContract',
);

describe('BokkyPooBahsDateTimeContract', async () => {
  let timeLibrary: any;
  let now: number;
  let date: moment.Moment;
  let time: any;

  before('deploy Mock contract', async () => {
    timeLibrary = await BokkyPooBahsDateTimeContract.new();
  });

  beforeEach(async () => {
    ({ timestamp: now } = await ethers.provider.getBlock('latest'));
    date = moment(now * 1000);
    time = await timeLibrary._now();
  });

  describe('Test functions library functions', async () => {
    describe('Test basic read time functions', async () => {
      it('timestampToDate', async () => {
        expect(time.toString()).to.equal(now.toString());

        let dateTime = await timeLibrary.timestampToDate(now);
        expect(dateTime.year.toString()).to.equal(date.utc().year().toString());
        expect(dateTime.month.toString()).to.equal(
          (date.utc().month() + 1).toString(),
        );
        expect(dateTime.day.toString()).to.equal(date.utc().date().toString());
      });

      it('getDaysInMonth', async () => {
        let days = await timeLibrary.getDaysInMonth(now);
        expect(days.toString()).to.equal(date.daysInMonth().toString());

        days = await timeLibrary._getDaysInMonth('2016', '12');
        expect(days.toString()).to.equal(
          moment('2016-12', 'YYYY-MM').daysInMonth().toString(),
        );
      });

      it('getDayOfWeek', async () => {
        let day = await timeLibrary.getDayOfWeek(now);
        // moment and timeLibrary have different day of week numbers
        // moment: 0->6 (SUN->SAT)
        // timeLibrary: 1->7 (MON->SUN)
        expect(day.toString()).to.equal((date.utc().days() || 7).toString());
      });

      it('getYear', async () => {
        let year = await timeLibrary.getYear(now);
        expect(year.toString()).to.equal(date.utc().year().toString());
      });

      it('getMonth', async () => {
        let month = await timeLibrary.getMonth(now);
        expect(month.toString()).to.equal((date.utc().month() + 1).toString());
      });

      it('getDay', async () => {
        let day = await timeLibrary.getDay(now);
        expect(day.toString()).to.equal(date.utc().date().toString());
      });

      it('getHour', async () => {
        let hour = await timeLibrary.getHour(now);
        expect(hour.toString()).to.equal(date.utc().hour().toString());
      });

      it('getMinute', async () => {
        let minute = await timeLibrary.getMinute(now);
        expect(minute.toString()).to.equal(date.utc().minute().toString());
      });
    });

    describe('Test basic time addition functions', async () => {
      it('addedYears', async () => {
        let addedYears = await timeLibrary.addYears(time, 1);
        let year = await timeLibrary.getYear(addedYears);
        expect(year.toString()).to.equal(
          date.utc().add(1, 'y').year().toString(),
        );
      });

      it('addMonths', async () => {
        let addedMonths = await timeLibrary.addMonths(time, 2);
        let months = await timeLibrary.getMonth(addedMonths);
        expect(months.toString()).to.equal(
          (date.utc().add(2, 'M').month() + 1).toString(),
        );
      });

      it('addDays', async () => {
        let addedDays = await timeLibrary.addDays(time, 15);
        let days = await timeLibrary.getDay(addedDays);
        expect(days.toString()).to.equal(
          date.utc().add(15, 'd').date().toString(),
        );
      });

      it('addHours', async () => {
        let addedHours = await timeLibrary.addHours(time, 6);
        let hours = await timeLibrary.getHour(addedHours);
        expect(hours.toString()).to.equal(
          date.utc().add(6, 'h').hour().toString(),
        );
      });

      it('addMinutes', async () => {
        let addedMinutes = await timeLibrary.addMinutes(time, 37);
        let minutes = await timeLibrary.getMinute(addedMinutes);
        expect(minutes.toString()).to.equal(
          date.utc().add(37, 'm').minute().toString(),
        );
      });
    });

    describe('Test basic time subtraction functions', async () => {
      it('subYears', async () => {
        let subYears = await timeLibrary.subYears(time, 1);
        let year = await timeLibrary.getYear(subYears);
        expect(year.toString()).to.equal(
          date.utc().subtract(1, 'y').year().toString(),
        );
      });

      it('subMonths', async () => {
        let subMonths = await timeLibrary.subMonths(time, 2);
        let months = await timeLibrary.getMonth(subMonths);
        expect(months.toString()).to.equal(
          (date.utc().subtract(2, 'M').month() + 1).toString(),
        );
      });

      it('subDays', async () => {
        let subDays = await timeLibrary.subDays(time, 15);
        let days = await timeLibrary.getDay(subDays);
        expect(days.toString()).to.equal(
          date.utc().subtract(15, 'd').date().toString(),
        );
      });

      it('subHours', async () => {
        let subHours = await timeLibrary.subHours(time, 6);
        let hours = await timeLibrary.getHour(subHours);
        expect(hours.toString()).to.equal(
          date.utc().subtract(6, 'h').hour().toString(),
        );
      });

      it('subMinutes', async () => {
        let subMinutes = await timeLibrary.subMinutes(time, 37);
        let minutes = await timeLibrary.getMinute(subMinutes);
        expect(minutes.toString()).to.equal(
          date.utc().subtract(37, 'm').minute().toString(),
        );
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
        expect(diffYears.toString()).to.equal(
          shiftedTime.diff(dateNow, 'years').toString(),
        );
      });

      it('diffMonths', async () => {
        let shiftedTime = date.add(2, 'M');
        let diffMonths = await timeLibrary.diffMonths(
          dateNow.format('X'),
          shiftedTime.format('X'),
        );
        expect(diffMonths.toString()).to.equal(
          shiftedTime.diff(dateNow, 'months').toString(),
        );
      });

      it('diffDays', async () => {
        let shiftedTime = date.add(20, 'd');
        let diffDays = await timeLibrary.diffDays(
          dateNow.format('X'),
          shiftedTime.format('X'),
        );
        expect(diffDays.toString()).to.equal(
          shiftedTime.diff(dateNow, 'days').toString(),
        );
      });

      it('diffHours', async () => {
        let shiftedTime = date.add(3, 'h');
        let diffHours = await timeLibrary.diffHours(
          dateNow.format('X'),
          shiftedTime.format('X'),
        );
        expect(diffHours.toString()).to.equal(
          shiftedTime.diff(dateNow, 'hours', true).toString(),
        );
      });

      it('diffMinutes', async () => {
        let shiftedTime = date.add(37, 'm');
        let diffMinutes = await timeLibrary.diffMinutes(
          dateNow.format('X'),
          shiftedTime.format('X'),
        );
        expect(diffMinutes.toString()).to.equal(
          shiftedTime.diff(dateNow, 'minutes').toString(),
        );
      });
    });
  });
});
