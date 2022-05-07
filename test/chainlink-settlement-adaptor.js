const { BigNumber } = require('ethers');
const { toBytes32 } = require('../test-utils').strings;
const { should } = require('chai');
const {
  expectEvent,
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');
should();

const ChainlinkSettlementAdaptor = artifacts.require(
  'ChainlinkSettlementAdaptor',
);
const Operator = artifacts.require('Operator');
const LinkToken = artifacts.require('LinkToken');

contract('ChainlinkSettlementAdaptor', (accounts) => {
  const [owner, alice, bob, carol] = accounts;
  const jobId = toBytes32('test');
  const requestFee = BigNumber.from('100000000000000000');

  let linkToken;
  let chainlinkSettlementAdaptor;
  let operator;

  before('deploy ChainlinkSettlementAdaptor', async () => {
    linkToken = await LinkToken.new();
    operator = await Operator.new(linkToken.address, owner);

    chainlinkSettlementAdaptor = await ChainlinkSettlementAdaptor.new(
      operator.address,
      jobId,
      requestFee,
      linkToken.address,
    );
  });

  describe('getChainlinkToken function', async () => {
    it('Successfully get a Chainlink Token Contract address', async () => {
      let chainlinkToken = await chainlinkSettlementAdaptor.getChainlinkToken();

      chainlinkToken.toString().should.be.equal(linkToken.address);
    });
  });

  describe('getChainlinkOracle function', async () => {
    it('Successfully get a Chainlink Oracle Contract address', async () => {
      let chainlinkToken =
        await chainlinkSettlementAdaptor.getChainlinkOracle();

      chainlinkToken.toString().should.be.equal(operator.address);
    });
  });

  describe('updateChainlinkOracle function', async () => {
    it('Successfully update a Chainlink Oracle Contract address', async () => {
      const inputAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
      await chainlinkSettlementAdaptor.updateChainlinkOracle(inputAddress);
      let chainlinkToken =
        await chainlinkSettlementAdaptor.getChainlinkOracle();

      chainlinkToken.toString().should.be.equal(inputAddress);
    });
  });

  describe('updateJobId function', async () => {
    it('Successfully update a job id', async () => {
      const inputId =
        '0x3330646662663535383662323433623661396662376539653866353764363538';
      await chainlinkSettlementAdaptor.updateJobId(inputId);
      let jobId = await chainlinkSettlementAdaptor.jobId();

      jobId.toString().should.be.equal(jobId);
    });
  });

  describe('updateRequestFee function', async () => {
    it('Successfully update a request fee', async () => {
      const inputFee = BigNumber.from('200000000000000000');
      await chainlinkSettlementAdaptor.updateRequestFee(inputFee);
      let requestFee = await chainlinkSettlementAdaptor.requestFee();

      requestFee.toString().should.be.equal(inputFee.toString());
    });
  });

  describe('withdrawLink function', async () => {
    it('Successfully withdraw LinkToken', async () => {
      const amount = BigNumber.from('100000000000000000000');

      await linkToken.transfer(chainlinkSettlementAdaptor.address, amount);
      const balanceBefore = await linkToken.balanceOf(
        chainlinkSettlementAdaptor.address,
      );
      balanceBefore.toString().should.be.equal(amount.toString());

      await chainlinkSettlementAdaptor.withdrawLink();
      const balanceAfter = await linkToken.balanceOf(
        chainlinkSettlementAdaptor.address,
      );
      balanceAfter.toString().should.be.equal('0');
    });
  });

  describe('fulfill function', async () => {
    before('prepare for calling `createRequest`', async () => {
      await chainlinkSettlementAdaptor.updateChainlinkOracle(alice);
      await linkToken.transfer(
        chainlinkSettlementAdaptor.address,
        BigNumber.from('100000000000000000000'),
      );
    });

    it('Successfully fulfill a request', async () => {
      const inputTxHash = toBytes32('fulfillTxHash');
      const tx1 = await chainlinkSettlementAdaptor.createRequest(inputTxHash);

      assert.ok(Array.isArray(tx1.logs));
      assert.equal(tx1.logs.length, 1);

      const requestId = tx1.logs[0].args.id;
      const tx2 = await chainlinkSettlementAdaptor.fulfill(
        requestId,
        'from',
        'to',
        100000,
        123456,
        { from: alice },
      );

      expectEvent(tx2, 'ChainlinkFulfilled', {
        id: requestId,
      });
    });

    it('Fail to fulfill a request with invalid caller', async () => {
      const inputTxHash = toBytes32('fulfillTxHash');
      const tx1 = await chainlinkSettlementAdaptor.createRequest(inputTxHash);

      assert.ok(Array.isArray(tx1.logs));
      assert.equal(tx1.logs.length, 1);

      const requestId = tx1.logs[0].args.id;
      const fuifill = () =>
        chainlinkSettlementAdaptor.fulfill(
          requestId,
          'from',
          'to',
          100000,
          123456,
          { from: bob },
        );

      await expectRevert(fuifill(), 'Source must be the oracle of the request');
    });
  });

  describe('cancelRequest function', async () => {
    before('prepare for calling `createRequest`', async () => {
      await chainlinkSettlementAdaptor.updateChainlinkOracle(operator.address);
      await linkToken.transfer(
        chainlinkSettlementAdaptor.address,
        BigNumber.from('100000000000000000000'),
      );
    });

    it('Successfully cancel a request', async () => {
      const inputTxHash = toBytes32('cancelTxHash');
      const tx1 = await chainlinkSettlementAdaptor.createRequest(inputTxHash);
      const oracleRequestEvent = (
        await operator.getPastEvents('OracleRequest', {
          fromBlock: tx1.receipt.blockNumber,
          toBlock: tx1.receipt.blockNumber,
        })
      )[0];

      assert.ok(oracleRequestEvent, 'OracleRequest event not emitted');

      await time.increase(time.duration.minutes(5));

      const { requestId, callbackFunctionId, cancelExpiration } =
        oracleRequestEvent.args;

      const tx2 = await chainlinkSettlementAdaptor.cancelRequest(
        requestId,
        callbackFunctionId,
        cancelExpiration,
      );

      expectEvent(tx2, 'ChainlinkCancelled', {
        id: requestId,
      });
    });

    it('Fail to cancel a request due to expiration', async () => {
      const inputTxHash = toBytes32('cancelTxHash');
      const tx1 = await chainlinkSettlementAdaptor.createRequest(inputTxHash);
      const oracleRequestEvent = (
        await operator.getPastEvents('OracleRequest', {
          fromBlock: tx1.receipt.blockNumber,
          toBlock: tx1.receipt.blockNumber,
        })
      )[0];

      assert.ok(oracleRequestEvent, 'OracleRequest event not emitted');

      const { requestId, callbackFunctionId, cancelExpiration } =
        oracleRequestEvent.args;

      const cancelRequest = () =>
        chainlinkSettlementAdaptor.cancelRequest(
          requestId,
          callbackFunctionId,
          cancelExpiration,
        );

      expectRevert(cancelRequest, 'Request is not expired');
    });
  });
});
