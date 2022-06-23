const { BigNumber } = require('ethers');
const { toBytes32, hexFILString, testTxHash, secondTxHash } =
  require('../test-utils').strings;

const { should } = require('chai');
const {
  expectEvent,
  expectRevert,
  time,
} = require('@openzeppelin/test-helpers');

should();

const AddressResolver = artifacts.require('AddressResolver');
const ChainlinkSettlementAdapter = artifacts.require(
  'ChainlinkSettlementAdapter',
);
const ProxyController = artifacts.require('ProxyController');
const Operator = artifacts.require('Operator');
const LinkToken = artifacts.require('LinkToken');

contract('ChainlinkSettlementAdapter', (accounts) => {
  const [owner, alice, bob, carol] = accounts;
  const jobId = toBytes32('test');
  const requestFee = BigNumber.from('100000000000000000');

  let linkToken;
  let chainlinkSettlementAdapter;
  let externalAdapterCaller;
  let operator;

  before('deploy ChainlinkSettlementAdapter', async () => {
    linkToken = await LinkToken.new();
    operator = await Operator.new(linkToken.address, owner);

    externalAdapterCaller = await ethers
      .getContractFactory('ExternalAdapterCallerMock')
      .then((factory) => factory.deploy());
    const addressResolver = await AddressResolver.new();

    const proxyController = await ProxyController.new(
      ethers.constants.AddressZero,
    );
    await proxyController.setAddressResolverImpl(addressResolver.address);
    const addressResolverProxyAddress =
      await proxyController.getAddressResolverAddress();

    const addressResolverProxy = await AddressResolver.at(
      addressResolverProxyAddress,
    );

    await addressResolverProxy.importAddresses(
      [toBytes32('SettlementEngine')],
      [externalAdapterCaller.address],
    );

    chainlinkSettlementAdapter = await ChainlinkSettlementAdapter.new(
      addressResolverProxyAddress,
      operator.address,
      jobId,
      requestFee,
      linkToken.address,
      hexFILString,
    );
    externalAdapterCaller.setExternalAdapter(
      chainlinkSettlementAdapter.address,
    );
  });

  describe('getChainlinkToken function', async () => {
    it('Successfully get a Chainlink Token Contract address', async () => {
      let chainlinkToken = await chainlinkSettlementAdapter.getChainlinkToken();

      chainlinkToken.toString().should.be.equal(linkToken.address);
    });
  });

  describe('getChainlinkOracle function', async () => {
    it('Successfully get a Chainlink Oracle Contract address', async () => {
      let chainlinkToken =
        await chainlinkSettlementAdapter.getChainlinkOracle();

      chainlinkToken.toString().should.be.equal(operator.address);
    });
  });

  describe('updateChainlinkOracle function', async () => {
    it('Successfully update a Chainlink Oracle Contract address', async () => {
      const inputAddress = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
      await chainlinkSettlementAdapter.updateChainlinkOracle(inputAddress);
      let chainlinkToken =
        await chainlinkSettlementAdapter.getChainlinkOracle();

      chainlinkToken.toString().should.be.equal(inputAddress);
    });
  });

  describe('updateJobId function', async () => {
    it('Successfully update a job id', async () => {
      const inputId =
        '0x3330646662663535383662323433623661396662376539653866353764363538';
      await chainlinkSettlementAdapter.updateJobId(inputId);
      let jobId = await chainlinkSettlementAdapter.jobId();

      jobId.toString().should.be.equal(jobId);
    });
  });

  describe('updateRequestFee function', async () => {
    it('Successfully update a request fee', async () => {
      const inputFee = BigNumber.from('200000000000000000');
      await chainlinkSettlementAdapter.updateRequestFee(inputFee);
      let requestFee = await chainlinkSettlementAdapter.requestFee();

      requestFee.toString().should.be.equal(inputFee.toString());
    });
  });

  describe('withdrawLink function', async () => {
    it('Successfully withdraw LinkToken', async () => {
      const amount = BigNumber.from('100000000000000000000');

      await linkToken.transfer(chainlinkSettlementAdapter.address, amount);
      const balanceBefore = await linkToken.balanceOf(
        chainlinkSettlementAdapter.address,
      );
      balanceBefore.toString().should.be.equal(amount.toString());

      await chainlinkSettlementAdapter.withdrawLink();
      const balanceAfter = await linkToken.balanceOf(
        chainlinkSettlementAdapter.address,
      );
      balanceAfter.toString().should.be.equal('0');
    });
  });

  describe('fulfill function', async () => {
    before('prepare for calling `createRequest`', async () => {
      await chainlinkSettlementAdapter.updateChainlinkOracle(alice);
      await linkToken.transfer(
        chainlinkSettlementAdapter.address,
        BigNumber.from('100000000000000000000'),
      );
    });

    it('Successfully fulfill a request', async () => {
      const inputTxHash = toBytes32('fulfillTxHash');
      const tx1 = await (
        await externalAdapterCaller.createRequest(testTxHash)
      ).wait();
      assert.ok(Array.isArray(tx1.logs));
      assert.equal(tx1.logs.length, 3);

      const requestId = tx1.logs[0].topics[1];
      const tx2 = await chainlinkSettlementAdapter.fulfill(
        requestId,
        'from',
        'to',
        100000,
        123456,
        inputTxHash,
        { from: alice },
      );

      expectEvent(tx2, 'ChainlinkFulfilled', {
        id: requestId,
      });
    });

    it('Fail to fulfill a request with invalid caller', async () => {
      const inputTxHash = toBytes32('fulfillTxHash');
      const tx1 = await (
        await externalAdapterCaller.createRequest(secondTxHash)
      ).wait();

      assert.ok(Array.isArray(tx1.logs));
      assert.equal(tx1.logs.length, 3);

      const requestId = tx1.logs[0].topics[1];
      const fulfill = () =>
        chainlinkSettlementAdapter.fulfill(
          requestId,
          'from',
          'to',
          100000,
          123456,
          inputTxHash,
          { from: bob },
        );

      expectRevert(fulfill(), 'Source must be the oracle of the request');
    });
  });

  describe('cancelRequest function', async () => {
    before('prepare for calling `createRequest`', async () => {
      await chainlinkSettlementAdapter.updateChainlinkOracle(operator.address);
      await linkToken.transfer(
        chainlinkSettlementAdapter.address,
        BigNumber.from('100000000000000000000'),
      );
    });

    it('Successfully cancel a request', async () => {
      const inputTxHash = toBytes32('cancelTxHash');
      const tx1 = await (
        await externalAdapterCaller.createRequest(inputTxHash)
      ).wait();
      const oracleRequestEvent = (
        await operator.getPastEvents('OracleRequest', {
          fromBlock: tx1.blockNumber,
          toBlock: tx1.blockNumber,
        })
      )[0];

      assert.ok(oracleRequestEvent, 'OracleRequest event not emitted');

      await time.increase(time.duration.minutes(5));

      const { requestId, callbackFunctionId, cancelExpiration } =
        oracleRequestEvent.args;

      const tx2 = await (
        await externalAdapterCaller.cancelRequest(
          inputTxHash,
          requestId,
          callbackFunctionId,
          cancelExpiration.toString(),
        )
      ).wait();

      const event = (
        await chainlinkSettlementAdapter.getPastEvents('ChainlinkCancelled', {
          fromBlock: tx2.blockNumber,
          toBlock: tx2.blockNumber,
        })
      )[0];

      assert.equal(event.event, 'ChainlinkCancelled');
      assert.equal(event.args.id, requestId);
    });

    it('Fail to cancel a request due to expiration', async () => {
      const inputTxHash = toBytes32('secondCancelTxHash');
      const tx1 = await (
        await externalAdapterCaller.createRequest(inputTxHash)
      ).wait();
      const oracleRequestEvent = (
        await operator.getPastEvents('OracleRequest', {
          fromBlock: tx1.blockNumber,
          toBlock: tx1.blockNumber,
        })
      )[0];

      assert.ok(oracleRequestEvent, 'OracleRequest event not emitted');

      const { requestId, callbackFunctionId, cancelExpiration } =
        oracleRequestEvent.args;

      const cancelRequest = () =>
        chainlinkSettlementAdapter.cancelRequest(
          inputTxHash,
          requestId,
          callbackFunctionId,
          cancelExpiration,
        );

      expectRevert(cancelRequest, 'Request is not expired');
    });
  });
});
