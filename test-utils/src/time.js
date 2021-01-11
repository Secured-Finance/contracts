/*
 * Use code from https://medium.com/edgefund/time-travelling-truffle-tests-f581c1964687
 */
const SEC = 1;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const SETTLE_GAP = 2 * DAY;
const NOTICE_GAP = 14 * DAY;
const YEAR = 365 * DAY;

const helper = require("ganache-time-traveler");

const getLatestTimestamp = async () => {
  return (await web3.eth.getBlock("latest")).timestamp;
};

const getTimestampPlusDays = async (days) => {
  return (await getLatestTimestamp()) + SECONDS_IN_DAY * days;
};

module.exports = {
  SEC,
  MIN,
  HOUR,
  DAY,
  SETTLE_GAP,
  NOTICE_GAP,
  YEAR,
  advanceTime: helper.advanceTime,
  advanceBlock: helper.advanceBlock,
  advanceBlockAndSetTime: helper.advanceBlockAndSetTime,
  advanceTimeAndBlock: helper.advanceTimeAndBlock,
  takeSnapshot: helper.takeSnapshot,
  revertToSnapshot: helper.revertToSnapshot,
  getLatestTimestamp,
  getTimestampPlusDays,
};
